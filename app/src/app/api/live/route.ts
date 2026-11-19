import type { NextRequest } from "next/server";

import { liveVersionFor } from "@/lib/live";
import { readTicket } from "@/lib/live-rules";
import { nowSeconds } from "@/lib/protocol";

// Polled by an open Status page about every 20 s while it's visible (components/live-sync.tsx).
// Answers with a fingerprint of what the person's lights show; the page re-renders when it
// changes. Signed ticket instead of the session, and the poll's cached data instead of
// the database, so this never wakes Postgres while nothing changes (docs/caching.md).
export async function GET(req: NextRequest) {
  const ticket = readTicket(req.nextUrl.searchParams.get("t"), nowSeconds());
  const headers = { "Cache-Control": "no-store" };
  if (!ticket) return Response.json({ error: "ticket" }, { status: 401, headers });
  const v = await liveVersionFor(ticket.u, ticket.d);
  return Response.json({ v }, { headers });
}
