import { describe, expect, it } from "vitest";

import {
  apiStatus,
  decodeScopes,
  describeSource,
  encodeScopes,
  endTime,
  looksLikeApiToken,
  newApiToken,
  newTokenInput,
  rateWindow,
  sameStatus,
  showBody,
  statusBody,
  TOKEN_PREFIX,
  tokenExpiry,
  tokenUsable,
} from "./api-rules";

const bytes = (seed: number) => (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 97 + seed) % 256);

describe("API tokens", () => {
  it("makes prefixed base62 tokens that it recognises", () => {
    const t = newApiToken(bytes(3));
    expect(t.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(t).toHaveLength(TOKEN_PREFIX.length + 43);
    expect(looksLikeApiToken(t)).toBe(true);
    expect(newApiToken(bytes(4))).not.toBe(t);
  });

  it("skips biased bytes instead of folding them", () => {
    // All 255s would be skipped forever; mixing in good bytes still fills the token.
    let call = 0;
    const t = newApiToken((n) => Uint8Array.from({ length: n }, (_, i) => (call++ === 0 ? 255 : i % 62)));
    expect(looksLikeApiToken(t)).toBe(true);
  });

  it("rejects things that aren't tokens", () => {
    expect(looksLikeApiToken("")).toBe(false);
    expect(looksLikeApiToken("bzzy_pat_short")).toBe(false);
    expect(looksLikeApiToken(`bzzy_pat_${"a".repeat(42)}!`)).toBe(false);
    expect(looksLikeApiToken(`other_pat${"a".repeat(43)}`)).toBe(false);
  });

  it("stores scopes sorted and drops unknown ones", () => {
    expect(encodeScopes(["status", "read", "status"])).toBe("read,status");
    expect(decodeScopes("status,read,push,nonsense")).toEqual(["push", "read", "status"]);
  });

  it("checks the new-token form", () => {
    expect(newTokenInput.safeParse({ name: "Deck", scopes: ["status"], expiryDays: "365" }).success).toBe(true);
    expect(newTokenInput.safeParse({ name: "Deck", scopes: [], expiryDays: "365" }).success).toBe(false);
    expect(newTokenInput.safeParse({ name: "Deck", scopes: ["status"], expiryDays: "12" }).success).toBe(false);
    expect(newTokenInput.safeParse({ name: " ", scopes: ["status"], expiryDays: "0" }).success).toBe(false);
  });

  it("knows when a token works", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    expect(tokenExpiry(0, now)).toBeNull();
    expect(tokenExpiry(30, now)?.toISOString()).toBe("2026-12-15T12:00:00.000Z");
    expect(tokenUsable({ expiresAt: null, revokedAt: null }, now)).toBe(true);
    expect(tokenUsable({ expiresAt: new Date(now.getTime() + 1), revokedAt: null }, now)).toBe(true);
    expect(tokenUsable({ expiresAt: now, revokedAt: null }, now)).toBe(false);
    expect(tokenUsable({ expiresAt: null, revokedAt: now }, now)).toBe(false);
  });
});

describe("request bodies", () => {
  const now = 1_800_000_000;

  it("reads minutes, until, or neither", () => {
    expect(endTime({}, now)).toEqual({ ok: true, until: 0 });
    expect(endTime({ minutes: 45 }, now)).toEqual({ ok: true, until: now + 2700 });
    expect(endTime({ until: new Date((now + 600) * 1000).toISOString() }, now)).toEqual({ ok: true, until: now + 600 });
    expect(endTime({ until: "2027-01-15T09:30:00-07:00" }, Math.floor(Date.parse("2027-01-15T09:00:00-07:00") / 1000))).toMatchObject({ ok: true });
  });

  it("refuses both, the past, and more than a week ahead", () => {
    expect(endTime({ minutes: 5, until: new Date((now + 600) * 1000).toISOString() }, now)).toMatchObject({ ok: false, field: "until" });
    expect(endTime({ until: new Date((now - 1) * 1000).toISOString() }, now)).toMatchObject({ ok: false });
    expect(endTime({ until: new Date((now + 8 * 86400) * 1000).toISOString() }, now)).toMatchObject({ ok: false });
  });

  it("checks status bodies strictly", () => {
    expect(statusBody.parse({ status: "busy" })).toEqual({ status: "busy", text: "" });
    expect(statusBody.safeParse({ status: "lunch" }).success).toBe(false);
    expect(statusBody.safeParse({ status: "busy", minutes: 0 }).success).toBe(false);
    expect(statusBody.safeParse({ status: "busy", minutes: 7 * 24 * 60 + 1 }).success).toBe(false);
    expect(statusBody.safeParse({ status: "busy", until: "tomorrow" }).success).toBe(false);
    // A typo shouldn't be ignored silently.
    expect(statusBody.safeParse({ status: "busy", minuts: 5 }).success).toBe(false);
  });

  it("checks show bodies", () => {
    expect(showBody.parse({ text: "Back at 2" })).toEqual({ text: "Back at 2", gif: null, ring: null });
    expect(showBody.safeParse({ text: "x", ring: { pattern: "pulse", color: "#FF0000" } }).data?.ring).toEqual({ pattern: "pulse", color: "#ff0000" });
    expect(showBody.safeParse({ ring: { pattern: "disco" } }).success).toBe(false);
  });

  it("spots a status that's already set", () => {
    const p = { active: true, status: "busy" as const, text: "On a call", until: 0, updatedAt: now - 60 };
    expect(sameStatus(p, { status: "busy", text: "On a call", until: 0 }, now)).toBe(true);
    expect(sameStatus(p, { status: "busy", text: "", until: 0 }, now)).toBe(false);
    expect(sameStatus(p, { status: "dnd", text: "On a call", until: 0 }, now)).toBe(false);
    expect(sameStatus({ ...p, active: false }, { status: "busy", text: "On a call", until: 0 }, now)).toBe(false);
    // An override that has run out is no longer set.
    expect(sameStatus({ ...p, until: now - 1 }, { status: "busy", text: "On a call", until: now - 1 }, now)).toBe(false);
    expect(sameStatus(null, { status: "busy", text: "", until: 0 }, now)).toBe(false);
  });
});

describe("rate windows", () => {
  it("counts per minute and says when the window resets", () => {
    expect(rateWindow(60_000)).toEqual({ id: 1, resetSec: 60 });
    expect(rateWindow(119_500)).toEqual({ id: 1, resetSec: 1 });
    expect(rateWindow(90_000).resetSec).toBe(30);
  });
});

describe("the status as the API describes it", () => {
  const now = 1_800_000_000;
  const meeting = { start: now - 600, end: now + 1200, status: "busy" as const, text: "Standup" };
  const later = { start: now + 3600, end: now + 5400, status: "away" as const, text: "Out of office" };

  it("puts a manual override first", () => {
    const s = apiStatus({
      now,
      defaultStatus: "free",
      presence: { active: true, status: "dnd", text: "Focus", until: now + 900, updatedAt: now - 10 },
      presenceSource: "api:Stream Deck",
      schedule: [meeting, later],
      offHours: false,
    });
    expect(s).toMatchObject({ status: "dnd", source: "manual", text: "Focus", until: new Date((now + 900) * 1000).toISOString() });
    expect(s.manual).toMatchObject({ status: "dnd", setBy: "api:Stream Deck" });
    expect(s.meeting?.text).toBe("Standup");
    expect(s.next?.status).toBe("away");
  });

  it("follows the calendar, then the default", () => {
    const cal = apiStatus({ now, defaultStatus: "free", presence: null, presenceSource: null, schedule: [meeting], offHours: false });
    expect(cal).toMatchObject({ status: "busy", source: "calendar", manual: null });
    const def = apiStatus({ now, defaultStatus: "away", presence: null, presenceSource: null, schedule: [later], offHours: true });
    expect(def).toMatchObject({ status: "away", source: "default", meeting: null, offHours: true });
    expect(def.until).toBe(new Date(later.start * 1000).toISOString());
  });

  it("ignores an expired override", () => {
    const s = apiStatus({
      now,
      defaultStatus: "free",
      presence: { active: true, status: "dnd", text: "", until: now - 1, updatedAt: now - 100 },
      presenceSource: "web",
      schedule: [],
      offHours: false,
    });
    expect(s).toMatchObject({ status: "free", source: "default", manual: null, until: null });
  });

  it("names who set it", () => {
    expect(describeSource("web")).toBe("app");
    expect(describeSource(null)).toBe("app");
    expect(describeSource("bz-abc123")).toBe("light");
    expect(describeSource("api:Home Assistant")).toBe("api:Home Assistant");
  });
});
