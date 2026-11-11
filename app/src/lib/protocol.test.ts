import { describe, expect, it } from "vitest";

import { bearerToken, hashToken, newDeviceId, newDeviceToken, tokenMatches } from "./device-token";
import {
  buildState,
  clipText,
  MAX_BLOCKS,
  overrideBody,
  shouldApplyDeviceOverride,
  TEXT_MAX,
  type Presence,
} from "./protocol";

const NOW = 1_762_891_200;

const presence = (p: Partial<Presence> = {}): Presence => ({
  active: true,
  status: "busy",
  text: "",
  until: 0,
  updatedAt: NOW - 60,
  ...p,
});

describe("buildState", () => {
  it("matches the documented shape", () => {
    const s = buildState({ now: NOW, defaultStatus: "free", presence: presence({ text: "On a call" }), schedule: [] });
    expect(s).toEqual({
      v: 1,
      serverTime: NOW,
      defaultStatus: "free",
      manual: { active: true, status: "busy", text: "On a call", until: 0, updatedAt: NOW - 60 },
      schedule: [],
    });
  });

  it("drops an expired override", () => {
    const s = buildState({ now: NOW, defaultStatus: "free", presence: presence({ until: NOW - 1 }), schedule: [] });
    expect(s.manual).toBeNull();
  });

  it("keeps a cleared override so the device can see when it was cleared", () => {
    const s = buildState({ now: NOW, defaultStatus: "free", presence: presence({ active: false }), schedule: [] });
    expect(s.manual).toMatchObject({ active: false, updatedAt: NOW - 60 });
  });

  it("sends nothing for a person who has never set a status", () => {
    const s = buildState({
      now: NOW,
      defaultStatus: "free",
      presence: presence({ active: false, updatedAt: 0 }),
      schedule: [],
    });
    expect(s.manual).toBeNull();
  });

  it("drops finished blocks, sorts, and caps the schedule", () => {
    const blocks = Array.from({ length: 40 }, (_, i) => ({
      start: NOW + (40 - i) * 600,
      end: NOW + (40 - i) * 600 + 300,
      status: "busy" as const,
      text: `m${i}`,
    }));
    blocks.push({ start: NOW - 7200, end: NOW - 3600, status: "busy", text: "past" });
    const s = buildState({ now: NOW, defaultStatus: "free", presence: null, schedule: blocks });
    expect(s.schedule).toHaveLength(MAX_BLOCKS);
    expect(s.schedule.find((b) => b.text === "past")).toBeUndefined();
    for (let i = 1; i < s.schedule.length; i++) expect(s.schedule[i].start).toBeGreaterThan(s.schedule[i - 1].start);
  });
});

describe("clipText", () => {
  it("fits the firmware buffer without splitting characters", () => {
    const long = "Strata council meeting — Tower B 🏢 budget review and AGM prep";
    const clipped = clipText(long);
    expect(new TextEncoder().encode(clipped).length).toBeLessThanOrEqual(TEXT_MAX);
    expect(long.startsWith(clipped)).toBe(true);
    expect(clipText("short")).toBe("short");
  });
});

describe("device overrides", () => {
  it("validates the request body", () => {
    expect(overrideBody.safeParse({ active: true, status: "dnd", updatedAt: NOW }).success).toBe(true);
    expect(overrideBody.safeParse({ active: true, status: "on-fire", updatedAt: NOW }).success).toBe(false);
    expect(overrideBody.safeParse({ active: true, status: "dnd" }).success).toBe(false);
  });

  it("applies newer presses and ignores older or tied ones", () => {
    const current = presence({ updatedAt: NOW - 10 });
    expect(shouldApplyDeviceOverride(current, { active: true, status: "dnd", updatedAt: NOW }, NOW)).toBe(true);
    expect(shouldApplyDeviceOverride(current, { active: true, status: "dnd", updatedAt: NOW - 10 }, NOW)).toBe(false);
    expect(shouldApplyDeviceOverride(current, { active: true, status: "dnd", updatedAt: NOW - 20 }, NOW)).toBe(false);
    expect(shouldApplyDeviceOverride(null, { active: true, status: "dnd", updatedAt: NOW }, NOW)).toBe(true);
  });

  it("rejects presses from a device clock far in the future", () => {
    expect(shouldApplyDeviceOverride(null, { active: true, status: "dnd", updatedAt: NOW + 3600 }, NOW)).toBe(false);
  });
});

describe("device tokens", () => {
  it("makes typeable ids and tokens", () => {
    expect(newDeviceId()).toMatch(/^bz-[2-9a-z]{6}$/);
    expect(newDeviceToken()).toMatch(/^[2-9a-z]{32}$/);
    expect(newDeviceToken()).not.toEqual(newDeviceToken());
  });

  it("verifies against the stored hash only", () => {
    const token = newDeviceToken();
    const stored = hashToken(token);
    expect(tokenMatches(token, stored)).toBe(true);
    expect(tokenMatches(token + "x", stored)).toBe(false);
    expect(tokenMatches(token, "not-hex")).toBe(false);
  });

  it("parses the Authorization header", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
    expect(bearerToken("bearer   abc123 ")).toBe("abc123");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
