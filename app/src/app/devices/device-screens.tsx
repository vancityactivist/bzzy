"use client";

import { useOptimistic, useState, useTransition } from "react";

import { DevicePreview } from "@/components/device-preview";
import { STATUS_META } from "@/components/status-meta";
import { type Status, STATUSES, TEXT_MAX } from "@/lib/protocol";
import { STALE_VIEW, screenText } from "@/lib/screen";

import { setDeviceGifAction } from "../actions";

export type GifOption = { value: string; label: string; src: string | null };

export function DeviceScreens({
  deviceId,
  choices,
  options,
  defaults,
  defaultStatus,
}: {
  deviceId: string;
  defaultStatus: Status;
  choices: Record<Status, string>;
  options: GifOption[];
  defaults: Record<Status, GifOption>;
}) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useOptimistic(choices);
  const srcFor = (s: Status) => {
    const choice = current[s];
    const opt = choice === "default" ? defaults[s] : options.find((o) => o.value === choice);
    return opt?.src ?? null;
  };

  return (
    <details className="w-full text-sm">
      <summary className="cursor-pointer text-muted hover:text-foreground">Screen and GIFs</summary>
      <ScreenSimulator defaultStatus={defaultStatus} srcFor={srcFor} />
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {(Object.keys(STATUS_META) as Status[]).map((s) => {
          const choice = current[s];
          const opt = choice === "default" ? defaults[s] : options.find((o) => o.value === choice);
          return (
            <li key={s} className="flex items-center gap-3">
              <div className="flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-[#0b0b0c]">
                {opt?.src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- animated GIF preview
                  <img src={opt.src} alt="" className="max-h-full max-w-full" />
                ) : (
                  <span className={`h-full w-full ${STATUS_META[s].bg}`} />
                )}
              </div>
              <label className="min-w-0 flex-1">
                <span className="block text-xs text-muted">{STATUS_META[s].label}</span>
                <select
                  value={choice}
                  disabled={pending}
                  onChange={(e) => {
                    const v = e.target.value;
                    start(async () => {
                      setCurrent({ ...current, [s]: v });
                      await setDeviceGifAction(deviceId, s, v);
                    });
                  }}
                  className="w-full rounded-md border border-line bg-background px-2 py-1"
                >
                  <option value="default">Default ({defaults[s].label})</option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  <option value="none">No GIF (colour card)</option>
                </select>
              </label>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

// Try out what the screen shows for each status, a message and the offline states,
// before the device is on your desk.
function ScreenSimulator({ defaultStatus, srcFor }: { defaultStatus: Status; srcFor: (s: Status) => string | null }) {
  const [status, setStatus] = useState<Status | "stale">(defaultStatus);
  const [text, setText] = useState("");
  const [timed, setTimed] = useState(false);
  const [online, setOnline] = useState(true);
  // A stand-in end time: the next half hour.
  const [until] = useState(() => Math.ceil(Date.now() / 1000 / 1800) * 1800);

  const view =
    status === "stale" ? STALE_VIEW : { status, text: screenText(text.trim()), until: timed ? until : 0, online, notice: null };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 ${active ? "border-foreground bg-foreground text-background" : "border-line hover:bg-background"}`;

  return (
    <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <DevicePreview view={view} gifSrc={status === "stale" ? null : srcFor(status)} scale={0.6} className="m-4 shrink-0" />
      <div className="w-full min-w-0 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Status to preview">
          {STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={chip(status === s)} aria-pressed={status === s}>
              {STATUS_META[s].label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setStatus("stale")}
            className={chip(status === "stale")}
            aria-pressed={status === "stale"}
            title="What it shows after a day without reaching the app"
          >
            No data
          </button>
        </div>
        <label className="block">
          <span className="text-xs text-muted">Message</span>
          <input
            value={text}
            maxLength={TEXT_MAX}
            onChange={(e) => setText(e.target.value)}
            disabled={status === "stale"}
            placeholder="On a call, back at 3"
            className="mt-1 w-full rounded-md border border-line bg-background px-2 py-1"
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} disabled={status === "stale"} />
            With an end time
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!online}
              onChange={(e) => setOnline(!e.target.checked)}
              disabled={status === "stale"}
            />
            Can&apos;t reach the app
          </label>
        </div>
        <p className="text-xs text-muted">
          Long messages run off the edges, and the screen&apos;s font has no accents or emoji, so those are left out.
        </p>
      </div>
    </div>
  );
}
