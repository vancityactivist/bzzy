"use client";

// How the ring moves: a pattern, a colour, a speed and how long it flashes. Used by the
// team push composer and by Show now. The form gets flash, color, speed and flashFor
// (lib/push-rules.ts pushInput), and the parent turns the same value into the preview's
// ring with pushLeds().

import { CheckIcon } from "@/components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
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
      <ToggleGroup
        type="single"
        variant="pill"
        size="sm"
        spacing={2}
        value={flash}
        onValueChange={(v) => v && onChange({ flash: v as RingChoice["flash"] })}
        aria-label="Pattern"
        className="flex-wrap"
      >
        {PUSH_FLASHES.map((f) => (
          <ToggleGroupItem key={f.value} value={f.value} className="px-3">
            {flash === f.value && <CheckIcon className="size-3.5" strokeWidth={3} />}
            {f.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <input type="hidden" name="flash" value={flash} />
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="speed" value={speed} />
      <input type="hidden" name="flashFor" value={flashFor} />
      {flash !== "none" && (
        <div className="space-y-3">
          <ToggleGroup
            type="single"
            spacing={2}
            value={color || "auto"}
            onValueChange={(v) => v && onChange({ color: v === "auto" ? "" : v })}
            aria-label="Colour"
            className="flex-wrap"
          >
            {PUSH_COLORS.map((c) => (
              <ToggleGroupItem
                key={c.value}
                value={c.value || "auto"}
                aria-label={c.label}
                title={c.label}
                className="size-8 min-w-8 rounded-full p-0 ring-1 ring-line ring-inset hover:bg-transparent data-[state=on]:ring-2 data-[state=on]:ring-foreground data-[state=on]:ring-offset-2 data-[state=on]:ring-offset-card"
                style={{
                  background: c.value || "conic-gradient(#00c828 0 25%, #ff1400 0 50%, #a000ff 0 75%, #ff8c00 0)",
                }}
              >
                {color === c.value && (
                  <CheckIcon className={cn("size-4", c.value === "#ffffff" || c.value === "#ffd400" ? "text-black" : "text-white")} strokeWidth={3} />
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex flex-wrap gap-2">
            <Select value={String(speed)} onValueChange={(v) => onChange({ speed: Number(v) })}>
              <SelectTrigger aria-label="Speed" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Slow</SelectItem>
                <SelectItem value="2">Normal</SelectItem>
                <SelectItem value="3">Fast</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(flashFor)} onValueChange={(v) => onChange({ flashFor: Number(v) })}>
              <SelectTrigger aria-label="How long it flashes" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLASH_FOR.map((f) => (
                  <SelectItem key={f.seconds} value={String(f.seconds)}>
                    Flash {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
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
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        checked ? "border-foreground bg-foreground text-background" : "border-line bg-card hover:border-line-strong",
      )}
    >
      {checked && <CheckIcon className="size-3.5" strokeWidth={3} />}
      {children}
    </button>
  );
}
