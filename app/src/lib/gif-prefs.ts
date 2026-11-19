import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

// A person's favourites and "last shown" times, by GIF choice ("builtin:<id>" or
// "asset:<id>"). Read on the GIFs and Status pages only, never on a device poll.
export type GifPref = { favourite: boolean; lastShownAt: number };

// Nice to have, never in the way: until migration 0015 has run (or if the read fails),
// pages get no favourites rather than an error.
export async function gifPrefsForUser(userId: string): Promise<Map<string, GifPref>> {
  try {
    const rows = await db().select().from(schema.gifPrefs).where(eq(schema.gifPrefs.userId, userId));
    return new Map(rows.map((r) => [r.choice, { favourite: r.favourite, lastShownAt: r.lastShownAt }]));
  } catch (err) {
    console.warn("[gif-prefs] couldn't read favourites (has migration 0015 run?)", err);
    return new Map();
  }
}

export async function setFavourite(userId: string, choice: string, favourite: boolean) {
  await db()
    .insert(schema.gifPrefs)
    .values({ userId, choice, favourite })
    .onConflictDoUpdate({ target: [schema.gifPrefs.userId, schema.gifPrefs.choice], set: { favourite } });
}

// Best effort: Show now must work even if this can't be saved.
export async function noteShown(userId: string, choice: string, at: number) {
  await db()
    .insert(schema.gifPrefs)
    .values({ userId, choice, lastShownAt: at })
    .onConflictDoUpdate({ target: [schema.gifPrefs.userId, schema.gifPrefs.choice], set: { lastShownAt: at } })
    .catch((err) => console.warn("[gif-prefs] couldn't note a shown GIF", err));
}

// When a GIF is deleted its marks go too, for everyone.
export async function forgetChoice(choice: string) {
  await db()
    .delete(schema.gifPrefs)
    .where(eq(schema.gifPrefs.choice, choice))
    .catch((err) => console.warn("[gif-prefs] couldn't forget a deleted GIF", err));
}

