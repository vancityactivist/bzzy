import { describe, expect, it } from "vitest";

import { withLook } from "./look-rules";

const look = {
  defaultStatus: "away" as const,
  ledStyles: { busy: { pattern: "pulse" as const, speed: 2 } },
  meetingWarn: { minutes: 5, leds: { pattern: "blink" as const, speed: 2 } },
};
const row = { id: "bz-door", followsOwner: true, defaultStatus: "free" as const, ledStyles: null, meetingWarn: null, allowFlash: false };

describe("withLook", () => {
  it("gives a light that follows its owner their between-meetings status and ring", () => {
    expect(withLook(row, look)).toEqual({ ...row, defaultStatus: "away", ledStyles: look.ledStyles, meetingWarn: look.meetingWarn });
  });
  it("keeps a light's own between-meetings status when it doesn't follow its owner", () => {
    const own = withLook({ ...row, followsOwner: false, defaultStatus: "dnd" as const }, look);
    expect(own.defaultStatus).toBe("dnd");
    expect(own.ledStyles).toEqual(look.ledStyles);
  });
  it("leaves the light's own fields alone", () => {
    expect(withLook(row, look).allowFlash).toBe(false);
  });
});
