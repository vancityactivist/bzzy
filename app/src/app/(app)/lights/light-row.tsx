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

// The facts under a light's name: whose status it shows, its team and anything about its
// firmware worth knowing. Shown side by side with space between them, not joined by dots.
export function lightSummary(d: DeviceSummary, team: string, firmware: string | null) {
  return [d.followsOwner ? "Follows you" : "Its own status", team, firmware].filter((x): x is string => Boolean(x));
}

export function LightRow({ d, now, line }: { d: DeviceSummary; now: number; line: string | string[] }) {
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
          <span className="flex flex-wrap gap-x-3 text-sm text-muted">
            <span>{online ? "Online" : d.lastSeenAt ? `Seen ${relativeTime(d.lastSeenAt, now)}` : "Never connected"}</span>
            {[line].flat().map((part) => (
              <span key={part}>{part}</span>
            ))}
          </span>
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted" />
      </Link>
    </li>
  );
}
