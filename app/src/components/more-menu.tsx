"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { MoreIcon } from "./icons";
import { cx } from "./ui";

// A "⋯" button and a small dropdown of less-used actions (a disclosure, like the account
// menu): closes on outside click, Escape (focus goes back to the button) or choosing an item.
// Keeps rare or destructive actions out of the way of the everyday ones.

export type MoreMenuItem = { label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; onSelect: () => void };

const ITEM =
  "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors duration-150 hover:bg-subtle focus-visible:outline-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4";

export function MoreMenu({ label, items, className }: { label: string; items: MoreMenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cx("relative", className)}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-subtle hover:text-foreground aria-expanded:bg-subtle aria-expanded:text-foreground"
      >
        <MoreIcon className="size-5" />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-30 mt-1 w-52 origin-top-right rounded-xl border border-line bg-card p-1 shadow-pop motion-safe:animate-[bzzy-pop_150ms_ease-out]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cx(ITEM, item.danger ? "text-danger [&_svg]:text-danger" : "text-foreground [&_svg]:text-muted")}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
