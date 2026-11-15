"use client";

// How the ring moves: a pattern, a colour, a speed and how long it flashes. Used by the
// team push composer and by Show now. The form gets flash, color, speed and flashFor
// (lib/push-rules.ts pushInput), and the parent turns the same value into the preview's
// ring with pushLeds().

import { CheckIcon } from "@/components/icons";
import { cx, Select } from "@/components/ui";
import { FLASH_FOR, PUSH_COLORS, PUSH_FLASHES, type PushInput } from "@/lib/push-rules";

export type RingChoice = Pick<PushInput, "flash" | "color" | "speed" | "flashFor">;

export function RingPicker({
  value,
  onChange,
  note,
}: {
  value: RingChoice;
  onChange: (v: Partial<RingChoice>) => void;
  note?: React.ReactNode; // under the options, once a pattern is picked
}) {
  const { flash, color, speed, flashFor } = value;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PUSH_FLASHES.map((f) => (
          <Chip key={f.value} checked={flash === f.value} onClick={() => onChange({ flash: f.value })}>
            {f.label}
          </Chip>
        ))}
      </div>
      <input type="hidden" name="flash" value={flash} />
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="speed" value={speed} />
      <input type="hidden" name="flashFor" value={flashFor} />
      {flash !== "none" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour">
            {PUSH_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={color === c.value}
                aria-label={c.label}
                title={c.label}
                onClick={() => onChange({ color: c.value })}
                className={cx(
                  "flex size-8 items-center justify-center rounded-full ring-1 ring-line ring-inset transition-shadow",
                  color === c.value && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
                )}
                style={{
                  background: c.value || "conic-gradient(#00c828 0 25%, #ff1400 0 50%, #a000ff 0 75%, #ff8c00 0)",
                }}
              >
                {color === c.value && (
                  <CheckIcon className={cx("size-4", c.value === "#ffffff" || c.value === "#ffd400" ? "text-black" : "text-white")} strokeWidth={3} />
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Speed" value={speed} onChange={(e) => onChange({ speed: Number(e.target.value) })} wrapperClassName="w-36">
              <option value={1}>Slow</option>
              <option value={2}>Normal</option>
              <option value={3}>Fast</option>
            </Select>
            <Select
              aria-label="How long it flashes"
              value={flashFor}
              onChange={(e) => onChange({ flashFor: Number(e.target.value) })}
              wrapperClassName="w-48"
            >
              {FLASH_FOR.map((f) => (
                <option key={f.seconds} value={f.seconds}>
                  Flash {f.label}
                </option>
              ))}
            </Select>
          </div>
          {note && <p className="text-xs text-muted">{note}</p>}
        </div>
      )}
    </div>
  );
}

export function Chip({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onClick}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        checked ? "border-foreground bg-foreground text-background" : "border-line bg-card hover:border-line-strong",
      )}
    >
      {checked && <CheckIcon className="size-3.5" strokeWidth={3} />}
      {children}
    </button>
  );
}
