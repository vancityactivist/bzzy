import { beforeEach, describe, expect, it } from "vitest";

import { isDark, type LiveInput, liveVersion, readTicket, signTicket, TICKET_TTL_SEC } from "./live-rules";

const NOW = 1_800_000_000;

const light = (over: Partial<LiveInput> = {}): LiveInput => ({
  data: { device: { id: "d1", name: "Desk" } },
  ownerUserId: "u1",
  defaultStatus: "free",
  presence: null,
  show: null,
  pushes: [],
  schedule: [],
  ring: { allowFlash: true, ledStyles: null, meetingWarn: null },
  hours: null,
  online: true,
  ...over,
});

describe("live tickets", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret";
    delete process.env.AUTH_SECRET_1;
  });

  it("round-trips the person and their lights", () => {
    const t = signTicket("u1", ["d1", "d2"], NOW)!;
    expect(readTicket(t, NOW + 60)).toEqual({ u: "u1", d: ["d1", "d2"], e: NOW + TICKET_TTL_SEC });
  });

  it("runs out", () => {
    const t = signTicket("u1", ["d1"], NOW)!;
    expect(readTicket(t, NOW + TICKET_TTL_SEC)).toBeNull();
  });

  it("refuses a changed body or another key", () => {
    const t = signTicket("u1", ["d1"], NOW)!;
    const [, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "u2", d: ["d1"], e: NOW + 100 })).toString("base64url");
    expect(readTicket(`${forged}.${sig}`, NOW)).toBeNull();
    process.env.AUTH_SECRET = "another";
    expect(readTicket(t, NOW)).toBeNull();
    expect(readTicket("junk", NOW)).toBeNull();
    expect(readTicket(null, NOW)).toBeNull();
  });

  it("still reads tickets signed before a new secret was added", () => {
    const t = signTicket("u1", ["d1"], NOW)!;
    process.env.AUTH_SECRET_1 = "newer";
    expect(readTicket(t, NOW)?.u).toBe("u1");
  });
});

describe("liveVersion", () => {
  it("is stable while nothing changes", () => {
    expect(liveVersion([light()], NOW)).toBe(liveVersion([light()], NOW + 600));
  });

  it("changes when the cached data does (another tab, a button press, a push)", () => {
    expect(liveVersion([light({ data: { presence: { status: "busy" } } })], NOW)).not.toBe(liveVersion([light()], NOW));
  });

  it("changes when a meeting starts, with no write", () => {
    const l = light({ schedule: [{ start: NOW + 300, end: NOW + 3600, status: "busy", text: "Standup" }] });
    expect(liveVersion([l], NOW + 299)).not.toBe(liveVersion([l], NOW + 300));
  });

  it("changes when a status or show runs out", () => {
    const presence = { active: true, status: "dnd" as const, text: "", until: NOW + 60, updatedAt: NOW - 10 };
    const show = { active: true, text: "Hi", until: NOW + 120, updatedAt: NOW, leds: null };
    const l = light({ presence, show });
    const a = liveVersion([l], NOW);
    const b = liveVersion([l], NOW + 60); // status over, show still up
    const c = liveVersion([l], NOW + 120); // show over too
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("changes when working hours end, and when the light goes offline", () => {
    const hours = [{ start: NOW - 3600, end: NOW + 60 }, { start: NOW + 86400, end: NOW + 90000 }];
    expect(liveVersion([light({ hours })], NOW)).not.toBe(liveVersion([light({ hours })], NOW + 60));
    expect(liveVersion([light({ online: false })], NOW)).not.toBe(liveVersion([light()], NOW));
  });
});

describe("isDark", () => {
  const w = [{ start: 100, end: 200 }, { start: 300, end: 400 }];
  it("matches the firmware's offHours", () => {
    expect(isDark(null, 50)).toBe(false);
    expect(isDark(w, 150)).toBe(false);
    expect(isDark(w, 250)).toBe(true);
    expect(isDark(w, 50)).toBe(true);
    expect(isDark(w, 500)).toBe(false); // every window passed: stays on
  });
});
