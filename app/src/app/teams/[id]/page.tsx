import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CheckIcon, ShieldIcon } from "@/components/icons";
import { SignIn } from "@/components/sign-in";
import { Badge, Card, CardHeader, Container, PageHeader } from "@/components/ui";
import { teamDashboard } from "@/lib/dashboard";
import { nowSeconds } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";
import { can, canRemove } from "@/lib/team-rules";
import { teamAccess, teamAuditLog, teamInvites, teamMembers } from "@/lib/teams";

import { absoluteTime, relativeTime, shortDate } from "../../devices/relative-time";
import {
  DeleteTeamButton,
  InviteForm,
  LeaveTeamButton,
  MemberControls,
  RenameTeamForm,
  RevokeInviteButton,
} from "../team-forms";
import { AutoRefresh } from "./auto-refresh";
import { Dashboard } from "./dashboard";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage(props: PageProps<"/teams/[id]">) {
  return (
    <Container>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <TeamContent {...props} />
      </Suspense>
    </Container>
  );
}

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

const INVITE_STATE_LABEL = { live: "Live", expired: "Expired", revoked: "Revoked", used: "Used" } as const;

async function TeamContent({ params, searchParams }: PageProps<"/teams/[id]">) {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const { id } = await params;
  const { joined } = await searchParams;
  const found = await teamAccess(user.id, id);
  if (!found) notFound();
  const { team, access } = found;
  const manage = can(access, "manage");
  const owner = can(access, "owner");
  const [members, invites, log] = await Promise.all([
    teamMembers(team.id),
    manage ? teamInvites(team.id) : Promise.resolve([]),
    manage ? teamAuditLog(team.id) : Promise.resolve([]),
  ]);
  const now = new Date();
  // Admins (and the superadmin) see everyone's light; members don't.
  const cards = manage ? await teamDashboard(members, nowSeconds()) : null;
  const names = new Map(members.map((m) => [m.userId, m.name ?? m.email ?? "Someone"]));

  return (
    <div className="space-y-6">
      {cards && <AutoRefresh />}
      <PageHeader
        title={team.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {members.length} {members.length === 1 ? "person" : "people"}
            </span>
            {access.role ? (
              <Badge tone={access.role === "member" ? "neutral" : "inverse"}>You&apos;re {ROLE_LABEL[access.role].toLowerCase()}</Badge>
            ) : (
              <Badge tone="inverse">Viewing as superadmin</Badge>
            )}
          </span>
        }
        actions={
          <Link href="/teams" className="text-sm text-muted hover:text-foreground">
            All teams
          </Link>
        }
      />

      {joined && (
        <div role="status" className="flex items-start gap-2 rounded-xl bg-free/10 p-4 text-sm ring-1 ring-inset ring-free/30">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-free" />
          <span>
            You&apos;re in. Add your light on the{" "}
            <Link href="/devices" className="underline">
              Devices
            </Link>{" "}
            page, where you can also choose which team each light follows.
          </span>
        </div>
      )}

      {cards && <Dashboard cards={cards} nowMs={now.getTime()} />}

      <div className="max-w-3xl space-y-6">
        {!access.role && (
          <p className="flex items-start gap-2 rounded-xl bg-subtle p-4 text-sm">
            <ShieldIcon className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>You&apos;re not in this team. Anything you change here is recorded in its activity log as a superadmin action.</span>
          </p>
        )}

        <Card padding="none" className="overflow-hidden">
          <CardHeader title="People" className="p-5 pb-3 sm:p-6 sm:pb-3" />
          <ul className="divide-y divide-line border-t border-line">
            {members.map((m) => {
              const self = m.userId === user.id;
              const name = m.name ?? m.email ?? "Someone";
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 sm:px-6">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-muted uppercase"
                  >
                    {name.trim().charAt(0) || "?"}
                  </span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate font-medium">
                      {name}
                      {self && <span className="font-normal text-muted"> (you)</span>}
                    </p>
                    <p className="truncate text-sm text-muted" title={absoluteTime(m.joinedAt)}>
                      {ROLE_LABEL[m.role]} · joined {shortDate(m.joinedAt)}
                    </p>
                  </div>
                  {!self && (manage || owner) && (
                    <MemberControls
                      teamId={team.id}
                      memberId={m.userId}
                      name={name}
                      role={m.role}
                      canSetRoles={can(access, "setRoles")}
                      canRemove={canRemove(access, m.role, false)}
                      canTransfer={owner}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {manage && (
          <Card>
            <CardHeader
              title="Invite people"
              description="Anyone with a link can join, even without GitHub: they make an account with a passkey. Links are shown once."
            />
            <div className="mt-4">
              <InviteForm teamId={team.id} canInviteAdmins={can(access, "setRoles")} />
            </div>
            {invites.length > 0 && (
              <ul className="mt-5 divide-y divide-line border-t border-line">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-medium">
                        {inv.kind === "team" ? "Team link" : "One-person link"} · joins as {ROLE_LABEL[inv.role].toLowerCase()}
                      </p>
                      <p className="text-muted">
                        {inv.uses} {inv.uses === 1 ? "use" : "uses"} ·{" "}
                        {inv.state === "live" ? (
                          <span title={absoluteTime(inv.expiresAt)}>ends {shortDate(inv.expiresAt)}</span>
                        ) : (
                          INVITE_STATE_LABEL[inv.state].toLowerCase()
                        )}
                        {inv.createdByName && ` · made by ${inv.createdByName}`}
                      </p>
                    </div>
                    {inv.state === "live" ? (
                      <RevokeInviteButton teamId={team.id} inviteId={inv.id} />
                    ) : (
                      <Badge>{INVITE_STATE_LABEL[inv.state]}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {manage && log.length > 0 && (
          <Card>
            <CardHeader title="Activity" description="Who joined, left or changed things. Superadmin actions are marked." />
            <ul className="mt-4 space-y-2 text-sm">
              {log.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-muted tabular-nums" title={absoluteTime(e.at)}>
                    {relativeTime(e.at, now.getTime())}
                  </span>
                  <span>{describe(e, names)}</span>
                  {e.asSuperadmin && <Badge tone="inverse">superadmin</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {owner && (
          <Card>
            <CardHeader title="Team settings" />
            <div className="mt-4 space-y-5">
              <RenameTeamForm teamId={team.id} name={team.name} />
              <div className="border-t border-line pt-5">
                <DeleteTeamButton teamId={team.id} teamName={team.name} />
              </div>
            </div>
          </Card>
        )}

        {access.role === "member" && (
          <p className="text-sm text-muted">The team&apos;s admins can see what your light&apos;s screen shows, and where your status came from.</p>
        )}

        {access.role && access.role !== "owner" && <LeaveTeamButton teamId={team.id} userId={user.id} teamName={team.name} />}
      </div>
    </div>
  );
}

type LogEntry = Awaited<ReturnType<typeof teamAuditLog>>[number];

function describe(e: LogEntry, names: Map<string, string>): string {
  const who = e.actorName ?? "Someone";
  const d = e.detail as Record<string, string | number | undefined>;
  const them = (id: unknown) => (typeof id === "string" ? (names.get(id) ?? "a former member") : "someone");
  switch (e.action) {
    case "created":
      return `${who} made the team`;
    case "renamed":
      return `${who} renamed it to ${d.to}`;
    case "joined":
      return `${who} joined as ${d.role}`;
    case "left":
      return `${who} left`;
    case "removed":
      return `${who} removed ${them(d.userId)}`;
    case "role":
      return `${who} made ${them(d.userId)} ${d.to === "admin" ? "an admin" : "a member"}`;
    case "transferred":
      return `${who} made ${them(d.to)} the owner`;
    case "invite":
      return `${who} made a ${d.kind === "team" ? "team" : "one-person"} invite link (${d.role}, ${d.days} days)`;
    case "revoked":
      return `${who} revoked an invite link`;
    default:
      return `${who}: ${e.action}`;
  }
}
