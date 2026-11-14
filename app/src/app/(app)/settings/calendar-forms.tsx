"use client";

import { useActionState, useEffect, useId, useRef, useTransition } from "react";

import { PlusIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import { Button, Field, Input } from "@/components/ui";

import {
  addCalendarAction,
  type CalendarFormResult,
  refreshCalendarAction,
  removeCalendarAction,
  setCalendarTitlesAction,
} from "@/app/actions";

export function AddCalendarForm({ first }: { first: boolean }) {
  const [state, action, pending] = useActionState<CalendarFormResult, FormData>(addCalendarAction, null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field label="Name" htmlFor={`${id}-name`} className="sm:w-36">
          <Input id={`${id}-name`} name="name" required maxLength={60} defaultValue={first ? "Work" : ""} placeholder="Work" />
        </Field>
        <Field label="ICS link" htmlFor={`${id}-url`} className="min-w-0 flex-1">
          <Input
            id={`${id}-url`}
            name="url"
            required
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
            className="font-mono text-[13px]"
          />
        </Field>
        <Button variant="primary" disabled={pending} className="sm:mt-[1.625rem]">
          <PlusIcon />
          {pending ? "Checking…" : "Add"}
        </Button>
      </div>
      {state?.ok === false && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function CalendarActions({ id, showTitles }: { id: string; showTitles: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 text-sm">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="size-4 accent-foreground"
          checked={showTitles}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.checked;
            start(() => setCalendarTitlesAction(id, v));
          }}
        />
        Show meeting titles on the device
      </label>
      <span className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => start(() => refreshCalendarAction(id))}>
          <RefreshIcon />
          {pending ? "Working…" : "Refresh"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (confirm("Remove this calendar? Your lights will stop following it.")) start(() => removeCalendarAction(id));
          }}
        >
          <TrashIcon />
          Remove
        </Button>
      </span>
    </div>
  );
}
