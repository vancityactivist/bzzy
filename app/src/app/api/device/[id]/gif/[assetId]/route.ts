import type { NextRequest } from "next/server";

import { authenticateDevice, unauthorized } from "@/lib/device-auth";
import { deviceMayFetch, openAsset } from "@/lib/gifs";
import { showMayFetch } from "@/lib/show";

// A device downloading one of its uploaded GIFs. Uploads are private, so this is
// the only way a device gets at them. A device may fetch the GIFs it's set to show
// for a status, and the one its owner is showing now.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/device/[id]/gif/[assetId]">) {
  const { id, assetId } = await ctx.params;
  const device = await authenticateDevice(id, req.headers.get("authorization"));
  if (!device) return unauthorized();

  const blobUrl = (await deviceMayFetch(device.id, assetId)) ?? (await showMayFetch(device.ownerUserId, assetId));
  if (!blobUrl) return new Response("Not found", { status: 404 });
  const blob = await openAsset(blobUrl);
  if (!blob || blob.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(blob.stream, {
    headers: { "Content-Type": "image/gif", "Content-Length": String(blob.blob.size), "Cache-Control": "private, max-age=3600" },
  });
}
