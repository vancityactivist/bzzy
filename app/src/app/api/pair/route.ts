import { ipAddress } from "@vercel/functions";
import type { NextRequest } from "next/server";

import { readFirmwareHeaders } from "@/lib/firmware";
import { PairingError, startPairing } from "@/lib/pairing";

const noStore = { "Cache-Control": "no-store" };

// A light that hasn't been added yet asks for a pairing code to show as a QR code.
// No sign-in: the code only lets a signed-in person claim it, and the secret in the
// answer only goes to the light. See docs/protocol.md, "Pairing".
export async function POST(req: NextRequest) {
  const fw = readFirmwareHeaders(req.headers);
  const ip = ipAddress(req) ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    const start = await startPairing({ ip, board: fw.board, firmwareVersion: fw.version });
    const url = `${req.nextUrl.origin}/pair/${start.code}`;
    return Response.json({ ...start, url }, { headers: noStore });
  } catch (e) {
    if (e instanceof PairingError) {
      return Response.json({ error: "too many codes from this network; try again later" }, { status: 429, headers: { ...noStore, "Retry-After": "300" } });
    }
    throw e;
  }
}
