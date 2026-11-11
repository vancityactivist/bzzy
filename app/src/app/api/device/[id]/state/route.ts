import { after, type NextRequest } from "next/server";

import { authenticateDevice, markSeen, unauthorized } from "@/lib/device-auth";
import { getPresence } from "@/lib/presence";
import { buildState, nowSeconds } from "@/lib/protocol";

// Polled by the device every ~20 s. See docs/protocol.md.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/device/[id]/state">) {
  const { id } = await ctx.params;
  const device = await authenticateDevice(id, req.headers.get("authorization"));
  if (!device) return unauthorized();

  const presence = await getPresence(device.ownerUserId);
  // Calendar blocks arrive in step 3; until then the schedule is empty.
  const state = buildState({ now: nowSeconds(), defaultStatus: device.defaultStatus, presence, schedule: [] });

  after(() => markSeen(device.id));
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
