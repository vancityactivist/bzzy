import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { after } from "next/server";

import { db, schema } from "@/db";

import { cacheGet, cacheSet, expire, tag } from "./cache";
import { calDavEventsFor, googleEventsFor } from "./calendar-accounts";
import { CalDavAuthFailed, CalDavError } from "./caldav";
import { GoogleAuthLost, GoogleError } from "./google-calendar";
import {
  type CachedEvent,
  eventsFromIcs,
  IcsError,
  mergeSchedule,
  type ScheduleSource,
} from "./ics";
import type { Block } from "./protocol";
import { sameEvents } from "./poll-writes";
import {
  FetchRefused,
  fetchPublicText,
  normalizeCalendarUrl,
} from "./safe-fetch";
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
  const checks = await Promise.all(
    cals.map((c) => cacheGet<number>(checkedKey(c.id))),
  );
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
  return {
    timeZone: rows[0]?.tz ?? "America/Vancouver",
    workHours: parseWorkHours(rows[0]?.workHours),
  };
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
export async function saveUserClock(
  userId: string,
  timeZone: string,
  workHours: WorkHours | null,
) {
  await db()
    .update(schema.users)
    .set({ timezone: timeZone, workHours })
    .where(eq(schema.users.id, userId));
  await expire(tag.user(userId));
}

function friendlyError(err: unknown) {
  if (
    err instanceof FetchRefused ||
    err instanceof IcsError ||
    err instanceof GoogleAuthLost ||
    err instanceof GoogleError ||
    err instanceof CalDavAuthFailed ||
    err instanceof CalDavError
  )
    return err.message;
  if (
    err instanceof Error &&
    (err.name === "TimeoutError" || err.name === "AbortError")
  ) {
    return "The calendar server took too long to answer.";
  }
  return "Couldn't read that calendar.";
}

// Fetch and parse without saving: used to check a link before it's added.
export async function loadFeed(
  rawUrl: string,
  timeZone: string,
): Promise<{ url: string; events: CachedEvent[] }> {
  const url = normalizeCalendarUrl(rawUrl);
  const body = await fetchPublicText(url);
  return {
    url: url.toString(),
    events: eventsFromIcs(body, new Date(), timeZone),
  };
}

// A calendar's next week of events, from wherever it lives.
async function eventsFor(
  cal: CalendarRow,
  timeZone: string,
): Promise<CachedEvent[]> {
  if (cal.source === "google") return googleEventsFor(cal, timeZone);
  if (cal.source === "caldav") return calDavEventsFor(cal, timeZone);
  if (cal.source === "ics" && cal.icsUrl)
    return (await loadFeed(cal.icsUrl, timeZone)).events;
  throw new IcsError("bzzy can't read this kind of calendar yet.");
}

// Re-read a feed. The database is only written when something changed (new events, or
// an error appearing, changing or clearing); otherwise the check is noted in the cache.
export async function refreshCalendar(
  cal: CalendarRow,
  timeZone?: string,
): Promise<string | null> {
  const now = new Date();
  let patch: Partial<CalendarRow> | null;
  let message: string | null = null;
  // Connected calendars that don't set status aren't read at all: no API calls for the
  // holidays and birthdays calendars Google lists by default.
  if (cal.source !== "ics" && !cal.setsStatus) return null;
  try {
    const tz = timeZone ?? (await userTimezone(cal.userId));
    const events = await eventsFor(cal, tz);
    patch =
      sameEvents(events, cal.events) && cal.lastError === null
        ? null
        : { events, lastError: null };
  } catch (err) {
    message = friendlyError(err);
    // Keep the last good events: a short outage at the calendar end shouldn't blank the device.
    patch = message === cal.lastError ? null : { lastError: message };
  }
  if (patch) {
    console.info(
      `[db] calendar ${cal.id}: saved ${"events" in patch ? "new events" : "an error change"}`,
    );
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
  const rows = await db()
    .select()
    .from(schema.calendars)
    .where(eq(schema.calendars.userId, userId))
    .orderBy(asc(schema.calendars.position), asc(schema.calendars.createdAt));
  return withLastCheck(rows);
}

export async function calendarsForAccount(accountId: string) {
  return db().select().from(schema.calendars).where(eq(schema.calendars.accountId, accountId));
}

export function isStale(cal: CalendarRow, now = Date.now()) {
  return (
    !cal.lastFetchedAt || now - cal.lastFetchedAt.getTime() > REFRESH_AFTER_MS
  );
}

// The device's schedule from saved calendar copies: every calendar that sets status,
// merged so the strongest status wins where they overlap and a meeting that's on two
// calendars shows once (mergeSchedule). Rows cached before `setsStatus` existed count as on.
export function scheduleFromCalendars(
  cals: CalendarRow[],
  nowSec: number,
): Block[] {
  return mergeSchedule(scheduleSources(cals), nowSec);
}

// The calendars that set status, highest priority first, as merge inputs. Rows cached
// before priority existed have no position or countsAs: they count as 0 and "auto".
export function scheduleSources(cals: CalendarRow[]): ScheduleSource[] {
  return cals
    .filter((c) => c.setsStatus !== false)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.position ?? 0) - (b.c.position ?? 0) || a.i - b.i)
    .map(({ c }) => ({ id: c.id, events: c.events, showTitles: c.showTitles, countsAs: c.countsAs ?? "auto" }));
}

// Which of these (possibly cached) rows are due a re-read, counting checks that only
// reached the cache.
export async function staleCalendars(
  cals: CalendarRow[],
  now = Date.now(),
): Promise<CalendarRow[]> {
  return (await withLastCheck(cals)).filter((c) => isStale(c, now));
}

// The device's schedule, from the saved copies. Returns the stale calendars too, so the
// caller can refresh them after responding instead of making the device wait.
export async function scheduleForUser(
  userId: string,
  nowSec: number,
): Promise<{ schedule: Block[]; stale: CalendarRow[] }> {
  const cals = await calendarsForUser(userId);
  return {
    schedule: scheduleFromCalendars(cals, nowSec),
    stale: cals.filter((c) => isStale(c)),
  };
}

export async function addCalendar(
  userId: string,
  name: string,
  rawUrl: string,
): Promise<string | null> {
  try {
    const tz = await userTimezone(userId);
    const { url, events } = await loadFeed(rawUrl, tz);
    const position = await nextPosition(userId);
    await db()
      .insert(schema.calendars)
      .values({ userId, name, icsUrl: url, events, lastFetchedAt: new Date(), position });
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
    .where(
      and(eq(schema.calendars.id, id), eq(schema.calendars.userId, userId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function setShowTitles(
  cal: Pick<CalendarRow, "id" | "userId">,
  showTitles: boolean,
) {
  await db()
    .update(schema.calendars)
    .set({ showTitles })
    .where(eq(schema.calendars.id, cal.id));
  await expire(tag.user(cal.userId));
}

async function nextPosition(userId: string): Promise<number> {
  const rows = await db()
    .select({ position: schema.calendars.position })
    .from(schema.calendars)
    .where(eq(schema.calendars.userId, userId));
  return rows.reduce((m, r) => Math.max(m, r.position + 1), 0);
}

export async function setCountsAs(cal: Pick<CalendarRow, "id" | "userId">, countsAs: CalendarRow["countsAs"]) {
  await db().update(schema.calendars).set({ countsAs }).where(eq(schema.calendars.id, cal.id));
  await expire(tag.user(cal.userId));
}

// Moves a calendar one step up or down the priority order (among the ones that set
// status, which is the list people see ordered), renumbering everyone 0..n.
export async function moveCalendar(cal: Pick<CalendarRow, "id" | "userId">, direction: -1 | 1) {
  const rows = await db()
    .select({ id: schema.calendars.id, setsStatus: schema.calendars.setsStatus, position: schema.calendars.position })
    .from(schema.calendars)
    .where(eq(schema.calendars.userId, cal.userId))
    .orderBy(asc(schema.calendars.position), asc(schema.calendars.createdAt));
  const order = rows.map((r) => r.id);
  const visible = rows.filter((r) => r.setsStatus).map((r) => r.id);
  const at = visible.indexOf(cal.id);
  const swapWith = visible[at + direction];
  if (at < 0 || !swapWith) return;
  const i = order.indexOf(cal.id);
  const j = order.indexOf(swapWith);
  [order[i], order[j]] = [order[j], order[i]];
  // Only rows whose number changes are written (usually just the two swapped).
  const current = new Map(rows.map((r) => [r.id, r.position]));
  for (const [position, id] of order.entries()) {
    if (current.get(id) !== position) {
      await db().update(schema.calendars).set({ position }).where(eq(schema.calendars.id, id));
    }
  }
  await expire(tag.user(cal.userId));
}

export async function setSetsStatus(
  cal: Pick<CalendarRow, "id" | "userId">,
  setsStatus: boolean,
) {
  await db()
    .update(schema.calendars)
    .set({ setsStatus })
    .where(eq(schema.calendars.id, cal.id));
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
