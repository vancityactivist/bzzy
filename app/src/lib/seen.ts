import "server-only";

import { cacheGet, cacheSet, expire, tag } from "./cache";
import { type AuthedDevice, markSeen } from "./device-auth";
import { SEEN_DB_EVERY_MS, SEEN_WRITE_EVERY_MS, shouldMarkSeen } from "./poll-writes";

// When each light last polled. The live value is in the runtime cache (refreshed about
// once a minute); the database copy is only brought up to date every few hours, so a
// poll doesn't wake Postgres just to say "still here". Pages read both and take the newer.
type Seen = { at: number; db: number };

const key = (deviceId: string) => `seen:${deviceId}`;
const SEEN_TTL_SEC = 7 * 24 * 3600;

type FirmwareReport = Parameters<typeof markSeen>[1];

export async function noteSeen(device: Pick<AuthedDevice, "id" | "lastSeenAt" | "updateRequestedAt">, nowMs: number, firmware: FirmwareReport) {
  const saved = await cacheGet<Seen>(key(device.id));
  const dbAt = Math.max(saved?.db ?? 0, device.lastSeenAt?.getTime() ?? 0);
  const hasFirmwareNews = !!firmware && Object.keys(firmware).length > 0;
  const writeDb = hasFirmwareNews || shouldMarkSeen(dbAt ? new Date(dbAt) : null, nowMs, false, SEEN_DB_EVERY_MS);
  if (writeDb) {
    await markSeen(device.id, firmware, device.updateRequestedAt);
    // The cached copy of the device holds the firmware fields it just reported.
    if (hasFirmwareNews) await expire(tag.device(device.id));
  }
  if (writeDb || shouldMarkSeen(saved ? new Date(saved.at) : null, nowMs, false, SEEN_WRITE_EVERY_MS)) {
    await cacheSet(key(device.id), { at: nowMs, db: writeDb ? nowMs : dbAt } satisfies Seen, SEEN_TTL_SEC);
  }
}

// The newest "last seen" for each light, from the cache where it's newer than the database.
export async function liveSeen<T extends { id: string; lastSeenAt: Date | null }>(devices: T[]): Promise<T[]> {
  const seen = await Promise.all(devices.map((d) => cacheGet<Seen>(key(d.id))));
  return devices.map((d, i) => {
    const at = seen[i]?.at;
    if (typeof at !== "number" || (d.lastSeenAt && d.lastSeenAt.getTime() >= at)) return d;
    return { ...d, lastSeenAt: new Date(at) };
  });
}
