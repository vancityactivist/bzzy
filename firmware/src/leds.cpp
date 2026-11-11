#include "leds.h"

#include <FastLED.h>

#include "config.h"

namespace leds {

static CRGB g_leds[cfg::kLedCount];
static CRGB g_target = CRGB::Black;
static CRGB g_current = CRGB::Black;
static bzzy::Status g_status = bzzy::Status::Unknown;

static CRGB colorFor(bzzy::Status s) {
  switch (s) {
    case bzzy::Status::Free: return CRGB(0, 200, 40);
    case bzzy::Status::Busy: return CRGB(255, 20, 0);
    case bzzy::Status::Dnd: return CRGB(160, 0, 255);
    case bzzy::Status::Away: return CRGB(255, 140, 0);
    case bzzy::Status::Unknown: default: return CRGB(80, 80, 80);
  }
}

void begin() {
  FastLED.addLeds<WS2812B, PIN_LED_DATA, GRB>(g_leds, cfg::kLedCount);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, cfg::kLedMaxMilliamps);
  FastLED.setBrightness(cfg::kLedBrightness);
  FastLED.clear(true);
}

void show(bzzy::Status s) {
  g_status = s;
  g_target = colorFor(s);
}

void tick(uint32_t nowMs) {
  static uint32_t last = 0;
  if (nowMs - last < 20) return;  // ~50 fps is plenty
  last = nowMs;

  // Fade towards the target colour so changes don't look like glitches.
  g_current = blend(g_current, g_target, 24);
  CRGB c = g_current;
  if (g_status == bzzy::Status::Unknown) {
    c.nscale8(beatsin8(12, 40, 255));  // slow breathe: "I don't know right now"
  }
  fill_solid(g_leds, cfg::kLedCount, c);
  FastLED.show();
}

}  // namespace leds
