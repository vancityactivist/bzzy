"use client";

import { useState, useTransition } from "react";

import { DevicePreview } from "@/components/device-preview";
import { ColorSwatches } from "@/components/ring-picker";
import { STATUS_META } from "@/components/status-meta";
import { Button, cx, Select, StatusDot } from "@/components/ui";
import { type Status, STATUSES } from "@/lib/protocol";
import { type LedStyle, type Pattern, PATTERNS } from "@/lib/push-rules";
import { type LedStyles, lookRingFromInput, type LookRingInput, type MeetingWarn, WARN_MINUTES } from "@/lib/ring";
import { viewFor } from "@/lib/screen";

import { setLookGifAction, setLookRingAction } from "@/app/actions";

export type GifOption = { value: string; label: string; src: string | null };

const PATTERN_LABEL: Record<Pattern, string> = {
  solid: "Steady",
  pulse: "Pulse",
  blink: "Blink",
  strobe: "Strobe",
  spin: "Spin",
};

function initialRing(ledStyles: LedStyles | null, meetingWarn: MeetingWarn | null): LookRingInput {
  const styles = Object.fromEntries(
    STATUSES.map((s) => {
      const st = ledStyles?.[s];
      return [s, { pattern: st?.pattern ?? "solid", speed: st?.speed ?? 2 }];
    }),
  ) as LookRingInput["styles"];
  return {
    styles,
    warnMinutes: meetingWarn?.minutes ?? 0,
    warnPattern: meetingWarn?.leds.pattern ?? "pulse",
    warnColor: meetingWarn?.leds.color ?? "#ff2000",
    warnSpeed: meetingWarn?.leds.speed ?? 2,
  };
}

const sameRing = (a: LookRingInput, b: LookRingInput) => JSON.stringify(a) === JSON.stringify(b);

// How every light that follows you looks: the GIF and ring for each status, and the
// warning before a meeting. One preview beside it shows whichever row you're on, and one
// Save sends it all (the lights pick it up on their next check-in).
export function LookEditor({
  gifs,
  options,
  defaults,
  ledStyles,
  meetingWarn,
  lights,
}: {
  gifs: Record<Status, string>; // "default" | "none" | "builtin:<id>" | "asset:<id>"
  options: GifOption[];
  defaults: Record<Status, GifOption>;
  ledStyles: LedStyles | null;
  meetingWarn: MeetingWarn | null;
  lights: string[]; // names of the lights that follow you, for the "Saved" line
}) {
  const [savedGifs, setSavedGifs] = useState(gifs);
  const [gifDraft, setGifDraft] = useState(gifs);
  const [savedRing, setSavedRing] = useState(() => initialRing(ledStyles, meetingWarn));
  const [ring, setRing] = useState(savedRing);
  const [preview, setPreview] = useState<Status | "warn">("busy");
  const [result, setResult] = useState<"saved" | "failed" | null>(null);
  const [pending, start] = useTransition();

  const dirty = STATUSES.some((s) => gifDraft[s] !== savedGifs[s]) || !sameRing(ring, savedRing);
  const optionFor = (s: Status) => (gifDraft[s] === "default" ? defaults[s] : options.find((o) => o.value === gifDraft[s]));
  const built = lookRingFromInput(ring);
  const status: Status = preview === "warn" ? "free" : preview;
  const shownRing: LedStyle | null = preview === "warn" ? (built.meetingWarn?.leds ?? null) : (built.ledStyles[preview] ?? null);
  const touch = () => setResult(null);
  const setStyle = (s: Status, d: Partial<LookRingInput["styles"][Status]>) => {
    touch();
    setPreview(s);
    setRing((r) => ({ ...r, styles: { ...r.styles, [s]: { ...r.styles[s], ...d } } }));
  };
  const setWarn = (d: Partial<LookRingInput>) => {
    touch();
    setPreview("warn");
    setRing((r) => ({ ...r, ...d }));
  };

  return (
    <form
      className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:items-start"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const changed = STATUSES.filter((s) => gifDraft[s] !== savedGifs[s]);
          const results = await Promise.all([
            ...changed.map((s) => setLookGifAction(s, gifDraft[s])),
            sameRing(ring, savedRing) ? { ok: true } : setLookRingAction(ring),
          ]);
          const ok = results.every((r) => r.ok);
          if (ok) {
            setSavedGifs(gifDraft);
            setSavedRing(ring);
          }
          setResult(ok ? "saved" : "failed");
        });
      }}
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-subtle p-5 lg:sticky lg:top-20">
        <DevicePreview
          view={viewFor({ status, text: "", until: 0 })}
          gifSrc={preview === "warn" ? optionFor("free")?.src ?? null : (optionFor(preview)?.src ?? null)}
          ring={shownRing}
          scale={0.8}
          className="m-4"
        />
        <p className="text-center text-sm text-muted" aria-live="polite">
          {preview === "warn" ? "A meeting is about to start" : STATUS_META[preview].label}
        </p>
      </div>

      <div className="min-w-0 space-y-6">
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card shadow-card">
          {STATUSES.map((s) => {
            const opt = optionFor(s);
            const st = ring.styles[s];
            return (
              <li
                key={s}
                className={cx("flex flex-wrap items-center gap-3 p-4 transition-colors", preview === s && "bg-subtle/60")}
                onMouseEnter={() => setPreview(s)}
                onFocus={() => setPreview(s)}
              >
                <div className="flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#0b0b0c]">
                  {opt?.src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- animated GIF preview
                    <img src={opt.src} alt="" className="max-h-full max-w-full" />
                  ) : (
                    <span className={cx("h-full w-full", STATUS_META[s].bg)} />
                  )}
                </div>
                <div className="min-w-0 flex-1 basis-56 space-y-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <StatusDot status={s} size="sm" />
                    {STATUS_META[s].label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <div className="min-w-0 flex-1 basis-44">
                      <Select
                        aria-label={`${STATUS_META[s].label}: GIF`}
                        value={gifDraft[s]}
                        onChange={(e) => {
                          touch();
                          setPreview(s);
                          setGifDraft((g) => ({ ...g, [s]: e.target.value }));
                        }}
                      >
                        <option value="default">{defaults[s].label} (built in)</option>
                        {options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                        <option value="none">No GIF, just the colour</option>
                      </Select>
                    </div>
                    <div className="w-28 shrink-0">
                      <Select
                        aria-label={`${STATUS_META[s].label}: ring`}
                        value={st.pattern}
                        onChange={(e) => setStyle(s, { pattern: e.target.value as Pattern })}
                      >
                        {PATTERNS.map((p) => (
                          <option key={p} value={p}>
                            {PATTERN_LABEL[p]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {st.pattern !== "solid" && (
                      <div className="w-24 shrink-0">
                        <Select
                          aria-label={`${STATUS_META[s].label}: ring speed`}
                          value={st.speed}
                          onChange={(e) => setStyle(s, { speed: Number(e.target.value) })}
                        >
                          <option value={1}>Slow</option>
                          <option value={2}>Normal</option>
                          <option value={3}>Fast</option>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          <li className={cx("space-y-3 p-4 transition-colors", preview === "warn" && "bg-subtle/60")} onMouseEnter={() => setPreview("warn")} onFocus={() => setPreview("warn")}>
            <div>
              <p className="text-sm font-medium">Before a meeting</p>
              <p className="text-xs text-muted">Flashes the ring from a few minutes before each calendar event until it starts, even if Wi-Fi drops.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="w-48">
                <Select aria-label="When to warn" value={ring.warnMinutes} onChange={(e) => setWarn({ warnMinutes: Number(e.target.value) })}>
                  {WARN_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? "Don't warn me" : `${m} ${m === 1 ? "minute" : "minutes"} before`}
                    </option>
                  ))}
                </Select>
              </div>
              {ring.warnMinutes > 0 && (
                <>
                  <div className="w-28">
                    <Select aria-label="Warning pattern" value={ring.warnPattern} onChange={(e) => setWarn({ warnPattern: e.target.value as Pattern })}>
                      {PATTERNS.map((p) => (
                        <option key={p} value={p}>
                          {PATTERN_LABEL[p]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {ring.warnPattern !== "solid" && (
                    <div className="w-24">
                      <Select aria-label="Warning speed" value={ring.warnSpeed} onChange={(e) => setWarn({ warnSpeed: Number(e.target.value) })}>
                        <option value={1}>Slow</option>
                        <option value={2}>Normal</option>
                        <option value={3}>Fast</option>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </div>
            {ring.warnMinutes > 0 && (
              <ColorSwatches
                label="Warning colour"
                statusLabel="The status colour"
                value={ring.warnColor}
                onChange={(c) => setWarn({ warnColor: c })}
              />
            )}
          </li>
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {dirty && !pending && <p className="text-sm text-muted">Not saved yet. The preview shows how it would look.</p>}
          {result === "saved" && !dirty && !pending && (
            <p className="text-sm text-muted" role="status">
              Saved.{" "}
              {lights.length > 0
                ? `${lights.join(", ")} ${lights.length === 1 ? "picks" : "pick"} it up within about 20 seconds.`
                : "Your lights pick it up when you add them."}
            </p>
          )}
          {result === "failed" && (
            <p className="text-sm text-danger" role="alert">
              Couldn&apos;t save all of that. Try again?
            </p>
          )}
        </div>
        <p className="text-xs text-muted">
          A light can stay steady with &ldquo;Allow flashing&rdquo; off on its page. Rings never flash faster than 3 times a second, and lights on
          older firmware stay steady until they update.
        </p>
      </div>
    </form>
  );
}
