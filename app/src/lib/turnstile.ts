// Cloudflare Turnstile, the captcha on the landing page's contact form (docs/email.md).
// The widget in the browser hands the form a one-time token; the server checks it with
// Cloudflare's Siteverify before sending anything. Both keys unset = no captcha (local dev,
// previews without keys); the honeypot and rate limit still apply.

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export type TurnstileCheck = { ok: true } | { ok: false; reason: "missing" | "rejected" | "unreachable" };

type SiteverifyBody = { success?: boolean; action?: string; hostname?: string; "error-codes"?: string[] };

// Pure part, unit-tested: does Cloudflare's answer let this message through?
export function judgeSiteverify(body: SiteverifyBody, expectedAction: string): TurnstileCheck {
  if (!body.success) return { ok: false, reason: "rejected" };
  if (body.action && body.action !== expectedAction) return { ok: false, reason: "rejected" };
  return { ok: true };
}

export async function verifyTurnstile(
  token: string,
  ip: string | null,
  expectedAction: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileCheck> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };
  if (!token || token.length > 2048) return { ok: false, reason: "missing" };
  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") form.set("remoteip", ip);
  try {
    const res = await fetchImpl(SITEVERIFY, { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, reason: "unreachable" };
    return judgeSiteverify((await res.json()) as SiteverifyBody, expectedAction);
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
