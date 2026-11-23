import "server-only";

import { getCache } from "@vercel/functions";

import { decode, encode } from "./cache-codec";

export { tag } from "./cache-codec";

// Vercel's runtime cache (regional, ephemeral). Off Vercel, @vercel/functions falls back
// to an in-memory cache, so local runs and tests behave the same, just per process.
//
// The cache is only ever a shortcut: every read falls back to the database, and every
// failure is treated as a miss. What it buys is that a light's 20 s poll doesn't touch
// Postgres while nothing has changed, so the database can go idle.
//
// Keys are used as they are: the library's default key hash is 32 bits, and a collision
// would hand one light another light's data (which its token check would then refuse).
const cache = () => getCache({ namespace: "bzzy", keyHashFunction: (k) => k });

// On Vercel the real runtime cache comes with the request (or, at build time, from env).
// If neither is there, @vercel/functions quietly falls back to a per-instance in-memory
// cache, where expiring a tag on one instance leaves stale copies on the others. Rather
// than risk serving a light old data for hours, skip caching there altogether.
function usable(): boolean {
  if (!process.env.VERCEL) return true; // local dev and tests: one process, in-memory is fine
  const ctx = (globalThis as Record<symbol, { get?: () => { cache?: unknown } } | undefined>)[Symbol.for("@vercel/request-context")]?.get?.();
  if (ctx?.cache) return true;
  return !!(process.env.RUNTIME_CACHE_ENDPOINT && process.env.RUNTIME_CACHE_HEADERS);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!usable()) return null;
  try {
    return decode<T>(await cache().get(key));
  } catch (err) {
    console.warn("[cache] get %s failed", key, err);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number, tags: string[] = []) {
  if (!usable()) return;
  try {
    await cache().set(key, encode(value), { ttl: ttlSeconds, tags });
  } catch (err) {
    console.warn("[cache] set %s failed", key, err);
  }
}

// Read through the cache: on a miss, load from the database and save the result.
// `null` results aren't saved, so an unknown key always asks the database.
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<{ value: T; tags: string[] } | null>,
): Promise<T | null> {
  return (await cachedRead(key, ttlSeconds, load)).value;
}

// The same, also saying whether it had to go to the database (`loaded`), so the caller
// can do other database work in the same wake instead of starting another one.
export async function cachedRead<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<{ value: T; tags: string[] } | null>,
): Promise<{ value: T | null; loaded: boolean }> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return { value: hit, loaded: false };
  const loaded = await load();
  if (!loaded) return { value: null, loaded: true };
  await cacheSet(key, loaded.value, ttlSeconds, loaded.tags);
  return { value: loaded.value, loaded: true };
}

// Call after any write that changes what a cached entry holds. Tried twice; if both fail
// the entry still runs out on its own TTL.
export async function expire(...tags: (string | null | undefined)[]) {
  const list = [...new Set(tags.filter((t): t is string => !!t))];
  if (list.length === 0 || !usable()) return;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await cache().expireTag(list);
      return;
    } catch (err) {
      if (attempt === 1) console.error(`[cache] expiring ${list.join(",")} failed`, err);
    }
  }
}
