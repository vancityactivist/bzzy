"use client";

// The Status page's controls and the device preview they drive. Everything you
// hover, pick or type shows on the preview straight away, before it's sent; the
// caption says whether you're looking at your screen as it is or a draft.

import { createContext, useActionState, useContext, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import { DevicePreview } from "@/components/device-preview";
import { CalendarIcon, CheckIcon, ChevronDownIcon, DeviceIcon, LinkIcon, PlusIcon, UploadIcon, XIcon } from "@/components/icons";
import { STATUS_META } from "@/components/status-meta";
import { Badge, Button, buttonClass, cx, Field, Input, Select, StatusDot } from "@/components/ui";
import { parseGifLink } from "@/lib/gif-link";
import { type Status, STATUSES, TEXT_MAX } from "@/lib/protocol";
import { LED_RGB, screenText, type ScreenView, viewFor, withShow, wrapBar, wrapMessage } from "@/lib/screen";

import { clearShowAction, setStatus, showNowAction, type ShowNowResult } from "./actions";

export type PreviewDevice = {
  id: string;
  name: string;
  view: ScreenView; // the status part, as it is now
  gifs: Record<Status, string | null>;
};

// What's on the screens now from "show now", if it's visible.
export type LiveShow = {
  text: string;
  until: number;
  gifSrc: string | null;
  gifName: string | null;
};

export type LibraryGif = { choice: string; name: string; src: string };

type StatusDraft = { status: Status | null; text: string; minutes: number };
type ShowDraft = {
  choice: string; // "none" | "builtin:<id>" | "asset:<id>"
  hover: LibraryGif | null; // a tile under the pointer, previewed but not picked
  linkSrc: string | null; // a pasted GIPHY link we can show directly
  linkPending: boolean; // a link we can't show until it's added (Tenor pages)
  fileSrc: string | null;
  text: string;
  minutes: number;
};

const EMPTY_SHOW: ShowDraft = {
  choice: "none",
  hover: null,
  linkSrc: null,
  linkPending: false,
  fileSrc: null,
  text: "",
  minutes: 60,
};

type Ctx = {
  library: LibraryGif[];
  live: LiveShow | null;
  focus: "status" | "show" | null; // which card the person is working in
  setFocus: (f: "status" | "show" | null) => void;
  status: StatusDraft;
  setStatus: (d: Partial<StatusDraft>) => void;
  show: ShowDraft;
  setShow: (d: Partial<ShowDraft>) => void;
  resetShow: () => void;
};

const Studio = createContext<Ctx | null>(null);
const useStudio = () => {
  const c = useContext(Studio);
  if (!c) throw new Error("Studio components need a StudioProvider");
  return c;
};

export function StudioProvider({ library, live, children }: { library: LibraryGif[]; live: LiveShow | null; children: React.ReactNode }) {
  const [focus, setFocus] = useState<Ctx["focus"]>(null);
  const [status, setStatusState] = useState<StatusDraft>({
    status: null,
    text: "",
    minutes: 0,
  });
  const [show, setShowState] = useState<ShowDraft>(EMPTY_SHOW);
  const value = useMemo<Ctx>(
    () => ({
      library,
      live,
      focus,
      setFocus,
      status,
      setStatus: (d) => setStatusState((s) => ({ ...s, ...d })),
      show,
      setShow: (d) => setShowState((s) => ({ ...s, ...d })),
      resetShow: () => setShowState(EMPTY_SHOW),
    }),
    [library, live, focus, status, show],
  );
  return <Studio.Provider value={value}>{children}</Studio.Provider>;
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
  const [index, setIndex] = useState(0);
  const device = devices[Math.min(index, devices.length - 1)];
  if (!device) return null;

  let view = device.view;
  let gif = view.status === "unknown" ? null : device.gifs[view.status];
  let draft = false;
  const liveView = () => {
    if (!live) return;
    view = withShow(view, {
      text: live.text,
      until: live.until,
      gif: !!live.gifSrc,
    });
    if (view.layout === "show-gif") gif = live.gifSrc;
  };

  if (focus === "status" && (status.status || status.text.trim())) {
    // Picking a status: what that status would look like.
    const s = status.status ?? (view.status === "unknown" ? "free" : view.status);
    view = viewFor({
      status: s,
      text: status.text.trim(),
      until: minutesFromNow(status.minutes),
    });
    gif = device.gifs[s];
    draft = true;
  } else if (draftShowGif(show, library) || screenText(show.text.trim())) {
    // A GIF or message picked for "show now" stays on the preview until it's sent or
    // cleared, so you can look at it while choosing how long.
    const src = draftShowGif(show, library);
    view = withShow(device.view, { text: screenText(show.text.trim()), until: minutesFromNow(show.minutes), gif: !!src });
    gif = view.layout === "show-gif" ? src : null;
    draft = true;
  } else {
    liveView();
  }

  const [r, g, b] = LED_RGB[view.status];

  return (
    <section
      aria-label="Your light"
      className="sticky top-14 z-20 -mx-4 border-b border-line bg-background/90 px-4 py-3 backdrop-blur-lg backdrop-saturate-150 sm:-mx-6 sm:px-6 lg:top-20 lg:mx-0 lg:rounded-2xl lg:border lg:bg-card lg:p-0 lg:shadow-card lg:backdrop-blur-none"
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
          ) : (
            <Badge aria-live="polite">
              <span aria-hidden className="size-1.5 rounded-full bg-foreground/70" />
              {example ? "How it would look" : "On your screen now"}
            </Badge>
          )}
          {devices.length > 1 ? (
            <span className="relative inline-flex min-w-0 max-w-full">
              <select
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
                aria-label="Light to preview"
                className="h-8 min-w-0 max-w-full cursor-pointer appearance-none truncate rounded-lg border border-line bg-card pr-8 pl-2.5 text-xs font-medium text-foreground shadow-card transition-colors hover:border-line-strong lg:h-10 lg:rounded-xl lg:pl-3 lg:pr-9 lg:text-sm"
              >
                {devices.map((d, i) => (
                  <option key={d.id} value={i}>
                    {d.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted lg:right-3 lg:size-4" />
            </span>
          ) : (
            <span className={cx("min-w-0 truncate text-xs text-muted lg:text-sm", example && "max-lg:hidden")}>
              {example ? "Example light" : device.name}
            </span>
          )}
        </div>

        {/* The light, on a stage lit by its own colour. */}
        <div
          className="col-start-1 row-span-2 row-start-1 flex items-center justify-center lg:row-span-1 lg:row-start-2 lg:mx-5 lg:my-2 lg:rounded-xl lg:py-6 lg:transition-[background] lg:duration-300"
          style={{ ["--stage" as string]: `radial-gradient(closest-side, rgb(${r} ${g} ${b} / 0.16), transparent)` }}
        >
          <div className="max-lg:[zoom:0.5] lg:[background:var(--stage)] lg:rounded-full lg:p-6">
            <DevicePreview view={view} gifSrc={gif} scale={1} className="max-lg:m-5" />
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
              <Link href="/devices" className={buttonClass("secondary", "sm")}>
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

export type ActiveStatus = { status: Status; source: "manual" | "calendar" };

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
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {options.map((d) => (
        <label key={d.minutes} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={d.minutes}
            checked={value === d.minutes}
            onChange={() => onChange(d.minutes)}
            className="peer sr-only"
          />
          <span className="flex h-10 items-center justify-center rounded-xl border border-line bg-card px-3.5 text-sm font-medium text-muted shadow-card transition-colors hover:border-line-strong hover:text-foreground peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
            {d.label}
          </span>
        </label>
      ))}
    </div>
  );
}

export function StatusControls({ active = null, className }: { active?: ActiveStatus | null; className?: string }) {
  const { focus, setFocus, status, setStatus: setDraft } = useStudio();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      action={async (fd) => {
        await setStatus(fd);
        setDraft({ status: null, text: "", minutes: 0 });
        setFocus(null);
      }}
      onFocus={() => setFocus("status")}
      onMouseEnter={() => setFocus("status")}
      onMouseLeave={() => {
        setDraft({ status: null });
        if (!form.current?.contains(document.activeElement)) setFocus(null);
      }}
      className={cx("space-y-5", className)}
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {STATUSES.map((s) => {
          const meta = STATUS_META[s];
          const isActive = active?.status === s;
          // Under the pointer or keyboard focus: what the preview is showing.
          const previewing = focus === "status" && status.status === s && !isActive;
          return (
            <button
              key={s}
              name="status"
              value={s}
              aria-pressed={isActive}
              aria-label={isActive ? `${meta.label} (now${active?.source === "calendar" ? ", from your calendar" : ""})` : `Set ${meta.label}`}
              onMouseEnter={() => setDraft({ status: s })}
              onFocus={() => setDraft({ status: s })}
              className={cx(
                "relative flex min-h-[4.25rem] flex-col items-start justify-between gap-2 rounded-xl border p-3 text-left shadow-card transition-[background-color,border-color,box-shadow] duration-150",
                isActive
                  ? cx("border-transparent ring-2", meta.ring, meta.tint)
                  : cx("border-line bg-card", meta.hover, previewing && meta.soft),
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <StatusDot status={s} size="lg" />
                {isActive && (
                  <span
                    className={cx(
                      "flex h-5 items-center gap-0.5 rounded-full pr-2 pl-1 text-[0.6875rem] leading-none font-semibold text-white",
                      meta.bg,
                    )}
                  >
                    {active?.source === "calendar" ? <CalendarIcon className="size-3" strokeWidth={2.5} /> : <CheckIcon className="size-3" strokeWidth={3} />}
                    Now
                  </span>
                )}
              </span>
              <span className="text-sm leading-tight font-semibold">{meta.label}</span>
            </button>
          );
        })}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">For how long</legend>
        <Chips name="minutes" options={STATUS_DURATIONS} value={status.minutes} onChange={(m) => setDraft({ minutes: m })} />
      </fieldset>

      <Field label="Message" htmlFor="status-text" hint="Shown under the status on the screen. Optional.">
        <Input
          id="status-text"
          name="text"
          maxLength={TEXT_MAX}
          value={status.text}
          onChange={(e) => setDraft({ text: e.target.value })}
          placeholder="On a call, back at 3"
          autoComplete="off"
        />
      </Field>
    </form>
  );
}

// ---- show now ----
//
// Kept to a row of GIFs and one button: tap a GIF and it's on the preview, press
// Show it. Pasting a link or uploading hides behind the "+" tile, the message behind
// "Add a message", and how long is one small menu that most people never touch.

const SHOW_DURATIONS = [
  { minutes: 15, label: "For 15 min" },
  { minutes: 60, label: "For 1 hour" },
  { minutes: 240, label: "For 4 hours" },
  { minutes: 0, label: "Until I take it down" },
];

const MAX_UPLOAD = 4 * 1024 * 1024;
const TEXT_ONLY = "none";

export function ShowNowControls({ className }: { className?: string }) {
  const { library, live, setFocus, show, setShow, resetShow } = useStudio();
  const form = useRef<HTMLFormElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const message = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false); // the "+" panel: link or upload
  const [writing, setWriting] = useState(false); // the message box
  const [textOnly, setTextOnly] = useState(false); // the "Aa" tile: a message, no GIF
  const [fileName, setFileName] = useState("");

  const [result, action, pending] = useActionState<ShowNowResult, FormData>(async (prev, fd) => {
    const r = await showNowAction(prev, fd);
    if (r?.ok) {
      // Sent: clear the draft so the preview goes back to what's on the screen.
      resetShow();
      setFocus(null);
      setAdding(false);
      setWriting(false);
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
            <p className="font-medium">On your screen now</p>
            <p className="truncate text-muted">
              {[live.gifName, live.text && `“${live.text}”`].filter(Boolean).join(" with ")}
              {live.until ? ` · until ${clock(live.until)}` : ""}
            </p>
          </div>
          <form action={clearShowAction} className="shrink-0">
            <Button size="sm">
              <XIcon />
              Take it down
            </Button>
          </form>
        </div>
      )}

      <form ref={form} action={action} onFocus={() => setFocus("show")} className="space-y-4">
        <div
          role="radiogroup"
          aria-label="GIF to show"
          className="-mx-1.5 -mt-1.5 grid max-h-[17rem] grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-2.5 overflow-y-auto p-1.5"
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
          {library.map((g) => (
            <Tile
              key={g.choice}
              name={g.name}
              gif={g}
              checked={!usingOther && !textOnly && show.choice === g.choice}
              onPick={() => pick(g.choice)}
            />
          ))}
        </div>
        {/* The choice goes with the form; tiles are buttons so tapping one previews it. */}
        <input type="hidden" name="gif" value={textOnly ? TEXT_ONLY : show.choice} />

        {adding && (
          <div className="space-y-3 rounded-xl border border-line bg-subtle p-3">
            <div className="relative">
              <LinkIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input
                name="link"
                type="url"
                inputMode="url"
                aria-label="GIPHY or Tenor link"
                placeholder="Paste a GIPHY or Tenor link"
                className="pl-9"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (!raw) return setShow({ linkSrc: null, linkPending: false });
                  try {
                    const link = parseGifLink(raw);
                    const src = link.media[0]?.toString() ?? null;
                    setShow({ linkSrc: src, linkPending: !src });
                  } catch {
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
                  alert("That file is over 4 MB.");
                  return;
                }
                setFocus("show");
                setFileName(f?.name ?? "");
                setShow({ fileSrc: f ? URL.createObjectURL(f) : null });
              }}
            />
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
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setWriting(true)} className="-ml-2">
            <PlusIcon />
            Add a message
          </Button>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button variant="primary" disabled={pending || !ready} className="px-5">
            {pending ? "Putting it up…" : "Show it"}
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
          {result?.ok === false && (
            <p className="basis-full text-sm text-danger" role="alert">
              {result.error}
            </p>
          )}
          {result?.ok && !pending && <p className="basis-full text-sm text-muted">Sent. Your light picks it up within about 20 seconds.</p>}
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
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-[#0b0b0c] transition-[box-shadow,transform] duration-150 hover:ring-2 hover:ring-line-strong motion-safe:hover:scale-[1.03]",
        checked && "ring-2 ring-foreground ring-offset-2 ring-offset-card hover:ring-foreground",
      )}
    >
      {gif ? (
        // eslint-disable-next-line @next/next/no-img-element -- animated GIFs, already sized
        <img src={gif.src} alt="" loading="lazy" className="max-h-full max-w-full" />
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

// "3:30 PM", in the light's fixed UTC-7 like untilLabel(), so the page agrees with the
// screen even in browsers with older time zone data.
function clock(sec: number) {
  return new Date(sec * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Etc/GMT+7" });
}
