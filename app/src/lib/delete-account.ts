import "server-only";

import { del } from "@vercel/blob";
import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { db, schema } from "@/db";

import { isAdmin } from "./admin";
import { expire, tag } from "./cache";
import { removeAccount } from "./calendar-accounts";
import { ensurePersonalTeam } from "./teams";

// A superadmin deleting someone's account from the admin page. The user row cascades to
// sign-ins, passkeys, sessions, calendars, API tokens, webhooks, claims, GIF choices and
// team memberships. What doesn't cascade is handled here first:
// - their lights are never deleted: they come to the superadmin doing it, off any order
//   and out of ship mode, the same as "Take back" on the Devices table;
// - Google calendar grants are revoked (the row delete alone would leave them live);
// - their personal team goes, and any shared team where nobody else is left;
// - a shared team they own that still has people gets a new owner (an admin there first,
//   else whoever joined first), so it is never left without one.

export class DeleteAccountError extends Error {}

export type DeleteAccountSummary = {
  name: string;
  email: string | null;
  lights: { id: string; name: string }[];
  ownedTeams: { id: string; name: string; others: number }[]; // shared teams they own
  calendars: number;
};

async function target(actorId: string, userId: string) {
  if (!(await isAdmin(actorId))) throw new DeleteAccountError("Not a superadmin");
  if (actorId === userId) throw new DeleteAccountError("You can't delete your own account here.");
  const [user] = await db()
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) throw new DeleteAccountError("That account doesn't exist any more.");
  return user;
}

// Shared teams the person owns, with how many other people are in each.
async function ownedSharedTeams(userId: string) {
  const owned = await db()
    .select({ id: schema.teams.id, name: schema.teams.name })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.role, "owner"), eq(schema.teams.personal, false)));
  if (!owned.length) return [];
  const others = await db()
    .select({ teamId: schema.teamMembers.teamId, userId: schema.teamMembers.userId, role: schema.teamMembers.role, joinedAt: schema.teamMembers.createdAt })
    .from(schema.teamMembers)
    .where(and(inArray(schema.teamMembers.teamId, owned.map((t) => t.id)), ne(schema.teamMembers.userId, userId)))
    .orderBy(asc(schema.teamMembers.createdAt));
  return owned.map((t) => ({ ...t, members: others.filter((m) => m.teamId === t.id) }));
}

// What the confirm step warns about.
export async function deleteAccountSummary(actorId: string, userId: string): Promise<DeleteAccountSummary> {
  const user = await target(actorId, userId);
  const [lights, teams, calendars] = await Promise.all([
    db().select({ id: schema.devices.id, name: schema.devices.name }).from(schema.devices).where(eq(schema.devices.ownerUserId, userId)),
    ownedSharedTeams(userId),
    db().select({ id: schema.calendars.id }).from(schema.calendars).where(eq(schema.calendars.userId, userId)),
  ]);
  return {
    name: user.name ?? user.email ?? "this person",
    email: user.email,
    lights,
    ownedTeams: teams.map((t) => ({ id: t.id, name: t.name, others: t.members.length })),
    calendars: calendars.length,
  };
}

export async function deleteAccount(actor: { id: string; name: string }, userId: string) {
  await target(actor.id, userId);
  const d = db();

  // 1. Lights come to the superadmin doing this.
  const lights = await d.select({ id: schema.devices.id }).from(schema.devices).where(eq(schema.devices.ownerUserId, userId));
  if (lights.length) {
    const teamId = await ensurePersonalTeam(actor.id, actor.name);
    await d
      .update(schema.devices)
      .set({ teamId, ownerUserId: actor.id, pushTeamId: null, claimId: null, shipMode: false, shippedAt: null, arrivedAt: null })
      .where(eq(schema.devices.ownerUserId, userId));
  }

  // 2. Shared teams they own: hand on, or delete when nobody else is in them.
  const owned = await ownedSharedTeams(userId);
  const emptyTeams: string[] = [];
  for (const t of owned) {
    if (!t.members.length) {
      emptyTeams.push(t.id);
      continue;
    }
    if (t.members.some((m) => m.role === "owner")) continue;
    const next = t.members.find((m) => m.role === "admin") ?? t.members[0];
    await d
      .update(schema.teamMembers)
      .set({ role: "owner" })
      .where(and(eq(schema.teamMembers.teamId, t.id), eq(schema.teamMembers.userId, next.userId)));
  }

  // 3. Their personal team goes too (team rows aren't cascaded from the user).
  const personal = await d
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .innerJoin(schema.teamMembers, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teams.personal, true)));
  const doomed = [...emptyTeams, ...personal.map((t) => t.id)];

  // Any other person's light still sitting in a team that's about to go (it would cascade)
  // moves to that person's own personal team first.
  if (doomed.length) {
    const strays = await d
      .select({ id: schema.devices.id, owner: schema.devices.ownerUserId, ownerName: schema.users.name })
      .from(schema.devices)
      .innerJoin(schema.users, eq(schema.users.id, schema.devices.ownerUserId))
      .where(inArray(schema.devices.teamId, doomed));
    for (const s of strays) {
      const teamId = await ensurePersonalTeam(s.owner, s.ownerName ?? "My");
      await d.update(schema.devices).set({ teamId }).where(eq(schema.devices.id, s.id));
      await expire(tag.device(s.id), tag.user(s.owner));
    }
  }

  // 4. Revoke Google grants (best effort) and drop calendar accounts.
  const accounts = await d.select().from(schema.calendarAccounts).where(eq(schema.calendarAccounts.userId, userId));
  for (const a of accounts) await removeAccount(a);

  // 5. The account itself, then the teams and their GIF files.
  const blobs = doomed.length
    ? await d.select({ url: schema.assets.blobUrl }).from(schema.assets).where(inArray(schema.assets.teamId, doomed))
    : [];
  await d.delete(schema.users).where(eq(schema.users.id, userId));
  if (doomed.length) await d.delete(schema.teams).where(inArray(schema.teams.id, doomed));
  if (blobs.length) await del(blobs.map((b) => b.url)).catch(() => {}); // a stray blob is harmless

  await expire(
    tag.user(userId),
    tag.user(actor.id),
    ...lights.map((l) => tag.device(l.id)),
    ...owned.map((t) => tag.team(t.id)),
    ...doomed.map((id) => tag.team(id)),
  );
  return { lightsMoved: lights.length, teamsDeleted: emptyTeams.length, teamsHandedOn: owned.length - emptyTeams.length };
}
