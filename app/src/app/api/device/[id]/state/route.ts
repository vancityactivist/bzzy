import { after, type NextRequest } from "next/server";

import { refreshCalendar, scheduleForUser } from "@/lib/calendar";
import { authenticateDevice, markSeen, unauthorized } from "@/lib/device-auth";
import { resolveDeviceGifs } from "@/lib/gifs";
import { getPresence } from "@/lib/presence";
import { buildState, type GifMap, nowSeconds, STATUSES } from "@/lib/protocol";

// Polled by the device every ~20 s. See docs/protocol.md.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/device/[id]/state">) {
  const { id } = await ctx.params;
  const device = await authenticateDevice(id, req.headers.get("authorization"));
  if (!device) return unauthorized();

  const now = nowSeconds();
  const [presence, { schedule, stale }, resolved] = await Promise.all([
    getPresence(device.ownerUserId),
    scheduleForUser(device.ownerUserId, now),
    resolveDeviceGifs(device.id),
  ]);
  const origin = req.nextUrl.origin;
  const gifs = Object.fromEntries(
    STATUSES.map((s) => {
      const g = resolved[s];
      if (!g) return [s, null];
      const url = g.kind === "builtin" ? `${origin}${g.path}` : `${origin}/api/device/${device.id}/gif/${g.id}`;
      return [s, { url, sha: g.sha }];
    }),
  ) as GifMap;
  const state = buildState({ now, defaultStatus: device.defaultStatus, presence, schedule, gifs });

  // Answer from the saved copy right away, then re-read any calendar that's due.
  after(async () => {
    await Promise.all([markSeen(device.id), ...stale.map((c) => refreshCalendar(c))]);
  });
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
