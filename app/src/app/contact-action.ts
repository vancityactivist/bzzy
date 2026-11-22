"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { takeLimit } from "@/lib/api-limits";
import { hashToken } from "@/lib/device-token";
import { mailConfigured, sendMail } from "@/lib/mail";
import { contactEmail } from "@/lib/mail-templates";
import { verifyTurnstile } from "@/lib/turnstile";

// The contact form on the landing page. Mail goes to hello@bzzy.ca, which Cloudflare
// Email Routing forwards on (docs/email.md). Spam guards: a hidden field people don't
// fill in, a few messages a minute per address, length caps, and a Cloudflare Turnstile
// check (lib/turnstile.ts) once its keys are set.

export type ContactResult = { ok: true } | { ok: false; error: string } | null;

const CONTACT_TO = process.env.CONTACT_TO || "hello@bzzy.ca";

const contactInput = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  message: z.string().trim().min(5).max(4000),
  website: z.string().max(0), // the honeypot
});

export async function sendContactAction(_prev: ContactResult, formData: FormData): Promise<ContactResult> {
  const parsed = contactInput.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    message: formData.get("message") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "website") return { ok: true }; // a bot; let it think it worked
    if (field === "email") return { ok: false, error: "That email address doesn't look right." };
    if (field === "message") return { ok: false, error: "Write a message (up to 4,000 characters)." };
    return { ok: false, error: "Add your name." };
  }
  if (!mailConfigured()) return { ok: false, error: "The form isn't working right now. Email hello@bzzy.ca instead." };

  const h = await headers();
  const ip = h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await takeLimit("contact", hashToken(ip).slice(0, 16));
  if (!limit.ok) return { ok: false, error: "That's a few messages in a row. Try again in a minute." };

  const token = formData.get("cf-turnstile-response");
  const human = await verifyTurnstile(typeof token === "string" ? token : "", ip, "contact");
  if (!human.ok) {
    if (human.reason === "unreachable") return { ok: false, error: "We couldn't check you're human. Try again, or email hello@bzzy.ca." };
    return { ok: false, error: "The human check didn't pass. Give it a moment and send again." };
  }

  const sent = await sendMail(CONTACT_TO, contactEmail(parsed.data), { replyTo: parsed.data.email });
  if (!sent.ok) return { ok: false, error: "That didn't send. Try again, or email hello@bzzy.ca." };
  return { ok: true };
}
