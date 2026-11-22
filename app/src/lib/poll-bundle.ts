import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

import { cachedRead, tag } from "./cache";
import { calendarsForUser, type CalendarRow, userClock } from "./calendar";
import type { AuthedDevice } from "./device-auth";
import { tokenMatches, bearerToken } from "./device-token";
import { type ReleaseRow, savedRelease } from "./firmware-release";
import { type ResolvedGif, resolveUserGifs } from "./gifs";
import { getLightShow, getLightStatus } from "./light-state";
import { getLook } from "./look";
import { withLook } from "./look-rules";
import { getPresence } from "./presence";
import { nowSeconds, type Presence, type Status } from "./protocol";
import { followedPushes, type Push } from "./pushes";
import { type CurrentShow, getShow } from "./show";
import { hasLiveWebhooks } from "./webhooks";
import type { WorkHours } from "./work-hours";

// Everything a light's poll reads from the database, kept in the runtime cache so that a
// poll while nothing has changed doesn't touch Postgres. Each write that changes any of
// it expires one of the tags it's saved under (see lib/cache-codec.ts), and the next poll
// reads it fresh. Time-dependent choices (which schedule blocks are in the next 24 h,
// whether a push or override has run out) are still made on every poll from this data.
export type PollBundle = {
  // The light, with its owner's look (lib/look-rules.ts withLook) in its ring and
  // "between meetings" fields.
  device: AuthedDevice;
  timeZone: string;
  // The owner's working hours; null = always on.
  workHours: WorkHours | null;
  // The owner's status, or the light's own when it doesn't follow them.
  presence: Presence | null;
  // The owner's calendars; none for a light with its own status.
  calendars: CalendarRow[];
  gifs: Record<Status, ResolvedGif>;
  show: CurrentShow | null;
  release: ReleaseRow | null;
  // Live pushes of the team the light follows; empty if it follows none.
  pushes: Push[];
  // Whether the owner has a webhook on, so the poll checks for changes to send.
  webhooks: boolean;
};

// A safety net in case a change ever forgets to expire its tag. Long on purpose: each
// reload wakes the database, which then stays up for 5 minutes.
export const POLL_BUNDLE_TTL_SEC = 3 * 3600;

// Bump the version when PollBundle changes shape: cache entries outlive deployments.
const key = (deviceId: string) => `poll:v5:${deviceId}`;

const assetTags = (...gifs: (ResolvedGif | undefined)[]) =>
  gifs.flatMap((g) => (g?.kind === "asset" ? [tag.asset(g.id)] : []));

async function loadBundle(deviceId: string) {
  const rows = await db().select().from(schema.devices).where(eq(schema.devices.id, deviceId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const owner = row.ownerUserId;
  const own = !row.followsOwner;
  const [{ timeZone, workHours }, look, presence, calendars, gifs, show, release, pushes, webhooks] = await Promise.all([
    userClock(owner),
    getLook(owner),
    own ? getLightStatus(row.id).then((r) => r.presence) : getPresence(owner),
    own ? Promise.resolve([]) : calendarsForUser(owner),
    resolveUserGifs(owner),
    own ? getLightShow(row.id) : getShow(owner),
    savedRelease(),
    followedPushes(row, nowSeconds()),
    hasLiveWebhooks(owner),
  ]);
  const device = withLook(row, look);
  const value: PollBundle = { device, timeZone, workHours, presence, calendars, gifs, show, release, pushes, webhooks };
  const tags = [
    tag.device(device.id),
    tag.user(owner),
    tag.team(device.teamId),
    ...(device.pushTeamId ? [tag.team(device.pushTeamId)] : []),
    tag.release,
    ...assetTags(...Object.values(gifs), show?.gif ?? undefined, ...pushes.map((p) => p.gif ?? undefined)),
  ];
  return { value, tags: [...new Set(tags)] };
}

// The light's bundle, if the token is right. Unknown lights and wrong tokens both give
// null, so callers can't tell which it was. `loaded`: this poll read it from the database
// (so the database is awake anyway).
export async function authenticatedBundle(
  deviceId: string,
  authHeader: string | null,
): Promise<{ bundle: PollBundle; loaded: boolean } | null> {
  const token = bearerToken(authHeader);
  if (!token) return null;
  const { bundle, loaded } = await cachedBundle(deviceId, "poll");
  if (!bundle || !tokenMatches(token, bundle.device.tokenHash)) return null;
  return { bundle, loaded };
}

// The light's bundle with no token check, for callers that have checked who's asking
// some other way (the Status page's live check, lib/live.ts). It's the same entry the
// light's poll reads, so a check right after a poll is a cache hit, and the other way round.
export async function cachedBundle(deviceId: string, who: string): Promise<{ bundle: PollBundle | null; loaded: boolean }> {
  const { value: bundle, loaded } = await cachedRead(key(deviceId), POLL_BUNDLE_TTL_SEC, () => loadBundle(deviceId));
  if (loaded) console.info(`[db] ${who} ${deviceId}: read from the database (cache miss)`);
  return { bundle, loaded };
}
