#pragma once

#include "status_engine.h"

namespace leds {
void begin();
// The status sets the colour; `choice` (from bzzy::chooseLeds) says how the ring moves.
// `nowUnix` is the clock (0 if not set), used to time the meeting warning.
void show(bzzy::Status s, const bzzy::LedChoice& choice, uint32_t nowUnix);
// Call often; animates patterns, the "unknown" breathing and colour changes.
void tick(uint32_t nowMs);
// Outside working hours: fade the ring out and keep it dark until set back.
void setOff(bool off);

// While the light is being set up, the ring says so instead of showing a status:
// a slow white breathe while it waits for you, warm bronze while it shows its pairing
// code, and two green flashes when a step is done.
enum class Setup : uint8_t { None, Waiting, Pairing, Done };
void setSetup(Setup mode);
}  // namespace leds
