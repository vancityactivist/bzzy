// A drawing of the device: the 240x280 screen laid out like firmware/src/display.cpp,
// inside a frame lit by the LED colour from firmware/src/leds.cpp.
//
// The firmware uses LovyanGFX's FreeSans fonts (a Helvetica clone, rendered at
// 141 dpi) and never wraps text, so long messages run off both edges here too.

import { type LedStyle, RAINBOW } from "@/lib/push-rules";
import {
  FONT_PT,
  GIF_H,
  LED_RGB,
  LINE_HEIGHT,
  SCREEN_BG,
  SCREEN_H,
  SCREEN_LABEL,
  SCREEN_W,
  type ScreenView,
  STATUS_LINE_GAP,
  statusLines,
  untilLabel,
  wrapBar,
  wrapMessage,
} from "@/lib/screen";

const FONT = "Helvetica, Arial, 'Liberation Sans', Arimo, sans-serif";
const em = (pt: number) => (pt * 141) / 72;
// LovyanGFX places GFX-font text by the box around the font's tallest and deepest
// glyphs; for FreeSans that's about 0.8 em above the baseline and 0.25 em below.
const topBaseline = (y: number, pt: number) => y + 0.8 * em(pt);
const middleBaseline = (y: number, pt: number) => y + 0.275 * em(pt);

function Line({ y, pt, bold, children }: { y: number; pt: number; bold?: boolean; children: string }) {
  return (
    <text
      x={SCREEN_W / 2}
      y={y}
      textAnchor="middle"
      fill="#fff"
      fontFamily={FONT}
      fontSize={em(pt)}
      fontWeight={bold ? 700 : 400}
      style={{ whiteSpace: "pre" }}
    >
      {children}
    </text>
  );
}

export function DevicePreview({
  view,
  gifSrc,
  gifFit = false,
  scale = 1,
  className = "",
  ring,
  lazy = false,
  dark = false,
}: {
  view: ScreenView;
  gifSrc: string | null; // the status's GIF, or the show-now GIF for "show-gif"; null: no GIF
  gifFit?: boolean; // scale the GIF to fit, as an import would (for GIFs not already sized for the screen)
  scale?: number;
  className?: string;
  // A flash on the ring (a team push), instead of the steady status colour.
  ring?: LedStyle | null;
  // Below the fold (the landing page): load the GIF lazily, with its box's size up front.
  lazy?: boolean;
  // Outside working hours: backlight off and ring faded out (main.cpp), the screen kept underneath.
  dark?: boolean;
}) {
  const bg = SCREEN_BG[view.status];
  const label = SCREEN_LABEL[view.status];
  const until = view.until ? untilLabel(view.until) : null;
  // The device never has a GIF for "unknown" (but "show now" brings its own).
  const gif = view.layout === "show-text" || (view.status === "unknown" && view.layout === "status") ? null : gifSrc;
  // display.cpp openGif(): a "show now" GIF with no message gets the whole screen.
  const gifArea = view.layout === "show-gif" && !view.text ? SCREEN_H : GIF_H;
  const oneLineLabel = view.status === "dnd" ? "DO NOT DISTURB" : label.join(" ");
  // display.cpp statusLines(): the message, or the label in the bar, on one line or two.
  const barLines = view.layout === "status" ? statusLines(view.text || oneLineLabel) : [];
  const cardLines = view.layout === "status" && view.text ? statusLines(view.text) : [];
  const rainbow = ring?.color === RAINBOW ? ring : null;
  const [r, g, b] = ring?.color && !rainbow ? hexRgb(ring.color) : LED_RGB[view.status];
  const flash = ring && ring.pattern !== "solid" ? ring : null;
  const led = (a: number) => `rgb(${r} ${g} ${b} / ${a})`;
  const bezel = 14 * scale;

  const summary = [
    gif ? "GIF" : "Colour card",
    view.text || oneLineLabel,
    until,
    view.notice,
    view.online ? null : "offline",
    dark ? "dark (off hours)" : null,
    flash || rainbow ? `ring ${[rainbow ? "rainbow" : null, flash ? PATTERN_WORD[flash.pattern] : null].filter(Boolean).join(" ")}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={`relative inline-block h-max ${className}`} role="img" aria-label={`Screen preview: ${summary}`}>
      {/* LED glow through the translucent frame. "unknown" breathes, like leds.cpp. */}
      {dark ? null : rainbow ? (
        <RainbowGlow style={rainbow} scale={scale} />
      ) : flash?.pattern === "spin" ? (
        // An arc going round: a turning cone of light behind the frame.
        <div aria-hidden className="absolute -inset-[6%] overflow-hidden rounded-[32%/28%]" style={{ filter: `blur(${10 * scale}px)` }}>
          <div
            className="bzzy-ring absolute top-1/2 left-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2"
            style={{
              background: `conic-gradient(${led(0.95)} 0deg 90deg, ${led(0.35)} 140deg, transparent 180deg)`,
              animation: `bzzy-spin ${patternSeconds(flash)}s linear infinite`,
            }}
          />
        </div>
      ) : (
        <div
          aria-hidden
          className={`bzzy-ring absolute inset-0 rounded-[28%/24%] ${view.status === "unknown" && !flash ? "animate-[bzzy-breathe_5s_ease-in-out_infinite]" : ""}`}
          style={{
            background: led(0.55),
            boxShadow: `0 0 ${24 * scale}px ${6 * scale}px ${led(0.55)}, 0 0 ${60 * scale}px ${12 * scale}px ${led(0.25)}`,
            ...(flash
              ? {
                  animation: `bzzy-${flash.pattern} ${patternSeconds(flash)}s ${flash.pattern === "pulse" ? "ease-in-out" : "linear"} infinite`,
                }
              : {}),
          }}
        />
      )}
      <div className="relative rounded-[24%/20%] bg-[#151515]" style={{ padding: bezel }}>
        <div
          className="relative overflow-hidden bg-black"
          style={{ width: SCREEN_W * scale, height: SCREEN_H * scale, borderRadius: 30 * scale }}
        >
          <div
            className="absolute left-0 top-0"
            style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}
          >
            {gif && (
              <div className="absolute left-0 top-0 flex overflow-hidden bg-black" style={{ width: SCREEN_W, height: gifArea }}>
                {/* The firmware draws each frame at its own size, centred in the area (or from
                    the top-left corner when it's bigger, which auto margins also do). */}
                {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF at native size */}
                <img
                  src={gif}
                  alt=""
                  className={gifFit ? "size-full object-contain" : "m-auto max-w-none shrink-0"}
                  {...(lazy ? { loading: "lazy" as const, decoding: "async" as const, width: SCREEN_W, height: gifArea } : {})}
                />
              </div>
            )}
            <svg className="absolute left-0 top-0" width={SCREEN_W} height={SCREEN_H} viewBox={`0 0 ${SCREEN_W} ${SCREEN_H}`} aria-hidden>
              {view.layout === "show-text" ? (
                <ShowText view={view} />
              ) : view.layout === "show-gif" && gif ? (
                <ShowBar view={view} />
              ) : gif ? (
                <>
                  <rect x={0} y={GIF_H} width={SCREEN_W} height={SCREEN_H - GIF_H} fill={bg} />
                  {barLines.length > 1 ? (
                    // display.cpp: too wide for one line, so two, 26 px apart, and the end time under them.
                    <>
                      {barLines.map((l, i) => (
                        <Line key={i} y={topBaseline(GIF_H + 3 + i * STATUS_LINE_GAP, 12)} pt={12} bold>
                          {l}
                        </Line>
                      ))}
                      {until && (
                        <Line y={topBaseline(GIF_H + 57, 9)} pt={9}>
                          {until}
                        </Line>
                      )}
                    </>
                  ) : (
                    <>
                      <Line y={topBaseline(GIF_H + 12, 12)} pt={12} bold>
                        {view.text || label.join(" ")}
                      </Line>
                      {until && (
                        <Line y={topBaseline(GIF_H + 46, 9)} pt={9}>
                          {until}
                        </Line>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <rect width={SCREEN_W} height={SCREEN_H} fill={bg} />
                  {label.length > 1 ? (
                    <>
                      <Line y={middleBaseline(100, 18)} pt={18} bold>
                        {label[0]}
                      </Line>
                      <Line y={middleBaseline(140, 18)} pt={18} bold>
                        {label[1]}
                      </Line>
                    </>
                  ) : (
                    <Line y={middleBaseline(120, 24)} pt={24} bold>
                      {label[0]}
                    </Line>
                  )}
                  {cardLines.length > 1
                    ? cardLines.map((l, i) => (
                        <Line key={i} y={topBaseline(166 + i * STATUS_LINE_GAP, 12)} pt={12}>
                          {l}
                        </Line>
                      ))
                    : view.text && (
                        <Line y={topBaseline(180, 12)} pt={12}>
                          {view.text}
                        </Line>
                      )}
                  {until && (
                    <Line y={topBaseline(222, 9)} pt={9}>
                      {until}
                    </Line>
                  )}
                </>
              )}
              {view.notice && (
                <>
                  <rect x={0} y={SCREEN_H - 28} width={SCREEN_W} height={28} fill="#000" />
                  <text
                    x={SCREEN_W / 2}
                    y={SCREEN_H - 14 + 5}
                    textAnchor="middle"
                    fill="#fff"
                    fontFamily={FONT}
                    fontSize={13}
                    style={{ whiteSpace: "pre" }}
                  >
                    {view.notice}
                  </text>
                </>
              )}
              {!view.online && (
                <>
                  <circle cx={SCREEN_W - 14} cy={SCREEN_H - 14} r={6} fill="#fff" />
                  <circle cx={SCREEN_W - 14} cy={SCREEN_H - 14} r={3} fill="#000" />
                </>
              )}
            </svg>
          </div>
          {/* The backlight off: what's drawn is still there, just barely visible. */}
          {dark && <div aria-hidden className="absolute inset-0 bg-black/90" />}
        </div>
      </div>
    </div>
  );
}

// The rainbow (led_pattern.cpp rainbowHue): the colour wheel spread round the ring,
// turning the way Spin goes. Hue falls going clockwise, so each colour travels clockwise.
const RAINBOW_STOPS = "#ff0000, #ff00a0, #a000ff, #0040ff, #00d0ff, #00ff40, #ffe000, #ff8000, #ff0000";

function RainbowGlow({ style, scale }: { style: LedStyle; scale: number }) {
  const hue = rainbowSeconds(style);
  const wheel = `conic-gradient(${RAINBOW_STOPS})`;
  const turning = (seconds: number, reverse = false) => `bzzy-spin ${seconds}s linear infinite${reverse ? " reverse" : ""}`;
  const disc = "bzzy-ring absolute top-1/2 left-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2";
  const flash = style.pattern !== "solid" ? style : null;
  if (flash?.pattern === "spin") {
    // The arc turns at the spin's speed, and the colours under it at the rainbow's: the
    // wheel inside the turning arc makes up the difference.
    const spin = patternSeconds(flash);
    const rel = 360 / hue - 360 / spin; // degrees a second, relative to the arc
    const arc = "conic-gradient(#000 0deg 90deg, rgb(0 0 0 / 0.35) 140deg, transparent 180deg)";
    return (
      <div aria-hidden className="absolute -inset-[6%] overflow-hidden rounded-[32%/28%]" style={{ filter: `blur(${10 * scale}px)` }}>
        <div className={disc} style={{ maskImage: arc, WebkitMaskImage: arc, animation: turning(spin) }}>
          <div
            className="bzzy-ring absolute inset-0 rounded-full"
            style={{ background: wheel, opacity: 0.95, animation: rel ? turning(360 / Math.abs(rel), rel < 0) : undefined }}
          />
        </div>
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className="bzzy-ring absolute -inset-[6%] overflow-hidden rounded-[32%/28%]"
      style={{
        filter: `blur(${12 * scale}px)`,
        ...(flash
          ? { animation: `bzzy-${flash.pattern} ${patternSeconds(flash)}s ${flash.pattern === "pulse" ? "ease-in-out" : "linear"} infinite` }
          : {}),
      }}
    >
      <div className={disc} style={{ background: wheel, opacity: 0.7, animation: turning(hue) }} />
    </div>
  );
}

// led_pattern.cpp rainbowPeriodMs(), in seconds.
function rainbowSeconds(s: LedStyle): number {
  const speed = Math.min(3, Math.max(1, s.speed ?? 2));
  return 8 / 2 ** (speed - 1);
}

const PATTERN_WORD: Record<LedStyle["pattern"], string> = {
  solid: "steady",
  pulse: "pulsing",
  blink: "blinking",
  strobe: "strobing",
  spin: "spinning",
};

// led_pattern.cpp patternPeriodMs(), in seconds.
function patternSeconds(s: LedStyle): number {
  const speed = Math.min(3, Math.max(1, s.speed ?? 2));
  switch (s.pattern) {
    case "pulse":
      return 4 / 2 ** (speed - 1);
    case "blink":
    case "strobe":
      return 1 / speed;
    case "spin":
      return [2, 1, 0.667][speed - 1];
    default:
      return 0;
  }
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// display.cpp drawShowText(): "show now" takes over the screen, so just the message,
// big, on black.
function ShowText({ view }: { view: ScreenView }) {
  const { font, lines } = wrapMessage(view.text);
  const lh = LINE_HEIGHT[font];
  const top = Math.floor((SCREEN_H - lines.length * lh) / 2);
  return (
    <>
      <rect width={SCREEN_W} height={SCREEN_H} fill="#000" />
      {lines.map((l, i) => (
        <Line key={i} y={topBaseline(top + i * lh, FONT_PT[font])} pt={FONT_PT[font]} bold>
          {l}
        </Line>
      ))}
    </>
  );
}

// display.cpp redraw(), Layout::ShowGif: the GIF on black, and its message (if any)
// centred in the bar under it.
function ShowBar({ view }: { view: ScreenView }) {
  if (!view.text) return null;
  const lines = wrapBar(view.text);
  const top = GIF_H + Math.floor((SCREEN_H - GIF_H - lines.length * LINE_HEIGHT.bold12) / 2);
  return (
    <>
      <rect x={0} y={GIF_H} width={SCREEN_W} height={SCREEN_H - GIF_H} fill="#000" />
      {lines.map((l, i) => (
        <Line key={i} y={topBaseline(top + i * LINE_HEIGHT.bold12, 12)} pt={12} bold>
          {l}
        </Line>
      ))}
    </>
  );
}
