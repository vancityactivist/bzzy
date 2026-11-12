import { Suspense } from "react";

import { Landing } from "@/components/landing";
import { STATUS_META } from "@/components/status-meta";
import { refreshStaleCalendars, scheduleForUser } from "@/lib/calendar";
import { devicesForUser } from "@/lib/devices";
import { defaultPreviewSrcs, previewSrc, resolveDeviceGifs } from "@/lib/gifs";
import { getPresence } from "@/lib/presence";
import { nowSeconds, STATUSES } from "@/lib/protocol";
import { resolveScreen, viewFor } from "@/lib/screen";
import { getCurrentUser } from "@/lib/session";

import { clearStatus, setStatus } from "./actions";
import { DraftProvider, LivePreview, MessageInput, type PreviewDevice } from "./status-preview";

export default function Home() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <HomeContent />
    </Suspense>
  );
}

const DURATIONS = [
  { minutes: 0, label: "Until I change it" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
];

async function HomeContent() {
  const user = await getCurrentUser();
  if (!user) return <Landing />;

  const now = nowSeconds();
  await refreshStaleCalendars(user.id);
  const [presence, { schedule }, devices] = await Promise.all([
    getPresence(user.id),
    scheduleForUser(user.id, now),
    devicesForUser(user.id),
  ]);
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

  return (
    <DraftProvider>
      <div className="space-y-8">
        <section className="flex flex-col gap-6 rounded-xl border border-line bg-card p-6 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">Right now</p>
            {live ? (
              <div className="mt-2 flex items-center gap-3">
                <span className={`h-4 w-4 rounded-full ${STATUS_META[live.status].bg}`} />
                <span className="text-2xl font-semibold">{STATUS_META[live.status].label}</span>
                {live.text && <span className="text-muted">· {live.text}</span>}
              </div>
            ) : current ? (
              <div className="mt-2 flex items-center gap-3">
                <span className={`h-4 w-4 rounded-full ${STATUS_META[current.status].bg}`} />
                <span className="text-2xl font-semibold">{STATUS_META[current.status].label}</span>
                {current.text && <span className="text-muted">· {current.text}</span>}
              </div>
            ) : (
              <p className="mt-2 text-2xl font-semibold">Automatic</p>
            )}
            <p className="mt-1 text-sm text-muted">
              {live
                ? live.until
                  ? `Until ${new Date(live.until * 1000).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver" })}`
                  : "Until you change it"
                : current
                  ? `From your calendar, until ${at(current.end)}`
                  : next
                    ? `Following your calendar. Next: ${STATUS_META[next.status].label.toLowerCase()} at ${at(next.start)}`
                    : "Following your calendar and each device's default."}
            </p>
            {live && (
              <form action={clearStatus} className="mt-4">
                <button className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-background">
                  Back to automatic
                </button>
              </form>
            )}
          </div>
          <LivePreview devices={previews} />
        </section>

        <form action={setStatus} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {STATUSES.map((s) => (
              <button
                key={s}
                name="status"
                value={s}
                className={`rounded-xl px-4 py-6 text-lg font-semibold text-white ${STATUS_META[s].bg} hover:opacity-90 focus:outline-none focus-visible:ring-4 ${STATUS_META[s].ring} ring-offset-2`}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>

          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 text-sm text-muted">For how long</legend>
            {DURATIONS.map((d, i) => (
              <label key={d.minutes} className="cursor-pointer">
                <input type="radio" name="minutes" value={d.minutes} defaultChecked={i === 0} className="peer sr-only" />
                <span className="block rounded-full border border-line px-3 py-1.5 text-sm peer-checked:bg-foreground peer-checked:text-background">
                  {d.label}
                </span>
              </label>
            ))}
          </fieldset>

          <label className="block">
            <span className="text-sm text-muted">Message on the screen (optional)</span>
            <MessageInput />
          </label>
        </form>
      </div>
    </DraftProvider>
  );
}
