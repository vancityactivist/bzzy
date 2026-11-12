// The device protocol (docs/protocol.md), as pure functions so it can be tested
// without a database. Times are unix seconds throughout, like the firmware.

import { z } from "zod";

import type { FirmwareOffer } from "./firmware";
import type { LedStyle } from "./push-rules";

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

// "Show now": a GIF and/or message on the screen, whatever the status.
export type Show = {
  active: boolean;
  text: string;
  until: number; // unix seconds; 0 = until cleared
  updatedAt: number;
};
export type ShowState = Show & { gif: GifRef | null };

// A team push. Its GIF and message travel in `show`, so firmware from before pushes
// still shows it; this says that `show` is a push, for firmware with the "push"
// feature (docs/protocol.md).
export type PushState = { id: string; updatedAt: number; leds?: LedStyle };

export type StateResponse = {
  v: 1;
  serverTime: number;
  defaultStatus: Status;
  manual: Presence | null;
  show: ShowState | null;
  schedule: Block[];
  gifs?: GifMap;
  // Present only when the device should update (docs/ota.md).
  firmware?: FirmwareOffer;
  push?: PushState;
};

export const overrideBody = z.object({
  active: z.boolean(),
  status: z.enum(STATUSES),
  updatedAt: z.number().int().nonnegative(),
});
export type OverrideBody = z.infer<typeof overrideBody>;

// POST /api/device/{id}/push-ack: the person dismissed a push with the button.
export const pushAckBody = z.object({
  id: z.string().min(1).max(64),
  at: z.number().int().nonnegative(),
});

// X-Bzzy-Features ("leds,push"), tidied for saving. null when it's missing or odd.
export function readFeatures(raw: string | null): string | null {
  if (!raw || raw.length > 200) return null;
  const list = [...new Set(raw.split(",").map((f) => f.trim().toLowerCase()))].filter((f) => /^[a-z0-9-]{1,20}$/.test(f));
  return list.length ? list.sort().join(",") : null;
}

export function hasFeature(features: string | null | undefined, name: string): boolean {
  return !!features && features.split(",").includes(name);
}

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
  show?: ShowState | null;
  firmware?: FirmwareOffer | null;
  push?: PushState | null;
}): StateResponse {
  const { now, defaultStatus, presence } = opts;

  const manual = sentManual(presence, now);

  const schedule = opts.schedule
    .filter((b) => b.end > now && b.end > b.start)
    .sort((a, b) => a.start - b.start)
    .slice(0, MAX_BLOCKS)
    .map((b) => ({ ...b, text: clipText(b.text) }));

  // Same idea for "show now": an expired one is sent as cleared, so the device drops its GIF.
  let show: ShowState | null = null;
  const s = opts.show;
  if (s && (s.active || s.updatedAt > 0)) {
    const live = showLive(s, now);
    show = live
      ? { ...s, text: clipText(s.text) }
      : {
          active: false,
          text: "",
          until: 0,
          updatedAt: s.updatedAt,
          gif: null,
        };
  }

  const state: StateResponse = {
    v: 1,
    serverTime: now,
    defaultStatus,
    manual,
    show,
    schedule,
  };
  if (opts.gifs) state.gifs = opts.gifs;
  if (opts.firmware) state.firmware = opts.firmware;
  if (opts.push && show?.active) state.push = opts.push;
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

// The manual override as the device gets it. An expired override is the same as
// none; don't make the device work it out.
export function sentManual(presence: Presence | null, now: number): Presence | null {
  if (presence && (presence.active ? presence.until === 0 || presence.until > now : presence.updatedAt > 0)) {
    return { ...presence, text: clipText(presence.text) };
  }
  return null;
}

export function showLive(s: Show, now: number): boolean {
  return s.active && (s.until === 0 || now < s.until);
}

// The device's showVisible() (firmware/lib/core/src/status_engine.cpp): on screen while
// it hasn't expired and nobody changed the status after putting it up.
export function showVisible(s: Show | null, presence: Presence | null, now: number): boolean {
  if (!s || !showLive(s, now)) return false;
  return s.updatedAt >= (sentManual(presence, now)?.updatedAt ?? 0);
}
