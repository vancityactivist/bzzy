"use client";

import { useOptimistic, useTransition } from "react";

import { STATUS_META } from "@/components/status-meta";
import { cx, StatusDot } from "@/components/ui";
import { type Status, STATUSES } from "@/lib/protocol";

import { setDefaultStatusAction } from "@/app/actions";

// What every light that follows you shows when there's no meeting and nothing is set.
export function DefaultStatusForm({ value, names }: { value: Status; names: Record<Status, string> }) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useOptimistic(value);
  return (
    <div role="radiogroup" aria-label="Between meetings" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={current === s}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setCurrent(s);
              await setDefaultStatusAction(s);
            })
          }
          className={cx(
            "flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium shadow-card transition-colors",
            current === s ? cx("border-transparent ring-2", STATUS_META[s].ring, STATUS_META[s].tint) : cx("border-line bg-card", STATUS_META[s].hover),
          )}
        >
          <StatusDot status={s} />
          {names[s]}
        </button>
      ))}
    </div>
  );
}
