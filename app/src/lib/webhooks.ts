import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import { db, schema } from "@/db";

import { apiSnapshot, showFrom, statusFrom } from "./api-snapshot";
import { cacheGet, cachedRead, cacheSet, expire, tag } from "./cache";
import type { AuthedDevice } from "./device-auth";
import { iso } from "./api-rules";
import { nowSeconds, type OverrideBody } from "./protocol";
import { checkPublicUrl, FetchRefused, postPublic } from "./safe-fetch";
import { seal, unseal } from "./seal";
import {
  type Cause,
  changesToSend,
  decodeEvents,
  type Delivery,
  DELIVERY_TIMEOUT_MS,
  deliveryError,
  deliveryOk,
  encodeEvents,
  envelope,
  type EventType,
  FAILURES_TO_DISABLE,
  MAX_WEBHOOKS,
  newMessageId,
  newWebhookSecret,
  RECENT_DELIVERIES,
  RETRY_DELAYS_MS,
  type Seen,
  signWebhook,
  type WebhookEvent,
  type WebhookInput,
  type WebhookPatch,
} from "./webhook-rules";

// Webhooks (docs/api.md): when a person's status, Show now or a button press changes,
// bzzy POSTs a signed JSON body to the URLs they've added.
//
// There's no queue on Vercel Hobby, so each change is sent from after() of the request
// that noticed it: a write (app, API, a press on a light) or a light's poll (a meeting
// starting, a status running out). What was last sent is kept in the runtime cache, so
// a poll that finds nothing new doesn't touch Postgres. People without webhooks cost a
// poll nothing: the poll bundle says whether there are any.

export class WebhookError extends Error {}

export type WebhookView = {
  id: string;
  url: string;
  description: string;
  events: WebhookEvent[];
  enabled: boolean;
  failures: number;
  recent: Delivery[];
  createdAt: Date;
};

type Row = typeof schema.webhooks.$inferSelect;

const view = (r: Row): WebhookView => ({
  id: r.id,
  url: r.url,
  description: r.description,
  events: decodeEvents(r.events),
  enabled: r.enabled,
  failures: r.failures,
  recent: r.recent ?? [],
  createdAt: r.createdAt,
});

// How the API shows one. `recent`: with the last deliveries (GET /webhooks/{id}).
export function webhookOut(w: WebhookView, recent = false) {
  return {
    id: w.id,
    url: w.url,
    description: w.description,
    events: w.events,
    enabled: w.enabled,
    failures: w.failures,
    createdAt: w.createdAt.toISOString(),
    lastDelivery: w.recent[0] ?? null,
    ...(recent ? { recentDeliveries: w.recent } : {}),
  };
}

// ---- managing them ----

export async function webhooksForUser(userId: string): Promise<WebhookView[]> {
  const rows = await db().select().from(schema.webhooks).where(eq(schema.webhooks.userId, userId)).orderBy(asc(schema.webhooks.createdAt));
  return rows.map(view);
}

export async function getWebhook(userId: string, id: string): Promise<WebhookView | null> {
  const rows = await db()
    .select()
    .from(schema.webhooks)
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.userId, userId)))
    .limit(1);
  return rows[0] ? view(rows[0]) : null;
}

async function checkUrl(raw: string) {
  try {
    await checkPublicUrl(new URL(raw));
  } catch (err) {
    if (err instanceof FetchRefused) throw new WebhookError(err.message);
    throw new WebhookError("That doesn't look like a link.");
  }
}

const changed = (userId: string) => expire(tag.webhooks(userId), tag.user(userId));

export async function createWebhook(userId: string, input: WebhookInput): Promise<{ webhook: WebhookView; secret: string }> {
  const [user] = await db().select({ apiBlocked: schema.users.apiBlocked }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) throw new WebhookError("Sign in again.");
  if (user.apiBlocked) throw new WebhookError("Webhooks are turned off for your account.");
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.webhooks)
    .where(eq(schema.webhooks.userId, userId));
  if (n >= MAX_WEBHOOKS) throw new WebhookError(`You can have up to ${MAX_WEBHOOKS} webhooks. Remove one first.`);
  await checkUrl(input.url);

  const secret = newWebhookSecret(randomBytes);
  const [row] = await db()
    .insert(schema.webhooks)
    .values({ userId, url: input.url, description: input.description, events: encodeEvents(input.events), secret: seal(secret) })
    .returning();
  await changed(userId);
  // Note where things stand now, so the first change after this is told apart from it.
  await remember(userId);
  return { webhook: view(row), secret };
}

export async function updateWebhook(userId: string, id: string, patch: WebhookPatch): Promise<WebhookView | null> {
  if (patch.url !== undefined) await checkUrl(patch.url);
  const set: Partial<typeof schema.webhooks.$inferInsert> = {};
  if (patch.url !== undefined) set.url = patch.url;
  if (patch.events !== undefined) set.events = encodeEvents(patch.events);
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.enabled !== undefined) {
    set.enabled = patch.enabled;
    // Turning it back on starts the count of failures again.
    if (patch.enabled) set.failures = 0;
  }
  if (Object.keys(set).length === 0) return getWebhook(userId, id);
  const rows = await db()
    .update(schema.webhooks)
    .set(set)
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.userId, userId)))
    .returning();
  if (!rows[0]) return null;
  await changed(userId);
  return view(rows[0]);
}

export async function deleteWebhook(userId: string, id: string): Promise<boolean> {
  const rows = await db()
    .delete(schema.webhooks)
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.userId, userId)))
    .returning({ id: schema.webhooks.id });
  if (rows[0]) await changed(userId);
  return !!rows[0];
}

// For the poll bundle: whether anything is listening at all.
export async function hasLiveWebhooks(userId: string): Promise<boolean> {
  return (await liveHooks(userId, true)).length > 0;
}

// ---- sending ----

type LiveHook = { id: string; userId: string; url: string; events: WebhookEvent[]; secret: string };

const hooksKey = (userId: string) => `hooks:v1:${userId}`;
const HOOKS_TTL_SEC = 3 * 3600;
// What was last sent. No tags: writes mustn't wipe it, it's what they're compared with.
const seenKey = (userId: string) => `whseen:v1:${userId}`;
const SEEN_TTL_SEC = 7 * 86_400;

async function loadHooks(userId: string) {
  const rows = await db()
    .select({ id: schema.webhooks.id, url: schema.webhooks.url, events: schema.webhooks.events, secret: schema.webhooks.secret })
    .from(schema.webhooks)
    .innerJoin(schema.users, eq(schema.users.id, schema.webhooks.userId))
    .where(and(eq(schema.webhooks.userId, userId), eq(schema.webhooks.enabled, true), eq(schema.users.apiBlocked, false)));
  return rows.map((r) => ({ ...r, userId, events: decodeEvents(r.events) }));
}

// The webhooks that are on, from the cache. `direct`: straight from the database (the
// poll bundle is loading anyway, and caches the answer itself).
async function liveHooks(userId: string, direct = false): Promise<LiveHook[]> {
  if (direct) return loadHooks(userId);
  const { value, loaded } = await cachedRead(hooksKey(userId), HOOKS_TTL_SEC, async () => ({
    value: await loadHooks(userId),
    tags: [tag.webhooks(userId)],
  }));
  if (loaded) console.info(`[db] webhooks: list for ${userId} read from the database (cache miss)`);
  return value ?? [];
}

async function seenNow(userId: string): Promise<Seen> {
  const snap = await apiSnapshot(userId);
  const now = nowSeconds();
  return {
    status: statusFrom(snap, now),
    show: showFrom(snap, now),
    stamp: Math.max(snap.presence?.updatedAt ?? 0, snap.show?.updatedAt ?? 0),
  };
}

async function remember(userId: string) {
  await cacheSet(seenKey(userId), await seenNow(userId), SEEN_TTL_SEC);
}

// Whether the status or Show now changed since it was last sent, and if so, send it.
// Called after every write that can change them, and from a light's poll (only for
// people with webhooks) to catch the changes nothing writes: meetings starting and
// ending, a status or Show now running out, working hours. Never throws.
export async function noticeChanges(userId: string, cause: Cause) {
  try {
    const hooks = (await liveHooks(userId)).filter((h) => h.events.includes("status.changed") || h.events.includes("show.changed"));
    if (hooks.length === 0) return;
    const [next, prev] = await Promise.all([seenNow(userId), cacheGet<Seen>(seenKey(userId))]);
    const c = changesToSend(prev, next, cause);
    if (c.save) await cacheSet(seenKey(userId), next, SEEN_TTL_SEC);
    await Promise.all([
      c.status && send(hooks, "status.changed", { status: next.status, previous: prev?.status ?? null }),
      c.show && send(hooks, "show.changed", { show: next.show, previous: prev?.show ?? null }),
    ]);
  } catch (err) {
    console.error(`[webhooks] checking ${userId} for changes failed`, err);
  }
}

// A press on a light that changed the status.
export async function buttonPressed(device: AuthedDevice, press: OverrideBody) {
  try {
    const hooks = await liveHooks(device.ownerUserId);
    await send(hooks, "button.pressed", {
      light: { id: device.id, name: device.name },
      // null: the press cleared the manual status, back to the calendar.
      status: press.active ? press.status : null,
      pressedAt: iso(press.updatedAt),
    });
  } catch (err) {
    console.error(`[webhooks] sending a press from ${device.id} failed`, err);
  }
}

// "Send test": a ping to one webhook, one try, so the answer can be shown straight away.
// Sent even if the webhook is off, so a fix can be checked before turning it back on.
export async function sendTest(userId: string, id: string): Promise<Delivery | null> {
  const rows = await db()
    .select()
    .from(schema.webhooks)
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.userId, userId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const hook: LiveHook = { id: r.id, userId, url: r.url, events: decodeEvents(r.events), secret: r.secret };
  return deliver(hook, "ping", { webhook: { id: r.id, url: r.url }, message: "A test from bzzy. If you can read this, it works." }, newMessageId(randomBytes), [0]);
}

async function send(hooks: LiveHook[], type: WebhookEvent, data: unknown) {
  const to = hooks.filter((h) => h.events.includes(type));
  if (to.length === 0) return;
  // One id per event, the same for every try, so a receiver can drop repeats.
  const id = newMessageId(randomBytes);
  await Promise.all(to.map((h) => deliver(h, type, data, id, RETRY_DELAYS_MS)));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function deliver(hook: LiveHook, type: EventType, data: unknown, id: string, delays: readonly number[]): Promise<Delivery> {
  const started = Date.now();
  const body = JSON.stringify(envelope(type, data, started));
  const secret = unseal(hook.secret);
  let code: number | null = null;
  let error: string | null = null;
  let tries = 0;
  if (!secret) {
    error = "Its signing secret can't be read any more. Remove it and add it again.";
  } else {
    for (const delay of delays) {
      if (delay) await sleep(delay);
      tries++;
      const timestamp = Math.floor(Date.now() / 1000);
      let err: unknown;
      try {
        code = await postPublic(
          new URL(hook.url),
          body,
          {
            "content-type": "application/json",
            "user-agent": "bzzy-webhooks/1.0 (+https://bzzy.ca/docs/api)",
            "webhook-id": id,
            "webhook-timestamp": String(timestamp),
            "webhook-signature": signWebhook(secret, id, timestamp, body),
          },
          DELIVERY_TIMEOUT_MS,
        );
      } catch (e) {
        code = null;
        err = e;
      }
      error = deliveryError(code, err);
      // Refused before sending (not a public address): trying again won't help.
      if (deliveryOk(code) || err instanceof FetchRefused) break;
    }
  }
  const d: Delivery = { at: new Date(started).toISOString(), id, type, ok: deliveryOk(code), code, error, tries, ms: Date.now() - started };
  await record(hook, d);
  return d;
}

// Saves the result: the newest first in `recent`, the count of failures in a row, and
// turning the webhook off once that reaches FAILURES_TO_DISABLE.
async function record(hook: LiveHook, d: Delivery) {
  const w = schema.webhooks;
  const recent = sql`(
    select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
    from jsonb_array_elements(jsonb_build_array(${JSON.stringify(d)}::jsonb) || ${w.recent}) with ordinality as t(e, i)
    where i <= ${RECENT_DELIVERIES}
  )`;
  try {
    const rows = await db()
      .update(w)
      .set(
        d.ok
          ? { failures: 0, recent }
          : {
              failures: sql`${w.failures} + 1`,
              enabled: sql`case when ${w.failures} + 1 >= ${FAILURES_TO_DISABLE} then false else ${w.enabled} end`,
              recent,
            },
      )
      .where(eq(w.id, hook.id))
      .returning({ enabled: w.enabled, failures: w.failures });
    console.info(`[db] webhooks: ${d.type} to ${hook.id} ${d.ok ? "delivered" : "failed"} (${d.code ?? d.error})`);
    if (rows[0] && !rows[0].enabled && rows[0].failures === FAILURES_TO_DISABLE) {
      console.warn(`[webhooks] ${hook.id} turned itself off after ${FAILURES_TO_DISABLE} failed deliveries`);
      await changed(hook.userId);
    }
  } catch (err) {
    console.error(`[webhooks] saving a delivery to ${hook.id} failed`, err);
  }
}
