"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";

import { ChevronDownIcon, ChevronUpIcon, PlusIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import { Button, Field, Input, Select } from "@/components/ui";

import {
  addCalendarAction,
  type CalendarFormResult,
  connectCalDavAction,
  moveCalendarAction,
  setCalendarCountsAsAction,
  setCalendarLightsAction,
  setLightCalendarAction,
  updateCalDavPasswordAction,
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

// Connect iCloud, Fastmail or any other CalDAV server with an app-specific password.
export function ConnectCalDavForm() {
  const [state, action, pending] = useActionState<CalendarFormResult, FormData>(connectCalDavAction, null);
  const [preset, setPreset] = useState("icloud");
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const icloud = preset === "icloud";
  return (
    <form ref={form} action={action} className="space-y-3 rounded-xl border border-line p-4">
      <p className="font-medium">Connect iCloud or another calendar server</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field label="Service" htmlFor={`${id}-preset`} className="sm:w-40">
          <Select id={`${id}-preset`} name="preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="icloud">iCloud</option>
            <option value="fastmail">Fastmail</option>
            <option value="other">Other (CalDAV)</option>
          </Select>
        </Field>
        {preset === "other" && (
          <Field label="Server address" htmlFor={`${id}-server`} className="min-w-0 flex-1">
            <Input
              id={`${id}-server`}
              name="server"
              required
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://cloud.example.com/remote.php/dav"
              className="font-mono text-[13px]"
            />
          </Field>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field label={icloud ? "Apple ID email" : "Login"} htmlFor={`${id}-user`} className="min-w-0 flex-1">
          <Input id={`${id}-user`} name="username" required autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="App-specific password" htmlFor={`${id}-pw`} className="min-w-0 flex-1">
          <Input id={`${id}-pw`} name="password" type="password" required autoComplete="new-password" />
        </Field>
      </div>
      <p className="text-xs text-muted">
        {icloud ? (
          <>
            Make one at{" "}
            <a className="underline underline-offset-2" href="https://account.apple.com" target="_blank" rel="noreferrer">
              account.apple.com
            </a>{" "}
            under Sign-In and Security, App-Specific Passwords. Apple doesn&apos;t let it be limited to calendars (it
            also opens iCloud mail and contacts), but bzzy only ever reads your calendars, keeps the password
            encrypted, and you can revoke it there any time.
          </>
        ) : (
          <>Use an app password if your service offers one. bzzy only reads your calendars and keeps the password encrypted.</>
        )}
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          <PlusIcon />
          {pending ? "Connecting…" : "Connect"}
        </Button>
        {state && !state.ok && (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

// A new app-specific password for a CalDAV account whose old one stopped working.
export function UpdatePasswordForm({ accountId }: { accountId: string }) {
  const [state, action, pending] = useActionState<CalendarFormResult, FormData>(updateCalDavPasswordAction, null);
  const id = useId();
  if (state?.ok) return <p className="text-sm text-muted">Password updated.</p>;
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="account" value={accountId} />
      <Field label="New app-specific password" htmlFor={`${id}-pw`} className="min-w-0 flex-1">
        <Input id={`${id}-pw`} name="password" type="password" required autoComplete="new-password" />
      </Field>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Checking…" : "Update password"}
      </Button>
      {state && !state.ok && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

// Up/down in the priority order, and how the calendar's events count.
export function PriorityControls({
  id,
  name,
  first,
  last,
  countsAs,
}: {
  id: string;
  name: string;
  first: boolean;
  last: boolean;
  countsAs: string;
}) {
  const [pending, start] = useTransition();
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Select
        aria-label={`How ${name} counts`}
        value={countsAs}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          start(() => setCalendarCountsAsAction(id, v));
        }}
        wrapperClassName="w-auto"
        className="h-8 text-sm"
      >
        <option value="auto">Each event&apos;s setting</option>
        <option value="busy">Always busy</option>
        <option value="dnd">Always do not disturb</option>
        <option value="away">Always away</option>
      </Select>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Move ${name} up`}
        disabled={pending || first}
        onClick={() => start(() => moveCalendarAction(id, -1))}
      >
        <ChevronUpIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Move ${name} down`}
        disabled={pending || last}
        onClick={() => start(() => moveCalendarAction(id, 1))}
      >
        <ChevronDownIcon />
      </Button>
    </span>
  );
}

// On/off for one calendar in an account list.
export function CalendarToggle({ id, name, on, color }: { id: string; name: string; on: boolean; color: string | null }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-foreground"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.checked;
          start(() => setCalendarSetsStatusAction(id, v));
        }}
      />
      <CalendarDot color={color} />
      <span className="truncate">{name}</span>
      {pending && <span className="text-muted">{on ? "Turning off…" : "Reading…"}</span>}
    </label>
  );
}

export function CalendarDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full bg-line-strong"
      style={color && /^#[0-9a-f]{6}$/i.test(color) ? { backgroundColor: color } : undefined}
    />
  );
}

// Which lights use a calendar: every light that follows you (no list), or exactly the
// lights ticked here.
export function ShowsOn({
  id,
  lightIds,
  lights,
}: {
  id: string;
  lightIds: string[] | null;
  lights: { id: string; name: string; followsOwner: boolean }[];
}) {
  const [pending, start] = useTransition();
  const picked = lightIds ?? lights.filter((l) => l.followsOwner).map((l) => l.id);
  const save = (next: string[] | null) => start(() => setCalendarLightsAction(id, next));
  return (
    <fieldset className="space-y-1.5 text-sm" disabled={pending}>
      <legend className="text-xs font-medium tracking-wide text-muted uppercase">Shows on</legend>
      <label className="flex cursor-pointer items-center gap-2 pt-1">
        <input type="radio" className="size-4 accent-foreground" checked={lightIds === null} onChange={() => save(null)} />
        Every light that follows me
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="radio" className="size-4 accent-foreground" checked={lightIds !== null} onChange={() => save(picked)} />
        Only these lights
      </label>
      {lightIds !== null && (
        <div className="space-y-1 pl-6">
          {lights.length === 0 && <p className="text-muted">You don&apos;t have any lights yet.</p>}
          {lights.map((l) => (
            <label key={l.id} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-foreground"
                checked={lightIds.includes(l.id)}
                onChange={(e) => {
                  const on = e.target.checked;
                  save(on ? [...lightIds, l.id] : lightIds.filter((x) => x !== l.id));
                }}
              />
              <span className="truncate">{l.name}</span>
              {!l.followsOwner && <span className="text-muted">own status</span>}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

// On a light's page: tick the calendars this light uses.
export function LightCalendarToggle({
  calendarId,
  deviceId,
  name,
  color,
  on,
}: {
  calendarId: string;
  deviceId: string;
  name: string;
  color: string | null;
  on: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-foreground"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.checked;
          start(() => setLightCalendarAction(calendarId, deviceId, v));
        }}
      />
      <CalendarDot color={color} />
      <span className="truncate">{name}</span>
    </label>
  );
}
