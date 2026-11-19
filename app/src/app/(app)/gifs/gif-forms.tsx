"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";

import { CheckIcon, LinkIcon, TrashIcon, UploadIcon } from "@/components/icons";
import { DevicePreview } from "@/components/device-preview";
import { Button, Card, CardHeader, cx, Field, Input } from "@/components/ui";
import { viewFor } from "@/lib/screen";

import { deleteGifAction, type GifUploadResult, importGifLinkAction, uploadGifAction } from "@/app/actions";

const MAX_BYTES = 4 * 1024 * 1024;

function Result({ state, success }: { state: GifUploadResult; success: string }) {
  if (state?.ok === false)
    return (
      <p className="text-sm text-danger" role="alert">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p className="flex items-center gap-1.5 text-sm" role="status">
        <CheckIcon className="size-4 text-free" />
        {success}
      </p>
    );
  return null;
}

/** The "Add a GIF" card: a two-tab switch between uploading a file and pasting a GIPHY or Tenor link. */
export function AddGifCard() {
  const [tab, setTab] = useState<"upload" | "link">("upload");
  const base = useId();
  const tabs = [
    { id: "upload" as const, label: "Upload a file", icon: <UploadIcon /> },
    { id: "link" as const, label: "GIPHY or Tenor link", icon: <LinkIcon /> },
  ];
  return (
    <Card>
      <CardHeader title="Add a GIF" description="Uploads are resized to fit the screen (240 × 200)." />
      <div role="tablist" aria-label="How to add a GIF" className="mt-4 inline-flex gap-1 rounded-xl bg-subtle p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cx(
              "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors [&_svg]:size-4",
              tab === t.id ? "bg-card text-foreground shadow-card" : "text-muted hover:text-foreground",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        <div role="tabpanel" id={`${base}-panel-upload`} aria-labelledby={`${base}-tab-upload`} hidden={tab !== "upload"}>
          <UploadGifForm />
        </div>
        <div role="tabpanel" id={`${base}-panel-link`} aria-labelledby={`${base}-tab-link`} hidden={tab !== "link"}>
          <p className="mb-4 text-sm text-muted">
            Find a GIF on{" "}
            <a href="https://giphy.com" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">
              giphy.com
            </a>{" "}
            or{" "}
            <a href="https://tenor.com" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">
              tenor.com
            </a>
            , or in the GIPHY app on your phone. Tap Share, then Copy link, and paste it here.
          </p>
          <GifLinkForm />
        </div>
      </div>
    </Card>
  );
}

// Drop a file anywhere on the box (or tap it to pick one): it shows straight away on a
// light, the way an upload is fitted to the 240 × 200 GIF area, before you upload it.
export function UploadGifForm() {
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [state, action, pending] = useActionState<GifUploadResult, FormData>(async (prev, fd) => {
    const r = await uploadGifAction(prev, fd);
    if (r?.ok) {
      // Uploaded: back to an empty drop box for the next one.
      form.current?.reset();
      setPreview(null);
    }
    return r;
  }, null);
  useEffect(() => {
    const src = preview?.src;
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [preview?.src]);

  const take = (f: File | undefined) => {
    if (!f) return setPreview(null);
    if (!/^image\/(gif|png|jpeg|webp)$/.test(f.type)) {
      setError("That isn't a GIF, PNG, JPEG or WebP.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`${f.name} is over 4 MB. Try a smaller one.`);
      return;
    }
    setError(null);
    setPreview({ src: URL.createObjectURL(f), name: f.name.replace(/\.[^.]+$/, "") });
  };

  return (
    <form ref={form} action={action} className="space-y-4">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <label
          htmlFor={`${id}-file`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (!f || !input.current) return;
            // Put the dropped file in the form's input, so the upload sends it.
            const dt = new DataTransfer();
            dt.items.add(f);
            input.current.files = dt.files;
            take(f);
          }}
          className={cx(
            "flex min-h-40 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors",
            over ? "border-foreground bg-subtle" : "border-line-strong hover:border-foreground/40 hover:bg-subtle/60",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-subtle text-muted">
            <UploadIcon className="size-5" />
          </span>
          <span className="text-sm font-medium">{preview ? "Pick a different file" : "Drop a GIF here, or tap to pick one"}</span>
          <span className="text-xs text-muted">GIF, PNG, JPEG or WebP, up to 4 MB</span>
          <input
            ref={input}
            id={`${id}-file`}
            name="file"
            type="file"
            required
            accept="image/gif,image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => take(e.target.files?.[0])}
          />
        </label>
        {preview && (
          <div className="flex justify-center sm:block">
            <DevicePreview
              view={viewFor({ status: "free", text: "", until: 0 })}
              gifSrc={preview.src}
              gifFit
              scale={0.5}
              className="m-3"
            />
          </div>
        )}
      </div>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Name" htmlFor={`${id}-name`} className="min-w-0 flex-1">
            <Input id={`${id}-name`} name="name" maxLength={60} defaultValue={preview.name.slice(0, 60)} key={preview.src} />
          </Field>
          <Button variant="primary" disabled={pending}>
            <UploadIcon />
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      )}
      <Result state={state} success="Added to your GIFs." />
    </form>
  );
}

export function GifLinkForm() {
  const [state, action, pending] = useActionState<GifUploadResult, FormData>(importGifLinkAction, null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field label="Link" htmlFor={`${id}-link`} className="min-w-0 flex-1">
          <Input
            id={`${id}-link`}
            name="link"
            type="url"
            required
            inputMode="url"
            placeholder="https://giphy.com/gifs/… or https://tenor.com/view/…"
          />
        </Field>
        <Field label="Name" htmlFor={`${id}-name`} className="sm:w-44">
          <Input id={`${id}-name`} name="name" maxLength={60} placeholder="Optional" />
        </Field>
        <Button variant="primary" disabled={pending} className="sm:mt-[1.625rem]">
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <Result state={state} success="Added to your GIFs." />
    </form>
  );
}

export function DeleteGifButton({ id, name }: { id: string; name?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={name ? `Delete ${name}` : "Delete GIF"}
      title="Delete"
      onClick={() => {
        if (confirm("Delete this GIF? Devices using it go back to the built-in one.")) start(() => deleteGifAction(id));
      }}
      className="hover:text-danger"
    >
      <TrashIcon />
    </Button>
  );
}
