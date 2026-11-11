import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";

export type TeamRole = (typeof schema.teamRole.enumValues)[number];

export async function ensurePersonalTeam(userId: string, displayName: string) {
  const existing = await db()
    .select({ teamId: schema.teams.id })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teams.personal, true)))
    .limit(1);
  if (existing[0]) return existing[0].teamId;

  const teamId = crypto.randomUUID();
  // neon-http has no transactions; batch runs both inserts in one round trip,
  // and the team row is harmless on its own if the second insert ever failed.
  await db().batch([
    db().insert(schema.teams).values({ id: teamId, name: `${displayName}'s team`, personal: true }),
    db().insert(schema.teamMembers).values({ teamId, userId, role: "owner" }),
  ]);
  return teamId;
}

export async function teamsForUser(userId: string) {
  return db()
    .select({
      id: schema.teams.id,
      name: schema.teams.name,
      personal: schema.teams.personal,
      role: schema.teamMembers.role,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .where(eq(schema.teamMembers.userId, userId));
}

export async function roleInTeam(userId: string, teamId: string): Promise<TeamRole | null> {
  const rows = await db()
    .select({ role: schema.teamMembers.role })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.teamId, teamId)))
    .limit(1);
  return rows[0]?.role ?? null;
}
