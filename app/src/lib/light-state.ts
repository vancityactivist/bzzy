import "server-only";

import { and, eq, lte } from "drizzle-orm";

import { db, schema } from "@/db";

import { expire, tag } from "./cache";
import type { Presence } from "./protocol";
import type { LedStyle } from "./push-rules";
import { type CurrentShow, currentShow } from "./show";

// The status and Show now of a light that doesn't follow its owner (device.follows_owner
// off): a boardroom or a shared door. Same shapes and rules as presence and show_now, kept
// per light. Each write expires the light's tag, so its next poll reads it fresh.

export async function getLightStatus(deviceId: string): Promise<{ presence: Presence | null; source: string | null }> {
  const rows = await db().select().from(schema.lightStatus).where(eq(schema.lightStatus.deviceId, deviceId)).limit(1);
  const p = rows[0];
  if (!p) return { presence: null, source: null };
  return { presence: { active: p.active, status: p.status, text: p.text, until: p.until, updatedAt: p.updatedAt }, source: p.source };
}

export async function setLightStatus(deviceId: string, p: Presence, source: string) {
  const values = { ...p, source };
  await db()
    .insert(schema.lightStatus)
    .values({ deviceId, ...values })
    .onConflictDoUpdate({ target: schema.lightStatus.deviceId, set: values });
  await expire(tag.device(deviceId));
}

export async function getLightShow(deviceId: string): Promise<CurrentShow | null> {
  const rows = await db()
    .select({ show: schema.lightShow, asset: schema.assets })
    .from(schema.lightShow)
    .leftJoin(schema.assets, eq(schema.assets.id, schema.lightShow.assetId))
    .where(eq(schema.lightShow.deviceId, deviceId))
    .limit(1);
  const r = rows[0];
  return r ? currentShow(r.show, r.asset) : null;
}

export async function setLightShow(
  deviceId: string,
  values: { assetId: string | null; builtin: string | null; text: string; leds: LedStyle | null; until: number; updatedAt: number },
) {
  const row = { active: true, ...values };
  await db()
    .insert(schema.lightShow)
    .values({ deviceId, ...row })
    .onConflictDoUpdate({ target: schema.lightShow.deviceId, set: row });
  await expire(tag.device(deviceId));
}

// Like clearShow: a late press from before it went up doesn't take it down.
export async function clearLightShow(deviceId: string, updatedAt: number) {
  await db()
    .update(schema.lightShow)
    .set({ active: false, updatedAt })
    .where(and(eq(schema.lightShow.deviceId, deviceId), eq(schema.lightShow.active, true), lte(schema.lightShow.updatedAt, updatedAt)));
  await expire(tag.device(deviceId));
}

// Whether the light may download this upload because it's showing it now.
export async function lightShowMayFetch(deviceId: string, assetId: string) {
  const rows = await db()
    .select({ blobUrl: schema.assets.blobUrl })
    .from(schema.lightShow)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.lightShow.assetId))
    .where(and(eq(schema.lightShow.deviceId, deviceId), eq(schema.lightShow.assetId, assetId)))
    .limit(1);
  return rows[0]?.blobUrl ?? null;
}
