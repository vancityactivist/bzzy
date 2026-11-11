import { Suspense } from "react";

import { Landing } from "@/components/landing";
import { STATUS_META } from "@/components/status-meta";
import { getPresence } from "@/lib/presence";
import { nowSeconds, STATUSES, TEXT_MAX } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";

import { clearStatus, setStatus } from "./actions";

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

  const presence = await getPresence(user.id);
  const now = nowSeconds();
  const live = presence?.active && (presence.until === 0 || presence.until > now) ? presence : null;

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-line bg-card p-6">
        <p className="text-sm text-muted">Right now</p>
        {live ? (
          <div className="mt-2 flex items-center gap-3">
            <span className={`h-4 w-4 rounded-full ${STATUS_META[live.status].bg}`} />
            <span className="text-2xl font-semibold">{STATUS_META[live.status].label}</span>
            {live.text && <span className="text-muted">· {live.text}</span>}
          </div>
        ) : (
          <p className="mt-2 text-2xl font-semibold">Automatic</p>
        )}
        <p className="mt-1 text-sm text-muted">
          {live
            ? live.until
              ? `Until ${new Date(live.until * 1000).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver" })}`
              : "Until you change it"
            : "Following your calendar and each device's default."}
        </p>
        {live && (
          <form action={clearStatus} className="mt-4">
            <button className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-background">
              Back to automatic
            </button>
          </form>
        )}
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
          <input
            name="text"
            maxLength={TEXT_MAX}
            placeholder="On a call, back at 3"
            className="mt-1 w-full rounded-md border border-line bg-card px-3 py-2"
          />
        </label>
      </form>
    </div>
  );
}
