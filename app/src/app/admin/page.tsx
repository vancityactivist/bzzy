import type { Metadata } from "next";
import { Suspense } from "react";

import { Badge, Card, CardHeader, Container, PageHeader } from "@/components/ui";
import { adminOverview, requireAdmin } from "@/lib/admin";
import { countSince, signupsByDay } from "@/lib/admin-stats";

import { absoluteTime, relativeTime, shortDate } from "../devices/relative-time";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const TZ = "America/Vancouver";

export default function AdminPage() {
  return (
    <Container>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <AdminContent />
      </Suspense>
    </Container>
  );
}

/** "2026-10-13" to "Oct 13". The input is already a calendar day, so format it in UTC. */
function dayLabel(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

/** Last active / last seen: "Online" as a free badge, otherwise a relative time. */
function Presence({ at, never, now }: { at: Date | null; never: string; now: Date }) {
  if (!at) return <span className="text-muted">{never}</span>;
  if (now.getTime() - at.getTime() < 2 * 60_000)
    return (
      <Badge tone="free" title={absoluteTime(at)}>
        Online
      </Badge>
    );
  return (
    <span className="text-muted" title={absoluteTime(at)}>
      {relativeTime(at, now.getTime())}
    </span>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <Card padding="sm" className="flex flex-col">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-auto pt-1 text-xs text-muted">{note ?? " "}</p>
    </Card>
  );
}

const TH = "px-3 py-2.5 text-xs font-medium tracking-wide whitespace-nowrap text-muted uppercase first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6";
const TD = "px-3 py-3 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6";

async function AdminContent() {
  await requireAdmin();
  const { users, devices, sharedTeams } = await adminOverview();
  const now = new Date();
  const created = users.map((u) => u.createdAt);
  const days = signupsByDay(created, now, 30, TZ);
  const peak = Math.max(1, ...days.map((d) => d.count));
  const total30 = days.reduce((n, d) => n + d.count, 0);
  const online = devices.filter((d) => d.lastSeenAt && now.getTime() - d.lastSeenAt.getTime() < 10 * 60_000).length;
  const activeWeek = users.filter((u) => u.lastActiveAt && countSince([u.lastActiveAt], now, 7)).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Admin" description="Everyone who has signed up, and their devices. Times are Vancouver time." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Users" value={users.length} />
        <Stat label="New this week" value={countSince(created, now, 7)} note={`${countSince(created, now, 30)} in 30 days`} />
        <Stat label="Active this week" value={activeWeek} note="signed in and used the app" />
        <Stat label="Devices" value={devices.length} note={`${online} online now · ${sharedTeams} shared teams`} />
      </section>

      <Card>
        <CardHeader title="Signups, last 30 days" description={`${total30} new ${total30 === 1 ? "user" : "users"}`} />
        <div className="relative mt-5">
          <div className="flex h-32 items-end gap-[3px] border-b border-line" role="img" aria-label={`Signups per day for the last 30 days, ${total30} in total`}>
            {days.map((d) => (
              <div
                key={d.day}
                title={`${dayLabel(d.day)}: ${d.count}`}
                className={`flex-1 rounded-t-sm ${d.count ? "bg-foreground" : "bg-line"}`}
                style={{ height: d.count ? `${(d.count / peak) * 100}%` : "2px" }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>{dayLabel(days[0].day)}</span>
            <span>{dayLabel(days[Math.floor(days.length / 2)].day)}</span>
            <span>Today</span>
          </div>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <CardHeader title="Users" description={`${users.length} in total`} className="p-5 pb-3 sm:p-6 sm:pb-3" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-y border-line bg-subtle/60">
                <th className={TH}>Person</th>
                <th className={TH}>Role</th>
                <th className={TH}>Signs in with</th>
                <th className={TH}>Devices</th>
                <th className={TH}>Signed up</th>
                <th className={TH}>Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-muted uppercase"
                      >
                        {(u.name ?? u.email ?? "?").trim().charAt(0) || "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium">{u.name ?? "—"}</p>
                        <p className="text-muted">{u.email ?? "no email"}</p>
                      </div>
                    </div>
                  </td>
                  <td className={TD}>{u.role === "admin" ? <Badge tone="inverse">Admin</Badge> : <Badge>User</Badge>}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {u.providers.filter((p) => p !== "passkey").join(", ") || "—"}
                    {u.passkeys > 0 && <span className="text-muted">{` + ${u.passkeys} passkey${u.passkeys > 1 ? "s" : ""}`}</span>}
                  </td>
                  <td className={`${TD} tabular-nums`}>{u.devices}</td>
                  <td className={`${TD} whitespace-nowrap`} title={absoluteTime(u.createdAt)}>
                    {shortDate(u.createdAt)}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <span title="Accurate to about a day">
                      <Presence at={u.lastActiveAt} never="Signed out" now={now} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <CardHeader title="Devices" description={`${devices.length} in total, ${online} online now`} className="p-5 pb-3 sm:p-6 sm:pb-3" />
        {devices.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted sm:px-6 sm:pb-6">No devices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-y border-line bg-subtle/60">
                  <th className={TH}>Device</th>
                  <th className={TH}>ID</th>
                  <th className={TH}>Owner</th>
                  <th className={TH}>Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td className={`${TD} font-medium`}>{d.name}</td>
                    <td className={TD}>
                      <code className="font-mono text-xs text-muted">{d.id}</code>
                    </td>
                    <td className={`${TD} text-muted`}>{d.ownerName ?? "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <Presence at={d.lastSeenAt} never="Never" now={now} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
