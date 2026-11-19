import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CalendarIcon, ClockIcon, CodeIcon, KeyIcon, UsersIcon, WebhookIcon } from "@/components/icons";
import { AddPasskey } from "@/components/passkey-buttons";
import { Reveal } from "@/components/reveal";
import { SignIn } from "@/components/sign-in";
import { Badge, Card, CardHeader, Container, PageHeader, StatusDot } from "@/components/ui";
import { calendarsForUser, refreshStaleCalendars, userClock } from "@/lib/calendar";
import { EXPIRY_WARNING_DAYS, SCOPE_INFO } from "@/lib/api-rules";
import { tokensForUser } from "@/lib/api-tokens";
import { blocksForDevice } from "@/lib/ics";
import { passkeysForUser } from "@/lib/passkeys";
import { nowSeconds } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";
import { teamsForUser } from "@/lib/teams";
import { EVENT_INFO, FAILURES_TO_DISABLE, MAX_WEBHOOKS } from "@/lib/webhook-rules";
import { webhooksForUser } from "@/lib/webhooks";

import { absoluteTime, relativeTime } from "../devices/relative-time";
import { NewApiTokenForm, RevokeApiToken } from "./api-token-forms";
import { AddCalendarForm, CalendarActions } from "./calendar-forms";
import { PasskeyActions } from "./passkey-forms";
import { NewWebhookForm, WebhookActions } from "./webhook-forms";
import { WorkHoursForm } from "./work-hours-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Container size="narrow">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <SettingsContent />
      </Suspense>
    </Container>
  );
}

async function SettingsContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  await refreshStaleCalendars(user.id);
  const [teams, calendars, passkeys, clock, tokens, webhooks] = await Promise.all([
    teamsForUser(user.id),
    calendarsForUser(user.id),
    passkeysForUser(user.id),
    userClock(user.id),
    tokensForUser(user.id),
    webhooksForUser(user.id),
  ]);
  const TZ = clock.timeZone;
  const now = nowSeconds();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      {/* Jump to a section: a row of pills that stays under the header as you scroll. */}
      <nav
        aria-label="Settings sections"
        className="sticky top-14 z-20 -mx-4 flex gap-1.5 overflow-x-auto border-b border-line bg-background/90 px-4 py-2.5 backdrop-blur-lg [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:top-14 [&::-webkit-scrollbar]:hidden"
      >
        {SECTIONS.map((sec) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            className="flex h-8 shrink-0 items-center rounded-full border border-line bg-card px-3 text-sm font-medium whitespace-nowrap text-muted-foreground shadow-card transition-colors hover:border-line-strong hover:text-foreground"
          >
            {sec.label}
          </a>
        ))}
      </nav>

      <Card id="calendars" className="scroll-mt-32">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <CalendarIcon className="size-5 text-muted-foreground" />
              Calendars
            </span>
          }
          description="Your lights turn Busy during meetings and Away when you're out of office."
        />
        {calendars.length === 0 && <OutlookHelp />}

        {calendars.length > 0 && (
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {calendars.map((c) => {
              const upcoming = blocksForDevice(c.events, now, c.showTitles).slice(0, 4);
              return (
                <li key={c.id} className="space-y-4 p-4">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="break-all">{new URL(c.icsUrl).hostname}</span> ·{" "}
                      <span title={c.lastFetchedAt ? absoluteTime(c.lastFetchedAt) : undefined}>
                        {c.lastFetchedAt ? `checked ${relativeTime(c.lastFetchedAt)}` : "not checked yet"}
                      </span>
                    </p>
                    {c.lastError && <p className="mt-1 text-sm text-danger">{c.lastError}</p>}
                  </div>
                  <div className="text-sm">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Next 24 hours</p>
                    {upcoming.length === 0 ? (
                      <p className="mt-1 text-muted-foreground">Nothing that makes you busy.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {upcoming.map((b) => (
                          <li key={`${b.start}-${b.status}`} className="flex items-center gap-2">
                            <StatusDot status={b.status} />
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {range(b.start, b.end, TZ)}
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

        <Reveal label="Add a calendar" defaultOpen={calendars.length === 0} className="mt-5">
          {calendars.length > 0 && <OutlookHelp />}
          <AddCalendarForm first={calendars.length === 0} />
          <p className="text-xs text-muted-foreground">The link is kept private: it&apos;s only used to read your calendar and is never shown again.</p>
        </Reveal>
      </Card>

      <Card id="hours" className="scroll-mt-32">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <ClockIcon className="size-5 text-muted-foreground" />
              Working hours
            </span>
          }
          description="Outside them your lights go dark and check in every 5 minutes instead of every 20 seconds. Press the button to wake one for a few minutes."
        />
        <div className="mt-5">
          <WorkHoursForm hours={clock.workHours} timeZone={clock.timeZone} zones={timeZones(clock.timeZone)} />
        </div>
      </Card>

      <Card id="passkeys" className="scroll-mt-32">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <KeyIcon className="size-5 text-muted-foreground" />
              Passkeys
            </span>
          }
          description="Sign in with your fingerprint, face or device PIN instead of GitHub."
        />
        {passkeys.length > 0 && (
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {passkeys.map((p) => (
              <li key={p.credentialID} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{p.name}</span>
                    <Badge title={p.synced ? "Backed up and synced across your devices" : "Lives on one device or security key"}>
                      {p.synced ? "synced" : "this device only"}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {p.createdAt ? (
                      <span title={absoluteTime(p.createdAt)}>added {relativeTime(p.createdAt)}</span>
                    ) : (
                      "added a while ago"
                    )}
                    {" · "}
                    {p.lastUsedAt ? (
                      <span title={absoluteTime(p.lastUsedAt)}>last used {relativeTime(p.lastUsedAt)}</span>
                    ) : p.createdAt ? (
                      "not used to sign in yet"
                    ) : (
                      "no sign-ins recorded yet"
                    )}
                  </p>
                </div>
                <PasskeyActions credentialID={p.credentialID} name={p.name} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5">
          <AddPasskey first={passkeys.length === 0} />
        </div>
      </Card>

      <Card id="teams" className="scroll-mt-32">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <UsersIcon className="size-5 text-muted-foreground" />
              Teams
            </span>
          }
        />
        <ul className="mt-3 divide-y divide-line text-sm">
          {teams
            .filter((t) => !t.personal)
            .map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <Link href={`/teams/${t.id}`} className="min-w-0 truncate font-medium hover:underline">
                  {t.name}
                </Link>
                <Badge>{t.role}</Badge>
              </li>
            ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          {teams.some((t) => !t.personal) ? "" : "You're not in a shared team yet. "}
          <Link href="/teams?all" className="underline">
            Make or manage teams
          </Link>
        </p>
      </Card>
      <div id="developer" className="scroll-mt-32 pt-4">
        <h2 className="text-lg font-semibold tracking-tight">Developer</h2>
        <p className="mt-1 text-sm text-muted-foreground">For scripts, Stream Deck, Home Assistant and other apps. Most people never need these.</p>
      </div>

      <Card id="api-tokens" className="scroll-mt-32">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <CodeIcon className="size-5 text-muted-foreground" />
              API tokens
            </span>
          }
          description={
            <>
              Let a script, Stream Deck, Home Assistant or another app set your status and Show now.{" "}
              <Link href="/docs/api" className="font-medium text-foreground underline underline-offset-2">
                How the API works
              </Link>
            </>
          }
        />
        {tokens.length > 0 && (
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {tokens.map((t) => {
              const soon = t.live && t.expiresAt && t.expiresAt.getTime() - now * 1000 < EXPIRY_WARNING_DAYS * 86_400_000;
              return (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">{t.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{t.prefix}…</span>
                      {t.revokedAt ? <Badge>revoked</Badge> : !t.live ? <Badge>expired</Badge> : soon && <Badge tone="away">expires soon</Badge>}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{t.scopes.map((s) => SCOPE_INFO[s].label).join(", ")}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      <span title={absoluteTime(t.createdAt)}>made {relativeTime(t.createdAt)}</span>
                      {" · "}
                      {t.lastUsedAt ? <span title={absoluteTime(t.lastUsedAt)}>last used {relativeTime(t.lastUsedAt)}</span> : "not used yet"}
                      {t.live && (
                        <>
                          {" · "}
                          {t.expiresAt ? <span title={absoluteTime(t.expiresAt)}>expires {shortDay(t.expiresAt, TZ)}</span> : "never expires"}
                        </>
                      )}
                    </p>
                  </div>
                  {t.live && <RevokeApiToken id={t.id} name={t.name} />}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-5">
          <Reveal label="New token">
            <NewApiTokenForm first={tokens.length === 0} />
          </Reveal>
        </div>
      </Card>

      <Card id="webhooks" className="scroll-mt-32">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <WebhookIcon className="size-5 text-muted-foreground" />
              Webhooks
            </span>
          }
          description={
            <>
              Tell another app the moment your status, Show now or a button press changes.{" "}
              <Link href="/docs/api#webhooks" className="font-medium text-foreground underline underline-offset-2">
                How webhooks work
              </Link>
            </>
          }
        />
        {webhooks.length > 0 && (
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {webhooks.map((w) => {
              const last = w.recent[0];
              return (
                <li key={w.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {w.description && <span>{w.description}</span>}
                        {!w.enabled && (
                          <Badge tone={w.failures >= FAILURES_TO_DISABLE ? "busy" : "neutral"}>
                            {w.failures >= FAILURES_TO_DISABLE ? `off after ${FAILURES_TO_DISABLE} failures` : "off"}
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[13px] text-muted-foreground" title={w.url}>
                        {w.url}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{w.events.map((e) => EVENT_INFO[e].label).join(", ")}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {last ? (
                          <>
                            <span title={absoluteTime(new Date(last.at))}>last sent {relativeTime(new Date(last.at))}</span>
                            {" · "}
                            {last.ok ? <span className="text-free">delivered</span> : <span className="text-danger">failed: {last.error}</span>}
                            {w.failures > 1 && ` (${w.failures} in a row)`}
                          </>
                        ) : (
                          "nothing sent yet"
                        )}
                      </p>
                    </div>
                    <WebhookActions id={w.id} url={w.url} enabled={w.enabled} />
                  </div>
                  {w.recent.length > 0 && (
                    <details className="group text-sm">
                      <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">Recent deliveries ({w.recent.length})</summary>
                      <ul className="mt-2 space-y-1">
                        {w.recent.map((d) => (
                          <li key={`${d.id}-${d.at}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <StatusDot status={d.ok ? "free" : "busy"} />
                            <span className="font-mono text-[13px]">{d.type}</span>
                            <span className="text-muted-foreground" title={absoluteTime(new Date(d.at))}>
                              {relativeTime(new Date(d.at))}
                            </span>
                            <span className="text-muted-foreground">
                              {d.ok ? `${d.code} in ${d.ms} ms` : d.error}
                              {d.tries > 1 && ` · ${d.tries} tries`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-5">
          {webhooks.length < MAX_WEBHOOKS ? (
            <Reveal label="Add a webhook">
              <NewWebhookForm first={webhooks.length === 0} />
            </Reveal>
          ) : (
            <p className="text-sm text-muted-foreground">That&apos;s {MAX_WEBHOOKS}, the most you can have. Remove one to add another.</p>
          )}
        </div>
      </Card>

    </div>
  );
}

const SECTIONS = [
  { id: "calendars", label: "Calendars" },
  { id: "hours", label: "Working hours" },
  { id: "passkeys", label: "Passkeys" },
  { id: "teams", label: "Teams" },
  { id: "developer", label: "Developer" },
];

// Where Outlook hides the ICS link: open for a first calendar, folded once you have one.
function OutlookHelp() {
  return (
    <div className="mt-4 rounded-xl bg-subtle p-4 text-sm text-muted-foreground">
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
const shortDay = (d: Date, TZ: string) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: TZ });

function range(start: number, end: number, TZ: string) {
  const day = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-US", { timeZone: TZ });
  return `${fmt(start, true, TZ)} – ${fmt(end, day(start) !== day(end), TZ)}`;
}

function timeZones(current: string) {
  const all = Intl.supportedValuesOf("timeZone");
  return all.includes(current) ? all : [current, ...all];
}
