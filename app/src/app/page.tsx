import { Suspense } from "react";

import { Landing } from "@/components/landing";
import { STATUS_META } from "@/components/status-meta";
import { Button, Card, CardHeader, Container, StatusDot } from "@/components/ui";
import { refreshStaleCalendars, scheduleForUser } from "@/lib/calendar";
import { devicesForUser } from "@/lib/devices";
import { BUILTIN_GIFS, defaultPreviewSrcs, gifsForUser, previewSrc, resolveDeviceGifs } from "@/lib/gifs";
import { getPresence } from "@/lib/presence";
import { nowSeconds, showVisible, STATUSES } from "@/lib/protocol";
import { resolveScreen, screenText, viewFor } from "@/lib/screen";
import { getCurrentUser } from "@/lib/session";
import { ringNow } from "@/lib/push-rules";
import { pushForDevice } from "@/lib/pushes";
import { getShow } from "@/lib/show";
import { sharedTeamsForUser } from "@/lib/teams";

import { clearStatus } from "./actions";
import {
  type ActiveStatus,
  type LibraryGif,
  type LiveShow,
  type PreviewDevice,
  ShowNowControls,
  StatusControls,
  StudioPreview,
  StudioProvider,
} from "./studio";

export default function Home() {
  return (
    // Signed-out visitors get this fallback too, so it stays blank rather than app-shaped.
    <Suspense fallback={<div className="min-h-[70vh]" aria-busy="true" />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const user = await getCurrentUser();
  if (!user) return <Landing />;

  const now = nowSeconds();
  await refreshStaleCalendars(user.id);
  const [presence, { schedule }, devices, show, uploads] = await Promise.all([
    getPresence(user.id),
    scheduleForUser(user.id, now),
    devicesForUser(user.id),
    getShow(user.id),
    gifsForUser(user.id),
  ]);
  const library: LibraryGif[] = [
    ...uploads.map((g) => ({
      choice: `asset:${g.id}`,
      name: g.name,
      src: `/api/gifs/${g.id}`,
    })),
    ...BUILTIN_GIFS.map((g) => ({
      choice: `builtin:${g.id}`,
      name: g.name,
      src: g.path,
    })),
  ];
  // Lights that show this person's status (team devices can belong to others).
  const mine = devices.filter((d) => d.ownerUserId === user.id);
  // A team push beats their own show now. It's the same on all their lights that
  // follow that team, so take the first one that has one.
  const following = mine.find((d) => d.pushTeamId);
  const push = following ? await pushForDevice(following, now) : null;
  const pushTeam = push ? ((await sharedTeamsForUser(user.id)).find((t) => t.id === push.teamId)?.name ?? null) : null;
  const liveShow: LiveShow | null = push
    ? {
        text: screenText(push.text),
        until: push.until,
        gifSrc: previewSrc(push.gif),
        gifName: push.gif?.name ?? null,
        push: { team: pushTeam ?? "your team", leds: ringNow(push.leds, push.updatedAt, now) },
      }
    : show && showVisible(show, presence, now)
      ? {
          text: screenText(show.text),
          until: show.until,
          gifSrc: previewSrc(show.gif),
          gifName: show.gif?.name ?? null,
        }
      : null;
  const current = schedule.find((b) => b.start <= now && now < b.end);
  const next = schedule.find((b) => b.start > now);
  // "3:30 PM", the way the screen writes it (screen.ts untilLabel: fixed UTC-7).
  const at = (sec: number) => new Date(sec * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Etc/GMT+7" });
  const previews: PreviewDevice[] =
    mine.length > 0
      ? await Promise.all(
          mine.map(async (d) => {
            const gifs = await resolveDeviceGifs(d.id);
            return {
              id: d.id,
              name: d.name,
              view: viewFor(resolveScreen({ now, defaultStatus: d.defaultStatus, presence, schedule })),
              gifs: Object.fromEntries(STATUSES.map((s) => [s, previewSrc(gifs[s])])) as PreviewDevice["gifs"],
            };
          }),
        )
      : [
          {
            id: "example",
            name: "How a new light would look",
            view: viewFor(resolveScreen({ now, defaultStatus: "free", presence, schedule })),
            gifs: defaultPreviewSrcs(),
          },
        ];
  const live = presence?.active && (presence.until === 0 || presence.until > now) ? presence : null;
  const active: ActiveStatus | null = live
    ? { status: live.status, source: "manual" }
    : current
      ? { status: current.status, source: "calendar" }
      : null;

  const shown = live ?? current ?? null;
  const summary = (
    <div className="min-w-0">
      {shown ? (
        <p className="flex min-w-0 items-center gap-2">
          <StatusDot status={shown.status} size="lg" />
          <span className="min-w-0 truncate">
            <span className="font-semibold">{STATUS_META[shown.status].label}</span>
            {shown.text && <span className="text-muted"> · {shown.text}</span>}
          </span>
        </p>
      ) : (
        <p className="flex items-center gap-2">
          <span aria-hidden className="size-3 shrink-0 rounded-full border-2 border-line-strong" />
          <span className="font-semibold">Automatic</span>
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-xs text-muted lg:text-sm">
          {live
            ? `Set by you · ${live.until ? `until ${at(live.until)}` : "until you change it"}`
            : current
              ? `From your calendar · until ${at(current.end)}`
              : next
                ? `Following your calendar · ${STATUS_META[next.status].label.toLowerCase()} at ${at(next.start)}`
                : "Following your calendar and each light's default"}
        </p>
        {live && (
          <form action={clearStatus}>
            <Button size="sm">Back to automatic</Button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <Container className="max-lg:pt-0">
      <StudioProvider library={library} live={liveShow}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8">
          <StudioPreview devices={previews} example={mine.length === 0} summary={summary} />
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Set your status"
                description="Tap one to set it. It overrides your calendar until it runs out or you go back to automatic."
              />
              <StatusControls active={active} className="mt-5" />
            </Card>
            <Card>
              <CardHeader
                title="Show something"
                description="Put a GIF or a message on your screen right now. The light keeps your status colour, and a press of its button takes it down."
              />
              <ShowNowControls className="mt-5" />
            </Card>
          </div>
        </div>
      </StudioProvider>
    </Container>
  );
}
