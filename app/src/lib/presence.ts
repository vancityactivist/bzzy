import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

import { expire, tag } from "./cache";

import type { Presence } from "./protocol";

export async function getPresence(userId: string): Promise<Presence | null> {
  const rows = await db().select().from(schema.presence).where(eq(schema.presence.userId, userId)).limit(1);
  const p = rows[0];
  if (!p) return null;
  return { active: p.active, status: p.status, text: p.text, until: p.until, updatedAt: p.updatedAt };
}

// The same, with where it was last set from: a light's id, or "web"/"api".
export async function getPresenceAndSource(userId: string): Promise<{ presence: Presence | null; source: string | null }> {
  const rows = await db().select().from(schema.presence).where(eq(schema.presence.userId, userId)).limit(1);
  const p = rows[0];
  if (!p) return { presence: null, source: null };
  return { presence: { active: p.active, status: p.status, text: p.text, until: p.until, updatedAt: p.updatedAt }, source: p.source };
}

export async function setPresence(userId: string, p: Presence, source: string) {
  const values = { ...p, source };
  await db()
    .insert(schema.presence)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: schema.presence.userId, set: values });
  await expire(tag.user(userId));
}
