import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db";

import { scheduleForUser } from "./calendar";
import { defaultPreviewSrcs, previewSrc, resolveDeviceGifs } from "./gifs";
import { getPresence } from "./presence";
import { type LedStyle, pushFor, ringNow } from "./push-rules";
import { livePushes } from "./pushes";
import { showVisible, STATUSES, type Status } from "./protocol";
import { resolveScreen, type ScreenSource, type ScreenView, viewFor, withShow } from "./screen";
import { getShow } from "./show";
import type { TeamMemberRow } from "./teams";

// The team dashboard: one live card per member, built the same way the Status page
// builds its preview (and the device its screen), so an admin sees exactly what each
// light shows. Meeting titles only appear if that person turned them on, because the
// schedule is the one their own light gets.

export const ONLINE_WINDOW_MS = 2 * 60_000; // devices poll every 20 s; the Devices page uses the same window

export type MemberCard = {
  userId: string;
  name: string;
  role: TeamMemberRow["role"];
  view: ScreenView;
  gifSrc: string | null; // the GIF the screen shows right now
  status: Status;
  source: Exclude<ScreenSource, "fallback">;
  // For a manual status: whether it was set on a light or in the app.
  setOnLight: boolean;
  showing: boolean; // their own "show now" is up
  push: { id: string; teamId: string; text: string; leds: LedStyle | null } | null; // a team push is on their screen
  lights: { name: string; lastSeenAt: Date | null }[];
  online: boolean;
  lastSeenAt: Date | null;
};

export async function teamDashboard(members: TeamMemberRow[], now: number): Promise<MemberCard[]> {
  if (members.length === 0) return [];
  const ids = members.map((m) => m.userId);
  const [devices, sources] = await Promise.all([
    db()
      .select({
        id: schema.devices.id,
        name: schema.devices.name,
        ownerUserId: schema.devices.ownerUserId,
        defaultStatus: schema.devices.defaultStatus,
        lastSeenAt: schema.devices.lastSeenAt,
        pushTeamId: schema.devices.pushTeamId,
      })
      .from(schema.devices)
      .where(inArray(schema.devices.ownerUserId, ids))
      .orderBy(desc(schema.devices.lastSeenAt)),
    db()
      .select({ userId: schema.presence.userId, source: schema.presence.source })
      .from(schema.presence)
      .where(inArray(schema.presence.userId, ids)),
  ]);
  const sourceOf = new Map(sources.map((s) => [s.userId, s.source]));
  // Pushes from whichever team each person's main light follows.
  const mainOf = new Map<string, (typeof devices)[number]>();
  for (const d of devices) if (!mainOf.has(d.ownerUserId)) mainOf.set(d.ownerUserId, d);
  const pushes = await livePushes(
    [...mainOf.values()].map((d) => d.pushTeamId).filter((t): t is string => !!t),
    now,
  );
  const nowMs = now * 1000;

  return Promise.all(
    members.map(async (m) => {
      const lights = devices.filter((d) => d.ownerUserId === m.userId);
      // The card follows their most recently seen light (the list is newest first).
      const main = lights[0] ?? null;
      const [presence, { schedule }, show, gifs] = await Promise.all([
        getPresence(m.userId),
        scheduleForUser(m.userId, now),
        getShow(m.userId),
        main ? resolveDeviceGifs(main.id) : Promise.resolve(null),
      ]);
      const resolved = resolveScreen({ now, defaultStatus: main?.defaultStatus ?? "free", presence, schedule });
      const push = main?.pushTeamId ? pushFor(pushes.filter((p) => p.teamId === main.pushTeamId), m.userId, now) : null;
      const live = !push && show && showVisible(show, presence, now) ? show : null;
      const lastSeenAt = main?.lastSeenAt ?? null;
      const online = lastSeenAt !== null && nowMs - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
      const shown = push ?? live;
      const view = withShow(viewFor(resolved, online || !main), shown ? { text: shown.text, until: shown.until, gif: !!shown.gif } : null);
      const statusGifs = gifs
        ? (Object.fromEntries(STATUSES.map((s) => [s, previewSrc(gifs[s])])) as Record<Status, string | null>)
        : defaultPreviewSrcs();
      const source = sourceOf.get(m.userId);
      return {
        userId: m.userId,
        name: m.name ?? m.email ?? "Someone",
        role: m.role,
        view,
        gifSrc: shown?.gif ? previewSrc(shown.gif) : statusGifs[resolved.status],
        status: resolved.status,
        source: resolved.source,
        setOnLight: resolved.source === "manual" && !!source && source !== "web",
        showing: !!live,
        push: push ? { id: push.id, teamId: push.teamId, text: push.text, leds: ringNow(push.leds, push.updatedAt, now) } : null,
        lights: lights.map((d) => ({ name: d.name, lastSeenAt: d.lastSeenAt })),
        online,
        lastSeenAt,
      };
    }),
  );
}

// Whether `viewerId` may load an uploaded GIF for a dashboard card: they manage a
// shared team that the GIF's owner is in (or they're a superadmin). The asset lives in
// its uploader's personal team, so "the owner" is that team's member.
export async function canPreviewTeamAsset(viewerId: string, assetId: string) {
  const d = db();
  const [assetRows, viewerRows, viewerTeams] = await d.batch([
    d.select().from(schema.assets).where(eq(schema.assets.id, assetId)).limit(1),
    d.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, viewerId)).limit(1),
    d
      .select({ teamId: schema.teamMembers.teamId, role: schema.teamMembers.role, personal: schema.teams.personal })
      .from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
      .where(eq(schema.teamMembers.userId, viewerId)),
  ]);
  const asset = assetRows[0];
  if (!asset) return null;
  if (viewerRows[0]?.role === "admin") return asset;
  const managed = viewerTeams.filter((t) => !t.personal && t.role !== "member").map((t) => t.teamId);
  if (managed.length === 0) return null;
  // Anyone in the GIF's personal team (its owner) who is also in a team the viewer manages.
  const owners = d
    .select({ userId: schema.teamMembers.userId })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.teamId, asset.teamId));
  const shared = await d
    .select({ teamId: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .where(and(inArray(schema.teamMembers.teamId, managed), inArray(schema.teamMembers.userId, owners)))
    .limit(1);
  return shared.length > 0 ? asset : null;
}
