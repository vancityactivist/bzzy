// The look of a person's lights (lib/look.ts), and how it lands on one light. Pure, so the
// poll, the previews, the API and the tests agree.

import type { Status } from "./protocol";
import type { LedStyles, MeetingWarn } from "./ring";

// What every light that follows a person shows: their status between meetings, how the
// ring moves for each status, and the meeting warning. The GIF for each status is in
// user_gif (lib/gifs.ts).
export type Look = { defaultStatus: Status; ledStyles: LedStyles | null; meetingWarn: MeetingWarn | null };

export const DEFAULT_LOOK: Look = { defaultStatus: "free", ledStyles: null, meetingWarn: null };

type LookFields = { followsOwner: boolean; defaultStatus: Status; ledStyles: LedStyles | null; meetingWarn: MeetingWarn | null };

// A light row with its owner's look in place of the old per-light columns. A light that
// follows its owner shows their "between meetings" status; one that doesn't keeps its own.
// Either way the ring styles are the owner's.
export function withLook<T extends LookFields>(device: T, look: Look): T {
  return {
    ...device,
    defaultStatus: device.followsOwner ? look.defaultStatus : device.defaultStatus,
    ledStyles: look.ledStyles,
    meetingWarn: look.meetingWarn,
  };
}
