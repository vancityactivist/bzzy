import { describe, expect, it } from "vitest";

import { classifyGoogle, eventsFromGoogle } from "./google-events";
import { zonedMidnight } from "./zoned";

const TZ = "America/Vancouver";
const window = {
  from: new Date("2026-11-23T08:00:00Z"),
  to: new Date("2026-12-01T08:00:00Z"),
};
const timed = (s: string, e: string) => ({
  start: { dateTime: s },
  end: { dateTime: e },
});

describe("classifyGoogle", () => {
  it("maps Google's event types to status", () => {
    expect(
      classifyGoogle({
        ...timed("2026-11-23T17:00:00Z", "2026-11-23T18:00:00Z"),
      }),
    ).toBe("busy");
    expect(
      classifyGoogle({ eventType: "outOfOffice", ...timed("a", "b") }),
    ).toBe("away");
    expect(classifyGoogle({ eventType: "focusTime", ...timed("a", "b") })).toBe(
      "dnd",
    );
    expect(
      classifyGoogle({
        eventType: "workingLocation",
        start: { date: "2026-11-23" },
      }),
    ).toBeNull();
    expect(classifyGoogle({ status: "tentative", ...timed("a", "b") })).toBe(
      "busy",
    );
  });

  it("ignores what doesn't make you busy", () => {
    expect(
      classifyGoogle({ status: "cancelled", ...timed("a", "b") }),
    ).toBeNull();
    expect(
      classifyGoogle({ transparency: "transparent", ...timed("a", "b") }),
    ).toBeNull();
    expect(
      classifyGoogle({
        attendees: [{ self: true, responseStatus: "declined" }],
        ...timed("a", "b"),
      }),
    ).toBeNull();
    expect(
      classifyGoogle({
        start: { date: "2026-11-23" },
        end: { date: "2026-11-24" },
      }),
    ).toBeNull();
  });

  it("keeps an all-day out of office", () => {
    expect(
      classifyGoogle({
        eventType: "outOfOffice",
        start: { date: "2026-11-23" },
        end: { date: "2026-11-24" },
      }),
    ).toBe("away");
  });
});

describe("eventsFromGoogle", () => {
  it("keeps the window, titles and UIDs", () => {
    const events = eventsFromGoogle(
      [
        {
          summary: " Standup ",
          iCalUID: "abc@google.com",
          ...timed("2026-11-23T17:00:00Z", "2026-11-23T17:15:00Z"),
        },
        {
          summary: "Old",
          ...timed("2026-11-20T17:00:00Z", "2026-11-20T18:00:00Z"),
        },
        {
          summary: "Off",
          eventType: "outOfOffice",
          start: { date: "2026-11-24" },
          end: { date: "2026-11-25" },
        },
      ],
      window,
      TZ,
    );
    expect(events).toEqual([
      {
        start: Date.parse("2026-11-23T17:00:00Z") / 1000,
        end: Date.parse("2026-11-23T17:15:00Z") / 1000,
        status: "busy",
        title: "Standup",
        uid: "abc@google.com",
      },
      // All-day: the person's own midnight.
      {
        start: zonedMidnight(2026, 11, 24, TZ),
        end: zonedMidnight(2026, 11, 25, TZ),
        status: "away",
        title: "Off",
      },
    ]);
  });
});
