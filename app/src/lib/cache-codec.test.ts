import { describe, expect, it } from "vitest";

import { decode, encode } from "./cache-codec";

describe("cache codec", () => {
  it("round-trips Dates, nested and in arrays", () => {
    const value = {
      device: { id: "bz-1", lastSeenAt: new Date(1_762_891_200_000), createdAt: new Date(0) },
      calendars: [{ id: "c1", lastFetchedAt: new Date(1_762_891_100_000), events: [{ start: 1, end: 2 }] }],
      none: null,
    };
    const back = decode<typeof value>(encode(value));
    expect(back).toEqual(value);
    expect(back?.device.lastSeenAt).toBeInstanceOf(Date);
    expect(back?.calendars[0].lastFetchedAt).toBeInstanceOf(Date);
  });

  it("keeps plain numbers and strings as they are", () => {
    expect(decode<number>(encode(1_762_891_200_000))).toBe(1_762_891_200_000);
    expect(decode<{ a: string }>(encode({ a: "2026-11-14T00:00:00.000Z" }))).toEqual({ a: "2026-11-14T00:00:00.000Z" });
  });

  it("treats anything unreadable as a miss", () => {
    expect(decode(null)).toBeNull();
    expect(decode({ not: "a string" })).toBeNull();
    expect(decode("{broken")).toBeNull();
  });
});
