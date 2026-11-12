// Firmware updates (docs/ota.md), as pure functions so they can be tested without a
// database. The version rules match firmware/lib/core/src/ota_policy.cpp.

import { z } from "zod";

const VERSION_RE = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.]+))?$/;
const VERSION_MAX = 23; // firmware buffer is 24 bytes including the terminator

// "MAJOR.MINOR.PATCH" with an optional "-suffix". Anything else ("dev", missing) is a
// test build flashed over USB.
export function isReleaseVersion(v: string | null | undefined): v is string {
  return !!v && v.length <= VERSION_MAX && VERSION_RE.test(v);
}

// <0 if a is older, 0 if the same, >0 if newer. "1.2.0-rc.1" is older than "1.2.0".
export function compareVersions(a: string, b: string): number {
  const pa = VERSION_RE.exec(a);
  const pb = VERSION_RE.exec(b);
  if (!pa || !pb) return 0;
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return Math.sign(d);
  }
  const sa = pa[4];
  const sb = pb[4];
  if (sa === sb) return 0;
  if (sa === undefined) return 1;
  if (sb === undefined) return -1;
  // Byte order, like the firmware's strcmp.
  return sa < sb ? -1 : 1;
}

export const manifestSchema = z.object({
  schema: z.literal(1),
  version: z.string().refine(isReleaseVersion, "not a release version"),
  tag: z.string(),
  boards: z.record(
    z.string(),
    z.object({
      file: z.string(),
      size: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      sig: z.string().min(1).max(127),
    }),
  ),
});
export type ReleaseManifest = z.infer<typeof manifestSchema>;

// What the poll response carries when the device should update ("firmware").
export type FirmwareOffer = {
  version: string;
  url: string; // the app's /firmware route, which redirects to the file
  size: number;
  sha256: string;
  sig: string;
  now: number; // the "Update now" press it answers (unix seconds), or 0 for an automatic update
};

export type DeviceFirmware = {
  autoUpdate: boolean;
  firmwareVersion: string | null;
  board: string | null;
  firmwareFailed: string | null;
  updateRequestedAt: number;
};

// "Update now" is answered for this long; after that the press is treated as stale.
export const UPDATE_NOW_WINDOW_SEC = 30 * 60;

// The release's file for this device, if it should have it.
export function releaseFor(manifest: ReleaseManifest | null | undefined, device: DeviceFirmware) {
  if (!manifest || !device.board) return null;
  const file = manifest.boards[device.board];
  if (!file) return null;
  const running = device.firmwareVersion;
  // Never offer the same or an older version (the device would refuse it anyway).
  if (isReleaseVersion(running) && compareVersions(manifest.version, running) <= 0) return null;
  return file;
}

// Whether "Update now" was pressed recently enough to still count.
export function updateRequested(device: DeviceFirmware, now: number) {
  return device.updateRequestedAt > 0 && now - device.updateRequestedAt < UPDATE_NOW_WINDOW_SEC;
}

// The update to send in this poll response, or null. The device has its own rules on
// top (quiet moments, rolled-back versions, test builds); this only decides whether
// to tell it about the release at all.
export function firmwareOffer(opts: {
  manifest: ReleaseManifest | null | undefined;
  device: DeviceFirmware;
  now: number;
  url: (version: string) => string;
}): FirmwareOffer | null {
  const { manifest, device, now } = opts;
  const file = releaseFor(manifest, device);
  if (!manifest || !file) return null;
  const asked = updateRequested(device, now);
  if (!device.autoUpdate && !asked) return null;
  // A test build only updates when someone asks, and a version that rolled back only
  // when someone asks again. Saves the device a pointless offer.
  if (!asked && (!isReleaseVersion(device.firmwareVersion) || device.firmwareFailed === manifest.version)) return null;
  return {
    version: manifest.version,
    url: opts.url(manifest.version),
    size: file.size,
    sha256: file.sha256,
    sig: file.sig,
    now: asked ? device.updateRequestedAt : 0,
  };
}

// For the Devices page.
export type FirmwareState =
  | { kind: "unknown" } // the device hasn't said (never connected, or firmware from before updates)
  | { kind: "current"; version: string }
  | { kind: "test"; latest: string | null } // a build flashed over USB
  | { kind: "available"; version: string; latest: string }
  | { kind: "updating"; version: string | null; latest: string }
  | { kind: "failed"; version: string; latest: string }
  | { kind: "unsupported"; version: string }; // no file for this board in the release

export function firmwareState(device: DeviceFirmware, manifest: ReleaseManifest | null | undefined, now: number): FirmwareState {
  const running = device.firmwareVersion;
  if (!running) return { kind: "unknown" };
  const latest = manifest?.version ?? null;
  const file = releaseFor(manifest, device);
  if (!isReleaseVersion(running)) {
    if (latest && file && updateRequested(device, now)) return { kind: "updating", version: null, latest };
    return { kind: "test", latest: file ? latest : null };
  }
  if (!latest || !file) {
    if (latest && compareVersions(latest, running) > 0 && device.board && !manifest?.boards[device.board]) {
      return { kind: "unsupported", version: running };
    }
    return { kind: "current", version: running };
  }
  if (updateRequested(device, now)) return { kind: "updating", version: running, latest };
  if (device.firmwareFailed === latest) return { kind: "failed", version: running, latest };
  return { kind: "available", version: running, latest };
}

// Device headers on each poll, cleaned up. Anything odd is dropped rather than stored.
export function readFirmwareHeaders(h: Headers) {
  const clean = (v: string | null, max: number) => (v && v.length <= max && /^[\w.\-+]+$/.test(v) ? v : null);
  return {
    version: clean(h.get("x-bzzy-firmware"), VERSION_MAX),
    board: clean(h.get("x-bzzy-board"), 40),
    failed: clean(h.get("x-bzzy-update-failed"), VERSION_MAX),
    // The last "Update now" press the device acted on (installed, then kept or rolled back).
    nowId: /^\d{1,10}$/.test(h.get("x-bzzy-update-now") ?? "") ? Number(h.get("x-bzzy-update-now")) : 0,
  };
}

// What to save from a poll's headers, or null if nothing changed. Firmware from before
// updates sends no headers, and leaves the row alone.
export function firmwarePatch(device: DeviceFirmware, r: ReturnType<typeof readFirmwareHeaders>): Partial<DeviceFirmware> | null {
  if (!r.version) return null;
  const patch: Partial<DeviceFirmware> = {};
  if (r.version !== device.firmwareVersion) patch.firmwareVersion = r.version;
  if (r.board !== device.board) patch.board = r.board;
  if (r.failed !== device.firmwareFailed) patch.firmwareFailed = r.failed;
  // The device acted on the latest "Update now": it's done, whichever way it went.
  if (device.updateRequestedAt > 0 && r.nowId === device.updateRequestedAt) patch.updateRequestedAt = 0;
  return Object.keys(patch).length ? patch : null;
}
