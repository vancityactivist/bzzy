// Turning an ICS feed into status blocks. Pure functions (no network, no database)
// so the rules can be tested against sample feeds.

import ical, { type VEvent } from "node-ical";

import { type Block, clipText, MAX_BLOCKS, type Status } from "./protocol";

// What we keep from a feed between fetches: the next week, already expanded.
export type CachedEvent = { start: number; end: number; status: Status; title: string };

export const FETCH_WINDOW_DAYS = 7;
export const DEVICE_HORIZON_SEC = 24 * 3600;

const HIDDEN_TITLE: Record<Status, string> = {
  busy: "In a meeting",
  away: "Out of office",
  dnd: "Do not disturb",
  free: "",
};

// Outlook and Exchange publish their free/busy value as X-MICROSOFT-CDO-BUSYSTATUS,
// which node-ical stores without the X- prefix.
function busyStatus(e: VEvent): string | undefined {
  const v = (e as Record<string, unknown>)["MICROSOFT-CDO-BUSYSTATUS"];
  return typeof v === "string" ? v.toUpperCase() : undefined;
}

// The rules:
//   cancelled, or shown as free / working elsewhere  -> ignored
//   out of office                                    -> away (all-day too)
//   anything else with a time (busy, tentative)      -> busy
//   other all-day events (birthdays, holidays)       -> ignored
export function classify(e: VEvent, isFullDay: boolean): Status | null {
  if (e.status === "CANCELLED") return null;
  const bs = busyStatus(e);
  if (bs === "OOF") return "away";
  if (bs === "FREE" || bs === "WORKINGELSEWHERE") return null;
  if (!bs && e.transparency === "TRANSPARENT") return null;
  if (isFullDay) return null;
  return "busy";
}

function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "val" in v) return String((v as { val: unknown }).val);
  return "";
}

// Offset of `timeZone` from UTC at instant `ms`, in milliseconds.
function tzOffset(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(ms));
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - ms;
}

// Midnight at the start of a calendar date in `timeZone`, as unix seconds.
export function zonedMidnight(y: number, m: number, d: number, timeZone: string): number {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffset(guess, timeZone);
  const second = guess - tzOffset(t, timeZone); // settles DST changeover days
  if (second !== t) t = second;
  return Math.floor(t / 1000);
}

// node-ical makes date-only values local midnight on the server; re-anchor them to
// the person's own time zone so an all-day event covers their whole day.
function dateOnlyToZoned(d: Date, timeZone: string): number {
  return zonedMidnight(d.getFullYear(), d.getMonth() + 1, d.getDate(), timeZone);
}

export class IcsError extends Error {}

export function eventsFromIcs(body: string, now: Date, timeZone: string): CachedEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(body.slice(0, 2048))) {
    throw new IcsError("That link didn't return a calendar (ICS) file.");
  }
  const parsed = ical.sync.parseICS(body);
  const from = new Date(now.getTime() - 3600_000);
  const to = new Date(now.getTime() + FETCH_WINDOW_DAYS * 86_400_000);
  // Pad the expansion window by a day so all-day events in far-off time zones are caught.
  const padFrom = new Date(from.getTime() - 86_400_000);
  const padTo = new Date(to.getTime() + 86_400_000);

  const out: CachedEvent[] = [];
  for (const c of Object.values(parsed)) {
    if (!c || c.type !== "VEVENT") continue;
    const ev = c as VEvent;
    if (!ev.start) continue;
    let instances;
    try {
      instances = ical.expandRecurringEvent(ev, { from: padFrom, to: padTo, expandOngoing: true });
    } catch {
      continue; // one broken event shouldn't sink the whole calendar
    }
    for (const inst of instances) {
      const status = classify(inst.event, inst.isFullDay);
      if (!status) continue;
      const start = inst.isFullDay
        ? dateOnlyToZoned(inst.start, timeZone)
        : Math.floor(inst.start.getTime() / 1000);
      const end = inst.isFullDay
        ? dateOnlyToZoned(inst.end, timeZone)
        : Math.floor(inst.end.getTime() / 1000);
      if (!(end > start)) continue;
      if (end <= from.getTime() / 1000 || start >= to.getTime() / 1000) continue;
      out.push({ start, end, status, title: text(inst.summary).trim() });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

// What the device gets: the next 24 hours, titles hidden unless asked for, and
// overlapping or back-to-back blocks of the same status joined so 32 slots go further.
export function blocksForDevice(events: CachedEvent[], now: number, showTitles: boolean): Block[] {
  const horizon = now + DEVICE_HORIZON_SEC;
  const sorted = events
    .filter((e) => e.end > now && e.start < horizon)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const out: Block[] = [];
  for (const e of sorted) {
    const label = showTitles && e.title ? e.title : HIDDEN_TITLE[e.status];
    const last = out[out.length - 1];
    if (last && last.status === e.status && e.start <= last.end) {
      if (e.end > last.end) {
        last.end = e.end;
        // A joined block shows the meeting that's on when it starts; fine for a desk light.
      }
      continue;
    }
    out.push({ start: e.start, end: e.end, status: e.status, text: clipText(label) });
  }
  return out.slice(0, MAX_BLOCKS);
}
