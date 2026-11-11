#pragma once

#include "status_engine.h"

namespace leds {
void begin();
void show(bzzy::Status s);
// Call often; animates the "unknown" breathing and status transitions.
void tick(uint32_t nowMs);
}  // namespace leds
