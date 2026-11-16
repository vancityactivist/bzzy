import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

import { type ApiShow, apiStatus, type ApiStatus, iso } from "./api-rules";
import { cachedRead, tag } from "./cache";
import { calendarsForUser, type CalendarRow, refreshCalendar, scheduleFromCalendars, staleCalendars, userClock } from "./calendar";
import type { ResolvedGif } from "./gifs";
import { isOnline } from "./poll-writes";
import { type Presence, showVisible, type Status } from "./protocol";
import { type LedStyle, pushAsShow, pushFor } from "./push-rules";
import { livePushes, type Push } from "./pushes";
import { ringFor, type LedStyles, type MeetingWarn } from "./ring";
import { resolveScreen, type ScreenLayout, viewFor, withShow } from "./screen";
import { liveSeen } from "./seen";
import { type CurrentShow, getShow } from "./show";
import { inWorkHours, type WorkHours, workWindows } from "./work-hours";

// What the API's read endpoints need about one person, kept in the runtime cache like a
// light's poll bundle (lib/poll-bundle.ts), so an integration polling GET /v1/status
// doesn't wake Postgres. It's saved under the person's u- tag, each light's d- tag and
// the t- tag of each team their lights follow, which the writes that change any of it
// already expire (docs/caching.md). Time-dependent answers are worked out per request.

type Light = {
  id: string;
  name: string;
  defaultStatus: Status;
  pushTeamId: string | null;
  allowFlash: boolean;
  ledStyles: LedStyles | null;
  meetingWarn: MeetingWarn | null;
  firmwareVersion: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
};

export type ApiSnapshot = {
  userId: string;
  name: string | null;
  timeZone: string;
  workHours: WorkHours | null;
  presence: Presence | null;
  presenceSource: string | null;
  show: CurrentShow | null;
  calendars: CalendarRow[];
  lights: Light[];
  pushes: Push[];
};

const key = (userId: string) => `api:v1:${userId}`;
const SNAPSHOT_TTL_SEC = 3 * 3600;

async function load(userId: string) {
  const [lights, clock, presenceRows, show, calendars, userRows] = await Promise.all([
    db()
      .select({
        id: schema.devices.id,
        name: schema.devices.name,
        defaultStatus: schema.devices.defaultStatus,
        pushTeamId: schema.devices.pushTeamId,
        allowFlash: schema.devices.allowFlash,
        ledStyles: schema.devices.ledStyles,
        meetingWarn: schema.devices.meetingWarn,
        firmwareVersion: schema.devices.firmwareVersion,
        lastSeenAt: schema.devices.lastSeenAt,
        createdAt: schema.devices.createdAt,
      })
      .from(schema.devices)
      .where(eq(schema.devices.ownerUserId, userId))
      .orderBy(schema.devices.createdAt),
    userClock(userId),
    db().select().from(schema.presence).where(eq(schema.presence.userId, userId)).limit(1),
    getShow(userId),
    calendarsForUser(userId),
    db().select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)).limit(1),
  ]);
  const teams = [...new Set(lights.map((l) => l.pushTeamId).filter((t): t is string => !!t))];
  const pushes = await livePushes(teams);
  const p = presenceRows[0];
  const value: ApiSnapshot = {
    userId,
    name: userRows[0]?.name ?? userRows[0]?.email ?? null,
    timeZone: clock.timeZone,
    workHours: clock.workHours,
    presence: p ? { active: p.active, status: p.status, text: p.text, until: p.until, updatedAt: p.updatedAt } : null,
    presenceSource: p?.source ?? null,
    show,
    calendars,
    lights,
    pushes,
  };
  const assetTags = [show?.gif, ...pushes.map((x) => x.gif)].flatMap((g) => (g?.kind === "asset" ? [tag.asset(g.id)] : []));
  const tags = [tag.user(userId), ...lights.map((l) => tag.device(l.id)), ...teams.map((t) => tag.team(t)), ...assetTags];
  return { value, tags: [...new Set(tags)] };
}

export async function apiSnapshot(userId: string): Promise<ApiSnapshot> {
  const { value, loaded } = await cachedRead(key(userId), SNAPSHOT_TTL_SEC, () => load(userId));
  if (loaded) console.info(`[db] api: snapshot for ${userId} read from the database (cache miss)`);
  return value!;
}

// Re-read any calendar that's due, after answering, the way a light's poll does. Without
// this a person with no light polling would get an old calendar from the API.
export async function refreshDueCalendars(snap: ApiSnapshot) {
  const stale = await staleCalendars(snap.calendars);
  await Promise.all(stale.map((c) => refreshCalendar(c, snap.timeZone)));
}

const offHours = (snap: ApiSnapshot, now: number) =>
  !!snap.workHours && !inWorkHours(workWindows(snap.workHours, snap.timeZone, now), now);

// ---- GET /v1/status ----

export function statusFrom(snap: ApiSnapshot, now: number): ApiStatus {
  return apiStatus({
    now,
    // Status with no light, or for the person as a whole: their first light's default.
    defaultStatus: snap.lights[0]?.defaultStatus ?? "free",
    presence: snap.presence,
    presenceSource: snap.presenceSource,
    schedule: scheduleFromCalendars(snap.calendars, now),
    offHours: offHours(snap, now),
  });
}

// ---- GET /v1/show ----

export const gifId = (g: ResolvedGif) => (g ? `${g.kind}:${g.id}` : null);
const gifOut = (g: ResolvedGif) => (g ? { id: gifId(g)!, name: g.name } : null);

export function showFrom(snap: ApiSnapshot, now: number): ApiShow | null {
  const s = snap.show;
  if (!s || !showVisible(s, snap.presence, now)) return null;
  const pushUp = snap.lights.some((l) => !!pushForLight(snap, l, now));
  return { text: s.text, gif: gifOut(s.gif), ring: s.leds, until: iso(s.until), setAt: iso(s.updatedAt), hiddenByPush: pushUp };
}

// ---- GET /v1/lights ----

function pushForLight(snap: ApiSnapshot, light: Light, now: number): Push | null {
  if (!light.pushTeamId) return null;
  return pushFor(
    snap.pushes.filter((p) => p.teamId === light.pushTeamId),
    snap.userId,
    now,
  );
}

export type ApiLight = {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
  firmwareVersion: string | null;
  // Outside working hours the screen and ring are off.
  dark: boolean;
  screen: { layout: ScreenLayout; status: ApiStatus["status"]; text: string; until: string | null };
  ring: LedStyle | null;
  push: { id: string; text: string; gif: { id: string; name: string } | null } | null;
};

export async function lightsFrom(snap: ApiSnapshot, now: number): Promise<ApiLight[]> {
  const schedule = scheduleFromCalendars(snap.calendars, now);
  const dark = offHours(snap, now);
  const seen = await liveSeen(snap.lights);
  const { presence, show } = snap;
  return seen.map((l) => {
    const resolved = resolveScreen({ now, defaultStatus: l.defaultStatus, presence, schedule });
    const push = pushForLight(snap, l, now);
    const ownShow = !push && show && showVisible(show, presence, now) ? show : null;
    const onScreen = push
      ? { ...pushAsShow(push, presence, now), gif: !!push.gif }
      : ownShow
        ? { text: ownShow.text, until: ownShow.until, gif: !!ownShow.gif }
        : null;
    const view = withShow(viewFor(resolved), onScreen);
    return {
      id: l.id,
      name: l.name,
      online: isOnline(l.lastSeenAt, now * 1000, l.pollSec),
      lastSeenAt: l.lastSeenAt?.toISOString() ?? null,
      firmwareVersion: l.firmwareVersion,
      dark,
      screen: { layout: view.layout, status: resolved.status, text: view.text, until: iso(view.until) },
      ring: ringFor({ ...l, status: resolved.status, schedule, now, push, show: ownShow }),
      push: push ? { id: push.id, text: push.text, gif: gifOut(push.gif) } : null,
    };
  });
}
