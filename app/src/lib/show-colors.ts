// "Show now" colours: the screen's background behind the message (and round a GIF),
// and the message's own colour. Pure, so the picker, the preview and the server agree.
//
// The firmware gets them as show.bg / show.fg (docs/protocol.md). bg "status" is the
// status's own screen colour (display.cpp bgFor()), which matches the ring.

export type ShowColors = { bg: string; fg: string }; // bg "#rrggbb" or "status"; fg "#rrggbb"

export const DEFAULT_SHOW_COLORS: ShowColors = { bg: "#000000", fg: "#ffffff" };
export const STATUS_BG = "status";
export const AUTO_TEXT = "auto";

// The background swatches. Black first: it's the default and what lights have always shown.
export const SHOW_BGS = [
  { value: "#000000", label: "Black" },
  { value: STATUS_BG, label: "Status colour" },
  { value: "#ffffff", label: "White" },
  { value: "#d81b1b", label: "Red" },
  { value: "#f07800", label: "Orange" },
  { value: "#ffd400", label: "Yellow" },
  { value: "#00a040", label: "Green" },
  { value: "#1e5bff", label: "Blue" },
  { value: "#7a1fd1", label: "Purple" },
  { value: "#ff3d8b", label: "Pink" },
] as const;

export const SHOW_FGS = [
  { value: AUTO_TEXT, label: "Automatic" },
  { value: "#ffffff", label: "White" },
  { value: "#000000", label: "Black" },
  { value: "#ffd400", label: "Yellow" },
  { value: "#00e5ff", label: "Cyan" },
  { value: "#ff3d8b", label: "Pink" },
] as const;

const HEX = /^#[0-9a-f]{6}$/;

export function isHex(v: string): boolean {
  return HEX.test(v);
}

// What the app stores and sends, from what the form posted; null = the default (white
// on black), so nothing extra goes to the light.
export function parseShowColors(bg: unknown, fg: unknown): ShowColors | null {
  const b = typeof bg === "string" ? bg.trim().toLowerCase() : "";
  const f = typeof fg === "string" ? fg.trim().toLowerCase() : "";
  const back = b === STATUS_BG || isHex(b) ? b : DEFAULT_SHOW_COLORS.bg;
  const text = isHex(f) ? f : autoText(back);
  if (back === DEFAULT_SHOW_COLORS.bg && text === DEFAULT_SHOW_COLORS.fg) return null;
  return { bg: back, fg: text };
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// WCAG relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((x) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Show now text is big and bold, so WCAG's large-text bar (3:1) is the one that counts.
export const MIN_CONTRAST = 3;

// Black or white, whichever reads better. The status colours always get white, like
// every status card the light draws.
export function autoText(bg: string): string {
  if (!isHex(bg)) return "#ffffff";
  return contrast(bg, "#ffffff") >= contrast(bg, "#000000") ? "#ffffff" : "#000000";
}

// "#rrggbb" for a background, given the status it's drawn with (screen.ts SCREEN_HEX).
export function bgHex(bg: string, statusHex: string): string {
  return bg === STATUS_BG ? statusHex : bg;
}
