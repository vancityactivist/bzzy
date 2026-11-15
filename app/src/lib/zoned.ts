// Wall-clock times in a named time zone, without a date library. Shared by calendar
// parsing and working hours; safe to import anywhere (no Node-only dependencies).

// Offset of `timeZone` from UTC at instant `ms`, in milliseconds.
export function tzOffset(ms: number, timeZone: string): number {
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
  return zonedTime(y, m, d, 0, timeZone);
}

// A wall-clock time (`minutes` after midnight) on a calendar date in `timeZone`, as unix
// seconds. A time skipped by a DST change lands an hour later.
export function zonedTime(y: number, m: number, d: number, minutes: number, timeZone: string): number {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let t = guess - tzOffset(guess, timeZone);
  const second = guess - tzOffset(t, timeZone); // settles DST changeover days
  if (second !== t) t = second;
  return Math.floor(t / 1000);
}
