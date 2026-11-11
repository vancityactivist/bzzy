import "server-only";

import { del, get, put } from "@vercel/blob";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db";

import builtinList from "./builtin-gifs.json";
import { processUpload } from "./gif-process";
import { STATUSES, type Status } from "./protocol";
import { ensurePersonalTeam, teamsForUser } from "./teams";

export type BuiltinGif = { id: string; name: string; status: Status | null; path: string; sha: string; bytes: number };
export const BUILTIN_GIFS = builtinList as BuiltinGif[];
const builtinById = new Map(BUILTIN_GIFS.map((g) => [g.id, g]));

// The GIF each status gets on a new device.
export const DEFAULT_BUILTIN: Record<Status, string> = {
  free: "free-ripple",
  busy: "busy-pulse",
  dnd: "dnd-sign",
  away: "away-orbit",
};

// "default" | "none" | "builtin:<id>" | "asset:<id>"
export type GifChoice = string;

export type ResolvedGif =
  | { kind: "builtin"; id: string; name: string; sha: string; path: string }
  | { kind: "asset"; id: string; name: string; sha: string }
  | null;

// Uploads live in a private Blob store; the app hands them out itself.
const ACCESS = "private" as const;

export async function uploadGif(userId: string, displayName: string, name: string, file: Uint8Array) {
  const { gif, sha } = await processUpload(file);
  const teamId = await ensurePersonalTeam(userId, displayName);
  const id = crypto.randomUUID();
  const blob = await put(`gifs/${teamId}/${id}.gif`, gif, { access: ACCESS, contentType: "image/gif", addRandomSuffix: true });
  await db().insert(schema.assets).values({ id, teamId, uploadedBy: userId, name, blobUrl: blob.url, bytes: gif.byteLength, sha });
  return id;
}

export async function gifsForUser(userId: string) {
  const teams = await teamsForUser(userId);
  if (teams.length === 0) return [];
  return db()
    .select()
    .from(schema.assets)
    .where(inArray(schema.assets.teamId, teams.map((t) => t.id)))
    .orderBy(desc(schema.assets.createdAt));
}

// Uploader or a team owner/admin may delete.
export async function deleteGif(userId: string, assetId: string): Promise<boolean> {
  const rows = await db().select().from(schema.assets).where(eq(schema.assets.id, assetId)).limit(1);
  const asset = rows[0];
  if (!asset) return false;
  const teams = await teamsForUser(userId);
  const team = teams.find((t) => t.id === asset.teamId);
  if (!team || (asset.uploadedBy !== userId && team.role === "member")) return false;
  await db().delete(schema.assets).where(eq(schema.assets.id, assetId));
  await del(asset.blobUrl).catch(() => {}); // the row is what matters; a stray blob is harmless
  return true;
}

export async function canSeeAsset(userId: string, assetId: string) {
  const rows = await db().select().from(schema.assets).where(eq(schema.assets.id, assetId)).limit(1);
  const asset = rows[0];
  if (!asset) return null;
  const teams = await teamsForUser(userId);
  return teams.some((t) => t.id === asset.teamId) ? asset : null;
}

export async function openAsset(blobUrl: string) {
  return get(blobUrl, { access: ACCESS });
}

// ---- per-device choices ----

export async function deviceGifChoices(deviceId: string): Promise<Record<Status, GifChoice>> {
  const rows = await db().select().from(schema.deviceAssets).where(eq(schema.deviceAssets.deviceId, deviceId));
  const out = Object.fromEntries(STATUSES.map((s) => [s, "default"])) as Record<Status, GifChoice>;
  for (const r of rows) {
    out[r.status] = r.assetId ? `asset:${r.assetId}` : r.builtin ? `builtin:${r.builtin}` : "none";
  }
  return out;
}

export async function setDeviceGif(deviceId: string, deviceTeamId: string, status: Status, choice: GifChoice): Promise<boolean> {
  const where = and(eq(schema.deviceAssets.deviceId, deviceId), eq(schema.deviceAssets.status, status));
  if (choice === "default") {
    await db().delete(schema.deviceAssets).where(where);
    return true;
  }
  let assetId: string | null = null;
  let builtin: string | null = null;
  if (choice.startsWith("builtin:")) {
    builtin = choice.slice(8);
    if (!builtinById.has(builtin)) return false;
  } else if (choice.startsWith("asset:")) {
    assetId = choice.slice(6);
    // Only GIFs from the device's own team.
    const rows = await db()
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(and(eq(schema.assets.id, assetId), eq(schema.assets.teamId, deviceTeamId)))
      .limit(1);
    if (!rows[0]) return false;
  } else if (choice !== "none") {
    return false;
  }
  await db()
    .insert(schema.deviceAssets)
    .values({ deviceId, status, assetId, builtin })
    .onConflictDoUpdate({ target: [schema.deviceAssets.deviceId, schema.deviceAssets.status], set: { assetId, builtin } });
  return true;
}

// What each status shows on a device, after defaults.
export async function resolveDeviceGifs(deviceId: string): Promise<Record<Status, ResolvedGif>> {
  const rows = await db()
    .select({ status: schema.deviceAssets.status, builtin: schema.deviceAssets.builtin, asset: schema.assets })
    .from(schema.deviceAssets)
    .leftJoin(schema.assets, eq(schema.assets.id, schema.deviceAssets.assetId))
    .where(eq(schema.deviceAssets.deviceId, deviceId));
  const byStatus = new Map(rows.map((r) => [r.status, r]));

  const fromBuiltin = (id: string): ResolvedGif => {
    const g = builtinById.get(id);
    return g ? { kind: "builtin", id: g.id, name: g.name, sha: g.sha, path: g.path } : null;
  };

  return Object.fromEntries(
    STATUSES.map((s) => {
      const r = byStatus.get(s);
      if (!r) return [s, fromBuiltin(DEFAULT_BUILTIN[s])];
      if (r.asset) return [s, { kind: "asset", id: r.asset.id, name: r.asset.name, sha: r.asset.sha } satisfies ResolvedGif];
      if (r.builtin) return [s, fromBuiltin(r.builtin)];
      return [s, null];
    }),
  ) as Record<Status, ResolvedGif>;
}

// Which upload a device is allowed to download: one it's set to show.
export async function deviceMayFetch(deviceId: string, assetId: string) {
  const rows = await db()
    .select({ blobUrl: schema.assets.blobUrl })
    .from(schema.deviceAssets)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.deviceAssets.assetId))
    .where(and(eq(schema.deviceAssets.deviceId, deviceId), eq(schema.deviceAssets.assetId, assetId)))
    .limit(1);
  return rows[0]?.blobUrl ?? null;
}
