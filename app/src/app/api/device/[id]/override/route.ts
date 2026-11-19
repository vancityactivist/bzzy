import { after, type NextRequest } from "next/server";

import { authenticateDevice, markSeen, unauthorized } from "@/lib/device-auth";
import { clearLightShow, getLightStatus, setLightStatus } from "@/lib/light-state";
import { getPresenceAndSource, setPresence } from "@/lib/presence";
import { hasFeature, nowSeconds, overrideBody, presenceFromDevice, shouldApplyDeviceOverride } from "@/lib/protocol";
import { ackPush, pushForDevice } from "@/lib/pushes";
import { clearShow } from "@/lib/show";
import { buttonPressed, noticeChanges } from "@/lib/webhooks";

// Sent when someone presses the button or taps the screen on the device.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/device/[id]/override">) {
  const { id } = await ctx.params;
  const device = await authenticateDevice(id, req.headers.get("authorization"));
  if (!device) return unauthorized();

  const parsed = overrideBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "bad request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  // A light that follows its owner changes their status, so all their lights follow. One
  // with its own status changes only itself.
  const own = !device.followsOwner;
  const { presence: current, source } = own ? await getLightStatus(device.id) : await getPresenceAndSource(device.ownerUserId);
  const applied = shouldApplyDeviceOverride(current, parsed.data, nowSeconds(), source === device.id);
  if (applied) {
    // A press on the device also takes down "show now" (the device already has).
    const presence = presenceFromDevice(parsed.data);
    await Promise.all(
      own
        ? [setLightStatus(device.id, presence, device.id), clearLightShow(device.id, parsed.data.updatedAt)]
        : [setPresence(device.ownerUserId, presence, device.id), clearShow(device.ownerUserId, parsed.data.updatedAt)],
    );
  }

  // Firmware from before pushes shows a push as "show now" and hides it on a press, so
  // a press there counts as dismissing it. Newer firmware dismisses on its own.
  if (!hasFeature(device.features, "push")) {
    const push = await pushForDevice(device, nowSeconds());
    if (push && parsed.data.updatedAt >= push.updatedAt) await ackPush(device, push.id, parsed.data.updatedAt);
  }

  after(() =>
    Promise.all([
      markSeen(device.id),
      applied && buttonPressed(device, parsed.data),
      // Webhooks follow the person's status, which a light of its own doesn't change.
      applied && !own && noticeChanges(device.ownerUserId, { status: true, show: true }),
    ]),
  );
  // 200 either way: an ignored (older) press is not an error, and the device
  // will pick up the newer state on its next poll.
  return Response.json({ applied }, { headers: { "Cache-Control": "no-store" } });
}
