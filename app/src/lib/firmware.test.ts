import { describe, expect, it } from "vitest";

import {
  compareVersions,
  type DeviceFirmware,
  firmwareOffer,
  firmwarePatch,
  firmwareState,
  isReleaseVersion,
  manifestSchema,
  readFirmwareHeaders,
  type ReleaseManifest,
} from "./firmware";

const NOW = 1_762_891_200;
const BOARD = "waveshare_s3_touch_lcd169";

const manifest: ReleaseManifest = {
  schema: 1,
  version: "0.3.0",
  tag: "fw-v0.3.0",
  boards: {
    [BOARD]: { file: `bzzy-${BOARD}-0.3.0.bin`, size: 1_234_567, sha256: "a".repeat(64), sig: "MEUCIQ==" },
  },
};

const device = (d: Partial<DeviceFirmware> = {}): DeviceFirmware => ({
  autoUpdate: true,
  firmwareVersion: "0.2.0",
  board: BOARD,
  firmwareFailed: null,
  updateRequestedAt: 0,
  ...d,
});

const url = (v: string) => `https://bzzy.ca/api/device/bz-ab12cd/firmware/${v}`;
const offer = (d: Partial<DeviceFirmware>, m: ReleaseManifest | null = manifest) =>
  firmwareOffer({ manifest: m, device: device(d), now: NOW, url });

describe("versions (same rules as the firmware's ota_policy)", () => {
  it("knows a release version from a test build", () => {
    expect(isReleaseVersion("0.2.0")).toBe(true);
    expect(isReleaseVersion("12.3.45-rc.1")).toBe(true);
    for (const v of ["", "dev", "1.2", "1.2.3.", "v1.2.3", "1.2.3-", null, undefined]) expect(isReleaseVersion(v)).toBe(false);
  });

  it("orders them", () => {
    expect(compareVersions("0.2.0", "0.10.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "0.99.99")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.0-rc.1", "1.2.0")).toBeLessThan(0);
    expect(compareVersions("1.2.0-rc.2", "1.2.0-rc.1")).toBeGreaterThan(0);
  });
});

describe("firmwareOffer", () => {
  it("offers a newer release with auto-update on", () => {
    expect(offer({})).toEqual({
      version: "0.3.0",
      url: url("0.3.0"),
      size: 1_234_567,
      sha256: "a".repeat(64),
      sig: "MEUCIQ==",
      now: 0,
    });
  });

  it("offers nothing when it's current, newer, or the board isn't in the release", () => {
    expect(offer({ firmwareVersion: "0.3.0" })).toBeNull();
    expect(offer({ firmwareVersion: "0.4.0" })).toBeNull();
    expect(offer({ board: "esp32_generic" })).toBeNull();
    expect(offer({ board: null })).toBeNull();
    expect(offer({}, null)).toBeNull();
  });

  it("waits for Update now when auto-update is off", () => {
    expect(offer({ autoUpdate: false })).toBeNull();
    expect(offer({ autoUpdate: false, updateRequestedAt: NOW - 30 })?.now).toBe(NOW - 30);
  });

  it("ignores an old Update now press", () => {
    expect(offer({ autoUpdate: false, updateRequestedAt: NOW - 3 * 3600 })).toBeNull();
  });

  it("leaves test builds and rolled-back versions alone unless asked", () => {
    expect(offer({ firmwareVersion: "dev" })).toBeNull();
    expect(offer({ firmwareVersion: "dev", updateRequestedAt: NOW - 5 })?.now).toBe(NOW - 5);
    expect(offer({ firmwareFailed: "0.3.0" })).toBeNull();
    expect(offer({ firmwareFailed: "0.3.0", updateRequestedAt: NOW - 5 })).not.toBeNull();
    expect(offer({ firmwareFailed: "0.2.5" })).not.toBeNull();
  });
});

describe("firmwareState", () => {
  const state = (d: Partial<DeviceFirmware>, m: ReleaseManifest | null = manifest) => firmwareState(device(d), m, NOW);

  it("covers each case the Devices page shows", () => {
    expect(state({ firmwareVersion: null })).toEqual({ kind: "unknown" });
    expect(state({ firmwareVersion: "0.3.0" })).toEqual({ kind: "current", version: "0.3.0" });
    expect(state({}, null)).toEqual({ kind: "current", version: "0.2.0" });
    expect(state({})).toEqual({ kind: "available", version: "0.2.0", latest: "0.3.0" });
    expect(state({ updateRequestedAt: NOW - 10 })).toEqual({ kind: "updating", version: "0.2.0", latest: "0.3.0" });
    expect(state({ firmwareFailed: "0.3.0" })).toEqual({ kind: "failed", version: "0.2.0", latest: "0.3.0" });
    expect(state({ firmwareVersion: "dev" })).toEqual({ kind: "test", latest: "0.3.0" });
    expect(state({ firmwareVersion: "dev", updateRequestedAt: NOW - 10 })).toEqual({ kind: "updating", version: null, latest: "0.3.0" });
    expect(state({ board: "esp32_generic" })).toEqual({ kind: "unsupported", version: "0.2.0" });
  });
});

describe("device headers", () => {
  const headers = (h: Record<string, string>) => readFirmwareHeaders(new Headers(h));

  it("reads what the device sends and drops junk", () => {
    expect(
      headers({ "X-Bzzy-Firmware": "0.2.0", "X-Bzzy-Board": BOARD, "X-Bzzy-Update-Failed": "0.3.0", "X-Bzzy-Update-Now": "1762891100" }),
    ).toEqual({ version: "0.2.0", board: BOARD, failed: "0.3.0", nowId: 1_762_891_100 });
    expect(headers({ "X-Bzzy-Firmware": "<script>", "X-Bzzy-Update-Now": "-1" })).toEqual({
      version: null,
      board: null,
      failed: null,
      nowId: 0,
    });
  });

  it("saves only what changed", () => {
    const r = { version: "0.2.0", board: BOARD, failed: null, nowId: 0 };
    expect(firmwarePatch(device(), r)).toBeNull();
    expect(firmwarePatch(device({ firmwareVersion: null, board: null }), r)).toEqual({ firmwareVersion: "0.2.0", board: BOARD });
    expect(firmwarePatch(device(), { ...r, version: null })).toBeNull(); // firmware from before updates
    expect(firmwarePatch(device({ firmwareFailed: "0.3.0" }), r)).toEqual({ firmwareFailed: null });
  });

  it("clears Update now once the device has acted on it", () => {
    const r = { version: "0.3.0", board: BOARD, failed: null, nowId: NOW - 60 };
    expect(firmwarePatch(device({ updateRequestedAt: NOW - 60 }), r)).toEqual({ firmwareVersion: "0.3.0", updateRequestedAt: 0 });
    expect(firmwarePatch(device({ firmwareVersion: "0.3.0", updateRequestedAt: NOW - 5 }), r)).toBeNull(); // a newer press
  });
});

describe("manifestSchema", () => {
  it("accepts what sign_release.py writes and rejects a bad version", () => {
    expect(manifestSchema.safeParse({ ...manifest, builtAt: NOW }).success).toBe(true);
    expect(manifestSchema.safeParse({ ...manifest, version: "latest" }).success).toBe(false);
  });
});
