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
import { type CachedEvent, eventsFromIcs, fetchWindow } from "./ics";
import {
  basicAuth,
  CalDavAuthFailed,
  calDavCtag,
  CalDavError,
  calDavObjects,
  discoverCalDav,
  listCalDav,
} from "./caldav";
import { FetchRefused } from "./safe-fetch";

// Connected calendar accounts (Google for now; CalDAV later). Secrets are sealed with
// lib/calendar-secret.ts and only ever opened here, on the server.

export type CalendarAccountRow = typeof schema.calendarAccounts.$inferSelect;
// What pages may see: never the secret.
export type CalendarAccountInfo = Pick<
  CalendarAccountRow,
  "id" | "provider" | "label" | "state" | "lastError" | "serverUrl"
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
      serverUrl: schema.calendarAccounts.serverUrl,
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

// --- CalDAV (iCloud, Fastmail, Nextcloud, ...) ---------------------------------------

export const CALDAV_RECONNECT_MESSAGE =
  "The calendar server stopped accepting the password. Make a new app-specific password and update it here.";

function calDavAuth(account: CalendarAccountRow): string {
  const pw = openSecret(account.secret, account.keyId, account.id);
  if (!pw) throw new CalDavAuthFailed(CALDAV_RECONNECT_MESSAGE);
  return basicAuth(account.username ?? "", pw.plain);
}

// Runs a CalDAV call, marking the account for a new password if the login is refused.
async function withCalDav<T>(account: CalendarAccountRow, run: (auth: string) => Promise<T>): Promise<T> {
  try {
    return await run(calDavAuth(account));
  } catch (err) {
    if (err instanceof CalDavAuthFailed) {
      await markAccount(account, "needs_reconnect", CALDAV_RECONNECT_MESSAGE);
      throw new CalDavAuthFailed(CALDAV_RECONNECT_MESSAGE);
    }
    throw err;
  }
}

// Connects a CalDAV account: finds the calendars with this login (which also proves the
// password works), saves the account, and adds its event calendars. Every calendar
// starts on: unlike Google, CalDAV servers don't list holiday or birthday calendars.
// Connecting the same login again updates the password instead.
export async function connectCalDav(
  userId: string,
  input: { server: URL; username: string; password: string },
): Promise<CalendarAccountRow> {
  const found = await discoverCalDav(input.server, basicAuth(input.username, input.password));
  if (found.calendars.length === 0) throw new CalDavError("That account has no calendars with events.");
  const existing = await db()
    .select()
    .from(schema.calendarAccounts)
    .where(
      and(
        eq(schema.calendarAccounts.userId, userId),
        eq(schema.calendarAccounts.provider, "caldav"),
        eq(schema.calendarAccounts.externalId, found.principalUrl),
      ),
    )
    .limit(1);
  const id = existing[0]?.id ?? crypto.randomUUID();
  const values = {
    label: input.username,
    serverUrl: found.homeUrl,
    username: input.username,
    state: "ok" as const,
    lastError: null,
    ...sealSecret(input.password, id),
  };
  let row: CalendarAccountRow;
  if (existing[0]) {
    [row] = await db().update(schema.calendarAccounts).set(values).where(eq(schema.calendarAccounts.id, id)).returning();
  } else {
    [row] = await db()
      .insert(schema.calendarAccounts)
      .values({ id, userId, provider: "caldav", externalId: found.principalUrl, ...values })
      .returning();
  }
  await addCalDavCalendars(row, found.calendars);
  return row;
}

async function addCalDavCalendars(account: CalendarAccountRow, remote: { url: string; name: string }[]) {
  const local = await db().select().from(schema.calendars).where(eq(schema.calendars.accountId, account.id));
  const byExt = new Map(local.map((c) => [c.externalId, c]));
  const fresh = remote.filter((r) => !byExt.has(r.url));
  if (fresh.length > 0) {
    await db()
      .insert(schema.calendars)
      .values(
        fresh.map((r) => ({
          userId: account.userId,
          name: r.name,
          source: "caldav" as const,
          accountId: account.id,
          externalId: r.url,
          setsStatus: true,
        })),
      );
  }
  for (const r of remote) {
    const c = byExt.get(r.url);
    if (c && c.name !== r.name) await db().update(schema.calendars).set({ name: r.name }).where(eq(schema.calendars.id, c.id));
  }
  await expire(tag.user(account.userId));
}

// A new password for a CalDAV account. Checked against the server before it's saved.
export async function updateCalDavPassword(account: CalendarAccountRow, password: string): Promise<void> {
  if (account.provider !== "caldav" || !account.serverUrl) throw new CalDavError("That isn't a CalDAV account.");
  const remote = await listCalDav(new URL(account.serverUrl), basicAuth(account.username ?? "", password));
  await db()
    .update(schema.calendarAccounts)
    .set({ ...sealSecret(password, account.id), state: "ok", lastError: null })
    .where(eq(schema.calendarAccounts.id, account.id));
  await addCalDavCalendars({ ...account, state: "ok" }, remote);
}

// Whether the calendar changed since the last read is asked first (its ctag): a full read
// only happens when it did, or when the week moved on. The marker lives in the runtime
// cache; if it's lost, the calendar is simply read again.
const ctagKey = (calendarId: string) => `ctag:${calendarId}`;

export async function calDavEventsFor(
  cal: { id: string; accountId: string | null; externalId: string | null; events: CachedEvent[] },
  timeZone: string,
): Promise<CachedEvent[]> {
  const account = cal.accountId ? await accountRow(cal.accountId) : null;
  if (!account || !cal.externalId) throw new CalDavError("This calendar's account was removed.");
  if (account.state === "needs_reconnect") throw new CalDavAuthFailed(CALDAV_RECONNECT_MESSAGE);
  const url = new URL(cal.externalId);
  const window = fetchWindow(new Date(), timeZone);
  return withCalDav(account, async (auth) => {
    const ctag = await calDavCtag(url, auth).catch((err) => {
      if (err instanceof CalDavAuthFailed || err instanceof FetchRefused) throw err;
      return null; // no ctag support: just read
    });
    const marker = ctag ? `${ctag}|${window.from.toISOString()}` : null;
    if (marker && (await cacheGet<string>(ctagKey(cal.id))) === marker) return cal.events;
    const from = new Date(window.from.getTime() - 86_400_000);
    const to = new Date(window.to.getTime() + 86_400_000);
    const objects = await calDavObjects(url, auth, from, to);
    const now = new Date();
    const events = objects
      .flatMap((ics) => {
        try {
          return eventsFromIcs(ics, now, timeZone);
        } catch {
          return []; // one broken event shouldn't sink the calendar
        }
      })
      .sort((a, b) => a.start - b.start || a.end - b.end);
    if (marker) await cacheSet(ctagKey(cal.id), marker, 24 * 3600);
    return events;
  });
}
