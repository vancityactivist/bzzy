import type { NextRequest } from "next/server";

import { authenticateDevice, unauthorized } from "@/lib/device-auth";
import { releaseFileUrl, savedRelease } from "@/lib/firmware-release";

// A device fetching a firmware update it was offered (docs/ota.md). Answers with a
// short-lived redirect to the file on GitHub. The device follows it without its
// token, and checks the file's signature and hash itself before installing it.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/device/[id]/firmware/[version]">) {
  const { id, version } = await ctx.params;
  const device = await authenticateDevice(id, req.headers.get("authorization"));
  if (!device) return unauthorized();

  const board = device.board ?? req.headers.get("x-bzzy-board");
  const location = board ? await releaseFileUrl(await savedRelease(), version, board) : null;
  if (!location) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}
