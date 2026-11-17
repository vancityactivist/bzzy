import "server-only";

import { mailConfigured, sendMail } from "./mail";
import { memberJoinedEmail, welcomeEmail } from "./mail-templates";
import { teamAccess, teamMembers } from "./teams";

// After someone joins through an invite: a welcome to them and a heads-up to the
// owner and admins. Runs in after(), so failures are only logged.
export async function sendJoinEmails(teamId: string, userId: string, role: "member" | "admin", origin: string) {
  if (!mailConfigured()) return;
  const [t, members] = await Promise.all([teamAccess(userId, teamId), teamMembers(teamId)]);
  if (!t) return;
  const joiner = members.find((m) => m.userId === userId);
  if (!joiner) return;
  const teamUrl = `${origin}/teams/${teamId}`;
  const sends: Promise<unknown>[] = [];
  if (joiner.email) {
    sends.push(
      sendMail(joiner.email, welcomeEmail({ teamName: t.team.name, name: joiner.name, role, url: origin }), {
        idempotencyKey: `welcome-${teamId}-${userId}`,
      }),
    );
  }
  const note = memberJoinedEmail({ teamName: t.team.name, who: joiner.name ?? joiner.email ?? "Someone", role, members: members.length, url: teamUrl });
  for (const m of members) {
    if (m.userId === userId || m.role === "member" || !m.email) continue;
    sends.push(sendMail(m.email, note, { replyTo: joiner.email, idempotencyKey: `joined-${teamId}-${userId}-${m.userId}` }));
  }
  await Promise.allSettled(sends);
}
