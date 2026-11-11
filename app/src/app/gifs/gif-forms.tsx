"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";

import { deleteGifAction, type GifUploadResult, uploadGifAction } from "../actions";

const MAX_BYTES = 4 * 1024 * 1024;

export function UploadGifForm() {
  const [state, action, pending] = useActionState<GifUploadResult, FormData>(uploadGifAction, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="file"
          type="file"
          required
          accept="image/gif,image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.setCustomValidity(f && f.size > MAX_BYTES ? "That file is over 4 MB." : "");
            e.target.reportValidity();
          }}
          className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-background file:px-3 file:py-1.5"
        />
        <input
          name="name"
          maxLength={60}
          placeholder="Name (optional)"
          className="rounded-md border border-line bg-background px-3 py-2 text-sm sm:w-40"
        />
        <button
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
      <p className="text-xs text-muted">GIF, PNG, JPEG or WebP, up to 4 MB.</p>
      {state?.ok === false && <p className="text-sm text-busy">{state.error}</p>}
    </form>
  );
}

export function DeleteGifButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this GIF? Devices using it go back to the built-in one.")) start(() => deleteGifAction(id));
      }}
      className="rounded-md border border-line px-2 py-1 text-xs text-busy hover:bg-card disabled:opacity-50"
    >
      Delete
    </button>
  );
}
