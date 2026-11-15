import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { after } from "next/server";

import { db, schema } from "@/db";

import { blocksForDevice, type CachedEvent, eventsFromIcs, IcsError } from "./ics";
import type { Block } from "./protocol";
import { sameEvents } from "./poll-writes";
import { FetchRefused, fetchPublicText, normalizeCalendarUrl } from "./safe-fetch";

// Feeds are re-read when a device or page needs them and the copy is older than this.
// Outlook only republishes every few minutes anyway.
export const REFRESH_AFTER_MS = 5 * 60_000;

type CalendarRow = typeof schema.calendars.$inferSelect;

async function userTimezone(userId: string) {
  const rows = await db().select({ tz: schema.users.timezone }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return rows[0]?.tz ?? "America/Vancouver";
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

export async function refreshCalendar(cal: CalendarRow): Promise<string | null> {
  try {
    const { events } = await loadFeed(cal.icsUrl, await userTimezone(cal.userId));
    // Most refreshes find nothing new: then only note the time, instead of rewriting the
    // whole event list every 5 minutes.
    const unchanged = sameEvents(events, cal.events) && cal.lastError === null;
    await db()
      .update(schema.calendars)
      .set(unchanged ? { lastFetchedAt: new Date() } : { events, lastFetchedAt: new Date(), lastError: null })
      .where(eq(schema.calendars.id, cal.id));
    return null;
  } catch (err) {
    const message = friendlyError(err);
    // Keep the last good events: a short outage at the calendar end shouldn't blank the device.
    await db().update(schema.calendars).set({ lastFetchedAt: new Date(), lastError: message }).where(eq(schema.calendars.id, cal.id));
    return message;
  }
}

export async function calendarsForUser(userId: string) {
  return db().select().from(schema.calendars).where(eq(schema.calendars.userId, userId)).orderBy(asc(schema.calendars.createdAt));
}

export function isStale(cal: CalendarRow, now = Date.now()) {
  return !cal.lastFetchedAt || now - cal.lastFetchedAt.getTime() > REFRESH_AFTER_MS;
}

// The device's schedule, from the saved copies. Returns the stale calendars too, so the
// caller can refresh them after responding instead of making the device wait.
export async function scheduleForUser(userId: string, nowSec: number): Promise<{ schedule: Block[]; stale: CalendarRow[] }> {
  const cals = await calendarsForUser(userId);
  const blocks = cals.flatMap((c) => blocksForDevice(c.events, nowSec, c.showTitles));
  // Each calendar is joined already; re-sort the mix. Different calendars can overlap,
  // and the device shows whichever block it finds first, so earlier starts win.
  blocks.sort((a, b) => a.start - b.start || a.end - b.end);
  return { schedule: blocks, stale: cals.filter((c) => isStale(c)) };
}

export async function addCalendar(userId: string, name: string, rawUrl: string): Promise<string | null> {
  try {
    const tz = await userTimezone(userId);
    const { url, events } = await loadFeed(rawUrl, tz);
    await db().insert(schema.calendars).values({ userId, name, icsUrl: url, events, lastFetchedAt: new Date() });
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

export async function setShowTitles(id: string, showTitles: boolean) {
  await db().update(schema.calendars).set({ showTitles }).where(eq(schema.calendars.id, id));
}

export async function deleteCalendar(id: string) {
  await db().delete(schema.calendars).where(eq(schema.calendars.id, id));
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
