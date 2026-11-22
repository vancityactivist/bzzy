import type { NextRequest } from "next/server";

import { appOrigin } from "@/lib/origin";
import { ProvisionError, provisionKeyOk } from "@/lib/provision";

// Server-to-server only (docs/provisioning.md): the caller's key or a 404, so the API
// doesn't advertise itself.
export async function provisionRoute(req: NextRequest, run: (origin: string) => Promise<{ data: unknown; status?: number }>) {
  if (!provisionKeyOk(req.headers.get("authorization"))) return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const { data, status = 200 } = await run(await appOrigin());
    return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ProvisionError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
