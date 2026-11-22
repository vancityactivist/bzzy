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

// Hostnames the widget may have been solved on. Production is bzzy.ca; set
// TURNSTILE_HOSTNAMES (comma-separated) to change it. Never list localhost on production.
export function expectedHostnames(): Set<string> {
  const raw = process.env.TURNSTILE_HOSTNAMES || "bzzy.ca";
  return new Set(raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
}

// Pure part, unit-tested: does Cloudflare's answer let this message through? Cloudflare's
// canonical check: success, the action this form sets, and a hostname we serve.
export function judgeSiteverify(body: SiteverifyBody, expectedAction: string, hostnames: Set<string>): TurnstileCheck {
  if (!body.success) return { ok: false, reason: "rejected" };
  if (body.action !== expectedAction) return { ok: false, reason: "rejected" };
  if (!body.hostname || !hostnames.has(body.hostname.toLowerCase())) return { ok: false, reason: "rejected" };
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
    if (!res.ok) {
      console.warn(`[turnstile] siteverify HTTP ${res.status}`);
      return { ok: false, reason: "unreachable" };
    }
    const body = (await res.json()) as SiteverifyBody;
    const verdict = judgeSiteverify(body, expectedAction, expectedHostnames());
    // Shows up in Vercel's runtime logs. Never logs the token or secret.
    if (!verdict.ok) {
      console.warn(
        `[turnstile] rejected: success=${body.success} action=${body.action} hostname=${body.hostname} errors=${(body["error-codes"] ?? []).join(",")}`,
      );
    }
    return verdict;
  } catch (err) {
    console.warn(`[turnstile] siteverify unreachable: ${err instanceof Error ? err.name : "error"}`);
    return { ok: false, reason: "unreachable" };
  }
}
