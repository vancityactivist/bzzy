"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";

import { CheckIcon, LinkIcon, TrashIcon, UploadIcon } from "@/components/icons";
import { Button, Card, CardHeader, cx, Field, Input } from "@/components/ui";

import { deleteGifAction, type GifUploadResult, importGifLinkAction, uploadGifAction } from "../actions";

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

export function UploadGifForm() {
  const [state, action, pending] = useActionState<GifUploadResult, FormData>(uploadGifAction, null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field label="File" htmlFor={`${id}-file`} hint="GIF, PNG, JPEG or WebP, up to 4 MB." className="min-w-0 flex-1">
          <Input
            id={`${id}-file`}
            name="file"
            type="file"
            required
            accept="image/gif,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.setCustomValidity(f && f.size > MAX_BYTES ? "That file is over 4 MB." : "");
              e.target.reportValidity();
            }}
          />
        </Field>
        <Field label="Name" htmlFor={`${id}-name`} className="sm:w-44">
          <Input id={`${id}-name`} name="name" maxLength={60} placeholder="Optional" />
        </Field>
        <Button variant="primary" disabled={pending} className="sm:mt-[1.625rem]">
          <UploadIcon />
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>
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
