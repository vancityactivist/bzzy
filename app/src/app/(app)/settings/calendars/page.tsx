import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CalendarIcon } from "@/components/icons";
import { SignIn } from "@/components/sign-in";
import { buttonClass, Card, CardHeader, Container, PageHeader, StatusDot } from "@/components/ui";
import {
  type CalendarRow,
  calendarsForUser,
  refreshStaleCalendars,
  personCalendars,
  scheduleSources,
  userClock,
} from "@/lib/calendar";
import { accountsForUser, refreshCalendarLists } from "@/lib/calendar-accounts";
import { calendarKeyConfigured } from "@/lib/calendar-secret";
import { devicesForUser } from "@/lib/devices";
import { googleConfigured } from "@/lib/google-calendar";
import { blocksForDevice, explainSchedule } from "@/lib/ics";
import { getLook } from "@/lib/look";
import { nowSeconds, type Status } from "@/lib/protocol";
import { allLabels } from "@/lib/status-labels";
import { getCurrentUser } from "@/lib/session";

import { absoluteTime, relativeTime } from "../../lights/relative-time";
import {
  AddCalendarForm,
  CalendarActions,
  CalendarDot,
  CalendarNotice,
  CalendarToggle,
  ConnectCalDavForm,
  CountsAsPicker,
  RemoveAccountButton,
  ShowsOn,
  SortableCalendars,
  UpdatePasswordForm,
} from "../calendar-forms";

export const metadata: Metadata = { title: "Calendars" };

export default function CalendarsPage() {
  return (
    <Container size="narrow">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <CalendarsContent />
      </Suspense>
    </Container>
  );
}

async function CalendarsContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  await Promise.all([refreshStaleCalendars(user.id), refreshCalendarLists(user.id)]);
  const [calendars, clock, accounts, devices, look] = await Promise.all([
    calendarsForUser(user.id),
    userClock(user.id),
    accountsForUser(user.id),
    devicesForUser(user.id),
    getLook(user.id),
  ]);
  const names = allLabels(look.statusLabels);
  const lights = devices
    .filter((d) => d.ownerUserId === user.id)
    .map((d) => ({ id: d.id, name: d.name, followsOwner: d.followsOwner }));
  const followers = lights.filter((l) => l.followsOwner).map((l) => l.id);
  const TZ = clock.timeZone;
  const now = nowSeconds();
  const googleOn = googleConfigured();
  const byId = new Map(calendars.map((c) => [c.id, c]));
  const active = calendars.filter((c) => c.setsStatus);
  // Yours: what the lights that follow you show (calendars picked only for lights with
  // their own status are left out).
  const timeline = explainSchedule(scheduleSources(personCalendars(calendars, followers)), now);
  const links = calendars.filter((c) => !c.accountId);
  const accountLabel = new Map(accounts.map((a) => [a.id, a.label]));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted hover:text-foreground">
          ← Settings
        </Link>
        <PageHeader
          className="mt-2"
          title="Calendars"
          description={`Your lights turn ${names.busy} during meetings and ${names.away} when you're out of office. Each calendar goes to every light that follows you, unless you pick lights under More.`}
        />
      </div>
      <CalendarNotice />

      {active.length > 0 && (
        <Card>
          <CardHeader
            title="Your next 24 hours"
            description="What the lights that follow you will show, and which calendar is behind each block."
          />
          {timeline.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nothing that makes you busy.</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {timeline.map((b) => {
                const cal = b.calendarId ? byId.get(b.calendarId) : undefined;
                return (
                  <li key={`${b.start}-${b.status}`} className="flex items-center gap-2">
                    <StatusDot status={b.status} />
                    <span className="shrink-0 tabular-nums text-muted">{range(b.start, b.end, TZ)}</span>
                    <span className="min-w-0 flex-1 truncate">{b.text || names[b.status]}</span>
                    {cal && (
                      <span className="flex shrink-0 items-center gap-1.5 text-muted">
                        <CalendarDot color={cal.color} />
                        <span className="max-w-32 truncate">{cal.name}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <CalendarIcon className="size-5 text-muted" />
              Setting your status
            </span>
          }
          description={`When events overlap, the strongest status wins: ${names.away}, then ${names.dnd}, then ${names.busy}. If they're equal, the calendar higher in this list decides whose title shows. Drag to reorder.`}
        />
        {active.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No calendar is setting your status yet. Turn one on below, or add one.
          </p>
        ) : (
          <SortableCalendars
            items={active.map((c) => ({
              id: c.id,
              name: c.name,
              node: (
                <ActiveRow
                  c={c}
                  account={c.accountId ? accountLabel.get(c.accountId) : undefined}
                  lights={lights}
                  now={now}
                  TZ={TZ}
                  names={names}
                />
              ),
            }))}
          />
        )}
      </Card>

      {(accounts.length > 0 || links.length > 0) && (
        <Card>
          <CardHeader title="Accounts" description="Choose which of each account's calendars set your status." />
          <div className="mt-4 space-y-3">
            {accounts.map((a) => {
              const own = calendars.filter((c) => c.accountId === a.id);
              const on = own.filter((c) => c.setsStatus).length;
              const broken = a.state !== "ok";
              return (
                <details key={a.id} open={broken} className="group rounded-xl border border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.label}</span>
                      <span className="block text-sm text-muted">
                        {providerName(a)}, {on} of {own.length} on
                        {broken && <span className="text-danger">, needs attention</span>}
                      </span>
                    </span>
                    <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
                      ▾
                    </span>
                  </summary>
                  <div className="space-y-4 border-t border-line p-4">
                    {broken && a.lastError && <p className="text-sm text-danger">{a.lastError}</p>}
                    {a.provider === "caldav" && broken && <UpdatePasswordForm accountId={a.id} />}
                    <div>
                      {own.map((c) => (
                        <CalendarToggle key={c.id} id={c.id} name={c.name} on={c.setsStatus} color={c.color} />
                      ))}
                    </div>
                    <span className="flex flex-wrap gap-2">
                      {googleOn && a.provider === "google" && (
                        <a
                          href={`/api/calendar/google/connect?hint=${encodeURIComponent(a.label)}`}
                          className={buttonClass(broken ? "primary" : "secondary", "sm")}
                        >
                          Reconnect
                        </a>
                      )}
                      <RemoveAccountButton id={a.id} label={a.label} />
                    </span>
                  </div>
                </details>
              );
            })}
            {links.length > 0 && (
              <details className="group rounded-xl border border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block font-medium">Calendar links</span>
                    <span className="block text-sm text-muted">
                      ICS, {links.filter((c) => c.setsStatus).length} of {links.length} on
                    </span>
                  </span>
                  <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="border-t border-line p-4">
                  {links.map((c) => (
                    <CalendarToggle key={c.id} id={c.id} name={c.name} on={c.setsStatus} color={c.color} />
                  ))}
                  <p className="mt-2 text-xs text-muted">Remove a link from its row above (More).</p>
                </div>
              </details>
            )}
          </div>
        </Card>
      )}

      <Card id="add">
        <CardHeader title="Add a calendar" />
        {googleOn && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a href="/api/calendar/google/connect" className={buttonClass("primary", "sm")}>
              Connect Google Calendar
            </a>
            <span className="text-sm text-muted">Read-only. Or add an ICS link below.</span>
          </div>
        )}
        {calendarKeyConfigured() && <ConnectCalDavForm />}
        <OutlookHelp />
        <div className="mt-4">
          <AddCalendarForm first={calendars.length === 0} />
        </div>
        <p className="mt-2 text-xs text-muted">
          The link is kept private: it&apos;s only used to read your calendar and is never shown again.
        </p>
      </Card>
    </div>
  );
}

function ActiveRow({
  c,
  account,
  lights,
  now,
  TZ,
  names,
}: {
  names: Record<Status, string>;
  c: CalendarRow;
  account?: string;
  lights: { id: string; name: string; followsOwner: boolean }[];
  now: number;
  TZ: string;
}) {
  const upcoming = blocksForDevice(c.events, now, c.showTitles).slice(0, 4);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CalendarDot color={c.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{c.name}</span>
          <span className="block truncate text-sm text-muted">
            {account ?? "Calendar link"}
            {c.lightIds && `, ${lightCount(c.lightIds, lights)}`}
            {c.lastError && <span className="text-danger">, {c.lastError}</span>}
          </span>
        </span>
        <CountsAsPicker id={c.id} name={c.name} countsAs={c.countsAs ?? "auto"} names={names} />
      </div>
      <details className="mt-1 pl-5.5">
        <summary className="cursor-pointer text-sm text-muted hover:text-foreground">More</summary>
        <div className="mt-3 space-y-4">
          <p className="text-sm text-muted">
            {c.icsUrl && <span className="break-all">{new URL(c.icsUrl).hostname}, </span>}
            <span title={c.lastFetchedAt ? absoluteTime(c.lastFetchedAt) : undefined}>
              {c.lastFetchedAt ? `checked ${relativeTime(c.lastFetchedAt)}` : "not checked yet"}
            </span>
          </p>
          <div className="text-sm">
            <p className="text-[13px] font-medium text-muted">This calendar, next 24 hours</p>
            {upcoming.length === 0 ? (
              <p className="mt-1 text-muted">Nothing that makes you busy.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {upcoming.map((b) => (
                  <li key={`${b.start}-${b.status}`} className="flex items-center gap-2">
                    <StatusDot status={b.status} />
                    <span className="shrink-0 tabular-nums text-muted">{range(b.start, b.end, TZ)}</span>
                    <span className="truncate">{b.text || names[b.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ShowsOn id={c.id} lightIds={c.lightIds ?? null} lights={lights} />
          <CalendarActions id={c.id} showTitles={c.showTitles} setsStatus={c.setsStatus} removable={!c.accountId} />
        </div>
      </details>
    </div>
  );
}

// "Only Office light", "only 2 lights", "no lights".
function lightCount(ids: string[], lights: { id: string; name: string }[]) {
  const mine = lights.filter((l) => ids.includes(l.id));
  if (mine.length === 0) return "no lights";
  if (mine.length === 1) return `only ${mine[0].name}`;
  return `only ${mine.length} lights`;
}

// "Google Calendar", "iCloud", "Fastmail", or the server's host name.
function providerName(a: { provider: string; serverUrl: string | null }) {
  if (a.provider === "google") return "Google Calendar";
  const host = a.serverUrl ? new URL(a.serverUrl).hostname : "";
  if (onDomain(host, "icloud.com")) return "iCloud";
  if (onDomain(host, "fastmail.com")) return "Fastmail";
  return host || "Calendar server";
}

// "icloud.com" or one of its subdomains, not "evilicloud.com".
function onDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

function OutlookHelp() {
  return (
    <div className="mt-4 rounded-xl bg-subtle p-4 text-sm text-muted">
      <p className="font-medium text-foreground">Where to find your ICS link in Outlook</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
        <li>Settings → Calendar → Shared calendars</li>
        <li>Publish a calendar</li>
        <li>Copy the ICS link and paste it below</li>
      </ol>
    </div>
  );
}

const fmt = (sec: number, weekday: boolean, TZ: string) =>
  new Date(sec * 1000).toLocaleString("en-US", {
    timeZone: TZ,
    weekday: weekday ? "short" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });

// "Wed 2:00 PM – 3:00 PM"; the end's weekday only when it falls on another day.
function range(start: number, end: number, TZ: string) {
  const day = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-US", { timeZone: TZ });
  return `${fmt(start, true, TZ)} – ${fmt(end, day(start) !== day(end), TZ)}`;
}
