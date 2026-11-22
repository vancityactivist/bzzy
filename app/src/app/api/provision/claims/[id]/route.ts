import type { NextRequest } from "next/server";

import { claimStatus, deleteClaim } from "@/lib/provision";

import { provisionRoute } from "../../http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/provision/claims/[id]">) {
  const { id } = await ctx.params;
  return provisionRoute(req, async () => ({ data: await claimStatus(id) }));
}

// The order was cancelled before it shipped.
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/provision/claims/[id]">) {
  const { id } = await ctx.params;
  return provisionRoute(req, async () => ({ data: await deleteClaim(id) }));
}
