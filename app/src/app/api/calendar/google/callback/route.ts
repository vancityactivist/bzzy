import { timingSafeEqual } from "node:crypto";

import { after, type NextRequest, NextResponse } from "next/server";

import { refreshCalendar } from "@/lib/calendar";
import {
  saveGoogleAccount,
  syncGoogleCalendarList,
} from "@/lib/calendar-accounts";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { exchangeGoogleCode, REQUIRED_SCOPES } from "@/lib/google-calendar";
import {
  decodeState,
  forwardTarget,
  STATE_COOKIE,
} from "@/lib/google-oauth-state";
import { getCurrentUser } from "@/lib/session";

function back(req: NextRequest, result: string) {
  const res = NextResponse.redirect(
    new URL(`/settings?calendar=${result}#calendars`, req.url),
  );
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/calendar/google" });
  return res;
}

function sameNonce(a: string | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Google sends people back here after the consent screen.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = decodeState(url.searchParams.get("state"));
  if (!state) return back(req, "google-failed");

  // Started on a preview: hand the answer on, untouched.
  const forward = forwardTarget(state, url.origin);
  if (forward)
    return NextResponse.redirect(
      new URL(`/api/calendar/google/callback${url.search}`, forward),
    );

  if (!sameNonce(req.cookies.get(STATE_COOKIE)?.value, state.n))
    return back(req, "google-failed");
  if (url.searchParams.get("error")) return back(req, "google-cancelled");
  const code = url.searchParams.get("code");
  const user = await getCurrentUser();
  if (!code || !user) return back(req, "google-failed");

  try {
    const grant = await exchangeGoogleCode(code);
    if (!REQUIRED_SCOPES.every((s) => grant.scopes.includes(s)))
      return back(req, "google-scopes");
    const account = await saveGoogleAccount(user.id, grant);
    await syncGoogleCalendarList(account);
    // Read the calendars that set status straight away, after answering.
    const cals = await db()
      .select()
      .from(schema.calendars)
      .where(eq(schema.calendars.accountId, account.id));
    after(() =>
      Promise.all(
        cals.filter((c) => c.setsStatus).map((c) => refreshCalendar(c)),
      ),
    );
    return back(req, "google-connected");
  } catch (err) {
    console.warn(
      "[calendar] google connect failed",
      err instanceof Error ? err.message : err,
    );
    return back(req, "google-failed");
  }
}
