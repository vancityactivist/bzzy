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
#include "ota.h"
#include "protocol.h"
#include "setup_flow.h"
#include "status_engine.h"
#include "touch.h"

static bzzy::State g_state;
static bzzy::Settings g_engineCfg;
static uint32_t g_savedHash = 0;
static uint32_t g_splashAt = 0;
static bzzy::SetupFlow g_setupFlow;

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

// ---- buttons ----
static bool buttonDown() { return digitalRead(PIN_BUTTON) == LOW; }

#ifdef PIN_TOP_BUTTON
static bool topButtonDown() { return digitalRead(PIN_TOP_BUTTON) == LOW; }
#else
static bool topButtonDown() { return false; }
#endif

enum class Press { None, Short, Long };

// The top button works like the screen: a short press steps the status, holding it
// for a second goes back to automatic. A short press fires on release, so a long
// press doesn't also step the status.
static Press topButtonPoll() {
  static bool last = false;
  static uint32_t changedAt = 0;
  static bool longFired = false;
  const uint32_t ms = millis();
  const bool now = topButtonDown();
  if (now != last && ms - changedAt > 30) {
    last = now;
    changedAt = ms;
    if (now) {
      longFired = false;
    } else if (!longFired) {
      return Press::Short;
    }
  } else if (now && last && !longFired && ms - changedAt >= cfg::kLongPressMs) {
    longFired = true;
    return Press::Long;
  }
  return Press::None;
}

// Either button held while powering up opens the Wi-Fi setup page.
static bool heldAtBoot() {
  uint32_t start = millis();
  while (buttonDown() || topButtonDown()) {
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

// ---- setup screens ----
// The words and QR code for each setup step (lib/core setup_flow.h).
static display::SetupView setupView(const bzzy::SetupScreen& sc, const net::SetupInfo& si) {
  static char qr[128], line1[96], line2[96], host[64];
  display::SetupView v = {sc.step, sc.note, sc.number, sc.total, nullptr, "", "", "", false};
  bzzy::hostOf(si.apiBase, host, sizeof(host));
  switch (sc.note) {
    case bzzy::SetupNote::PhoneJoined:
      v.title = "Phone connected";
      v.line1 = "Now pick your Wi-Fi";
      v.line2 = "on your phone";
      return v;
    case bzzy::SetupNote::Online:
      v.title = "Wi-Fi connected";
      v.line1 = si.ssid;
      return v;
    case bzzy::SetupNote::Paired:
      v.title = "All set";
      v.line1 = si.pairedName[0] ? si.pairedName : "Added to bzzy";
      return v;
    case bzzy::SetupNote::None:
      break;
  }
  switch (sc.step) {
    case bzzy::SetupStep::JoinAp:
      if (bzzy::wifiQrPayload(si.apName, qr, sizeof(qr))) v.qr = qr;
      v.title = "Join this Wi-Fi";
      snprintf(line1, sizeof(line1), "Wi-Fi: %s", si.apName);
      v.line1 = line1;
      v.line2 = "Scan with your phone's camera";
      break;
    case bzzy::SetupStep::ChooseWifi:
      v.qr = "http://192.168.4.1";
      v.title = "Pick your Wi-Fi";
      v.line1 = "on the page that opened";
      v.line2 = "No page? Scan, or go to 192.168.4.1";
      break;
    case bzzy::SetupStep::Connecting:
      v.title = "Connecting";
      v.line1 = "Joining your Wi-Fi...";
      break;
    case bzzy::SetupStep::GetCode:
      v.title = "Add to bzzy";
      v.line1 = "Getting a code from";
      v.line2 = host;
      break;
    case bzzy::SetupStep::ShowCode:
      if (si.pairUrl[0]) {
        v.qr = si.pairUrl;
      } else {
        snprintf(qr, sizeof(qr), "%s/pair/%s", si.apiBase, si.code);
        v.qr = qr;
      }
      v.title = "Add to bzzy";
      bzzy::formatPairCode(si.code, line1, sizeof(line1));
      v.line1 = line1;
      v.bigLine1 = true;
      snprintf(line2, sizeof(line2), "or type it at %s/pair", host);
      v.line2 = line2;
      break;
    case bzzy::SetupStep::None:
      break;
  }
  return v;
}

// ---- main ----
void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
#ifdef PIN_TOP_BUTTON
  pinMode(PIN_TOP_BUTTON, INPUT_PULLUP);
#endif
  g_engineCfg.staleAfterSec = cfg::kStaleAfterSec;
  g_engineCfg.fallback = bzzy::Status::Unknown;

  leds::begin();
  display::begin();
  display::splash();  // every power-on
  g_splashAt = millis();
  touch::begin();
  if (!LittleFS.begin(true)) Serial.println("[fs] LittleFS mount failed");
  loadCache();
  ota::begin();

  const bool wantSetupPage = heldAtBoot();
  net::begin(wantSetupPage);
}

void loop() {
  const uint32_t ms = millis();
  net::loop();
  ota::loop(ms);

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

  const bool splashing = ms - g_splashAt < cfg::kSplashMs;

  // Being set up (Wi-Fi, then pairing): the setup screens and ring take over, and
  // presses do nothing. Checked a few times a second; the answer changes slowly.
  static net::SetupInfo si;
  static bzzy::SetupScreen setupScreen = {bzzy::SetupStep::None, bzzy::SetupNote::None, 0, 0};
  static uint32_t setupCheckedMs = 0;
  if (setupCheckedMs == 0 || ms - setupCheckedMs >= 200) {
    setupCheckedMs = ms | 1;
    net::setupInfo(si);
    setupScreen = g_setupFlow.update({si.portalOpen, si.apStations, si.wifiUp, si.paired, si.code[0] != '\0'}, ms);
  }
  if ((setupScreen.step != bzzy::SetupStep::None || setupScreen.note != bzzy::SetupNote::None) && ota::progress() < 0) {
    touch::poll();
    topButtonPoll();
    buttonPressed();
    leds::setSetup(setupScreen.note != bzzy::SetupNote::None    ? leds::Setup::Done
                   : setupScreen.step == bzzy::SetupStep::ShowCode ? leds::Setup::Pairing
                                                                  : leds::Setup::Waiting);
    if (!splashing) display::showSetup(setupView(setupScreen, si));
    leds::tick(ms);
    delay(1);
    return;
  }
  leds::setSetup(leds::Setup::None);

  // Outside working hours the light is dark. Any press wakes it for a few minutes
  // (and does nothing else); presses while it's awake work as usual and keep it awake.
  // Never dark while it has something to tell you (setup page, an update running).
  static uint32_t awakeUntilMs = 0;
  const bool busyNotice = ota::progress() >= 0 || net::setupPortalOpen();
  const bool offHours = !busyNotice && bzzy::offHours(g_state, net::now());
  const bool awake = awakeUntilMs != 0 && (int32_t)(awakeUntilMs - ms) > 0;
  if (!awake) awakeUntilMs = 0;

  // Button press or screen tap: next status. Long press on the screen or the top
  // button: back to automatic. While a team push is up, any press dismisses it
  // instead.
  const touch::Gesture g = touch::poll();
  const Press top = topButtonPoll();
  bool next = buttonPressed() || g == touch::Gesture::Tap || top == Press::Short;
  bool toAuto = g == touch::Gesture::LongPress || top == Press::Long;
  if ((next || toAuto) && offHours) {
    if (!awake) next = toAuto = false;  // this press only wakes it
    awakeUntilMs = (ms + cfg::kWakeMs) | 1;  // never 0, which means "not awake"
  }
  const bool dark = offHours && awakeUntilMs == 0;
  net::setFastPoll(offHours && !dark);
  if ((next || toAuto) && bzzy::dismissPush(g_state)) {
    net::reportPushAck(g_state.dismissedPush, net::now());
    saveCacheIfChanged();
  } else if (next || toAuto) {
    if (toAuto) {
      bzzy::clearLocalOverride(g_state, net::now());
    } else {
      bzzy::cycleLocalOverride(g_state, net::now());
    }
    net::reportOverride(g_state.manual);
    saveCacheIfChanged();
  }

  const bzzy::Resolved r = bzzy::resolve(g_state, net::now(), g_engineCfg);

  // Automatic updates wait for a moment when a restart won't matter.
  const bool showing = bzzy::showVisible(g_state, net::now());
  // A dark light is always a good moment.
  net::setQuiet(dark || (!showing && (r.status == bzzy::Status::Free || r.status == bzzy::Status::Away)));

  const char* notice = nullptr;
  static char updating[32];
  if (ota::progress() >= 0) {
    snprintf(updating, sizeof(updating), "Updating firmware %d%%", ota::progress());
    notice = updating;
  } else if (r.source == bzzy::Source::Fallback) {
    notice = net::now() ? "No recent calendar data" : "Waiting for the clock";
  }

  // "Show now" from the app replaces what's on the screen, not the status: the
  // LEDs and the screen's colours still say whether you can be interrupted.
  display::View view = {display::Layout::Status, r.status, r.text,
                        r.source == bzzy::Source::Fallback ? 0 : r.until, net::online(), notice};
  const bzzy::Show& show = g_state.show;
  if (bzzy::showVisible(g_state, net::now())) {
    // Until its GIF has downloaded, a show with a message shows just the message.
    if (show.hasGif && net::gifInstalled(bzzy::kShowSlot, show.gifSha)) {
      view.layout = display::Layout::ShowGif;
    } else if (show.text[0]) {
      view.layout = display::Layout::ShowText;
    }
    if (view.layout != display::Layout::Status) {
      view.text = show.text;
      view.until = show.until;
    }
  }

  if (dark) view = {display::Layout::Off, r.status, "", 0, true, nullptr};
  leds::setOff(dark);
  leds::show(r.status, bzzy::chooseLeds(g_state, r.status, net::now()), net::now());
  if (!splashing) display::show(view);

  leds::tick(ms);
  display::tick(ms);
  delay(1);
}
