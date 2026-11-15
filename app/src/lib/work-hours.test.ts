import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORK_HOURS,
  formatClock,
  inWorkHours,
  OFF_HOURS_POLL_SEC,
  parseClock,
  parseWorkHours,
  POLL_SEC,
  pollSeconds,
  workWindows,
} from "./work-hours";

// Toronto still changes its clocks (BC stays on UTC-7 from November 2026), so it shows
// daylight saving being followed.
const TZ = "America/Toronto";
// Wednesday 2026-11-11, 10:00 Toronto (EST, UTC-5) = 15:00 UTC.
const WED_10AM = Date.UTC(2026, 10, 11, 15, 0) / 1000;
const hours = DEFAULT_WORK_HOURS; // Mon-Fri 9-5

describe("workWindows", () => {
  it("lists today's and the coming weekdays' hours in the person's time zone", () => {
    const w = workWindows(hours, TZ, WED_10AM);
    // Wed, Thu, Fri, then Mon, Tue, Wed of next week (8 days from Wednesday).
    expect(w).toHaveLength(6);
    expect(w[0]).toEqual({ start: Date.UTC(2026, 10, 11, 14, 0) / 1000, end: Date.UTC(2026, 10, 11, 22, 0) / 1000 });
    expect(new Date(w[3].start * 1000).getUTCDay()).toBe(1); // Monday
  });

  it("drops today's window once it's over", () => {
    const evening = WED_10AM + 9 * 3600; // 19:00
    expect(workWindows(hours, TZ, evening)[0].start).toBe(Date.UTC(2026, 10, 12, 14, 0) / 1000);
  });

  it("follows daylight saving: 9:00 is 13:00 UTC in summer", () => {
    const summer = Date.UTC(2026, 6, 15, 15, 0) / 1000; // Wed 2026-07-15 11:00 EDT
    expect(workWindows(hours, TZ, summer)[0].start).toBe(Date.UTC(2026, 6, 15, 13, 0) / 1000);
  });

  it("uses BC's year-round UTC-7 from November 2026", () => {
    expect(workWindows(hours, "America/Vancouver", WED_10AM)[0].start).toBe(Date.UTC(2026, 10, 11, 16, 0) / 1000);
  });

  it("is empty with no hours set", () => {
    expect(workWindows(null, TZ, WED_10AM)).toEqual([]);
  });
});

describe("pollSeconds", () => {
  it("polls every 20 s with no hours set, and inside them", () => {
    expect(pollSeconds(null, [], WED_10AM)).toBe(POLL_SEC);
    const w = workWindows(hours, TZ, WED_10AM);
    expect(inWorkHours(w, WED_10AM)).toBe(true);
    expect(pollSeconds(hours, w, WED_10AM)).toBe(POLL_SEC);
  });

  it("slows to 5 minutes outside them", () => {
    const night = WED_10AM + 12 * 3600; // 22:00
    const w = workWindows(hours, TZ, night);
    expect(inWorkHours(w, night)).toBe(false);
    expect(pollSeconds(hours, w, night)).toBe(OFF_HOURS_POLL_SEC);
  });

  it("never sleeps past the start of the day", () => {
    const justBefore = Date.UTC(2026, 10, 12, 14, 0) / 1000 - 90; // Thu 8:58:30
    const w = workWindows(hours, TZ, justBefore);
    expect(pollSeconds(hours, w, justBefore)).toBe(90);
    expect(pollSeconds(hours, w, Date.UTC(2026, 10, 12, 14, 0) / 1000 - 5)).toBe(POLL_SEC);
  });
});

describe("parsing", () => {
  it("accepts valid hours and cleans up days", () => {
    expect(parseWorkHours({ days: [5, 1, 1, 9], start: 480, end: 1020 })).toEqual({ days: [1, 5], start: 480, end: 1020 });
  });

  it("rejects no days, backwards or out-of-range times", () => {
    expect(parseWorkHours({ days: [], start: 480, end: 1020 })).toBeNull();
    expect(parseWorkHours({ days: [1], start: 1020, end: 480 })).toBeNull();
    expect(parseWorkHours({ days: [1], start: 0, end: 1500 })).toBeNull();
    expect(parseWorkHours(null)).toBeNull();
  });

  it("reads and writes clock times", () => {
    expect(parseClock("09:30")).toBe(570);
    expect(parseClock("9:05")).toBe(545);
    expect(parseClock("24:00")).toBe(1440);
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("noon")).toBeNull();
    expect(formatClock(570)).toBe("09:30");
  });
});
