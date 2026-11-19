"use client";

import { type ReactNode, useState } from "react";

import { PlusIcon, XIcon } from "./icons";
import { Button, cx } from "./ui";

// A form you need now and then, behind a "+ New …" button so a settings card shows what
// you have rather than how to make more. Once open it stays open (a form that has just
// shown a one-time token keeps it on screen) until Cancel.
export function Reveal({
  label,
  defaultOpen = false,
  children,
  className,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)} className={className} aria-expanded={false}>
        <PlusIcon />
        {label}
      </Button>
    );
  }
  return (
    <div className={cx("space-y-3", className)}>
      {!defaultOpen && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{label}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-expanded={true}>
            <XIcon />
            Cancel
          </Button>
        </div>
      )}
      {children}
    </div>
  );
}
