import { describe, expect, it } from "vitest";

import { formatPairCode, newPairCode, normalizePairCode, PAIR_ALPHABET, pairingState, secondsLeft } from "./pair-rules";

describe("pairing codes", () => {
  it("makes six characters from the alphabet", () => {
    const code = newPairCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
    expect(code).toHaveLength(6);
    for (const c of code) expect(PAIR_ALPHABET).toContain(c);
  });

  it("reads what people type", () => {
    expect(normalizePairCode("k7q-f2m")).toBe("K7QF2M");
    expect(normalizePairCode(" K7Q F2M ")).toBe("K7QF2M");
    expect(normalizePairCode("K7QF2")).toBeNull();
    expect(normalizePairCode("K7QF2MM")).toBeNull();
    // Letters left out of the alphabet never make a code.
    expect(normalizePairCode("K7QF2O")).toBeNull();
    expect(normalizePairCode("../../x")).toBeNull();
  });

  it("formats with a dash in the middle", () => {
    expect(formatPairCode("K7QF2M")).toBe("K7Q-F2M");
  });

  it("knows live, claimed and expired", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const later = new Date(now.getTime() + 60_000);
    const earlier = new Date(now.getTime() - 1);
    expect(pairingState({ expiresAt: later, deviceId: null }, now)).toBe("live");
    expect(pairingState({ expiresAt: earlier, deviceId: null }, now)).toBe("expired");
    // Claimed stays claimed after the code runs out, so a light that missed the answer still gets it.
    expect(pairingState({ expiresAt: earlier, deviceId: "bz-abc" }, now)).toBe("claimed");
    expect(secondsLeft({ expiresAt: later, deviceId: null }, now)).toBe(60);
    expect(secondsLeft({ expiresAt: earlier, deviceId: null }, now)).toBe(0);
  });
});
