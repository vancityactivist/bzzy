// What the device's screen and LEDs show, worked out the same way the firmware does,
// so the app can draw a faithful preview. Pure: no database, no React.
//
// Mirrors firmware/lib/core/src/status_engine.cpp (which status wins) and
// firmware/src/display.cpp + leds.cpp (colours, layout, fonts). If you change one
// side, change the other.

import { type Block, clipText, type Presence, type Status } from "./protocol";

export type ScreenStatus = Status | "unknown";

export type ScreenView = {
  status: ScreenStatus;
  text: string; // event or custom text; "" for none
  until: number; // unix seconds; 0 = no time line
  online: boolean; // false draws the small offline ring in the corner
  notice: string | null; // black strip along the bottom, e.g. "No recent calendar data"
};

export type ScreenSource = "manual" | "calendar" | "default" | "fallback";

export const SCREEN_W = 240;
export const SCREEN_H = 280;
export const GIF_H = 200; // GIF area at the top; the bar below holds text

// display.cpp bgFor()
export const SCREEN_BG: Record<ScreenStatus, string> = {
  free: "rgb(0 140 50)",
  busy: "rgb(200 20 20)",
  dnd: "rgb(110 0 170)",
  away: "rgb(210 120 0)",
  unknown: "rgb(60 60 60)",
};

// leds.cpp colorFor()
export const LED_RGB: Record<ScreenStatus, [number, number, number]> = {
  free: [0, 200, 40],
  busy: [255, 20, 0],
  dnd: [160, 0, 255],
  away: [255, 140, 0],
  unknown: [80, 80, 80],
};

// display.cpp labelFor(). DND is two lines on the colour card.
export const SCREEN_LABEL: Record<ScreenStatus, string[]> = {
  free: ["FREE"],
  busy: ["BUSY"],
  dnd: ["DO NOT", "DISTURB"],
  away: ["AWAY"],
  unknown: ["?"],
};

// The firmware stores 47 bytes of text, and its fonts only have printable ASCII:
// anything else (accents, emoji) is skipped when drawn.
export function screenText(text: string): string {
  return clipText(text).replace(/[^\x20-\x7e]/g, "");
}

// status_engine.cpp resolve(), for a device that has just synced (so never stale).
export function resolveScreen(opts: { now: number; defaultStatus: Status; presence: Presence | null; schedule: Block[] }): {
  status: Status;
  source: Exclude<ScreenSource, "fallback">;
  text: string;
  until: number;
} {
  const { now, presence, schedule } = opts;
  if (presence?.active && (presence.until === 0 || now < presence.until)) {
    return { status: presence.status, source: "manual", text: presence.text, until: presence.until };
  }
  let nextChange = 0;
  for (const b of schedule) {
    if (b.start <= now && now < b.end) return { status: b.status, source: "calendar", text: b.text, until: b.end };
    if (b.start > now && (nextChange === 0 || b.start < nextChange)) nextChange = b.start;
  }
  return { status: opts.defaultStatus, source: "default", text: "", until: nextChange };
}

// What main.cpp hands to the display for a resolved status.
export function viewFor(r: { status: ScreenStatus; text: string; until: number }, online = true): ScreenView {
  return { status: r.status, text: screenText(r.text), until: r.until, online, notice: null };
}

// The view the device falls back to when its calendar copy is over 24 hours old.
export const STALE_VIEW: ScreenView = {
  status: "unknown",
  text: "",
  until: 0,
  online: false,
  notice: "No recent calendar data",
};

// display.cpp drawUntil(): "until 3:30 PM" in the firmware's fixed UTC-7 (config.h
// kTimezone; BC has no daylight saving from 2026). A fixed offset rather than
// America/Vancouver, so browsers with older time zone data still agree with the device.
export function untilLabel(until: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Etc/GMT+7", // POSIX sign: this is UTC-7
  }).formatToParts(new Date(until * 1000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `until ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
}
