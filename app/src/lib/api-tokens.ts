import "server-only";

import { randomBytes } from "node:crypto";

import { and, desc, eq, gt, isNull, or } from "drizzle-orm";

import { db, schema } from "@/db";

import {
  decodeScopes,
  encodeScopes,
  looksLikeApiToken,
  MAX_LIVE_TOKENS,
  type Scope,
  shouldSaveUsed,
  SHOWN_PREFIX_LEN,
  tokenExpiry,
  type TokenRecord,
  tokenUsable,
  USED_CACHE_EVERY_MS,
  USED_DB_EVERY_MS,
  newApiToken,
} from "./api-rules";
import { cacheGet, cachedRead, cacheSet, expire, tag } from "./cache";
import { hashToken } from "./device-token";

// Personal access tokens for the public API (docs/api.md). Only the SHA-256 is stored;
// the token is shown once. Checking one is a cache read, so an integration calling the
// API doesn't wake Postgres (docs/caching.md); revoking expires the token's tag.

export type AuthedToken = TokenRecord & { name: string };

const key = (hash: string) => `pat:v1:${hash}`;
const TOKEN_TTL_SEC = 3600;

export class TokenError extends Error {}

export async function createApiToken(
  userId: string,
  input: { name: string; scopes: Scope[]; expiryDays: number },
  now = new Date(),
): Promise<{ id: string; token: string }> {
  const [user] = await db().select({ apiBlocked: schema.users.apiBlocked }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) throw new TokenError("Sign in again.");
  if (user.apiBlocked) throw new TokenError("API tokens are turned off for your account.");
  const live = (await tokensForUser(userId, now)).filter((t) => t.live);
  if (live.length >= MAX_LIVE_TOKENS) throw new TokenError(`You can have ${MAX_LIVE_TOKENS} tokens at once. Revoke one you don't use first.`);

  const token = newApiToken((n) => randomBytes(n));
  const [row] = await db()
    .insert(schema.apiTokens)
    .values({
      userId,
      name: input.name,
      tokenHash: hashToken(token),
      prefix: token.slice(0, SHOWN_PREFIX_LEN),
      scopes: encodeScopes(input.scopes),
      expiresAt: tokenExpiry(input.expiryDays, now),
    })
    .returning({ id: schema.apiTokens.id });
  return { id: row.id, token };
}

export type TokenSummary = {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  live: boolean;
};

// Newest first. Revoked and expired ones are listed too (for a while), so people can see
// what stopped working.
export async function tokensForUser(userId: string, now = new Date()): Promise<TokenSummary[]> {
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await db()
    .select()
    .from(schema.apiTokens)
    .where(
      and(
        eq(schema.apiTokens.userId, userId),
        or(isNull(schema.apiTokens.revokedAt), gt(schema.apiTokens.revokedAt, monthAgo)),
        or(isNull(schema.apiTokens.expiresAt), gt(schema.apiTokens.expiresAt, monthAgo)),
      ),
    )
    .orderBy(desc(schema.apiTokens.createdAt));
  const used = await Promise.all(rows.map((r) => cacheGet<Used>(usedKey(r.id))));
  return rows.map((r, i) => {
    const cachedAt = used[i]?.at;
    const lastUsedAt = cachedAt && (!r.lastUsedAt || cachedAt > r.lastUsedAt.getTime()) ? new Date(cachedAt) : r.lastUsedAt;
    return {
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      scopes: decodeScopes(r.scopes),
      expiresAt: r.expiresAt,
      lastUsedAt,
      revokedAt: r.revokedAt,
      createdAt: r.createdAt,
      live: tokenUsable(r, now),
    };
  });
}

export async function revokeApiToken(userId: string, tokenId: string): Promise<boolean> {
  const rows = await db()
    .update(schema.apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiTokens.id, tokenId), eq(schema.apiTokens.userId, userId), isNull(schema.apiTokens.revokedAt)))
    .returning({ id: schema.apiTokens.id });
  if (rows[0]) await expire(tag.apiToken(tokenId));
  return !!rows[0];
}

// The superadmin switch: revokes every token the person has, stops new ones and stops
// their webhooks sending, or lets them make tokens again (old ones stay revoked; their
// webhooks start sending again).
export async function setApiBlocked(userId: string, blocked: boolean) {
  await db().update(schema.users).set({ apiBlocked: blocked }).where(eq(schema.users.id, userId));
  await expire(tag.webhooks(userId), tag.user(userId));
  if (!blocked) return;
  const revoked = await db()
    .update(schema.apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiTokens.userId, userId), isNull(schema.apiTokens.revokedAt)))
    .returning({ id: schema.apiTokens.id });
  await expire(...revoked.map((r) => tag.apiToken(r.id)));
}

// The token behind an Authorization header, if it's live. Unknown, revoked and expired
// tokens all give null. `loaded`: this request read the database.
export async function authenticateApiToken(token: string, now = new Date()): Promise<{ token: AuthedToken; loaded: boolean } | null> {
  if (!looksLikeApiToken(token)) return null;
  const hash = hashToken(token);
  const { value, loaded } = await cachedRead<AuthedToken & { hash: string }>(key(hash), TOKEN_TTL_SEC, async () => {
    const rows = await db().select().from(schema.apiTokens).where(eq(schema.apiTokens.tokenHash, hash)).limit(1);
    const r = rows[0];
    if (!r) return null;
    const value = {
      id: r.id,
      userId: r.userId,
      name: r.name,
      scopes: decodeScopes(r.scopes),
      expiresAt: r.expiresAt,
      revokedAt: r.revokedAt,
      hash,
    };
    return { value, tags: [tag.apiToken(r.id)] };
  });
  if (loaded) console.info(`[db] api: token read from the database (cache miss)`);
  // The hash check guards against a cache entry ever answering for the wrong key.
  if (!value || value.hash !== hash || !tokenUsable(value, now)) return null;
  const { id, userId, name, scopes, expiresAt, revokedAt } = value;
  return { token: { id, userId, name, scopes, expiresAt, revokedAt }, loaded };
}

// ---- "last used" ----

type Used = { at: number; db: number };
const usedKey = (tokenId: string) => `patused:${tokenId}`;
const USED_TTL_SEC = 30 * 86_400;

// Kept in the cache to the minute; written to the database once a day, or whenever this
// request has woken it anyway.
export async function noteTokenUsed(tokenId: string, nowMs: number, dbAwake: boolean) {
  const saved = await cacheGet<Used>(usedKey(tokenId));
  const dbAt = saved?.db ?? null;
  const writeDb = shouldSaveUsed(dbAt, nowMs, dbAwake ? USED_CACHE_EVERY_MS * 10 : USED_DB_EVERY_MS);
  if (writeDb) {
    if (!dbAwake) console.info(`[db] api: saved token last used`);
    await db().update(schema.apiTokens).set({ lastUsedAt: new Date(nowMs) }).where(eq(schema.apiTokens.id, tokenId));
  }
  if (writeDb || shouldSaveUsed(saved?.at ?? null, nowMs, USED_CACHE_EVERY_MS)) {
    await cacheSet(usedKey(tokenId), { at: nowMs, db: writeDb ? nowMs : (dbAt ?? 0) } satisfies Used, USED_TTL_SEC);
  }
}
