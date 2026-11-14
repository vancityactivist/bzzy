// Friendly times for the signed-in pages. Pure functions, safe on server and client.

const TZ = "America/Vancouver";

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then a short date. */
export function relativeTime(d: Date, now = Date.now()) {
  const mins = Math.round((now - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(mins / 1440);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return shortDate(d);
}

/** "Nov 8, 2026" */
export function shortDate(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
}

/** "Nov 8, 6:16 p.m." for tooltips. */
export function absoluteTime(d: Date) {
  return d.toLocaleString("en-CA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
}
