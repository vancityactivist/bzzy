import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

import { expire, tag } from "./cache";
import { DEFAULT_LOOK, type Look } from "./look-rules";
import type { Status } from "./protocol";
import type { LedStyles, MeetingWarn } from "./ring";
import { readLabels, type StatusLabels } from "./status-labels";

export async function getLook(userId: string): Promise<Look> {
  const rows = await db()
    .select({
      defaultStatus: schema.users.defaultStatus,
      ledStyles: schema.users.ledStyles,
      meetingWarn: schema.users.meetingWarn,
      statusLabels: schema.users.statusLabels,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, statusLabels: readLabels(row.statusLabels) } : DEFAULT_LOOK;
}

export async function getLooks(userIds: string[]): Promise<Map<string, Look>> {
  const unique = [...new Set(userIds)];
  const looks = await Promise.all(unique.map((id) => getLook(id)));
  return new Map(unique.map((id, i) => [id, looks[i]]));
}

// Every light that follows this person (and the API's copy) reads it under their tag.
export async function setLookRing(userId: string, ring: { ledStyles: LedStyles | null; meetingWarn: MeetingWarn | null }) {
  await db().update(schema.users).set(ring).where(eq(schema.users.id, userId));
  await expire(tag.user(userId));
}

export async function setDefaultStatus(userId: string, defaultStatus: Status) {
  await db().update(schema.users).set({ defaultStatus }).where(eq(schema.users.id, userId));
  await expire(tag.user(userId));
}

// What they call their statuses, on every light that follows them. null: the standard words.
export async function setStatusLabels(userId: string, statusLabels: StatusLabels | null) {
  await db().update(schema.users).set({ statusLabels }).where(eq(schema.users.id, userId));
  await expire(tag.user(userId));
}
