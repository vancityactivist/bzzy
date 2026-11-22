import { describe, expect, it } from "vitest";

import type { Block, Presence } from "./protocol";
import { cardLabel, MESSAGE_WIDTH, resolveScreen, screenText, STALE_VIEW, textWidth, statusCut, statusLines, untilLabel, viewFor, viewLabel, withShow, wrapMessage, wrapText } from "./screen";

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

// Same cases as firmware/test/test_core: the preview has to wrap exactly like the device.
describe("wrapMessage", () => {
  it("keeps a short message on one big line", () => {
    expect(wrapMessage("Lunch!")).toEqual({
      font: "bold18",
      lines: ["Lunch!"],
    });
  });

  it("breaks at spaces and stays inside the screen", () => {
    const { font, lines } = wrapMessage("Back in 10 minutes, grab a coffee");
    expect(font).toBe("bold18");
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) {
      expect(textWidth(l, font)).toBeLessThanOrEqual(MESSAGE_WIDTH);
      expect(l.startsWith(" ")).toBe(false);
    }
    expect(lines.join(" ")).toBe("Back in 10 minutes, grab a coffee");
  });

  it("drops to the small font when the big one needs more than 4 lines", () => {
    expect(wrapMessage("WWWWWWWW WWWWWWWW WWWWWWWW WWWWWWWW WWWWWWW").font).toBe("bold12");
  });

  it("breaks a word too long for a line", () => {
    const t = "Supercalifragilisticexpialidocious";
    const { lines, cut } = wrapText(t, "bold18", MESSAGE_WIDTH, 4);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(cut).toBe(false);
    expect(lines.join("")).toBe(t);
  });
});

describe("withShow", () => {
  const base = viewFor({ status: "busy", text: "Council meeting", until: 100 });

  it("uses the GIF layout when there's a GIF", () => {
    expect(withShow(base, { text: "", until: 0, gif: true })).toMatchObject({
      layout: "show-gif",
      status: "busy",
      text: "",
      until: 0,
    });
  });

  it("gives a message its own card when there's no GIF", () => {
    expect(withShow(base, { text: "Lunch!", until: 5, gif: false })).toMatchObject({ layout: "show-text", text: "Lunch!", until: 5 });
  });

  it("leaves the screen alone with neither", () => {
    expect(withShow(base, { text: " ", until: 0, gif: false })).toBe(base);
    expect(withShow(base, null)).toBe(base);
  });
});

describe("statusLines", () => {
  it("keeps a short message on one line", () => {
    expect(statusLines("On a call")).toEqual(["On a call"]);
    expect(statusLines("")).toEqual([]);
  });
  it("wraps one too wide for the screen onto two lines", () => {
    expect(statusLines("Budget review, back at 3")).toEqual(["Budget review,", "back at 3"]);
    expect(statusCut("Budget review, back at 3")).toBeNull();
  });
  it("says what's left when even two lines aren't enough", () => {
    const long = "Strata council meeting in the boardroom until about half past four";
    expect(statusLines(long)).toHaveLength(2);
    expect(statusCut(long)).toBe(statusLines(long).join(" "));
  });
  it("measures what the screen draws (emoji dropped, ends trimmed)", () => {
    expect(statusLines("  Lunch 🍕  ")).toEqual(["Lunch"]);
  });
});

describe("status names on the screen", () => {
  it("lays the standard words out as the firmware always has", () => {
    expect(cardLabel("FREE")).toEqual({ font: "bold24", lines: ["FREE"] });
    expect(cardLabel("AWAY")).toEqual({ font: "bold24", lines: ["AWAY"] });
    expect(cardLabel("DO NOT DISTURB")).toEqual({ font: "bold18", lines: ["DO NOT", "DISTURB"] });
  });

  it("steps a longer name down, then wraps it", () => {
    expect(cardLabel("COME IN")).toEqual({ font: "bold24", lines: ["COME IN"] });
    expect(cardLabel("ON A CALL")).toEqual({ font: "bold18", lines: ["ON A CALL"] });
    expect(cardLabel("HEADS DOWN")).toEqual({ font: "bold18", lines: ["HEADS", "DOWN"] });
    expect(cardLabel("OUT FOR LUNCH NOW")).toEqual({ font: "bold12", lines: ["OUT FOR LUNCH", "NOW"] });
    expect(cardLabel("WWWWWWWWWWWWWWWW").font).toBe("bold12");
  });

  it("draws a renamed status in capitals, and the standard word otherwise", () => {
    const busy = { status: "busy" as const, text: "", until: 0 };
    expect(viewLabel(viewFor(busy, true, { busy: "On a call" }))).toBe("ON A CALL");
    expect(viewLabel(viewFor(busy, true, { dnd: "Heads down" }))).toBe("BUSY");
    expect(viewLabel(viewFor(busy))).toBe("BUSY");
    expect(viewLabel(STALE_VIEW)).toBe("?");
  });
});
