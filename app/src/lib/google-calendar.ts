import "server-only";

import { calendarKeyConfigured } from "./calendar-secret";
import type { GoogleEvent } from "./google-events";

// Google's OAuth and Calendar API, read-only. Plain fetch, no SDK.

export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];
// Google's consent screen lets people untick scopes. Without these two there's nothing to read.
export const REQUIRED_SCOPES = GOOGLE_SCOPES.slice(2);

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
const TIMEOUT_MS = 10_000;

// The token was revoked, expired or the password changed: the person has to reconnect.
export class GoogleAuthLost extends Error {}
export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function googleConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    calendarKeyConfigured()
  );
}

// Google only sends people back to addresses registered on the OAuth client, so there's
// one: bzzy.ca (previews are forwarded from there, see the callback route), or localhost
// when running locally.
export function googleRedirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  if (process.env.NODE_ENV === "development")
    return "http://localhost:3000/api/calendar/google/callback";
  return "https://bzzy.ca/api/calendar/google/callback";
}

export function googleAuthUrl(state: string, loginHint?: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    // Always ask, so Google always returns a refresh token (it only does on consent).
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) q.set("login_hint", loginHint);
  return `${AUTH_URL}?${q}`;
}

type TokenAnswer = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
};

async function tokenRequest(
  body: Record<string, string>,
): Promise<TokenAnswer & { httpStatus: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenAnswer;
  return { ...json, httpStatus: res.status };
}

// The ID token comes straight from Google's token endpoint over TLS, so its claims can
// be read without checking the signature (OpenID Connect Core 3.1.3.7).
function idClaims(idToken: string | undefined): {
  sub?: string;
  email?: string;
} {
  const part = idToken?.split(".")[1];
  if (!part) return {};
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

export type GoogleGrant = {
  sub: string;
  email: string;
  refreshToken: string | null;
  accessToken: string;
  expiresIn: number;
  scopes: string[];
};

export async function exchangeGoogleCode(code: string): Promise<GoogleGrant> {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: googleRedirectUri(),
  });
  if (t.httpStatus !== 200 || !t.access_token)
    throw new GoogleError(
      `Google refused the sign-in (${t.error ?? t.httpStatus}).`,
      t.httpStatus,
    );
  const { sub, email } = idClaims(t.id_token);
  if (!sub)
    throw new GoogleError("Google didn't say which account this is.", 502);
  return {
    sub,
    email: email ?? "Google account",
    refreshToken: t.refresh_token ?? null,
    accessToken: t.access_token,
    expiresIn: t.expires_in ?? 3600,
    scopes: (t.scope ?? "").split(" ").filter(Boolean),
  };
}

export async function refreshGoogleAccess(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const t = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (t.error === "invalid_grant" || t.httpStatus === 401)
    throw new GoogleAuthLost("Google access was removed.");
  if (t.httpStatus !== 200 || !t.access_token)
    throw new GoogleError(
      `Google didn't renew access (${t.error ?? t.httpStatus}).`,
      t.httpStatus,
    );
  return { accessToken: t.access_token, expiresIn: t.expires_in ?? 3600 };
}

export async function revokeGoogle(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => undefined); // best effort: the row is deleted either way
}

async function apiGet<T>(
  accessToken: string,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (res.status === 401)
    throw new GoogleAuthLost("Google access was removed.");
  if (!res.ok)
    throw new GoogleError(
      `Google Calendar answered ${res.status}.`,
      res.status,
    );
  return (await res.json()) as T;
}

// `owned`: the person's own calendar, not one shared with them by someone else.
export type GoogleCalendarInfo = {
  id: string;
  summary: string;
  primary: boolean;
  color: string | null;
  owned: boolean;
};

export async function listGoogleCalendars(
  accessToken: string,
): Promise<GoogleCalendarInfo[]> {
  const out: GoogleCalendarInfo[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const r = await apiGet<{
      items?: {
        id: string;
        summary?: string;
        summaryOverride?: string;
        primary?: boolean;
        backgroundColor?: string;
        accessRole?: string;
        deleted?: boolean;
        hidden?: boolean;
      }[];
      nextPageToken?: string;
    }>(accessToken, "/users/me/calendarList", {
      maxResults: "250",
      fields:
        "items(id,summary,summaryOverride,primary,backgroundColor,accessRole,deleted,hidden),nextPageToken",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const c of r.items ?? []) {
      if (c.deleted) continue;
      out.push({
        id: c.id,
        summary: c.summaryOverride || c.summary || c.id,
        primary: !!c.primary,
        color: c.backgroundColor ?? null,
        owned: c.accessRole === "owner",
      });
    }
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

// Every event instance in the window (recurring ones expanded by Google).
export async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
  from: Date,
  to: Date,
): Promise<GoogleEvent[]> {
  const out: GoogleEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 4; page++) {
    const r = await apiGet<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        maxResults: "250",
        fields:
          "items(status,summary,iCalUID,eventType,transparency,start,end,attendees(self,email,responseStatus)),nextPageToken",
        ...(pageToken ? { pageToken } : {}),
      },
    );
    out.push(...(r.items ?? []));
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}
