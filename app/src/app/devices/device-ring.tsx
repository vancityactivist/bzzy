"use client";

import { useState, useTransition } from "react";

import { DevicePreview } from "@/components/device-preview";
import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import { STATUS_META } from "@/components/status-meta";
import { Button, cx, Select, StatusDot } from "@/components/ui";
import type { DeviceRing } from "@/lib/devices";
import { type Status, STATUSES } from "@/lib/protocol";
import {
  type LedStyle,
  type Pattern,
  PATTERNS,
  PUSH_COLORS,
} from "@/lib/push-rules";
import { ringFromInput, type RingInput, WARN_MINUTES } from "@/lib/ring";
import { viewFor } from "@/lib/screen";

import { setDeviceRingAction } from "../actions";

const PATTERN_LABEL: Record<Pattern, string> = {
  solid: "Steady",
  pulse: "Pulse",
  blink: "Blink",
  strobe: "Strobe",
  spin: "Spin",
};

function initial(ring: DeviceRing): RingInput {
  const styles = Object.fromEntries(
    STATUSES.map((s) => {
      const st = ring.ledStyles?.[s];
      return [s, { pattern: st?.pattern ?? "solid", speed: st?.speed ?? 2 }];
    }),
  ) as RingInput["styles"];
  const w = ring.meetingWarn;
  return {
    allowFlash: ring.allowFlash,
    styles,
    warnMinutes: w?.minutes ?? 0,
    warnPattern: w?.leds.pattern ?? "pulse",
    warnColor: w?.leds.color ?? "#ff2000",
    warnSpeed: w?.leds.speed ?? 2,
  };
}

// How the ring around the screen moves: a style for each status, a warning before
// meetings, and a switch to keep it steady (team pushes included).
export function DeviceRingSettings({
  deviceId,
  ring,
  defaultStatus,
}: {
  deviceId: string;
  ring: DeviceRing;
  defaultStatus: Status;
}) {
  const [form, setForm] = useState<RingInput>(() => initial(ring));
  const [preview, setPreview] = useState<Status | "warn">(defaultStatus);
  const [saved, setSaved] = useState<"saved" | "failed" | null>(null);
  const [pending, start] = useTransition();
  const set = (d: Partial<RingInput>) => {
    setSaved(null);
    setForm((f) => ({ ...f, ...d }));
  };
  const setStyle = (s: Status, d: Partial<RingInput["styles"][Status]>) => {
    setPreview(s);
    set({ styles: { ...form.styles, [s]: { ...form.styles[s], ...d } } });
  };

  const built = ringFromInput(form);
  const status: Status = preview === "warn" ? "free" : preview;
  const shown: LedStyle | null = !form.allowFlash
    ? null
    : preview === "warn"
      ? (built.meetingWarn?.leds ?? null)
      : (built.ledStyles[preview] ?? null);
  const off = !form.allowFlash;

  return (
    <details className="group w-full border-t border-line pt-3">
      <summary className="-mx-2 flex h-8 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted transition-colors select-none hover:bg-subtle hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-4 transition-transform duration-150 group-open:rotate-90" />
        Ring and flashing
      </summary>
      <form
        className="mt-4 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await setDeviceRingAction(deviceId, form);
            setSaved(r.ok ? "saved" : "failed");
          });
        }}
      >
        <div className="flex flex-col items-center gap-5 rounded-xl bg-subtle p-4 sm:flex-row sm:items-start">
          <DevicePreview
            view={viewFor({ status, text: "", until: 0 })}
            gifSrc={null}
            ring={shown}
            scale={0.6}
            className="m-3 shrink-0"
          />
          <div className="w-full min-w-0 space-y-3">
            <h3 className="text-sm font-medium">Preview the ring</h3>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="What to preview"
            >
              {STATUSES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={preview === s ? "primary" : "secondary"}
                  aria-pressed={preview === s}
                  onClick={() => setPreview(s)}
                >
                  <StatusDot status={s} size="sm" />
                  {STATUS_META[s].label}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={preview === "warn" ? "primary" : "secondary"}
                aria-pressed={preview === "warn"}
                onClick={() => setPreview("warn")}
              >
                Meeting soon
              </Button>
            </div>
            <label className="flex items-start gap-2 pt-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-foreground"
                checked={form.allowFlash}
                onChange={(e) => set({ allowFlash: e.target.checked })}
              />
              <span>
                <span className="font-medium">Let this light flash</span>
                <span className="block text-muted">
                  Off keeps the ring steady in the status colour, even for team
                  pushes.
                </span>
              </span>
            </label>
            <p className="text-xs text-muted">
              Never faster than 3 flashes a second. Lights on older firmware
              stay steady until they update.
            </p>
          </div>
        </div>

        <fieldset
          disabled={off}
          className={cx("space-y-6", off && "opacity-50")}
        >
          <div>
            <h3 className="text-sm font-medium">For each status</h3>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {STATUSES.map((s) => (
                <li key={s} className="flex flex-wrap items-center gap-2">
                  <span className="flex basis-full items-center gap-1.5 text-sm">
                    <StatusDot status={s} size="sm" />
                    {STATUS_META[s].label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Select
                      aria-label={`${STATUS_META[s].label}: pattern`}
                      value={form.styles[s].pattern}
                      onChange={(e) =>
                        setStyle(s, { pattern: e.target.value as Pattern })
                      }
                      onFocus={() => setPreview(s)}
                    >
                      {PATTERNS.map((p) => (
                        <option key={p} value={p}>
                          {PATTERN_LABEL[p]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-28 shrink-0">
                    <Select
                      aria-label={`${STATUS_META[s].label}: speed`}
                      value={form.styles[s].speed}
                      disabled={off || form.styles[s].pattern === "solid"}
                      onChange={(e) =>
                        setStyle(s, { speed: Number(e.target.value) })
                      }
                    >
                      <option value={1}>Slow</option>
                      <option value={2}>Normal</option>
                      <option value={3}>Fast</option>
                    </Select>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Before a meeting</h3>
              <p className="text-xs text-muted">
                Flashes from a few minutes before each calendar event until it
                starts, even if Wi-Fi drops.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="w-52">
                <Select
                  aria-label="When"
                  value={form.warnMinutes}
                  onChange={(e) => {
                    setPreview("warn");
                    set({ warnMinutes: Number(e.target.value) });
                  }}
                >
                  {WARN_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m === 0
                        ? "Don't warn me"
                        : `${m} ${m === 1 ? "minute" : "minutes"} before`}
                    </option>
                  ))}
                </Select>
              </div>
              {form.warnMinutes > 0 && (
                <>
                  <div className="w-32">
                    <Select
                      aria-label="Warning pattern"
                      value={form.warnPattern}
                      onChange={(e) => {
                        setPreview("warn");
                        set({ warnPattern: e.target.value as Pattern });
                      }}
                    >
                      {PATTERNS.map((p) => (
                        <option key={p} value={p}>
                          {PATTERN_LABEL[p]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-28">
                    <Select
                      aria-label="Warning speed"
                      value={form.warnSpeed}
                      disabled={off || form.warnPattern === "solid"}
                      onChange={(e) =>
                        set({ warnSpeed: Number(e.target.value) })
                      }
                    >
                      <option value={1}>Slow</option>
                      <option value={2}>Normal</option>
                      <option value={3}>Fast</option>
                    </Select>
                  </div>
                </>
              )}
            </div>
            {form.warnMinutes > 0 && (
              <div
                className="flex flex-wrap items-center gap-2"
                role="radiogroup"
                aria-label="Warning colour"
              >
                {PUSH_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={form.warnColor === c.value}
                    aria-label={c.value ? c.label : "The status colour"}
                    title={c.value ? c.label : "The status colour"}
                    onClick={() => {
                      setPreview("warn");
                      set({ warnColor: c.value });
                    }}
                    className={cx(
                      "flex size-8 items-center justify-center rounded-full ring-1 ring-line ring-inset transition-shadow",
                      form.warnColor === c.value &&
                        "ring-2 ring-foreground ring-offset-2 ring-offset-card",
                    )}
                    style={{
                      background:
                        c.value ||
                        "conic-gradient(#00c828 0 25%, #ff1400 0 50%, #a000ff 0 75%, #ff8c00 0)",
                    }}
                  >
                    {form.warnColor === c.value && (
                      <CheckIcon
                        className={cx(
                          "size-4",
                          c.value === "#ffffff" || c.value === "#ffd400"
                            ? "text-black"
                            : "text-white",
                        )}
                        strokeWidth={3}
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save ring settings"}
          </Button>
          {saved === "saved" && !pending && (
            <p className="text-sm text-muted" role="status">
              Saved. The light picks it up within about 20 seconds.
            </p>
          )}
          {saved === "failed" && (
            <p className="text-sm text-danger" role="alert">
              Couldn&apos;t save that. Try again?
            </p>
          )}
        </div>
      </form>
    </details>
  );
}
