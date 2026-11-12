// A drawing of the device: the 240x280 screen laid out like firmware/src/display.cpp,
// inside a frame lit by the LED colour from firmware/src/leds.cpp.
//
// The firmware uses LovyanGFX's FreeSans fonts (a Helvetica clone, rendered at
// 141 dpi) and never wraps text, so long messages run off both edges here too.

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
  scale = 1,
  className = "",
}: {
  view: ScreenView;
  gifSrc: string | null; // the status's GIF, or the show-now GIF for "show-gif"; null: no GIF
  scale?: number;
  className?: string;
}) {
  const bg = SCREEN_BG[view.status];
  const label = SCREEN_LABEL[view.status];
  const until = view.until ? untilLabel(view.until) : null;
  // The device never has a GIF for "unknown" (but "show now" brings its own).
  const gif = view.layout === "show-text" || (view.status === "unknown" && view.layout === "status") ? null : gifSrc;
  const oneLineLabel = view.status === "dnd" ? "DO NOT DISTURB" : label.join(" ");
  const [r, g, b] = LED_RGB[view.status];
  const led = (a: number) => `rgb(${r} ${g} ${b} / ${a})`;
  const bezel = 14 * scale;

  const summary = [gif ? "GIF" : "Colour card", view.text || oneLineLabel, until, view.notice, view.online ? null : "offline"]
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
            <svg className="absolute left-0 top-0" width={SCREEN_W} height={SCREEN_H} viewBox={`0 0 ${SCREEN_W} ${SCREEN_H}`} aria-hidden>
              {view.layout === "show-text" ? (
                <ShowText view={view} bg={bg} label={oneLineLabel} until={until} />
              ) : view.layout === "show-gif" && gif ? (
                <ShowBar view={view} bg={bg} label={oneLineLabel} until={until} />
              ) : gif ? (
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

// display.cpp drawShowText(): the message big and wrapped, status underneath.
function ShowText({ view, bg, label, until }: { view: ScreenView; bg: string; label: string; until: string | null }) {
  const { font, lines } = wrapMessage(view.text);
  const lh = LINE_HEIGHT[font];
  const top = 112 - Math.floor((lines.length * lh) / 2);
  return (
    <>
      <rect width={SCREEN_W} height={SCREEN_H} fill={bg} />
      {lines.map((l, i) => (
        <Line key={i} y={topBaseline(top + i * lh, FONT_PT[font])} pt={FONT_PT[font]} bold>
          {l}
        </Line>
      ))}
      <Line y={topBaseline(222, 9)} pt={9}>
        {until ? `${label}  ${until}` : label}
      </Line>
    </>
  );
}

// display.cpp redraw(), Layout::ShowGif: the bar under the GIF.
function ShowBar({ view, bg, label, until }: { view: ScreenView; bg: string; label: string; until: string | null }) {
  const lines = view.text ? wrapBar(view.text) : [label];
  const top = lines.length > 1 ? GIF_H + 4 : GIF_H + 12;
  return (
    <>
      <rect x={0} y={GIF_H} width={SCREEN_W} height={SCREEN_H - GIF_H} fill={bg} />
      {lines.map((l, i) => (
        <Line key={i} y={topBaseline(top + i * LINE_HEIGHT.bold12, 12)} pt={12} bold>
          {l}
        </Line>
      ))}
      {until && lines.length < 2 && (
        <Line y={topBaseline(GIF_H + 46, 9)} pt={9}>
          {until}
        </Line>
      )}
    </>
  );
}
