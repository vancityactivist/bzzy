import "server-only";

import { cleanText, endTime, sameStatus, type ShowBody, type StatusBody } from "./api-rules";
import { ApiError } from "./api-http";
import type { ApiSnapshot } from "./api-snapshot";
import type { AuthedToken } from "./api-tokens";
import { builtinGif, canSeeAsset, type ResolvedGif } from "./gifs";
import { setPresence } from "./presence";
import { type Presence, showVisible } from "./protocol";
import { clearShow, setShow } from "./show";

// What the API's writes do. They call the same functions as the web app, so the rules
// match: changing the status takes down Show now (as a press on the light does), and a
// newer press on a light still wins. A call that would change nothing writes nothing,
// so integrations that resend the same state don't wake the database.

// Shown in the app as who set the status ("Set by Stream Deck").
export const apiSource = (token: AuthedToken) => `api:${token.name}`;

function end(input: { minutes?: number; until?: string }, now: number) {
  const r = endTime(input, now);
  if (!r.ok) throw new ApiError(400, "invalid_request", r.message, r.field);
  return r.until;
}

// The snapshot as it is after the change, for the response.
export type Applied = { snap: ApiSnapshot; changed: boolean };

export async function putStatus(snap: ApiSnapshot, token: AuthedToken, body: StatusBody, now: number): Promise<Applied> {
  const next = { status: body.status, text: cleanText(body.text), until: end(body, now) };
  const showUp = showVisible(snap.show, snap.presence, now);
  if (sameStatus(snap.presence, next, now) && !showUp) return { snap, changed: false };
  const presence: Presence = { active: true, ...next, updatedAt: now };
  const source = apiSource(token);
  await Promise.all([setPresence(token.userId, presence, source), clearShow(token.userId, now)]);
  const show = snap.show && showUp ? { ...snap.show, active: false, updatedAt: now } : snap.show;
  return { snap: { ...snap, presence, presenceSource: source, show }, changed: true };
}

export async function deleteStatus(snap: ApiSnapshot, token: AuthedToken, now: number): Promise<Applied> {
  const p = snap.presence;
  const manualLive = !!p?.active && (p.until === 0 || p.until > now);
  const showUp = showVisible(snap.show, snap.presence, now);
  if (!manualLive && !showUp) return { snap, changed: false };
  const presence: Presence = { active: false, status: "free", text: "", until: 0, updatedAt: now };
  const source = apiSource(token);
  await Promise.all([setPresence(token.userId, presence, source), clearShow(token.userId, now)]);
  const show = snap.show && showUp ? { ...snap.show, active: false, updatedAt: now } : snap.show;
  return { snap: { ...snap, presence, presenceSource: source, show }, changed: true };
}

export async function putShow(snap: ApiSnapshot, token: AuthedToken, body: ShowBody, now: number): Promise<Applied> {
  const text = cleanText(body.text);
  const until = end(body, now);
  const gif = await pickGif(token.userId, body.gif);
  const choice = { assetId: gif?.kind === "asset" ? gif.id : null, builtin: gif?.kind === "builtin" ? gif.id : null };
  if (!choice.assetId && !choice.builtin && !text) throw new ApiError(400, "invalid_request", "Send a gif, some text, or both.", "text");

  const cur = snap.show;
  if (
    cur &&
    showVisible(cur, snap.presence, now) &&
    cur.text === text &&
    cur.until === until &&
    JSON.stringify(cur.leds ?? null) === JSON.stringify(body.ring ?? null) &&
    (cur.gif?.kind === "asset" ? cur.gif.id : null) === choice.assetId &&
    (cur.gif?.kind === "builtin" ? cur.gif.id : null) === choice.builtin
  )
    return { snap, changed: false };

  await setShow(token.userId, { ...choice, text, leds: body.ring, until, updatedAt: now });
  return {
    snap: { ...snap, show: { active: true, text, until, updatedAt: now, gif, leds: body.ring } },
    changed: true,
  };
}

// "builtin:<id>" or "asset:<id>" (one of the person's teams' uploads), or null for none.
async function pickGif(userId: string, id: string | null): Promise<ResolvedGif> {
  if (!id) return null;
  let gif: ResolvedGif = null;
  if (id.startsWith("builtin:")) gif = builtinGif(id.slice(8));
  else if (id.startsWith("asset:")) {
    const a = await canSeeAsset(userId, id.slice(6));
    gif = a ? { kind: "asset", id: a.id, name: a.name, sha: a.sha } : null;
  }
  if (!gif) throw new ApiError(404, "unknown_gif", "No such GIF. Use an id from GET /v1/gifs.", "gif");
  return gif;
}

export async function deleteShow(snap: ApiSnapshot, token: AuthedToken, now: number): Promise<Applied> {
  if (!showVisible(snap.show, snap.presence, now)) return { snap, changed: false };
  await clearShow(token.userId, now);
  return { snap: { ...snap, show: snap.show ? { ...snap.show, active: false, updatedAt: now } : null }, changed: true };
}
