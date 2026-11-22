"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useTransition } from "react";

import { PlusIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import { Button, Field, Input } from "@/components/ui";

import {
  addCalendarAction,
  type CalendarFormResult,
  refreshCalendarAction,
  removeCalendarAccountAction,
  removeCalendarAction,
  setCalendarSetsStatusAction,
  setCalendarTitlesAction,
} from "@/app/actions";

export function AddCalendarForm({ first }: { first: boolean }) {
  const [state, action, pending] = useActionState<CalendarFormResult, FormData>(
    addCalendarAction,
    null,
  );
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field label="Name" htmlFor={`${id}-name`} className="sm:w-36">
          <Input
            id={`${id}-name`}
            name="name"
            required
            maxLength={60}
            defaultValue={first ? "Work" : ""}
            placeholder="Work"
          />
        </Field>
        <Field
          label="ICS link"
          htmlFor={`${id}-url`}
          className="min-w-0 flex-1"
        >
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
        <Button
          variant="primary"
          disabled={pending}
          className="sm:mt-[1.625rem]"
        >
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

export function CalendarActions({
  id,
  showTitles,
  setsStatus,
  removable = true,
}: {
  id: string;
  showTitles: boolean;
  setsStatus: boolean;
  // Calendars from a connected account come and go with the account.
  removable?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 text-sm">
      <span className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-foreground"
            checked={setsStatus}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.checked;
              start(() => setCalendarSetsStatusAction(id, v));
            }}
          />
          Sets my status
        </label>
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
      </span>
      <span className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => start(() => refreshCalendarAction(id))}
        >
          <RefreshIcon />
          {pending ? "Working…" : "Refresh"}
        </Button>
        {removable && (
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  "Remove this calendar? Your lights will stop following it.",
                )
              )
                start(() => removeCalendarAction(id));
            }}
          >
            <TrashIcon />
            Remove
          </Button>
        )}
      </span>
    </div>
  );
}

// Just the "Sets my status" switch, for a connected calendar that's off (nothing to
// preview or refresh until it's on).
export function CalendarSwitch({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-foreground"
        checked={false}
        disabled={pending}
        onChange={() => start(() => setCalendarSetsStatusAction(id, true))}
      />
      <span className="truncate">{name}</span>
      {pending && <span className="text-muted">Reading…</span>}
    </label>
  );
}

export function RemoveAccountButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (
          confirm(
            `Disconnect ${label}? bzzy loses access to its calendars and your lights stop following them.`,
          )
        )
          start(() => removeCalendarAccountAction(id));
      }}
    >
      <TrashIcon />
      {pending ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  "google-connected": {
    text: "Google Calendar connected. Your main calendar sets your status; tick any others below.",
  },
  "google-cancelled": { text: "Google connection cancelled." },
  "google-scopes": {
    text: "bzzy needs to see your calendar list and events. Connect again and leave both boxes ticked.",
    bad: true,
  },
  "google-failed": { text: "Couldn't connect to Google. Try again.", bad: true },
  "google-off": { text: "Google Calendar isn't set up on this server yet.", bad: true },
};

// The result of a Google connect, from ?calendar= on the way back.
export function CalendarNotice() {
  const key = useSearchParams().get("calendar");
  const n = key ? NOTICES[key] : undefined;
  if (!n) return null;
  return (
    <p
      role="status"
      className={`mt-4 rounded-xl p-3 text-sm ${n.bad ? "bg-danger/10 text-danger" : "bg-subtle"}`}
    >
      {n.text}
    </p>
  );
}
