// Pure rules for when a device poll needs to write to the database. Every poll that
// writes keeps the database awake, so polls skip writes that wouldn't change anything.

import type { CachedEvent } from "./ics";

// "Last seen" is saved at most this often. The Devices page and the team dashboard call a
// light online if it was seen in the last 2 minutes, so 60 s (plus a 20 s poll) keeps that right.
export const SEEN_WRITE_EVERY_MS = 60_000;

export function shouldMarkSeen(lastSeenAt: Date | null, nowMs: number, hasOtherChanges: boolean): boolean {
  if (hasOtherChanges) return true;
  if (!lastSeenAt) return true;
  const age = nowMs - lastSeenAt.getTime();
  // A clock that went backwards (or a future timestamp) gets corrected straight away.
  return age < 0 || age >= SEEN_WRITE_EVERY_MS;
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
