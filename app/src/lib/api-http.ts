import "server-only";

import { after, type NextRequest } from "next/server";
import type { z } from "zod";

import { type LimitResult, overLimit, takeLimit } from "./api-limits";
import type { Scope } from "./api-rules";
import { type AuthedToken, authenticateApiToken, noteTokenUsed } from "./api-tokens";
import { bearerToken, hashToken } from "./device-token";

// Everything every /api/v1 route does the same way (docs/api.md): CORS, the token and
// its scope, rate limits, errors in one shape, and a request id.
//
// Only the Authorization header counts. Session cookies are never read here, so a page
// someone is signed in on can't be used to call the API for them, and CORS can be open.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field: string | null = null,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-Request-Id",
  "Access-Control-Max-Age": "86400",
};

function headers(requestId: string, extra: Record<string, string> = {}): Headers {
  return new Headers({ ...CORS, "Cache-Control": "no-store", "X-Request-Id": requestId, ...extra });
}

const limitHeaders = (l: LimitResult): Record<string, string> => ({
  "RateLimit-Limit": String(l.limit),
  "RateLimit-Remaining": String(l.remaining),
  "RateLimit-Reset": String(l.resetSec),
});

export function apiJson(data: unknown, status = 200, extra: Record<string, string> = {}, requestId = newRequestId()) {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: headers(requestId, status === 204 ? extra : { "Content-Type": "application/json", ...extra }),
  });
}

function errorResponse(err: ApiError, requestId: string) {
  return apiJson({ error: { code: err.code, message: err.message, field: err.field } }, err.status, err.headers, requestId);
}

const newRequestId = () => crypto.randomUUID().slice(0, 8);

function clientAddress(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return hashToken(fwd || req.headers.get("x-real-ip") || "unknown").slice(0, 16);
}

// `params`: the route's path parameters ({ id } for /webhooks/{id}).
export type ApiContext = { req: NextRequest; token: AuthedToken; now: number; requestId: string; params: Record<string, string> };

export type ApiHandler = (ctx: ApiContext) => Promise<{ data: unknown; status?: number }>;

// Wraps a route handler. `scope`: what the token must allow (a list: any one of them;
// null: any live token). `kind`: which rate limit it counts against.
export function apiRoute(opts: { scope: Scope | Scope[] | null; kind: "read" | "write" }, handler: ApiHandler) {
  const scopes = opts.scope === null ? null : ([] as Scope[]).concat(opts.scope);
  return async (req: NextRequest, route?: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const requestId = req.headers.get("x-vercel-id")?.split("::").pop()?.slice(0, 32) || newRequestId();
    try {
      const raw = bearerToken(req.headers.get("authorization"));
      const authed = raw ? await authenticateApiToken(raw) : null;
      if (!authed) {
        // Count failed sign-ins per address, so nobody can try tokens quickly.
        const who = clientAddress(req);
        const over = await overLimit("badAuth", who);
        if (over) throw tooMany(over);
        await takeLimit("badAuth", who);
        throw new ApiError(
          401,
          "unauthorized",
          raw ? "This token isn't valid. It may have been revoked or expired." : "Send a token: Authorization: Bearer bzzy_pat_…",
        );
      }
      const { token, loaded } = authed;
      if (scopes && !scopes.some((sc) => token.scopes.includes(sc)))
        throw new ApiError(
          403,
          "missing_scope",
          `This token can't do that. Make a token with the ${scopes.map((sc) => `"${sc}"`).join(" or ")} scope in Settings.`,
        );

      const limit = await takeLimit(opts.kind, token.id);
      if (!limit.ok) throw tooMany(limit);

      const nowMs = Date.now();
      // A write wakes the database anyway, so "last used" can be saved with it.
      after(() => noteTokenUsed(token.id, nowMs, loaded || opts.kind === "write"));
      const params = (await route?.params) ?? {};
      const { data, status = 200 } = await handler({ req, token, now: Math.floor(nowMs / 1000), requestId, params });
      return apiJson(data, status, limitHeaders(limit), requestId);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err, requestId);
      console.error("[api] %s %s failed (%s)", req.method, req.nextUrl.pathname, requestId, err);
      return errorResponse(new ApiError(500, "server_error", `Something went wrong on our side. Quote ${requestId} if you report it.`), requestId);
    }
  };
}

function tooMany(l: LimitResult) {
  return new ApiError(429, "rate_limited", `Too many requests. Try again in ${l.resetSec} s.`, null, {
    ...limitHeaders(l),
    "Retry-After": String(l.resetSec),
  });
}

// CORS preflight for every route.
export function apiOptions() {
  return new Response(null, { status: 204, headers: headers(newRequestId()) });
}

// The request's JSON body, checked. Errors name the first field that's wrong.
export async function readBody<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
    throw new ApiError(415, "unsupported_media_type", "Send JSON with Content-Type: application/json.");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "The body isn't valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.length ? issue.path.join(".") : null;
    throw new ApiError(400, "invalid_request", issue ? `${field ?? "body"}: ${issue.message}` : "The body isn't right.", field);
  }
  return parsed.data;
}
