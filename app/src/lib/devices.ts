import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db";

import { expire, tag } from "./cache";
import { getLooks } from "./look";
import { withLook } from "./look-rules";
import { liveSeen } from "./seen";

import { hashToken, newDeviceId, newDeviceToken } from "./device-token";
import type { DeviceFirmware } from "./firmware";
import type { Status } from "./protocol";
import type { LedStyles, MeetingWarn } from "./ring";
import { ensurePersonalTeam, roleInTeam, teamsForUser } from "./teams";

export type DeviceSummary = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  // Its team is the owner's personal one (shown as "Just you").
  teamPersonal: boolean;
  // The team whose announcements it shows, if the viewer is in it.
  pushTeamName: string | null;
  ownerUserId: string;
  // Off: it has its own status and Show now, and a press on it changes only it.
  followsOwner: boolean;
  // What it shows between meetings: its owner's, or its own when it doesn't follow them.
  defaultStatus: Status;
  pushTeamId: string | null;
  lastSeenAt: Date | null;
  // Seconds until its next poll, as last told (see isOnline).
  pollSec: number;
  canManage: boolean;
  firmware: DeviceFirmware;
  // What its firmware says it understands ("hours,leds,push"); null before it has said.
  features: string | null;
  ring: DeviceRing;
};

// allowFlash is the light's own; the styles and meeting warning are its owner's look.
export type DeviceRing = { allowFlash: boolean; ledStyles: LedStyles | null; meetingWarn: MeetingWarn | null };

export async function devicesForUser(userId: string): Promise<DeviceSummary[]> {
  const teams = await teamsForUser(userId);
  if (teams.length === 0) return [];
  const rows = await liveSeen(
    await db()
      .select()
      .from(schema.devices)
      .where(inArray(schema.devices.teamId, teams.map((t) => t.id)))
      .orderBy(desc(schema.devices.createdAt)),
  );
  const byId = new Map(teams.map((t) => [t.id, t]));
  const looks = await getLooks(rows.map((d) => d.ownerUserId));
  return rows.map((row) => {
    const d = withLook(row, looks.get(row.ownerUserId)!);
    const team = byId.get(d.teamId)!;
    return {
      id: d.id,
      name: d.name,
      teamId: d.teamId,
      teamName: team.name,
      teamPersonal: team.personal,
      pushTeamName: d.pushTeamId ? (byId.get(d.pushTeamId)?.name ?? null) : null,
      ownerUserId: d.ownerUserId,
      followsOwner: d.followsOwner,
      defaultStatus: d.defaultStatus,
      pushTeamId: d.pushTeamId,
      lastSeenAt: d.lastSeenAt,
      pollSec: d.pollSec,
      canManage: d.ownerUserId === userId || team.role === "owner" || team.role === "admin",
      firmware: {
        autoUpdate: d.autoUpdate,
        firmwareVersion: d.firmwareVersion,
        board: d.board,
        firmwareFailed: d.firmwareFailed,
        updateRequestedAt: d.updateRequestedAt,
      },
      features: d.features,
      ring: { allowFlash: d.allowFlash, ledStyles: d.ledStyles, meetingWarn: d.meetingWarn },
    };
  });
}

// The light, if this person owns it (whose status it shows, or could).
export async function ownedDevice(userId: string, deviceId: string) {
  const rows = await db().select().from(schema.devices).where(eq(schema.devices.id, deviceId)).limit(1);
  const d = rows[0];
  return d && d.ownerUserId === userId ? d : null;
}

// Owners of the device, and team owners/admins, can manage it.
export async function canManageDevice(userId: string, deviceId: string): Promise<boolean> {
  const rows = await db().select().from(schema.devices).where(eq(schema.devices.id, deviceId)).limit(1);
  const d = rows[0];
  if (!d) return false;
  if (d.ownerUserId === userId) return true;
  const role = await roleInTeam(userId, d.teamId);
  return role === "owner" || role === "admin";
}

export async function createDevice(userId: string, displayName: string, name: string, autoUpdate = true) {
  const teamId = await ensurePersonalTeam(userId, displayName);
  const id = newDeviceId();
  const token = newDeviceToken();
  await db().insert(schema.devices).values({ id, teamId, ownerUserId: userId, name, tokenHash: hashToken(token), autoUpdate });
  // The API lists a person's lights from a copy saved under their tag.
  await expire(tag.user(userId));
  return { id, token };
}

export async function setAllowFlash(deviceId: string, allowFlash: boolean) {
  await db().update(schema.devices).set({ allowFlash }).where(eq(schema.devices.id, deviceId));
  await expire(tag.device(deviceId));
}

export async function renameDevice(deviceId: string, name: string) {
  await db().update(schema.devices).set({ name }).where(eq(schema.devices.id, deviceId));
  await expire(tag.device(deviceId));
}

// "Follows me" off: the light starts on its own status from nothing set, so it shows its
// "between meetings" status (which starts as its owner's).
export async function setFollowsOwner(deviceId: string, followsOwner: boolean, ownerDefault: Status) {
  await db()
    .update(schema.devices)
    .set(followsOwner ? { followsOwner } : { followsOwner, defaultStatus: ownerDefault })
    .where(eq(schema.devices.id, deviceId));
  await expire(tag.device(deviceId));
}

// What a light with its own status shows between meetings.
export async function setLightDefault(deviceId: string, defaultStatus: Status) {
  await db().update(schema.devices).set({ defaultStatus }).where(eq(schema.devices.id, deviceId));
  await expire(tag.device(deviceId));
}

export async function setAutoUpdate(deviceId: string, autoUpdate: boolean) {
  await db().update(schema.devices).set({ autoUpdate }).where(eq(schema.devices.id, deviceId));
  await expire(tag.device(deviceId));
}

// "Update now": the next poll offers the latest release, to install right away. The
// time doubles as the press's id, so the device acts on each press once.
export async function requestUpdate(deviceId: string, now: number) {
  await db().update(schema.devices).set({ updateRequestedAt: now }).where(eq(schema.devices.id, deviceId));
  await expire(tag.device(deviceId));
}

export async function rotateDeviceToken(deviceId: string) {
  const token = newDeviceToken();
  await db().update(schema.devices).set({ tokenHash: hashToken(token) }).where(eq(schema.devices.id, deviceId));
  // The cached copy holds the old token's hash: drop it so the old token stops working.
  await expire(tag.device(deviceId));
  return token;
}

export async function deleteDevice(deviceId: string) {
  await db().delete(schema.devices).where(eq(schema.devices.id, deviceId));
  await expire(tag.device(deviceId));
}

export async function deviceTeam(deviceId: string): Promise<string | null> {
  const rows = await db().select({ teamId: schema.devices.teamId }).from(schema.devices).where(eq(schema.devices.id, deviceId)).limit(1);
  return rows[0]?.teamId ?? null;
}
