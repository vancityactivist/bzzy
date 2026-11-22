"use client";

// The Status page's controls and the device preview they drive. Everything you
// hover, pick or type shows on the preview straight away, before it's sent; the
// caption says whether you're looking at your screen as it is or a draft.

import { createContext, Fragment, useActionState, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import Link from "next/link";

import { DevicePreview } from "@/components/device-preview";
import { CalendarIcon, CheckIcon, DeviceIcon, LinkIcon, PlusIcon, SearchIcon, UploadIcon, XIcon } from "@/components/icons";
import { STATUS_META } from "@/components/status-meta";
import { Badge, Button, buttonClass, cx, Field, Input, Select, StatusDot } from "@/components/ui";
import { parseGifLink } from "@/lib/gif-link";
import { type Status, STATUSES, TEXT_MAX } from "@/lib/protocol";
import { type RingChoice, RingPicker } from "@/components/ring-picker";
import { type ShowColorDraft, ShowColorPicker } from "@/components/show-color-picker";
import { type LedStyle, PUSH_COLORS, PUSH_FLASHES, pushLeds } from "@/lib/push-rules";
import { allowedRing } from "@/lib/ring";
import { allLabels, type StatusLabels } from "@/lib/status-labels";
import { AUTO_TEXT, parseShowColors, type ShowColors } from "@/lib/show-colors";
import { LED_RGB, screenText, statusCut, type ScreenView, viewFor, withShow, wrapBar, wrapMessage } from "@/lib/screen";

import { clearShowAction, type SaveGifResult, saveShowGifAction, setStatus, showNowAction, type ShowNowResult } from "./actions";

export type PreviewDevice = {
  id: string;
  name: string;
  offline?: string | null; // "Offline · seen 3 days ago" when the light isn't checking in
  dark?: string | null; // "Off hours · on at 8:00 AM" while working hours have it dark
  view: ScreenView; // the status part, as it is now
  gifs: Record<Status, string | null>;
  ring?: LedStyle | null; // what the ring is doing now (a push, a show, a meeting warning, the status's style)
  baseRing?: LedStyle | null; // the same, leaving out their own show now's
  allowFlash?: boolean; // "Allow flashing" on the light's page
  styles?: Record<Status, LedStyle | null>; // each status's style, for drafts
  labels?: StatusLabels | null; // the status names its screen draws (firmware with "labels")
};

// What's on the screens now from "show now", if it's visible.
export type LiveShow = {
  text: string;
  until: number;
  gifSrc: string | null;
  gifName: string | null;
  // A team push, rather than the person's own show now. They dismiss it on the light.
  push?: { team: string; leds: LedStyle | null } | null;
  leds?: LedStyle | null; // their own show's ring
  colors?: ShowColors | null; // its screen colours; null: white on black
};

// builtin: one of the GIFs that come with bzzy; the pickers list them after your own,
// under a "Built in" label. section: "Favourites" or "Recently shown" for the ones the
// Status page lifts to the front (each GIF still appears once).
export type LibraryGif = { choice: string; name: string; src: string; builtin?: boolean; section?: "Favourites" | "Recently shown" };

const sectionOf = (g: LibraryGif) => g.section ?? (g.builtin ? "Built in" : "Your GIFs");

/** The label to put before GIF `i` in a picker grid, where a new group starts; null for none. */
export function sectionLabel(library: LibraryGif[], i: number): string | null {
  const label = sectionOf(library[i]);
  if (i === 0) return library[i].section ?? null; // a plain list of uploads needs no heading
  return label !== sectionOf(library[i - 1]) ? label : null;
}

/** A group label across a GIF grid ("Built in", "Favourites"). */
export function GridLabel({ children }: { children: React.ReactNode }) {
  return <p className="col-span-full pt-1 text-xs font-medium text-muted">{children}</p>;
}

// minutes: how long to set it for, or KEEP_UNTIL for "keep the end time it has now"
// (keepUntil, 0 = no end), offered while a status you set is on.
type StatusDraft = { status: Status | null; text: string; minutes: number; keepUntil: number };
const KEEP_UNTIL = -1;
type ShowDraft = {
  choice: string; // "none" | "builtin:<id>" | "asset:<id>"
  hover: LibraryGif | null; // a tile under the pointer, previewed but not picked
  linkSrc: string | null; // a pasted GIPHY link we can show directly
  linkPending: boolean; // a link we can't show until it's added (Tenor pages)
  fileSrc: string | null;
  text: string;
  minutes: number;
  ring: RingChoice;
  colors: ShowColorDraft; // the screen's background and text
  colorHover: Partial<ShowColorDraft> | null; // a swatch under the pointer
};

const EMPTY_SHOW: ShowDraft = {
  choice: "none",
  hover: null,
  linkSrc: null,
  linkPending: false,
  fileSrc: null,
  text: "",
  minutes: 60,
  // A show is the person's own and can last hours, so a pattern plays the whole time.
  ring: { flash: "none", color: "", speed: 2, flashFor: 0 },
  // White on black, what lights have always shown.
  colors: { bg: "#000000", fg: AUTO_TEXT },
  colorHover: null,
};

// The colours a draft would send (and the preview draws), hovered swatch included.
function draftColors(show: ShowDraft): ShowColors | null {
  const c = { ...show.colors, ...show.colorHover };
  return parseShowColors(c.bg, c.fg === AUTO_TEXT ? "" : c.fg);
}

type Ctx = {
  library: LibraryGif[];
  // The light whose own status the page is setting, or null for you (every light that
  // follows you). Goes with each form as "light".
  light: string | null;
  // Who picks a change up, for "Sent" lines: "Desk and Door", "Boardroom", "Your lights".
  lightsLabel: string;
  live: LiveShow | null;
  focus: "status" | "show" | null; // which card the person is working in
  setFocus: (f: "status" | "show" | null) => void;
  status: StatusDraft;
  setStatus: (d: Partial<StatusDraft>) => void;
  show: ShowDraft;
  setShow: (d: Partial<ShowDraft>) => void;
  resetShow: () => void;
  names: Record<Status, string>; // what they call each status
};

const Studio = createContext<Ctx | null>(null);
const useStudio = () => {
  const c = useContext(Studio);
  if (!c) throw new Error("Studio components need a StudioProvider");
  return c;
};

export function StudioProvider({
  library,
  live,
  initialShow,
  light = null,
  lightsLabel = "Your lights",
  labels = null,
  children,
}: {
  labels?: StatusLabels | null;
  library: LibraryGif[];
  live: LiveShow | null;
  light?: string | null;
  lightsLabel?: string;
  initialShow?: string; // a GIF to start with picked ("Show now" on the GIFs page)
  children: React.ReactNode;
}) {
  const [focus, setFocus] = useState<Ctx["focus"]>(initialShow ? "show" : null);
  const [status, setStatusState] = useState<StatusDraft>({
    status: null,
    text: "",
    minutes: 0,
    keepUntil: 0,
  });
  // Stable, so the status form can sync the draft from an effect.
  const setStatus = useCallback((d: Partial<StatusDraft>) => setStatusState((s) => ({ ...s, ...d })), []);
  const [show, setShowState] = useState<ShowDraft>(initialShow ? { ...EMPTY_SHOW, choice: initialShow } : EMPTY_SHOW);
  const value = useMemo<Ctx>(
    () => ({
      library,
      light,
      lightsLabel,
      live,
      focus,
      setFocus,
      status,
      setStatus,
      show,
      setShow: (d) => setShowState((s) => ({ ...s, ...d })),
      resetShow: () => setShowState(EMPTY_SHOW),
      names: allLabels(labels),
    }),
    [library, light, lightsLabel, live, focus, status, setStatus, show, labels],
  );
  return <Studio.Provider value={value}>{children}</Studio.Provider>;
}

// Which light a form is for, when it isn't you (lib actions targetLight).
export function LightField() {
  const { light } = useStudio();
  return light ? <input type="hidden" name="light" value={light} /> : null;
}

// Status and Show now as two tabs of one card, so the page is one place to change what's
// on your lights. Both stay mounted, so a half-picked GIF survives a look at the other tab.
export function StudioTabs({ status, show, statusHint, showHint }: { status: React.ReactNode; show: React.ReactNode; statusHint: string; showHint: string }) {
  const { focus, setFocus } = useStudio();
  // The GIF library's play button arrives with a GIF picked (focus "show"): open Show now.
  const [tab, setTab] = useState<"status" | "show">(focus === "show" ? "show" : "status");
  const tabs = [
    { id: "status" as const, label: "Status" },
    { id: "show" as const, label: "Show now" },
  ];
  return (
    <div>
      <div role="tablist" aria-label="What to change" className="inline-flex gap-1 rounded-xl bg-subtle p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => {
              setTab(t.id);
              setFocus(null);
            }}
            className={cx(
              "h-9 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              tab === t.id ? "bg-card text-foreground shadow-card" : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">{tab === "status" ? statusHint : showHint}</p>
      <div role="tabpanel" id="panel-status" aria-labelledby="tab-status" hidden={tab !== "status"} className="mt-5">
        {status}
      </div>
      <div role="tabpanel" id="panel-show" aria-labelledby="tab-show" hidden={tab !== "show"} className="mt-5">
        {show}
      </div>
    </div>
  );
}

// The ring picked for a show, as the light would play it (flashing, so you can see it).
// null: no pattern picked, or this light isn't allowed to flash.
function draftRing(device: PreviewDevice, show: ShowDraft): LedStyle | null {
  return allowedRing(pushLeds({ ...show.ring, flashFor: 0 }), device.allowFlash !== false);
}

const minutesFromNow = (m: number) => (m > 0 ? Math.floor(Date.now() / 1000) + m * 60 : 0);

function draftShowGif(show: ShowDraft, library: LibraryGif[]): string | null {
  if (show.fileSrc) return show.fileSrc;
  if (show.linkSrc) return show.linkSrc;
  if (show.hover) return show.hover.src;
  return library.find((g) => g.choice === show.choice)?.src ?? null;
}

// ---- preview ----
//
// Phones: a compact bar pinned under the header, the light on the left and what it's
// showing on the right. lg+: a tall card with the light on a stage, sticky beside the
// controls.

export function StudioPreview({
  devices,
  summary,
  example = false,
}: {
  devices: PreviewDevice[];
  summary?: React.ReactNode; // the current status line, rendered by the page
  example?: boolean; // no lights yet: devices holds one example
}) {
  const { live, focus, status, show, library } = useStudio();
  // The first is the one to draw: the page puts an online light first.
  const device = devices[0];
  if (!device) return null;

  let view = device.view;
  let gif = view.status === "unknown" ? null : device.gifs[view.status];
  let draft = false;
  let ring = device.ring ?? null;
  const liveView = () => {
    if (!live) return;
    view = withShow(view, {
      text: live.text,
      until: live.until,
      gif: !!live.gifSrc,
      colors: live.colors ?? null,
    });
    if (view.layout === "show-gif") gif = live.gifSrc;
  };

  if (focus === "status" && (status.status || status.text.trim())) {
    // Picking a status: what that status would look like.
    const s = status.status ?? (view.status === "unknown" ? "free" : view.status);
    view = viewFor({
      status: s,
      text: status.text.trim(),
      until: status.minutes === KEEP_UNTIL ? status.keepUntil : minutesFromNow(status.minutes),
    }, true, device.labels);
    gif = device.gifs[s];
    ring = device.styles?.[s] ?? null;
    draft = true;
  } else if (draftShowGif(show, library) || screenText(show.text.trim())) {
    // A GIF or message picked for "show now" stays on the preview until it's sent or
    // cleared, so you can look at it while choosing how long.
    const src = draftShowGif(show, library);
    view = withShow(device.view, { text: screenText(show.text.trim()), until: minutesFromNow(show.minutes), gif: !!src, colors: draftColors(show) });
    gif = view.layout === "show-gif" ? src : null;
    ring = draftRing(device, show) ?? device.baseRing ?? null;
    draft = true;
  } else {
    liveView();
    // A ring picked before anything to show: how the ring would move.
    const picked = focus === "show" ? draftRing(device, show) : null;
    if (picked) {
      ring = picked;
      draft = true;
    }
  }

  const [r, g, b] = LED_RGB[view.status];
  const dark = !draft && !!device.dark;

  return (
    <section
      aria-label="Your light"
      className="sticky top-14 z-20 -mx-4 border-b border-line bg-background px-4 py-3 sm:-mx-6 sm:px-6 lg:top-20 lg:mx-0 lg:rounded-2xl lg:border lg:bg-card lg:p-0 lg:shadow-card"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 lg:grid-cols-1 lg:gap-0">
        {/* What you're looking at: the screen as it is, or a draft. */}
        <div className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center gap-2 self-end lg:col-start-1 lg:justify-between lg:px-5 lg:pt-5">
          {draft ? (
            <Badge tone="inverse" aria-live="polite">
              <span aria-hidden className="size-1.5 rounded-full bg-background motion-safe:animate-pulse" />
              <span>
                Preview<span className="max-sm:hidden">, not sent yet</span>
              </span>
            </Badge>
          ) : device.offline ? (
            // Not "on your screen now": the light hasn't checked in, so it may show something older.
            <Badge aria-live="polite" title="It shows this once it's back online">
              <span aria-hidden className="size-1.5 rounded-full border border-muted" />
              {device.offline}
            </Badge>
          ) : device.dark ? (
            // Working hours are over, so the screen and ring are off until the next window.
            <Badge aria-live="polite" title="A press of its button wakes it for a few minutes">
              <span aria-hidden className="size-1.5 rounded-full border border-muted" />
              {device.dark}
            </Badge>
          ) : (
            <Badge aria-live="polite">
              <span aria-hidden className="size-1.5 rounded-full bg-foreground/70" />
              {example ? "How it would look" : "Live"}
            </Badge>
          )}
          {example ? (
            <span className="min-w-0 truncate text-xs text-muted max-lg:hidden lg:text-sm">Example light</span>
          ) : (
            // Every light listed shows the same thing, so there's nothing to pick: just say where.
            <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted lg:text-sm">
              {devices.map((d) => (
                <span key={d.id} className="inline-flex min-w-0 items-center gap-1.5" title={d.offline ?? "Online"}>
                  <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", d.offline ? "border border-muted" : "bg-free")} />
                  <span className="truncate">{d.name}</span>
                  {d.offline && <span className="sr-only">({d.offline})</span>}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* The light, on a stage lit by its own colour. */}
        <div
          className="col-start-1 row-span-2 row-start-1 flex items-center justify-center lg:row-span-1 lg:row-start-2 lg:mx-5 lg:my-2 lg:rounded-xl lg:py-6 lg:transition-[background] lg:duration-300"
          style={{ ["--stage" as string]: `radial-gradient(closest-side, rgb(${r} ${g} ${b} / ${dark ? 0 : 0.16}), transparent)` }}
        >
          <div className="max-lg:[zoom:0.5] lg:[background:var(--stage)] lg:rounded-full lg:p-6">
            <DevicePreview view={view} gifSrc={gif} ring={ring} dark={dark} scale={1} className="max-lg:m-5" />
          </div>
        </div>

        <div className="col-start-2 row-start-2 min-w-0 self-start lg:col-start-1 lg:row-start-3 lg:border-t lg:border-line lg:px-5 lg:py-4">
          {show.linkPending && <p className="mb-2 text-xs text-muted">The GIF from your link appears here once it&apos;s added.</p>}
          {example && (
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:mb-4 lg:flex-nowrap lg:rounded-xl lg:bg-subtle lg:p-3">
              <DeviceIcon className="size-5 shrink-0 text-muted max-lg:hidden" />
              <p className="min-w-0 flex-1 text-xs text-muted lg:text-sm">
                <span className="font-medium whitespace-nowrap text-foreground">No light yet.</span>
                <span className="max-lg:hidden"> This is how a new one would look.</span>
              </p>
              <Link href="/lights#add-device" className={buttonClass("secondary", "sm")}>
                Add your light
              </Link>
            </div>
          )}
          {summary}
        </div>
      </div>
    </section>
  );
}

// ---- status ----

export type ActiveStatus = {
  status: Status;
  source: "manual" | "calendar";
  // A status you set: its message, when it ends (0 = when you change it), when it was set
  // and the end time as the page shows it.
  text?: string;
  until?: number;
  updatedAt?: number;
  untilLabel?: string;
};

const STATUS_DURATIONS = [
  { minutes: 0, label: "Until I change it" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
];

function Chips({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { minutes: number; label: string }[];
  value: number;
  onChange: (m: number) => void;
}) {
  return (
    // One row: it scrolls sideways on a narrow phone rather than wrapping into a block.
    <div className="relative -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((d) => (
        <label key={d.minutes} className="shrink-0 cursor-pointer">
          <input
            type="radio"
            name={name}
            value={d.minutes}
            checked={value === d.minutes}
            onChange={() => onChange(d.minutes)}
            className="peer sr-only"
          />
          <span className="flex h-9 items-center justify-center rounded-full border border-line bg-card px-3.5 text-sm font-medium whitespace-nowrap text-muted shadow-card transition-colors hover:border-line-strong hover:text-foreground peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
            {d.label}
          </span>
        </label>
      ))}
    </div>
  );
}

export function StatusControls({ active = null, className }: { active?: ActiveStatus | null; className?: string }) {
  const { setFocus, status, setStatus: setDraft, live, names } = useStudio();
  const form = useRef<HTMLFormElement>(null);
  // While a show has the screen, the status is only what the light glows.
  const covered = live !== null;
  const manual = active?.source === "manual" ? active : null;
  const keepsEnd = !!manual?.until;

  // Whenever the status you set changes (here, from the light's button or another tab),
  // put its message in the box and its end time on the chips, so pressing Enter or
  // tapping another status keeps them rather than wiping them.
  const manualKey = manual ? `${manual.updatedAt}` : "none";
  useEffect(() => {
    setDraft({
      text: manual?.text ?? "",
      minutes: manual?.until ? KEEP_UNTIL : 0,
      keepUntil: manual?.until ?? 0,
    });
    // Only when the saved status changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualKey, setDraft]);

  // Pressing Enter in the message box would otherwise submit with the form's first
  // button (Free). Send it with the status that's on instead, or wait for a pick.
  const sendWith = manual?.status ?? active?.status ?? null;
  const durations = keepsEnd ? [{ minutes: KEEP_UNTIL, label: `Until ${manual?.untilLabel ?? "it ends"}` }, ...STATUS_DURATIONS] : STATUS_DURATIONS;
  const changed = !!manual && (status.text.trim() !== (manual.text ?? "") || status.minutes !== (keepsEnd ? KEEP_UNTIL : 0));

  return (
    <form
      ref={form}
      action={async (fd) => {
        await setStatus(fd);
        setDraft({ status: null });
        setFocus(null);
      }}
      // Don't let React's after-action reset untick the controlled duration pills
      // (the next status would then go without one).
      onReset={(e) => e.preventDefault()}
      onFocus={() => setFocus("status")}
      onMouseEnter={() => setFocus("status")}
      onMouseLeave={() => {
        setDraft({ status: null });
        if (!form.current?.contains(document.activeElement)) setFocus(null);
      }}
      className={cx("space-y-4", className)}
    >
      <LightField />
      {/* How long and what it says come first, so one tap on a status sends all of it. */}
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-sm font-medium">For</legend>
        <Chips name="minutes" options={durations} value={status.minutes} onChange={(m) => setDraft({ minutes: m })} />
      </fieldset>

      <div>
        <label htmlFor="status-text" className="sr-only">
          Message
        </label>
      <Input
        id="status-text"
        aria-describedby="status-text-hint"
        name="text"
        maxLength={TEXT_MAX}
        value={status.text}
        onChange={(e) => setDraft({ text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          const button = sendWith && form.current?.querySelector<HTMLButtonElement>(`button[name="status"][value="${sendWith}"]`);
          if (button) form.current?.requestSubmit(button);
        }}
        placeholder="Add a message, like On a call"
        autoComplete="off"
      />
        <p id="status-text-hint" className="mt-1.5 text-xs text-muted" aria-live="polite">
          {statusCut(status.text) !== null ? (
            // Two lines is all the bar has: say what will show before it's sent.
            <span className="text-danger">Only “{statusCut(status.text)}” fits. Shorten it, or use Show now for a longer message.</span>
          ) : status.text.trim() && screenText(status.text.trim()) !== status.text.trim() ? (
            "The screen only has plain letters: emoji and accents are left out."
          ) : sendWith ? (
            <>
              Optional, shown under your status.<span className="max-sm:hidden"> Press Enter to send it with {names[sendWith]}.</span>
            </>
          ) : (
            "Optional, shown under your status."
          )}
        </p>
      </div>

      <StatusTiles active={active} covered={covered} />

      {manual && changed && (
        <div className="flex justify-end">
          <Button size="sm" name="status" value={manual.status}>
            Update {names[manual.status]}
          </Button>
        </div>
      )}
    </form>
  );
}

// The four status buttons. Tapping one sends the form; until the page comes back, the one
// you tapped says so and the others wait, so a slow connection doesn't look like a dead tap.
function StatusTiles({ active, covered }: { active: ActiveStatus | null; covered: boolean }) {
  const { focus, status, setStatus: setDraft, names } = useStudio();
  const { pending, data } = useFormStatus();
  const sending = pending ? (data?.get("status") as Status | null) : null;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-busy={pending || undefined}>
      {STATUSES.map((s) => {
        const meta = { ...STATUS_META[s], label: names[s] };
        const isActive = sending ? sending === s : active?.status === s;
        // Under the pointer or keyboard focus: what the preview is showing.
        const previewing = focus === "status" && status.status === s && !isActive;
        return (
          <button
            key={s}
            name="status"
            value={s}
            aria-pressed={isActive}
            aria-disabled={pending || undefined}
            aria-label={
              sending === s
                ? `Setting ${meta.label}`
                : isActive
                  ? `${meta.label} (${covered ? "light colour only, the screen is showing something else" : "now"}${active?.source === "calendar" ? ", from your calendar" : ""})`
                  : `Set ${meta.label}`
            }
            onClick={(e) => {
              // One at a time: a second tap while the first is on its way is ignored.
              if (pending) e.preventDefault();
            }}
            onMouseEnter={() => setDraft({ status: s })}
            onFocus={() => setDraft({ status: s })}
            className={cx(
              "relative flex min-h-[4.25rem] flex-col items-start justify-between gap-2 rounded-xl border p-3 text-left shadow-card transition-[background-color,border-color,box-shadow,opacity] duration-150",
              isActive
                ? cx("border-transparent ring-2", meta.ring, meta.tint)
                : cx("border-line bg-card", meta.hover, previewing && meta.soft),
              pending && sending !== s && "opacity-60",
            )}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <StatusDot status={s} size="lg" />
              {sending === s ? (
                <span className={cx("flex h-5 items-center gap-1 rounded-full px-2 text-[0.6875rem] leading-none font-semibold text-white", meta.bg)}>
                  <span aria-hidden className="size-2.5 rounded-full border-[1.5px] border-white/40 border-t-white motion-safe:animate-spin" />
                  Setting
                </span>
              ) : (
                isActive && (
                  <span
                    className={cx(
                      "flex h-5 items-center gap-0.5 rounded-full pr-2 pl-1 text-[0.6875rem] leading-none font-semibold text-white",
                      meta.bg,
                    )}
                  >
                    {active?.source === "calendar" ? <CalendarIcon className="size-3" strokeWidth={2.5} /> : <CheckIcon className="size-3" strokeWidth={3} />}
                    {covered ? "Light" : "Now"}
                  </span>
                )
              )}
            </span>
            <span className="text-sm leading-tight font-semibold">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- show now ----
//
// Kept to a row of GIFs and one button: tap a GIF and it's on the preview, press
// Show now. Pasting a link or uploading hides behind the "+" tile, the message behind
// "Add a message", and how long is one small menu that most people never touch.

const SHOW_DURATIONS = [
  { minutes: 15, label: "For 15 min" },
  { minutes: 60, label: "For 1 hour" },
  { minutes: 240, label: "For 4 hours" },
  { minutes: 0, label: "Until I stop it" },
];

const MAX_UPLOAD = 4 * 1024 * 1024;
const TEXT_ONLY = "none";

export function ShowNowControls({
  className,
  flashOff = false,
  screenStatus = "free",
  oldColors = false,
}: {
  className?: string;
  flashOff?: boolean;
  screenStatus?: ScreenView["status"]; // what "Status colour" fills the screen with now
  oldColors?: boolean; // a light's firmware doesn't know Show now colours yet
}) {
  const { library, live, setFocus, show, setShow, resetShow, lightsLabel } = useStudio();
  const form = useRef<HTMLFormElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const message = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false); // the "+" panel: link or upload
  const [writing, setWriting] = useState(false); // the message box
  const [ringing, setRinging] = useState(false); // the ring effect
  const [textOnly, setTextOnly] = useState(false); // the "Aa" tile: a message, no GIF
  const [find, setFind] = useState(""); // filters the picker once the library is big
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [linkName, setLinkName] = useState(""); // the name GIPHY/Tenor's link suggests
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState<SaveGifResult>(null);
  const [saving, startSave] = useTransition();
  const [keptToo, setKeptToo] = useState(false); // the last show was a new GIF, now in the library

  const [result, action, pending] = useActionState<ShowNowResult, FormData>(async (prev, fd) => {
    const fresh = !!fd.get("link") || ((fd.get("file") as File | null)?.size ?? 0) > 0;
    const r = await showNowAction(prev, fd);
    if (r?.ok) {
      setKeptToo(fresh);
      setSaved(null);
      setSaveName("");
      setLinkName("");
      // Sent: clear the draft so the preview goes back to what's on the screen.
      resetShow();
      setFocus(null);
      setAdding(false);
      setWriting(false);
      setRinging(false);
      setTextOnly(false);
      setFileName("");
    }
    return r;
  }, null);

  // Free the local copy of a picked file when it's replaced.
  useEffect(() => {
    const src = show.fileSrc;
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [show.fileSrc]);

  useEffect(() => {
    if (writing) message.current?.focus();
  }, [writing]);

  // A GIF just saved is picked: bring its tile into view in the picker.
  const savedChoice = saved?.ok ? saved.choice : null;
  useEffect(() => {
    if (savedChoice) grid.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [savedChoice]);

  // Save the pasted link or picked file to the library without showing it, then pick it.
  const save = () =>
    startSave(async () => {
      if (!form.current) return;
      const r = await saveShowGifAction(new FormData(form.current));
      setSaved(r);
      if (!r?.ok) return;
      if (linkInput.current) linkInput.current.value = "";
      if (file.current) file.current.value = "";
      setFileName("");
      setLinkName("");
      setSaveName("");
      setTextOnly(false);
      setAdding(false);
      setFocus("show");
      setShow({ linkSrc: null, linkPending: false, fileSrc: null, choice: r.choice, hover: null });
    });

  const usingOther = !!(show.fileSrc || show.linkSrc || show.linkPending);
  const hasGif = usingOther || show.choice !== TEXT_ONLY;
  const text = screenText(show.text.trim());
  const ready = hasGif || !!text;
  // Under a GIF there's room for two lines; say so before the end goes missing.
  const shown = text ? (hasGif ? wrapBar(text) : wrapMessage(text).lines).join(" ") : "";
  const fits =
    text && shown.replace(/ +/g, " ") !== text.replace(/ +/g, " ")
      ? hasGif
        ? `Under a GIF only “${shown}” fits. Shorten it, or tap Aa for big text.`
        : `Only “${shown}” fits on the screen.`
      : null;

  const q = find.trim().toLowerCase();
  const found = q ? library.filter((g) => g.name.toLowerCase().includes(q)) : library;

  const pick = (choice: string) => {
    setFocus("show");
    setTextOnly(choice === TEXT_ONLY);
    setShow({ choice, hover: null });
    if (choice === TEXT_ONLY) setWriting(true);
  };

  return (
    <div className={cx("space-y-5", className)}>
      {live && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-subtle p-2.5 pr-3">
          {live.gifSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- small animated thumbnail
            <img src={live.gifSrc} alt="" className="size-11 shrink-0 rounded-lg bg-black object-cover" />
          ) : (
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-black text-sm font-semibold text-white/85">
              Aa
            </span>
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{live.push ? `An announcement from ${live.push.team} is on screen` : "On screen now"}</p>
            <p className="truncate text-muted">
              {[live.gifName, live.text && `“${live.text}”`].filter(Boolean).join(" with ")}
              {live.leds ? ` · ${ringLabel(live.leds)} ring` : ""}
              {live.until ? ` · until ${clock(live.until)}` : ""}
            </p>
            {live.push && <p className="text-muted">Press the top button on a light to dismiss it.</p>}
          </div>
          {!live.push && (
            <form action={clearShowAction} className="shrink-0">
              <LightField />
              <Button size="sm">
                <XIcon />
                Stop showing
              </Button>
            </form>
          )}
        </div>
      )}

      <form ref={form} action={action} onFocus={() => setFocus("show")} className="space-y-4">
        <LightField />
        {library.length > 12 && (
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              aria-label="Find a GIF"
              placeholder={`Find one of your ${library.length} GIFs`}
              className="h-9 pl-9 text-sm"
            />
          </div>
        )}
        {/* The scroll box wraps the grid rather than being it: Safari squashes the
            rows of a height-capped grid, so square tiles spill into the next row. */}
        <div ref={grid} className="-mx-1.5 -mt-1.5 max-h-[17rem] overflow-y-auto p-1.5">
          <div
            role="radiogroup"
            aria-label="GIF to show"
            className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-2.5"
            onMouseEnter={() => setFocus("show")}
            onMouseLeave={() => setShow({ hover: null })}
          >
            <button
              type="button"
              aria-expanded={adding}
              aria-label="Add a GIF from a link or a file"
              title="Add a GIF from a link or a file"
              onClick={() => setAdding((a) => !a)}
              className={cx(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-foreground",
                adding || usingOther ? "border-foreground text-foreground" : "border-line-strong/70",
              )}
            >
              <PlusIcon className="size-5" />
              <span className="text-[0.6875rem] leading-none font-medium">Add</span>
            </button>
            <Tile name="Just a message" checked={!usingOther && textOnly} onPick={() => pick(TEXT_ONLY)} />
            {found.map((g, i) => (
              <Fragment key={g.choice}>
                {sectionLabel(found, i) && <GridLabel>{sectionLabel(found, i)}</GridLabel>}
                <Tile name={g.name} gif={g} checked={!usingOther && !textOnly && show.choice === g.choice} onPick={() => pick(g.choice)} />
              </Fragment>
            ))}
          </div>
        </div>
        {/* The choice goes with the form; tiles are buttons so tapping one previews it. */}
        <input type="hidden" name="gif" value={textOnly ? TEXT_ONLY : show.choice} />
        {saved?.ok && !adding && (
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm" role="status">
            <CheckIcon className="size-4 text-free" />
            Saved “{saved.name}” to your GIFs.
            <Link href="/look#library" className="text-muted underline underline-offset-2 hover:text-foreground">
              See them all
            </Link>
          </p>
        )}

        {adding && (
          <div className="space-y-3 rounded-xl border border-line bg-subtle p-3">
            <div className="relative">
              <LinkIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input
                ref={linkInput}
                name="link"
                type="url"
                inputMode="url"
                aria-label="GIPHY or Tenor link"
                placeholder="Paste a GIPHY or Tenor link"
                className="pl-9"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  setSaved(null);
                  if (!raw) {
                    setLinkName("");
                    return setShow({ linkSrc: null, linkPending: false });
                  }
                  try {
                    const link = parseGifLink(raw);
                    const src = link.media[0]?.toString() ?? null;
                    setLinkName(link.name);
                    setShow({ linkSrc: src, linkPending: !src });
                  } catch {
                    setLinkName("");
                    setShow({ linkSrc: null, linkPending: false });
                  }
                }}
              />
            </div>
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
              <span>or</span>
              <Button type="button" size="sm" onClick={() => file.current?.click()}>
                <UploadIcon />
                Upload a file
              </Button>
              {show.fileSrc && <span className="min-w-0 truncate">{fileName}</span>}
            </div>
            <input
              ref={file}
              name="file"
              type="file"
              hidden
              accept="image/gif,image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size > MAX_UPLOAD) {
                  e.target.value = "";
                  setFileError(`${f.name} is over 4 MB. Try a smaller GIF.`);
                  return;
                }
                setFileError(null);
                setSaved(null);
                setFocus("show");
                setFileName(f?.name ?? "");
                setShow({ fileSrc: f ? URL.createObjectURL(f) : null });
              }}
            />
            {fileError && (
              <p className="text-xs text-danger" role="alert">
                {fileError}
              </p>
            )}
            {usingOther && (
              <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center">
                <Input
                  name="saveName"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter here saves rather than sending the whole Show now form.
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!saving) save();
                  }}
                  maxLength={60}
                  aria-label="Name"
                  placeholder={linkName || fileName.replace(/\.[^.]+$/, "") || "Name (optional)"}
                  autoComplete="off"
                  className="h-9 min-w-0 flex-1 text-sm"
                />
                <Button type="button" size="sm" disabled={saving || pending} onClick={save}>
                  <CheckIcon />
                  {saving ? "Saving…" : "Save to my GIFs"}
                </Button>
              </div>
            )}
            {saved?.ok === false && (
              <p className="text-xs text-danger" role="alert">
                {saved.error}
              </p>
            )}
          </div>
        )}

        {writing ? (
          <Field
            label="Message"
            htmlFor="show-text"
            hint={
              fits || (show.text.trim() && text !== show.text.trim()) ? (
                <>
                  {fits}
                  {fits && show.text.trim() && text !== show.text.trim() && " "}
                  {show.text.trim() && text !== show.text.trim() && "The screen only has plain letters: emoji and accents are left out."}
                </>
              ) : undefined
            }
          >
            <Input
              ref={message}
              id="show-text"
              name="text"
              maxLength={TEXT_MAX}
              value={show.text}
              onChange={(e) => setShow({ text: e.target.value })}
              placeholder={textOnly ? "Type your message" : "Add a message (optional)"}
              autoComplete="off"
            />
          </Field>
        ) : null}

        {writing && (
          // The message's colours, under it. With a GIF the background fills the bar
          // under it (and round a small GIF).
          <div onMouseEnter={() => setFocus("show")}>
            <ShowColorPicker
              value={show.colors}
              status={screenStatus}
              onChange={(v) => {
                setFocus("show");
                setShow({ colors: { ...show.colors, ...v }, colorHover: null });
              }}
              onHover={(v) => setShow({ colorHover: v })}
            />
            {oldColors && <p className="mt-2 text-xs text-muted">A light on older firmware shows white on black until it updates.</p>}
          </div>
        )}

        {ringing && (
          <fieldset className="min-w-0" onMouseEnter={() => setFocus("show")}>
            <legend className="mb-1.5 text-sm font-medium">Ring</legend>
            <RingPicker
              value={show.ring}
              onChange={(v) => {
                setFocus("show");
                setShow({ ring: { ...show.ring, ...v } });
              }}
              steadyOnly={flashOff}
              note={
                flashOff
                  ? "Flashing is off for these lights, so only Steady is offered. Turn on Allow flashing on a light's page for the others."
                  : "Never faster than 3 flashes a second. A light on older firmware keeps its usual ring until it updates."
              }
            />
          </fieldset>
        )}

        {(!writing || !ringing) && (
          <div className="-ml-2 flex flex-wrap gap-1">
            {!writing && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setWriting(true)}>
                <PlusIcon />
                Add a message
              </Button>
            )}
            {!ringing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRinging(true);
                  setFocus("show");
                  // Start from the ring that's on screen now, so opening this doesn't swap
                  // the preview to something else; otherwise Steady.
                  if (show.ring.flash === "none") setShow({ ring: live?.leds ? ringChoice(live.leds) : { ...show.ring, flash: "solid" } });
                }}
              >
                <PlusIcon />
                Add a ring effect
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button variant="primary" disabled={pending || !ready} className="px-5">
            {pending ? "Showing…" : "Show now"}
          </Button>
          <Select
            name="minutes"
            aria-label="How long"
            value={show.minutes}
            onChange={(e) => setShow({ minutes: Number(e.target.value) })}
            wrapperClassName="max-w-52"
            className="cursor-pointer"
          >
            {SHOW_DURATIONS.map((d) => (
              <option key={d.minutes} value={d.minutes}>
                {d.label}
              </option>
            ))}
          </Select>
          {!ready && !pending && <p className="text-sm text-muted">Pick a GIF or write a message first.</p>}
          {result?.ok === false && (
            <p className="basis-full text-sm text-danger" role="alert">
              {result.error}
            </p>
          )}
          {result?.ok && !pending && (
            <p className="basis-full text-sm text-muted">
              Sent. {lightsLabel} {lightsLabel.includes(" and ") || lightsLabel === "Your lights" ? "pick" : "picks"} it up within about 20 seconds.
              {keptToo && " The GIF is saved to your GIFs too."}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

function Tile({ name, gif, checked, onPick }: { name: string; gif?: LibraryGif; checked: boolean; onPick: () => void }) {
  const { setShow } = useStudio();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={name}
      title={name}
      onClick={onPick}
      onMouseEnter={() => setShow({ hover: gif ?? null })}
      className={cx(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-device transition-[box-shadow,transform] duration-150 hover:ring-2 hover:ring-line-strong motion-safe:hover:scale-[1.03]",
        checked && "ring-2 ring-foreground ring-offset-2 ring-offset-card hover:ring-foreground",
      )}
    >
      {gif ? (
        // eslint-disable-next-line @next/next/no-img-element -- animated GIFs, already sized
        <img src={gif.src} alt="" loading="lazy" className="absolute inset-0 m-auto max-h-full max-w-full" />
      ) : (
        <span className="flex flex-col items-center gap-1 text-white/85">
          <span className="text-lg leading-none font-semibold">Aa</span>
          <span className="text-[0.6875rem] leading-none font-medium text-white/60">Text</span>
        </span>
      )}
      {checked && (
        <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-foreground text-background">
          <CheckIcon className="size-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

// "Pulse", "Rainbow spin", "Blue steady": what a ring style is called in the picker.
function ringLabel(leds: LedStyle) {
  const pattern = PUSH_FLASHES.find((f) => f.value === leds.pattern)?.label ?? "Steady";
  const color = leds.color ? PUSH_COLORS.find((c) => c.value === leds.color)?.label : null;
  return color ? `${color} ${pattern.toLowerCase()}` : pattern;
}

// A sent ring back into the picker's terms.
function ringChoice(leds: LedStyle): RingChoice {
  return { flash: leds.pattern, color: leds.color ?? "", speed: leds.speed ?? 2, flashFor: leds.for ?? 0 };
}

// "3:30 PM", in the light's fixed UTC-7 like untilLabel(), so the page agrees with the
// screen even in browsers with older time zone data.
function clock(sec: number) {
  return new Date(sec * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Etc/GMT+7" });
}
