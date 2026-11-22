// The `state` sent to Google with a connect request, and where Google's answer may be
// forwarded. Pure, so it can be tested.

export const STATE_COOKIE = "bzzy_gcal";

export type ConnectState = { n: string; o: string };

export function encodeState(s: ConnectState): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

export function decodeState(raw: string | null): ConnectState | null {
  if (!raw || raw.length > 1024) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return typeof v?.n === "string" && typeof v?.o === "string"
      ? { n: v.n, o: v.o }
      : null;
  } catch {
    return null;
  }
}

// Google can only send people back to bzzy.ca. A connect started on a preview deployment
// is forwarded there from bzzy.ca, the same way Auth.js does it for GitHub sign-in
// (docs/domains.md). Only this project's own preview hosts qualify: the preview still
// checks the request against its own cookie before it uses the code.
const PREVIEW_HOST = /^bzzy-[a-z0-9-]+-vancityactivists-projects\.vercel\.app$/;

export function forwardTarget(state: ConnectState, here: string): URL | null {
  let target: URL;
  try {
    target = new URL(state.o);
  } catch {
    return null;
  }
  if (target.origin === here) return null;
  if (
    target.protocol !== "https:" ||
    !PREVIEW_HOST.test(target.hostname) ||
    target.port
  )
    return null;
  return target;
}
