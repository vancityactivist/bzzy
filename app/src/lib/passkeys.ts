import "server-only";

import { and, count, eq, ne, sql } from "drizzle-orm";

import { db, schema } from "@/db";

export type Passkey = {
  credentialID: string;
  name: string;
  // Synced through iCloud Keychain, Google Password Manager, 1Password and the like,
  // rather than living on one device or security key.
  synced: boolean;
  createdAt: Date | null;
  lastUsedAt: Date | null;
};

export async function passkeysForUser(userId: string): Promise<Passkey[]> {
  const a = schema.authenticators;
  const rows = await db()
    .select({
      credentialID: a.credentialID,
      name: a.name,
      backedUp: a.credentialBackedUp,
      deviceType: a.credentialDeviceType,
      createdAt: a.createdAt,
      lastUsedAt: a.lastUsedAt,
    })
    .from(a)
    .where(eq(a.userId, userId))
    .orderBy(sql`${a.createdAt} desc nulls last`);
  return rows.map((r) => ({
    credentialID: r.credentialID,
    name: r.name ?? "Passkey",
    synced: r.backedUp || r.deviceType === "multiDevice",
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
  }));
}

export class PasskeyError extends Error {}

// Removes the passkey and the Auth.js account row it signs in through. Refuses to remove
// someone's only way back in: with no GitHub link and no other passkey they'd be locked out.
export async function revokePasskey(userId: string, credentialID: string) {
  const d = db();
  const a = schema.authenticators;
  const acc = schema.accounts;
  const [mine, others, otherLogins] = await d.batch([
    d.select({ providerAccountId: a.providerAccountId }).from(a).where(and(eq(a.userId, userId), eq(a.credentialID, credentialID))),
    d.select({ n: count() }).from(a).where(and(eq(a.userId, userId), ne(a.credentialID, credentialID))),
    d.select({ n: count() }).from(acc).where(and(eq(acc.userId, userId), ne(acc.provider, "passkey"))),
  ]);
  const passkey = mine[0];
  if (!passkey) return;
  if (others[0].n === 0 && otherLogins[0].n === 0) {
    throw new PasskeyError("This is your only way to sign in. Add another passkey or sign in with GitHub first.");
  }
  await d.batch([
    d.delete(a).where(and(eq(a.userId, userId), eq(a.credentialID, credentialID))),
    d
      .delete(acc)
      .where(and(eq(acc.userId, userId), eq(acc.provider, "passkey"), eq(acc.providerAccountId, passkey.providerAccountId))),
  ]);
}

export async function renamePasskey(userId: string, credentialID: string, name: string) {
  const a = schema.authenticators;
  await db()
    .update(a)
    .set({ name })
    .where(and(eq(a.userId, userId), eq(a.credentialID, credentialID)));
}
