// The public API (/api/v1, docs/api.md), as pure functions so it can be tested without
// a database: token format, scopes, request bodies, rate-limit windows, and how the
// person's status is described. Times are ISO 8601 in UTC on the wire and unix seconds
// inside, like the device protocol.

import { z } from "zod";

import { ledStyle } from "./push-rules";
import { type Block, clipText, type Presence, STATUSES, type Status } from "./protocol";
import { resolveScreen } from "./screen";

// ---- tokens ----

export const TOKEN_PREFIX = "bzzy_pat_";
// Base62 keeps the token one double-clickable word. 43 symbols is ~256 bits.
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const TOKEN_BODY_LEN = 43;
// How much of the token Settings shows, to tell tokens apart: "bzzy_pat_Ab3x".
export const SHOWN_PREFIX_LEN = TOKEN_PREFIX.length + 4;
export const MAX_LIVE_TOKENS = 20;

// `random(n)` gives n random bytes (crypto.randomBytes in the app). Bytes of 248 and up
// are skipped so every symbol is equally likely (248 = 4 × 62).
export function newApiToken(random: (n: number) => Uint8Array): string {
  let body = "";
  while (body.length < TOKEN_BODY_LEN) {
    for (const b of random(64)) {
      if (b >= 248) continue;
      body += BASE62[b % 62];
      if (body.length === TOKEN_BODY_LEN) break;
    }
  }
  return TOKEN_PREFIX + body;
}

// Whether a string could be one of our tokens at all, so junk never reaches the cache
// or the database.
export function looksLikeApiToken(token: string): boolean {
  return token.length === TOKEN_PREFIX.length + TOKEN_BODY_LEN && token.startsWith(TOKEN_PREFIX) && /^[0-9A-Za-z]+$/.test(token.slice(TOKEN_PREFIX.length));
}

// ---- scopes ----

// What a token may do. Later phases add "webhooks" and "push" (docs/api.md).
export const SCOPES = ["read", "status", "show"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_INFO: Record<Scope, { label: string; detail: string }> = {
  read: { label: "Read", detail: "See your status, Show now and what your lights are showing" },
  status: { label: "Status", detail: "Set and clear your status" },
  show: { label: "Show now", detail: "Put a message or GIF on your lights and take it down" },
};

export const DEFAULT_SCOPES: Scope[] = ["read", "status", "show"];

export function encodeScopes(scopes: readonly Scope[]): string {
  return [...new Set(scopes)].sort().join(",");
}

export function decodeScopes(raw: string): Scope[] {
  return raw
    .split(",")
    .filter((s): s is Scope => (SCOPES as readonly string[]).includes(s))
    .sort();
}

// Days; 0 = never.
export const TOKEN_EXPIRY_DAYS = [30, 90, 365, 0] as const;
export const DEFAULT_EXPIRY_DAYS = 365;
// Settings warns this long before a token runs out.
export const EXPIRY_WARNING_DAYS = 14;

export const newTokenInput = z.object({
  name: z.string().trim().min(1, "Give the token a name.").max(60, "Keep the name under 60 characters."),
  scopes: z.array(z.enum(SCOPES)).min(1, "Pick at least one thing it can do."),
  expiryDays: z.coerce
    .number()
    .int()
    .refine((d) => (TOKEN_EXPIRY_DAYS as readonly number[]).includes(d), "Pick an expiry."),
});

export function tokenExpiry(expiryDays: number, now: Date): Date | null {
  return expiryDays > 0 ? new Date(now.getTime() + expiryDays * 86_400_000) : null;
}

export type TokenRecord = {
  id: string;
  userId: string;
  scopes: Scope[];
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export function tokenUsable(t: Pick<TokenRecord, "expiresAt" | "revokedAt">, now: Date): boolean {
  return !t.revokedAt && (!t.expiresAt || t.expiresAt.getTime() > now.getTime());
}

// ---- "last used" ----

// The cache keeps "last used" to the minute; the database only every day, or sooner
// when the request is writing anyway (so it never wakes Postgres just for this).
export const USED_CACHE_EVERY_MS = 60_000;
export const USED_DB_EVERY_MS = 24 * 3600_000;

export function shouldSaveUsed(saved: number | null, nowMs: number, everyMs: number): boolean {
  return saved === null || nowMs - saved >= everyMs;
}

// ---- rate limits ----

export type LimitKind = "read" | "write" | "badAuth";

// Requests per minute. Reads and writes count per token; failed sign-ins per address.
export const LIMITS: Record<LimitKind, number> = { read: 60, write: 20, badAuth: 30 };
export const WINDOW_MS = 60_000;

export function rateWindow(nowMs: number): { id: number; resetSec: number } {
  const id = Math.floor(nowMs / WINDOW_MS);
  return { id, resetSec: Math.max(1, Math.ceil(((id + 1) * WINDOW_MS - nowMs) / 1000)) };
}

// ---- times ----

// Status and Show now can't be set further ahead than this, so a forgotten script can't
// leave someone on Do not disturb for a month.
export const MAX_AHEAD_SEC = 7 * 86_400;

export const iso = (sec: number): string | null => (sec > 0 ? new Date(sec * 1000).toISOString() : null);

// `minutes` or `until` (ISO 8601, with an offset), or neither for "until cleared".
const endFields = {
  minutes: z
    .number()
    .int()
    .min(1)
    .max(MAX_AHEAD_SEC / 60)
    .optional(),
  until: z.iso.datetime({ offset: true }).optional(),
};

type EndInput = { minutes?: number; until?: string };

// Unix seconds, 0 for "until cleared", or an error message.
export function endTime(input: EndInput, now: number): { ok: true; until: number } | { ok: false; field: string; message: string } {
  if (input.minutes !== undefined && input.until !== undefined)
    return { ok: false, field: "until", message: "Send minutes or until, not both." };
  if (input.minutes !== undefined) return { ok: true, until: now + input.minutes * 60 };
  if (input.until !== undefined) {
    const until = Math.floor(Date.parse(input.until) / 1000);
    if (!(until > now)) return { ok: false, field: "until", message: "until must be in the future." };
    if (until - now > MAX_AHEAD_SEC) return { ok: false, field: "until", message: "until can be at most 7 days ahead." };
    return { ok: true, until };
  }
  return { ok: true, until: 0 };
}

// ---- request bodies ----

// Text is cut to what the light's screen holds (47 bytes), and the response says what
// was kept.
const text = z.string().max(200).default("");

export const statusBody = z.strictObject({
  status: z.enum(STATUSES),
  text,
  ...endFields,
});
export type StatusBody = z.infer<typeof statusBody>;

export const showBody = z.strictObject({
  text,
  // "builtin:<id>" or "asset:<id>", as GET /v1/gifs lists them. null or left out: no GIF.
  gif: z.string().max(100).nullable().default(null),
  // How the ring moves while it's up. null or left out: the status's own style.
  ring: ledStyle.nullable().default(null),
  ...endFields,
});
export type ShowBody = z.infer<typeof showBody>;

export const cleanText = (t: string) => clipText(t.trim());

// Whether setting this status would change nothing, so the call can skip the write. A
// Stream Deck or Home Assistant often sends the same state again every minute.
export function sameStatus(current: Presence | null, next: { status: Status; text: string; until: number }, now: number): boolean {
  if (!current?.active) return false;
  if (current.until !== 0 && current.until <= now) return false;
  return current.status === next.status && current.text === next.text && current.until === next.until;
}

// ---- how the status is described ----

export type ApiSource = "manual" | "calendar" | "default";

export type ApiStatus = {
  status: Status;
  source: ApiSource;
  text: string;
  // When this status ends (manual expiry or the meeting's end); null = no end known.
  until: string | null;
  manual: { status: Status; text: string; until: string | null; setAt: string | null; setBy: string } | null;
  meeting: { status: Status; text: string; start: string; end: string } | null;
  next: { status: Status; text: string; start: string; end: string } | null;
  // Outside the person's working hours, when their lights go dark.
  offHours: boolean;
};

// "web", a light's id, or "api:<token name>": what the person would recognise.
export function describeSource(source: string | null | undefined): string {
  if (!source || source === "web") return "app";
  if (source.startsWith("api:")) return source;
  return "light";
}

export function apiStatus(opts: {
  now: number;
  defaultStatus: Status;
  presence: Presence | null;
  presenceSource: string | null;
  schedule: Block[];
  offHours: boolean;
}): ApiStatus {
  const { now, presence, schedule } = opts;
  const r = resolveScreen({ now, defaultStatus: opts.defaultStatus, presence, schedule });
  const live = presence?.active && (presence.until === 0 || presence.until > now) ? presence : null;
  const block = (b: Block) => ({ status: b.status, text: b.text, start: iso(b.start)!, end: iso(b.end)! });
  const current = schedule.find((b) => b.start <= now && now < b.end);
  const next = schedule.filter((b) => b.start > now).sort((a, b) => a.start - b.start)[0];
  return {
    status: r.status,
    source: r.source,
    text: r.text,
    until: iso(r.until),
    manual: live
      ? { status: live.status, text: live.text, until: iso(live.until), setAt: iso(live.updatedAt), setBy: describeSource(opts.presenceSource) }
      : null,
    meeting: current ? block(current) : null,
    next: next ? block(next) : null,
    offHours: opts.offHours,
  };
}
