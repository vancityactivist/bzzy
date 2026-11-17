"use client";

import { useActionState } from "react";

import { type ContactResult, sendContactAction } from "@/app/contact-action";

// The "Say hello" form near the bottom of the landing page. Styled by the landing kit's
// .form and .field classes, so it matches the rest of the page.
export function LandingContact() {
  const [state, action, pending] = useActionState<ContactResult, FormData>(sendContactAction, null);

  if (state?.ok) {
    return (
      <p className="t-lead" role="status">
        Thanks, that&apos;s sent. You&apos;ll hear back by email.
      </p>
    );
  }

  return (
    <form action={action} className="form">
      <label className="field" htmlFor="contact-name">
        Name
        <input id="contact-name" name="name" required maxLength={80} autoComplete="name" />
      </label>
      <label className="field" htmlFor="contact-email">
        Email
        <input id="contact-email" name="email" type="email" required maxLength={254} autoComplete="email" />
      </label>
      <label className="field field--full" htmlFor="contact-message">
        Message
        <textarea id="contact-message" name="message" required minLength={5} maxLength={4000} rows={5} />
      </label>
      {/* For bots only: hidden from people and screen readers. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="form__status" role="alert">
        {state?.ok === false ? state.error : ""}
      </p>
      <div className="btn-row">
        <button className="btn btn--primary" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
