#pragma once

#include "status_engine.h"

namespace leds {
void begin();
// The status sets the colour; `choice` (from bzzy::chooseLeds) says how the ring moves.
// `nowUnix` is the clock (0 if not set), used to time the meeting warning.
void show(bzzy::Status s, const bzzy::LedChoice& choice, uint32_t nowUnix);
// Call often; animates patterns, the "unknown" breathing and colour changes.
void tick(uint32_t nowMs);
}  // namespace leds
