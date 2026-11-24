import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  CalendarIcon,
  ClockIcon,
  CodeIcon,
  KeyIcon,
  StatusIcon,
  WebhookIcon,
} from "@/components/icons";
import { AddPasskey } from "@/components/passkey-buttons";
import { Reveal } from "@/components/reveal";
import { SignIn } from "@/components/sign-in";
import {
  Badge,
  buttonClass,
  Card,
  CardHeader,
  Container,
  PageHeader,
  StatusDot,
} from "@/components/ui";
import {
  calendarsForUser,
  refreshStaleCalendars,
  userClock,
} from "@/lib/calendar";
import { EXPIRY_WARNING_DAYS, SCOPE_INFO } from "@/lib/api-rules";
import { tokensForUser } from "@/lib/api-tokens";
import { accountsForUser } from "@/lib/calendar-accounts";
import { devicesForUser } from "@/lib/devices";
import { passkeysForUser } from "@/lib/passkeys";
import { nowSeconds } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";
import { getLook } from "@/lib/look";
import { allLabels, statusLabel } from "@/lib/status-labels";
import {
  EVENT_INFO,
  FAILURES_TO_DISABLE,
  MAX_WEBHOOKS,
} from "@/lib/webhook-rules";
import { webhooksForUser } from "@/lib/webhooks";

import { absoluteTime, relativeTime } from "../lights/relative-time";
import { NewApiTokenForm, RevokeApiToken } from "./api-token-forms";
import { DefaultStatusForm } from "./default-status-form";
import { PasskeyActions } from "./passkey-forms";
import { NewWebhookForm, WebhookActions } from "./webhook-forms";
import { WorkHoursForm } from "./work-hours-form";

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
  const [look, calendars, passkeys, clock, tokens, webhooks, accounts, devices] =
    await Promise.all([
      getLook(user.id),
      calendarsForUser(user.id),
      passkeysForUser(user.id),
      userClock(user.id),
      tokensForUser(user.id),
      webhooksForUser(user.id),
      accountsForUser(user.id),
      devicesForUser(user.id),
    ]);
  // Your lights with hours of their own, which this card doesn't change.
  const ownHours = devices.filter((d) => d.ownerUserId === user.id && d.hoursMode !== "owner");
  const active = calendars.filter((c) => c.setsStatus);
  const problems =
    accounts.filter((a) => a.state !== "ok").length +
    active.filter((c) => c.lastError).length;
  const TZ = clock.timeZone;
  const now = nowSeconds();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      {/* Jump to a section: a row of pills that stays under the header as you scroll. */}
      <nav
        aria-label="Settings sections"
        className="sticky top-14 z-20 -mx-4 flex gap-1.5 overflow-x-auto border-b border-line bg-background px-4 py-2.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:top-14 [&::-webkit-scrollbar]:hidden"
      >
        {SECTIONS.map((sec) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            className="flex h-8 shrink-0 items-center rounded-full border border-line bg-card px-3 text-sm font-medium whitespace-nowrap text-muted shadow-card transition-colors hover:border-line-strong hover:text-foreground"
          >
            {sec.label}
          </a>
        ))}
      </nav>

      <div className="pt-2">
        <h2 className="text-lg font-semibold tracking-tight">Your day</h2>
        <p className="mt-1 text-sm text-muted">
          What your lights follow when you haven&apos;t set a status.
        </p>
      </div>

      <Card id="calendars" className="scroll-mt-32">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <CalendarIcon className="size-5 text-muted" />
              Calendars
            </span>
          }
          description={`Your lights turn ${statusLabel("busy", look.statusLabels)} during meetings and ${statusLabel("away", look.statusLabels)} when you're out of office.`}
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {calendars.length === 0
              ? "No calendars yet."
              : `${active.length} of ${calendars.length} calendar${calendars.length === 1 ? "" : "s"} setting your status${
                  accounts.length > 0 ? `, from ${accounts.length} account${accounts.length === 1 ? "" : "s"}` : ""
                }.`}
            {problems > 0 && (
              <span className="text-danger">
                {" "}
                {problems === 1 ? "One needs" : `${problems} need`} attention.
              </span>
            )}
          </p>
          <Link
            href={calendars.length === 0 ? "/settings/calendars#add" : "/settings/calendars"}
            className={buttonClass(calendars.length === 0 ? "primary" : "secondary", "sm")}
          >
            {calendars.length === 0 ? "Add a calendar" : "Manage calendars"}
          </Link>
        </div>
      </Card>

      <Card id="between" className="scroll-mt-32">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <StatusIcon className="size-5 text-muted" />
              Between meetings
            </span>
          }
          description="What your lights show when there's no meeting and you haven't set anything."
        />
        <div className="mt-5">
          <DefaultStatusForm value={look.defaultStatus} names={allLabels(look.statusLabels)} />
        </div>
      </Card>

      <Card id="hours" className="scroll-mt-32">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <ClockIcon className="size-5 text-muted" />
              Working hours
            </span>
          }
          description="Outside them your lights go dark and check in every 5 minutes instead of every 20 seconds. Press the button to wake one for a few minutes."
        />
        <div className="mt-5">
          <WorkHoursForm
            hours={clock.workHours}
            timeZone={clock.timeZone}
            zones={timeZones(clock.timeZone)}
          />
        </div>
        <p className="mt-4 text-sm text-muted">
          {ownHours.length === 0 ? (
            <>A light can have its own hours instead: open it under <Link href="/lights" className="underline underline-offset-2">Lights</Link>.</>
          ) : (
            <>
              Not used by{" "}
              {ownHours.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && (i === ownHours.length - 1 ? " and " : ", ")}
                  <Link href={`/lights/${d.id}`} className="underline underline-offset-2">
                    {d.name}
                  </Link>
                </span>
              ))}
              , which {ownHours.length === 1 ? "has" : "have"} {ownHours.length === 1 ? "its" : "their"} own.
            </>
          )}
        </p>
      </Card>

      <div className="pt-4">
        <h2 className="text-lg font-semibold tracking-tight">Account</h2>
      </div>

      <Card id="passkeys" className="scroll-mt-32">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <KeyIcon className="size-5 text-muted" />
              Passkeys
            </span>
          }
          description="Sign in with your fingerprint, face or device PIN instead of GitHub."
        />
        {passkeys.length > 0 && (
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {passkeys.map((p) => (
              <li
                key={p.credentialID}
                className="flex flex-wrap items-start justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{p.name}</span>
                    <Badge
                      title={
                        p.synced
                          ? "Backed up and synced across your devices"
                          : "Lives on one device or security key"
                      }
                    >
                      {p.synced ? "synced" : "this device only"}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {p.createdAt ? (
                      <span title={absoluteTime(p.createdAt)}>
                        added {relativeTime(p.createdAt)}
                      </span>
                    ) : (
                      "added a while ago"
                    )}
                    {", "}
                    {p.lastUsedAt ? (
                      <span title={absoluteTime(p.lastUsedAt)}>
                        last used {relativeTime(p.lastUsedAt)}
                      </span>
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

      <div id="developer" className="scroll-mt-32 pt-4">
        <h2 className="text-lg font-semibold tracking-tight">Developer</h2>
        <p className="mt-1 text-sm text-muted">
          For scripts, Stream Deck, Home Assistant and other apps. Most people
          never need these.
        </p>
      </div>

      <Card id="api-tokens" className="scroll-mt-32">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <CodeIcon className="size-5 text-muted" />
              API tokens
            </span>
          }
          description={
            <>
              Let a script, Stream Deck, Home Assistant or another app set your
              status and Show now.{" "}
              <Link
                href="/docs/api"
                className="font-medium text-foreground underline underline-offset-2"
              >
                How the API works
              </Link>
            </>
          }
        />
        {tokens.length > 0 && (
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {tokens.map((t) => {
              const soon =
                t.live &&
                t.expiresAt &&
                t.expiresAt.getTime() - now * 1000 <
                  EXPIRY_WARNING_DAYS * 86_400_000;
              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">{t.name}</span>
                      <span className="font-mono text-xs text-muted">
                        {t.prefix}…
                      </span>
                      {t.revokedAt ? (
                        <Badge>revoked</Badge>
                      ) : !t.live ? (
                        <Badge>expired</Badge>
                      ) : (
                        soon && <Badge tone="away">expires soon</Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {t.scopes.map((s) => SCOPE_INFO[s].label).join(", ")}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      <span title={absoluteTime(t.createdAt)}>
                        made {relativeTime(t.createdAt)}
                      </span>
                      {", "}
                      {t.lastUsedAt ? (
                        <span title={absoluteTime(t.lastUsedAt)}>
                          last used {relativeTime(t.lastUsedAt)}
                        </span>
                      ) : (
                        "not used yet"
                      )}
                      {t.live && (
                        <>
                          {", "}
                          {t.expiresAt ? (
                            <span title={absoluteTime(t.expiresAt)}>
                              expires {shortDay(t.expiresAt, TZ)}
                            </span>
                          ) : (
                            "never expires"
                          )}
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
              <WebhookIcon className="size-5 text-muted" />
              Webhooks
            </span>
          }
          description={
            <>
              Tell another app the moment your status, Show now or a button
              press changes.{" "}
              <Link
                href="/docs/api#webhooks"
                className="font-medium text-foreground underline underline-offset-2"
              >
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
                <li key={w.id} className="space-y-3 p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {w.description && (
                          <span className="min-w-0 break-words">
                            {w.description}
                          </span>
                        )}
                        {!w.enabled && (
                          <Badge
                            tone={
                              w.failures >= FAILURES_TO_DISABLE
                                ? "busy"
                                : "neutral"
                            }
                          >
                            {w.failures >= FAILURES_TO_DISABLE
                              ? `off after ${FAILURES_TO_DISABLE} failures`
                              : "off"}
                          </Badge>
                        )}
                      </p>
                      <p
                        className="mt-0.5 truncate font-mono text-[13px] text-muted"
                        title={w.url}
                      >
                        {w.url}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {w.events.map((e) => EVENT_INFO[e].label).join(", ")}
                      </p>
                      {/* Just whether the last one got there; the reason is under Recent deliveries. */}
                      <p className="mt-0.5 text-sm text-muted">
                        {last ? (
                          <>
                            <span title={absoluteTime(new Date(last.at))}>
                              last sent {relativeTime(new Date(last.at))}
                            </span>
                            {", "}
                            {last.ok ? (
                              <span className="text-free">delivered</span>
                            ) : (
                              <span className="text-danger">
                                failed
                                {w.failures > 1 && `, ${w.failures} in a row`}
                              </span>
                            )}
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
                      <summary className="cursor-pointer text-muted select-none hover:text-foreground">
                        Recent deliveries ({w.recent.length})
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {w.recent.map((d) => (
                          <li
                            key={`${d.id}-${d.at}`}
                            className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2"
                          >
                            <span className="flex h-5 items-center">
                              <StatusDot status={d.ok ? "free" : "busy"} />
                            </span>
                            <span className="flex flex-wrap gap-x-2">
                              <span className="font-mono text-[13px]">
                                {d.type}
                              </span>
                              <span
                                className="text-muted"
                                title={absoluteTime(new Date(d.at))}
                              >
                                {relativeTime(new Date(d.at))}
                              </span>
                            </span>
                            <span className="col-start-2 text-muted [overflow-wrap:anywhere]">
                              {d.ok ? `${d.code} in ${d.ms} ms` : d.error}
                              {d.tries > 1 && `, ${d.tries} tries`}
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
            <p className="text-sm text-muted">
              That&apos;s {MAX_WEBHOOKS}, the most you can have. Remove one to
              add another.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

const SECTIONS = [
  { id: "calendars", label: "Calendars" },
  { id: "between", label: "Between meetings" },
  { id: "hours", label: "Working hours" },
  { id: "passkeys", label: "Passkeys" },
  { id: "developer", label: "Developer" },
];

const shortDay = (d: Date, TZ: string) =>
  d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: TZ,
  });

function timeZones(current: string) {
  const all = Intl.supportedValuesOf("timeZone");
  return all.includes(current) ? all : [current, ...all];
}
