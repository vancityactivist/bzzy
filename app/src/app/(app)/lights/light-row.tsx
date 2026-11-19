import Link from "next/link";

import { ChevronRightIcon } from "@/components/icons";
import { cx } from "@/components/ui";
import type { DeviceSummary } from "@/lib/devices";
import { isOnline } from "@/lib/poll-writes";

import { relativeTime } from "./relative-time";

// The team a light is in, which is also whose announcements it shows.
export function teamLabel(d: DeviceSummary) {
  if (!d.teamPersonal) return d.teamName;
  return d.pushTeamName ? `${d.pushTeamName} announcements` : "Just you";
}

// One line under a light's name: whose status it shows, its team and anything about its
// firmware worth knowing.
export function lightSummary(d: DeviceSummary, team: string, firmware: string | null) {
  return [d.followsOwner ? "Follows you" : "Its own status", team, firmware].filter(Boolean).join(" · ");
}

export function LightRow({ d, now, line }: { d: DeviceSummary; now: number; line: string }) {
  const online = isOnline(d.lastSeenAt, now, d.pollSec);
  return (
    <li>
      <Link
        href={`/lights/${d.id}`}
        className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span aria-hidden className={cx("size-2.5 shrink-0 rounded-full", online ? "bg-free" : "border-2 border-line-strong")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{d.name}</span>
          <span className="block text-sm text-pretty text-muted">
            {online ? "Online" : d.lastSeenAt ? `Seen ${relativeTime(d.lastSeenAt, now)}` : "Never connected"} · {line}
          </span>
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted" />
      </Link>
    </li>
  );
}
