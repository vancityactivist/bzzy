import type { NextRequest } from "next/server";

import { claimInput } from "@/lib/claim-rules";
import { createClaim, ProvisionError } from "@/lib/provision";

import { provisionRoute } from "../http";

// Make a light claim for an email. Same `ref`, same claim.
export async function POST(req: NextRequest) {
  return provisionRoute(req, async () => {
    const body = await req.json().catch(() => null);
    const input = claimInput.safeParse(body);
    if (!input.success) throw new ProvisionError(input.error.issues[0]?.message ?? "Check the body.", 400);
    const { id, created } = await createClaim(input.data);
    return { data: { id }, status: created ? 201 : 200 };
  });
}
