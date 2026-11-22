// Turning Google Calendar API events into status. Pure, so the rules can be tested.

import type { CachedEvent } from "./ics";
import type { Status } from "./protocol";
import { zonedMidnight } from "./zoned";

// The parts of a Google event we ask for (the `fields` parameter in google-calendar.ts).
export type GoogleEvent = {
  status?: string; // confirmed | tentative | cancelled
  summary?: string;
  iCalUID?: string;
  eventType?: string; // default | outOfOffice | focusTime | workingLocation | birthday | fromGmail
  transparency?: string; // opaque (default) | transparent
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

// The rules:
//   cancelled, declined by you, shown as free, working location -> ignored
//   out of office                                              -> away (all-day too)
//   focus time                                                 -> do not disturb
//   anything else with a time (busy, tentative, not answered)  -> busy
//   other all-day events (birthdays, holidays)                 -> ignored
export function classifyGoogle(e: GoogleEvent): Status | null {
  if (e.status === "cancelled") return null;
  if (e.eventType === "workingLocation" || e.eventType === "birthday")
    return null;
  if (e.attendees?.some((a) => a.self && a.responseStatus === "declined"))
    return null;
  if (e.eventType === "outOfOffice") return "away";
  if (e.transparency === "transparent") return null;
  const allDay = !!e.start?.date && !e.start?.dateTime;
  if (e.eventType === "focusTime") return allDay ? null : "dnd";
  return allDay ? null : "busy";
}

function when(
  t: { date?: string; dateTime?: string } | undefined,
  timeZone: string,
): number | null {
  if (t?.dateTime) {
    const ms = Date.parse(t.dateTime);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  const m = t?.date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m
    ? zonedMidnight(Number(m[1]), Number(m[2]), Number(m[3]), timeZone)
    : null;
}

export function eventsFromGoogle(
  items: readonly GoogleEvent[],
  window: { from: Date; to: Date },
  timeZone: string,
): CachedEvent[] {
  const from = window.from.getTime() / 1000;
  const to = window.to.getTime() / 1000;
  const out: CachedEvent[] = [];
  for (const e of items) {
    const status = classifyGoogle(e);
    if (!status) continue;
    const start = when(e.start, timeZone);
    const end = when(e.end, timeZone);
    if (start === null || end === null || !(end > start)) continue;
    if (end <= from || start >= to) continue;
    const uid = e.iCalUID?.trim();
    out.push({
      start,
      end,
      status,
      title: (e.summary ?? "").trim(),
      ...(uid ? { uid } : {}),
    });
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}
