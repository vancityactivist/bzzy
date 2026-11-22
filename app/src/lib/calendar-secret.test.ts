import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { openSecret, sealSecret } from "./calendar-secret";

const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");

afterEach(() => vi.unstubAllEnvs());

describe("calendar secrets", () => {
  it("round-trips and binds the value to its account", () => {
    vi.stubEnv("CALENDAR_KEY", k1);
    const { secret, keyId } = sealSecret("refresh-token", "acct-1");
    expect(secret).not.toContain("refresh-token");
    expect(openSecret(secret, keyId, "acct-1")).toEqual({
      plain: "refresh-token",
      stale: false,
    });
    expect(openSecret(secret, keyId, "acct-2")).toBeNull();
  });

  it("opens with the previous key after a rotation and says it's stale", () => {
    vi.stubEnv("CALENDAR_KEY", k1);
    const { secret, keyId } = sealSecret("pw", "a");
    vi.stubEnv("CALENDAR_KEY", k2);
    vi.stubEnv("CALENDAR_KEY_PREVIOUS", k1);
    expect(openSecret(secret, keyId, "a")).toEqual({
      plain: "pw",
      stale: true,
    });
    vi.stubEnv("CALENDAR_KEY_PREVIOUS", "");
    expect(openSecret(secret, keyId, "a")).toBeNull();
  });

  it("refuses to seal without a key", () => {
    vi.stubEnv("CALENDAR_KEY", "");
    expect(() => sealSecret("x", "a")).toThrow(/CALENDAR_KEY/);
  });
});
