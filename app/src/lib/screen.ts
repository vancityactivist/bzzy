// What the device's screen and LEDs show, worked out the same way the firmware does,
// so the app can draw a faithful preview. Pure: no database, no React.
//
// Mirrors firmware/lib/core/src/status_engine.cpp (which status wins) and
// firmware/src/display.cpp + leds.cpp (colours, layout, fonts). If you change one
// side, change the other.

import { type Block, clipText, type Presence, type Status } from "./protocol";
import { bgHex, type ShowColors } from "./show-colors";
import { screenLabel, type StatusLabels } from "./status-labels";

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
  colors?: ShowColors | null; // a show's background and text colours; null: white on black
  // The status's name as the light draws it (screenLabel()); left out, the standard word.
  label?: string;
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

// The same, as "#rrggbb" (for contrast maths and colour pickers).
export const SCREEN_HEX: Record<ScreenStatus, string> = {
  free: "#008c32",
  busy: "#c81414",
  dnd: "#6e00aa",
  away: "#d27800",
  unknown: "#3c3c3c",
};

// A show's colours as the screen draws them: [background, text], "#rrggbb".
export function showPaint(view: ScreenView): [string, string] {
  const c = view.colors;
  return c ? [bgHex(c.bg, SCREEN_HEX[view.status]), c.fg] : ["#000000", "#ffffff"];
}

// leds.cpp colorFor()
export const LED_RGB: Record<ScreenStatus, [number, number, number]> = {
  free: [0, 200, 40],
  busy: [255, 20, 0],
  dnd: [160, 0, 255],
  away: [255, 140, 0],
  unknown: [80, 80, 80],
};

// display.cpp labelFor(): the standard words, on firmware from before the "labels" feature.
export const SCREEN_LABEL: Record<ScreenStatus, string> = {
  free: "FREE",
  busy: "BUSY",
  dnd: "DO NOT DISTURB",
  away: "AWAY",
  unknown: "?",
};

/** The status's name as the light draws it, on one line. */
export function viewLabel(view: ScreenView): string {
  return view.status === "unknown" ? SCREEN_LABEL.unknown : (view.label ?? SCREEN_LABEL[view.status]);
}

// display.cpp drawCardLabel(): the name across the colour card. One line in bold 24 pt
// when it fits, else bold 18 pt, else two lines of 18 pt (as "DO NOT" / "DISTURB"
// always has been), else two lines of 12 pt.
export const CARD_LABEL_WIDTH = 220;
export function cardLabel(label: string): { font: "bold24" | WrapFont; lines: string[] } {
  if (textWidth(label, "bold24") <= CARD_LABEL_WIDTH) return { font: "bold24", lines: [label] };
  if (textWidth(label, "bold18") <= CARD_LABEL_WIDTH) return { font: "bold18", lines: [label] };
  const two = wrapText(label, "bold18", CARD_LABEL_WIDTH, 2);
  if (!two.cut) return { font: "bold18", lines: two.lines };
  return { font: "bold12", lines: wrapText(label, "bold12", CARD_LABEL_WIDTH, 2).lines };
}

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
// `labels`: what the light calls the statuses, when its firmware can draw them.
export function viewFor(r: { status: ScreenStatus; text: string; until: number }, online = true, labels?: StatusLabels | null): ScreenView {
  const view: ScreenView = {
    layout: "status",
    status: r.status,
    text: screenText(r.text),
    until: r.until,
    online,
    notice: null,
  };
  return labels && r.status !== "unknown" && labels[r.status] ? { ...view, label: screenText(screenLabel(r.status, labels)) } : view;
}

// main.cpp: "show now" replaces the screen, in its own colours (white on black unless
// picked), while the ring keeps the status's. Without a
// GIF (or before it has downloaded) a message gets its own card; with neither, the
// screen stays as it was.
export function withShow(
  view: ScreenView,
  show: { text: string; until: number; gif: boolean; colors?: ShowColors | null } | null,
): ScreenView {
  if (!show) return view;
  const text = screenText(show.text.trim()); // the app saves it trimmed
  const layout: ScreenLayout = show.gif ? "show-gif" : text ? "show-text" : "status";
  if (layout === "status") return view;
  return { ...view, layout, text, until: show.until, colors: show.colors ?? null };
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

export type WrapFont = "bold12" | "bold18" | "bold24";

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
  bold24: [
    13, 16, 22, 26, 26, 42, 34, 12, 16, 16, 18, 27, 12, 16, 12, 13, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 12, 12, 27, 27, 27, 29, 46, 33, 33,
    34, 34, 31, 30, 36, 35, 15, 27, 34, 29, 41, 35, 37, 32, 37, 34, 32, 30, 35, 31, 45, 32, 30, 29, 16, 13, 16, 27, 26, 12, 27, 29, 26, 29,
    27, 16, 29, 28, 13, 13, 27, 13, 42, 29, 29, 29, 29, 18, 26, 16, 29, 25, 37, 26, 26, 24, 18, 13, 18, 23,
  ],
};
export const LINE_HEIGHT: Record<WrapFont, number> = { bold12: 29, bold18: 42, bold24: 56 };
export const FONT_PT: Record<WrapFont, number> = { bold12: 12, bold18: 18, bold24: 24 };
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

// display.cpp statusLines(): a status's message (or label) is one line in bold 12 pt when
// it fits across the whole 240 px screen, else it wraps to two lines (the wrapBar() rules).
// Past two lines the rest is dropped, so the app says what will show before it's sent.
export const BAR_WIDTH = 240;
export const STATUS_LINE_GAP = 26; // display.cpp kStatusLineGap
export function statusLines(s: string): string[] {
  const text = screenText(s).trim();
  if (!text) return [];
  if (textWidth(text, "bold12") <= BAR_WIDTH) return [text];
  return wrapText(text, "bold12", MESSAGE_WIDTH, 2).lines;
}

/** What of a status message the light shows, when that's not all of it; else null. */
export function statusCut(s: string): string | null {
  const text = screenText(s).trim();
  const shown = statusLines(text).join(" ");
  return shown.replace(/ +/g, " ") === text.replace(/ +/g, " ") ? null : shown;
}
