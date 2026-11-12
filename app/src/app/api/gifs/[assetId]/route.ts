import { connection, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { canPreviewTeamAsset } from "@/lib/dashboard";
import { canSeeAsset, openAsset } from "@/lib/gifs";

// Previews of uploaded GIFs: your own, and (on the team dashboard) ones shown on the
// lights of people in a team you manage.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/gifs/[assetId]">) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) return new Response("Sign in first", { status: 401 });
  const { assetId } = await ctx.params;
  const asset = (await canSeeAsset(session.user.id, assetId)) ?? (await canPreviewTeamAsset(session.user.id, assetId));
  if (!asset) return new Response("Not found", { status: 404 });
  const blob = await openAsset(asset.blobUrl);
  if (!blob || blob.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(blob.stream, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "private, max-age=86400, immutable" },
  });
}
