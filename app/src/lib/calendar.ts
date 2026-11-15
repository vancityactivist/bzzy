import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { after } from "next/server";

import { db, schema } from "@/db";

import { cacheGet, cacheSet, expire, tag } from "./cache";
import { blocksForDevice, type CachedEvent, eventsFromIcs, IcsError } from "./ics";
import type { Block } from "./protocol";
import { sameEvents } from "./poll-writes";
import { FetchRefused, fetchPublicText, normalizeCalendarUrl } from "./safe-fetch";
import { parseWorkHours, type WorkHours } from "./work-hours";

// Feeds are re-read when a device or page needs them and the copy is older than this.
// Outlook only republishes every few minutes anyway.
export const REFRESH_AFTER_MS = 5 * 60_000;

export type CalendarRow = typeof schema.calendars.$inferSelect;

// When a feed was last read and found unchanged. That's kept in the runtime cache, not
// the database: writing a timestamp every 5 minutes would keep Postgres from ever idling.
// If the cache loses it, the feed is just read again.
const checkedKey = (calendarId: string) => `calchk:${calendarId}`;
const CHECKED_TTL_SEC = 24 * 3600;

async function noteChecked(calendarId: string, atMs: number) {
  await cacheSet(checkedKey(calendarId), atMs, CHECKED_TTL_SEC);
}

// The rows with `lastFetchedAt` brought up to the latest check, including checks that
// found nothing new and so never reached the database.
async function withLastCheck(cals: CalendarRow[]): Promise<CalendarRow[]> {
  const checks = await Promise.all(cals.map((c) => cacheGet<number>(checkedKey(c.id))));
  return cals.map((c, i) => {
    const checked = checks[i];
    if (typeof checked !== "number") return c;
    if (c.lastFetchedAt && c.lastFetchedAt.getTime() >= checked) return c;
    return { ...c, lastFetchedAt: new Date(checked) };
  });
}

export async function userTimezone(userId: string) {
  return (await userClock(userId)).timeZone;
}

// The owner's time zone and working hours, which together decide when a light is on.
export async function userClock(userId: string) {
  const rows = await db()
    .select({ tz: schema.users.timezone, workHours: schema.users.workHours })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return { timeZone: rows[0]?.tz ?? "America/Vancouver", workHours: parseWorkHours(rows[0]?.workHours) };
}

export function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.length <= 64;
  } catch {
    return false;
  }
}

// Saves the owner's time zone and working hours (null = always on). Their lights pick
// it up on the next poll.
export async function saveUserClock(userId: string, timeZone: string, workHours: WorkHours | null) {
  await db().update(schema.users).set({ timezone: timeZone, workHours }).where(eq(schema.users.id, userId));
  await expire(tag.user(userId));
}

function friendlyError(err: unknown) {
  if (err instanceof FetchRefused || err instanceof IcsError) return err.message;
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return "The calendar server took too long to answer.";
  }
  return "Couldn't read that calendar.";
}

// Fetch and parse without saving: used to check a link before it's added.
export async function loadFeed(rawUrl: string, timeZone: string): Promise<{ url: string; events: CachedEvent[] }> {
  const url = normalizeCalendarUrl(rawUrl);
  const body = await fetchPublicText(url);
  return { url: url.toString(), events: eventsFromIcs(body, new Date(), timeZone) };
}

// Re-read a feed. The database is only written when something changed (new events, or
// an error appearing, changing or clearing); otherwise the check is noted in the cache.
export async function refreshCalendar(cal: CalendarRow, timeZone?: string): Promise<string | null> {
  const now = new Date();
  let patch: Partial<CalendarRow> | null;
  let message: string | null = null;
  try {
    const { events } = await loadFeed(cal.icsUrl, timeZone ?? (await userTimezone(cal.userId)));
    patch = sameEvents(events, cal.events) && cal.lastError === null ? null : { events, lastError: null };
  } catch (err) {
    message = friendlyError(err);
    // Keep the last good events: a short outage at the calendar end shouldn't blank the device.
    patch = message === cal.lastError ? null : { lastError: message };
  }
  if (patch) {
    await db()
      .update(schema.calendars)
      .set({ ...patch, lastFetchedAt: now })
      .where(eq(schema.calendars.id, cal.id));
    await expire(tag.user(cal.userId));
  }
  await noteChecked(cal.id, now.getTime());
  return message;
}

export async function calendarsForUser(userId: string) {
  const rows = await db().select().from(schema.calendars).where(eq(schema.calendars.userId, userId)).orderBy(asc(schema.calendars.createdAt));
  return withLastCheck(rows);
}

export function isStale(cal: CalendarRow, now = Date.now()) {
  return !cal.lastFetchedAt || now - cal.lastFetchedAt.getTime() > REFRESH_AFTER_MS;
}

// The device's schedule from saved calendar copies.
export function scheduleFromCalendars(cals: CalendarRow[], nowSec: number): Block[] {
  const blocks = cals.flatMap((c) => blocksForDevice(c.events, nowSec, c.showTitles));
  // Each calendar is joined already; re-sort the mix. Different calendars can overlap,
  // and the device shows whichever block it finds first, so earlier starts win.
  blocks.sort((a, b) => a.start - b.start || a.end - b.end);
  return blocks;
}

// Which of these (possibly cached) rows are due a re-read, counting checks that only
// reached the cache.
export async function staleCalendars(cals: CalendarRow[], now = Date.now()): Promise<CalendarRow[]> {
  return (await withLastCheck(cals)).filter((c) => isStale(c, now));
}

// The device's schedule, from the saved copies. Returns the stale calendars too, so the
// caller can refresh them after responding instead of making the device wait.
export async function scheduleForUser(userId: string, nowSec: number): Promise<{ schedule: Block[]; stale: CalendarRow[] }> {
  const cals = await calendarsForUser(userId);
  return { schedule: scheduleFromCalendars(cals, nowSec), stale: cals.filter((c) => isStale(c)) };
}

export async function addCalendar(userId: string, name: string, rawUrl: string): Promise<string | null> {
  try {
    const tz = await userTimezone(userId);
    const { url, events } = await loadFeed(rawUrl, tz);
    await db().insert(schema.calendars).values({ userId, name, icsUrl: url, events, lastFetchedAt: new Date() });
    await expire(tag.user(userId));
    return null;
  } catch (err) {
    return friendlyError(err);
  }
}

export async function ownCalendar(userId: string, id: string) {
  const rows = await db()
    .select()
    .from(schema.calendars)
    .where(and(eq(schema.calendars.id, id), eq(schema.calendars.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function setShowTitles(cal: Pick<CalendarRow, "id" | "userId">, showTitles: boolean) {
  await db().update(schema.calendars).set({ showTitles }).where(eq(schema.calendars.id, cal.id));
  await expire(tag.user(cal.userId));
}

export async function deleteCalendar(cal: Pick<CalendarRow, "id" | "userId">) {
  await db().delete(schema.calendars).where(eq(schema.calendars.id, cal.id));
  await expire(tag.user(cal.userId));
}

// For pages: re-read any calendar that's due, waiting up to `waitMs` so the page shows
// fresh events when the feed answers quickly. Slow feeds finish after the response.
export async function refreshStaleCalendars(userId: string, waitMs = 3000) {
  const stale = (await calendarsForUser(userId)).filter((c) => isStale(c));
  if (stale.length === 0) return;
  const all = Promise.all(stale.map((c) => refreshCalendar(c)));
  after(() => all);
  await Promise.race([all, new Promise((r) => setTimeout(r, waitMs))]);
}
