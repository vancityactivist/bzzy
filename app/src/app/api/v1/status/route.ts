import { after } from "next/server";

import { deleteStatus, putStatus } from "@/lib/api-actions";
import { apiOptions, apiRoute, readBody } from "@/lib/api-http";
import { statusBody } from "@/lib/api-rules";
import { apiSnapshot, refreshDueCalendars, statusFrom } from "@/lib/api-snapshot";

// The status a person's lights show, and their manual override. See docs/api.md.

export const GET = apiRoute({ scope: "read", kind: "read" }, async ({ token, now }) => {
  const snap = await apiSnapshot(token.userId);
  after(() => refreshDueCalendars(snap));
  return { data: statusFrom(snap, now) };
});

export const PUT = apiRoute({ scope: "status", kind: "write" }, async ({ req, token, now }) => {
  const body = await readBody(req, statusBody);
  const { snap, changed } = await putStatus(await apiSnapshot(token.userId), token, body, now);
  return { data: { ...statusFrom(snap, now), changed } };
});

export const DELETE = apiRoute({ scope: "status", kind: "write" }, async ({ token, now }) => {
  const { snap, changed } = await deleteStatus(await apiSnapshot(token.userId), token, now);
  return { data: { ...statusFrom(snap, now), changed } };
});

export const OPTIONS = apiOptions;
