import { describe, expect, it } from "vitest";

import { buildState } from "./protocol";
import { allowedRing, lookRingFromInput, lookRingInput, ringFor, sentLeds } from "./ring";

const now = 1_762_900_000;
const pulse = { pattern: "pulse" as const, speed: 1 };
const warn = { minutes: 5, leds: { pattern: "blink" as const, color: "#ff2000", speed: 2, for: 60 } };
const meeting = (start: number) => [{ start, end: start + 1800, status: "busy" as const, text: "" }];
const base = { allowFlash: true, ledStyles: { busy: pulse }, meetingWarn: warn, status: "busy" as const, schedule: [], now };

describe("ringFor", () => {
  it("uses the status's style", () => {
    expect(ringFor(base)).toEqual(pulse);
    expect(ringFor({ ...base, status: "free" })).toBeNull();
    expect(ringFor({ ...base, status: "unknown" })).toBeNull();
  });
  it("warns before a meeting, inside its window only", () => {
    expect(ringFor({ ...base, schedule: meeting(now + 300) })).toEqual(warn.leds);
    expect(ringFor({ ...base, schedule: meeting(now + 301) })).toEqual(pulse);
    expect(ringFor({ ...base, schedule: meeting(now) })).toEqual(pulse); // started
  });
  it("goes steady once the warning's for has passed", () => {
    expect(ringFor({ ...base, schedule: meeting(now + 200) })).toEqual({ pattern: "solid", color: "#ff2000" });
  });
  it("puts a push's flash first", () => {
    const push = { leds: { pattern: "strobe" as const }, updatedAt: now - 5 };
    expect(ringFor({ ...base, schedule: meeting(now + 60), push })).toEqual(push.leds);
  });
  it("plays a show now's ring over the meeting warning, but not under a push", () => {
    const show = { leds: { pattern: "spin" as const, color: "#d500f9" }, updatedAt: now - 5 };
    expect(ringFor({ ...base, schedule: meeting(now + 60), show })).toEqual(show.leds);
    expect(ringFor({ ...base, show: { leds: null, updatedAt: now } })).toEqual(pulse);
    const push = { leds: null, updatedAt: now - 1 };
    expect(ringFor({ ...base, push, show })).toEqual(pulse);
    // Its "for" ends like a push's.
    const brief = { leds: { pattern: "blink" as const, for: 10 }, updatedAt: now - 11 };
    expect(ringFor({ ...base, show: brief })).toBeNull();
    expect(ringFor({ ...base, allowFlash: false, show })).toBeNull();
  });
  it("never flashes when flashing is off", () => {
    expect(ringFor({ ...base, allowFlash: false, push: { leds: { pattern: "strobe" }, updatedAt: now } })).toBeNull();
  });
  it("still plays a Steady show or push when flashing is off", () => {
    const steady = { pattern: "solid" as const, color: "rainbow" };
    expect(ringFor({ ...base, allowFlash: false, show: { leds: steady, updatedAt: now } })).toEqual(steady);
    expect(ringFor({ ...base, allowFlash: false, push: { leds: steady, updatedAt: now } })).toEqual(steady);
    expect(allowedRing({ pattern: "pulse" }, false)).toBeNull();
    expect(allowedRing(steady, false)).toEqual(steady);
  });
});

describe("show now's ring in the state", () => {
  it("goes out with a live show and not with a cleared one", () => {
    const leds = { pattern: "spin" as const, speed: 2 };
    const show = { active: true, text: "Focus", until: now + 600, updatedAt: now - 5, gif: null, leds };
    const live = buildState({ now, defaultStatus: "free", presence: null, schedule: [], show });
    expect(live.show?.leds).toEqual(leds);
    const gone = buildState({ now, defaultStatus: "free", presence: null, schedule: [], show: { ...show, until: now } });
    expect(gone.show?.active).toBe(false);
    expect(gone.show).not.toHaveProperty("leds");
  });
});

describe("sentLeds", () => {
  it("sends styles and the warning", () => {
    expect(sentLeds({ allowFlash: true, ledStyles: { busy: pulse, free: { pattern: "solid" } }, meetingWarn: warn })).toEqual({
      ledStyles: { busy: pulse },
      meetingWarn: warn,
    });
  });
  it("sends nothing when flashing is off or nothing is set", () => {
    expect(sentLeds({ allowFlash: false, ledStyles: { busy: pulse }, meetingWarn: warn })).toEqual({});
    expect(sentLeds({ allowFlash: true, ledStyles: null, meetingWarn: { ...warn, minutes: 0 } })).toEqual({});
  });
  it("ends up in the state response", () => {
    const s = buildState({ now, defaultStatus: "free", presence: null, schedule: [], leds: sentLeds({ ...base, meetingWarn: null }) });
    expect(s.ledStyles).toEqual({ busy: pulse });
    expect(s.meetingWarn).toBeUndefined();
  });
});

describe("lookRingFromInput", () => {
  const input = {
    styles: { free: { pattern: "solid" as const, speed: 2 }, busy: pulse, dnd: { pattern: "spin" as const, speed: 3 }, away: { pattern: "solid" as const, speed: 2 } },
    warnMinutes: 5,
    warnPattern: "blink" as const,
    warnColor: "#FF2000",
    warnSpeed: 2,
  };
  it("keeps only moving styles and builds the warning", () => {
    expect(lookRingInput.parse(input)).toBeTruthy();
    expect(lookRingFromInput(input)).toEqual({
      ledStyles: { busy: pulse, dnd: { pattern: "spin", speed: 3 } },
      meetingWarn: { minutes: 5, leds: { pattern: "blink", speed: 2, color: "#ff2000" } },
    });
  });
  it("turns the warning off at 0 minutes", () => {
    expect(lookRingFromInput({ ...input, warnMinutes: 0 }).meetingWarn).toBeNull();
  });
});
