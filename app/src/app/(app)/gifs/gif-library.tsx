"use client";

// The GIF library: built to stay quick with hundreds of GIFs.
//
// - The light is always beside the library. Pointing at a GIF (or moving through them
//   with the arrow keys) plays it there, full screen, the way Show now puts it up.
// - With no search or filter, GIFs sit on shelves that scroll sideways (Favourites,
//   Recently shown, On your lights, Yours, each team's, Built in), each with "See all".
// - Search (press /), filter chips, a size slider, rename, favourites, select-to-delete
//   and dropping several files at once to upload them.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteGifsAction, renameGifAction, setFavouriteAction, uploadGifAction } from "@/app/actions";
import { DevicePreview } from "@/components/device-preview";
import { CheckIcon, ImageIcon, PencilIcon, PlayIcon, PlusIcon, SearchIcon, StarIcon, TrashIcon, UploadIcon, XIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { ScreenView } from "@/lib/screen";

export type LibraryItem = {
  choice: string; // "asset:<id>" | "builtin:<id>"
  id: string | null; // the upload's id; null for a built-in GIF
  name: string;
  src: string;
  source: "mine" | "team" | "builtin";
  team: string | null; // the shared team an upload belongs to
  bytes: number;
  madeFor: string | null; // a built-in GIF drawn for one status
  addedAt: number; // ms; 0 for built-in
  editable: boolean; // this person may rename or delete it
  usedBy: string[]; // "Desk light · Busy"
  favourite: boolean;
  lastShownAt: number; // unix seconds, 0 = never
};

type Filter = "all" | "favourites" | "recent" | "used" | "mine" | "team" | "builtin" | "unused";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "favourites", label: "Favourites" },
  { id: "recent", label: "Recently shown" },
  { id: "used", label: "On your lights" },
  { id: "mine", label: "Yours" },
  { id: "team", label: "Team" },
  { id: "builtin", label: "Built in" },
  { id: "unused", label: "Unused" },
];

// The size slider sets the tile width in px, anywhere in this range.
const MIN_SIZE = 72;
const MAX_SIZE = 220;
const DEFAULT_SIZE = 120;
const SIZE_KEY = "bzzy.gifTile";
const MAX_BYTES = 4 * 1024 * 1024;

// Show now with nothing but a GIF gets the whole screen (display.cpp openGif()).
const TRY_ON: ScreenView = { layout: "show-gif", status: "free", text: "", until: 0, online: true, notice: null };

const showHref = (choice: string) => `/?show=${encodeURIComponent(choice)}#show`;

function matches(item: LibraryItem, filter: Filter) {
  switch (filter) {
    case "all":
      return true;
    case "favourites":
      return item.favourite;
    case "recent":
      return item.lastShownAt > 0;
    case "used":
      return item.usedBy.length > 0;
    case "mine":
    case "team":
    case "builtin":
      return item.source === filter;
    case "unused":
      return item.usedBy.length === 0 && item.lastShownAt === 0 && !item.favourite;
  }
}

function sortFor(filter: Filter) {
  if (filter === "recent") return (a: LibraryItem, b: LibraryItem) => b.lastShownAt - a.lastShownAt;
  return (a: LibraryItem, b: LibraryItem) => Number(b.favourite) - Number(a.favourite) || b.addedAt - a.addedAt;
}

export function GifLibrary({ items: initial, add }: { items: LibraryItem[]; add: React.ReactNode }) {
  const router = useRouter();
  // Optimistic edits (favourite, rename, delete), on top of what the server sent.
  const [edits, setEdits] = useState<Record<string, Partial<LibraryItem> & { gone?: boolean }>>({});
  const items = useMemo(
    () => initial.map((i) => ({ ...i, ...edits[i.choice] })).filter((i) => !(edits[i.choice] as { gone?: boolean } | undefined)?.gone),
    [initial, edits],
  );
  const edit = useCallback((choice: string, patch: Partial<LibraryItem> & { gone?: boolean }) => {
    setEdits((e) => ({ ...e, [choice]: { ...e[choice], ...patch } }));
  }, []);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  // The size is a per-person convenience: remember it on this browser.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIZE_KEY);
      const saved = raw === null ? NaN : Number(raw);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      if (saved >= MIN_SIZE && saved <= MAX_SIZE) setSize(saved);
    } catch {}
  }, []);
  const pickSize = (n: number) => {
    setSize(n);
    try {
      localStorage.setItem(SIZE_KEY, String(n));
    } catch {}
  };

  // "/" jumps to search, the way most libraries do.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const browsing = !q && filter === "all";
  const listed = useMemo(
    () =>
      items
        .filter((i) => matches(i, filter) && (!q || `${i.name} ${i.team ?? ""} ${i.madeFor ?? ""}`.toLowerCase().includes(q)))
        .sort(sortFor(filter)),
    [items, filter, q],
  );
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, items.filter((i) => matches(i, f.id)).length])) as Record<Filter, number>, [items]);

  const shelves = useMemo(() => {
    const by = (f: Filter) => items.filter((i) => matches(i, f)).sort(sortFor(f));
    const teams = [...new Set(items.filter((i) => i.source === "team").map((i) => i.team!))];
    return [
      { title: "Favourites", filter: "favourites" as Filter, items: by("favourites"), hint: "Star a GIF to keep it here." },
      { title: "Recently shown", filter: "recent" as Filter, items: by("recent").slice(0, 24) },
      { title: "On your lights", filter: "used" as Filter, items: by("used") },
      { title: "Yours", filter: "mine" as Filter, items: by("mine"), add: true },
      ...teams.map((t) => ({ title: `Shared with ${t}`, filter: "team" as Filter, items: by("team").filter((i) => i.team === t) })),
      { title: "Built in", filter: "builtin" as Filter, items: by("builtin") },
    ].filter((s) => s.items.length > 0 || s.add || s.filter === "favourites");
  }, [items]);

  const current = items.find((i) => i.choice === (hover ?? pinned)) ?? items.find((i) => i.choice === pinned) ?? listed[0] ?? items[0] ?? null;

  // ---- dropping files anywhere on the library uploads them, several at once ----
  const [drag, setDrag] = useState(false);
  const [uploads, setUploads] = useState<{ name: string; state: "waiting" | "uploading" | "done" | "failed"; error?: string }[]>([]);
  const uploadFiles = async (files: File[]) => {
    const queue = files.map((f) => ({
      file: f,
      error:
        !/^image\/(gif|png|jpeg|webp)$/.test(f.type) ? "Not a GIF, PNG, JPEG or WebP" : f.size > MAX_BYTES ? "Over 4 MB" : undefined,
    }));
    setUploads(queue.map((u) => ({ name: u.file.name, state: u.error ? "failed" : "waiting", error: u.error })));
    let added = 0;
    for (const [n, u] of queue.entries()) {
      if (u.error) continue;
      setUploads((all) => all.map((x, i) => (i === n ? { ...x, state: "uploading" } : x)));
      const fd = new FormData();
      fd.set("file", u.file);
      fd.set("name", u.file.name.replace(/\.[^.]+$/, "").slice(0, 60));
      const r = await uploadGifAction(null, fd);
      setUploads((all) => all.map((x, i) => (i === n ? { ...x, state: r?.ok ? "done" : "failed", error: r?.ok ? undefined : r?.error } : x)));
      if (r?.ok) added++;
    }
    if (added) toast.success(added === 1 ? "Added 1 GIF" : `Added ${added} GIFs`);
    router.refresh();
  };

  // ---- select and delete ----
  const [deleting, startDelete] = useTransition();
  const toggle = (choice: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(choice)) next.delete(choice);
      else next.add(choice);
      return next;
    });
  const deletable = items.filter((i) => selected.has(i.choice) && i.editable);
  const [confirming, setConfirming] = useState(false);
  const deleteSelected = () => {
    if (!deletable.length) return;
    const n = deletable.length;
    startDelete(async () => {
      for (const i of deletable) edit(i.choice, { gone: true });
      await deleteGifsAction(deletable.map((i) => i.id!));
      setSelected(new Set());
      setSelecting(false);
      toast.success(n === 1 ? "Deleted 1 GIF" : `Deleted ${n} GIFs`);
    });
  };

  const favourite = (item: LibraryItem) => {
    edit(item.choice, { favourite: !item.favourite });
    void setFavouriteAction(item.choice, !item.favourite);
  };

  const tileProps = {
    size,
    selecting,
    selected,
    pinned: current?.choice ?? null,
    onHover: setHover,
    onPick: (choice: string) => (selecting ? toggle(choice) : setPinned(choice)),
    onShow: (choice: string) => router.push(showHref(choice)),
    onFavourite: favourite,
  };

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        // The Add panel's own drop box handles a file dropped on it (with a preview and a
        // name first); only a drop anywhere else uploads straight away.
        if (![...e.dataTransfer.types].includes("Files") || (e.target as HTMLElement).closest("[data-own-drop]")) {
          setDrag(false);
          return;
        }
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        if (e.defaultPrevented || !e.dataTransfer.files.length || (e.target as HTMLElement).closest("[data-own-drop]")) return;
        e.preventDefault();
        setDrag(false);
        void uploadFiles([...e.dataTransfer.files]);
      }}
    >
      {drag && (
        <div className="pointer-events-none absolute -inset-2 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-foreground bg-background/85 backdrop-blur-sm">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <UploadIcon />
            Drop to add them to your GIFs
          </p>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <TryOn
          item={current}
          onFavourite={favourite}
          onRename={async (item, name) => {
            const r = await renameGifAction(item.id!, name);
            if (r.ok) edit(item.choice, { name: r.name });
            return r.ok ? null : r.error;
          }}
        />

        <div className="min-w-0 space-y-5">
          {/* Toolbar: search, add, select; then filters and size. */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-48 flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={search}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setQuery("");
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      document.querySelector<HTMLElement>("[data-gif-tile]")?.focus();
                    }
                  }}
                  aria-label="Search your GIFs"
                  placeholder={`Search ${items.length} GIFs`}
                  className="pr-9 pl-9"
                />
                <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border px-1.5 text-[0.6875rem] text-muted-foreground max-sm:hidden">
                  /
                </kbd>
              </div>
              <Button variant={adding ? "outline" : "default"} onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
                {adding ? <XIcon /> : <PlusIcon />}
                {adding ? "Close" : "Add GIFs"}
              </Button>
              <Button
                variant="outline"
                aria-pressed={selecting}
                onClick={() => {
                  setSelecting((s) => !s);
                  setSelected(new Set());
                }}
              >
                {selecting ? "Done" : "Select"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="relative -mx-1 min-w-0 flex-1 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <ToggleGroup
                  type="single"
                  variant="pill"
                  size="sm"
                  spacing={1.5}
                  value={filter}
                  onValueChange={(v) => v && setFilter(v as Filter)}
                  aria-label="Show"
                >
                  {FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0 || f.id === filter).map((f) => (
                    <ToggleGroupItem key={f.id} value={f.id} className="shrink-0 gap-1.5 px-3">
                      {f.id === "favourites" && <StarIcon className="size-3.5" />}
                      {f.label}
                      {f.id !== "all" && <span className="text-xs opacity-60">{counts[f.id]}</span>}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <span aria-hidden className="size-2.5 rounded-sm border border-current" />
                <Slider
                  min={MIN_SIZE}
                  max={MAX_SIZE}
                  step={1}
                  value={[size]}
                  onValueChange={([n]) => pickSize(n)}
                  aria-label="GIF size"
                  className="w-28"
                />
                <span aria-hidden className="size-4 rounded-sm border border-current" />
              </label>
            </div>
          </div>

          {adding && <div data-own-drop>{add}</div>}

          {uploads.length > 0 && <UploadList uploads={uploads} onClose={() => setUploads([])} />}

          {selecting && (
            <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 p-2.5 pl-4 shadow-card backdrop-blur max-lg:top-[4.5rem]">
              <p className="flex-1 text-sm">
                {selected.size === 0
                  ? "Tap GIFs to select them."
                  : `${selected.size} selected${deletable.length < selected.size ? ` · ${selected.size - deletable.length} you can't delete` : ""}`}
              </p>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set(listedOrAll(browsing, listed, items).filter((i) => i.editable).map((i) => i.choice)))}>
                Select all yours
              </Button>
              <Button size="sm" variant="destructive" disabled={!deletable.length || deleting} onClick={() => setConfirming(true)}>
                <TrashIcon />
                {deleting ? "Deleting…" : `Delete${deletable.length ? ` ${deletable.length}` : ""}`}
              </Button>
              <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {deletable.length === 1 ? "this GIF" : `${deletable.length} GIFs`}?</AlertDialogTitle>
                    <AlertDialogDescription>Lights using {deletable.length === 1 ? "it" : "them"} go back to the built-in ones.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={deleteSelected}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {browsing ? (
            <div className="space-y-7">
              {shelves.map((s) => (
                <Shelf
                  key={s.title}
                  title={s.title}
                  count={s.items.length}
                  onSeeAll={() => setFilter(s.filter)}
                  hint={s.items.length === 0 ? (s.hint ?? (s.add ? "Drop GIFs anywhere here, or press Add." : undefined)) : undefined}
                >
                  {s.add && <AddTile size={size} onClick={() => setAdding(true)} />}
                  {s.items.map((i) => (
                    <Tile key={i.choice} item={i} {...tileProps} />
                  ))}
                </Shelf>
              ))}
            </div>
          ) : listed.length === 0 ? (
            <EmptyState icon={<ImageIcon />} title={q ? `Nothing called “${query.trim()}”` : "Nothing here yet"}>
              {q ? "Try another word, or clear the search." : filter === "favourites" ? "Star a GIF to keep it here." : "Change the filter to see more."}
            </EmptyState>
          ) : (
            <section aria-label={FILTERS.find((f) => f.id === filter)?.label}>
              <p className="mb-3 text-sm text-muted-foreground">
                {listed.length} {listed.length === 1 ? "GIF" : "GIFs"}
                {filter !== "all" && (
                  <>
                    {" · "}
                    <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setFilter("all")}>
                      show all
                    </button>
                  </>
                )}
              </p>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, ${size}px)` }}>
                {listed.map((i) => (
                  <Tile key={i.choice} item={i} {...tileProps} fill />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const listedOrAll = (browsing: boolean, listed: LibraryItem[], all: LibraryItem[]) => (browsing ? all : listed);

// ---- the light beside the library ----

function TryOn({
  item,
  onFavourite,
  onRename,
}: {
  item: LibraryItem | null;
  onFavourite: (i: LibraryItem) => void;
  onRename: (i: LibraryItem, name: string) => Promise<string | null>;
}) {
  return (
    <section
      aria-label="Try it on your light"
      className="sticky top-0 z-10 -mx-4 border-b bg-background/90 px-4 py-3 backdrop-blur max-lg:pt-0 sm:-mx-6 sm:px-6 lg:top-20 lg:mx-0 lg:rounded-2xl lg:border lg:bg-card lg:p-5 lg:shadow-card"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 lg:grid-cols-1 lg:gap-y-4">
        <div className="flex justify-center max-lg:[zoom:0.42]">
          <DevicePreview view={TRY_ON} gifSrc={item?.src ?? null} scale={1} className="m-4 lg:m-0 lg:[zoom:0.85]" />
        </div>
        {item ? <Details item={item} key={item.choice} onFavourite={onFavourite} onRename={onRename} /> : <p className="text-sm text-muted-foreground">No GIFs yet.</p>}
      </div>
    </section>
  );
}

function Details({
  item,
  onFavourite,
  onRename,
}: {
  item: LibraryItem;
  onFavourite: (i: LibraryItem) => void;
  onRename: (i: LibraryItem, name: string) => Promise<string | null>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const meta = [
    item.source === "builtin" ? "Built in" : item.team ? `Shared with ${item.team}` : "Yours",
    item.madeFor ? `made for ${item.madeFor.toLowerCase()}` : null,
    `${Math.max(1, Math.round(item.bytes / 1024))} KB`,
  ].filter(Boolean);

  return (
    <div className="min-w-0 space-y-2">
      {renaming ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "");
            startSave(async () => {
              const err = await onRename(item, name);
              setError(err);
              if (!err) setRenaming(false);
            });
          }}
        >
          <Input
            name="name"
            defaultValue={item.name}
            maxLength={60}
            autoFocus
            aria-label="GIF name"
            onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <Button size="icon-sm" disabled={saving} aria-label="Save name">
            <CheckIcon />
          </Button>
        </form>
      ) : (
        <div className="flex min-w-0 items-center gap-1">
          <p className="min-w-0 truncate font-semibold" title={item.name}>
            {item.name}
          </p>
          {item.editable && (
            <Button size="icon-sm" variant="ghost" aria-label={`Rename ${item.name}`} title="Rename" onClick={() => setRenaming(true)} className="shrink-0">
              <PencilIcon className="size-3.5" />
            </Button>
          )}
        </div>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <p className="truncate text-xs text-muted-foreground">{meta.join(" · ")}</p>
      {item.usedBy.length > 0 && (
        <div className="flex flex-wrap gap-1 max-lg:hidden">
          {item.usedBy.slice(0, 4).map((u) => (
            <Badge key={u} variant="muted">
              {u}
            </Badge>
          ))}
          {item.usedBy.length > 4 && <Badge variant="muted">+{item.usedBy.length - 4} more</Badge>}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button asChild size="sm">
          <a href={showHref(item.choice)}>
            <PlayIcon />
            Show now
          </a>
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-pressed={item.favourite}
          aria-label={item.favourite ? "Remove from favourites" : "Add to favourites"}
          title={item.favourite ? "Favourite" : "Add to favourites"}
          onClick={() => onFavourite(item)}
        >
          <StarIcon className={cn("size-4", item.favourite && "fill-current text-away")} />
        </Button>
      </div>
    </div>
  );
}

// ---- shelves and tiles ----

function Shelf({ title, count, onSeeAll, hint, children }: { title: string; count: number; onSeeAll: () => void; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold tracking-tight">
          {title} {count > 0 && <span className="text-sm font-normal text-muted-foreground">{count}</span>}
        </h2>
        {count > 6 && (
          <button type="button" onClick={onSeeAll} className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            See all
          </button>
        )}
      </div>
      {/* `relative` keeps anything absolutely placed inside the scroller from widening the page. */}
      <div className="relative -mx-1 flex snap-x scroll-px-1 gap-3 overflow-x-auto px-1 pt-1 pb-2 [scrollbar-width:thin]">
        {children}
        {hint && <p className="self-center px-2 text-sm text-muted-foreground">{hint}</p>}
      </div>
    </section>
  );
}

function AddTile({ size, onClick }: { size: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: size }}
      className="flex aspect-square shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong/70 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
    >
      <PlusIcon className="size-5" />
      <span className="text-xs font-medium">Add</span>
    </button>
  );
}

// Arrow keys move between tiles by where they sit on screen, so the same keys work on
// the shelves (left and right along one, up and down between them) and in the grid.
function moveFocus(from: HTMLElement, key: string) {
  const tiles = [...document.querySelectorAll<HTMLElement>("[data-gif-tile]")];
  const r = from.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const t of tiles) {
    if (t === from) continue;
    const b = t.getBoundingClientRect();
    const dx = b.left + b.width / 2 - cx;
    const dy = b.top + b.height / 2 - cy;
    const along = key === "ArrowLeft" ? -dx : key === "ArrowRight" ? dx : key === "ArrowUp" ? -dy : dy;
    const across = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 4) continue;
    // Stay in the same row (or column) when there's one; otherwise the nearest.
    const score = across * 4 + along;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best) {
    best.focus();
    best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }
}

function Tile({
  item,
  size,
  fill = false,
  selecting,
  selected,
  pinned,
  onHover,
  onPick,
  onShow,
  onFavourite,
}: {
  item: LibraryItem;
  size: number;
  fill?: boolean; // in the grid it fills its column; on a shelf it has a fixed width
  selecting: boolean;
  selected: Set<string>;
  pinned: string | null;
  onHover: (choice: string | null) => void;
  onPick: (choice: string) => void;
  onShow: (choice: string) => void;
  onFavourite: (item: LibraryItem) => void;
}) {
  const isSelected = selected.has(item.choice);
  return (
    <div
      className={cn("group relative shrink-0 snap-start", !fill && "w-[var(--w)]")}
      style={fill ? undefined : ({ "--w": `${size}px` } as React.CSSProperties)}
      onMouseEnter={() => onHover(item.choice)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        data-gif-tile
        aria-label={item.name}
        aria-pressed={selecting ? isSelected : pinned === item.choice}
        title={item.name}
        onClick={() => onPick(item.choice)}
        onFocus={() => onHover(item.choice)}
        onBlur={() => onHover(null)}
        onKeyDown={(e) => {
          if (e.key.startsWith("Arrow")) {
            e.preventDefault();
            moveFocus(e.currentTarget, e.key);
          } else if (e.key === "Enter" && !selecting) {
            e.preventDefault();
            onShow(item.choice);
          } else if (e.key.toLowerCase() === "f") {
            onFavourite(item);
          }
        }}
        className={cn(
          "relative block aspect-square w-full overflow-hidden rounded-xl bg-[#0b0b0c] transition-[box-shadow,transform] duration-150 hover:ring-2 hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground motion-safe:hover:scale-[1.02]",
          (selecting ? isSelected : pinned === item.choice) && "ring-2 ring-foreground ring-offset-2 ring-offset-background hover:ring-foreground",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- animated GIFs, already sized */}
        <img src={item.src} alt="" loading="lazy" decoding="async" className="absolute inset-0 m-auto max-h-full max-w-full" />
        <span className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80 to-transparent px-2 pt-5 pb-1.5 text-left text-[0.6875rem] font-medium text-white">
          {item.name}
        </span>
        {selecting && (
          <span
            className={cn(
              "absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full border-2",
              isSelected ? "border-foreground bg-foreground text-background" : "border-white/80 bg-black/30",
              !item.editable && "opacity-40",
            )}
          >
            {isSelected && <CheckIcon className="size-3" strokeWidth={3} />}
          </span>
        )}
      </button>
      {!selecting && (
        <>
          <button
            type="button"
            aria-label={item.favourite ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`}
            aria-pressed={item.favourite}
            title={item.favourite ? "Favourite" : "Add to favourites"}
            onClick={() => onFavourite(item)}
            className={cn(
              "absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-opacity hover:bg-black/70",
              item.favourite ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-lg:hidden",
            )}
          >
            <StarIcon className={cn("size-3.5", item.favourite && "fill-current text-away")} />
          </button>
          <a
            href={showHref(item.choice)}
            aria-label={`Show ${item.name} now`}
            title="Show it now"
            className="absolute bottom-7 right-1 flex size-7 items-center justify-center rounded-full bg-white text-black opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-lg:hidden"
          >
            <PlayIcon className="size-3.5 fill-current" />
          </a>
        </>
      )}
    </div>
  );
}

function UploadList({
  uploads,
  onClose,
}: {
  uploads: { name: string; state: "waiting" | "uploading" | "done" | "failed"; error?: string }[];
  onClose: () => void;
}) {
  const busy = uploads.some((u) => u.state === "waiting" || u.state === "uploading");
  const done = uploads.filter((u) => u.state === "done").length;
  return (
    <div className="rounded-xl border bg-card p-3 shadow-card" role="status">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{busy ? `Adding ${uploads.length} GIFs…` : `Added ${done} of ${uploads.length}`}</p>
        {!busy && (
          <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
            <XIcon />
          </Button>
        )}
      </div>
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
        {uploads.map((u, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={cn("size-2 shrink-0 rounded-full", u.state === "done" ? "bg-free" : u.state === "failed" ? "bg-busy" : u.state === "uploading" ? "animate-pulse bg-away" : "bg-line-strong")} />
            <span className="min-w-0 flex-1 truncate">{u.name}</span>
            {u.error && <span className="shrink-0 text-xs text-destructive">{u.error}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
