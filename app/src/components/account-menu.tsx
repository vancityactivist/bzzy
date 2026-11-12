"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { signOutAction } from "@/app/actions";

import { LogOutIcon, ShieldIcon } from "./icons";
import { cx } from "./ui";

// The avatar button in the header and its small dropdown (a disclosure, not an ARIA menu):
// closes on outside click, Escape (focus goes back to the button) or choosing an item.

const ITEM =
  "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 focus-visible:outline-offset-0 text-left text-sm text-foreground transition-colors duration-150 hover:bg-subtle [&_svg]:size-4 [&_svg]:text-muted";

export function AccountMenu({ name, image, admin }: { name: string; image: string | null; admin: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account: ${name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex size-9 items-center justify-center rounded-full transition-opacity duration-150 hover:opacity-85"
      >
        <Avatar name={name} image={image} />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-50 mt-2 w-60 origin-top-right rounded-2xl border border-line bg-card p-1.5 shadow-pop motion-safe:animate-[bzzy-pop_150ms_ease-out]"
        >
          <div className="flex items-center gap-3 px-2.5 pt-2 pb-3">
            <Avatar name={name} image={image} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="text-xs text-muted">Signed in</p>
            </div>
          </div>
          <div className="space-y-0.5 border-t border-line pt-1.5">
            {admin && (
              <Link href="/admin" className={ITEM} onClick={() => setOpen(false)}>
                <ShieldIcon />
                Admin
              </Link>
            )}
            <form action={signOutAction}>
              <button className={ITEM}>
                <LogOutIcon />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, image, className }: { name: string; image: string | null; className?: string }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- provider avatars from arbitrary hosts
      <img src={image} alt="" className={cx("size-8 shrink-0 rounded-full border border-line object-cover", className)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cx(
        "flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-subtle text-sm font-semibold uppercase text-foreground",
        className,
      )}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}
