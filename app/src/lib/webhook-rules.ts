// Webhooks (docs/api.md), as pure functions so they can be tested without a database or
// network: events, the signature, what counts as a change worth sending, and what a
// run of failed deliveries does to a webhook.
//
// The format follows Standard Webhooks (https://www.standardwebhooks.com/): a
// webhook-id, webhook-timestamp and webhook-signature header, the signature being
// HMAC-SHA256 over "id.timestamp.body" with the webhook's whsec_ secret. Receivers can
// check it with that project's libraries instead of writing their own.

import { createHmac } from "node:crypto";

import { z } from "zod";

import { type ApiShow, type ApiStatus, randomBase62 } from "./api-rules";

// ---- events ----

export const WEBHOOK_EVENTS = ["status.changed", "show.changed", "button.pressed", "push.received"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
// "ping" isn't subscribed to: it's what "Send test" sends.
export type EventType = WebhookEvent | "ping";

export const EVENT_INFO: Record<WebhookEvent, { label: string; detail: string }> = {
  "status.changed": { label: "Status changed", detail: "From the app, a light, the API, a meeting starting or ending, or working hours" },
  "show.changed": { label: "Show now changed", detail: "Show now goes up, changes or comes down" },
  "button.pressed": { label: "Button pressed", detail: "Someone pressed the button on one of your lights" },
  "push.received": { label: "Team announcement", detail: "A team admin sent an announcement to you (or to everyone in your team)" },
};

export function encodeEvents(events: readonly WebhookEvent[]): string {
  return [...new Set(events)].sort().join(",");
}

export function decodeEvents(raw: string): WebhookEvent[] {
  return raw
    .split(",")
    .filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(e))
    .sort();
}

// ---- limits ----

export const MAX_WEBHOOKS = 10;
// Each try waits at most this long for an answer.
export const DELIVERY_TIMEOUT_MS = 5_000;
// When to try (after the change is saved): now, 2 s later, then 10 s after that.
export const RETRY_DELAYS_MS = [0, 2_000, 10_000] as const;
// A webhook that fails this many deliveries in a row turns itself off.
export const FAILURES_TO_DISABLE = 20;
// Settings shows this many recent deliveries.
export const RECENT_DELIVERIES = 20;

// ---- input ----

const url = z
  .string()
  .trim()
  .max(2000)
  .superRefine((u, ctx) => {
    const problem = checkWebhookUrl(u);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .describe("Where to send events: an https:// URL that's reachable from the internet.");

export const webhookInput = z.strictObject({
  url,
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, "Pick at least one event.")
    .describe(`Which events to send: ${WEBHOOK_EVENTS.join(", ")}.`),
  description: z.string().trim().max(100).default("").describe("What it's for, so you can tell webhooks apart."),
});
export type WebhookInput = z.infer<typeof webhookInput>;

export const webhookPatch = z.strictObject({
  url: url.optional(),
  events: webhookInput.shape.events.optional(),
  description: z.string().trim().max(100).optional().describe("What it's for."),
  enabled: z.boolean().optional().describe("false turns it off; true turns it back on (also after it turned itself off)."),
});
export type WebhookPatch = z.infer<typeof webhookPatch>;

// Why a link can't be a webhook, or null if it looks fine. Whether it points at the
// public internet is checked separately (lib/safe-fetch.ts), when it's saved and on
// every send.
export function checkWebhookUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "That doesn't look like a link.";
  }
  if (u.protocol !== "https:") return "Webhooks need an https:// link.";
  if (u.username || u.password) return "Links with a username or password in them aren't supported.";
  return null;
}

// ---- secrets and ids ----

export const SECRET_PREFIX = "whsec_";

// 32 random bytes, base64, as Standard Webhooks expects.
export function newWebhookSecret(random: (n: number) => Uint8Array): string {
  return SECRET_PREFIX + Buffer.from(random(32)).toString("base64");
}

export const newMessageId = (random: (n: number) => Uint8Array) => `msg_${randomBase62(24, random)}`;

// The webhook-signature header: "v1,<base64 HMAC-SHA256>".
export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  const key = Buffer.from(secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret, "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

// ---- bodies ----

export type Envelope = { type: EventType; timestamp: string; version: "1"; data: unknown };

export const envelope = (type: EventType, data: unknown, nowMs: number): Envelope => ({
  type,
  timestamp: new Date(nowMs).toISOString(),
  version: "1",
  data,
});

// ---- what changed ----

// What was last sent for a person, so the next check can tell whether anything changed.
// `stamp`: when the status or Show now behind it was last set (unix seconds), so a check
// working from an older copy can't undo a newer one.
export type Seen = { status: ApiStatus; show: ApiShow | null; stamp: number };

// What a person would notice: the meeting list moving on, or a push hiding Show now
// for a while, isn't a change.
const statusKey = (s: ApiStatus) => JSON.stringify([s.status, s.source, s.text, s.until, s.offHours]);
const showKey = (s: ApiShow | null) => JSON.stringify(s && [s.text, s.gif?.id ?? null, s.ring, s.until]);

// "poll": a light's poll noticed (a meeting started, a status ran out). Otherwise a
// write just changed the status and/or Show now.
export type Cause = "poll" | { status: boolean; show: boolean };

export function changesToSend(prev: Seen | null, next: Seen, cause: Cause): { status: boolean; show: boolean; save: boolean } {
  if (!prev) {
    // Nothing to compare with (a new webhook, or the cache forgot): a poll just notes
    // where things are; a write says what it changed.
    if (cause === "poll") return { status: false, show: false, save: true };
    return { status: cause.status, show: cause.show && next.show !== null, save: true };
  }
  if (cause === "poll" && next.stamp < prev.stamp) return { status: false, show: false, save: false };
  const status = statusKey(prev.status) !== statusKey(next.status);
  const show = showKey(prev.show) !== showKey(next.show);
  return { status, show, save: status || show || next.stamp > prev.stamp };
}

// ---- deliveries ----

export type Delivery = {
  at: string;
  id: string;
  type: EventType;
  ok: boolean;
  // The receiver's HTTP status, or null if it never answered.
  code: number | null;
  error: string | null;
  tries: number;
  ms: number;
};

export const deliveryOk = (code: number | null) => code !== null && code >= 200 && code < 300;

// A one-line reason a person can act on.
export function deliveryError(code: number | null, err?: unknown): string | null {
  if (deliveryOk(code)) return null;
  if (code !== null) {
    if (code >= 300 && code < 400) return `Redirected (${code}). Use the final URL.`;
    return `Answered ${code}.`;
  }
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return `No answer within ${DELIVERY_TIMEOUT_MS / 1000} s.`;
  if (err instanceof Error && err.message) return err.message.slice(0, 200);
  return "Couldn't connect.";
}
