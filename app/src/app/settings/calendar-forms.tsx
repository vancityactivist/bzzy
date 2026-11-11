"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";

import {
  addCalendarAction,
  type CalendarFormResult,
  refreshCalendarAction,
  removeCalendarAction,
  setCalendarTitlesAction,
} from "../actions";

export function AddCalendarForm({ first }: { first: boolean }) {
  const [state, action, pending] = useActionState<CalendarFormResult, FormData>(addCalendarAction, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={first ? "Work" : ""}
          placeholder="Work"
          aria-label="Calendar name"
          className="rounded-md border border-line bg-background px-3 py-2 sm:w-32"
        />
        <input
          name="url"
          required
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
          aria-label="ICS link"
          className="min-w-0 flex-1 rounded-md border border-line bg-background px-3 py-2 font-mono text-sm"
        />
        <button
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Checking…" : "Add"}
        </button>
      </div>
      {state?.ok === false && <p className="text-sm text-busy">{state.error}</p>}
    </form>
  );
}

export function CalendarActions({ id, showTitles }: { id: string; showTitles: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={showTitles}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.checked;
            start(() => setCalendarTitlesAction(id, v));
          }}
        />
        Show meeting titles on the device
      </label>
      <span className="ml-auto flex gap-2">
        <button
          disabled={pending}
          onClick={() => start(() => refreshCalendarAction(id))}
          className="rounded-md border border-line px-3 py-1.5 hover:bg-background disabled:opacity-50"
        >
          {pending ? "Working…" : "Refresh"}
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (confirm("Remove this calendar? Your lights will stop following it.")) start(() => removeCalendarAction(id));
          }}
          className="rounded-md border border-line px-3 py-1.5 text-busy hover:bg-background disabled:opacity-50"
        >
          Remove
        </button>
      </span>
    </div>
  );
}
