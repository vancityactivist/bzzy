import { describe, expect, it } from "vitest";

import { countSince, lastActiveFromExpiry, signupsByDay } from "./admin-stats";

const now = new Date("2026-11-11T22:00:00Z"); // 2:00 PM in Vancouver

describe("signupsByDay", () => {
  it("returns one bucket per day, oldest first, ending today", () => {
    const rows = signupsByDay([], now, 7, "America/Vancouver");
    expect(rows).toHaveLength(7);
    expect(rows[0].day).toBe("2026-11-05");
    expect(rows[6].day).toBe("2026-11-11");
  });

  it("buckets by the local day, not UTC", () => {
    // 03:00 UTC on the 11th is still the evening of the 10th in Vancouver.
    const rows = signupsByDay([new Date("2026-11-11T03:00:00Z"), new Date("2026-11-11T20:00:00Z")], now, 2, "America/Vancouver");
    expect(rows).toEqual([
      { day: "2026-11-10", count: 1 },
      { day: "2026-11-11", count: 1 },
    ]);
  });

  it("ignores signups older than the window", () => {
    const rows = signupsByDay([new Date("2026-01-01T12:00:00Z")], now, 30, "America/Vancouver");
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(0);
  });
});

describe("lastActiveFromExpiry", () => {
  it("subtracts the session lifetime", () => {
    expect(lastActiveFromExpiry(new Date("2026-12-11T22:00:00Z"))?.toISOString()).toBe("2026-11-11T22:00:00.000Z");
  });
  it("is null with no sessions", () => {
    expect(lastActiveFromExpiry(null)).toBeNull();
  });
});

describe("countSince", () => {
  it("counts dates inside the window", () => {
    const dates = [new Date("2026-11-10T00:00:00Z"), new Date("2026-10-01T00:00:00Z")];
    expect(countSince(dates, now, 7)).toBe(1);
    expect(countSince(dates, now, 60)).toBe(2);
  });
});
