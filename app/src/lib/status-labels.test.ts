import { describe, expect, it } from "vitest";

import { allLabels, parseLabels, readLabels, screenLabel, statusLabel } from "./status-labels";

describe("status labels", () => {
  it("falls back to the standard words", () => {
    expect(statusLabel("dnd", null)).toBe("Do not disturb");
    expect(statusLabel("dnd", { dnd: "Heads down" })).toBe("Heads down");
    expect(allLabels({ busy: "On a call" })).toEqual({ free: "Free", busy: "On a call", dnd: "Do not disturb", away: "Away" });
    expect(screenLabel("busy", { busy: "On a call" })).toBe("ON A CALL");
  });

  it("saves only the renamed ones, tidied", () => {
    expect(parseLabels({ free: "  Come  in ", busy: "", dnd: "Do not disturb", away: undefined })).toEqual({ ok: true, labels: { free: "Come in" } });
    expect(parseLabels({})).toEqual({ ok: true, labels: null });
  });

  it("refuses names the light can't draw or fit", () => {
    expect(parseLabels({ free: "Café" })).toMatchObject({ ok: false, status: "free" });
    expect(parseLabels({ busy: "🙂" })).toMatchObject({ ok: false, status: "busy" });
    expect(parseLabels({ away: "x".repeat(17) })).toMatchObject({ ok: false, status: "away", error: "Up to 16 characters." });
    expect(parseLabels({ away: "x".repeat(16) }).ok).toBe(true);
  });

  it("refuses two statuses with the same name", () => {
    expect(parseLabels({ dnd: "busy" })).toEqual({ ok: false, status: "dnd", error: "Busy already has that name." });
    expect(parseLabels({ free: "Away", away: "Gone" }).ok).toBe(true);
  });

  it("ignores saved values that are no longer valid", () => {
    expect(readLabels({ free: "Open", busy: "é", other: "x" })).toEqual({ free: "Open" });
    expect(readLabels(null)).toBeNull();
    expect(readLabels({ busy: 3 })).toBeNull();
  });
});
