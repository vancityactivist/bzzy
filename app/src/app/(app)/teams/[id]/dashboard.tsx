import { DevicePreview } from "@/components/device-preview";
import { STATUS_META } from "@/components/status-meta";
import { Badge, Card, StatusDot } from "@/components/ui";
import type { MemberCard } from "@/lib/dashboard";
import { untilLabel } from "@/lib/screen";

import { absoluteTime, relativeTime } from "../../lights/relative-time";

// One live card per person: their light's screen as it is now, and where the status
// came from. Server-rendered; AutoRefresh re-renders it every 20 s.

function sourceLine(c: MemberCard): string {
  const until = c.view.until ? `, ${untilLabel(c.view.until)}` : "";
  switch (c.source) {
    case "manual":
      return `${c.setOnLight ? "Set on their light" : "Set in the app"}${until}`;
    case "calendar":
      return `From their calendar${until}`;
    default:
      return c.view.until ? `Their default, next meeting ${untilLabel(c.view.until).replace(/^until /, "at ")}` : "Their default";
  }
}

function LightBadge({ c, nowMs }: { c: MemberCard; nowMs: number }) {
  if (c.lights.length === 0) return <Badge>No light</Badge>;
  if (c.online) return <Badge tone="free">Online</Badge>;
  if (!c.lastSeenAt) return <Badge>Never connected</Badge>;
  return <Badge title={absoluteTime(c.lastSeenAt)}>Last seen {relativeTime(c.lastSeenAt, nowMs)}</Badge>;
}

export function Dashboard({ cards, nowMs }: { cards: MemberCard[]; nowMs: number }) {
  const online = cards.filter((c) => c.online).length;
  const counts = cards.reduce<Record<string, number>>((n, c) => ({ ...n, [c.status]: (n[c.status] ?? 0) + 1 }), {});
  return (
    <section aria-labelledby="dashboard-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="dashboard-heading" className="font-semibold tracking-tight">
          Right now
        </h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {(["free", "busy", "dnd", "away"] as const)
            .filter((s) => counts[s])
            .map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <StatusDot status={s} size="sm" />
                {counts[s]} {STATUS_META[s].label.toLowerCase()}
              </span>
            ))}
          <span>
            {online} of {cards.length} lights online, updates every 20 s
          </span>
        </p>
      </div>
      {/* Phones: a compact row per person (a small screen beside the name), so the whole
          team fits on a screen or two. sm up: a grid of cards. */}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <li key={c.userId}>
            <Card padding="sm" className="flex h-full items-center gap-3 max-sm:py-2.5 sm:flex-col sm:gap-0 sm:text-center">
              <div className="shrink-0 max-sm:[zoom:0.42]">
                <DevicePreview
                  view={c.view}
                  gifSrc={c.gifSrc}
                  ring={c.ring}
                  scale={0.5}
                  className={c.lights.length === 0 ? "m-3 opacity-60" : "m-3"}
                />
              </div>
              <div className="min-w-0 flex-1 sm:flex sm:w-full sm:flex-col sm:items-center">
                <p className="w-full truncate font-medium sm:mt-1">{c.name}</p>
                <p className="flex items-center gap-1.5 text-sm">
                  <StatusDot status={c.status} size="sm" />
                  {STATUS_META[c.status].label}
                </p>
                <p className="mt-0.5 text-xs text-pretty text-muted">{sourceLine(c)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5 sm:mt-auto sm:flex-row sm:flex-wrap sm:justify-center sm:pt-3">
                <LightBadge c={c} nowMs={nowMs} />
                {c.push ? <Badge tone="inverse">Announcement</Badge> : c.showing && <Badge tone="inverse">Show now</Badge>}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
