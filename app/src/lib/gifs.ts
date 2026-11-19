import "server-only";

import { del, get, put } from "@vercel/blob";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db";

import { expire, tag } from "./cache";

import builtinList from "./builtin-gifs.json";
import { type GifLink, GifLinkError, isGifHost, mediaFromPage, parseGifLink } from "./gif-link";
import { GifError, MAX_LINK_BYTES, processUpload } from "./gif-process";
import { STATUSES, type Status } from "./protocol";
import { FetchRefused, fetchPublicBytes } from "./safe-fetch";
import { forgetChoice } from "./gif-prefs";
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
  return storeGif(userId, displayName, name, await processUpload(file));
}

const GIF_ACCEPT = "image/gif, image/webp;q=0.9, image/*;q=0.8";

// A GIF from a pasted GIPHY or Tenor link, through the same resize-and-store steps as
// an upload. Returns its id and the name it was saved under. Throws GifError with a
// message to show.
export async function importGifFromLink(userId: string, displayName: string, name: string, raw: string) {
  let link: GifLink;
  try {
    link = parseGifLink(raw);
    if (link.media.length === 0 && link.page) {
      const page = await fetchPublicBytes(link.page, { allowHost: isGifHost, maxBytes: 2 * 1024 * 1024, accept: "text/html" });
      if (page.contentType.startsWith("image/")) {
        // A short link that went straight to the GIF.
        const processed = await processUpload(page.bytes, MAX_LINK_BYTES);
        const saved = name || link.name || "My GIF";
        return { id: await storeGif(userId, displayName, saved, processed), name: saved };
      }
      link = { ...link, ...relinked(link, page.url, new TextDecoder().decode(page.bytes)) };
    }
  } catch (err) {
    throw asGifError(err);
  }

  let lastError: unknown = null;
  for (const url of link.media) {
    try {
      const file = await fetchPublicBytes(url, { allowHost: isGifHost, maxBytes: MAX_LINK_BYTES, accept: GIF_ACCEPT });
      const processed = await processUpload(file.bytes, MAX_LINK_BYTES);
      const saved = name || link.name || "My GIF";
      return { id: await storeGif(userId, displayName, saved, processed), name: saved };
    } catch (err) {
      // Too big or too long: GIPHY has a smaller rendition to try next.
      lastError = err;
      if (!(err instanceof GifError || err instanceof FetchRefused)) throw err;
    }
  }
  throw asGifError(lastError);
}

function relinked(link: GifLink, pageUrl: URL, html: string): Pick<GifLink, "media" | "name"> {
  // gph.is and tenor short links: the page we landed on names the GIF better.
  let better: GifLink | null = null;
  try {
    better = parseGifLink(pageUrl.toString());
  } catch {}
  return {
    media: better?.media.length ? better.media : mediaFromPage(link.provider, pageUrl, html),
    name: link.name || better?.name || "",
  };
}

function asGifError(err: unknown): Error {
  if (err instanceof GifError) return err;
  if (err instanceof GifLinkError || err instanceof FetchRefused) return new GifError(err.message);
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return new GifError("The GIF site took too long to answer. Try again.");
  }
  return err instanceof Error ? err : new Error(String(err));
}

async function storeGif(userId: string, displayName: string, name: string, { gif, sha }: { gif: Buffer; sha: string }) {
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

// A GIF someone picked in the app, checked: a built-in one, or an upload from one of
// their teams. null for anything else.
export async function checkGifChoice(
  userId: string,
  choice: GifChoice,
): Promise<{ assetId: string | null; builtin: string | null } | null> {
  if (choice.startsWith("builtin:")) {
    const id = choice.slice(8);
    return builtinById.has(id) ? { assetId: null, builtin: id } : null;
  }
  if (choice.startsWith("asset:")) {
    const asset = await canSeeAsset(userId, choice.slice(6));
    return asset ? { assetId: asset.id, builtin: null } : null;
  }
  return null;
}

export function builtinGif(id: string): ResolvedGif {
  const g = builtinById.get(id);
  return g ? { kind: "builtin", id: g.id, name: g.name, sha: g.sha, path: g.path } : null;
}

// The upload, if this person may change it: its uploader, or a team owner/admin.
async function editableAsset(userId: string, assetId: string) {
  const rows = await db().select().from(schema.assets).where(eq(schema.assets.id, assetId)).limit(1);
  const asset = rows[0];
  if (!asset) return null;
  const teams = await teamsForUser(userId);
  const team = teams.find((t) => t.id === asset.teamId);
  if (!team || (asset.uploadedBy !== userId && team.role === "member")) return null;
  return asset;
}

/** Whether this person may rename or delete each upload, by id. */
export async function editableAssets(userId: string, assets: { id: string; teamId: string; uploadedBy: string | null }[]) {
  const teams = new Map((await teamsForUser(userId)).map((t) => [t.id, t.role]));
  return new Set(assets.filter((a) => a.uploadedBy === userId || (teams.has(a.teamId) && teams.get(a.teamId) !== "member")).map((a) => a.id));
}

export async function renameGif(userId: string, assetId: string, name: string): Promise<boolean> {
  const asset = await editableAsset(userId, assetId);
  if (!asset) return false;
  await db().update(schema.assets).set({ name }).where(eq(schema.assets.id, assetId));
  await expire(tag.asset(assetId), tag.team(asset.teamId));
  return true;
}

// Uploader or a team owner/admin may delete.
export async function deleteGif(userId: string, assetId: string): Promise<boolean> {
  const asset = await editableAsset(userId, assetId);
  if (!asset) return false;
  await db().delete(schema.assets).where(eq(schema.assets.id, assetId));
  await forgetChoice(`asset:${assetId}`);
  await expire(tag.asset(assetId), tag.team(asset.teamId));
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

// ---- the GIF for each status (part of a person's look) ----

export async function userGifChoices(userId: string): Promise<Record<Status, GifChoice>> {
  const rows = await db().select().from(schema.userGifs).where(eq(schema.userGifs.userId, userId));
  const out = Object.fromEntries(STATUSES.map((s) => [s, "default"])) as Record<Status, GifChoice>;
  for (const r of rows) {
    out[r.status] = r.assetId ? `asset:${r.assetId}` : r.builtin ? `builtin:${r.builtin}` : "none";
  }
  return out;
}

// Any upload the person can see (theirs, or one from a team they're in) can go on any of
// their lights, whatever team the light is in.
export async function setUserGif(userId: string, status: Status, choice: GifChoice): Promise<boolean> {
  const where = and(eq(schema.userGifs.userId, userId), eq(schema.userGifs.status, status));
  if (choice === "default") {
    await db().delete(schema.userGifs).where(where);
    await expire(tag.user(userId));
    return true;
  }
  let assetId: string | null = null;
  let builtin: string | null = null;
  if (choice !== "none") {
    const checked = await checkGifChoice(userId, choice);
    if (!checked) return false;
    ({ assetId, builtin } = checked);
  }
  await db()
    .insert(schema.userGifs)
    .values({ userId, status, assetId, builtin })
    .onConflictDoUpdate({ target: [schema.userGifs.userId, schema.userGifs.status], set: { assetId, builtin } });
  await expire(tag.user(userId));
  return true;
}

// What each status shows on this person's lights, after defaults.
export async function resolveUserGifs(userId: string): Promise<Record<Status, ResolvedGif>> {
  const rows = await db()
    .select({ status: schema.userGifs.status, builtin: schema.userGifs.builtin, asset: schema.assets })
    .from(schema.userGifs)
    .leftJoin(schema.assets, eq(schema.assets.id, schema.userGifs.assetId))
    .where(eq(schema.userGifs.userId, userId));
  const byStatus = new Map(rows.map((r) => [r.status, r]));

  return Object.fromEntries(
    STATUSES.map((s) => {
      const r = byStatus.get(s);
      if (!r) return [s, builtinGif(DEFAULT_BUILTIN[s])];
      if (r.asset) return [s, { kind: "asset", id: r.asset.id, name: r.asset.name, sha: r.asset.sha } satisfies ResolvedGif];
      if (r.builtin) return [s, builtinGif(r.builtin)];
      return [s, null];
    }),
  ) as Record<Status, ResolvedGif>;
}

// Which upload a light may download for a status: one its owner picked for a status.
export async function lookMayFetch(ownerUserId: string, assetId: string) {
  const rows = await db()
    .select({ blobUrl: schema.assets.blobUrl })
    .from(schema.userGifs)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.userGifs.assetId))
    .where(and(eq(schema.userGifs.userId, ownerUserId), eq(schema.userGifs.assetId, assetId)))
    .limit(1);
  return rows[0]?.blobUrl ?? null;
}

// Where the app's own pages load a resolved GIF from, for previews.
export function previewSrc(g: ResolvedGif): string | null {
  if (!g) return null;
  return g.kind === "builtin" ? g.path : `/api/gifs/${g.id}`;
}

// What a brand-new device shows, before anyone picks GIFs.
export function defaultPreviewSrcs(): Record<Status, string | null> {
  return Object.fromEntries(STATUSES.map((s) => [s, builtinById.get(DEFAULT_BUILTIN[s])?.path ?? null])) as Record<
    Status,
    string | null
  >;
}
