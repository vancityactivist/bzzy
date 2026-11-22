import "server-only";

import { and, desc, eq, gt, isNull, max, or, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";

import { db, schema } from "@/db";

import { lastActiveFromExpiry } from "./admin-stats";
import { liveSeen } from "./seen";
import { getCurrentUser } from "./session";

// Checked against the database on every request, so removing someone's admin role
// takes effect immediately rather than when their session ends.
export const isAdmin = cache(async (userId: string) => {
  const rows = await db()
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0]?.role === "admin";
});

// Non-admins get a plain 404 so the page doesn't advertise that it exists.
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !(await isAdmin(user.id))) notFound();
  return user;
}

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "user" | "admin";
  apiBlocked: boolean;
  createdAt: Date;
  providers: string[];
  passkeys: number;
  devices: number;
  lastActiveAt: Date | null;
  apiTokens: number; // live ones
};

export async function adminOverview() {
  const d = db();
  const now = new Date();
  const [users, providers, passkeys, devicesPerUser, sessions, devices, teams, tokens] = await d.batch([
    d
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        image: schema.users.image,
        role: schema.users.role,
        apiBlocked: schema.users.apiBlocked,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .orderBy(desc(schema.users.createdAt)),
    d.select({ userId: schema.accounts.userId, provider: schema.accounts.provider }).from(schema.accounts),
    d
      .select({ userId: schema.authenticators.userId, n: sql<number>`count(*)::int` })
      .from(schema.authenticators)
      .groupBy(schema.authenticators.userId),
    d
      .select({ userId: schema.devices.ownerUserId, n: sql<number>`count(*)::int` })
      .from(schema.devices)
      .groupBy(schema.devices.ownerUserId),
    d
      .select({ userId: schema.sessions.userId, latest: max(schema.sessions.expires) })
      .from(schema.sessions)
      .groupBy(schema.sessions.userId),
    d
      .select({
        id: schema.devices.id,
        name: schema.devices.name,
        ownerName: schema.users.name,
        ownerUserId: schema.devices.ownerUserId,
        lastSeenAt: schema.devices.lastSeenAt,
        createdAt: schema.devices.createdAt,
        claimId: schema.devices.claimId,
        claimRef: schema.lightClaims.ref,
        shipMode: schema.devices.shipMode,
        arrivedAt: schema.devices.arrivedAt,
      })
      .from(schema.devices)
      .innerJoin(schema.users, eq(schema.users.id, schema.devices.ownerUserId))
      .leftJoin(schema.lightClaims, eq(schema.lightClaims.id, schema.devices.claimId))
      .orderBy(desc(schema.devices.createdAt)),
    d.select({ personal: schema.teams.personal }).from(schema.teams),
    d
      .select({ userId: schema.apiTokens.userId, n: sql<number>`count(*)::int` })
      .from(schema.apiTokens)
      .where(and(isNull(schema.apiTokens.revokedAt), or(isNull(schema.apiTokens.expiresAt), gt(schema.apiTokens.expiresAt, now))))
      .groupBy(schema.apiTokens.userId),
  ]);

  const providersBy = new Map<string, Set<string>>();
  for (const r of providers) providersBy.set(r.userId, (providersBy.get(r.userId) ?? new Set()).add(r.provider));
  const passkeysBy = new Map(passkeys.map((r) => [r.userId, r.n]));
  const devicesBy = new Map(devicesPerUser.map((r) => [r.userId, r.n]));
  const sessionsBy = new Map(sessions.map((r) => [r.userId, r.latest]));
  const tokensBy = new Map(tokens.map((r) => [r.userId, r.n]));

  const userRows: AdminUserRow[] = users.map((u) => ({
    ...u,
    providers: [...(providersBy.get(u.id) ?? [])],
    passkeys: passkeysBy.get(u.id) ?? 0,
    devices: devicesBy.get(u.id) ?? 0,
    lastActiveAt: lastActiveFromExpiry(sessionsBy.get(u.id) ?? null),
    apiTokens: tokensBy.get(u.id) ?? 0,
  }));

  return {
    users: userRows,
    devices: await liveSeen(devices),
    sharedTeams: teams.filter((t) => !t.personal).length,
  };
}

// Grant or remove superadmin. Never on yourself, so the site can't end up with nobody
// able to get back in (and nobody demotes themself by accident).
export async function setSuperadmin(actorId: string, userId: string, on: boolean) {
  if (!(await isAdmin(actorId))) throw new Error("Not a superadmin");
  if (actorId === userId) throw new Error("You can't change your own superadmin role");
  await db().update(schema.users).set({ role: on ? "admin" : "user" }).where(eq(schema.users.id, userId));
}
