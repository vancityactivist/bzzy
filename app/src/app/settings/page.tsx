import { Suspense } from "react";

import { AddPasskey } from "@/components/passkey-buttons";
import { SignIn } from "@/components/sign-in";
import { STATUS_META } from "@/components/status-meta";
import { calendarsForUser, refreshStaleCalendars } from "@/lib/calendar";
import { blocksForDevice } from "@/lib/ics";
import { nowSeconds } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";
import { teamsForUser } from "@/lib/teams";

import { AddCalendarForm, CalendarActions } from "./calendar-forms";

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  await refreshStaleCalendars(user.id);
  const [teams, calendars] = await Promise.all([teamsForUser(user.id), calendarsForUser(user.id)]);
  const now = nowSeconds();

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="rounded-xl border border-line bg-card p-6">
        <h2 className="font-semibold">Calendars</h2>
        <p className="mt-1 text-sm text-muted">
          Your lights turn Busy during meetings and Away when you&apos;re out of office. Paste a calendar&apos;s ICS
          link: in Outlook, Settings → Calendar → Shared calendars → Publish a calendar, then copy the ICS link.
        </p>

        {calendars.length > 0 && (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
            {calendars.map((c) => {
              const upcoming = blocksForDevice(c.events, now, c.showTitles).slice(0, 4);
              return (
                <li key={c.id} className="space-y-3 p-4">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted">
                      {new URL(c.icsUrl).hostname} ·{" "}
                      {c.lastFetchedAt ? `checked ${ago(c.lastFetchedAt)}` : "not checked yet"}
                    </p>
                    {c.lastError && <p className="mt-1 text-sm text-busy">{c.lastError}</p>}
                  </div>
                  <div className="text-sm">
                    <p className="text-muted">Next 24 hours</p>
                    {upcoming.length === 0 ? (
                      <p>Nothing that makes you busy.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {upcoming.map((b) => (
                          <li key={`${b.start}-${b.status}`} className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_META[b.status].bg}`} />
                            <span className="tabular-nums text-muted">
                              {time(b.start)}–{time(b.end)}
                            </span>
                            <span className="truncate">{b.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <CalendarActions id={c.id} showTitles={c.showTitles} />
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4">
          <AddCalendarForm first={calendars.length === 0} />
        </div>
        <p className="mt-2 text-xs text-muted">
          The link is kept private: it&apos;s only used to read your calendar and is never shown again.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-card p-6">
        <h2 className="font-semibold">Passkeys</h2>
        <p className="mt-1 text-sm text-muted">Sign in with your fingerprint, face or device PIN instead of GitHub.</p>
        <div className="mt-4">
          <AddPasskey />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card p-6">
        <h2 className="font-semibold">Teams</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {teams.map((t) => (
            <li key={t.id}>
              {t.name} <span className="text-muted">· {t.personal ? "personal" : t.role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">Shared teams for an office come later.</p>
      </section>
    </div>
  );
}

const TZ = "America/Vancouver";

function time(sec: number) {
  return new Date(sec * 1000).toLocaleString("en-CA", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" });
}

function ago(d: Date) {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return d.toLocaleString("en-CA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
}
