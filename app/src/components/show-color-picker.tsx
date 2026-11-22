"use client";

// Show now colours: one row of background swatches, with the text turning black or
// white to suit (like GitHub labels). "Change text colour" opens a second row for
// anyone who wants to pick it, with a contrast check and a one-tap fix. The form gets
// bg and fg (lib/show-colors.ts parseShowColors); fg "auto" lets the server pick.

import { useState } from "react";

import { CheckIcon } from "@/components/icons";
import { cx } from "@/components/ui";
import { SCREEN_HEX, type ScreenStatus } from "@/lib/screen";
import { AUTO_TEXT, autoText, bgHex, contrast, isHex, MIN_CONTRAST, SHOW_BGS, SHOW_FGS, STATUS_BG } from "@/lib/show-colors";

const STATUS_DOTS = (["free", "busy", "dnd", "away"] as const).map((s) => SCREEN_HEX[s]);
const CUSTOM_FILL = "conic-gradient(#ff4433, #ffdd00, #33cc66, #22bbff, #6633ff, #ee33aa, #ff4433)";

export type ShowColorDraft = { bg: string; fg: string }; // fg may be "auto"

export function ShowColorPicker({
  value,
  status,
  onChange,
  onHover,
}: {
  value: ShowColorDraft;
  status: ScreenStatus; // what "Status colour" is right now
  onChange: (v: Partial<ShowColorDraft>) => void;
  onHover?: (v: Partial<ShowColorDraft> | null) => void; // previewed, not picked
}) {
  const [textOpen, setTextOpen] = useState(value.fg !== AUTO_TEXT);
  const bg = bgHex(value.bg, SCREEN_HEX[status]);
  const fg = value.fg === AUTO_TEXT ? (value.bg === STATUS_BG ? "#ffffff" : autoText(bg)) : value.fg;
  const ratio = contrast(bg, fg);
  const bgName = SHOW_BGS.find((c) => c.value === value.bg)?.label ?? "Custom";
  const fgName =
    value.fg === AUTO_TEXT ? `Automatic (${fg === "#ffffff" ? "white" : "black"})` : (SHOW_FGS.find((c) => c.value === value.fg)?.label ?? "Custom");

  return (
    <div className="space-y-3" onMouseLeave={() => onHover?.(null)}>
      <input type="hidden" name="bg" value={value.bg} />
      <input type="hidden" name="fg" value={value.fg} />
      <div className="space-y-1.5">
        <p className="text-sm font-medium">
          Background <span className="font-normal text-muted">{bgName}</span>
        </p>
        <Swatches
          label="Background"
          options={SHOW_BGS}
          value={value.bg}
          onPick={(v) => onChange({ bg: v })}
          onHover={(v) => onHover?.(v ? { bg: v } : null)}
        />
      </div>
      {textOpen ? (
        <div className="space-y-1.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
            <span>
              Text <span className="font-normal text-muted">{fgName}</span>
            </span>
            <button
              type="button"
              className="text-xs font-normal text-muted underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                setTextOpen(false);
                onChange({ fg: AUTO_TEXT });
              }}
            >
              Use automatic
            </button>
          </p>
          <Swatches
            label="Text colour"
            options={SHOW_FGS}
            value={value.fg}
            onPick={(v) => onChange({ fg: v })}
            onHover={(v) => onHover?.(v ? { fg: v } : null)}
          />
          {ratio < MIN_CONTRAST && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-danger" role="status">
              Hard to read from across the room ({ratio.toFixed(1)}:1).
              <button
                type="button"
                className="rounded-md border border-line-strong px-2 py-0.5 font-medium text-foreground hover:bg-subtle"
                onClick={() => onChange({ fg: AUTO_TEXT })}
              >
                Fix it
              </button>
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="text-sm text-muted underline underline-offset-2 hover:text-foreground"
          onClick={() => setTextOpen(true)}
        >
          Change text colour
        </button>
      )}
    </div>
  );
}

function Swatches({
  label,
  options,
  value,
  onPick,
  onHover,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onPick: (v: string) => void;
  onHover: (v: string | null) => void;
}) {
  const custom = !options.some((o) => o.value === value) && isHex(value);
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
      {options.map((c) => {
        const checked = value === c.value;
        const special = c.value === STATUS_BG || c.value === AUTO_TEXT;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={c.label}
            title={c.label}
            onClick={() => onPick(c.value)}
            onMouseEnter={() => onHover(c.value)}
            onFocus={() => onHover(c.value)}
            onBlur={() => onHover(null)}
            className={cx(
              "flex size-8 items-center justify-center rounded-full ring-1 ring-line ring-inset transition-shadow",
              special && "bg-card",
              checked && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
            )}
            style={special ? (c.value === AUTO_TEXT ? { background: "linear-gradient(135deg, var(--color-swatch-white) 50%, var(--color-swatch-black) 50%)" } : undefined) : { background: c.value }}
          >
            {c.value === STATUS_BG ? (
              <span aria-hidden className="grid grid-cols-2 gap-[3px]">
                {STATUS_DOTS.map((bg) => (
                  <span key={bg} className="size-[7px] rounded-full" style={{ background: bg }} />
                ))}
              </span>
            ) : (
              checked &&
              c.value !== AUTO_TEXT && <CheckIcon className={cx("size-4", autoText(c.value) === "#000000" ? "text-black" : "text-white")} strokeWidth={3} />
            )}
          </button>
        );
      })}
      {/* Any colour: the system picker, opened from the rainbow swatch. */}
      <label
        title="Pick any colour"
        className={cx(
          "relative flex size-8 cursor-pointer items-center justify-center rounded-full ring-1 ring-line ring-inset transition-shadow focus-within:ring-2 focus-within:ring-foreground",
          custom && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
        )}
        style={{ background: custom ? value : CUSTOM_FILL }}
      >
        <input
          type="color"
          aria-label={`${label}: pick any colour`}
          value={custom ? value : "#00897b"}
          onChange={(e) => onPick(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        {custom && <CheckIcon aria-hidden className={cx("size-4", autoText(value) === "#000000" ? "text-black" : "text-white")} strokeWidth={3} />}
      </label>
    </div>
  );
}
