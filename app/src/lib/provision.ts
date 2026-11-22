import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";

import { expire, tag } from "./cache";
import { claimLabel, type ClaimInput, claimLinkState, lightReport, linkExpiry } from "./claim-rules";
import { bearerToken, hashToken, tokenMatches } from "./device-token";
import { mailConfigured, sendMail } from "./mail";
import { claimEmail } from "./mail-templates";
import { liveSeen } from "./seen";
import { ensurePersonalTeam } from "./teams";

// Setting up lights for someone by email (docs/provisioning.md). A caller with the
// provisioning key (a shop, or anyone self-hosting who hands lights out) makes a claim
// for an email; a superadmin pairs lights to it at the bench; the caller puts them in
// ship mode; the person gets a link to sign in. Nothing here knows about prices,
// payments or addresses: only an email, a name and the caller's reference.

export class ProvisionError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// The caller's key, checked against PROVISION_KEY_HASH (its SHA-256). Without that env
// var the API is off.
export function provisionKeyOk(header: string | null): boolean {
  const hash = process.env.PROVISION_KEY_HASH?.trim().toLowerCase();
  const key = bearerToken(header);
  if (!hash || !key || !/^[0-9a-f]{64}$/.test(hash)) return false;
  return tokenMatches(key, hash);
}

type Claim = typeof schema.lightClaims.$inferSelect;

async function claimById(id: string): Promise<Claim | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [c] = await db().select().from(schema.lightClaims).where(eq(schema.lightClaims.id, id)).limit(1);
  return c ?? null;
}

export async function requireClaim(id: string): Promise<Claim> {
  const c = await claimById(id);
  if (!c) throw new ProvisionError("No claim with that id.", 404);
  return c;
}

// Whether someone can already get into their account: a passkey or a linked GitHub.
async function canSignIn(userId: string): Promise<boolean> {
  const [[a], [p]] = await Promise.all([
    db().select({ n: count() }).from(schema.accounts).where(eq(schema.accounts.userId, userId)),
    db().select({ n: count() }).from(schema.authenticators).where(eq(schema.authenticators.userId, userId)),
  ]);
  return (a?.n ?? 0) + (p?.n ?? 0) > 0;
}

export async function createClaim(input: ClaimInput): Promise<{ id: string; created: boolean }> {
  const [existing] = await db().select({ id: schema.lightClaims.id }).from(schema.lightClaims).where(eq(schema.lightClaims.ref, input.ref)).limit(1);
  if (existing) return { id: existing.id, created: false };

  let [user] = await db().select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.email, input.email)).limit(1);
  if (!user) {
    // No sign-in method yet: the claim link is how they first get in.
    const [made] = await db()
      .insert(schema.users)
      .values({ email: input.email, name: input.name || null })
      .onConflictDoNothing({ target: schema.users.email })
      .returning({ id: schema.users.id, name: schema.users.name });
    user = made ?? (await db().select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.email, input.email)).limit(1))[0];
  }
  await ensurePersonalTeam(user.id, user.name || input.name || input.email);
  const claimed = (await canSignIn(user.id)) ? new Date() : null;
  const rows = await db()
    .insert(schema.lightClaims)
    .values({ ref: input.ref, userId: user.id, quantity: input.quantity, claimedAt: claimed })
    .onConflictDoNothing({ target: schema.lightClaims.ref })
    .returning({ id: schema.lightClaims.id });
  if (rows[0]) return { id: rows[0].id, created: true };
  // Two calls with the same ref at once: the other one made it.
  const [again] = await db().select({ id: schema.lightClaims.id }).from(schema.lightClaims).where(eq(schema.lightClaims.ref, input.ref)).limit(1);
  return { id: again.id, created: false };
}

async function claimDevices(claimId: string) {
  const rows = await db()
    .select({
      id: schema.devices.id,
      name: schema.devices.name,
      firmwareVersion: schema.devices.firmwareVersion,
      lastSeenAt: schema.devices.lastSeenAt,
      shipMode: schema.devices.shipMode,
      shippedAt: schema.devices.shippedAt,
      arrivedAt: schema.devices.arrivedAt,
    })
    .from(schema.devices)
    .where(eq(schema.devices.claimId, claimId))
    .orderBy(asc(schema.devices.createdAt));
  return liveSeen(rows);
}

export async function claimStatus(id: string) {
  const c = await requireClaim(id);
  const devices = await claimDevices(c.id);
  return {
    id: c.id,
    ref: c.ref,
    quantity: c.quantity,
    claimed: !!c.claimedAt,
    claimedAt: c.claimedAt?.toISOString() ?? null,
    invitedAt: c.invitedAt?.toISOString() ?? null,
    devices: devices.map(lightReport),
  };
}

// Every light on the claim goes into ship mode; on its next poll it's told so. Then the
// person is emailed, unless they've been already.
export async function shipClaim(id: string, origin: string) {
  const c = await requireClaim(id);
  const now = new Date();
  const shipped = await db()
    .update(schema.devices)
    .set({ shipMode: true, shippedAt: now, arrivedAt: null })
    .where(and(eq(schema.devices.claimId, c.id), eq(schema.devices.shipMode, false), isNull(schema.devices.arrivedAt)))
    .returning({ id: schema.devices.id });
  await expire(...shipped.map((d) => tag.device(d.id)));
  if (!c.invitedAt) await inviteClaim(c.id, origin, { shipped: true });
  return claimStatus(c.id);
}

// The "set up your account" email. An account that can't sign in yet gets a fresh
// one-time link (any earlier one stops working); one that can just gets told.
export async function inviteClaim(id: string, origin: string, opts: { shipped?: boolean } = {}): Promise<{ sent: boolean; url: string | null }> {
  const c = await requireClaim(id);
  const [user] = await db().select({ email: schema.users.email, name: schema.users.name }).from(schema.users).where(eq(schema.users.id, c.userId)).limit(1);
  if (!user?.email) throw new ProvisionError("The claim's account has no email.", 409);
  const ready = await canSignIn(c.userId);
  const devices = await claimDevices(c.id);
  const shipped = opts.shipped ?? devices.some((d) => d.shippedAt);
  let url = origin;
  let expiresAt: Date | null = null;
  if (!ready) {
    const token = randomBytes(24).toString("base64url");
    expiresAt = linkExpiry();
    await db().update(schema.lightClaims).set({ tokenHash: hashToken(token), tokenExpiresAt: expiresAt }).where(eq(schema.lightClaims.id, c.id));
    url = `${origin}/claim/${token}`;
  } else if (!c.claimedAt) {
    await db().update(schema.lightClaims).set({ claimedAt: new Date() }).where(eq(schema.lightClaims.id, c.id));
  }
  const mail = claimEmail({ name: user.name, lights: Math.max(devices.length, c.quantity), url, expiresAt, shipped });
  const sent = mailConfigured() ? (await sendMail(user.email, mail, { idempotencyKey: `claim-${c.id}-${expiresAt?.getTime() ?? "ready"}` })).ok : false;
  if (sent) await db().update(schema.lightClaims).set({ invitedAt: new Date() }).where(eq(schema.lightClaims.id, c.id));
  // Without email (local dev, previews) the caller gets the link to pass on itself.
  return { sent, url: sent ? null : expiresAt ? url : null };
}

// The first superadmin's team for lights that are going back on the shelf.
async function spareLightsTeam(): Promise<{ teamId: string; ownerId: string }> {
  const [admin] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "admin")).orderBy(asc(schema.users.createdAt)).limit(1);
  if (!admin) throw new ProvisionError("There's no superadmin to hand the lights back to.", 409);
  const [team] = await db()
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .innerJoin(schema.teamMembers, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(eq(schema.teamMembers.userId, admin.id), eq(schema.teamMembers.role, "owner"), eq(schema.teams.name, "Spare lights"), eq(schema.teams.personal, false)))
    .limit(1);
  if (team) return { teamId: team.id, ownerId: admin.id };
  const teamId = crypto.randomUUID();
  await db().batch([
    db().insert(schema.teams).values({ id: teamId, name: "Spare lights", personal: false }),
    db().insert(schema.teamMembers).values({ teamId, userId: admin.id, role: "owner" }),
  ]);
  return { teamId, ownerId: admin.id };
}

// A cancelled order before it shipped: the claim goes, and any lights already paired to
// it go to the spare lights team, ready to pair to someone else. An account made only for
// this claim, never used, goes too.
export async function deleteClaim(id: string): Promise<{ lightsReturned: number }> {
  const c = await requireClaim(id);
  const devices = await db().select({ id: schema.devices.id, arrivedAt: schema.devices.arrivedAt }).from(schema.devices).where(eq(schema.devices.claimId, c.id));
  if (devices.some((d) => d.arrivedAt)) throw new ProvisionError("A light on this claim is already at its new home.", 409);
  if (devices.length) {
    const spare = await spareLightsTeam();
    await db()
      .update(schema.devices)
      .set({ teamId: spare.teamId, ownerUserId: spare.ownerId, pushTeamId: null, claimId: null, shipMode: false, shippedAt: null })
      .where(inArray(
        schema.devices.id,
        devices.map((d) => d.id),
      ));
    await expire(...devices.map((d) => tag.device(d.id)), tag.user(c.userId), tag.user(spare.ownerId));
  }
  await db().delete(schema.lightClaims).where(eq(schema.lightClaims.id, c.id));
  await dropUnusedAccount(c.userId);
  return { lightsReturned: devices.length };
}

async function dropUnusedAccount(userId: string) {
  if (await canSignIn(userId)) return;
  const [[claims], [lights]] = await Promise.all([
    db().select({ n: count() }).from(schema.lightClaims).where(eq(schema.lightClaims.userId, userId)),
    db().select({ n: count() }).from(schema.devices).where(eq(schema.devices.ownerUserId, userId)),
  ]);
  if ((claims?.n ?? 0) > 0 || (lights?.n ?? 0) > 0) return;
  // Their personal team goes with them (team rows aren't cascaded from the user).
  const personal = await db()
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .innerJoin(schema.teamMembers, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teams.personal, true)));
  await db().delete(schema.users).where(eq(schema.users.id, userId));
  if (personal.length) await db().delete(schema.teams).where(inArray(schema.teams.id, personal.map((t) => t.id)));
}

// For the bench: claims that still need lights, oldest first.
export async function openClaims() {
  const rows = await db()
    .select({
      id: schema.lightClaims.id,
      ref: schema.lightClaims.ref,
      quantity: schema.lightClaims.quantity,
      name: schema.users.name,
      email: schema.users.email,
      paired: sql<number>`(select count(*)::int from ${schema.devices} where ${schema.devices.claimId} = ${schema.lightClaims.id})`,
    })
    .from(schema.lightClaims)
    .innerJoin(schema.users, eq(schema.users.id, schema.lightClaims.userId))
    .orderBy(asc(schema.lightClaims.createdAt));
  return rows.filter((r) => r.paired < r.quantity).map((r) => ({ id: r.id, label: claimLabel(r) }));
}

// Where a light paired to a claim goes: the person's personal team.
export async function claimTarget(claimId: string): Promise<{ claimId: string; userId: string; teamId: string } | null> {
  const [row] = await db()
    .select({ c: schema.lightClaims, name: schema.users.name, email: schema.users.email })
    .from(schema.lightClaims)
    .innerJoin(schema.users, eq(schema.users.id, schema.lightClaims.userId))
    .where(eq(schema.lightClaims.id, claimId))
    .limit(1);
  if (!row) return null;
  const teamId = await ensurePersonalTeam(row.c.userId, row.name || row.email || "My team");
  return { claimId, userId: row.c.userId, teamId };
}

// The /claim page.
export async function lookupClaimLink(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db()
    .select({ c: schema.lightClaims, name: schema.users.name, email: schema.users.email })
    .from(schema.lightClaims)
    .innerJoin(schema.users, eq(schema.users.id, schema.lightClaims.userId))
    .where(eq(schema.lightClaims.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;
  return { claimId: row.c.id, userId: row.c.userId, name: row.name, email: row.email, state: claimLinkState(row.c, now), lights: row.c.quantity };
}

// Uses the link: it works once. Returns who to sign in as.
export async function redeemClaimLink(token: string, now = new Date()): Promise<string | null> {
  const link = await lookupClaimLink(token, now);
  if (!link || link.state !== "live") return null;
  const used = await db()
    .update(schema.lightClaims)
    .set({ tokenHash: null, tokenExpiresAt: null, claimedAt: now })
    .where(and(eq(schema.lightClaims.id, link.claimId), eq(schema.lightClaims.tokenHash, hashToken(token))))
    .returning({ id: schema.lightClaims.id });
  if (!used[0]) return null;
  // The email address is proven: the link was sent to it.
  await db().update(schema.users).set({ emailVerified: now }).where(and(eq(schema.users.id, link.userId), isNull(schema.users.emailVerified)));
  return link.userId;
}

// The light's first poll after ship mode, from its new home (firmware "ship" feature).
export async function markArrived(deviceId: string) {
  const rows = await db()
    .update(schema.devices)
    .set({ shipMode: false, arrivedAt: new Date() })
    .where(and(eq(schema.devices.id, deviceId), eq(schema.devices.shipMode, true)))
    .returning({ id: schema.devices.id });
  if (rows[0]) await expire(tag.device(deviceId));
}

// ---- superadmin bench tools (the admin page's Devices table) ----

// Puts a light that's already set up onto a claim, keeping its id and token, so a light
// on the bench (or one of your own, to test ship mode) needn't be deleted and paired
// again. It becomes the claim's person's, in their personal team, out of ship mode.
export async function assignToClaim(deviceId: string, claimId: string) {
  const [device] = await db().select({ owner: schema.devices.ownerUserId }).from(schema.devices).where(eq(schema.devices.id, deviceId)).limit(1);
  if (!device) throw new ProvisionError("No light with that id.", 404);
  const target = await claimTarget(claimId);
  if (!target) throw new ProvisionError("That order isn't waiting for a light any more.", 404);
  await db()
    .update(schema.devices)
    .set({ teamId: target.teamId, ownerUserId: target.userId, pushTeamId: null, claimId, shipMode: false, shippedAt: null, arrivedAt: null })
    .where(eq(schema.devices.id, deviceId));
  await expire(tag.device(deviceId), tag.user(device.owner), tag.user(target.userId));
}

// The other way: a light on a claim comes back to the superadmin, in their personal team,
// off the claim and out of ship mode. Works after it has arrived too (a test claim, or a
// light sent back). Only for lights on a claim, so it can't take anyone's own light.
export async function takeBackFromClaim(deviceId: string, admin: { id: string; name: string }) {
  const [device] = await db()
    .select({ owner: schema.devices.ownerUserId, claimId: schema.devices.claimId })
    .from(schema.devices)
    .where(eq(schema.devices.id, deviceId))
    .limit(1);
  if (!device) throw new ProvisionError("No light with that id.", 404);
  if (!device.claimId) throw new ProvisionError("That light isn't on an order.", 409);
  const teamId = await ensurePersonalTeam(admin.id, admin.name);
  await db()
    .update(schema.devices)
    .set({ teamId, ownerUserId: admin.id, pushTeamId: null, claimId: null, shipMode: false, shippedAt: null, arrivedAt: null })
    .where(eq(schema.devices.id, deviceId));
  await expire(tag.device(deviceId), tag.user(device.owner), tag.user(admin.id));
}
