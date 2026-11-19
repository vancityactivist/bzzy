"use client";

import { useActionState, useId, useState } from "react";

import { saveWorkHoursAction, type WorkHoursResult } from "@/app/actions";
import { Button, Field, Input, Select } from "@/components/ui";
import { DEFAULT_WORK_HOURS, formatClock, type WorkHours } from "@/lib/work-hours";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Monday first, the way most people read a work week.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

// `zones` comes from the server, so the list is the same when the page hydrates.
export function WorkHoursForm({ hours, timeZone, zones }: { hours: WorkHours | null; timeZone: string; zones: string[] }) {
  const [state, action, pending] = useActionState<WorkHoursResult, FormData>(saveWorkHoursAction, null);
  const [enabled, setEnabled] = useState(!!hours);
  const shown = hours ?? DEFAULT_WORK_HOURS;
  const id = useId();

  return (
    // React resets a form after its action runs, which would untick the controlled
    // checkbox while `enabled` stays true (and the next Save would turn hours off).
    // The form shows what's saved, so keep it as it is.
    <form action={action} onReset={(e) => e.preventDefault()} className="space-y-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enabled"
          className="size-4 accent-foreground"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Turn my lights off outside working hours
      </label>

      <fieldset disabled={!enabled} className="space-y-4 disabled:opacity-50">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Working days">
          {ORDER.map((d) => (
            <label
              key={d}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm has-checked:border-foreground has-checked:bg-subtle"
            >
              <input type="checkbox" name="day" value={d} defaultChecked={shown.days.includes(d)} className="size-3.5 accent-foreground" />
              {DAYS[d]}
            </label>
          ))}
        </div>
        <div className="flex gap-3">
          <Field label="Start" htmlFor={`${id}-start`} className="w-32">
            <Input id={`${id}-start`} name="start" type="time" required defaultValue={formatClock(shown.start)} />
          </Field>
          <Field label="End" htmlFor={`${id}-end`} className="w-32">
            <Input id={`${id}-end`} name="end" type="time" required defaultValue={formatClock(shown.end)} />
          </Field>
        </div>
      </fieldset>

      <Field label="Time zone" htmlFor={`${id}-tz`} hint="Also used for all-day events in your calendars.">
        <Select id={`${id}-tz`} name="timeZone" defaultValue={timeZone}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state?.ok && !pending && <span className="text-sm text-muted">Saved. Your lights pick it up within 5 minutes.</span>}
        {state?.ok === false && (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
