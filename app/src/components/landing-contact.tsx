"use client";

import { useActionState } from "react";

import { type ContactResult, sendContactAction } from "@/app/contact-action";

import { Button, Input, Label, Textarea } from "./ui";

// The "Say hello" form near the bottom of the landing page, built from the app's own controls
// (components/ui.tsx), so it matches every other form on the site.
export function LandingContact() {
  const [state, action, pending] = useActionState<ContactResult, FormData>(sendContactAction, null);

  if (state?.ok) {
    return (
      <p className="text-lg text-foreground" role="status">
        Thanks, that&apos;s sent. You&apos;ll hear back by email.
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-name">Name</Label>
        <Input id="contact-name" name="name" required maxLength={80} autoComplete="name" className="h-12" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-email">Email</Label>
        <Input id="contact-email" name="email" type="email" required maxLength={254} autoComplete="email" className="h-12" />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="contact-message">Message</Label>
        <Textarea id="contact-message" name="message" required minLength={5} maxLength={4000} rows={5} />
      </div>
      {/* For bots only: hidden from people and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[10000px] size-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="text-sm text-danger empty:hidden sm:col-span-2" role="alert">
        {state?.ok === false ? state.error : ""}
      </p>
      <div className="sm:col-span-2">
        <Button variant="primary" type="submit" disabled={pending} className="h-12 px-5 text-[15px]">
          {pending ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
