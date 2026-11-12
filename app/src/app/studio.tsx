"use client";

// The Status page's controls and the device preview they drive. Everything you
// hover, pick or type shows on the preview straight away, before it's sent; the
// caption says whether you're looking at your screen as it is or a draft.

import { createContext, useActionState, useContext, useEffect, useMemo, useRef, useState } from "react";

import { DevicePreview } from "@/components/device-preview";
import { STATUS_META } from "@/components/status-meta";
import { parseGifLink } from "@/lib/gif-link";
import { type Status, STATUSES, TEXT_MAX } from "@/lib/protocol";
import { screenText, type ScreenView, viewFor, withShow, wrapBar, wrapMessage } from "@/lib/screen";

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

export function StudioPreview({ devices }: { devices: PreviewDevice[] }) {
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

  return (
    <figure className="flex flex-col items-center gap-1 lg:gap-3">
      {/* Smaller on phones, where it sticks to the top of the page while you pick. */}
      <div className="max-lg:[zoom:0.55]">
        <DevicePreview view={view} gifSrc={gif} scale={0.9} className="m-6" />
      </div>
      <figcaption className="flex flex-wrap items-center justify-center gap-2 text-center text-xs text-muted">
        <span
          className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
            draft ? "bg-foreground text-background" : "border border-line bg-card"
          }`}
        >
          {draft ? "Preview, not sent yet" : "On your screen now"}
        </span>
        {devices.length > 1 ? (
          <select
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            aria-label="Device to preview"
            className="rounded-md border border-line bg-background px-2 py-1"
          >
            {devices.map((d, i) => (
              <option key={d.id} value={i}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          <span>{device.name}</span>
        )}
        {show.linkPending && <span className="basis-full">The GIF from your link appears here once it&apos;s added.</span>}
      </figcaption>
    </figure>
  );
}

// ---- status ----

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
    <div className="flex flex-wrap gap-2">
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
          <span className="block rounded-full border border-line px-3 py-1.5 text-sm peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-foreground">
            {d.label}
          </span>
        </label>
      ))}
    </div>
  );
}

export function StatusControls() {
  const { setFocus, status, setStatus: setDraft } = useStudio();
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
      className="space-y-5"
    >
      <div className="grid grid-cols-2 gap-3">
        {STATUSES.map((s) => (
          <button
            key={s}
            name="status"
            value={s}
            onMouseEnter={() => setDraft({ status: s })}
            onFocus={() => setDraft({ status: s })}
            className={`rounded-xl px-4 py-6 text-lg font-semibold text-white ${STATUS_META[s].bg} transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-4 ${STATUS_META[s].ring} ring-offset-2`}
          >
            {STATUS_META[s].label}
          </button>
        ))}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm text-muted">For how long</legend>
        <Chips name="minutes" options={STATUS_DURATIONS} value={status.minutes} onChange={(m) => setDraft({ minutes: m })} />
      </fieldset>

      <label className="block">
        <span className="text-sm text-muted">Message under the status (optional)</span>
        <input
          name="text"
          maxLength={TEXT_MAX}
          value={status.text}
          onChange={(e) => setDraft({ text: e.target.value })}
          placeholder="On a call, back at 3"
          className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2"
        />
      </label>
    </form>
  );
}

// ---- show now ----
//
// Kept to a row of GIFs and one button: tap a GIF and it's on the preview, press
// Show it. Pasting a link or uploading hides behind the "+" tile, the message behind
// "Add a message", and how long is one small menu that most people never touch.

const SHOW_DURATIONS = [
  { minutes: 15, label: "for 15 min ▾" },
  { minutes: 60, label: "for 1 hour ▾" },
  { minutes: 240, label: "for 4 hours ▾" },
  { minutes: 0, label: "until I take it down ▾" },
];

const MAX_UPLOAD = 4 * 1024 * 1024;
const TEXT_ONLY = "none";

export function ShowNowControls() {
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
    <div className="space-y-4">
      {live && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-background p-3 text-sm">
          {live.gifSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- small animated thumbnail
            <img src={live.gifSrc} alt="" className="h-10 w-12 rounded object-cover" />
          )}
          <p className="min-w-0 flex-1">
            <span className="font-medium">On your screen: </span>
            {[live.gifName, live.text && `“${live.text}”`].filter(Boolean).join(" with ")}
          </p>
          <form action={clearShowAction}>
            <button className="rounded-md border border-line px-3 py-1.5 hover:bg-card">Take it down</button>
          </form>
        </div>
      )}

      <form ref={form} action={action} onFocus={() => setFocus("show")} className="space-y-4">
        <div
          role="radiogroup"
          aria-label="GIF to show"
          className="-mx-1 grid max-h-72 grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 overflow-y-auto p-2"
          onMouseEnter={() => setFocus("show")}
          onMouseLeave={() => setShow({ hover: null })}
        >
          <button
            type="button"
            aria-expanded={adding}
            aria-label="Add a GIF from a link or a file"
            onClick={() => setAdding((a) => !a)}
            className={`flex aspect-[6/5] items-center justify-center rounded-lg border-2 border-dashed text-2xl text-muted transition hover:border-foreground hover:text-foreground ${
              adding || usingOther ? "border-foreground text-foreground" : "border-line"
            }`}
          >
            +
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
          <div className="space-y-2 rounded-lg border border-line bg-background p-3">
            <input
              name="link"
              type="url"
              inputMode="url"
              aria-label="GIPHY or Tenor link"
              placeholder="Paste a GIPHY or Tenor link"
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
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>or</span>
              <button
                type="button"
                onClick={() => file.current?.click()}
                className="rounded-md border border-line bg-card px-3 py-1.5 text-foreground hover:bg-background"
              >
                Upload a file
              </button>
              {show.fileSrc && <span className="truncate">{fileName}</span>}
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
          <label className="block">
            <span className="sr-only">Message</span>
            <input
              ref={message}
              name="text"
              maxLength={TEXT_MAX}
              value={show.text}
              onChange={(e) => setShow({ text: e.target.value })}
              placeholder={textOnly ? "Type your message" : "Add a message (optional)"}
              className="w-full rounded-md border border-line bg-background px-3 py-2"
            />
            {fits && <span className="mt-1 block text-xs text-muted">{fits}</span>}
            {show.text.trim() && text !== show.text.trim() && (
              <span className="mt-1 block text-xs text-muted">The screen only has plain letters: emoji and accents are left out.</span>
            )}
          </label>
        ) : (
          <button type="button" onClick={() => setWriting(true)} className="text-sm text-muted underline-offset-4 hover:underline">
            + Add a message
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={pending || !ready}
            className="rounded-md bg-foreground px-5 py-2.5 font-medium text-background disabled:opacity-40"
          >
            {pending ? "Putting it up…" : "Show it"}
          </button>
          <label className="text-sm text-muted">
            <span className="sr-only">How long</span>
            <select
              name="minutes"
              value={show.minutes}
              onChange={(e) => setShow({ minutes: Number(e.target.value) })}
              className="cursor-pointer appearance-none rounded-md bg-transparent px-1 py-1 underline decoration-dotted underline-offset-4 hover:text-foreground"
            >
              {SHOW_DURATIONS.map((d) => (
                <option key={d.minutes} value={d.minutes}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          {result?.ok === false && <p className="basis-full text-sm text-busy">{result.error}</p>}
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
      className={`overflow-hidden rounded-lg border-2 bg-[#0b0b0c] transition hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${
        checked ? "border-transparent ring-2 ring-foreground ring-offset-2 ring-offset-card" : "border-transparent"
      }`}
    >
      <span className="flex aspect-[6/5] items-center justify-center">
        {gif ? (
          // eslint-disable-next-line @next/next/no-img-element -- animated GIFs, already sized
          <img src={gif.src} alt="" loading="lazy" className="max-h-full max-w-full" />
        ) : (
          <span className="text-lg font-semibold text-white/80">Aa</span>
        )}
      </span>
    </button>
  );
}
