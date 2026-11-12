// A drawing of the device: the 240x280 screen laid out like firmware/src/display.cpp,
// inside a frame lit by the LED colour from firmware/src/leds.cpp.
//
// The firmware uses LovyanGFX's FreeSans fonts (a Helvetica clone, rendered at
// 141 dpi) and never wraps text, so long messages run off both edges here too.

import { GIF_H, LED_RGB, SCREEN_BG, SCREEN_H, SCREEN_LABEL, SCREEN_W, type ScreenView, untilLabel } from "@/lib/screen";

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
  scale = 1,
  className = "",
}: {
  view: ScreenView;
  gifSrc: string | null; // null: no GIF for this status, so the colour card
  scale?: number;
  className?: string;
}) {
  const bg = SCREEN_BG[view.status];
  const label = SCREEN_LABEL[view.status];
  const until = view.until ? untilLabel(view.until) : null;
  // The device never has a GIF for "unknown".
  const gif = view.status === "unknown" ? null : gifSrc;
  const [r, g, b] = LED_RGB[view.status];
  const led = (a: number) => `rgb(${r} ${g} ${b} / ${a})`;
  const bezel = 14 * scale;

  const summary = [gif ? "GIF" : "Colour card", view.text || label.join(" "), until, view.notice, view.online ? null : "offline"]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={`relative inline-block h-max ${className}`} role="img" aria-label={`Screen preview: ${summary}`}>
      {/* LED glow through the translucent frame. "unknown" breathes, like leds.cpp. */}
      <div
        aria-hidden
        className={`absolute inset-0 rounded-[28%/24%] ${view.status === "unknown" ? "animate-[bzzy-breathe_5s_ease-in-out_infinite]" : ""}`}
        style={{
          background: led(0.55),
          boxShadow: `0 0 ${24 * scale}px ${6 * scale}px ${led(0.55)}, 0 0 ${60 * scale}px ${12 * scale}px ${led(0.25)}`,
        }}
      />
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
              <div className="absolute left-0 top-0 overflow-hidden bg-black" style={{ width: SCREEN_W, height: GIF_H }}>
                {/* The firmware draws each frame at its own size from the top-left corner. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF at native size */}
                <img src={gif} alt="" className="absolute left-0 top-0 max-w-none" />
              </div>
            )}
            <svg
              className="absolute left-0 top-0"
              width={SCREEN_W}
              height={SCREEN_H}
              viewBox={`0 0 ${SCREEN_W} ${SCREEN_H}`}
              aria-hidden
            >
              {gif ? (
                <>
                  <rect x={0} y={GIF_H} width={SCREEN_W} height={SCREEN_H - GIF_H} fill={bg} />
                  <Line y={topBaseline(GIF_H + 12, 12)} pt={12} bold>
                    {view.text || label.join(" ")}
                  </Line>
                  {until && (
                    <Line y={topBaseline(GIF_H + 46, 9)} pt={9}>
                      {until}
                    </Line>
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
                  {view.text && (
                    <Line y={topBaseline(180, 12)} pt={12}>
                      {view.text}
                    </Line>
                  )}
                  {until && (
                    <Line y={topBaseline(220, 9)} pt={9}>
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
        </div>
      </div>
    </div>
  );
}
