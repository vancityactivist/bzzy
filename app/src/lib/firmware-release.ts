import "server-only";

import { eq } from "drizzle-orm";
import { after } from "next/server";

import { db, schema } from "@/db";

import { manifestSchema, type ReleaseManifest } from "./firmware";

// Firmware releases live on GitHub (docs/ota.md). The repo is private, so the app
// reads them with a read-only token and hands each device a short-lived link to
// its file. With no token set it tries without one, which works for a public repo.

const REPO = process.env.FIRMWARE_REPO || "vancityactivist/bzzy";
const TOKEN = process.env.FIRMWARE_GITHUB_TOKEN || "";
const ROW_ID = "latest";
const TIMEOUT_MS = 8_000;

// Re-read the latest release when the saved copy is older than this. With ~3 polls a
// minute per device, that's at most one GitHub call every few minutes.
export const RELEASE_REFRESH_MS = 10 * 60_000;

export type ReleaseRow = typeof schema.firmwareRelease.$inferSelect;

function githubHeaders(accept = "application/vnd.github+json"): HeadersInit {
  const h: Record<string, string> = { Accept: accept, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "bzzy-app" };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

type GithubAsset = { name: string; url: string; browser_download_url: string };

// Where a release file can be downloaded right now. For a private repo that's a
// signed link that expires after a few minutes, so it's looked up when it's needed.
async function assetLocation(assetApiUrl: string): Promise<string | null> {
  if (!TOKEN) return null;
  const res = await fetch(assetApiUrl, {
    headers: githubHeaders("application/octet-stream"),
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const location = res.headers.get("location");
  await res.body?.cancel();
  return res.status >= 300 && res.status < 400 && location?.startsWith("https://") ? location : null;
}

// The saved release, or null if none has ever been read.
export async function savedRelease(): Promise<ReleaseRow | null> {
  const rows = await db().select().from(schema.firmwareRelease).where(eq(schema.firmwareRelease.id, ROW_ID)).limit(1);
  return rows[0] ?? null;
}

export function releaseIsStale(row: ReleaseRow | null, now = Date.now()) {
  return !row || now - row.checkedAt.getTime() > RELEASE_REFRESH_MS;
}

// Read the latest release (pre-releases are skipped by GitHub's "latest") and its
// manifest.json, and save them. A failure keeps the last good copy.
export async function refreshRelease(): Promise<void> {
  let update: Partial<ReleaseRow>;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 404) {
      update = { lastError: TOKEN ? "No firmware release yet." : "No release found (is FIRMWARE_GITHUB_TOKEN set?)." };
    } else if (!res.ok) {
      update = { lastError: `GitHub answered ${res.status}.` };
    } else {
      const release = (await res.json()) as { tag_name: string; assets: GithubAsset[] };
      const assets = Object.fromEntries(release.assets.map((a) => [a.name, TOKEN ? a.url : a.browser_download_url]));
      const manifestAsset = release.assets.find((a) => a.name === "manifest.json");
      if (!manifestAsset) {
        update = { lastError: `Release ${release.tag_name} has no manifest.json.` };
      } else {
        const where = TOKEN ? await assetLocation(manifestAsset.url) : manifestAsset.browser_download_url;
        const mres = where ? await fetch(where, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" }) : null;
        const parsed = mres?.ok ? manifestSchema.safeParse(await mres.json()) : null;
        if (!parsed?.success) {
          update = { lastError: `Couldn't read manifest.json from ${release.tag_name}.` };
        } else {
          const manifest: ReleaseManifest = parsed.data;
          update = { tag: release.tag_name, version: manifest.version, manifest, assets, lastError: null };
        }
      }
    }
  } catch (err) {
    update = { lastError: err instanceof Error && err.name === "TimeoutError" ? "GitHub took too long to answer." : "Couldn't reach GitHub." };
  }
  if (update.lastError) console.warn(`[firmware] ${update.lastError}`);
  const values = { ...update, checkedAt: new Date() };
  await db()
    .insert(schema.firmwareRelease)
    .values({ id: ROW_ID, ...values })
    .onConflictDoUpdate({ target: schema.firmwareRelease.id, set: values });
}

// A link the device can download its file from, for the saved release only.
export async function releaseFileUrl(row: ReleaseRow | null, version: string, board: string): Promise<string | null> {
  const file = row?.version === version ? row.manifest?.boards[board]?.file : undefined;
  const asset = file ? row?.assets[file] : undefined;
  if (!asset) return null;
  return TOKEN ? assetLocation(asset) : asset;
}

// For pages: the saved release, re-read first if it's due (waiting up to `waitMs`).
export async function releaseForPage(waitMs = 3000): Promise<ReleaseRow | null> {
  const row = await savedRelease();
  if (!releaseIsStale(row)) return row;
  const pending = refreshRelease();
  after(() => pending);
  const done = await Promise.race([pending.then(() => true), new Promise<false>((r) => setTimeout(() => r(false), waitMs))]);
  return done ? savedRelease() : row;
}
