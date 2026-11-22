import type { NextRequest } from "next/server";

import { inviteClaim } from "@/lib/provision";

import { provisionRoute } from "../../../http";

// (Re)send the "set up your bzzy account" email. A new link replaces any earlier one.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/provision/claims/[id]/invite">) {
  const { id } = await ctx.params;
  return provisionRoute(req, async (origin) => ({ data: await inviteClaim(id, origin) }));
}
