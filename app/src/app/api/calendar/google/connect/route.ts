import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { googleAuthUrl, googleConfigured } from "@/lib/google-calendar";
import { encodeState, STATE_COOKIE } from "@/lib/google-oauth-state";
import { getCurrentUser } from "@/lib/session";

// Starts connecting a Google account: a one-time value in a cookie and in `state`, then
// off to Google's consent screen. ?hint=<email> preselects the account on Reconnect.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/", url));
  if (!googleConfigured())
    return NextResponse.redirect(
      new URL("/settings?calendar=google-off#calendars", url),
    );

  const nonce = randomBytes(18).toString("base64url");
  const hint = url.searchParams.get("hint")?.slice(0, 320) || undefined;
  const res = NextResponse.redirect(
    googleAuthUrl(encodeState({ n: nonce, o: url.origin }), hint),
  );
  res.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/api/calendar/google",
    maxAge: 600,
  });
  return res;
}
