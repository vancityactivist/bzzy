// Pure helpers for the admin page, kept free of the database so they can be tested.

export const SESSION_MAX_AGE_DAYS = 30; // Auth.js default

// Count signups per calendar day (in `timeZone`) for the last `days` days, oldest first.
export function signupsByDay(createdAts: Date[], now: Date, days: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    buckets.set(fmt.format(new Date(now.getTime() - i * 86_400_000)), 0);
  }
  for (const d of createdAts) {
    const key = fmt.format(d);
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + 1);
  }
  return [...buckets].map(([day, count]) => ({ day, count }));
}

// Auth.js pushes a session's expiry forward (at most once a day) while it's in use,
// so the latest expiry minus the session lifetime is roughly when they were last active.
export function lastActiveFromExpiry(latestExpiry: Date | null): Date | null {
  if (!latestExpiry) return null;
  return new Date(latestExpiry.getTime() - SESSION_MAX_AGE_DAYS * 86_400_000);
}

export function countSince(dates: Date[], now: Date, days: number) {
  const cutoff = now.getTime() - days * 86_400_000;
  return dates.filter((d) => d.getTime() >= cutoff).length;
}
