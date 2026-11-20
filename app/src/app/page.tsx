import type { Metadata } from "next";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { Landing } from "@/components/landing";
import { STATUS_META } from "@/components/status-meta";
import Link from "next/link";

import { Button, Card, Container, cx, StatusDot } from "@/components/ui";
import { LiveSync } from "@/components/live-sync";
import { refreshStaleCalendars, scheduleForUser, userClock } from "@/lib/calendar";
import { devicesForUser } from "@/lib/devices";
import { BUILTIN_GIFS, defaultPreviewSrcs, gifsForUser, previewSrc, resolveUserGifs } from "@/lib/gifs";
import { getLightShow, getLightStatus } from "@/lib/light-state";
import { isOnline } from "@/lib/poll-writes";
import { gifPrefsForUser } from "@/lib/gif-prefs";
import { getPresence } from "@/lib/presence";
import { liveVersionFor } from "@/lib/live";
import { isDark, signTicket } from "@/lib/live-rules";
import { type Block, hasFeature, nowSeconds, showVisible, STATUSES } from "@/lib/protocol";
import { resolveScreen, screenText, viewFor } from "@/lib/screen";
import { getCurrentUser } from "@/lib/session";
import { ringNow } from "@/lib/push-rules";
import { allowedRing, ringFor } from "@/lib/ring";
import { pushForDevice } from "@/lib/pushes";
import { getShow } from "@/lib/show";
import { REPO_URL, SITE_NAME, SITE_URL } from "@/lib/site";
import { sharedTeamsForUser } from "@/lib/teams";
import { workWindows } from "@/lib/work-hours";

import { relativeTime } from "./(app)/lights/relative-time";
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
  StudioTabs,
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
  const [devices, uploads, prefs, clock, gifs, params] = await Promise.all([
    devicesForUser(user.id),
    gifsForUser(user.id),
    gifPrefsForUser(user.id),
    userClock(user.id),
    resolveUserGifs(user.id),
    searchParams,
  ]);
  // Lights that show this person's status (team devices can belong to others), online
  // ones first, so the preview draws a light that's showing what it says.
  const online = (d: (typeof devices)[number]) => isOnline(d.lastSeenAt, now * 1000, d.pollSec);
  const mine = devices.filter((d) => d.ownerUserId === user.id).sort((a, b) => Number(online(b)) - Number(online(a)));
  const followers = mine.filter((d) => d.followsOwner);
  const ownLights = mine.filter((d) => !d.followsOwner);
  // ?light=<id>: one of their lights with its own status. Otherwise: them.
  const target = ownLights.find((d) => d.id === params.light) ?? null;
  const shown = target ? [target] : followers;

  const [presence, { schedule }, show] = await Promise.all([
    target ? getLightStatus(target.id).then((r) => r.presence) : getPresence(user.id),
    target ? Promise.resolve({ schedule: [] as Block[] }) : scheduleForUser(user.id, now),
    target ? getLightShow(target.id) : getShow(user.id),
  ]);
  // "Show now" on the GIFs library links here with ?show=<choice>: start with it picked.
  const pick = typeof params.show === "string" ? params.show : undefined;
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
  // A team push beats their own show now. It's the same on all their lights that
  // follow that team, so take the first one that has one.
  const following = shown.find((d) => d.pushTeamId);
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
          leds: allowedRing(show.leds, shown.some((d) => d.ring.allowFlash)),
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
  const statusGifs = Object.fromEntries(STATUSES.map((s) => [s, previewSrc(gifs[s])])) as PreviewDevice["gifs"];
  const previews: PreviewDevice[] =
    shown.length > 0
      ? shown.map((d) => {
          const resolved = resolveScreen({ now, defaultStatus: d.defaultStatus, presence, schedule });
          const ringPush = push && d.pushTeamId === push.teamId ? push : null;
          const ringShow = !ringPush && show && showVisible(show, presence, now) ? show : null;
          return {
            id: d.id,
            name: d.name,
            offline: online(d) ? null : d.lastSeenAt ? `Offline · seen ${relativeTime(d.lastSeenAt, now * 1000)}` : "Never connected",
            view: viewFor(resolved),
            gifs: statusGifs,
            ring: ringFor({ ...d.ring, status: resolved.status, schedule, now, push: ringPush, show: ringShow }),
            // Without their show now's: what a new show with no ring of its own gets.
            baseRing: ringFor({ ...d.ring, status: resolved.status, schedule, now, push: ringPush }),
            dark: hasFeature(d.features, "hours") ? darkLabel : null,
            allowFlash: d.ring.allowFlash,
            styles: Object.fromEntries(
              STATUSES.map((s) => [s, ringFor({ ...d.ring, meetingWarn: null, status: s, schedule: [], now })]),
            ) as PreviewDevice["styles"],
          };
        })
      : [
          {
            id: "example",
            name: "How a new light would look",
            view: viewFor(resolveScreen({ now, defaultStatus: "free", presence, schedule })),
            gifs: mine.length > 0 ? statusGifs : defaultPreviewSrcs(),
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

  const between = STATUS_META[(target ?? shown[0])?.defaultStatus ?? "free"].label;
  const showing = live ?? current ?? null;
  const names = shown.map((d) => d.name);
  const lightsLabel = target ? target.name : names.length === 0 ? "Your lights" : names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
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
      ) : showing ? (
        <p className="flex min-w-0 items-center gap-2">
          <StatusDot status={showing.status} size="lg" />
          <span className="min-w-0 truncate">
            <span className="font-semibold">{STATUS_META[showing.status].label}</span>
            {showing.text && <span className="text-muted"> · {showing.text}</span>}
          </span>
        </p>
      ) : (
        <p className="flex items-center gap-2">
          <span aria-hidden className="size-3 shrink-0 rounded-full border-2 border-line-strong" />
          <span className="font-semibold">{target ? `${between} (between meetings)` : "Following your calendar"}</span>
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-xs text-muted lg:text-sm">
          {liveShow
            ? liveShow.push
              ? `Announcement from ${liveShow.push.team} · press a light's button to dismiss it`
              : `Show now · ${liveShow.until ? `until ${at(liveShow.until)}` : "until you stop it"}`
            : live
              ? `Set ${live.until ? `until ${at(live.until)}` : "until you change it"}`
              : current
                ? `From your calendar · until ${at(current.end)}`
                : target
                  ? "Nothing set"
                  : next
                    ? `${between} now · ${STATUS_META[next.status].label.toLowerCase()} at ${at(next.start)}`
                    : `${between} between meetings`}
        </p>
        {liveShow
          ? !liveShow.push && (
              <form action={clearShowAction}>
                {target && <input type="hidden" name="light" value={target.id} />}
                <Button size="sm">Stop showing</Button>
              </form>
            )
          : live && (
              <form action={clearStatus}>
                {target && <input type="hidden" name="light" value={target.id} />}
                <Button size="sm">{target ? `Back to ${between}` : "Back to calendar"}</Button>
              </form>
            )}
      </div>
    </div>
  );

  // Keeps the preview in step with the lights while the page is open (lib/live-rules.ts).
  const ids = shown.map((d) => d.id);
  const ticket = ids.length > 0 ? signTicket(user.id, ids, now) : null;
  const version = ticket ? await liveVersionFor(user.id, ids) : null;

  return (
    <AppShell>
      {ticket && <LiveSync ticket={ticket} version={version} />}
      <Container className="max-lg:pt-0">
        {ownLights.length > 0 && (
          // Whose status the page sets: theirs, or a light that has its own.
          <nav aria-label="Whose status" className="mb-4 max-lg:pt-4">
            <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-subtle p-1 [scrollbar-width:none]">
              {[{ id: null, label: followers.length ? `You · ${followers.map((d) => d.name).join(", ")}` : "You" }, ...ownLights.map((d) => ({ id: d.id, label: d.name }))].map(
                (t) => {
                  const on = (target?.id ?? null) === t.id;
                  return (
                    <Link
                      key={t.id ?? "me"}
                      href={t.id ? `/?light=${t.id}` : "/"}
                      aria-current={on ? "page" : undefined}
                      className={cx(
                        "flex h-9 shrink-0 items-center rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                        on ? "bg-card text-foreground shadow-card" : "text-muted hover:text-foreground",
                      )}
                    >
                      {t.label}
                    </Link>
                  );
                },
              )}
            </div>
          </nav>
        )}
        <StudioProvider
          key={target?.id ?? "me"}
          library={library}
          live={liveShow}
          light={target?.id ?? null}
          lightsLabel={lightsLabel}
          initialShow={library.some((g) => g.choice === pick) ? pick : undefined}
        >
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8">
            <StudioPreview devices={previews} example={shown.length === 0} summary={summary} />
            <Card id="show" className="scroll-mt-48 lg:scroll-mt-20">
              <StudioTabs
                statusHint={
                  target
                    ? `${target.name} shows this until it ends. A press of its button changes it too.`
                    : `${lightsLabel} ${names.length === 1 ? "shows" : "show"} this instead of your calendar until it ends.`
                }
                showHint={`A GIF or message on ${target ? target.name : names.length === 1 ? names[0] : "your lights"} right now. A press of ${target || names.length === 1 ? "its" : "a"} button takes it down.`}
                status={<StatusControls active={active} />}
                show={<ShowNowControls flashOff={shown.length > 0 && shown.every((d) => !d.ring.allowFlash)} />}
              />
            </Card>
          </div>
        </StudioProvider>
      </Container>
    </AppShell>
  );
}
