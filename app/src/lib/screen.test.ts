import { describe, expect, it } from "vitest";

import type { Block, Presence } from "./protocol";
import { resolveScreen, screenText, untilLabel } from "./screen";

const now = 1_800_000_000;
const block = (start: number, end: number, status: Block["status"], text = ""): Block => ({ start, end, status, text });
const manual = (p: Partial<Presence>): Presence => ({
  active: true,
  status: "busy",
  text: "",
  until: 0,
  updatedAt: now - 10,
  ...p,
});

describe("resolveScreen", () => {
  it("shows a live override, with its end time", () => {
    const r = resolveScreen({
      now,
      defaultStatus: "free",
      presence: manual({ status: "dnd", text: "Focus", until: now + 600 }),
      schedule: [block(now - 60, now + 60, "busy", "Standup")],
    });
    expect(r).toEqual({ status: "dnd", source: "manual", text: "Focus", until: now + 600 });
  });

  it("ignores an expired or cleared override", () => {
    for (const presence of [manual({ until: now }), manual({ active: false })]) {
      const r = resolveScreen({ now, defaultStatus: "free", presence, schedule: [] });
      expect(r.source).toBe("default");
    }
  });

  it("shows the calendar block that covers now, until it ends", () => {
    const r = resolveScreen({
      now,
      defaultStatus: "free",
      presence: null,
      schedule: [block(now + 600, now + 900, "away"), block(now - 60, now + 300, "busy", "Standup")],
    });
    expect(r).toEqual({ status: "busy", source: "calendar", text: "Standup", until: now + 300 });
  });

  it("falls back to the default, until the next block starts", () => {
    const r = resolveScreen({
      now,
      defaultStatus: "away",
      presence: null,
      schedule: [block(now + 900, now + 1200, "busy"), block(now + 600, now + 700, "dnd")],
    });
    expect(r).toEqual({ status: "away", source: "default", text: "", until: now + 600 });
  });
});

describe("screenText", () => {
  it("drops characters the device's font can't draw", () => {
    expect(screenText("🎧 On a call — café")).toBe(" On a call  caf");
  });

  it("clips to the device's 47 bytes first", () => {
    expect(screenText("x".repeat(60))).toHaveLength(47);
  });
});

describe("untilLabel", () => {
  it("matches the firmware's 12-hour format in Vancouver time", () => {
    expect(untilLabel(Date.parse("2026-11-12T22:30:00Z") / 1000)).toBe("until 3:30 PM");
    expect(untilLabel(Date.parse("2026-11-12T16:05:00Z") / 1000)).toBe("until 9:05 AM");
  });
});
