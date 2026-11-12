// Team pushes, as pure functions so they can be tested without a database.
// Times are unix seconds, like the device protocol (docs/protocol.md).

import { z } from "zod";

import { clipText, type Presence, sentManual, type Show } from "./protocol";

// ---- LED styles (docs/protocol.md, "LED styles") ----

export const PATTERNS = ["solid", "pulse", "blink", "strobe", "spin"] as const;
export type Pattern = (typeof PATTERNS)[number];

export const ledStyle = z.object({
  pattern: z.enum(PATTERNS),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .transform((c) => c.toLowerCase())
    .optional(),
  speed: z.number().int().min(1).max(3).optional(),
  for: z.number().int().min(0).max(3600).optional(),
});
export type LedStyle = z.infer<typeof ledStyle>;

// What the composer offers. "none" sends no style: the ring stays on the person's status.
export const PUSH_FLASHES = [
  { value: "none", label: "Don't flash" },
  { value: "pulse", label: "Pulse" },
  { value: "blink", label: "Blink" },
  { value: "strobe", label: "Strobe" },
  { value: "spin", label: "Spin" },
] as const;

export const PUSH_COLORS = [
  { value: "", label: "Their status colour" },
  { value: "#ff2000", label: "Red" },
  { value: "#ff8a00", label: "Orange" },
  { value: "#ffd400", label: "Yellow" },
  { value: "#00c853", label: "Green" },
  { value: "#2979ff", label: "Blue" },
  { value: "#d500f9", label: "Purple" },
  { value: "#ffffff", label: "White" },
] as const;

// Minutes; 0 = until someone ends it.
export const PUSH_DURATIONS = [
  { minutes: 5, label: "For 5 minutes" },
  { minutes: 15, label: "For 15 minutes" },
  { minutes: 30, label: "For 30 minutes" },
  { minutes: 60, label: "For 1 hour" },
  { minutes: 240, label: "For 4 hours" },
  { minutes: 0, label: "Until I end it" },
] as const;

// How long the flashing lasts before the ring goes steady (the push stays up).
export const FLASH_FOR = [
  { seconds: 10, label: "for 10 seconds" },
  { seconds: 30, label: "for 30 seconds" },
  { seconds: 60, label: "for a minute" },
  { seconds: 0, label: "the whole time" },
] as const;

// The composer's form, before the GIF is checked.
export const pushInput = z.object({
  gif: z.string().max(100).default("none"),
  text: z.string().max(200).default(""),
  minutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  flash: z.enum(["none", ...PATTERNS]).default("none"),
  color: z.union([z.literal(""), z.string().regex(/^#[0-9a-f]{6}$/i)]).default(""),
  speed: z.coerce.number().int().min(1).max(3).default(2),
  flashFor: z.coerce.number().int().min(0).max(3600).default(30),
  target: z.enum(["all", "users"]).default("all"),
  users: z.array(z.string().min(1).max(64)).max(500).default([]),
});
export type PushInput = z.infer<typeof pushInput>;

export function pushLeds(input: Pick<PushInput, "flash" | "color" | "speed" | "flashFor">): LedStyle | null {
  if (input.flash === "none") return null;
  const style: LedStyle = { pattern: input.flash, speed: input.speed };
  if (input.color) style.color = input.color.toLowerCase();
  if (input.flashFor > 0 && input.flash !== "solid") style.for = input.flashFor;
  return style;
}

// What the ring is doing `now`: a flash with `for` goes steady in its colour once
// that's passed, like the light (led_pattern.cpp renderPattern).
export function ringNow(leds: LedStyle | null, startedAt: number, now: number): LedStyle | null {
  if (!leds?.for || now - startedAt < leds.for) return leds;
  return leds.color ? { pattern: "solid", color: leds.color } : null;
}

// ---- which push a light shows ----

export type PushRow = {
  id: string;
  target: "all" | "users";
  text: string;
  until: number; // 0 = until ended
  updatedAt: number;
  endedAt: number | null;
};

export type PushWho = PushRow & {
  targets: string[]; // user ids, for target "users"
  ackedBy: string[]; // user ids who dismissed it
};

export function pushLive(p: Pick<PushRow, "until" | "endedAt">, now: number): boolean {
  return p.endedAt === null && (p.until === 0 || now < p.until);
}

export function pushIsFor(p: Pick<PushWho, "target" | "targets">, userId: string): boolean {
  return p.target === "all" || p.targets.includes(userId);
}

// The push someone's light shows: the newest live one that's for them and that they
// haven't dismissed. A newer push replaces an older one rather than queueing behind it.
export function pushFor<T extends PushWho>(pushes: T[], userId: string, now: number): T | null {
  let best: T | null = null;
  for (const p of pushes) {
    if (!pushLive(p, now) || !pushIsFor(p, userId) || p.ackedBy.includes(userId)) continue;
    if (!best || p.updatedAt > best.updatedAt || (p.updatedAt === best.updatedAt && p.id > best.id)) best = p;
  }
  return best;
}

// A push goes to the light in the `show` field, so firmware from before pushes still
// puts it on screen. That firmware hides "show now" once the manual status is newer,
// so the push is sent as at least as new as the manual status: it stays up over the
// person's own changes until they press the button on the light (which also counts
// as dismissing it; see the override route).
export function pushAsShow(p: PushRow, presence: Presence | null, now: number): Show {
  const manual = sentManual(presence, now)?.updatedAt ?? 0;
  return {
    active: true,
    text: clipText(p.text),
    until: p.until,
    updatedAt: Math.max(p.updatedAt, manual),
  };
}

// For an "everyone" push, how many have dismissed it; for a picked list, of those picked.
export function ackCount(p: Pick<PushWho, "target" | "targets" | "ackedBy">, memberIds: string[]) {
  const who = p.target === "all" ? memberIds : p.targets.filter((id) => memberIds.includes(id));
  return { acked: who.filter((id) => p.ackedBy.includes(id)).length, of: who.length };
}
