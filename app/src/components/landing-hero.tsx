"use client";

import { useEffect, useState } from "react";
import { preload } from "react-dom";

import { type Status, STATUSES } from "@/lib/protocol";
import { LED_RGB, viewFor } from "@/lib/screen";

import { DevicePreview } from "./device-preview";
import { STATUS_META } from "./status-meta";
import { cx, StatusDot } from "./ui";

// The hero's live device: four status chips drive a real DevicePreview. It steps through
// the statuses on its own until someone picks one (never under reduced motion, and not
// while the tab is hidden).

const CYCLE_MS = 4000;

// 11:30 AM on the device's fixed UTC-7 clock, so the server and browser draw the same line.
const ELEVEN_THIRTY = Date.UTC(2026, 0, 5, 18, 30) / 1000;

const SAMPLE: Record<Status, { text: string; until: number }> = {
  free: { text: "", until: 0 },
  busy: { text: "On a call, back at 3", until: 0 },
  dnd: { text: "Heads down", until: ELEVEN_THIRTY },
  away: { text: "Back Monday", until: 0 },
};

const next = (s: Status) => STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];
const tint = (s: Status, a: number) => {
  const [r, g, b] = LED_RGB[s];
  return `rgb(${r} ${g} ${b} / ${a})`;
};

export function LandingHeroDevice({
  gifs,
  scale = 1.1,
  hint = true,
}: {
  gifs: Record<Status, string | null>;
  scale?: number;
  hint?: boolean; // the "Try it" line under the chips
}) {
  const [status, setStatus] = useState<Status>("busy");
  const [auto, setAuto] = useState(true);

  // Fetch every status's GIF up front so switching never flashes an empty screen.
  for (const s of STATUSES) {
    const src = gifs[s];
    if (src) preload(src, { as: "image" });
  }

  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: number | undefined;
    const start = () => {
      if (timer === undefined) timer = window.setInterval(() => setStatus(next), CYCLE_MS);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [auto]);

  const view = viewFor({ status, ...SAMPLE[status] });

  return (
    <div className="relative isolate flex flex-col items-center">
      {/* A soft wash of the status colour behind the light. One layer per status so it can fade. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-8 bottom-16 -z-10">
        {STATUSES.map((s) => (
          <div
            key={s}
            className={cx(
              "absolute inset-0 transition-opacity duration-700",
              s === status ? "opacity-100" : "opacity-0",
            )}
            style={{ background: `radial-gradient(closest-side, ${tint(s, 0.16)}, ${tint(s, 0.05)} 55%, transparent)` }}
          />
        ))}
      </div>

      <div className="[zoom:0.8] sm:[zoom:1]">
        <DevicePreview
          view={view}
          gifSrc={gifs[status]}
          scale={scale}
          lazy
          className="m-10 [&>div:first-child]:transition-[background-color,box-shadow] [&>div:first-child]:duration-500"
        />
      </div>

      <div
        role="group"
        aria-label="Try a status"
        className="mt-2 inline-flex max-w-full items-center gap-0.5 rounded-full border border-line bg-card/80 p-1 shadow-card backdrop-blur"
      >
        {STATUSES.map((s) => {
          const on = s === status;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setAuto(false);
                setStatus(s);
              }}
              className={cx(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 sm:gap-2 sm:px-3.5 sm:text-sm",
                on ? "bg-subtle text-foreground ring-1 ring-line-strong ring-inset" : "text-muted hover:text-foreground",
              )}
            >
              <StatusDot status={s} size="sm" className={cx("transition-transform", on && "scale-125")} />
              {STATUS_META[s].label}
            </button>
          );
        })}
      </div>
      {hint && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden className="font-mono">↑</span>
          Try it: pick a status and watch the light change.
        </p>
      )}
    </div>
  );
}
