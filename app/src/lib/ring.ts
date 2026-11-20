// A light's ring settings (docs/protocol.md, "LED styles"): how it moves for each
// status, the meeting warning, and whether it may flash at all. Pure, so the previews
// and the device route agree, and tests can run without a database.

import { z } from "zod";

import { type Block, type Status, STATUSES } from "./protocol";
import { type LedStyle, ledStyle, PATTERNS, ringColor, ringNow } from "./push-rules";

export const ledStyles = z.partialRecord(z.enum(STATUSES), ledStyle);
export type LedStyles = z.infer<typeof ledStyles>;

export const meetingWarn = z.object({
  minutes: z.number().int().min(0).max(60),
  leds: ledStyle,
});
export type MeetingWarn = z.infer<typeof meetingWarn>;

export const WARN_MINUTES = [0, 1, 2, 5, 10, 15] as const;

// What a light gets: nothing at all when it isn't allowed to flash.
export function sentLeds(d: { allowFlash: boolean; ledStyles: LedStyles | null; meetingWarn: MeetingWarn | null }): {
  ledStyles?: LedStyles;
  meetingWarn?: MeetingWarn;
} {
  if (!d.allowFlash) return {};
  const out: { ledStyles?: LedStyles; meetingWarn?: MeetingWarn } = {};
  const styles = Object.fromEntries(Object.entries(d.ledStyles ?? {}).filter(([, s]) => s && s.pattern !== "solid"));
  if (Object.keys(styles).length) out.ledStyles = styles;
  if (d.meetingWarn && d.meetingWarn.minutes > 0) out.meetingWarn = d.meetingWarn;
  return out;
}

// A show's or push's ring that a light may play: anything when it may flash, and
// otherwise only a steady one (one colour, or the slowly turning rainbow), since that
// doesn't flash.
export function allowedRing(leds: LedStyle | null | undefined, allowFlash: boolean): LedStyle | null {
  return leds && (allowFlash || leds.pattern === "solid") ? leds : null;
}

// The firmware's chooseLeds() (status_engine.cpp): a push's flash, then the person's
// own show now's, then the meeting warning in its window, then the status's style.
// null: steady status colour. Pass `show` only while it's on screen (showVisible). A light
// that may not flash still plays a push's or show's Steady ring (allowedRing).
export function ringFor(opts: {
  allowFlash: boolean;
  ledStyles: LedStyles | null;
  meetingWarn: MeetingWarn | null;
  status: Status | "unknown";
  schedule: Block[];
  now: number;
  push?: { leds: LedStyle | null; updatedAt: number } | null;
  show?: { leds: LedStyle | null; updatedAt: number } | null;
}): LedStyle | null {
  if (opts.push?.leds) {
    const leds = allowedRing(opts.push.leds, opts.allowFlash);
    return leds ? ringNow(leds, opts.push.updatedAt, opts.now) : null;
  }
  // While a push is up it's what's on screen, so the person's own show can't flash.
  const show = opts.push ? null : allowedRing(opts.show?.leds, opts.allowFlash);
  if (show && opts.show) return ringNow(show, opts.show.updatedAt, opts.now);
  if (!opts.allowFlash) return null;
  const w = opts.meetingWarn;
  if (w && w.minutes > 0) {
    const window = w.minutes * 60;
    const next = opts.schedule
      .map((b) => b.start)
      .filter((s) => s > opts.now && s - opts.now <= window)
      .sort((a, b) => a - b)[0];
    if (next) return ringNow(w.leds, next - window, opts.now);
  }
  if (opts.status === "unknown") return null;
  return opts.ledStyles?.[opts.status] ?? null;
}

// The Look page form: how the ring moves for each status, and the meeting warning. (Whether
// a light may flash at all is the light's own setting.)
export const lookRingInput = z.object({
  styles: z.record(z.enum(STATUSES), z.object({ pattern: z.enum(PATTERNS), speed: z.number().int().min(1).max(3) })),
  warnMinutes: z.number().int().min(0).max(60),
  warnPattern: z.enum(PATTERNS),
  warnColor: z.union([z.literal(""), ringColor]),
  warnSpeed: z.number().int().min(1).max(3),
});
export type LookRingInput = z.infer<typeof lookRingInput>;

export function lookRingFromInput(i: LookRingInput): { ledStyles: LedStyles; meetingWarn: MeetingWarn | null } {
  const styles: LedStyles = {};
  for (const s of STATUSES) {
    const st = i.styles[s];
    if (st && st.pattern !== "solid") styles[s] = { pattern: st.pattern, speed: st.speed };
  }
  const leds: LedStyle = { pattern: i.warnPattern, speed: i.warnSpeed };
  if (i.warnColor) leds.color = i.warnColor.toLowerCase();
  return { ledStyles: styles, meetingWarn: i.warnMinutes > 0 ? { minutes: i.warnMinutes, leds } : null };
}
