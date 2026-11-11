// The device protocol (docs/protocol.md), as pure functions so it can be tested
// without a database. Times are unix seconds throughout, like the firmware.

import { z } from "zod";

export const STATUSES = ["free", "busy", "dnd", "away"] as const;
export type Status = (typeof STATUSES)[number];

export const TEXT_MAX = 47; // firmware buffer is 48 bytes including the terminator
export const MAX_BLOCKS = 32;

export type Presence = {
  active: boolean;
  status: Status;
  text: string;
  until: number;
  updatedAt: number;
};

export type Block = { start: number; end: number; status: Status; text: string };

// Where the device downloads the GIF for each status, and a hash so it only
// downloads when the GIF changes. null: no GIF, show the colour card.
export type GifRef = { url: string; sha: string };
export type GifMap = Record<Status, GifRef | null>;

export type StateResponse = {
  v: 1;
  serverTime: number;
  defaultStatus: Status;
  manual: Presence | null;
  schedule: Block[];
  gifs?: GifMap;
};

export const overrideBody = z.object({
  active: z.boolean(),
  status: z.enum(STATUSES),
  updatedAt: z.number().int().nonnegative(),
});
export type OverrideBody = z.infer<typeof overrideBody>;

export const nowSeconds = () => Math.floor(Date.now() / 1000);

// Cut text to what fits on the device, without splitting a multi-byte character.
export function clipText(text: string, maxBytes = TEXT_MAX): string {
  const enc = new TextEncoder();
  if (enc.encode(text).length <= maxBytes) return text;
  let out = "";
  for (const ch of text) {
    if (enc.encode(out + ch).length > maxBytes) break;
    out += ch;
  }
  return out;
}

export function buildState(opts: {
  now: number;
  defaultStatus: Status;
  presence: Presence | null;
  schedule: Block[];
  gifs?: GifMap;
}): StateResponse {
  const { now, defaultStatus, presence } = opts;

  // An expired override is the same as none; don't make the device work it out.
  let manual: Presence | null = null;
  if (presence && (presence.active ? presence.until === 0 || presence.until > now : presence.updatedAt > 0)) {
    manual = { ...presence, text: clipText(presence.text) };
  }

  const schedule = opts.schedule
    .filter((b) => b.end > now && b.end > b.start)
    .sort((a, b) => a.start - b.start)
    .slice(0, MAX_BLOCKS)
    .map((b) => ({ ...b, text: clipText(b.text) }));

  const state: StateResponse = { v: 1, serverTime: now, defaultStatus, manual, schedule };
  if (opts.gifs) state.gifs = opts.gifs;
  return state;
}

// Decide whether a button press from the device replaces what we have.
// Newer wins; a tie keeps what we have (the device treats ties the same way).
export function shouldApplyDeviceOverride(current: Presence | null, incoming: OverrideBody, now: number): boolean {
  // Don't let a device with a wildly wrong clock set an override in the future.
  if (incoming.updatedAt > now + 300) return false;
  if (!current) return true;
  return incoming.updatedAt > current.updatedAt;
}

export function presenceFromDevice(incoming: OverrideBody): Presence {
  return { active: incoming.active, status: incoming.status, text: "", until: 0, updatedAt: incoming.updatedAt };
}
