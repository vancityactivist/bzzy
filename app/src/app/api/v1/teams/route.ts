import { apiOptions, apiRoute } from "@/lib/api-http";
import { apiTeams } from "@/lib/api-teams";

// The shared teams the person is in. See docs/api.md.

export const GET = apiRoute({ scope: ["read", "push"], kind: "read" }, async ({ token }) => {
  return { data: { teams: await apiTeams(token.userId) } };
});

export const OPTIONS = apiOptions;
