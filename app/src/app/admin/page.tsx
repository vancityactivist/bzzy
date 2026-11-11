import type { Metadata } from "next";
import { Suspense } from "react";

import { adminOverview, requireAdmin } from "@/lib/admin";
import { countSince, signupsByDay } from "@/lib/admin-stats";

export const metadata: Metadata = { title: "Admin · bzzy", robots: { index: false } };

const TZ = "America/Vancouver";

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <AdminContent />
    </Suspense>
  );
}

function when(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleString("en-CA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
}

function ago(d: Date | null) {
  if (!d) return "Never";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return "Online";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

async function AdminContent() {
  await requireAdmin();
  const { users, devices, sharedTeams } = await adminOverview();
  const now = new Date();
  const created = users.map((u) => u.createdAt);
  const days = signupsByDay(created, now, 30, TZ);
  const peak = Math.max(1, ...days.map((d) => d.count));
  const online = devices.filter((d) => d.lastSeenAt && now.getTime() - d.lastSeenAt.getTime() < 10 * 60_000).length;
  const activeWeek = users.filter((u) => u.lastActiveAt && countSince([u.lastActiveAt], now, 7)).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-muted">Everyone who has signed up, and their devices. Times are Vancouver time.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Users" value={users.length} />
        <Stat label="New this week" value={countSince(created, now, 7)} note={`${countSince(created, now, 30)} in 30 days`} />
        <Stat label="Active this week" value={activeWeek} note="signed in and used the app" />
        <Stat label="Devices" value={devices.length} note={`${online} online now · ${sharedTeams} shared teams`} />
      </section>

      <section className="rounded-xl border border-line bg-card p-6">
        <h2 className="font-semibold">Signups, last 30 days</h2>
        <div className="mt-4 flex h-28 items-end gap-[3px]" role="img" aria-label="Signups per day for the last 30 days">
          {days.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${d.count}`}
              className={`flex-1 rounded-t-sm ${d.count ? "bg-free" : "bg-line"}`}
              style={{ height: d.count ? `${(d.count / peak) * 100}%` : "2px" }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>{days[0].day}</span>
          <span>today</span>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card">
        <h2 className="p-6 pb-2 font-semibold">Users</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="px-6 py-2 font-normal">Person</th>
                <th className="px-3 py-2 font-normal">Signs in with</th>
                <th className="px-3 py-2 font-normal">Devices</th>
                <th className="px-3 py-2 font-normal">Signed up</th>
                <th className="px-6 py-2 font-normal">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-6 py-3">
                    <p className="font-medium">
                      {u.name ?? "—"}
                      {u.role === "admin" && (
                        <span className="ml-2 rounded bg-foreground px-1.5 py-0.5 text-xs text-background">admin</span>
                      )}
                    </p>
                    <p className="text-muted">{u.email ?? "no email"}</p>
                  </td>
                  <td className="px-3 py-3">
                    {u.providers.filter((p) => p !== "passkey").join(", ") || "—"}
                    {u.passkeys > 0 && ` + ${u.passkeys} passkey${u.passkeys > 1 ? "s" : ""}`}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{u.devices}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{when(u.createdAt)}</td>
                  <td className="px-6 py-3 whitespace-nowrap" title="Accurate to about a day">
                    {u.lastActiveAt ? ago(u.lastActiveAt) : "Signed out"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card">
        <h2 className="p-6 pb-2 font-semibold">Devices</h2>
        {devices.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted">No devices yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap gap-x-3 px-6 py-3">
                <span className="font-medium">{d.name}</span>
                <code className="font-mono text-muted">{d.id}</code>
                <span className="text-muted">{d.ownerName ?? "—"}</span>
                <span className="ml-auto text-muted">{ago(d.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
