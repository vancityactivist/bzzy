import type { Metadata } from "next";
import { Suspense } from "react";

import { CalendarIcon, KeyIcon, UsersIcon } from "@/components/icons";
import { AddPasskey } from "@/components/passkey-buttons";
import { SignIn } from "@/components/sign-in";
import { Badge, Card, CardHeader, Container, PageHeader, StatusDot } from "@/components/ui";
import { calendarsForUser, refreshStaleCalendars } from "@/lib/calendar";
import { blocksForDevice } from "@/lib/ics";
import { nowSeconds } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";
import { teamsForUser } from "@/lib/teams";

import { absoluteTime, relativeTime } from "../devices/relative-time";
import { AddCalendarForm, CalendarActions } from "./calendar-forms";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Container size="narrow">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <SettingsContent />
      </Suspense>
    </Container>
  );
}

async function SettingsContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  await refreshStaleCalendars(user.id);
  const [teams, calendars] = await Promise.all([teamsForUser(user.id), calendarsForUser(user.id)]);
  const now = nowSeconds();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <CalendarIcon className="size-5 text-muted" />
              Calendars
            </span>
          }
          description="Your lights turn Busy during meetings and Away when you're out of office."
        />
        <div className="mt-4 rounded-xl bg-subtle p-4 text-sm text-muted">
          <p className="font-medium text-foreground">Where to find your ICS link in Outlook</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>Settings → Calendar → Shared calendars</li>
            <li>Publish a calendar</li>
            <li>Copy the ICS link and paste it below</li>
          </ol>
        </div>

        {calendars.length > 0 && (
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {calendars.map((c) => {
              const upcoming = blocksForDevice(c.events, now, c.showTitles).slice(0, 4);
              return (
                <li key={c.id} className="space-y-4 p-4">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted">
                      <span className="break-all">{new URL(c.icsUrl).hostname}</span> ·{" "}
                      <span title={c.lastFetchedAt ? absoluteTime(c.lastFetchedAt) : undefined}>
                        {c.lastFetchedAt ? `checked ${relativeTime(c.lastFetchedAt)}` : "not checked yet"}
                      </span>
                    </p>
                    {c.lastError && <p className="mt-1 text-sm text-danger">{c.lastError}</p>}
                  </div>
                  <div className="text-sm">
                    <p className="text-xs font-medium tracking-wide text-muted uppercase">Next 24 hours</p>
                    {upcoming.length === 0 ? (
                      <p className="mt-1 text-muted">Nothing that makes you busy.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {upcoming.map((b) => (
                          <li key={`${b.start}-${b.status}`} className="flex items-center gap-2">
                            <StatusDot status={b.status} />
                            <span className="shrink-0 tabular-nums text-muted">
                              {range(b.start, b.end)}
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

        <div className="mt-5">
          <AddCalendarForm first={calendars.length === 0} />
        </div>
        <p className="mt-3 text-xs text-muted">
          The link is kept private: it&apos;s only used to read your calendar and is never shown again.
        </p>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <KeyIcon className="size-5 text-muted" />
              Passkeys
            </span>
          }
          description="Sign in with your fingerprint, face or device PIN instead of GitHub."
        />
        <div className="mt-4">
          <AddPasskey />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <UsersIcon className="size-5 text-muted" />
              Teams
            </span>
          }
        />
        <ul className="mt-3 divide-y divide-line text-sm">
          {teams.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="min-w-0 truncate font-medium">{t.name}</span>
              <Badge>{t.personal ? "personal" : t.role}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">Shared teams for an office come later.</p>
      </Card>
    </div>
  );
}

const TZ = "America/Vancouver";

const fmt = (sec: number, weekday: boolean) =>
  new Date(sec * 1000).toLocaleString("en-US", {
    timeZone: TZ,
    weekday: weekday ? "short" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });

// "Wed 2:00 PM – 3:00 PM"; the end's weekday only when it falls on another day.
function range(start: number, end: number) {
  const day = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-US", { timeZone: TZ });
  return `${fmt(start, true)} – ${fmt(end, day(start) !== day(end))}`;
}
