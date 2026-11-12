// What the device's screen and LEDs show, worked out the same way the firmware does,
// so the app can draw a faithful preview. Pure: no database, no React.
//
// Mirrors firmware/lib/core/src/status_engine.cpp (which status wins) and
// firmware/src/display.cpp + leds.cpp (colours, layout, fonts). If you change one
// side, change the other.

import { type Block, clipText, type Presence, type Status } from "./protocol";

export type ScreenStatus = Status | "unknown";

// display.h Layout. "show-gif" and "show-text" are "show now" from the app.
export type ScreenLayout = "status" | "show-gif" | "show-text";

export type ScreenView = {
  layout: ScreenLayout;
  status: ScreenStatus;
  text: string; // event, custom or show-now text; "" for none
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
  return {
    layout: "status",
    status: r.status,
    text: screenText(r.text),
    until: r.until,
    online,
    notice: null,
  };
}

// main.cpp: "show now" replaces the screen but keeps the status's colours. Without a
// GIF (or before it has downloaded) a message gets its own card; with neither, the
// screen stays as it was.
export function withShow(view: ScreenView, show: { text: string; until: number; gif: boolean } | null): ScreenView {
  if (!show) return view;
  const text = screenText(show.text.trim()); // the app saves it trimmed
  const layout: ScreenLayout = show.gif ? "show-gif" : text ? "show-text" : "status";
  if (layout === "status") return view;
  return { ...view, layout, text, until: show.until };
}

// The view the device falls back to when its calendar copy is over 24 hours old.
export const STALE_VIEW: ScreenView = {
  layout: "status",
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

// ---- word wrap (firmware/lib/core/src/text_wrap.cpp) ----

export type WrapFont = "bold12" | "bold18";

// Advance widths of ' '..'~' in LovyanGFX's FreeSansBold fonts, in pixels. Same
// tables as text_wrap.cpp.
const WIDTHS: Record<WrapFont, number[]> = {
  bold12: [
    7, 8, 11, 13, 13, 21, 17, 6, 8, 8, 9, 14, 6, 8, 6, 7, 13, 14, 13, 13, 13, 13, 13, 13, 13, 13, 6, 6, 14, 14, 14, 15, 23, 17, 17, 17, 17,
    16, 15, 18, 18, 7, 14, 17, 15, 21, 18, 19, 16, 19, 17, 16, 15, 18, 16, 23, 16, 15, 15, 8, 7, 8, 14, 13, 6, 14, 15, 13, 15, 14, 8, 15,
    14, 7, 7, 14, 6, 21, 15, 15, 15, 15, 9, 13, 8, 15, 13, 19, 13, 13, 12, 9, 7, 9, 12,
  ],
  bold18: [
    10, 12, 17, 19, 19, 31, 25, 9, 12, 12, 14, 20, 9, 12, 9, 10, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 9, 9, 20, 20, 20, 21, 34, 24, 25,
    25, 25, 23, 22, 27, 26, 11, 20, 25, 22, 30, 26, 27, 24, 27, 25, 24, 23, 26, 23, 34, 24, 22, 21, 12, 10, 12, 20, 19, 9, 20, 22, 20, 22,
    20, 12, 21, 21, 10, 10, 20, 9, 31, 21, 21, 22, 22, 14, 19, 12, 21, 19, 27, 19, 19, 18, 14, 10, 14, 18,
  ],
};
export const LINE_HEIGHT: Record<WrapFont, number> = { bold12: 29, bold18: 42 };
export const FONT_PT: Record<WrapFont, number> = { bold12: 12, bold18: 18 };
export const MESSAGE_WIDTH = 220;

export function textWidth(s: string, font: WrapFont): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (ch.length === 1 && c >= 0x20 && c <= 0x7e) w += WIDTHS[font][c - 0x20];
  }
  return w;
}

// Greedy word wrap; a word too wide for a line is broken between characters.
// Expects screenText() output (printable ASCII).
export function wrapText(s: string, font: WrapFont, maxWidth: number, maxLines: number): { lines: string[]; cut: boolean } {
  const n = s.length;
  const lines: string[] = [];
  const skip = (j: number) => {
    while (j < n && s[j] === " ") j++;
    return j;
  };
  let i = skip(0);
  while (i < n && lines.length < maxLines) {
    const start = i;
    let end = start;
    let j = start;
    while (j < n) {
      let k = j;
      while (k < n && s[k] !== " ") k++;
      if (textWidth(s.slice(start, k), font) > maxWidth) break;
      end = k;
      j = skip(k);
    }
    if (end === start) {
      let k = start;
      while (k < n && s[k] !== " " && textWidth(s.slice(start, k + 1), font) <= maxWidth) k++;
      if (k === start) k++;
      end = k;
      j = k;
    }
    lines.push(s.slice(start, end));
    i = skip(j);
  }
  return { lines, cut: i < n };
}

export function wrapMessage(s: string): { font: WrapFont; lines: string[] } {
  const big = wrapText(s, "bold18", MESSAGE_WIDTH, 4);
  if (!big.cut) return { font: "bold18", lines: big.lines };
  return {
    font: "bold12",
    lines: wrapText(s, "bold12", MESSAGE_WIDTH, 6).lines,
  };
}

export function wrapBar(s: string): string[] {
  return wrapText(s, "bold12", MESSAGE_WIDTH, 2).lines;
}
