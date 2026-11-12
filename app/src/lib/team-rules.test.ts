import { describe, expect, it } from "vitest";

import { can, canRemove, cleanTeamName, inviteAllowed, inviteState } from "./team-rules";

const member = { role: "member" as const, superadmin: false };
const admin = { role: "admin" as const, superadmin: false };
const owner = { role: "owner" as const, superadmin: false };
const outsider = { role: null, superadmin: false };
const superadmin = { role: null, superadmin: true };

describe("can", () => {
  it("lets members view but not manage", () => {
    expect(can(member, "view")).toBe(true);
    expect(can(member, "manage")).toBe(false);
  });
  it("lets admins manage but not change roles or the team", () => {
    expect(can(admin, "manage")).toBe(true);
    expect(can(admin, "setRoles")).toBe(false);
    expect(can(admin, "owner")).toBe(false);
  });
  it("lets the owner do everything", () => {
    for (const a of ["view", "manage", "setRoles", "owner"] as const) expect(can(owner, a)).toBe(true);
  });
  it("shuts out non-members", () => {
    expect(can(outsider, "view")).toBe(false);
  });
  it("lets a superadmin act in any team without joining", () => {
    for (const a of ["view", "manage", "setRoles", "owner"] as const) expect(can(superadmin, a)).toBe(true);
  });
});

describe("canRemove", () => {
  it("never removes the owner", () => {
    expect(canRemove(superadmin, "owner", false)).toBe(false);
    expect(canRemove(owner, "owner", true)).toBe(false);
  });
  it("lets admins remove members only", () => {
    expect(canRemove(admin, "member", false)).toBe(true);
    expect(canRemove(admin, "admin", false)).toBe(false);
  });
  it("lets the owner and superadmin remove admins", () => {
    expect(canRemove(owner, "admin", false)).toBe(true);
    expect(canRemove(superadmin, "admin", false)).toBe(true);
  });
  it("lets anyone but the owner leave", () => {
    expect(canRemove(member, "member", true)).toBe(true);
    expect(canRemove(admin, "admin", true)).toBe(true);
  });
  it("doesn't let members remove others", () => {
    expect(canRemove(member, "member", false)).toBe(false);
  });
});

describe("inviteState", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  const base = { kind: "team" as const, maxUses: null, uses: 0, expiresAt: new Date("2026-11-19T12:00:00Z"), revokedAt: null };
  it("is live inside its window", () => expect(inviteState(base, now)).toBe("live"));
  it("expires at its time", () => expect(inviteState({ ...base, expiresAt: now }, now)).toBe("expired"));
  it("revoked wins over everything", () =>
    expect(inviteState({ ...base, revokedAt: now, expiresAt: new Date(0) }, now)).toBe("revoked"));
  it("single-use is used up after one", () =>
    expect(inviteState({ ...base, kind: "single", maxUses: 1, uses: 1 }, now)).toBe("used"));
  it("team links have no use limit", () => expect(inviteState({ ...base, uses: 500 }, now)).toBe("live"));
});

describe("inviteAllowed", () => {
  it("allows admin invites only as single-use", () => {
    expect(inviteAllowed("single", "admin")).toBe(true);
    expect(inviteAllowed("team", "admin")).toBe(false);
    expect(inviteAllowed("team", "member")).toBe(true);
  });
});

describe("cleanTeamName", () => {
  it("trims and collapses spaces", () => expect(cleanTeamName("  Front   office ")).toBe("Front office"));
  it("rejects names that are too short", () => expect(cleanTeamName(" a ")).toBeNull());
  it("caps the length", () => expect(cleanTeamName("x".repeat(100))?.length).toBe(60));
});
