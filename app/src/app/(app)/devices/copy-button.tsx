"use client";

import { useEffect, useRef, useState } from "react";

import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui";

/** Copies `value` to the clipboard. Falls back to selecting a hidden textarea where the async API is missing. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // Nothing more to try; the value is visible to copy by hand.
      }
      ta.remove();
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label={`Copy ${label}`} className="shrink-0">
      {copied ? <CheckIcon /> : null}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
