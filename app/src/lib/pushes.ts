import "server-only";

import { and, desc, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { db, schema } from "@/db";

import { builtinGif, type ResolvedGif } from "./gifs";
import { clipText, nowSeconds } from "./protocol";
import { type LedStyle, pushFor, type PushWho } from "./push-rules";
import { audit, requireTeam, TeamError, teamMembers } from "./teams";

// Team pushes: an admin puts a message and/or GIF (and maybe a flash) on everyone's
// light, or on picked people's. It beats their own "show now" until it ends, someone
// ends it, or they dismiss it with the light's top button. See push-rules.ts for the
// pure parts and docs/protocol.md for what the light gets.

export type Push = PushWho & {
  teamId: string;
  gif: ResolvedGif;
  leds: LedStyle | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
};

// Live pushes for these teams (or, with `recentSince`, ones that ended after it too),
// newest first, with who they're for and who dismissed them.
async function loadPushes(teamIds: string[], now: number, recentSince?: number): Promise<Push[]> {
  if (teamIds.length === 0) return [];
  const p = schema.teamPushes;
  const live = and(isNull(p.endedAt), or(eq(p.until, 0), gt(p.until, now)));
  const recent = recentSince
    ? or(and(isNotNull(p.endedAt), gt(p.endedAt, recentSince)), and(isNull(p.endedAt), gt(p.until, recentSince)))
    : undefined;
  const rows = await db()
    .select({ push: p, asset: schema.assets, byName: schema.users.name, byEmail: schema.users.email })
    .from(p)
    .leftJoin(schema.assets, eq(schema.assets.id, p.assetId))
    .leftJoin(schema.users, eq(schema.users.id, p.createdBy))
    .where(and(inArray(p.teamId, teamIds), recent ? or(live, recent) : live))
    .orderBy(desc(p.updatedAt))
    .limit(50);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.push.id);
  const d = db();
  const [targets, acks] = await d.batch([
    d.select().from(schema.teamPushTargets).where(inArray(schema.teamPushTargets.pushId, ids)),
    d.select().from(schema.teamPushAcks).where(inArray(schema.teamPushAcks.pushId, ids)),
  ]);
  return rows.map(({ push, asset, byName, byEmail }) => ({
    id: push.id,
    teamId: push.teamId,
    target: push.target,
    text: push.text,
    until: push.until,
    updatedAt: push.updatedAt,
    endedAt: push.endedAt,
    targets: targets.filter((t) => t.pushId === push.id).map((t) => t.userId),
    ackedBy: acks.filter((a) => a.pushId === push.id).map((a) => a.userId),
    gif: asset ? { kind: "asset", id: asset.id, name: asset.name, sha: asset.sha } : push.builtin ? builtinGif(push.builtin) : null,
    leds: push.leds ?? null,
    createdBy: push.createdBy,
    createdByName: byName ?? byEmail ?? null,
    createdAt: push.createdAt,
  }));
}

// For the team page: what's up now, and what ended in the last day.
export async function teamPushes(teamId: string, now = nowSeconds()) {
  return loadPushes([teamId], now, now - 24 * 3600);
}

// Pushes that lights following these teams could show now. For the dashboard.
export async function livePushes(teamIds: string[], now = nowSeconds()) {
  return loadPushes([...new Set(teamIds)], now);
}

export async function createPush(
  userId: string,
  teamId: string,
  input: {
    text: string;
    assetId: string | null;
    builtin: string | null;
    leds: LedStyle | null;
    minutes: number;
    target: "all" | "users";
    users: string[];
  },
) {
  const t = await requireTeam(userId, teamId, "manage");
  const text = clipText(input.text.trim());
  if (!text && !input.assetId && !input.builtin) throw new TeamError("Pick a GIF or type a message first.");
  let users: string[] = [];
  if (input.target === "users") {
    const members = new Set((await teamMembers(teamId)).map((m) => m.userId));
    users = [...new Set(input.users)].filter((u) => members.has(u));
    if (users.length === 0) throw new TeamError("Pick at least one person.");
  }
  const now = nowSeconds();
  const id = crypto.randomUUID();
  const d = db();
  await d.batch([
    d.insert(schema.teamPushes).values({
      id,
      teamId,
      createdBy: userId,
      target: input.target,
      text,
      assetId: input.assetId,
      builtin: input.builtin,
      leds: input.leds,
      until: input.minutes > 0 ? now + input.minutes * 60 : 0,
      updatedAt: now,
    }),
    ...(users.length ? [d.insert(schema.teamPushTargets).values(users.map((u) => ({ pushId: id, userId: u })))] : []),
    audit(teamId, userId, "push", { target: input.target, people: users.length, text, minutes: input.minutes, flash: input.leds?.pattern ?? null }, t.asSuperadmin),
  ]);
  return id;
}

// Take it down for everyone, now. Lights drop it on their next poll.
export async function endPush(userId: string, teamId: string, pushId: string) {
  const t = await requireTeam(userId, teamId, "manage");
  const now = nowSeconds();
  const p = schema.teamPushes;
  const ended = await db()
    .update(p)
    .set({ endedAt: now, updatedAt: now })
    .where(and(eq(p.id, pushId), eq(p.teamId, teamId), isNull(p.endedAt)))
    .returning({ text: p.text });
  if (ended[0]) await audit(teamId, userId, "push-ended", { text: ended[0].text }, t.asSuperadmin);
}

type PushDevice = { id: string; ownerUserId: string; pushTeamId: string | null };

// Whether the light's owner is (still) in the team it follows.
async function following(device: PushDevice): Promise<string | null> {
  if (!device.pushTeamId) return null;
  const rows = await db()
    .select({ teamId: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, device.pushTeamId), eq(schema.teamMembers.userId, device.ownerUserId)))
    .limit(1);
  return rows[0]?.teamId ?? null;
}

// The push this light shows now, if any.
export async function pushForDevice(device: PushDevice, now: number): Promise<Push | null> {
  const teamId = await following(device);
  if (!teamId) return null;
  return pushFor(await loadPushes([teamId], now), device.ownerUserId, now);
}

// The person dismissed it on their light. Counts for all their lights; a second
// dismissal (from another light, or a retry) keeps the first.
export async function ackPush(device: PushDevice, pushId: string, at: number) {
  const teamId = await following(device);
  if (!teamId) return false;
  const rows = await db()
    .select({ id: schema.teamPushes.id })
    .from(schema.teamPushes)
    .where(and(eq(schema.teamPushes.id, pushId), eq(schema.teamPushes.teamId, teamId)))
    .limit(1);
  if (!rows[0]) return false;
  await db()
    .insert(schema.teamPushAcks)
    .values({ pushId, userId: device.ownerUserId, at, deviceId: device.id })
    .onConflictDoNothing();
  return true;
}

// Whether a light may download this upload because a push it follows shows it.
export async function pushMayFetch(device: PushDevice, assetId: string) {
  const teamId = await following(device);
  if (!teamId) return null;
  const rows = await db()
    .select({ blobUrl: schema.assets.blobUrl })
    .from(schema.teamPushes)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.teamPushes.assetId))
    .where(and(eq(schema.teamPushes.teamId, teamId), eq(schema.teamPushes.assetId, assetId), isNull(schema.teamPushes.endedAt)))
    .limit(1);
  return rows[0]?.blobUrl ?? null;
}

// Whether someone may preview an upload because it's in a push to a team they're in.
export async function pushAssetVisible(viewerId: string, assetId: string) {
  const rows = await db()
    .select({ asset: schema.assets })
    .from(schema.teamPushes)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.teamPushes.assetId))
    .innerJoin(schema.teamMembers, eq(schema.teamMembers.teamId, schema.teamPushes.teamId))
    .where(and(eq(schema.teamPushes.assetId, assetId), eq(schema.teamMembers.userId, viewerId)))
    .limit(1);
  return rows[0]?.asset ?? null;
}
