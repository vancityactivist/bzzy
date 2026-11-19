// Keeping the Status page's preview in step with the light, without a database read
// per check (lib/live.ts, app/api/live/route.ts, components/live-sync.tsx).
//
// The page polls a fingerprint of what its lights show. The fingerprint is worked out
// from the same cached copy the lights' own polls answer from, so it costs no database
// time; only when it changes does the page re-render (which does read the database).
//
// The page can't use the sign-in session to ask: sessions live in the database, so every
// check would wake it. Instead the page hands out a signed ticket naming the person and
// their lights, good for a few hours. All it unlocks is a hash.

import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { encode } from "./cache-codec";
import { type Block, type Presence, type Show, showVisible, type Status } from "./protocol";
import { type LedStyle, pushFor, type PushWho } from "./push-rules";
import { ringFor, type LedStyles, type MeetingWarn } from "./ring";
import { resolveScreen } from "./screen";
import { inWorkHours, type WorkWindow } from "./work-hours";

// A ticket outlasts a working day; after that the page re-renders once to get a new one.
export const TICKET_TTL_SEC = 12 * 3600;

export type LiveTicket = { u: string; d: string[]; e: number };

// Every Auth.js secret that's set, newest first (the same list as auth.ts): sign with the
// first, accept any, so rotating AUTH_SECRET doesn't break open pages.
function keys(): Buffer[] {
  const { AUTH_SECRET_3, AUTH_SECRET_2, AUTH_SECRET_1, AUTH_SECRET } = process.env;
  return [AUTH_SECRET_3, AUTH_SECRET_2, AUTH_SECRET_1, AUTH_SECRET]
    .filter((s): s is string => !!s)
    .map((s) => Buffer.from(hkdfSync("sha256", s, "bzzy", "live-ticket", 32)));
}

const sign = (key: Buffer, body: string) => createHmac("sha256", key).update(body).digest("base64url");

// Null without a secret (the page then just doesn't sync).
export function signTicket(userId: string, deviceIds: string[], nowSec: number): string | null {
  const [key] = keys();
  if (!key) return null;
  const body = Buffer.from(JSON.stringify({ u: userId, d: deviceIds, e: nowSec + TICKET_TTL_SEC } satisfies LiveTicket)).toString(
    "base64url",
  );
  return `${body}.${sign(key, body)}`;
}

// Null when it's malformed, signed with another key, or has run out.
export function readTicket(ticket: string | null | undefined, nowSec: number): LiveTicket | null {
  if (!ticket || ticket.length > 4096) return null;
  const [body, sig, extra] = ticket.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, "base64url");
  const ok = keys().some((k) => {
    const want = Buffer.from(sign(k, body), "base64url");
    return want.length === given.length && timingSafeEqual(want, given);
  });
  if (!ok) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LiveTicket;
    if (typeof t.u !== "string" || !Array.isArray(t.d) || typeof t.e !== "number") return null;
    if (!t.d.every((id) => typeof id === "string") || t.d.length > 50) return null;
    return t.e > nowSec ? t : null;
  } catch {
    return null;
  }
}

// What one light is showing, as far as the server can tell, plus everything it was
// worked out from. Time matters on its own: a meeting starting, a status or show running
// out, a push's flash ending or working hours ending change the screen with no write.
export type LiveInput = {
  // The light's cached poll data (lib/poll-bundle.ts), less the parts the page doesn't show.
  data: unknown;
  ownerUserId: string;
  defaultStatus: Status;
  presence: Presence | null;
  show: (Show & { leds: LedStyle | null }) | null;
  pushes: (PushWho & { leds: LedStyle | null })[];
  schedule: Block[];
  ring: { allowFlash: boolean; ledStyles: LedStyles | null; meetingWarn: MeetingWarn | null };
  // Working hours this light follows (only firmware with the "hours" feature goes dark).
  hours: WorkWindow[] | null;
  online: boolean;
};

export function liveFacts(l: LiveInput, now: number) {
  const screen = resolveScreen({ now, defaultStatus: l.defaultStatus, presence: l.presence, schedule: l.schedule });
  const push = pushFor(l.pushes, l.ownerUserId, now);
  const show = !push && showVisible(l.show, l.presence, now) ? l.show : null;
  return {
    screen,
    push: push ? `${push.id}:${push.updatedAt}` : null,
    show: show ? show.updatedAt : null,
    ring: ringFor({ ...l.ring, status: screen.status, schedule: l.schedule, now, push, show }),
    dark: isDark(l.hours, now),
    online: l.online,
  };
}

// The firmware's offHours() (status_engine.cpp): dark when no window covers now, unless
// every window has passed (it then stays on rather than guess).
export function isDark(windows: WorkWindow[] | null, now: number): boolean {
  if (!windows || windows.length === 0) return false;
  return !inWorkHours(windows, now) && windows.some((w) => w.end > now);
}

// One short string for all the page's lights; it changes when anything they show does.
export function liveVersion(lights: LiveInput[], now: number): string {
  const parts = lights.map((l) => ({ data: l.data, facts: liveFacts(l, now) }));
  return createHash("sha256").update(encode(parts)).digest("base64url").slice(0, 16);
}
