import { after, type NextRequest } from "next/server";

import { refreshCalendar, scheduleForUser } from "@/lib/calendar";
import { authenticateDevice, markSeen, unauthorized } from "@/lib/device-auth";
import { getPresence } from "@/lib/presence";
import { buildState, nowSeconds } from "@/lib/protocol";

// Polled by the device every ~20 s. See docs/protocol.md.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/device/[id]/state">) {
  const { id } = await ctx.params;
  const device = await authenticateDevice(id, req.headers.get("authorization"));
  if (!device) return unauthorized();

  const now = nowSeconds();
  const [presence, { schedule, stale }] = await Promise.all([
    getPresence(device.ownerUserId),
    scheduleForUser(device.ownerUserId, now),
  ]);
  const state = buildState({ now, defaultStatus: device.defaultStatus, presence, schedule });

  // Answer from the saved copy right away, then re-read any calendar that's due.
  after(async () => {
    await Promise.all([markSeen(device.id), ...stale.map((c) => refreshCalendar(c))]);
  });
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
