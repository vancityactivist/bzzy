#include "led_pattern.h"

#include <math.h>
#include <string.h>

namespace bzzy {

static const char* const kNames[] = {"solid", "pulse", "blink", "strobe", "spin"};

const char* patternName(Pattern p) {
  const size_t i = static_cast<size_t>(p);
  return i < sizeof(kNames) / sizeof(kNames[0]) ? kNames[i] : "solid";
}

bool parsePattern(const char* name, Pattern& out) {
  if (!name) return false;
  for (size_t i = 0; i < sizeof(kNames) / sizeof(kNames[0]); ++i) {
    if (strcmp(name, kNames[i]) == 0) {
      out = static_cast<Pattern>(i);
      return true;
    }
  }
  return false;
}

static int hexDigit(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

bool parseColor(const char* hex, uint32_t& out) {
  if (!hex || hex[0] != '#' || strlen(hex) != 7) return false;
  uint32_t v = 0;
  for (int i = 1; i < 7; ++i) {
    const int d = hexDigit(hex[i]);
    if (d < 0) return false;
    v = (v << 4) | static_cast<uint32_t>(d);
  }
  out = v;
  return true;
}

static uint8_t clampSpeed(uint8_t s) { return s < 1 ? 1 : (s > 3 ? 3 : s); }

uint32_t patternPeriodMs(Pattern p, uint8_t speed) {
  const uint8_t s = clampSpeed(speed);
  switch (p) {
    case Pattern::Pulse:
      return 4000 >> (s - 1);  // 4 s, 2 s, 1 s
    case Pattern::Blink:
    case Pattern::Strobe: {
      // 1, 2 or 3 flashes a second, never more than kMaxFlashHz.
      const uint32_t hz = s < kMaxFlashHz ? s : kMaxFlashHz;
      return 1000 / hz;
    }
    case Pattern::Spin:
      return s == 1 ? 2000 : (s == 2 ? 1000 : 667);  // 0.5, 1, 1.5 turns a second
    case Pattern::Solid:
    default:
      return 0;
  }
}

void renderPattern(const LedStyle& style, uint32_t elapsedMs, uint8_t* out, size_t n) {
  if (n == 0) return;
  const bool steady = !style.set || style.pattern == Pattern::Solid ||
                      (style.forSec && elapsedMs >= static_cast<uint32_t>(style.forSec) * 1000u);
  if (steady) {
    memset(out, 255, n);
    return;
  }
  const uint32_t period = patternPeriodMs(style.pattern, style.speed);
  const uint32_t t = elapsedMs % period;

  switch (style.pattern) {
    case Pattern::Pulse: {
      // Starts bright, eases down to 25% and back up.
      const float phase = static_cast<float>(t) / static_cast<float>(period);
      const float wave = 0.5f + 0.5f * cosf(phase * 2.0f * static_cast<float>(M_PI));  // 1 -> 0 -> 1
      const uint8_t v = static_cast<uint8_t>(64.0f + 191.0f * wave + 0.5f);
      memset(out, v, n);
      return;
    }
    case Pattern::Blink:
      memset(out, t < period / 2 ? 255 : 0, n);
      return;
    case Pattern::Strobe:
      memset(out, t < kStrobeOnMs ? 255 : 0, n);
      return;
    case Pattern::Spin: {
      // The head moves one LED at a time; four LEDs at full, then a tail of halves.
      const size_t head = static_cast<size_t>((static_cast<uint64_t>(t) * n) / period) % n;
      for (size_t i = 0; i < n; ++i) {
        const size_t behind = (head + n - i) % n;  // 0 = the head itself
        uint8_t v = 0;
        if (behind < 4) v = 255;
        else if (behind < 7) v = static_cast<uint8_t>(255u >> (behind - 3));  // 127, 63, 31
        out[i] = v;
      }
      return;
    }
    case Pattern::Solid:
    default:
      memset(out, 255, n);
      return;
  }
}

}  // namespace bzzy
