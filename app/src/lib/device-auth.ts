import "server-only";

import { eq, sql } from "drizzle-orm";

import { db, schema } from "@/db";

import { bearerToken, tokenMatches } from "./device-token";

export type AuthedDevice = typeof schema.devices.$inferSelect;

// Looks up the device and checks its token. Returns null for an unknown device
// and for a wrong token alike, so callers can't tell which one it was.
export async function authenticateDevice(deviceId: string, authHeader: string | null): Promise<AuthedDevice | null> {
  const token = bearerToken(authHeader);
  if (!token) return null;
  const rows = await db().select().from(schema.devices).where(eq(schema.devices.id, deviceId)).limit(1);
  const device = rows[0];
  if (!device || !tokenMatches(token, device.tokenHash)) return null;
  return device;
}

type FirmwareReport = Partial<Pick<AuthedDevice, "firmwareVersion" | "board" | "firmwareFailed" | "updateRequestedAt">>;

// Also saves what the device said about its firmware, if that changed. Clearing an
// "Update now" press (updateRequestedAt: 0) only clears the one the device acted on
// (`answered`), not a newer press that came in meanwhile.
export async function markSeen(deviceId: string, firmware?: FirmwareReport | null, answered = 0) {
  const { updateRequestedAt, ...rest } = firmware ?? {};
  await db()
    .update(schema.devices)
    .set({
      lastSeenAt: new Date(),
      ...rest,
      ...(updateRequestedAt === 0 && answered
        ? {
            updateRequestedAt: sql`case when ${schema.devices.updateRequestedAt} = ${answered} then 0 else ${schema.devices.updateRequestedAt} end`,
          }
        : {}),
    })
    .where(eq(schema.devices.id, deviceId));
}

export const unauthorized = () =>
  Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
