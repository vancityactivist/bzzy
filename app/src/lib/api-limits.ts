import "server-only";

import { LIMITS, type LimitKind, rateWindow } from "./api-rules";
import { cacheGet, cacheSet } from "./cache";

// Per-minute request counts for the public API, kept in the runtime cache so counting
// never touches Postgres. A read then a write, not an atomic increment, so two requests
// at the same moment can both count as one: the limits are approximate, which is fine
// for stopping a runaway script. A cache failure lets the request through.

export type LimitResult = { ok: boolean; limit: number; remaining: number; resetSec: number };

const key = (kind: LimitKind, who: string, windowId: number) => `rl:${kind}:${who}:${windowId}`;

export async function takeLimit(kind: LimitKind, who: string, nowMs = Date.now()): Promise<LimitResult> {
  const limit = LIMITS[kind];
  const { id, resetSec } = rateWindow(nowMs);
  const k = key(kind, who, id);
  const used = (await cacheGet<number>(k)) ?? 0;
  if (used >= limit) return { ok: false, limit, remaining: 0, resetSec };
  await cacheSet(k, used + 1, resetSec + 5);
  return { ok: true, limit, remaining: Math.max(0, limit - used - 1), resetSec };
}

// For failed sign-ins: whether this address is already over its limit, without counting.
export async function overLimit(kind: LimitKind, who: string, nowMs = Date.now()): Promise<LimitResult | null> {
  const limit = LIMITS[kind];
  const { id, resetSec } = rateWindow(nowMs);
  const used = (await cacheGet<number>(key(kind, who, id))) ?? 0;
  return used >= limit ? { ok: false, limit, remaining: 0, resetSec } : null;
}
