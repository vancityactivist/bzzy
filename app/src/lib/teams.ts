import "server-only";

import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { db, schema } from "@/db";

import { hashToken, newDeviceToken } from "./device-token";
import {
  type AssignableRole,
  can,
  canRemove,
  cleanTeamName,
  inviteAllowed,
  inviteState,
  type InviteState,
  type TeamAccess,
  type TeamAction,
  type TeamRole,
} from "./team-rules";

export type { TeamRole } from "./team-rules";

export class TeamError extends Error {}

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

// Real (shared) teams only, with how many people are in each.
export async function sharedTeamsForUser(userId: string) {
  const mine = await db()
    .select({ id: schema.teams.id, name: schema.teams.name, role: schema.teamMembers.role })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teams.personal, false)))
    .orderBy(schema.teams.name);
  if (mine.length === 0) return [];
  const counts = await db()
    .select({ teamId: schema.teamMembers.teamId, n: sql<number>`count(*)::int` })
    .from(schema.teamMembers)
    .where(inArray(schema.teamMembers.teamId, mine.map((t) => t.id)))
    .groupBy(schema.teamMembers.teamId);
  const n = new Map(counts.map((c) => [c.teamId, c.n]));
  return mine.map((t) => ({ ...t, members: n.get(t.id) ?? 0 }));
}

export async function roleInTeam(userId: string, teamId: string): Promise<TeamRole | null> {
  const rows = await db()
    .select({ role: schema.teamMembers.role })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.teamId, teamId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

// ---- access ----

// The site-wide superadmin is user.role = "admin". Read here rather than from
// lib/admin, which imports the session and so (through auth.ts) this file.
async function isSuperadmin(userId: string) {
  const rows = await db().select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return rows[0]?.role === "admin";
}

type SharedTeam = { id: string; name: string; createdAt: Date };

// The team and what this person may do in it. Null for personal teams and teams
// they can't see, so pages can answer with a plain 404.
export async function teamAccess(userId: string, teamId: string): Promise<{ team: SharedTeam; access: TeamAccess } | null> {
  const [teamRows, role, superadmin] = await Promise.all([
    db().select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1),
    roleInTeam(userId, teamId),
    isSuperadmin(userId),
  ]);
  const team = teamRows[0];
  if (!team || team.personal) return null;
  const access = { role, superadmin };
  if (!can(access, "view")) return null;
  return { team: { id: team.id, name: team.name, createdAt: team.createdAt }, access };
}

async function requireTeam(userId: string, teamId: string, action: TeamAction) {
  const t = await teamAccess(userId, teamId);
  if (!t || !can(t.access, action)) throw new TeamError("You can't do that in this team.");
  // Logged as a superadmin action when their team role alone wouldn't allow it.
  const asSuperadmin = t.access.superadmin && !can({ role: t.access.role, superadmin: false }, action);
  return { ...t, asSuperadmin };
}

function audit(teamId: string, actorUserId: string, action: string, detail: Record<string, unknown> = {}, asSuperadmin = false) {
  return db().insert(schema.teamAudit).values({ teamId, actorUserId, action, detail, asSuperadmin });
}

// ---- create, rename, delete ----

export async function createTeam(userId: string, rawName: string) {
  const name = cleanTeamName(rawName);
  if (!name) throw new TeamError("Give the team a name (at least 2 characters).");
  const teamId = crypto.randomUUID();
  await db().batch([
    db().insert(schema.teams).values({ id: teamId, name, personal: false }),
    db().insert(schema.teamMembers).values({ teamId, userId, role: "owner" }),
    db().insert(schema.teamAudit).values({ teamId, actorUserId: userId, action: "created", detail: { name } }),
  ]);
  await adoptPushTeam(userId, teamId);
  return teamId;
}

export async function renameTeam(userId: string, teamId: string, rawName: string) {
  const { asSuperadmin, team } = await requireTeam(userId, teamId, "owner");
  const name = cleanTeamName(rawName);
  if (!name) throw new TeamError("Give the team a name (at least 2 characters).");
  await db().batch([
    db().update(schema.teams).set({ name }).where(eq(schema.teams.id, teamId)),
    audit(teamId, userId, "renamed", { from: team.name, to: name }, asSuperadmin),
  ]);
}

// Cascades to memberships, invites and the audit log; lights that followed its
// pushes go back to none (the foreign key sets them null).
export async function deleteTeam(userId: string, teamId: string) {
  await requireTeam(userId, teamId, "owner");
  await db().delete(schema.teams).where(and(eq(schema.teams.id, teamId), eq(schema.teams.personal, false)));
}

// ---- members ----

export type TeamMemberRow = {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: TeamRole;
  joinedAt: Date;
};

export async function teamMembers(teamId: string): Promise<TeamMemberRow[]> {
  const rows = await db()
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      image: schema.users.image,
      role: schema.teamMembers.role,
      joinedAt: schema.teamMembers.createdAt,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
    .where(eq(schema.teamMembers.teamId, teamId));
  const rank = { owner: 0, admin: 1, member: 2 };
  return rows.sort((a, b) => rank[a.role] - rank[b.role] || (a.name ?? "").localeCompare(b.name ?? ""));
}

export async function removeMember(userId: string, teamId: string, targetUserId: string) {
  const self = userId === targetUserId;
  const t = await requireTeam(userId, teamId, self ? "view" : "manage");
  const target = await roleInTeam(targetUserId, teamId);
  if (!target) return;
  if (!canRemove(t.access, target, self)) {
    throw new TeamError(target === "owner" ? "The owner can't leave. Transfer ownership or delete the team." : "You can't remove that person.");
  }
  await db().batch([
    db().delete(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, targetUserId))),
    // Their lights stop following this team's pushes.
    db()
      .update(schema.devices)
      .set({ pushTeamId: null })
      .where(and(eq(schema.devices.ownerUserId, targetUserId), eq(schema.devices.pushTeamId, teamId))),
    audit(teamId, userId, self ? "left" : "removed", { userId: targetUserId }, t.asSuperadmin),
  ]);
}

export async function setMemberRole(userId: string, teamId: string, targetUserId: string, role: AssignableRole) {
  const t = await requireTeam(userId, teamId, "setRoles");
  const current = await roleInTeam(targetUserId, teamId);
  if (!current) throw new TeamError("They aren't in this team.");
  if (current === "owner") throw new TeamError("Transfer ownership to change the owner's role.");
  if (current === role) return;
  await db().batch([
    db()
      .update(schema.teamMembers)
      .set({ role })
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, targetUserId))),
    audit(teamId, userId, "role", { userId: targetUserId, from: current, to: role }, t.asSuperadmin),
  ]);
}

// The old owner becomes an admin.
export async function transferOwnership(userId: string, teamId: string, newOwnerId: string) {
  const t = await requireTeam(userId, teamId, "owner");
  const target = await roleInTeam(newOwnerId, teamId);
  if (!target) throw new TeamError("They aren't in this team.");
  if (target === "owner") return;
  const m = schema.teamMembers;
  await db().batch([
    db().update(m).set({ role: "admin" }).where(and(eq(m.teamId, teamId), eq(m.role, "owner"))),
    db().update(m).set({ role: "owner" }).where(and(eq(m.teamId, teamId), eq(m.userId, newOwnerId))),
    audit(teamId, userId, "transferred", { to: newOwnerId }, t.asSuperadmin),
  ]);
}

// ---- invites ----

export type InviteSummary = {
  id: string;
  kind: "team" | "single";
  role: TeamRole;
  uses: number;
  expiresAt: Date;
  createdAt: Date;
  createdByName: string | null;
  state: InviteState;
};

// Live links, plus ones that ended in the last week so admins can see what happened.
export async function teamInvites(teamId: string, now = new Date()): Promise<InviteSummary[]> {
  const i = schema.teamInvites;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await db()
    .select({ invite: i, createdByName: schema.users.name })
    .from(i)
    .leftJoin(schema.users, eq(schema.users.id, i.createdBy))
    .where(and(eq(i.teamId, teamId), gt(i.expiresAt, weekAgo)))
    .orderBy(desc(i.createdAt));
  return rows
    .map(({ invite, createdByName }) => ({
      id: invite.id,
      kind: invite.kind,
      role: invite.role,
      uses: invite.uses,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      createdByName,
      state: inviteState(invite, now),
    }))
    .sort((a, b) => Number(b.state === "live") - Number(a.state === "live"));
}

// Returns the token, which is shown once.
export async function createInvite(
  userId: string,
  teamId: string,
  { kind, role, days }: { kind: "team" | "single"; role: AssignableRole; days: number },
) {
  const t = await requireTeam(userId, teamId, "manage");
  if (role === "admin" && !can(t.access, "setRoles")) throw new TeamError("Only the owner can invite admins.");
  if (!inviteAllowed(kind, role)) throw new TeamError("Admin invites have to be single-use links.");
  const token = newDeviceToken();
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  await db().batch([
    db()
      .insert(schema.teamInvites)
      .values({ teamId, tokenHash: hashToken(token), kind, role, maxUses: kind === "single" ? 1 : null, expiresAt, createdBy: userId }),
    audit(teamId, userId, "invite", { kind, role, days }, t.asSuperadmin),
  ]);
  return token;
}

export async function revokeInvite(userId: string, teamId: string, inviteId: string) {
  const t = await requireTeam(userId, teamId, "manage");
  const i = schema.teamInvites;
  await db().batch([
    db()
      .update(i)
      .set({ revokedAt: new Date() })
      .where(and(eq(i.id, inviteId), eq(i.teamId, teamId), isNull(i.revokedAt))),
    audit(teamId, userId, "revoked", { inviteId }, t.asSuperadmin),
  ]);
}

export type InviteLookup = {
  teamId: string;
  teamName: string;
  role: TeamRole;
  state: InviteState;
  members: number;
};

// For the /join page. Null when the token matches nothing.
export async function lookupInvite(token: string, now = new Date()): Promise<InviteLookup | null> {
  if (!/^[a-z0-9]{16,64}$/.test(token)) return null;
  const i = schema.teamInvites;
  const rows = await db()
    .select({ invite: i, teamName: schema.teams.name })
    .from(i)
    .innerJoin(schema.teams, eq(schema.teams.id, i.teamId))
    .where(eq(i.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const [count] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.teamId, row.invite.teamId));
  return {
    teamId: row.invite.teamId,
    teamName: row.teamName,
    role: row.invite.role,
    state: inviteState(row.invite, now),
    members: count?.n ?? 0,
  };
}

// Joins the team the link is for. Already a member: nothing changes, and the link
// isn't used up. Returns the team id.
export async function acceptInvite(userId: string, token: string): Promise<string> {
  const found = await lookupInvite(token);
  if (!found) throw new TeamError("That invite link doesn't exist.");
  if (await roleInTeam(userId, found.teamId)) return found.teamId;
  if (found.state !== "live") throw new TeamError("That invite link has ended. Ask your admin for a new one.");

  // Counted with a guarded update so two people can't both use a single-use link.
  const i = schema.teamInvites;
  const claimed = await db()
    .update(i)
    .set({ uses: sql`${i.uses} + 1` })
    .where(
      and(
        eq(i.tokenHash, hashToken(token)),
        isNull(i.revokedAt),
        gt(i.expiresAt, new Date()),
        or(isNull(i.maxUses), lt(i.uses, i.maxUses)),
      ),
    )
    .returning({ id: i.id, role: i.role });
  const invite = claimed[0];
  if (!invite) throw new TeamError("That invite link has ended. Ask your admin for a new one.");

  await db().batch([
    db().insert(schema.teamMembers).values({ teamId: found.teamId, userId, role: invite.role }).onConflictDoNothing(),
    audit(found.teamId, userId, "joined", { inviteId: invite.id, role: invite.role }),
  ]);
  await adoptPushTeam(userId, found.teamId);
  return found.teamId;
}

// On joining (or creating) a first shared team, the person's lights start following
// its pushes. Lights already following another team are left alone.
async function adoptPushTeam(userId: string, teamId: string) {
  await db()
    .update(schema.devices)
    .set({ pushTeamId: teamId })
    .where(and(eq(schema.devices.ownerUserId, userId), isNull(schema.devices.pushTeamId)));
}

// The Devices page picker. Only the light's owner, and only teams they're in.
export async function setDevicePushTeam(userId: string, deviceId: string, teamId: string | null) {
  if (teamId) {
    const shared = await sharedTeamsForUser(userId);
    if (!shared.some((t) => t.id === teamId)) throw new TeamError("You aren't in that team.");
  }
  await db()
    .update(schema.devices)
    .set({ pushTeamId: teamId })
    .where(and(eq(schema.devices.id, deviceId), eq(schema.devices.ownerUserId, userId)));
}

// ---- audit log ----

export async function teamAuditLog(teamId: string, limit = 30) {
  const a = schema.teamAudit;
  return db()
    .select({ id: a.id, action: a.action, detail: a.detail, asSuperadmin: a.asSuperadmin, at: a.at, actorName: schema.users.name })
    .from(a)
    .leftJoin(schema.users, eq(schema.users.id, a.actorUserId))
    .where(eq(a.teamId, teamId))
    .orderBy(desc(a.at))
    .limit(limit);
}

// ---- superadmin ----

export async function allSharedTeams() {
  const d = db();
  const [teams, members, devices] = await d.batch([
    d.select().from(schema.teams).where(eq(schema.teams.personal, false)).orderBy(desc(schema.teams.createdAt)),
    d
      .select({ teamId: schema.teamMembers.teamId, n: sql<number>`count(*)::int` })
      .from(schema.teamMembers)
      .groupBy(schema.teamMembers.teamId),
    d
      .select({ teamId: schema.devices.pushTeamId, n: sql<number>`count(*)::int` })
      .from(schema.devices)
      .where(isNotNull(schema.devices.pushTeamId))
      .groupBy(schema.devices.pushTeamId),
  ]);
  const m = new Map(members.map((r) => [r.teamId, r.n]));
  const dv = new Map(devices.map((r) => [r.teamId, r.n]));
  return teams.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt, members: m.get(t.id) ?? 0, devices: dv.get(t.id) ?? 0 }));
}
