// Turning an ICS feed into status blocks. Pure functions (no network, no database)
// so the rules can be tested against sample feeds.

import ical, { type VEvent } from "node-ical";

import { type Block, clipText, MAX_BLOCKS, type Status } from "./protocol";
import { tzOffset, zonedMidnight } from "./zoned";

export { zonedMidnight };

// What we keep from a feed between fetches: the next week, already expanded.
// `uid` is the event's iCalendar UID, used to show a meeting that arrives from two
// calendars only once. Rows saved before it existed don't have it.
export type CachedEvent = {
  start: number;
  end: number;
  status: Status;
  title: string;
  uid?: string;
};

export const FETCH_WINDOW_DAYS = 7;
export const DEVICE_HORIZON_SEC = 24 * 3600;

// "In a meeting" and "Out of office" say what the event is. A hidden do-not-disturb event
// (a Focus calendar) has no text, so the light shows the status's own name for it, which
// people can change (lib/status-labels.ts).
const HIDDEN_TITLE: Record<Status, string> = {
  busy: "In a meeting",
  away: "Out of office",
  dnd: "",
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
  if (v && typeof v === "object" && "val" in v)
    return String((v as { val: unknown }).val);
  return "";
}

// node-ical makes date-only values local midnight on the server; re-anchor them to
// the person's own time zone so an all-day event covers their whole day.
function dateOnlyToZoned(d: Date, timeZone: string): number {
  return zonedMidnight(
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    timeZone,
  );
}

export class IcsError extends Error {}

// The span of events kept from a feed: from the person's midnight (of the day an hour
// ago) for FETCH_WINDOW_DAYS + 1 days, so it always covers the next week. It moves once a
// day rather than with the clock: a sliding window would change the saved events every
// time a meeting aged out or a new one crossed the 7-day edge, and each of those saves
// wakes the database even though the feed itself didn't change (docs/caching.md).
export function fetchWindow(
  now: Date,
  timeZone: string,
): { from: Date; to: Date } {
  const anchor = now.getTime() - 3600_000;
  const local = new Date(anchor + tzOffset(anchor, timeZone));
  const midnight = zonedMidnight(
    local.getUTCFullYear(),
    local.getUTCMonth() + 1,
    local.getUTCDate(),
    timeZone,
  );
  const from = new Date(midnight * 1000);
  return {
    from,
    to: new Date(from.getTime() + (FETCH_WINDOW_DAYS + 1) * 86_400_000),
  };
}

export function eventsFromIcs(
  body: string,
  now: Date,
  timeZone: string,
): CachedEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(body.slice(0, 2048))) {
    throw new IcsError("That link didn't return a calendar (ICS) file.");
  }
  const parsed = ical.sync.parseICS(body);
  const { from, to } = fetchWindow(now, timeZone);
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
      instances = ical.expandRecurringEvent(ev, {
        from: padFrom,
        to: padTo,
        expandOngoing: true,
      });
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
      if (end <= from.getTime() / 1000 || start >= to.getTime() / 1000)
        continue;
      const uid = text(inst.event.uid ?? ev.uid).trim();
      out.push({
        start,
        end,
        status,
        title: text(inst.summary).trim(),
        ...(uid ? { uid } : {}),
      });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

// When events overlap, the strongest status wins: someone who's out of office is away
// even if a meeting is still on their calendar, and focus time beats a meeting.
const RANK: Record<Status, number> = { away: 3, dnd: 2, busy: 1, free: 0 };

// One calendar's events, in priority order (the first source is the highest), with
// whether it shows titles and how its events count ("auto" = each event's own status).
export type ScheduleSource = {
  events: readonly CachedEvent[];
  showTitles: boolean;
  countsAs?: "auto" | "busy" | "dnd" | "away";
  id?: string;
};

type Labelled = CachedEvent & { label: string; prio: number; source?: string };

// The same meeting can arrive from two calendars (an invite on work and personal, or an
// ICS link next to the connected account). Same UID and same start = one event; the
// stronger status is kept, and a real title beats a hidden one.
function dedupe(events: Labelled[]): Labelled[] {
  const seen = new Map<string, number>();
  const out: Labelled[] = [];
  for (const e of events) {
    if (!e.uid) {
      out.push(e);
      continue;
    }
    const key = `${e.uid}@${e.start}`;
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, out.length);
      out.push(e);
      continue;
    }
    const kept = out[at];
    const stronger = RANK[e.status] > RANK[kept.status];
    const sameButTitled =
      RANK[e.status] === RANK[kept.status] &&
      e.label !== HIDDEN_TITLE[e.status] &&
      kept.label === HIDDEN_TITLE[kept.status];
    if (stronger || sameButTitled)
      out[at] = { ...e, end: Math.max(e.end, kept.end) };
    else if (e.end > kept.end) out[at] = { ...kept, end: e.end };
  }
  return out;
}

// A block plus the calendar that decided it (for the Calendars page).
export type ExplainedBlock = Block & { calendarId?: string };

// The merged schedule: the next 24 hours, titles hidden unless that calendar shows them.
// Where events overlap, the strongest status wins (away, then do not disturb, then busy);
// between equals the higher calendar wins, then the one that started first. Touching
// blocks with the same status and text are joined so 32 slots go further.
export function explainSchedule(
  sources: readonly ScheduleSource[],
  now: number,
): ExplainedBlock[] {
  const horizon = now + DEVICE_HORIZON_SEC;
  const events = dedupe(
    sources.flatMap((s, prio) =>
      s.events
        .filter((e) => e.end > now && e.start < horizon && RANK[e.status] > 0)
        .map((e) => {
          const status = s.countsAs && s.countsAs !== "auto" ? s.countsAs : e.status;
          return {
            ...e,
            status,
            prio,
            source: s.id,
            label: s.showTitles && e.title ? e.title : HIDDEN_TITLE[status],
          };
        }),
    ),
  ).sort((a, b) => a.start - b.start || a.end - b.end);

  const cuts = [...new Set(events.flatMap((e) => [e.start, e.end]))].sort(
    (a, b) => a - b,
  );
  const out: ExplainedBlock[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i];
    const to = cuts[i + 1];
    let win: Labelled | undefined;
    for (const e of events) {
      if (e.start > from) break;
      if (e.end <= from) continue;
      if (
        !win ||
        RANK[e.status] > RANK[win.status] ||
        (RANK[e.status] === RANK[win.status] && e.prio < win.prio)
      )
        win = e;
    }
    if (!win) continue;
    const text = clipText(win.label);
    const last = out[out.length - 1];
    if (last && last.status === win.status && last.text === text && last.end >= from) {
      last.end = to;
      continue;
    }
    out.push({ start: from, end: to, status: win.status, text, calendarId: win.source });
  }
  return out.slice(0, MAX_BLOCKS);
}

// What the device gets (no calendar ids).
export function mergeSchedule(
  sources: readonly ScheduleSource[],
  now: number,
): Block[] {
  return explainSchedule(sources, now).map(({ start, end, status, text }) => ({ start, end, status, text }));
}

// One calendar on its own (the Settings preview).
export function blocksForDevice(
  events: CachedEvent[],
  now: number,
  showTitles: boolean,
): Block[] {
  return mergeSchedule([{ events, showTitles }], now);
}
