// Pure status logic: no Arduino dependencies, so it runs in native unit tests.
//
// Decides what the light should show right now from three sources, in priority order:
//   1. A manual override (from the button on the device, or the companion app).
//   2. A calendar block that covers "now" (cached from the companion app).
//   3. The default status.
// When the cached data is too old to trust, the fallback status replaces 2 and 3.
#pragma once

#include <stdint.h>
#include <stddef.h>

#include "led_pattern.h"

namespace bzzy {

enum class Status : uint8_t {
  Free = 0,
  Busy,
  Dnd,
  Away,
  Unknown,  // shown when we can't trust what we know (stale data, no clock)
};

const char* statusName(Status s);
// Returns false if the name is not recognised; `out` is left unchanged.
bool parseStatus(const char* name, Status& out);

constexpr size_t kTextMax = 48;
constexpr size_t kMaxBlocks = 32;

struct Override {
  bool active = false;
  Status status = Status::Free;
  char text[kTextMax] = {0};
  uint32_t until = 0;      // unix seconds; 0 = until cleared
  uint32_t updatedAt = 0;  // unix seconds; newer override wins when merging
  bool local = false;      // set from the device button (not yet reported to the app)
};

// "Show now" from the app: a GIF and/or a message on the screen, whatever the
// status is. The status still decides the LED colour and the screen's colours.
struct Show {
  bool active = false;
  bool hasGif = false;      // the GIF itself is downloaded to the "show" slot
  char gifSha[17] = {0};    // which GIF; the screen waits until this one is on flash
  char text[kTextMax] = {0};
  uint32_t until = 0;       // unix seconds; 0 = until cleared
  uint32_t updatedAt = 0;   // unix seconds
};

// A team push (docs/protocol.md): an admin's message and/or GIF. Its content arrives in
// `show`; this says that the show is a push, which no status change hides, only the
// person dismissing it with the button.
constexpr size_t kPushIdMax = 40;
struct Push {
  bool active = false;     // `show` is this push
  char id[kPushIdMax] = {0};
  uint32_t updatedAt = 0;  // unix seconds it was sent; its flash is timed from here
  LedStyle leds;           // unset: the ring stays on the status
};

struct Block {
  uint32_t start = 0;
  uint32_t end = 0;
  Status status = Status::Busy;
  char text[kTextMax] = {0};
};

struct State {
  Override manual;
  Show show;
  Block blocks[kMaxBlocks];
  size_t blockCount = 0;
  Status defaultStatus = Status::Free;
  uint32_t lastSync = 0;  // unix seconds of last successful sync; 0 = never
  // How the ring animates for each status (Free, Busy, Dnd, Away). Unset = solid.
  LedStyle ledStyles[4];
  MeetingWarn meetingWarn;
  Push push;
  // The push the person dismissed on this light. Kept across syncs (the app keeps
  // sending it until it hears about the dismissal) and in the cache.
  char dismissedPush[kPushIdMax] = {0};
};

struct Settings {
  uint32_t staleAfterSec = 24 * 3600;
  Status fallback = Status::Unknown;
};

enum class Source : uint8_t { Manual, Calendar, Default, Fallback };

struct Resolved {
  Status status;
  Source source;
  const char* text;  // points into State, or "" when there is none
  uint32_t until;    // when this result is expected to change; 0 = unknown
};

// `now` is unix seconds, or 0 if the clock is not set yet.
Resolved resolve(const State& st, uint32_t now, const Settings& cfg = Settings());

// Whether "show now" is on screen. It hides when it expires, and when the status was
// changed after it was put up (a button press, a long press, or the app), so the
// most recent thing someone did wins. A calendar change doesn't hide it. When the
// show is a team push, only dismissing it (or it ending) hides it: see pushVisible.
bool showVisible(const State& st, uint32_t now);

// Whether a team push is on screen: it's live and the person hasn't dismissed it.
bool pushVisible(const State& st, uint32_t now);

// A press while a push is on screen dismisses it, instead of changing the status.
// Returns true if it did; the caller reports st.dismissedPush to the app.
bool dismissPush(State& st);

// Which LED style applies now, highest first: a push's flash, the meeting warning (a
// meeting starts within its minutes), then the style for the shown status, then solid.
// `startedAt` is the unix time the push or warning began, or 0 for a status style (the
// caller times that from when the status last changed).
struct LedChoice {
  LedStyle style;  // style.set == false: solid status colour
  bool warning = false;
  bool push = false;
  uint32_t startedAt = 0;
};
LedChoice chooseLeds(const State& st, Status shown, uint32_t now);

// Replace the cached server data with a fresh copy, keeping a local button
// override if it is newer than the server's manual override, and a dismissed push
// while the server still sends it.
void mergeFromServer(State& cached, const State& fromServer, uint32_t now);

// Button press or screen tap: Free -> Busy -> Dnd -> back to automatic (override cleared).
void cycleLocalOverride(State& st, uint32_t now);

// Long press on the screen: straight back to automatic (calendar / default).
void clearLocalOverride(State& st, uint32_t now);

}  // namespace bzzy
