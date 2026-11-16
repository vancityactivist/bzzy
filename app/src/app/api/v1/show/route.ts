import { deleteShow, putShow } from "@/lib/api-actions";
import { apiOptions, apiRoute, readBody } from "@/lib/api-http";
import { showBody } from "@/lib/api-rules";
import { apiSnapshot, showFrom } from "@/lib/api-snapshot";

// "Show now": a message and/or GIF on the person's lights. See docs/api.md.

export const GET = apiRoute({ scope: "read", kind: "read" }, async ({ token, now }) => {
  return { data: { show: showFrom(await apiSnapshot(token.userId), now) } };
});

export const PUT = apiRoute({ scope: "show", kind: "write" }, async ({ req, token, now }) => {
  const body = await readBody(req, showBody);
  const { snap, changed } = await putShow(await apiSnapshot(token.userId), token, body, now);
  return { data: { show: showFrom(snap, now), changed } };
});

export const DELETE = apiRoute({ scope: "show", kind: "write" }, async ({ token, now }) => {
  const { snap, changed } = await deleteShow(await apiSnapshot(token.userId), token, now);
  return { data: { show: showFrom(snap, now), changed } };
});

export const OPTIONS = apiOptions;
