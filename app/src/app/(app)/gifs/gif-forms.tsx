"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";

import { LinkIcon, TrashIcon, UploadIcon } from "@/components/icons";
import { DevicePreview } from "@/components/device-preview";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { viewFor } from "@/lib/screen";

import { deleteGifAction, type GifUploadResult, importGifLinkAction, uploadGifAction } from "@/app/actions";

const MAX_BYTES = 4 * 1024 * 1024;

// A failure stays next to the form; success is a toast, since the form has already reset.
function Result({ state }: { state: GifUploadResult }) {
  if (state?.ok === false)
    return (
      <p className="text-sm text-destructive" role="alert">
        {state.error}
      </p>
    );
  return null;
}

/** The "Add a GIF" card: a two-tab switch between uploading a file and pasting a GIPHY or Tenor link. */
export function AddGifCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>Add a GIF</h2>
        </CardTitle>
        <CardDescription>Uploads are resized to fit the screen (240 × 200).</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="upload" className="gap-5">
          <TabsList aria-label="How to add a GIF" className="max-w-full">
            <TabsTrigger value="upload">
              <UploadIcon />
              Upload a file
            </TabsTrigger>
            <TabsTrigger value="link">
              <LinkIcon />
              GIPHY or Tenor link
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
            <UploadGifForm />
          </TabsContent>
          <TabsContent value="link">
            <p className="mb-4 text-sm text-muted-foreground">
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
          </TabsContent>
        </Tabs>
      </CardContent>
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
      toast.success("Added to your GIFs");
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
          className={cn(
            "flex min-h-40 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors",
            over ? "border-foreground bg-muted" : "border-line-strong hover:border-foreground/40 hover:bg-muted/60",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <UploadIcon className="size-5" />
          </span>
          <span className="text-sm font-medium">{preview ? "Pick a different file" : "Drop a GIF here, or tap to pick one"}</span>
          <span className="text-xs text-muted-foreground">GIF, PNG, JPEG or WebP, up to 4 MB</span>
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
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field className="min-w-0 flex-1 gap-1.5">
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input id={`${id}-name`} name="name" maxLength={60} defaultValue={preview.name.slice(0, 60)} key={preview.src} />
          </Field>
          <Button disabled={pending}>
            <UploadIcon />
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      )}
      <Result state={state} />
    </form>
  );
}

export function GifLinkForm() {
  const [state, action, pending] = useActionState<GifUploadResult, FormData>(importGifLinkAction, null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (!state?.ok) return;
    form.current?.reset();
    toast.success("Added to your GIFs");
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field className="min-w-0 flex-1 gap-1.5">
          <FieldLabel htmlFor={`${id}-link`}>Link</FieldLabel>
          <Input
            id={`${id}-link`}
            name="link"
            type="url"
            required
            inputMode="url"
            placeholder="https://giphy.com/gifs/… or https://tenor.com/view/…"
          />
        </Field>
        <Field className="gap-1.5 sm:w-44">
          <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
          <Input id={`${id}-name`} name="name" maxLength={60} placeholder="Optional" />
        </Field>
        <Button disabled={pending} className="sm:mt-[1.625rem]">
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <Result state={state} />
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
      className="hover:text-destructive"
    >
      <TrashIcon />
    </Button>
  );
}
