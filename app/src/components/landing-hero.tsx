"use client";

import { useEffect, useState } from "react";
import { preload } from "react-dom";

import { type Status, STATUSES } from "@/lib/protocol";
import { viewFor } from "@/lib/screen";

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
    <div className="flex flex-col items-center">
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
        className="mt-2 inline-flex max-w-full items-center gap-0.5 rounded-xl border border-line bg-card p-1"
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
                "inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 active:bg-subtle/70 sm:gap-2 sm:px-3.5 sm:text-sm",
                on ? "bg-subtle text-foreground ring-1 ring-line-strong ring-inset" : "text-muted hover:bg-subtle/60 hover:text-foreground",
              )}
            >
              <StatusDot status={s} size="sm" />
              {STATUS_META[s].label}
            </button>
          );
        })}
      </div>
      {hint && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          Try it: pick a status and watch the light change.
        </p>
      )}
    </div>
  );
}
