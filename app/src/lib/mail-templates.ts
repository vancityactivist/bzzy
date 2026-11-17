// Email bodies. Pure, so they're unit-tested; lib/mail.ts sends them. Each one has a
// plain-text part (what many people actually read) and a small inline-styled HTML
// part, since mail clients ignore stylesheets.

export type Mail = { subject: string; text: string; html: string };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Names are typed by people; keep them to one tidy line so they can't reshape the email.
function oneLine(s: string, max = 80): string {
  const t = s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function layout(title: string, paragraphs: string[], button: { label: string; url: string }, footer: string): string {
  const p = (html: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#18181b">${html}</p>`;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<tr><td>
<p style="margin:0 0 24px;font-size:20px;font-weight:700;letter-spacing:-0.04em;color:#000">bzzy</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#000">${title}</h1>
${paragraphs.map(p).join("\n")}
<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${escapeHtml(button.label)}</a></p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#71717a">Or paste this link into your browser:<br><a href="${escapeHtml(button.url)}" style="color:#71717a;word-break:break-all">${escapeHtml(button.url)}</a></p>
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#71717a">${footer}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

export function inviteEmail(input: { teamName: string; inviterName: string; role: "member" | "admin"; url: string; expiresAt: Date }): Mail {
  const team = oneLine(input.teamName);
  const who = oneLine(input.inviterName || "Someone");
  const as = input.role === "admin" ? "an admin" : "a member";
  const ends = input.expiresAt.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const subject = `${who} invited you to ${team} on bzzy`;
  const intro = `${who} invited you to join ${team} on bzzy as ${as}. bzzy is a little status light for your desk that tells people when you're busy.`;
  const how = "You can sign up with a passkey, no password needed.";
  const footer = `This link is just for you and works until ${ends} (UTC). If you weren't expecting it, you can ignore this email.`;
  return {
    subject,
    text: `${intro}\n\n${how}\n\nJoin the team: ${input.url}\n\n${footer}\n`,
    html: layout(`Join ${escapeHtml(team)}`, [escapeHtml(intro), escapeHtml(how)], { label: "Join the team", url: input.url }, escapeHtml(footer)),
  };
}

// To the person who just joined.
export function welcomeEmail(input: { teamName: string; name: string | null; role: "member" | "admin"; url: string }): Mail {
  const team = oneLine(input.teamName);
  const hi = input.name ? `Hi ${oneLine(input.name, 40)},` : "Hi,";
  const as = input.role === "admin" ? "an admin" : "a member";
  const lines = [
    `You're in: you joined ${team} on bzzy as ${as}.`,
    "Next, pair your light (or add your calendar) so your team can see when you're busy. You can sign in any time with your passkey.",
  ];
  const footer = "You're getting this because you joined a team on bzzy.";
  return {
    subject: `Welcome to ${team} on bzzy`,
    text: `${hi}\n\n${lines.join("\n\n")}\n\nOpen bzzy: ${input.url}\n\n${footer}\n`,
    html: layout(`Welcome to ${escapeHtml(team)}`, [escapeHtml(hi), ...lines.map(escapeHtml)], { label: "Open bzzy", url: input.url }, escapeHtml(footer)),
  };
}

// To the team's owner and admins.
export function memberJoinedEmail(input: { teamName: string; who: string; role: "member" | "admin"; members: number; url: string }): Mail {
  const team = oneLine(input.teamName);
  const who = oneLine(input.who || "Someone");
  const as = input.role === "admin" ? "an admin" : "a member";
  const line = `${who} joined ${team} as ${as}. The team has ${input.members} ${input.members === 1 ? "person" : "people"} now.`;
  const footer = "You're getting this because you're an owner or admin of this team.";
  return {
    subject: `${who} joined ${team}`,
    text: `${line}\n\nSee the team: ${input.url}\n\n${footer}\n`,
    html: layout(`${escapeHtml(who)} joined ${escapeHtml(team)}`, [escapeHtml(line)], { label: "See the team", url: input.url }, escapeHtml(footer)),
  };
}

// A message from the contact form on the landing page, to hello@. Reply-To is the sender.
export function contactEmail(input: { name: string; email: string; message: string }): Mail {
  const name = oneLine(input.name, 80) || "Someone";
  const intro = `${name} <${input.email}> wrote through the contact form on bzzy.ca. Reply to this email to answer them.`;
  return {
    subject: `bzzy contact form: ${name}`,
    text: `${intro}\n\n---\n\n${input.message}\n`,
    html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#18181b">
<p style="color:#71717a">${escapeHtml(intro)}</p>
<div style="white-space:pre-wrap;border-left:3px solid #a08672;padding-left:12px">${escapeHtml(input.message)}</div>
</body></html>`,
  };
}
