"use client";

import Script from "next/script";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { type ContactResult, sendContactAction } from "@/app/contact-action";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile";

import { Button, Input, Label, Textarea } from "./ui";

// The "Say hello" form near the bottom of the landing page, built from the app's own controls
// (components/ui.tsx), so it matches every other form on the site.
export function LandingContact() {
  const [state, action, pending] = useActionState<ContactResult, FormData>(sendContactAction, null);
  const { widgetRef, ready, renderWidget, giveUp } = useTurnstile(state);

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
      {/* Cloudflare Turnstile: invisible unless Cloudflare wants a click. It adds the
          cf-turnstile-response field the server checks. */}
      {TURNSTILE_SITE_KEY ? <div ref={widgetRef} className="empty:hidden sm:col-span-2" /> : null}
      <p className="text-sm text-danger empty:hidden sm:col-span-2" role="alert">
        {state?.ok === false ? state.error : ""}
      </p>
      <div className="sm:col-span-2">
        <Button variant="primary" type="submit" disabled={pending || !ready} className="h-12 px-5 text-[15px]">
          {pending ? "Sending…" : "Send message"}
        </Button>
        {!ready ? <span className="ml-4 text-sm text-muted">Checking you&apos;re human…</span> : null}
      </div>
      {TURNSTILE_SITE_KEY ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onReady={renderWidget}
          onError={giveUp}
        />
      ) : null}
    </form>
  );
}

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Renders the widget once its script is in, and tracks whether there's a fresh token.
// Tokens are single-use, so a failed send gets a new one.
function useTurnstile(state: ContactResult) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [ready, setReady] = useState(!TURNSTILE_SITE_KEY);

  const render = useCallback(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current || !window.turnstile || id.current) return;
    id.current = window.turnstile.render(ref.current, {
      sitekey: TURNSTILE_SITE_KEY,
      action: "contact",
      theme: "light",
      appearance: "interaction-only",
      callback: () => setReady(true),
      "expired-callback": () => setReady(false),
      // A widget error (blocked script, old browser): let the send go and let the
      // server's answer explain, rather than a button that never wakes up.
      "error-callback": () => setReady(true),
    });
  }, []);

  useEffect(() => {
    if (state?.ok === false && id.current && window.turnstile) {
      setReady(false);
      window.turnstile.reset(id.current);
    }
  }, [state]);

  useEffect(
    () => () => {
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    },
    [],
  );

  const giveUp = useCallback(() => setReady(true), []);

  return { widgetRef: ref, ready, renderWidget: render, giveUp };
}
