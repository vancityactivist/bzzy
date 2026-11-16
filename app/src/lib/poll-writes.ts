// Pure rules for when a device poll needs to write to the database. Every poll that
// writes keeps the database awake, so polls skip writes that wouldn't change anything.

import type { CachedEvent } from "./ics";

// The live "last seen" (in the runtime cache) is updated at most this often. The Devices
// page and the team dashboard call a light online if it was seen in the last 2 minutes, so
// 60 s (plus a 20 s poll) keeps that right.
export const SEEN_WRITE_EVERY_MS = 60_000;

// The database copy of "last seen" only needs to be roughly right (it's the fallback if the
// cache forgets), so it's written every few hours instead of waking Postgres every minute.
export const SEEN_DB_EVERY_MS = 6 * 3600_000;

// When a poll has already woken the database (its cached copy ran out, every few hours),
// the saved "last seen" is brought up to date in the same wake if it's older than this.
// So the 6-hour write above rarely needs a wake of its own.
export const SEEN_DB_WHILE_AWAKE_MS = 30 * 60_000;

// A light counts as online if it was seen within 2 minutes, or within a minute past its
// next poll when it was told to wait longer (outside working hours, every 5 minutes).
export const ONLINE_WINDOW_MS = 2 * 60_000;
export function isOnline(lastSeenAt: Date | null, nowMs: number, pollSec = 20): boolean {
  if (!lastSeenAt) return false;
  return nowMs - lastSeenAt.getTime() < Math.max(ONLINE_WINDOW_MS, (pollSec + 60) * 1000);
}

export function shouldMarkSeen(lastSeenAt: Date | null, nowMs: number, hasOtherChanges: boolean, everyMs = SEEN_WRITE_EVERY_MS): boolean {
  if (hasOtherChanges) return true;
  if (!lastSeenAt) return true;
  const age = nowMs - lastSeenAt.getTime();
  // A clock that went backwards (or a future timestamp) gets corrected straight away.
  return age < 0 || age >= everyMs;
}

// Whether a fresh read of a feed gave the same events as the saved copy, so the refresh
// only needs to note the time instead of rewriting the whole list.
export function sameEvents(a: readonly CachedEvent[], b: readonly CachedEvent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.start !== y.start || x.end !== y.end || x.status !== y.status || x.title !== y.title) return false;
  }
  return true;
}

// Deep equality for JSON values, ignoring object key order (Postgres jsonb reorders keys,
// so a value read back never stringifies the same as the one written).
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined);
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(rb, k) && sameJson(ra[k], rb[k]));
}
