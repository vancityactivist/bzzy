"use client";

// How the ring moves: a pattern, a colour, a speed and how long it flashes. Used by the
// team push composer and by Show now. The form gets flash, color, speed and flashFor
// (lib/push-rules.ts pushInput), and the parent turns the same value into the preview's
// ring with pushLeds().

import { CheckIcon } from "@/components/icons";
import { cx, Select } from "@/components/ui";
import { FLASH_FOR, PUSH_COLORS, PUSH_FLASHES, type PushInput, RAINBOW } from "@/lib/push-rules";
import { LED_RGB } from "@/lib/screen";

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
          <ColorSwatches label="Colour" value={color} onChange={(c) => onChange({ color: c })} />
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

// The ring colours, as round swatches. "" is the status colour, drawn as the four status
// colours in separate dots (like the bzzy mark) so it doesn't read as the rainbow, which
// is the full colour wheel.
const RAINBOW_FILL = "conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)";
const STATUS_DOTS = (["free", "busy", "dnd", "away"] as const).map((s) => `rgb(${LED_RGB[s].join(" ")})`);

export function ColorSwatches({
  label,
  value,
  onChange,
  statusLabel = "Their status colour",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  statusLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
      {PUSH_COLORS.map((c) => {
        const checked = value === c.value;
        const name = c.value ? c.label : statusLabel;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={name}
            title={name}
            onClick={() => onChange(c.value)}
            className={cx(
              "flex size-8 items-center justify-center rounded-full ring-1 ring-line ring-inset transition-shadow",
              !c.value && "bg-card",
              checked && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
            )}
            style={c.value ? { background: c.value === RAINBOW ? RAINBOW_FILL : c.value } : undefined}
          >
            {!c.value ? (
              // Always the dots: the ring round the swatch says it's picked.
              <span aria-hidden className="grid grid-cols-2 gap-[3px]">
                {STATUS_DOTS.map((bg) => (
                  <span key={bg} className="size-[7px] rounded-full" style={{ background: bg }} />
                ))}
              </span>
            ) : (
              checked && (
                <CheckIcon className={cx("size-4", c.value === "#ffffff" || c.value === "#ffd400" ? "text-black" : "text-white")} strokeWidth={3} />
              )
            )}
          </button>
        );
      })}
    </div>
  );
}
