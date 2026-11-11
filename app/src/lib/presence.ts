import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

import type { Presence } from "./protocol";

export async function getPresence(userId: string): Promise<Presence | null> {
  const rows = await db().select().from(schema.presence).where(eq(schema.presence.userId, userId)).limit(1);
  const p = rows[0];
  if (!p) return null;
  return { active: p.active, status: p.status, text: p.text, until: p.until, updatedAt: p.updatedAt };
}

export async function setPresence(userId: string, p: Presence, source: string) {
  const values = { ...p, source };
  await db()
    .insert(schema.presence)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: schema.presence.userId, set: values });
}
