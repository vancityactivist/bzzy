"use client";

import { useId, useOptimistic, useState, useTransition } from "react";

import { DevicePreview } from "@/components/device-preview";
import { ChevronRightIcon } from "@/components/icons";
import { STATUS_META } from "@/components/status-meta";
import { Button, cx, Field, Input, Select, StatusDot } from "@/components/ui";
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
    <details className="group w-full border-t border-line pt-3">
      <summary className="-mx-2 flex h-8 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted transition-colors select-none hover:bg-subtle hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-4 transition-transform duration-150 group-open:rotate-90" />
        Screen and GIFs
      </summary>
      <div className="mt-4 space-y-6">
        <ScreenSimulator defaultStatus={defaultStatus} srcFor={srcFor} />
        <div>
          <h3 className="text-sm font-medium">GIF for each status</h3>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {(Object.keys(STATUS_META) as Status[]).map((s) => {
              const choice = current[s];
              const opt = choice === "default" ? defaults[s] : options.find((o) => o.value === choice);
              const id = `gif-${deviceId}-${s}`;
              return (
                <li key={s} className="flex items-end gap-3">
                  <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#0b0b0c]">
                    {opt?.src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- animated GIF preview
                      <img src={opt.src} alt="" className="max-h-full max-w-full" />
                    ) : (
                      <span className={cx("h-full w-full", STATUS_META[s].bg)} />
                    )}
                  </div>
                  <Field
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot status={s} size="sm" />
                        {STATUS_META[s].label}
                      </span>
                    }
                    htmlFor={id}
                    className="min-w-0 flex-1"
                  >
                    <Select
                      id={id}
                      value={choice}
                      disabled={pending}
                      onChange={(e) => {
                        const v = e.target.value;
                        start(async () => {
                          setCurrent({ ...current, [s]: v });
                          await setDeviceGifAction(deviceId, s, v);
                        });
                      }}
                    >
                      <option value="default">Default ({defaults[s].label})</option>
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                      <option value="none">No GIF (colour card)</option>
                    </Select>
                  </Field>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </details>
  );
}

// Try out what the screen shows for each status, a message and the offline states,
// before the device is on your desk.
function ScreenSimulator({ defaultStatus, srcFor }: { defaultStatus: Status; srcFor: (s: Status) => string | null }) {
  const idBase = useId();
  const [status, setStatus] = useState<Status | "stale">(defaultStatus);
  const [text, setText] = useState("");
  const [timed, setTimed] = useState(false);
  const [online, setOnline] = useState(true);
  // A stand-in end time: the next half hour.
  const [until] = useState(() => Math.ceil(Date.now() / 1000 / 1800) * 1800);

  const view =
    status === "stale"
      ? STALE_VIEW
      : { layout: "status" as const, status, text: screenText(text.trim()), until: timed ? until : 0, online, notice: null };
  const check = "size-4 accent-foreground";

  return (
    <div className="flex flex-col items-center gap-5 rounded-xl bg-subtle p-4 sm:flex-row sm:items-start">
      <DevicePreview view={view} gifSrc={status === "stale" ? null : srcFor(status)} scale={0.6} className="shrink-0" />
      <div className="w-full min-w-0 space-y-4">
        <div>
          <h3 className="text-sm font-medium">Preview the screen</h3>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Status to preview">
            {STATUSES.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={status === s ? "primary" : "secondary"}
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
              >
                <StatusDot status={s} size="sm" />
                {STATUS_META[s].label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={status === "stale" ? "primary" : "secondary"}
              onClick={() => setStatus("stale")}
              aria-pressed={status === "stale"}
              title="What it shows after a day without reaching the app"
            >
              No data
            </Button>
          </div>
        </div>
        <Field label="Message" htmlFor={`sim-text-${idBase}`}>
          <Input
            id={`sim-text-${idBase}`}
            value={text}
            maxLength={TEXT_MAX}
            onChange={(e) => setText(e.target.value)}
            disabled={status === "stale"}
            placeholder="On a call, back at 3"
          />
        </Field>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className={check} checked={timed} onChange={(e) => setTimed(e.target.checked)} disabled={status === "stale"} />
            With an end time
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className={check}
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
