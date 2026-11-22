import { describe, expect, it } from "vitest";

import { claimInput, claimLabel, claimLinkState, lightReport, linkExpiry } from "./claim-rules";

describe("light claims", () => {
  it("checks what the caller sends", () => {
    expect(claimInput.safeParse({ email: " Sam@Example.com ", ref: "BZ-0042", quantity: 1 })).toMatchObject({
      success: true,
      data: { email: "sam@example.com", ref: "BZ-0042", quantity: 1 },
    });
    expect(claimInput.safeParse({ email: "nope", ref: "BZ-1", quantity: 1 }).success).toBe(false);
    expect(claimInput.safeParse({ email: "a@b.co", ref: "has space", quantity: 1 }).success).toBe(false);
    expect(claimInput.safeParse({ email: "a@b.co", ref: "BZ-1", quantity: 0 }).success).toBe(false);
  });

  it("knows when a link works", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    expect(claimLinkState({ tokenHash: null, tokenExpiresAt: null }, now)).toBe("none");
    expect(claimLinkState({ tokenHash: "h", tokenExpiresAt: linkExpiry(now) }, now)).toBe("live");
    expect(claimLinkState({ tokenHash: "h", tokenExpiresAt: now }, now)).toBe("expired");
    expect(linkExpiry(now).toISOString()).toBe("2026-12-15T00:00:00.000Z");
  });

  it("reports a light", () => {
    const shipped = new Date("2026-12-01T00:00:00Z");
    const base = { id: "bz-abc234", name: "Desk light", firmwareVersion: "0.4.0", lastSeenAt: shipped, shipMode: true, shippedAt: shipped, arrivedAt: null };
    expect(lightReport(base)).toMatchObject({ serial: "bz-abc234", shipMode: true, onlineSinceShip: false });
    expect(lightReport({ ...base, shipMode: false, arrivedAt: new Date() }).onlineSinceShip).toBe(true);
  });

  it("labels a claim for the bench", () => {
    expect(claimLabel({ ref: "BZ-0042", name: "Sam Lee", email: "sam@example.com", quantity: 2, paired: 1 })).toBe("BZ-0042 · Sam Lee (1 of 2 paired)");
    expect(claimLabel({ ref: "BZ-7", name: null, email: "pat@example.com", quantity: 1, paired: 0 })).toBe("BZ-7 · pat@example.com (0 of 1 paired)");
  });
});
