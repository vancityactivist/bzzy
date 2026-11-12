import { describe, expect, it } from "vitest";

import { ackCount, ledStyle, pushAsShow, pushFor, pushInput, pushLeds, pushLive, type PushWho } from "./push-rules";

const now = 1_762_900_000;

function push(over: Partial<PushWho> = {}): PushWho {
  return { id: "p1", target: "all", text: "Fire drill at 3", until: 0, updatedAt: now - 60, endedAt: null, targets: [], ackedBy: [], ...over };
}

describe("pushLive", () => {
  it("is live until it ends or expires", () => {
    expect(pushLive(push(), now)).toBe(true);
    expect(pushLive(push({ until: now + 1 }), now)).toBe(true);
    expect(pushLive(push({ until: now }), now)).toBe(false);
    expect(pushLive(push({ endedAt: now - 1 }), now)).toBe(false);
  });
});

describe("pushFor", () => {
  it("picks the newest live push for the person", () => {
    const pushes = [push({ id: "a", updatedAt: now - 100 }), push({ id: "b", updatedAt: now - 50 }), push({ id: "c", updatedAt: now - 10, endedAt: now - 5 })];
    expect(pushFor(pushes, "u1", now)?.id).toBe("b");
  });
  it("skips pushes for other people", () => {
    const pushes = [push({ id: "a" }), push({ id: "b", target: "users", targets: ["u2"], updatedAt: now })];
    expect(pushFor(pushes, "u1", now)?.id).toBe("a");
    expect(pushFor(pushes, "u2", now)?.id).toBe("b");
  });
  it("skips one the person dismissed, falling back to an older one", () => {
    const pushes = [push({ id: "a", updatedAt: now - 100 }), push({ id: "b", ackedBy: ["u1"] })];
    expect(pushFor(pushes, "u1", now)?.id).toBe("a");
    expect(pushFor([push({ ackedBy: ["u1"] })], "u1", now)).toBeNull();
  });
  it("breaks ties by id so every light agrees", () => {
    const pushes = [push({ id: "a" }), push({ id: "b" })];
    expect(pushFor(pushes, "u1", now)?.id).toBe("b");
    expect(pushFor([...pushes].reverse(), "u1", now)?.id).toBe("b");
  });
});

describe("pushAsShow", () => {
  it("stays newer than the person's own status changes", () => {
    const presence = { active: true, status: "busy" as const, text: "", until: 0, updatedAt: now - 10 };
    expect(pushAsShow(push(), presence, now).updatedAt).toBe(now - 10);
    expect(pushAsShow(push(), null, now).updatedAt).toBe(now - 60);
  });
  it("ignores an expired manual status", () => {
    const presence = { active: true, status: "busy" as const, text: "", until: now - 1, updatedAt: now - 10 };
    expect(pushAsShow(push(), presence, now).updatedAt).toBe(now - 60);
  });
  it("clips the text to what fits", () => {
    expect(pushAsShow(push({ text: "x".repeat(80) }), null, now).text).toHaveLength(47);
  });
});

describe("pushLeds", () => {
  const base = { flash: "pulse" as const, color: "", speed: 2, flashFor: 30 };
  it("sends nothing without a flash", () => {
    expect(pushLeds({ ...base, flash: "none" })).toBeNull();
  });
  it("builds a style the protocol accepts", () => {
    const style = pushLeds({ ...base, color: "#FF2000" });
    expect(style).toEqual({ pattern: "pulse", speed: 2, color: "#ff2000", for: 30 });
    expect(ledStyle.parse(style)).toEqual(style);
  });
  it("leaves out for when it flashes the whole time", () => {
    expect(pushLeds({ ...base, flashFor: 0 })).toEqual({ pattern: "pulse", speed: 2 });
  });
});

describe("pushInput", () => {
  it("rejects a pattern or colour it doesn't know", () => {
    expect(pushInput.safeParse({ minutes: 15, flash: "rave" }).success).toBe(false);
    expect(pushInput.safeParse({ minutes: 15, color: "red" }).success).toBe(false);
    expect(pushInput.safeParse({ minutes: 15, flash: "strobe", color: "#00ff00", speed: "3" }).success).toBe(true);
  });
});

describe("ackCount", () => {
  it("counts everyone for an everyone push", () => {
    expect(ackCount(push({ ackedBy: ["u1", "gone"] }), ["u1", "u2", "u3"])).toEqual({ acked: 1, of: 3 });
  });
  it("counts the picked people who are still members", () => {
    expect(ackCount(push({ target: "users", targets: ["u1", "u2", "gone"], ackedBy: ["u2"] }), ["u1", "u2", "u3"])).toEqual({ acked: 1, of: 2 });
  });
});
