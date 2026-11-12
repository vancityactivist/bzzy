import { after, type NextRequest } from "next/server";

import { authenticateDevice, markSeen, unauthorized } from "@/lib/device-auth";
import { nowSeconds, pushAckBody } from "@/lib/protocol";
import { ackPush } from "@/lib/pushes";

// Sent when someone dismisses a team push with the button on their light (firmware
// with the "push" feature). Retried until it succeeds. See docs/protocol.md.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/device/[id]/push-ack">) {
  const { id } = await ctx.params;
  const device = await authenticateDevice(id, req.headers.get("authorization"));
  if (!device) return unauthorized();

  const parsed = pushAckBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "bad request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  // A clock that's far off still counts, at the time it arrived.
  const now = nowSeconds();
  const at = parsed.data.at > now + 300 || parsed.data.at === 0 ? now : parsed.data.at;
  const acked = await ackPush(device, parsed.data.id, at);

  after(() => markSeen(device.id));
  // 200 for a push that's gone or unknown too: there's nothing for the device to retry.
  return Response.json({ acked }, { headers: { "Cache-Control": "no-store" } });
}
