import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { db, schema } from "@/db";

import { expire, tag } from "./cache";

import { hashToken, newDeviceId, newDeviceToken, tokenMatches } from "./device-token";
import {
  newPairCode,
  PAIR_MAX_PER_IP,
  PAIR_POLL_SEC,
  PAIR_TTL_SEC,
  pairingState,
  type PairingState,
  secondsLeft,
} from "./pair-rules";
import { ensurePersonalTeam, teamsForUser } from "./teams";

export class PairingError extends Error {}

export type PairingStart = { id: string; code: string; secret: string; expiresIn: number; poll: number };

// Old rows: unclaimed codes an hour past expiry, claimed ones after a day (long enough
// for a light that missed the answer to ask again). There's no cron, so starting a new
// pairing tidies up.
function cleanUp(now: Date) {
  const hourAgo = new Date(now.getTime() - 3600_000);
  const dayAgo = new Date(now.getTime() - 86400_000);
  return db()
    .delete(schema.devicePairings)
    .where(
      or(
        and(isNull(schema.devicePairings.deviceId), lt(schema.devicePairings.expiresAt, hourAgo)),
        and(isNotNull(schema.devicePairings.deviceId), lt(schema.devicePairings.createdAt, dayAgo)),
      ),
    );
}

// A light with no device id asks for a code. Only the light gets the secret.
export async function startPairing(input: { ip: string; board: string | null; firmwareVersion: string | null }, now = new Date()): Promise<PairingStart> {
  await cleanUp(now);
  const ipHash = hashToken(`pair:${input.ip}`);
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.devicePairings)
    .where(
      and(eq(schema.devicePairings.ipHash, ipHash), isNull(schema.devicePairings.deviceId), gt(schema.devicePairings.expiresAt, now)),
    );
  if (n >= PAIR_MAX_PER_IP) throw new PairingError("too many");

  const secret = newDeviceToken();
  const expiresAt = new Date(now.getTime() + PAIR_TTL_SEC * 1000);
  // Codes are unique among rows still in the table. A clash is rare; try again.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newPairCode((len) => randomBytes(len));
    const rows = await db()
      .insert(schema.devicePairings)
      .values({ code, secretHash: hashToken(secret), ipHash, board: input.board, firmwareVersion: input.firmwareVersion, expiresAt })
      .onConflictDoNothing({ target: schema.devicePairings.code })
      .returning({ id: schema.devicePairings.id });
    if (rows[0]) return { id: rows[0].id, code, secret, expiresIn: PAIR_TTL_SEC, poll: PAIR_POLL_SEC };
  }
  throw new Error("couldn't make a unique pairing code");
}

export type PairingPoll = { state: "waiting"; expiresIn: number } | { state: "paired"; deviceId: string; name: string };

// The light asks whether it's been claimed. Null for an unknown id, a wrong secret or
// an expired code alike, so the light just asks for a new one.
export async function pollPairing(id: string, secret: string, now = new Date()): Promise<PairingPoll | null> {
  const rows = await db()
    .select({ pairing: schema.devicePairings, name: schema.devices.name })
    .from(schema.devicePairings)
    .leftJoin(schema.devices, eq(schema.devices.id, schema.devicePairings.deviceId))
    .where(eq(schema.devicePairings.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || !tokenMatches(secret, row.pairing.secretHash)) return null;
  const state = pairingState(row.pairing, now);
  if (state === "expired") return null;
  if (state === "claimed") {
    // The device was deleted again before the light picked it up.
    if (!row.name) return null;
    return { state: "paired", deviceId: row.pairing.deviceId!, name: row.name };
  }
  return { state: "waiting", expiresIn: secondsLeft(row.pairing, now) };
}

export type PairingLookup = { state: PairingState; expiresIn: number; board: string | null; deviceId: string | null };

export async function lookupPairing(code: string, now = new Date()): Promise<PairingLookup | null> {
  const rows = await db().select().from(schema.devicePairings).where(eq(schema.devicePairings.code, code)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { state: pairingState(row, now), expiresIn: secondsLeft(row, now), board: row.board, deviceId: row.deviceId };
}

// Teams someone can put a new light in: their personal team first, then shared ones.
export async function pairingTeams(userId: string, displayName: string) {
  const personalId = await ensurePersonalTeam(userId, displayName);
  const teams = await teamsForUser(userId);
  const shared = teams.filter((t) => !t.personal).sort((a, b) => a.name.localeCompare(b.name));
  return [{ id: personalId, name: "Just me" }, ...shared.map((t) => ({ id: t.id, name: t.name }))];
}

export async function claimPairing(
  user: { id: string; name: string },
  code: string,
  input: { name: string; teamId: string; autoUpdate: boolean },
  now = new Date(),
): Promise<string> {
  const rows = await db().select().from(schema.devicePairings).where(eq(schema.devicePairings.code, code)).limit(1);
  const pairing = rows[0];
  if (!pairing || pairingState(pairing, now) !== "live") throw new PairingError("This code has run out. The light will show a new one.");
  const teams = await pairingTeams(user.id, user.name);
  if (!teams.some((t) => t.id === input.teamId)) throw new PairingError("Pick one of your teams.");
  // A light in a shared team shows that team's announcements: one setting, not two.
  const personal = teams[0].id === input.teamId;

  // The pairing secret becomes the device token: the light already has it.
  const id = newDeviceId();
  await db().insert(schema.devices).values({
    id,
    teamId: input.teamId,
    pushTeamId: personal ? null : input.teamId,
    ownerUserId: user.id,
    name: input.name,
    tokenHash: pairing.secretHash,
    autoUpdate: input.autoUpdate,
    board: pairing.board,
    firmwareVersion: pairing.firmwareVersion,
  });
  // Only one claim wins. neon-http has no transactions, so undo the device if someone
  // else got there first.
  const won = await db()
    .update(schema.devicePairings)
    .set({ deviceId: id })
    .where(and(eq(schema.devicePairings.id, pairing.id), isNull(schema.devicePairings.deviceId)))
    .returning({ id: schema.devicePairings.id });
  if (!won[0]) {
    await db().delete(schema.devices).where(eq(schema.devices.id, id));
    throw new PairingError("Someone else just added this light.");
  }
  // The API lists a person's lights from a copy saved under their tag.
  await expire(tag.user(user.id));
  return id;
}

