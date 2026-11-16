import { ApiError, apiOptions, apiRoute } from "@/lib/api-http";
import { apiTeam } from "@/lib/api-teams";

// One team: its members and live pushes. See docs/api.md.

export const GET = apiRoute({ scope: ["read", "push"], kind: "read" }, async ({ token, params }) => {
  const team = await apiTeam(token.userId, params.id);
  if (!team) throw new ApiError(404, "not_found", "No such team, or you're not in it.");
  return { data: team };
});

export const OPTIONS = apiOptions;
