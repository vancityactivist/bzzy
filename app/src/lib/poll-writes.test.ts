import { describe, expect, it } from "vitest";

import type { CachedEvent } from "./ics";
import { SEEN_WRITE_EVERY_MS, sameEvents, shouldMarkSeen } from "./poll-writes";

const NOW = 1_762_891_200_000;

describe("shouldMarkSeen", () => {
  it("writes for a light that has never been seen", () => {
    expect(shouldMarkSeen(null, NOW, false)).toBe(true);
  });

  it("skips the write while the saved time is recent", () => {
    expect(shouldMarkSeen(new Date(NOW - 20_000), NOW, false)).toBe(false);
    expect(shouldMarkSeen(new Date(NOW - SEEN_WRITE_EVERY_MS + 1), NOW, false)).toBe(false);
  });

  it("writes once the saved time is a minute old", () => {
    expect(shouldMarkSeen(new Date(NOW - SEEN_WRITE_EVERY_MS), NOW, false)).toBe(true);
  });

  it("always writes when there's something else to save", () => {
    expect(shouldMarkSeen(new Date(NOW - 1_000), NOW, true)).toBe(true);
  });

  it("corrects a saved time in the future", () => {
    expect(shouldMarkSeen(new Date(NOW + 60_000), NOW, false)).toBe(true);
  });

  it("keeps a polling light inside the 2 minute online window", () => {
    // Worst case: the write is skipped just before the minute is up, and the next poll is 20 s later.
    expect(SEEN_WRITE_EVERY_MS + 20_000).toBeLessThan(2 * 60_000);
  });
});

describe("sameEvents", () => {
  const ev = (start: number, p: Partial<CachedEvent> = {}): CachedEvent => ({
    start,
    end: start + 3600,
    status: "busy",
    title: "Council meeting",
    ...p,
  });

  it("matches identical lists", () => {
    expect(sameEvents([ev(1), ev(2)], [ev(1), ev(2)])).toBe(true);
    expect(sameEvents([], [])).toBe(true);
  });

  it("spots any change", () => {
    expect(sameEvents([ev(1)], [ev(1), ev(2)])).toBe(false);
    expect(sameEvents([ev(1)], [ev(2)])).toBe(false);
    expect(sameEvents([ev(1)], [ev(1, { end: 99 })])).toBe(false);
    expect(sameEvents([ev(1)], [ev(1, { status: "away" })])).toBe(false);
    expect(sameEvents([ev(1)], [ev(1, { title: "Budget review" })])).toBe(false);
  });
});
