import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

import { iso } from "./api-rules";
import { gifId } from "./api-snapshot";
import { cachedRead, tag } from "./cache";
import { nowSeconds } from "./protocol";
import { pushLive, type LedStyle } from "./push-rules";
import { livePushes, type Push } from "./pushes";
import { can, type TeamRole } from "./team-rules";
import { sharedTeamsForUser, teamMembers } from "./teams";

// Teams and their pushes for the public API (docs/api.md). Sending and ending go through
// lib/pushes.ts like the team page, which checks the person's role every time.

export type ApiPush = {
  id: string;
  teamId: string;
  text: string;
  gif: { id: string; name: string } | null;
  ring: LedStyle | null;
  until: string | null;
  sentAt: string | null;
  sentBy: { id: string | null; name: string | null };
  // "everyone" in the team, or the `people` picked.
  to: "everyone" | "people";
  people: string[];
  // Who has dismissed it on their light.
  dismissedBy: string[];
  live: boolean;
};

export function pushOut(p: Push, now: number): ApiPush {
  return {
    id: p.id,
    teamId: p.teamId,
    text: p.text,
    gif: p.gif ? { id: gifId(p.gif)!, name: p.gif.name } : null,
    ring: p.leds,
    until: iso(p.until),
    sentAt: iso(p.updatedAt),
    sentBy: { id: p.createdBy, name: p.createdByName },
    to: p.target === "all" ? "everyone" : "people",
    people: p.targets,
    dismissedBy: p.ackedBy,
    live: pushLive(p, now),
  };
}

const canPush = (role: TeamRole | null) => can({ role, superadmin: false }, "manage");

// GET /v1/teams: the shared teams the person is in. Read from the database: it's how an
// integration finds a team id once, not something to poll.
export async function apiTeams(userId: string) {
  const teams = await sharedTeamsForUser(userId);
  console.info(`[db] api: teams for ${userId}`);
  return teams.map((t) => ({ id: t.id, name: t.name, role: t.role, members: t.members, canPush: canPush(t.role) }));
}

type TeamSnapshot = {
  team: { id: string; name: string };
  members: { id: string; name: string | null; role: TeamRole }[];
  pushes: Push[];
};

const TEAM_TTL_SEC = 3 * 3600;

async function loadTeam(teamId: string) {
  const [rows, members, pushes] = await Promise.all([
    db().select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1),
    teamMembers(teamId),
    livePushes([teamId]),
  ]);
  const team = rows[0];
  if (!team || team.personal) return null;
  const value: TeamSnapshot = {
    team: { id: team.id, name: team.name },
    members: members.map((m) => ({ id: m.userId, name: m.name ?? null, role: m.role })),
    pushes,
  };
  const assets = pushes.flatMap((p) => (p.gif?.kind === "asset" ? [tag.asset(p.gif.id)] : []));
  return { value, tags: [tag.team(teamId), ...assets] };
}

// GET /v1/teams/{id}: the team, its members and its live pushes, if the person is in it.
// Cached under the team's t- tag, which every push, dismissal and member change expires,
// so an integration watching for pushes doesn't wake the database.
export async function apiTeam(userId: string, teamId: string) {
  const { value, loaded } = await cachedRead(`apiteam:v1:${teamId}`, TEAM_TTL_SEC, () => loadTeam(teamId));
  if (loaded) console.info(`[db] api: team ${teamId} read from the database (cache miss)`);
  const me = value?.members.find((m) => m.id === userId);
  if (!value || !me) return null;
  const now = nowSeconds();
  return {
    team: { ...value.team, role: me.role, canPush: canPush(me.role) },
    members: value.members,
    pushes: value.pushes.filter((p) => pushLive(p, now)).map((p) => pushOut(p, now)),
  };
}
