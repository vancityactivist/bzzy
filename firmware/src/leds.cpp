#include "leds.h"

#include <FastLED.h>
#include <string.h>

#include "config.h"
#include "led_pattern.h"

namespace leds {

static CRGB g_leds[cfg::kLedCount];
static CRGB g_target = CRGB::Black;
static CRGB g_current = CRGB::Black;
static bzzy::Status g_status = bzzy::Status::Unknown;

// The style being played and when it started (millis), so patterns begin at the start
// of a cycle and a style's "for" counts from when it appeared.
static bzzy::LedStyle g_style;
static bool g_warning = false;
static uint32_t g_styleStartMs = 0;

static CRGB colorFor(bzzy::Status s) {
  switch (s) {
    case bzzy::Status::Free: return CRGB(0, 200, 40);
    case bzzy::Status::Busy: return CRGB(255, 20, 0);
    case bzzy::Status::Dnd: return CRGB(160, 0, 255);
    case bzzy::Status::Away: return CRGB(255, 140, 0);
    case bzzy::Status::Unknown: default: return CRGB(80, 80, 80);
  }
}

static bool sameStyle(const bzzy::LedStyle& a, const bzzy::LedStyle& b) {
  return a.set == b.set && a.pattern == b.pattern && a.hasColor == b.hasColor && a.color == b.color &&
         a.speed == b.speed && a.forSec == b.forSec;
}

void begin() {
  FastLED.addLeds<WS2812B, PIN_LED_DATA, GRB>(g_leds, cfg::kLedCount);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, cfg::kLedMaxMilliamps);
  FastLED.setBrightness(cfg::kLedBrightness);
  FastLED.clear(true);
}

void show(bzzy::Status s, const bzzy::LedChoice& choice, uint32_t nowUnix) {
  const uint32_t ms = millis();
  const bool changed = s != g_status || choice.warning != g_warning || !sameStyle(choice.style, g_style);
  if (changed) {
    g_styleStartMs = ms;
    // A meeting warning that began before this moment (say, after a reboot) carries on
    // where it would have been, so its "for" still ends on time.
    if (choice.warning && choice.startedAt && nowUnix > choice.startedAt) {
      g_styleStartMs = ms - (nowUnix - choice.startedAt) * 1000u;
    }
  }
  g_status = s;
  g_style = choice.style;
  g_warning = choice.warning;
  g_target = choice.style.set && choice.style.hasColor
                 ? CRGB((choice.style.color >> 16) & 0xFF, (choice.style.color >> 8) & 0xFF, choice.style.color & 0xFF)
                 : colorFor(s);
}

void tick(uint32_t nowMs) {
  static uint32_t last = 0;
  if (nowMs - last < 20) return;  // ~50 fps is plenty
  last = nowMs;

  // Fade towards the target colour so changes don't look like glitches.
  g_current = blend(g_current, g_target, 24);

  if (g_status == bzzy::Status::Unknown && !g_warning) {
    CRGB c = g_current;
    c.nscale8(beatsin8(12, 40, 255));  // slow breathe: "I don't know right now"
    fill_solid(g_leds, cfg::kLedCount, c);
  } else {
    uint8_t level[cfg::kLedCount];
    bzzy::renderPattern(g_style, nowMs - g_styleStartMs, level, cfg::kLedCount);
    for (uint16_t i = 0; i < cfg::kLedCount; ++i) {
      CRGB c = g_current;
      c.nscale8_video(level[i]);
      g_leds[i] = c;
    }
  }
  FastLED.show();
}

}  // namespace leds
