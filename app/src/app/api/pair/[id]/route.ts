import type { NextRequest } from "next/server";

import { bearerToken } from "@/lib/device-token";
import { pollPairing } from "@/lib/pairing";

const noStore = { "Cache-Control": "no-store" };

// The light asks, every few seconds, whether someone has claimed its code. The pairing
// secret from POST /api/pair goes in the Authorization header. 404 means "ask for a new
// code" (expired, or not ours). See docs/protocol.md, "Pairing".
export async function GET(req: NextRequest, ctx: RouteContext<"/api/pair/[id]">) {
  const { id } = await ctx.params;
  const secret = bearerToken(req.headers.get("authorization"));
  const result = secret && id.length <= 64 ? await pollPairing(id, secret) : null;
  if (!result) return Response.json({ error: "not found" }, { status: 404, headers: noStore });
  return Response.json(result, { headers: noStore });
}
