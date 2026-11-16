import { after } from "next/server";

import { pickGif } from "@/lib/api-actions";
import { ApiError, apiOptions, apiRoute, readBody } from "@/lib/api-http";
import { cleanText, endTime, PUSH_MAX_AHEAD_SEC, pushBody } from "@/lib/api-rules";
import { apiTeam, pushOut } from "@/lib/api-teams";
import { createPush, livePushes } from "@/lib/pushes";
import { can } from "@/lib/team-rules";
import { TeamError, teamAccess } from "@/lib/teams";
import { pushReceived } from "@/lib/webhooks";

// Send a team push: a message and/or GIF on everyone's lights, or picked people's. Only
// owners and admins (checked on every call, like the team page). See docs/api.md.

export const POST = apiRoute({ scope: "push", kind: "write" }, async ({ req, token, params, now }) => {
  const body = await readBody(req, pushBody);
  const t = await teamAccess(token.userId, params.id);
  if (!t) throw new ApiError(404, "not_found", "No such team, or you're not in it.");
  if (!can(t.access, "manage")) throw new ApiError(403, "not_allowed", "Only the team's owner and admins can send pushes.");

  const end = endTime(body, now, PUSH_MAX_AHEAD_SEC);
  if (!end.ok) throw new ApiError(400, "invalid_request", end.message, end.field);
  const gif = await pickGif(token.userId, body.gif);
  const text = cleanText(body.text);
  if (!gif && !text) throw new ApiError(400, "invalid_request", "Send a gif, some text, or both.", "text");

  const people = [...new Set(body.people)];
  if (people.length) {
    const members = new Set((await apiTeam(token.userId, params.id))?.members.map((m) => m.id));
    const stranger = people.find((p) => !members.has(p));
    if (stranger) throw new ApiError(400, "invalid_request", `${stranger} isn't in this team. Use ids from GET /teams/{id}.`, "people");
  }

  try {
    const id = await createPush(token.userId, params.id, {
      assetId: gif?.kind === "asset" ? gif.id : null,
      builtin: gif?.kind === "builtin" ? gif.id : null,
      text,
      leds: body.ring,
      until: end.until,
      target: people.length ? "users" : "all",
      users: people,
    });
    after(() => pushReceived(params.id, id));
    const push = (await livePushes([params.id])).find((p) => p.id === id);
    return { data: { push: push ? pushOut(push, now) : null }, status: 201 };
  } catch (err) {
    if (err instanceof TeamError) throw new ApiError(400, "invalid_request", err.message);
    throw err;
  }
});

export const OPTIONS = apiOptions;
