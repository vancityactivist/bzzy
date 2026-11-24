// Working hours: outside them a light goes dark and polls less often (docs/protocol.md).
// Pure, so it's shared by the poll route, the preview and the tests.

import { zonedTime } from "./zoned";

// days: 0 = Sunday … 6 = Saturday. start/end: minutes after local midnight, start < end
// (no overnight shifts).
export type WorkHours = { days: number[]; start: number; end: number };
export type WorkWindow = { start: number; end: number };

export const POLL_SEC = 20;
export const OFF_HOURS_POLL_SEC = 5 * 60;
// Windows sent to the light: enough for a week offline. The light distrusts its schedule
// after 24 h anyway, but its screen should still turn on and off on time.
export const WINDOW_DAYS = 8;
export const MAX_WINDOWS = 14;

// A light's choice (device.hours_mode): its owner's hours, its own, or always on.
export const HOURS_MODES = ["owner", "own", "always"] as const;
export type HoursMode = (typeof HOURS_MODES)[number];

export const isHoursMode = (v: unknown): v is HoursMode => HOURS_MODES.includes(v as HoursMode);

// The hours a light follows; null = always on. "own" with no hours saved (shouldn't
// happen) falls back to the owner's rather than leaving the light on all night.
export function lightWorkHours(mode: string, own: unknown, ownerHours: WorkHours | null): WorkHours | null {
  if (mode === "always") return null;
  if (mode === "own") return parseWorkHours(own) ?? ownerHours;
  return ownerHours;
}

export const DEFAULT_WORK_HOURS: WorkHours = { days: [1, 2, 3, 4, 5], start: 9 * 60, end: 17 * 60 };

export function parseWorkHours(raw: unknown): WorkHours | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.days)) return null;
  const days = [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const start = Number(r.start);
  const end = Number(r.end);
  if (days.length === 0) return null;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 * 60 || start >= end) return null;
  return { days, start, end };
}

// "09:30" -> 570; null when it isn't a time.
export function parseClock(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export const formatClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Mon–Fri, 09:00–17:00", "Mon, Wed, Sat, 08:00–12:30"; "Always on" with none.
export function describeHours(hours: WorkHours | null): string {
  if (!hours) return "Always on";
  // Monday first; a run of 3+ days in a row reads as a range.
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => hours.days.includes(d));
  const pos = (d: number) => (d + 6) % 7;
  const runs: number[][] = [];
  for (const d of order) {
    const last = runs.at(-1);
    if (last && pos(d) === pos(last.at(-1)!) + 1) last.push(d);
    else runs.push([d]);
  }
  const days = runs
    .flatMap((r) => (r.length >= 3 ? [`${DAY_NAMES[r[0]]}–${DAY_NAMES[r.at(-1)!]}`] : r.map((d) => DAY_NAMES[d])))
    .join(", ");
  return `${days}, ${formatClock(hours.start)}–${formatClock(hours.end)}`;
}

// The calendar date `nowSec` falls on in `timeZone`.
function localDate(nowSec: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(
    new Date(nowSec * 1000),
  );
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: n("year"), m: n("month"), d: n("day") };
}

// The working windows that haven't ended yet, from today through the next week, oldest
// first. Empty when no hours are set.
export function workWindows(hours: WorkHours | null, timeZone: string, nowSec: number, days = WINDOW_DAYS): WorkWindow[] {
  if (!hours) return [];
  const { y, m, d } = localDate(nowSec, timeZone);
  const out: WorkWindow[] = [];
  for (let i = 0; i < days && out.length < MAX_WINDOWS; i++) {
    // Date.UTC normalises day overflow into the next month or year.
    const day = new Date(Date.UTC(y, m - 1, d + i));
    if (!hours.days.includes(day.getUTCDay())) continue;
    const [yy, mm, dd] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    const start = zonedTime(yy, mm, dd, hours.start, timeZone);
    const end = zonedTime(yy, mm, dd, hours.end, timeZone);
    if (end > nowSec) out.push({ start, end });
  }
  return out;
}

export function inWorkHours(windows: WorkWindow[], nowSec: number) {
  return windows.some((w) => w.start <= nowSec && nowSec < w.end);
}

// How long the light should wait before its next poll. Always the normal 20 s when no
// hours are set or inside them; outside them every 5 minutes, but never past the start
// of the next window, so it's quick again as the day begins.
export function pollSeconds(hours: WorkHours | null, windows: WorkWindow[], nowSec: number): number {
  if (!hours || inWorkHours(windows, nowSec)) return POLL_SEC;
  const next = windows.find((w) => w.start > nowSec);
  const untilNext = next ? next.start - nowSec : OFF_HOURS_POLL_SEC;
  return Math.max(POLL_SEC, Math.min(OFF_HOURS_POLL_SEC, untilNext));
}
