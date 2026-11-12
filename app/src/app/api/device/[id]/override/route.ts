import { after, type NextRequest } from "next/server";

import { authenticateDevice, markSeen, unauthorized } from "@/lib/device-auth";
import { getPresence, setPresence } from "@/lib/presence";
import { clearShow } from "@/lib/show";
import { nowSeconds, overrideBody, presenceFromDevice, shouldApplyDeviceOverride } from "@/lib/protocol";

// Sent when someone presses the button or taps the screen on the device.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/device/[id]/override">) {
  const { id } = await ctx.params;
  const device = await authenticateDevice(id, req.headers.get("authorization"));
  if (!device) return unauthorized();

  const parsed = overrideBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "bad request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const current = await getPresence(device.ownerUserId);
  const applied = shouldApplyDeviceOverride(current, parsed.data, nowSeconds());
  if (applied) {
    // A press on the device also takes down "show now" (the device already has).
    await Promise.all([
      setPresence(device.ownerUserId, presenceFromDevice(parsed.data), device.id),
      clearShow(device.ownerUserId, parsed.data.updatedAt),
    ]);
  }

  after(() => markSeen(device.id));
  // 200 either way: an ignored (older) press is not an error, and the device
  // will pick up the newer state on its next poll.
  return Response.json({ applied }, { headers: { "Cache-Control": "no-store" } });
}
