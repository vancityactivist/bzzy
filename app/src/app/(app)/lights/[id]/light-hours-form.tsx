"use client";

import { useActionState, useState } from "react";

import { saveLightHoursAction, type WorkHoursResult } from "@/app/actions";
import { Button } from "@/components/ui";
import { DEFAULT_WORK_HOURS, type HoursMode, type WorkHours } from "@/lib/work-hours";

import { HoursFields } from "../../settings/work-hours-form";

// A light's working hours: its owner's (Settings), its own, or always on.
export function LightHoursForm({
  deviceId,
  mode,
  ownHours,
  ownerHours,
  ownerLabel,
}: {
  deviceId: string;
  mode: HoursMode;
  ownHours: WorkHours | null;
  // The owner's hours, already written out ("Mon–Fri, 09:00–17:00").
  ownerHours: string;
  // "your" for the owner, "its owner's" for a teammate managing it.
  ownerLabel: "yours" | "its owner's";
}) {
  const [state, action, pending] = useActionState<WorkHoursResult, FormData>(saveLightHoursAction, null);
  const [picked, setPicked] = useState<HoursMode>(mode);
  const options: { value: HoursMode; label: string; hint: string }[] = [
    { value: "owner", label: ownerLabel === "yours" ? "Same as yours" : "Same as its owner's", hint: ownerHours },
    { value: "own", label: "Its own hours", hint: "For a light somewhere you keep different hours." },
    { value: "always", label: "Always on", hint: "It never goes dark." },
  ];

  return (
    // Keep the form as saved after the action runs (see WorkHoursForm).
    <form action={action} onReset={(e) => e.preventDefault()} className="space-y-4">
      <input type="hidden" name="deviceId" value={deviceId} />
      <div className="space-y-2" role="radiogroup" aria-label="Working hours">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 has-checked:border-foreground has-checked:bg-subtle"
          >
            <input
              type="radio"
              name="mode"
              value={o.value}
              checked={picked === o.value}
              onChange={() => setPicked(o.value)}
              className="mt-0.5 size-4 accent-foreground"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-sm text-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {/* Hidden rather than removed, so switching away and back keeps what was typed. */}
      <div hidden={picked !== "own"}>
        <HoursFields hours={ownHours ?? DEFAULT_WORK_HOURS} disabled={picked !== "own"} />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state?.ok && !pending && <span className="text-sm text-muted">Saved. The light picks it up within 5 minutes.</span>}
        {state?.ok === false && (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
