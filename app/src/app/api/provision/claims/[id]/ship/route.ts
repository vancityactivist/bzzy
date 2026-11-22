import type { NextRequest } from "next/server";

import { shipClaim } from "@/lib/provision";

import { provisionRoute } from "../../../http";

// Every light on the claim goes into ship mode; the person is emailed if they haven't been.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/provision/claims/[id]/ship">) {
  const { id } = await ctx.params;
  return provisionRoute(req, async (origin) => ({ data: await shipClaim(id, origin) }));
}
