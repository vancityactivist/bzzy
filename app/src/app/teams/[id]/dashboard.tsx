import { DevicePreview } from "@/components/device-preview";
import { STATUS_META } from "@/components/status-meta";
import { Badge, Card, StatusDot } from "@/components/ui";
import type { MemberCard } from "@/lib/dashboard";
import { untilLabel } from "@/lib/screen";

import { absoluteTime, relativeTime } from "../../devices/relative-time";

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
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <li key={c.userId}>
            <Card padding="sm" className="flex h-full flex-col items-center text-center">
              <DevicePreview
                view={c.view}
                gifSrc={c.gifSrc}
                ring={c.push?.leds}
                scale={0.5}
                className={c.lights.length === 0 ? "m-3 opacity-60" : "m-3"}
              />
              <p className="mt-1 w-full truncate font-medium">{c.name}</p>
              <p className="flex items-center gap-1.5 text-sm">
                <StatusDot status={c.status} size="sm" />
                {STATUS_META[c.status].label}
              </p>
              <p className="mt-0.5 text-xs text-pretty text-muted">{sourceLine(c)}</p>
              <div className="mt-auto flex flex-wrap justify-center gap-1.5 pt-3">
                <LightBadge c={c} nowMs={nowMs} />
                {c.push ? <Badge tone="inverse">Push</Badge> : c.showing && <Badge tone="inverse">Show now</Badge>}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
