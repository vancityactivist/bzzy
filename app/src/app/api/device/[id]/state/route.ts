import { after, type NextRequest } from "next/server";

import { refreshCalendar, scheduleForUser } from "@/lib/calendar";
import { authenticateDevice, markSeen, unauthorized } from "@/lib/device-auth";
import { firmwareOffer, firmwarePatch, readFirmwareHeaders } from "@/lib/firmware";
import { refreshRelease, releaseIsStale, savedRelease } from "@/lib/firmware-release";
import { resolveDeviceGifs, type ResolvedGif } from "@/lib/gifs";
import { getPresence } from "@/lib/presence";
import { buildState, type GifMap, type GifRef, nowSeconds, STATUSES } from "@/lib/protocol";
import { getShow } from "@/lib/show";

// Polled by the device every ~20 s. See docs/protocol.md.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/device/[id]/state">) {
  const { id } = await ctx.params;
  const device = await authenticateDevice(id, req.headers.get("authorization"));
  if (!device) return unauthorized();

  const now = nowSeconds();
  const [presence, { schedule, stale }, resolved, show, release] = await Promise.all([
    getPresence(device.ownerUserId),
    scheduleForUser(device.ownerUserId, now),
    resolveDeviceGifs(device.id),
    getShow(device.ownerUserId),
    savedRelease(),
  ]);
  const origin = req.nextUrl.origin;
  const ref = (g: ResolvedGif): GifRef | null => {
    if (!g) return null;
    const url = g.kind === "builtin" ? `${origin}${g.path}` : `${origin}/api/device/${device.id}/gif/${g.id}`;
    return { url, sha: g.sha };
  };
  const gifs = Object.fromEntries(STATUSES.map((s) => [s, ref(resolved[s])])) as GifMap;
  // Firmware: note what the device is running, and offer the latest release if it
  // should have it (docs/ota.md).
  const fwPatch = firmwarePatch(device, readFirmwareHeaders(req.headers));
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
    show: show && { ...show, gif: ref(show.gif) },
    firmware,
  });

  // Answer from the saved copies right away, then re-read any calendar (or the
  // firmware release) that's due.
  after(async () => {
    await Promise.all([
      markSeen(device.id, fwPatch, device.updateRequestedAt),
      ...stale.map((c) => refreshCalendar(c)),
      releaseIsStale(release) ? refreshRelease() : null,
    ]);
  });
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
