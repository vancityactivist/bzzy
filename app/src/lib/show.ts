import "server-only";

import { and, eq, lte } from "drizzle-orm";

import { db, schema } from "@/db";

import { builtinGif, type ResolvedGif } from "./gifs";
import type { Show } from "./protocol";

// "Show now": what a person has put on their lights' screens, if anything.
export type CurrentShow = Show & { gif: ResolvedGif };

export async function getShow(userId: string): Promise<CurrentShow | null> {
  const rows = await db()
    .select({ show: schema.showNow, asset: schema.assets })
    .from(schema.showNow)
    .leftJoin(schema.assets, eq(schema.assets.id, schema.showNow.assetId))
    .where(eq(schema.showNow.userId, userId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const { show, asset } = r;
  const gif: ResolvedGif = asset
    ? { kind: "asset", id: asset.id, name: asset.name, sha: asset.sha }
    : show.builtin
      ? builtinGif(show.builtin)
      : null;
  return {
    active: show.active,
    text: show.text,
    until: show.until,
    updatedAt: show.updatedAt,
    gif,
  };
}

export async function setShow(
  userId: string,
  values: {
    assetId: string | null;
    builtin: string | null;
    text: string;
    until: number;
    updatedAt: number;
  },
) {
  const row = { active: true, ...values };
  await db()
    .insert(schema.showNow)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: schema.showNow.userId, set: row });
}

// Take it down, unless it was put up after `updatedAt` (a late button press from a
// device that was offline mustn't clear a newer one). Keeps the row, inactive, so
// devices see when it was cleared.
export async function clearShow(userId: string, updatedAt: number) {
  await db()
    .update(schema.showNow)
    .set({ active: false, updatedAt })
    .where(and(eq(schema.showNow.userId, userId), eq(schema.showNow.active, true), lte(schema.showNow.updatedAt, updatedAt)));
}

// Whether a device may download this upload because its owner is showing it now.
export async function showMayFetch(ownerUserId: string, assetId: string) {
  const rows = await db()
    .select({ blobUrl: schema.assets.blobUrl })
    .from(schema.showNow)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.showNow.assetId))
    .where(and(eq(schema.showNow.userId, ownerUserId), eq(schema.showNow.assetId, assetId)))
    .limit(1);
  return rows[0]?.blobUrl ?? null;
}
