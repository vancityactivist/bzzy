import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { blocksForDevice, type CachedEvent, eventsFromIcs, zonedMidnight } from "./ics";

const outlook = readFileSync(join(__dirname, "fixtures/outlook.ics"), "utf8");
const TZ = "America/Vancouver";
const now = new Date("2026-11-11T16:00:00Z"); // Wed 8:00 AM in Vancouver
const iso = (s: number) => new Date(s * 1000).toISOString();

describe("eventsFromIcs (Outlook-style feed)", () => {
  const events = eventsFromIcs(outlook, now, TZ);
  const summary = events.map((e) => `${iso(e.start)} ${e.status} ${e.title}`);

  it("expands the recurring standup, skipping the cancelled day and moving the edited one", () => {
    expect(summary).toContain("2026-11-11T17:00:00.000Z busy Standup");
    expect(summary.some((s) => s.startsWith("2026-11-12T17:00"))).toBe(false);
    expect(summary).toContain("2026-11-13T18:00:00.000Z busy Standup (moved)");
    expect(summary).toContain("2026-11-16T17:00:00.000Z busy Standup");
  });

  it("makes an all-day out-of-office event Away for the whole local day", () => {
    const oof = events.find((e) => e.title === "Vacation")!;
    expect(oof.status).toBe("away");
    expect(iso(oof.start)).toBe("2026-11-13T07:00:00.000Z"); // midnight in Vancouver (UTC-7 year-round from 2026)
    expect(iso(oof.end)).toBe("2026-11-14T07:00:00.000Z");
  });

  it("counts tentative as busy and ignores free and cancelled events", () => {
    expect(events.find((e) => e.title === "Maybe")?.status).toBe("busy");
    expect(events.find((e) => e.title === "Lunch hold")).toBeUndefined();
    expect(events.find((e) => e.title.startsWith("Canceled"))).toBeUndefined();
  });

  it("rejects something that isn't a calendar", () => {
    expect(() => eventsFromIcs("<html>Sign in</html>", now, TZ)).toThrow(/calendar/);
  });
});

describe("eventsFromIcs (Google-style feed)", () => {
  const google = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:a",
    "SUMMARY:Focus time",
    "DTSTART:20261111T200000Z",
    "DTEND:20261111T210000Z",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:b",
    "SUMMARY:Dentist",
    "DTSTART:20261111T220000Z",
    "DTEND:20261111T230000Z",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:c",
    "SUMMARY:Stat holiday",
    "DTSTART;VALUE=DATE:20261111",
    "DTEND;VALUE=DATE:20261112",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("uses TRANSP when there's no Outlook busy status, and ignores plain all-day events", () => {
    const events = eventsFromIcs(google, now, TZ);
    expect(events.map((e) => e.title)).toEqual(["Dentist"]);
  });
});

describe("blocksForDevice", () => {
  const t = 1_800_000_000;
  const ev = (start: number, end: number, status: CachedEvent["status"], title: string): CachedEvent => ({
    start: t + start,
    end: t + end,
    status,
    title,
  });

  it("hides titles unless asked", () => {
    const events = [ev(0, 600, "busy", "1:1 with Sam"), ev(700, 800, "away", "Vacation")];
    expect(blocksForDevice(events, t, false).map((b) => b.text)).toEqual(["In a meeting", "Out of office"]);
    expect(blocksForDevice(events, t, true).map((b) => b.text)).toEqual(["1:1 with Sam", "Vacation"]);
  });

  it("joins overlapping and back-to-back blocks of the same status", () => {
    const blocks = blocksForDevice([ev(0, 600, "busy", "a"), ev(300, 900, "busy", "b"), ev(900, 1200, "busy", "c")], t, false);
    expect(blocks).toEqual([{ start: t, end: t + 1200, status: "busy", text: "In a meeting" }]);
  });

  it("keeps only what's left of today: drops past events and anything past 24 hours", () => {
    const blocks = blocksForDevice([ev(-600, -1, "busy", "past"), ev(-60, 60, "busy", "now"), ev(90_000, 91_000, "busy", "later")], t, true);
    expect(blocks.map((b) => b.text)).toEqual(["now"]);
  });

  it("caps at 32 blocks", () => {
    const many = Array.from({ length: 50 }, (_, i) => ev(i * 1000, i * 1000 + 500, "busy", `m${i}`));
    expect(blocksForDevice(many, t, false)).toHaveLength(32);
  });
});

describe("zonedMidnight", () => {
  it("handles both sides of daylight saving", () => {
    const toronto = "America/Toronto";
    expect(new Date(zonedMidnight(2026, 7, 1, toronto) * 1000).toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(new Date(zonedMidnight(2026, 12, 1, toronto) * 1000).toISOString()).toBe("2026-12-01T05:00:00.000Z");
    // The changeover day itself: clocks go back at 2 AM, so midnight is still daylight time.
    expect(new Date(zonedMidnight(2026, 11, 1, toronto) * 1000).toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  it("follows BC's switch to year-round UTC-7", () => {
    expect(new Date(zonedMidnight(2026, 12, 1, TZ) * 1000).toISOString()).toBe("2026-12-01T07:00:00.000Z");
  });
});
