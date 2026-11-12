import { after, type NextRequest } from "next/server";

import { refreshCalendar, scheduleForUser } from "@/lib/calendar";
import { authenticateDevice, markSeen, unauthorized } from "@/lib/device-auth";
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
  const [presence, { schedule, stale }, resolved, show] = await Promise.all([
    getPresence(device.ownerUserId),
    scheduleForUser(device.ownerUserId, now),
    resolveDeviceGifs(device.id),
    getShow(device.ownerUserId),
  ]);
  const origin = req.nextUrl.origin;
  const ref = (g: ResolvedGif): GifRef | null => {
    if (!g) return null;
    const url = g.kind === "builtin" ? `${origin}${g.path}` : `${origin}/api/device/${device.id}/gif/${g.id}`;
    return { url, sha: g.sha };
  };
  const gifs = Object.fromEntries(STATUSES.map((s) => [s, ref(resolved[s])])) as GifMap;
  const state = buildState({
    now,
    defaultStatus: device.defaultStatus,
    presence,
    schedule,
    gifs,
    show: show && { ...show, gif: ref(show.gif) },
  });

  // Answer from the saved copy right away, then re-read any calendar that's due.
  after(async () => {
    await Promise.all([markSeen(device.id), ...stale.map((c) => refreshCalendar(c))]);
  });
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
