import type { Status } from "@/lib/protocol";
import { viewFor } from "@/lib/screen";

import { DevicePreview } from "./device-preview";
import { LinkIcon } from "./icons";
import { STATUS_META } from "./status-meta";
import { cx, StatusDot } from "./ui";

// Small drawings for "Three ways to set it", built from the app's own pieces rather than
// screenshots. All decorative: the card text next to each says the same thing.

const SOLID: Record<Status, string> = { free: "bg-free", busy: "bg-busy", dnd: "bg-dnd", away: "bg-away" };
const TINT: Record<Status, string> = {
  free: "bg-free/10 border-free",
  busy: "bg-busy/10 border-busy",
  dnd: "bg-dnd/10 border-dnd",
  away: "bg-away/10 border-away",
};

/** A mini version of the app's "Set your status" panel, with Busy picked. */
export function StatusPickerSketch() {
  const picked: Status = "busy";
  return (
    <div aria-hidden className="w-full max-w-64 rounded-xl border border-line bg-card p-3 shadow-pop">
      <div className="grid grid-cols-2 gap-1.5">
        {(["free", "busy", "dnd", "away"] as const).map((s) => (
          <div
            key={s}
            className={cx(
              "flex h-9 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold",
              s === picked ? TINT[s] : "border-line bg-card",
            )}
          >
            <span className={cx("size-2 shrink-0 rounded-full", SOLID[s])} />
            {STATUS_META[s].label}
          </div>
        ))}
      </div>
      <div className="mt-3 flex h-7 items-center rounded-md border border-line bg-background px-2 text-[11px]">
        On a call, back at 3
        <span className="ml-px h-3.5 w-px bg-foreground motion-safe:animate-pulse" />
      </div>
      <div className="mt-2.5 flex gap-1">
        {["30 min", "1 hour", "2 hours"].map((d) => (
          <span
            key={d}
            className={cx(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              d === "1 hour" ? "bg-foreground text-background" : "border border-line text-muted",
            )}
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

// A morning from a calendar feed, in hours from 9:00. Meetings are Busy, out of office
// is Away, and the gaps fall back to Free.
const DAY_START = 9;
const DAY_HOURS = 5;
const EVENTS: { title: string; start: number; end: number; status: Status }[] = [
  { title: "Standup", start: 9.25, end: 10, status: "busy" },
  { title: "Design review", start: 10.5, end: 11.5, status: "busy" },
  { title: "Dentist", start: 12.5, end: 14, status: "away" },
];
const pct = (h: number) => `${((h - DAY_START) / DAY_HOURS) * 100}%`;
const hourLabel = (h: number) => `${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`;

/** A day view with meeting blocks, and the light's colour beside it changing to match. */
export function CalendarSketch() {
  // The light's colour over the morning: each event, and Free in between.
  const strip: { start: number; end: number; status: Status }[] = [];
  let t = DAY_START;
  for (const e of EVENTS) {
    if (e.start > t) strip.push({ start: t, end: e.start, status: "free" });
    strip.push(e);
    t = e.end;
  }
  if (t < DAY_START + DAY_HOURS) strip.push({ start: t, end: DAY_START + DAY_HOURS, status: "free" });

  return (
    <div aria-hidden className="w-full max-w-64 rounded-xl border border-line bg-card p-3 shadow-pop">
      <div className="mb-2 flex items-center justify-between text-[10px] font-medium text-muted">
        <span>Tuesday</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 font-mono">
          <LinkIcon className="size-2.5" />
          work.ics
        </span>
      </div>
      <div className="relative flex h-40 gap-2">
        <div className="relative w-7 shrink-0 font-mono text-[9px] text-muted">
          {Array.from({ length: DAY_HOURS }, (_, i) => DAY_START + i).map((h) => (
            <span key={h} className="absolute -translate-y-1/2" style={{ top: pct(h) }}>
              {hourLabel(h)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {Array.from({ length: DAY_HOURS }, (_, i) => DAY_START + i).map((h) => (
            <div key={h} className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: pct(h) }} />
          ))}
          {EVENTS.map((e) => (
            <div
              key={e.title}
              className="absolute inset-x-0 overflow-hidden rounded-md bg-card"
              style={{ top: pct(e.start), height: `calc(${pct(e.end)} - ${pct(e.start)} - 2px)` }}
            >
              <div className={cx("h-full border-l-2 px-1.5 py-0.5 text-[10px] font-medium leading-tight", TINT[e.status])}>
                {e.title}
              </div>
            </div>
          ))}
        </div>
        {/* What the light shows */}
        <div className="relative w-2 shrink-0 overflow-hidden rounded-full">
          {strip.map((s) => (
            <div
              key={s.start}
              className={cx("absolute inset-x-0", SOLID[s.status])}
              style={{ top: pct(s.start), height: `calc(${pct(s.end)} - ${pct(s.start)})` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The light itself, with a finger-tap ripple on the screen. Taps go Free, Busy, Do not
 * disturb, then back to automatic (firmware status_engine.cpp cycleLocalOverride).
 */
export function TapSketch({ gifSrc }: { gifSrc: string | null }) {
  return (
    <div aria-hidden className="flex items-center gap-4">
      <div className="relative">
        <DevicePreview view={viewFor({ status: "free", text: "", until: 0 })} gifSrc={gifSrc} scale={0.38} className="m-3" lazy />
        <span className="absolute top-[44%] left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-white/60 motion-safe:animate-ping" />
          <span className="relative size-5 rounded-full border-2 border-white bg-white/40 shadow-pop" />
        </span>
      </div>
      <ul className="space-y-4 text-[11px] whitespace-nowrap">
        <li>
          <Key>tap</Key>
          <span className="mt-1.5 flex items-center gap-1 text-muted">
            <StatusDot status="free" size="sm" />→<StatusDot status="busy" size="sm" />→<StatusDot status="dnd" size="sm" />→ auto
          </span>
        </li>
        <li>
          <Key>hold</Key>
          <span className="mt-1.5 block text-muted">back to calendar</span>
        </li>
      </ul>
    </div>
  );
}

function Key({ children }: { children: string }) {
  return (
    <span className="inline-block rounded-md border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted shadow-card">
      {children}
    </span>
  );
}
