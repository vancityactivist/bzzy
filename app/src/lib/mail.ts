import "server-only";

import type { Mail } from "./mail-templates";

// Sends email through Resend's HTTP API (docs/email.md). Plain fetch, no SDK: it's
// one endpoint. Without RESEND_API_KEY (local dev, previews) nothing is sent and
// callers fall back to whatever they did before email existed, like showing a link.

const DEFAULT_FROM = "bzzy <noreply@bzzy.ca>";

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendMail(to: string, mail: Mail, opts: { replyTo?: string | null; idempotencyKey?: string } = {}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Email isn't set up on this server." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || DEFAULT_FROM,
        to: [to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok || !body?.id) {
      // Resend's message is for us, not the person clicking; log it, say less.
      console.error("[mail] resend error", res.status, body?.message);
      return { ok: false, error: "The email service said no. Try again in a bit." };
    }
    return { ok: true, id: body.id };
  } catch (e) {
    console.error("[mail] send failed", e);
    return { ok: false, error: "Couldn't reach the email service." };
  }
}
