// LED ring patterns: pure maths, no Arduino, so it runs in native unit tests and the
// app's preview can mirror it (app/src/lib/led-pattern.ts, later).
//
// One "style" describes everything the ring can do. It comes from the app in three
// places (docs/protocol.md): a per-status style, the meeting warning, and (with team
// pushes) a push's flash. The firmware picks which one applies and renders it here.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace bzzy {

enum class Pattern : uint8_t {
  Solid = 0,  // steady colour, as before
  Pulse,      // smooth fade between 25% and 100%
  Blink,      // hard on/off, half the time each
  Strobe,     // short bursts, dark between
  Spin,       // a bright arc with a fading tail goes round the ring
};

const char* patternName(Pattern p);
// Returns false if the name is not recognised; `out` is left unchanged.
bool parsePattern(const char* name, Pattern& out);

// Nothing on/off goes faster than this, whatever the app sends. Keeps the light under
// the usual photosensitivity guideline (no more than 3 flashes a second).
constexpr uint32_t kMaxFlashHz = 3;
constexpr uint32_t kStrobeOnMs = 60;

struct LedStyle {
  bool set = false;  // false: no style here, use the next one down (or solid)
  Pattern pattern = Pattern::Solid;
  bool hasColor = false;  // false: the current status colour
  uint32_t color = 0;     // 0xRRGGBB
  uint8_t speed = 2;      // 1 slow, 2 normal, 3 fast; anything else is clamped
  uint16_t forSec = 0;    // after this long, go steady in the same colour; 0 = keep going
};

// Parses "#rrggbb". Returns false (leaving `out`) for anything else.
bool parseColor(const char* hex, uint32_t& out);

// How long one cycle takes, in ms. For Spin, one turn of the ring.
uint32_t patternPeriodMs(Pattern p, uint8_t speed);

// Brightness 0..255 for each of `n` LEDs, `elapsedMs` after the style started. LED 0 is
// the first one on the ring (D1); Spin goes up the indexes. After `forSec`, every LED
// is 255 (steady).
void renderPattern(const LedStyle& style, uint32_t elapsedMs, uint8_t* out, size_t n);

// "Flash my light N minutes before a meeting".
struct MeetingWarn {
  uint16_t minutes = 0;  // 0 = off
  LedStyle leds;
};

}  // namespace bzzy
