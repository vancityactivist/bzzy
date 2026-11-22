"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";

import { GripIcon, PlusIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import { Button, Field, Input, Select } from "@/components/ui";

import {
  addCalendarAction,
  type CalendarFormResult,
  connectCalDavAction,
  reorderCalendarsAction,
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

// How a calendar's events count.
export function CountsAsPicker({ id, name, countsAs }: { id: string; name: string; countsAs: string }) {
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label={`How ${name} counts`}
      value={countsAs}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(() => setCalendarCountsAsAction(id, v));
      }}
      wrapperClassName="w-auto shrink-0"
      className="h-8 text-sm"
    >
      <option value="auto">Each event&apos;s setting</option>
      <option value="busy">Always busy</option>
      <option value="dnd">Always do not disturb</option>
      <option value="away">Always away</option>
    </Select>
  );
}

type DragState = { id: string; from: number; startY: number; dy: number; rects: { top: number; height: number }[] };

// The calendars that set status, in priority order. Drag a row by its handle (mouse or
// touch), or focus the handle and use the arrow keys. The new order is shown at once and
// saved in the background.
export function SortableCalendars({ items }: { items: { id: string; name: string; node: React.ReactNode }[] }) {
  const key = items.map((i) => i.id).join(",");
  const [base, setBase] = useState(key);
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  if (base !== key) {
    setBase(key);
    setOrder(items.map((i) => i.id));
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  const [, start] = useTransition();
  const rows = useRef(new Map<string, HTMLLIElement>());
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const byId = new Map(items.map((i) => [i.id, i]));
  const ids = order.filter((id) => byId.has(id));

  // Where the dragged row would land: past every other row whose middle it has crossed.
  let target = -1;
  if (drag) {
    const r = drag.rects[drag.from];
    const middle = r.top + r.height / 2 + drag.dy;
    target = drag.rects.filter((x, i) => i !== drag.from && middle > x.top + x.height / 2).length;
  }

  const commit = (from: number, to: number) => {
    if (from === to) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    start(() => reorderCalendarsAction(next));
    return moved;
  };

  return (
    <ol className="mt-4 divide-y divide-line rounded-xl border border-line">
      {ids.map((id, i) => {
        let shift = 0;
        if (drag && i !== drag.from) {
          const h = drag.rects[drag.from].height;
          if (drag.from < target && i > drag.from && i <= target) shift = -h;
          if (target < drag.from && i >= target && i < drag.from) shift = h;
        }
        const dragging = drag?.id === id;
        return (
          <li
            key={id}
            ref={(el) => {
              if (el) rows.current.set(id, el);
              else rows.current.delete(id);
            }}
            className={`relative flex gap-2 bg-card p-3 pl-1 ${dragging ? "z-10 rounded-xl shadow-lg ring-1 ring-line-strong" : drag ? "transition-transform duration-150" : ""}`}
            style={{ transform: dragging ? `translateY(${drag.dy}px)` : shift ? `translateY(${shift}px)` : undefined }}
          >
            <button
              type="button"
              ref={(el) => {
                if (el) handles.current.set(id, el);
                else handles.current.delete(id);
              }}
              aria-label={`Reorder ${byId.get(id)!.name}. Use the up and down arrow keys.`}
              className={`flex w-7 shrink-0 touch-none items-start justify-center rounded-md pt-1 text-muted hover:text-foreground ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const rects = ids.map((x) => {
                  const r = rows.current.get(x)!.getBoundingClientRect();
                  return { top: r.top, height: r.height };
                });
                setDrag({ id, from: i, startY: e.clientY, dy: 0, rects });
              }}
              onPointerMove={(e) => {
                if (drag?.id === id) setDrag({ ...drag, dy: e.clientY - drag.startY });
              }}
              onPointerUp={() => {
                if (drag?.id === id) commit(drag.from, target);
                setDrag(null);
              }}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(e) => {
                const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
                if (to === null || to < 0 || to >= ids.length) return;
                e.preventDefault();
                commit(i, to);
                requestAnimationFrame(() => handles.current.get(id)?.focus());
              }}
            >
              <GripIcon className="size-5" />
            </button>
            {byId.get(id)!.node}
          </li>
        );
      })}
    </ol>
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
