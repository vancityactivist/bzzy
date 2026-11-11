import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db";

import { hashToken, newDeviceId, newDeviceToken } from "./device-token";
import type { Status } from "./protocol";
import { ensurePersonalTeam, roleInTeam, teamsForUser } from "./teams";

export type DeviceSummary = {
  id: string;
  name: string;
  teamName: string;
  ownerUserId: string;
  defaultStatus: Status;
  lastSeenAt: Date | null;
  canManage: boolean;
};

export async function devicesForUser(userId: string): Promise<DeviceSummary[]> {
  const teams = await teamsForUser(userId);
  if (teams.length === 0) return [];
  const rows = await db()
    .select()
    .from(schema.devices)
    .where(inArray(schema.devices.teamId, teams.map((t) => t.id)))
    .orderBy(desc(schema.devices.createdAt));
  const byId = new Map(teams.map((t) => [t.id, t]));
  return rows.map((d) => {
    const team = byId.get(d.teamId)!;
    return {
      id: d.id,
      name: d.name,
      teamName: team.name,
      ownerUserId: d.ownerUserId,
      defaultStatus: d.defaultStatus,
      lastSeenAt: d.lastSeenAt,
      canManage: d.ownerUserId === userId || team.role === "owner" || team.role === "admin",
    };
  });
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

export async function createDevice(userId: string, displayName: string, name: string) {
  const teamId = await ensurePersonalTeam(userId, displayName);
  const id = newDeviceId();
  const token = newDeviceToken();
  await db().insert(schema.devices).values({ id, teamId, ownerUserId: userId, name, tokenHash: hashToken(token) });
  return { id, token };
}

export async function rotateDeviceToken(deviceId: string) {
  const token = newDeviceToken();
  await db().update(schema.devices).set({ tokenHash: hashToken(token) }).where(eq(schema.devices.id, deviceId));
  return token;
}

export async function deleteDevice(deviceId: string) {
  await db().delete(schema.devices).where(eq(schema.devices.id, deviceId));
}
