import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db, schema } from "@/db";

import { cacheGet, cacheSet, expire, tag } from "./cache";
import { openSecret, sealSecret } from "./calendar-secret";
import {
  type GoogleGrant,
  GoogleAuthLost,
  GoogleError,
  listGoogleCalendars,
  listGoogleEvents,
  refreshGoogleAccess,
  revokeGoogle,
} from "./google-calendar";
import { eventsFromGoogle } from "./google-events";
import { type CachedEvent, fetchWindow } from "./ics";

// Connected calendar accounts (Google for now; CalDAV later). Secrets are sealed with
// lib/calendar-secret.ts and only ever opened here, on the server.

export type CalendarAccountRow = typeof schema.calendarAccounts.$inferSelect;
// What pages may see: never the secret.
export type CalendarAccountInfo = Pick<
  CalendarAccountRow,
  "id" | "provider" | "label" | "state" | "lastError"
>;

export const RECONNECT_MESSAGE =
  "Google access was removed. Reconnect the account to keep this calendar.";

export async function accountsForUser(
  userId: string,
): Promise<CalendarAccountInfo[]> {
  return db()
    .select({
      id: schema.calendarAccounts.id,
      provider: schema.calendarAccounts.provider,
      label: schema.calendarAccounts.label,
      state: schema.calendarAccounts.state,
      lastError: schema.calendarAccounts.lastError,
    })
    .from(schema.calendarAccounts)
    .where(eq(schema.calendarAccounts.userId, userId))
    .orderBy(asc(schema.calendarAccounts.createdAt));
}

async function accountRow(id: string): Promise<CalendarAccountRow | null> {
  const rows = await db()
    .select()
    .from(schema.calendarAccounts)
    .where(eq(schema.calendarAccounts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function ownAccount(
  userId: string,
  id: string,
): Promise<CalendarAccountRow | null> {
  const row = await accountRow(id);
  return row && row.userId === userId ? row : null;
}

// Saves a Google sign-in: a new account, or new credentials for one already connected
// (matched on Google's account id). Returns the account.
export async function saveGoogleAccount(
  userId: string,
  grant: GoogleGrant,
): Promise<CalendarAccountRow> {
  const existing = await db()
    .select()
    .from(schema.calendarAccounts)
    .where(
      and(
        eq(schema.calendarAccounts.userId, userId),
        eq(schema.calendarAccounts.provider, "google"),
        eq(schema.calendarAccounts.externalId, grant.sub),
      ),
    )
    .limit(1);
  const id = existing[0]?.id ?? crypto.randomUUID();
  const refresh =
    grant.refreshToken ??
    (existing[0]
      ? openSecret(existing[0].secret, existing[0].keyId, id)?.plain
      : null);
  if (!refresh)
    throw new GoogleError(
      "Google didn't give bzzy lasting access. Try connecting again.",
      400,
    );
  const sealed = sealSecret(refresh, id);
  const values = {
    label: grant.email,
    scopes: grant.scopes.join(" "),
    state: "ok" as const,
    lastError: null,
    ...sealed,
  };
  let row: CalendarAccountRow;
  if (existing[0]) {
    [row] = await db()
      .update(schema.calendarAccounts)
      .set(values)
      .where(eq(schema.calendarAccounts.id, id))
      .returning();
  } else {
    [row] = await db()
      .insert(schema.calendarAccounts)
      .values({
        id,
        userId,
        provider: "google",
        externalId: grant.sub,
        ...values,
      })
      .returning();
  }
  await rememberAccess(id, grant.accessToken, grant.expiresIn);
  return row;
}

// The short-lived access token lives in the runtime cache (sealed too), not the
// database: renewing it hourly shouldn't wake Postgres.
const accessKey = (accountId: string) => `gat:${accountId}`;
type CachedAccess = { secret: string; keyId: string };

async function rememberAccess(
  accountId: string,
  token: string,
  expiresIn: number,
) {
  const ttl = Math.max(60, expiresIn - 300);
  await cacheSet(
    accessKey(accountId),
    sealSecret(token, `${accountId}:access`),
    ttl,
  );
}

async function accessToken(
  account: CalendarAccountRow,
  fresh = false,
): Promise<string> {
  if (!fresh) {
    const hit = await cacheGet<CachedAccess>(accessKey(account.id));
    const open =
      hit && openSecret(hit.secret, hit.keyId, `${account.id}:access`);
    if (open) return open.plain;
  }
  const refresh = openSecret(account.secret, account.keyId, account.id);
  if (!refresh)
    throw new GoogleAuthLost(
      "The saved Google access can't be read (the key changed).",
    );
  const { accessToken: token, expiresIn } = await refreshGoogleAccess(
    refresh.plain,
  );
  if (refresh.stale) {
    await db()
      .update(schema.calendarAccounts)
      .set(sealSecret(refresh.plain, account.id))
      .where(eq(schema.calendarAccounts.id, account.id));
  }
  await rememberAccess(account.id, token, expiresIn);
  return token;
}

// Runs a Google call, renewing the access token once if Google says it's stale, and
// marking the account for reconnecting if the grant is gone.
async function withGoogle<T>(
  account: CalendarAccountRow,
  run: (token: string) => Promise<T>,
): Promise<T> {
  try {
    try {
      return await run(await accessToken(account));
    } catch (err) {
      if (!(err instanceof GoogleAuthLost)) throw err;
      return await run(await accessToken(account, true));
    }
  } catch (err) {
    if (err instanceof GoogleAuthLost) {
      await markAccount(account, "needs_reconnect", RECONNECT_MESSAGE);
      throw new GoogleAuthLost(RECONNECT_MESSAGE);
    }
    throw err;
  }
}

async function markAccount(
  account: Pick<CalendarAccountRow, "id" | "userId" | "state" | "lastError">,
  state: CalendarAccountRow["state"],
  lastError: string | null,
) {
  if (account.state === state && account.lastError === lastError) return;
  await db()
    .update(schema.calendarAccounts)
    .set({ state, lastError })
    .where(eq(schema.calendarAccounts.id, account.id));
  await expire(tag.user(account.userId));
}

// Brings the account's calendar list up to date: new calendars are added (the main one
// sets your status, the rest start off), renamed ones renamed. Calendars that vanished
// from Google are left with an error rather than deleted, so their settings survive.
export async function syncGoogleCalendarList(
  account: CalendarAccountRow,
): Promise<void> {
  const remote = await withGoogle(account, listGoogleCalendars);
  const local = await db()
    .select()
    .from(schema.calendars)
    .where(eq(schema.calendars.accountId, account.id));
  const byExt = new Map(local.map((c) => [c.externalId, c]));
  const fresh = remote.filter((r) => !byExt.has(r.id));
  if (fresh.length > 0) {
    await db()
      .insert(schema.calendars)
      .values(
        fresh.map((r) => ({
          userId: account.userId,
          name: r.summary,
          source: "google" as const,
          accountId: account.id,
          externalId: r.id,
          setsStatus: r.primary,
        })),
      );
  }
  for (const r of remote) {
    const c = byExt.get(r.id);
    if (c && c.name !== r.summary)
      await db()
        .update(schema.calendars)
        .set({ name: r.summary })
        .where(eq(schema.calendars.id, c.id));
  }
  if (account.state !== "ok") await markAccount(account, "ok", null);
  await expire(tag.user(account.userId));
}

// The next week of a Google calendar's events, for refreshCalendar.
export async function googleEventsFor(
  cal: { accountId: string | null; externalId: string | null },
  timeZone: string,
): Promise<CachedEvent[]> {
  const account = cal.accountId ? await accountRow(cal.accountId) : null;
  if (!account || !cal.externalId)
    throw new GoogleError("This calendar's Google account was removed.", 410);
  if (account.state === "needs_reconnect")
    throw new GoogleAuthLost(RECONNECT_MESSAGE);
  const window = fetchWindow(new Date(), timeZone);
  // Pad by a day so all-day events in far-off time zones are caught (as for ICS).
  const from = new Date(window.from.getTime() - 86_400_000);
  const to = new Date(window.to.getTime() + 86_400_000);
  try {
    const items = await withGoogle(account, (t) =>
      listGoogleEvents(t, cal.externalId!, from, to),
    );
    return eventsFromGoogle(items, window, timeZone);
  } catch (err) {
    if (
      err instanceof GoogleError &&
      (err.status === 404 || err.status === 403)
    ) {
      throw new GoogleError(
        "This calendar isn't shared with that Google account any more.",
        err.status,
      );
    }
    throw err;
  }
}

// Disconnect: tell Google to drop the grant, then delete the account and its calendars.
export async function removeAccount(
  account: CalendarAccountRow,
): Promise<void> {
  const refresh = openSecret(account.secret, account.keyId, account.id);
  if (account.provider === "google" && refresh)
    await revokeGoogle(refresh.plain);
  await db()
    .delete(schema.calendarAccounts)
    .where(eq(schema.calendarAccounts.id, account.id));
  await cacheSet(accessKey(account.id), null, 1);
  await expire(tag.user(account.userId));
}
