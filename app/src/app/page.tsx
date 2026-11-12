import { Suspense } from "react";

import { Landing } from "@/components/landing";
import { STATUS_META } from "@/components/status-meta";
import { Container } from "@/components/ui";
import { refreshStaleCalendars, scheduleForUser } from "@/lib/calendar";
import { devicesForUser } from "@/lib/devices";
import { BUILTIN_GIFS, defaultPreviewSrcs, gifsForUser, previewSrc, resolveDeviceGifs } from "@/lib/gifs";
import { getPresence } from "@/lib/presence";
import { nowSeconds, showVisible, STATUSES } from "@/lib/protocol";
import { resolveScreen, screenText, viewFor } from "@/lib/screen";
import { getCurrentUser } from "@/lib/session";
import { getShow } from "@/lib/show";

import { clearStatus } from "./actions";
import {
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
    <Suspense
      fallback={
        <Container>
          <p className="text-muted">Loading…</p>
        </Container>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const user = await getCurrentUser();
  if (!user)
    return (
      <Landing />
    );

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
  const liveShow: LiveShow | null =
    show && showVisible(show, presence, now)
      ? {
          text: screenText(show.text),
          until: show.until,
          gifSrc: previewSrc(show.gif),
          gifName: show.gif?.name ?? null,
        }
      : null;
  const current = schedule.find((b) => b.start <= now && now < b.end);
  const next = schedule.find((b) => b.start > now);
  const at = (sec: number) =>
    new Date(sec * 1000).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver" });
  // Lights that show this person's status (team devices can belong to others).
  const mine = devices.filter((d) => d.ownerUserId === user.id);
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

  const summary = (
    <div className="text-center">
      {live ? (
        <div className="flex items-center justify-center gap-2">
          <span className={`h-3 w-3 rounded-full ${STATUS_META[live.status].bg}`} />
          <span className="font-semibold">{STATUS_META[live.status].label}</span>
          {live.text && <span className="text-muted">· {live.text}</span>}
        </div>
      ) : current ? (
        <div className="flex items-center justify-center gap-2">
          <span className={`h-3 w-3 rounded-full ${STATUS_META[current.status].bg}`} />
          <span className="font-semibold">{STATUS_META[current.status].label}</span>
          {current.text && <span className="text-muted">· {current.text}</span>}
        </div>
      ) : (
        <p className="font-semibold">Automatic</p>
      )}
      <p className="mt-1 text-sm text-muted">
        {live
          ? live.until
            ? `Until ${at(live.until)}`
            : "Until you change it"
          : current
            ? `From your calendar, until ${at(current.end)}`
            : next
              ? `Following your calendar. Next: ${STATUS_META[next.status].label.toLowerCase()} at ${at(next.start)}`
              : "Following your calendar and each device's default."}
      </p>
      {live && (
        <form action={clearStatus} className="mt-3">
          <button className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-background">Back to automatic</button>
        </form>
      )}
    </div>
  );

  return (
    <Container>
      <StudioProvider library={library} live={liveShow}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          <section className="sticky top-14 z-10 -mx-4 -mt-8 flex sm:-mx-6 sm:px-6 flex-col items-center gap-4 border-b border-line bg-background/90 px-4 py-2 backdrop-blur lg:top-20 lg:mx-0 lg:mt-0 lg:rounded-xl lg:border lg:bg-card lg:p-6 lg:backdrop-blur-none">
            <StudioPreview devices={previews} />
            <div className="hidden w-full border-t border-line pt-4 lg:block">{summary}</div>
          </section>

          <div className="space-y-8">
            <div className="rounded-xl border border-line bg-card p-4 lg:hidden">{summary}</div>
            <section className="rounded-xl border border-line bg-card p-6">
              <h2 className="font-semibold">Show something</h2>
              <p className="mb-4 mt-1 text-sm text-muted">
                Put a GIF or a message on your screen right now. Your status light stays the same colour, and pressing the button on the light
                takes it down.
              </p>
              <ShowNowControls />
            </section>
            <section className="rounded-xl border border-line bg-card p-6">
              <h2 className="font-semibold">Set your status</h2>
              <p className="mb-4 mt-1 text-sm text-muted">Overrides your calendar until it runs out or you go back to automatic.</p>
              <StatusControls />
            </section>
          </div>
        </div>
      </StudioProvider>
    </Container>
  );
}
