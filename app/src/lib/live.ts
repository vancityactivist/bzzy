import "server-only";

import { scheduleFromCalendars } from "./calendar";
import { type LiveInput, liveVersion } from "./live-rules";
import { cachedBundle, type PollBundle } from "./poll-bundle";
import { isOnline } from "./poll-writes";
import { hasFeature } from "./protocol";
import { liveSeen } from "./seen";
import { workWindows } from "./work-hours";

// The fingerprint of what a person's lights show (lib/live-rules.ts), from the runtime
// cache only while nothing has changed: each light's poll bundle and its "last seen".
// Null when none of the lights is theirs any more.
export async function liveVersionFor(userId: string, deviceIds: string[], nowMs = Date.now()): Promise<string | null> {
  const bundles = (await Promise.all(deviceIds.map((id) => cachedBundle(id, "live"))))
    .map((r) => r.bundle)
    .filter((b): b is PollBundle => !!b && b.device.ownerUserId === userId);
  if (bundles.length === 0) return null;
  const seen = await liveSeen(bundles.map((b) => b.device));
  const now = Math.floor(nowMs / 1000);
  const lights: LiveInput[] = bundles.map((b, i) => {
    const d = b.device;
    return {
      // Not the firmware release, the webhook flag or when it was last seen (saved every
      // few hours): none of them changes the preview, and "online" below covers seen.
      data: { ...b, release: null, webhooks: false, device: { ...d, lastSeenAt: null } },
      ownerUserId: d.ownerUserId,
      defaultStatus: d.defaultStatus,
      presence: b.presence,
      show: b.show,
      pushes: b.pushes,
      schedule: scheduleFromCalendars(b.calendars, now),
      ring: { allowFlash: d.allowFlash, ledStyles: d.ledStyles, meetingWarn: d.meetingWarn },
      hours: hasFeature(d.features, "hours") ? workWindows(b.workHours, b.timeZone, now) : null,
      online: isOnline(seen[i].lastSeenAt, nowMs, seen[i].pollSec),
    };
  });
  return liveVersion(lights, now);
}
