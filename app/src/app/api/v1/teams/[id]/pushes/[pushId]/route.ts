import { ApiError, apiOptions, apiRoute } from "@/lib/api-http";
import { endPush } from "@/lib/pushes";
import { can } from "@/lib/team-rules";
import { teamAccess } from "@/lib/teams";

// End a team push for everyone, now. Owners and admins only. See docs/api.md.

export const DELETE = apiRoute({ scope: "push", kind: "write" }, async ({ token, params }) => {
  const t = await teamAccess(token.userId, params.id);
  if (!t) throw new ApiError(404, "not_found", "No such team, or you're not in it.");
  if (!can(t.access, "manage")) throw new ApiError(403, "not_allowed", "Only the team's owner and admins can end pushes.");
  if (!(await endPush(token.userId, params.id, params.pushId))) throw new ApiError(404, "not_found", "No live push with that id in this team.");
  return { data: { ended: true } };
});

export const OPTIONS = apiOptions;
