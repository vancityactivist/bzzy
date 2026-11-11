// bzzy: a desk busy light.
//
// The main loop owns the status State. The network task (net.cpp) fetches fresh
// state from the companion app; the main loop merges it, saves a copy to flash,
// and works out what to show from the cached copy. So if Wi-Fi or the app goes
// away, the light keeps following the last-known calendar and button presses.

#include <Arduino.h>
#include <LittleFS.h>

#include "config.h"
#include "display.h"
#include "leds.h"
#include "net.h"
#include "protocol.h"
#include "status_engine.h"
#include "touch.h"

static bzzy::State g_state;
static bzzy::Settings g_engineCfg;
static uint32_t g_savedHash = 0;

// ---- flash cache ----
static constexpr const char* kCachePath = "/state.json";

static uint32_t fnv1a(const String& s) {
  uint32_t h = 2166136261u;
  for (size_t i = 0; i < s.length(); ++i) h = (h ^ (uint8_t)s[i]) * 16777619u;
  return h;
}

static void loadCache() {
  File f = LittleFS.open(kCachePath, "r");
  if (!f) return;
  String json = f.readString();
  f.close();
  if (bzzy::parseState(json.c_str(), json.length(), g_state)) {
    g_savedHash = fnv1a(json);
    Serial.printf("[cache] restored %u calendar blocks\n", (unsigned)g_state.blockCount);
  }
}

static void saveCacheIfChanged() {
  String json = bzzy::serializeState(g_state);
  uint32_t h = fnv1a(json);
  if (h == g_savedHash) return;  // spare the flash: write only on change
  File f = LittleFS.open(kCachePath, "w");
  if (!f) return;
  f.print(json);
  f.close();
  g_savedHash = h;
}

// ---- button ----
static bool buttonDown() { return digitalRead(PIN_BUTTON) == LOW; }

static bool heldAtBoot() {
  uint32_t start = millis();
  while (buttonDown()) {
    if (millis() - start >= cfg::kSetupHoldMs) return true;
    delay(10);
  }
  return false;
}

static bool buttonPressed() {
  static bool last = false;
  static uint32_t changedAt = 0;
  bool now = buttonDown();
  if (now != last && millis() - changedAt > 30) {
    last = now;
    changedAt = millis();
    return now;  // fire on press, not release
  }
  return false;
}

// ---- main ----
void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  g_engineCfg.staleAfterSec = cfg::kStaleAfterSec;
  g_engineCfg.fallback = bzzy::Status::Unknown;

  leds::begin();
  display::begin();
  touch::begin();
  if (!LittleFS.begin(true)) Serial.println("[fs] LittleFS mount failed");
  loadCache();

  const bool wantSetupPage = heldAtBoot();
  net::begin(wantSetupPage);
}

void loop() {
  const uint32_t ms = millis();
  net::loop();

  static bzzy::State incoming;  // off the stack
  if (net::takeIncoming(incoming)) {
    bzzy::mergeFromServer(g_state, incoming, net::now());
    saveCacheIfChanged();
  }

  // A new GIF finished downloading: close the one on screen, swap files, redraw.
  if (net::gifsReady()) {
    display::releaseGif();
    net::installGifs();
    display::invalidate();
  }

  // Button press or screen tap: next status. Long press on the screen: back to automatic.
  const touch::Gesture g = touch::poll();
  const bool next = buttonPressed() || g == touch::Gesture::Tap;
  const bool toAuto = g == touch::Gesture::LongPress;
  if (next || toAuto) {
    if (toAuto) {
      bzzy::clearLocalOverride(g_state, net::now());
    } else {
      bzzy::cycleLocalOverride(g_state, net::now());
    }
    net::reportOverride(g_state.manual);
    saveCacheIfChanged();
  }

  const bzzy::Resolved r = bzzy::resolve(g_state, net::now(), g_engineCfg);

  const char* notice = nullptr;
  if (net::setupPortalOpen()) {
    notice = "Wi-Fi setup: join bzzy-setup";
  } else if (r.source == bzzy::Source::Fallback) {
    notice = net::now() ? "No recent calendar data" : "Waiting for the clock";
  }

  leds::show(r.status);
  display::show({r.status, r.text, r.source == bzzy::Source::Fallback ? 0 : r.until,
                 net::online(), notice});

  leds::tick(ms);
  display::tick(ms);
  delay(1);
}
