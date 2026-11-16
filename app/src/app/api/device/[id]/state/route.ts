import { after, type NextRequest } from "next/server";

import { refreshCalendar, scheduleFromCalendars, staleCalendars } from "@/lib/calendar";
import { unauthorized } from "@/lib/device-auth";
import { firmwareOffer, firmwarePatch, readFirmwareHeaders } from "@/lib/firmware";
import { refreshRelease, releaseDue } from "@/lib/firmware-release";
import type { ResolvedGif } from "@/lib/gifs";
import type { CurrentShow } from "@/lib/show";
import { authenticatedBundle } from "@/lib/poll-bundle";
import { buildState, type GifMap, type GifRef, hasFeature, nowSeconds, readFeatures, type ShowState, STATUSES } from "@/lib/protocol";
import { pushAsShow, pushFor } from "@/lib/push-rules";
import { sentLeds } from "@/lib/ring";
import { noteSeen } from "@/lib/seen";
import { noticeChanges } from "@/lib/webhooks";
import { pollSeconds, workWindows } from "@/lib/work-hours";

// Polled by the device every ~20 s. See docs/protocol.md.
//
// Answers from a cached copy of everything it needs (lib/poll-bundle.ts), so while
// nothing changes a poll doesn't touch the database at all and Postgres can go idle.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/device/[id]/state">) {
  const { id } = await ctx.params;
  const authed = await authenticatedBundle(id, req.headers.get("authorization"));
  if (!authed) return unauthorized();
  const { bundle, loaded } = authed;
  const { device, presence, show, release, gifs: resolved } = bundle;

  const now = nowSeconds();
  const nowMs = Date.now();
  const schedule = scheduleFromCalendars(bundle.calendars, now);
  const push = pushFor(bundle.pushes, device.ownerUserId, now);
  // Outside working hours the light goes dark and polls every 5 minutes instead of 20 s.
  const windows = workWindows(bundle.workHours, bundle.timeZone, now);
  const hours = { set: !!bundle.workHours, windows, poll: pollSeconds(bundle.workHours, windows, now) };
  const [stale, releaseStale] = await Promise.all([staleCalendars(bundle.calendars, nowMs), releaseDue(release, nowMs)]);
  const origin = req.nextUrl.origin;
  const ref = (g: ResolvedGif): GifRef | null => {
    if (!g) return null;
    const url = g.kind === "builtin" ? `${origin}${g.path}` : `${origin}/api/device/${device.id}/gif/${g.id}`;
    return { url, sha: g.sha };
  };
  const gifs = Object.fromEntries(STATUSES.map((s) => [s, ref(resolved[s])])) as GifMap;
  // Firmware: note what the device is running, and offer the latest release if it
  // should have it (docs/ota.md).
  const features = readFeatures(req.headers.get("x-bzzy-features"));
  const fwPatch = {
    ...firmwarePatch(device, readFirmwareHeaders(req.headers)),
    ...(features !== device.features ? { features } : {}),
  };
  const firmware = firmwareOffer({
    manifest: release?.manifest,
    device: { ...device, ...fwPatch },
    now,
    url: (v) => `${origin}/api/device/${device.id}/firmware/${encodeURIComponent(v)}`,
  });

  const state = buildState({
    now,
    defaultStatus: device.defaultStatus,
    presence,
    schedule,
    gifs,
    // A team push takes the place of the person's own "show now" until it ends or
    // they dismiss it. Firmware that knows about pushes also gets `push`, which says
    // so and carries the flash.
    // Their own show can move the ring too, if the light may flash.
    show: push ? { ...pushAsShow(push, presence, now), gif: ref(push.gif) } : show && ownShow(show, device.allowFlash, ref),
    push:
      push && hasFeature(features, "push")
        ? { id: push.id, updatedAt: push.updatedAt, ...(push.leds && device.allowFlash ? { leds: push.leds } : {}) }
        : null,
    // How the ring moves. Firmware without the "leds" feature ignores these.
    leds: sentLeds(device),
    firmware,
    hours,
  });

  // Answer from the saved copies right away, then re-read any calendar (or the
  // firmware release) that's due.
  // "Last seen" goes to the cache (and only rarely to the database, unless there's
  // firmware news to save or this poll already woke it); feeds and the release are re-read when due, and only written
  // back if they changed.
  after(async () => {
    await Promise.all([
      // Only firmware that knows about working hours actually waits longer.
      noteSeen(device, nowMs, fwPatch, hasFeature(features, "hours") ? hours.poll : 20, loaded),
      ...stale.map((c) => refreshCalendar(c, bundle.timeZone)),
      releaseStale ? refreshRelease(release) : null,
      // A meeting starting or ending, or a status running out, changes nothing in the
      // database, so the poll is where it's noticed and sent (lib/webhooks.ts).
      bundle.webhooks ? noticeChanges(device.ownerUserId, "poll") : null,
    ]);
  });
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}

function ownShow(show: CurrentShow, allowFlash: boolean, ref: (g: ResolvedGif) => GifRef | null): ShowState {
  const { gif, leds, ...rest } = show;
  return { ...rest, gif: ref(gif), ...(leds && allowFlash ? { leds } : {}) };
}
