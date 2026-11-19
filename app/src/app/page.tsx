import type { Metadata } from "next";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { Landing } from "@/components/landing";
import { STATUS_META } from "@/components/status-meta";
import { Button, Card, CardHeader, Container, StatusDot } from "@/components/ui";
import { LiveSync } from "@/components/live-sync";
import { refreshStaleCalendars, scheduleForUser, userClock } from "@/lib/calendar";
import { devicesForUser } from "@/lib/devices";
import { BUILTIN_GIFS, defaultPreviewSrcs, gifsForUser, previewSrc, resolveDeviceGifs } from "@/lib/gifs";
import { isOnline } from "@/lib/poll-writes";
import { gifPrefsForUser } from "@/lib/gif-prefs";
import { getPresence } from "@/lib/presence";
import { liveVersionFor } from "@/lib/live";
import { isDark, signTicket } from "@/lib/live-rules";
import { hasFeature, nowSeconds, showVisible, STATUSES } from "@/lib/protocol";
import { resolveScreen, screenText, viewFor } from "@/lib/screen";
import { getCurrentUser } from "@/lib/session";
import { ringNow } from "@/lib/push-rules";
import { ringFor } from "@/lib/ring";
import { pushForDevice } from "@/lib/pushes";
import { getShow } from "@/lib/show";
import { REPO_URL, SITE_NAME, SITE_URL } from "@/lib/site";
import { sharedTeamsForUser } from "@/lib/teams";
import { workWindows } from "@/lib/work-hours";

import { relativeTime } from "./(app)/devices/relative-time";
import { clearShowAction, clearStatus } from "./actions";
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

// The one public page: search engines should list it as https://bzzy.ca/ whichever of the
// redirecting domains or ?query variants they found it through.
export const metadata: Metadata = { alternates: { canonical: "/" } };

// Structured data for search engines: the site's name (shown above the result) and who makes it.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      alternateName: ["bzzy.ca", "bzzy status light"],
      inLanguage: "en-CA",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/logo.png`,
      sameAs: [REPO_URL],
    },
  ],
};

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <>
      <script
        type="application/ld+json"
        // Static and ours, but escape "<" anyway as the Next.js JSON-LD guide recommends.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
      {/* Signed-out visitors get this fallback too, so it stays blank rather than app-shaped. */}
      <Suspense fallback={<div className="min-h-[70vh]" aria-busy="true" />}>
        <HomeContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function HomeContent({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const user = await getCurrentUser();
  if (!user) return <Landing />;

  const now = nowSeconds();
  await refreshStaleCalendars(user.id);
  const [presence, { schedule }, devices, show, uploads, prefs, clock] = await Promise.all([
    getPresence(user.id),
    scheduleForUser(user.id, now),
    devicesForUser(user.id),
    getShow(user.id),
    gifsForUser(user.id),
    gifPrefsForUser(user.id),
    userClock(user.id),
  ]);
  // "Show now" on the GIFs page links here with ?show=<choice>: start with it picked.
  const { show: picked } = await searchParams;
  const pick = typeof picked === "string" ? picked : undefined;
  // Favourites first, then the few shown most recently, then the rest: with a big
  // library, what you reach for is at the top of the Show now picker.
  const all: LibraryGif[] = [
    ...uploads.map((g) => ({
      choice: `asset:${g.id}`,
      name: g.name,
      src: `/api/gifs/${g.id}`,
    })),
    ...BUILTIN_GIFS.map((g) => ({
      choice: `builtin:${g.id}`,
      name: g.name,
      src: g.path,
      builtin: true,
    })),
  ];
  const favourites = all.filter((g) => prefs.get(g.choice)?.favourite);
  const recent = all
    .filter((g) => !prefs.get(g.choice)?.favourite && (prefs.get(g.choice)?.lastShownAt ?? 0) > 0)
    .sort((a, b) => prefs.get(b.choice)!.lastShownAt - prefs.get(a.choice)!.lastShownAt)
    .slice(0, 6);
  const lifted = new Set([...favourites, ...recent].map((g) => g.choice));
  const library: LibraryGif[] = [
    ...favourites.map((g) => ({ ...g, section: "Favourites" as const })),
    ...recent.map((g) => ({ ...g, section: "Recently shown" as const })),
    ...all.filter((g) => !lifted.has(g.choice)),
  ];
  // Lights that show this person's status (team devices can belong to others).
  // Online ones first, so the preview opens on a light that's showing what it says.
  const mine = devices
    .filter((d) => d.ownerUserId === user.id)
    .sort((a, b) => Number(isOnline(b.lastSeenAt, now * 1000, b.pollSec)) - Number(isOnline(a.lastSeenAt, now * 1000, a.pollSec)));
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
          leds: mine.some((d) => d.ring.allowFlash) ? show.leds : null,
        }
      : null;
  const current = schedule.find((b) => b.start <= now && now < b.end);
  const next = schedule.find((b) => b.start > now);
  // "3:30 PM", the way the screen writes it (screen.ts untilLabel: fixed UTC-7).
  const at = (sec: number) => new Date(sec * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Etc/GMT+7" });
  // Outside working hours a light with firmware that knows about them is dark.
  const windows = workWindows(clock.workHours, clock.timeZone, now);
  const nextOn = windows.find((w) => w.start > now);
  const darkLabel = isDark(windows, now) ? `Off hours${nextOn ? ` · on at ${at(nextOn.start)}` : ""}` : null;
  const previews: PreviewDevice[] =
    mine.length > 0
      ? await Promise.all(
          mine.map(async (d) => {
            const gifs = await resolveDeviceGifs(d.id);
            const resolved = resolveScreen({ now, defaultStatus: d.defaultStatus, presence, schedule });
            const ringPush = push && d.pushTeamId === push.teamId ? push : null;
            const ringShow = !ringPush && show && showVisible(show, presence, now) ? show : null;
            return {
              id: d.id,
              name: d.name,
              offline: isOnline(d.lastSeenAt, now * 1000, d.pollSec)
                ? null
                : d.lastSeenAt
                  ? `Offline · seen ${relativeTime(d.lastSeenAt, now * 1000)}`
                  : "Never connected",
              view: viewFor(resolved),
              gifs: Object.fromEntries(STATUSES.map((s) => [s, previewSrc(gifs[s])])) as PreviewDevice["gifs"],
              ring: ringFor({ ...d.ring, status: resolved.status, schedule, now, push: ringPush, show: ringShow }),
              // Without their show now's: what a new show with no ring of its own gets.
              baseRing: ringFor({ ...d.ring, status: resolved.status, schedule, now, push: ringPush }),
              dark: hasFeature(d.features, "hours") ? darkLabel : null,
              allowFlash: d.ring.allowFlash,
              styles: Object.fromEntries(
                STATUSES.map((s) => [s, ringFor({ ...d.ring, meetingWarn: null, status: s, schedule: [], now })]),
              ) as PreviewDevice["styles"],
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
    ? {
        status: live.status,
        source: "manual",
        text: live.text,
        until: live.until,
        updatedAt: live.updatedAt,
        untilLabel: live.until ? at(live.until) : undefined,
      }
    : current
      ? { status: current.status, source: "calendar" }
      : null;

  const shown = live ?? current ?? null;
  const summary = (
    <div className="min-w-0">
      {liveShow ? (
        // A GIF or message is up, so that's what the light shows, not the status.
        <p className="flex min-w-0 items-center gap-2">
          {liveShow.gifSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- tiny animated thumbnail
            <img src={liveShow.gifSrc} alt="" className="size-5 shrink-0 rounded bg-black object-cover" />
          ) : (
            <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded bg-black text-[0.5625rem] font-semibold text-white/85">
              Aa
            </span>
          )}
          <span className="min-w-0 truncate">
            <span className="font-semibold">Showing {liveShow.gifName ?? "a message"}</span>
            {liveShow.gifName && liveShow.text && <span className="text-muted"> · {liveShow.text}</span>}
          </span>
        </p>
      ) : shown ? (
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
          {liveShow
            ? liveShow.push
              ? `Pushed by ${liveShow.push.team} · press your light's button to dismiss`
              : `Show now · ${liveShow.until ? `until ${at(liveShow.until)}` : "until you take it down"}`
            : live
              ? `Set by you · ${live.until ? `until ${at(live.until)}` : "until you change it"}`
              : current
                ? `From your calendar · until ${at(current.end)}`
                : next
                  ? `Following your calendar · ${STATUS_META[next.status].label.toLowerCase()} at ${at(next.start)}`
                  : "Following your calendar and each light's default"}
        </p>
        {liveShow
          ? !liveShow.push && (
              <form action={clearShowAction}>
                <Button size="sm">Take it down</Button>
              </form>
            )
          : live && (
              <form action={clearStatus}>
                <Button size="sm">Back to automatic</Button>
              </form>
            )}
      </div>
    </div>
  );

  // Keeps the preview in step with the lights while the page is open (lib/live-rules.ts).
  const ticket = mine.length > 0 ? signTicket(user.id, mine.map((d) => d.id), now) : null;
  const version = ticket ? await liveVersionFor(user.id, mine.map((d) => d.id)) : null;

  return (
    <AppShell>
      {ticket && <LiveSync ticket={ticket} version={version} />}
      <Container className="max-lg:pt-0">
        <StudioProvider library={library} live={liveShow} initialShow={library.some((g) => g.choice === pick) ? pick : undefined}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8">
            <StudioPreview devices={previews} example={mine.length === 0} summary={summary} />
            <div className="space-y-6">
              <Card>
                <CardHeader
                  title="Set your status"
                  description="Overrides your calendar until it ends."
                />
                <StatusControls active={active} className="mt-5" />
              </Card>
              <Card id="show" className="scroll-mt-48 lg:scroll-mt-20">
                <CardHeader
                  title="Show something"
                  description="A GIF or message on your light right now. A press of its button takes it down."
                />
                <ShowNowControls className="mt-5" flashOff={mine.length > 0 && mine.every((d) => !d.ring.allowFlash)} />
              </Card>
            </div>
          </div>
        </StudioProvider>
      </Container>
    </AppShell>
  );
}
