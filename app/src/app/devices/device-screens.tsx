"use client";

import { useOptimistic, useTransition } from "react";

import { STATUS_META } from "@/components/status-meta";
import type { Status } from "@/lib/protocol";

import { setDeviceGifAction } from "../actions";

export type GifOption = { value: string; label: string; src: string | null };

export function DeviceScreens({
  deviceId,
  choices,
  options,
  defaults,
}: {
  deviceId: string;
  choices: Record<Status, string>;
  options: GifOption[];
  defaults: Record<Status, GifOption>;
}) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useOptimistic(choices);

  return (
    <details className="w-full text-sm">
      <summary className="cursor-pointer text-muted hover:text-foreground">Screen GIFs</summary>
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
