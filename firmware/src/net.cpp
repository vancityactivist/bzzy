#include "net.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <WiFi.h>
#include "tls_client.h"
#include <WiFiManager.h>
#include <sys/time.h>

#include "config.h"
#include "ota.h"
#include "protocol.h"
#include "rtc.h"
#include "ship_mode.h"

namespace net {

static Settings g_settings;
static WiFiManager g_wm;
// Most people only pick their Wi-Fi: the light then shows a QR code that adds it to
// the app (pairing). Typing the device ID and token by hand is tucked under Advanced.
static WiFiManagerParameter g_pAdvOpen(
    "<details style='margin-top:12px'><summary>Advanced: set up by hand</summary>"
    "<p style='font-size:13px'>Leave these empty to add the light by scanning the code it shows next. "
    "Leave the token empty to keep the one it has.</p>");
static WiFiManagerParameter g_pApi("api", "Companion app URL", "", sizeof(Settings::apiBase) - 1);
static WiFiManagerParameter g_pId("device", "Device ID", "", sizeof(Settings::deviceId) - 1);
static WiFiManagerParameter g_pToken("token", "Device token", "", sizeof(Settings::token) - 1);
static WiFiManagerParameter g_pAdvClose("</details>");
static char g_apName[16] = "";  // bzzy-XXXX, from the end of the MAC address

static SemaphoreHandle_t g_mx;
static bzzy::State g_incoming;  // guarded by g_mx
static bool g_hasIncoming = false;
static bzzy::Override g_pendingReport;
static volatile bool g_hasPendingReport = false;
static char g_pendingAck[bzzy::kPushIdMax] = "";  // a dismissed push the app hasn't heard about
static uint32_t g_pendingAckAt = 0;
static volatile bool g_lastSyncOk = false;
static bool g_portalOpen = false;
static bool g_clockFromNtp = false;
static volatile bool g_quiet = false;     // set by the main loop: a good moment for an automatic update
static volatile bool g_fastPoll = false;  // set by the main loop: awake outside working hours
static volatile uint32_t g_pollMs = cfg::kPollIntervalMs;  // what the app asked for last
static uint32_t g_nextUpdateTryMs = 0;    // after a failed update, wait before trying again
static uint8_t g_unauthorized = 0;        // 401s in a row from the app: the light was removed

// Ship mode (lib/core ship_mode.h). Saved, so it survives the trip in the box. Network
// task only, except g_packed, which the main loop reads.
static bool g_shipArmed = false;
static char g_shipSsid[33] = "";     // the Wi-Fi it was packed on
static bool g_sendArrived = false;   // add X-Bzzy-Arrived: 1 to this state request
static volatile bool g_packed = false;  // packed this power-on: show "Packed" until unplugged

// Pairing (docs/protocol.md, "Pairing"). The network task owns these; the code, link
// and paired name are copied out for the screen under g_mx.
static char g_pairId[40] = "";
static char g_pairSecret[sizeof(Settings::token)] = "";
static uint32_t g_pairExpiresMs = 0;
static uint32_t g_pairPollMs = 3000;
static char g_pairCode[8] = "";       // guarded by g_mx
static char g_pairUrl[96] = "";       // guarded by g_mx
static char g_pairedName[61] = "";    // guarded by g_mx

// GIFs. g_wanted is only touched by the network task. g_installed (the hash of the
// GIF on flash for each status) and the swap queue are shared, guarded by g_mx.
static bzzy::GifRef g_wanted[bzzy::kGifSlots];
static bool g_haveWanted = false;
static char g_installed[bzzy::kGifSlots][17];
static uint8_t g_swapMask = 0;  // bit i: slot i has a new file (or a removal) waiting
static char g_swapSha[bzzy::kGifSlots][17];
static uint8_t g_loadingMask = 0;  // bit i: slot i's GIF is on its way (see gifLoading)
// The download in progress, for the loading bar: bytes so far and the size the server
// gave (-1 = didn't say). g_dlGot is -1 when nothing is downloading. Written by the
// network task, read by the main loop; 32-bit stores are atomic, and a torn pair only
// makes one frame of the bar a percent off.
static volatile int32_t g_dlGot = -1;
static volatile int32_t g_dlLen = -1;
// Network task only: a GIF that fails kGifTries times in a row is given up on until
// the app sends a different one, so it can't hold up the others or load forever.
static constexpr uint8_t kGifTries = 3;
static char g_failSha[bzzy::kGifSlots][17];
static uint8_t g_failCount[bzzy::kGifSlots];

// ---- settings ----
static void loadSettings() {
  Preferences p;
  p.begin("bzzy", true);
  p.getString("api", g_settings.apiBase, sizeof(g_settings.apiBase));
  p.getString("device", g_settings.deviceId, sizeof(g_settings.deviceId));
  p.getString("token", g_settings.token, sizeof(g_settings.token));
  g_shipArmed = p.getBool("ship", false);
  p.getString("shipSsid", g_shipSsid, sizeof(g_shipSsid));
  p.end();
  // A fresh device: offer the usual app URL in the setup portal.
  if (!g_settings.apiBase[0]) strlcpy(g_settings.apiBase, cfg::kDefaultApiBase, sizeof(g_settings.apiBase));
  // The app moved from bzzy.vercel.app to bzzy.ca. The old host still answers devices,
  // but move saved settings over so GIF links and the token check use the new one.
  if (strcmp(g_settings.apiBase, cfg::kOldApiBase) == 0) {
    strlcpy(g_settings.apiBase, cfg::kDefaultApiBase, sizeof(g_settings.apiBase));
    Preferences w;
    w.begin("bzzy", false);
    w.putString("api", g_settings.apiBase);
    w.end();
  }
}

static void saveSettings() {
  Preferences p;
  p.begin("bzzy", false);
  p.putString("api", g_settings.apiBase);
  p.putString("device", g_settings.deviceId);
  p.putString("token", g_settings.token);
  p.end();
}

static void saveParams() {
  // The setup Wi-Fi is open, so the page never shows the saved token. An empty token
  // field keeps it, unless the device ID changed too.
  const bool sameDevice = strcmp(g_pId.getValue(), g_settings.deviceId) == 0;
  if (g_pApi.getValue()[0]) strlcpy(g_settings.apiBase, g_pApi.getValue(), sizeof(g_settings.apiBase));
  strlcpy(g_settings.deviceId, g_pId.getValue(), sizeof(g_settings.deviceId));
  if (g_pToken.getValue()[0] || !sameDevice) strlcpy(g_settings.token, g_pToken.getValue(), sizeof(g_settings.token));
  // Drop a trailing slash so URL joins are predictable.
  size_t n = strlen(g_settings.apiBase);
  if (n && g_settings.apiBase[n - 1] == '/') g_settings.apiBase[n - 1] = '\0';
  g_unauthorized = 0;
  saveSettings();
}

static void saveShip() {
  Preferences p;
  p.begin("bzzy", false);
  p.putBool("ship", g_shipArmed);
  p.putString("shipSsid", g_shipSsid);
  p.end();
}

static bool configured() { return g_settings.apiBase[0] && g_settings.deviceId[0] && g_settings.token[0]; }

// ---- clock ----
uint32_t now() {
  time_t t = time(nullptr);
  return t > 1700000000 ? (uint32_t)t : 0;
}

static void restoreClockFromRtc() {
  time_t t = rtc::read();
  if (!t) return;
  struct timeval tv = {t, 0};
  settimeofday(&tv, nullptr);
}

// ---- HTTP (runs on the network task) ----
static String url(const char* path) {
  return String(g_settings.apiBase) + "/api/device/" + g_settings.deviceId + path;
}

// `bearer`: the token to send, or nullptr for the device token. `status` gets the HTTP
// status (or a negative HTTPClient error).
static bool httpRequest(const char* method, const String& u, const String& body, String* resp, int* status = nullptr,
                        const char* bearer = nullptr) {
  // TODO(step 2): pin the companion app's certificate instead of skipping
  // verification. Fine for a prototype on test data; not for real calendars.
  TlsClient client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(cfg::kHttpTimeoutMs);
  http.setConnectTimeout(cfg::kHttpTimeoutMs);
  if (!http.begin(client, u)) return false;
  const char* tok = bearer ? bearer : g_settings.token;
  if (tok[0]) http.addHeader("Authorization", String("Bearer ") + tok);
  // So the app knows which firmware to offer (docs/ota.md).
  http.addHeader("X-Bzzy-Firmware", ota::version());
  http.addHeader("X-Bzzy-Board", ota::board());
  // What this firmware understands beyond protocol v1, so the app only offers it where
  // it works: "leds" = ledStyles and meetingWarn; "push" = team pushes and push-ack.
  http.addHeader("X-Bzzy-Features", "colors,hours,labels,leds,push,ship");
  if (g_sendArrived) http.addHeader("X-Bzzy-Arrived", "1");
  if (ota::failedVersion()[0]) http.addHeader("X-Bzzy-Update-Failed", ota::failedVersion());
  if (ota::lastNowId()) http.addHeader("X-Bzzy-Update-Now", String(ota::lastNowId()));
  int code;
  if (strcmp(method, "POST") == 0) {
    http.addHeader("Content-Type", "application/json");
    code = http.POST(body);
  } else {
    code = http.GET();
  }
  if (status) *status = code;
  bool ok = code >= 200 && code < 300;
  if (ok && resp) *resp = http.getString();
  if (!ok) Serial.printf("[net] %s %s -> %d\n", method, u.c_str(), code);
  http.end();
  return ok;
}

// ---- GIFs (network task) ----
static const char* slotName(size_t i) { return bzzy::gifSlotName(i); }

static void gifPath(char* out, size_t n, size_t slot, const char* ext) {
  snprintf(out, n, "/gif/%s.%s", slotName(slot), ext);
}

#if BZZY_HAS_DISPLAY
static constexpr size_t kGifMargin = 32 * 1024;
static constexpr uint32_t kGifStallMs = 15000;  // no data for this long: give up
static constexpr uint32_t kGifMaxMs = 90000;    // a whole download, at most  // LittleFS needs some room to work
static size_t gifFreeBytes() { return LittleFS.totalBytes() - LittleFS.usedBytes(); }
// Set by downloadTo() when it failed for lack of room: the bytes it would have needed
// free (0 = it failed for another reason). Network task only.
static size_t g_noRoomNeed = 0;

static bool downloadTo(const char* u, const char* path) {
  TlsClient client;
  client.setInsecure();  // see the TODO in httpRequest
  HTTPClient http;
  http.setTimeout(cfg::kHttpTimeoutMs * 2);
  http.setConnectTimeout(cfg::kHttpTimeoutMs);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  // HTTP/1.0, so the body isn't chunked (Vercel streams it): the loop below copies it raw.
  http.useHTTP10(true);
  if (!http.begin(client, u)) return false;
  // Only hand our token to our own app, never to another host.
  if (g_settings.token[0] && strncmp(u, g_settings.apiBase, strlen(g_settings.apiBase)) == 0) {
    http.addHeader("Authorization", String("Bearer ") + g_settings.token);
  }
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[gif] GET %s -> %d\n", u, code);
    http.end();
    return false;
  }
  int len = http.getSize();  // -1 when the server doesn't say
  size_t free = gifFreeBytes();
  g_noRoomNeed = 0;
  if (len > (int)cfg::kMaxGifBytes || (len > 0 && (size_t)len + kGifMargin > free)) {
    Serial.printf("[gif] %d bytes won't fit (%u free)\n", len, (unsigned)free);
    if (len <= (int)cfg::kMaxGifBytes) g_noRoomNeed = (size_t)len + kGifMargin;
    http.end();
    return false;
  }
  LittleFS.mkdir("/gif");
  File f = LittleFS.open(path, "w");
  if (!f) {
    http.end();
    return false;
  }
  // Not http.writeToStream(): if the connection stalls without closing (a weak
  // signal), it loops forever, and the network task (syncs and all) with it.
  static uint8_t buf[2048];  // network task only
  auto* stream = http.getStreamPtr();
  const uint32_t startMs = millis();
  uint32_t lastDataMs = startMs;
  int written = 0;
  uint8_t lastByte = 0;
  const char* why = nullptr;
  g_dlLen = len;
  g_dlGot = 0;
  while (len < 0 || written < len) {
    const uint32_t nowMs = millis();
    if (nowMs - startMs > kGifMaxMs) {
      why = "took too long";
      break;
    }
    const int avail = stream->available();
    if (avail <= 0) {
      if (!stream->connected()) {
        if (len > 0) why = "connection closed early";
        break;  // with no length, the server closing is the end
      }
      if (nowMs - lastDataMs > kGifStallMs) {
        why = "stalled";
        break;
      }
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }
    size_t want = min((size_t)avail, sizeof(buf));
    if (len > 0) want = min(want, (size_t)(len - written));
    const int n = stream->read(buf, want);
    if (n <= 0) continue;
    if (f.write(buf, n) != (size_t)n) {
      why = "flash write failed";  // most likely full: the server didn't say the size
      g_noRoomNeed = (size_t)written + kGifMargin + (len > 0 ? (size_t)(len - written) : cfg::kMaxGifBytes / 2);
      break;
    }
    written += n;
    g_dlGot = written;
    lastByte = buf[n - 1];
    lastDataMs = millis();
    if (written > (int)cfg::kMaxGifBytes) {
      why = "too big";
      break;
    }
  }
  g_dlGot = -1;
  f.close();
  http.end();
  const unsigned ms = (unsigned)(millis() - startMs);
  if (!why && written <= 0) why = "empty";
  // Without a length, a dropped connection looks like the end: a whole GIF ends in 0x3B.
  if (!why && lastByte != 0x3B) why = "cut off";
  if (why) {
    Serial.printf("[gif] download failed: %s (%d of %d bytes, %u ms)\n", why, written, len, ms);
    LittleFS.remove(path);
    return false;
  }
  Serial.printf("[gif] %d bytes in %u ms\n", written, ms);
  // How much room a download (TLS and all) leaves: "lowest" is the low-water mark since boot.
  Serial.printf("[mem] heap free %u, lowest %u, largest block %u", (unsigned)ESP.getFreeHeap(),
                (unsigned)ESP.getMinFreeHeap(), (unsigned)ESP.getMaxAllocHeap());
#ifdef BOARD_HAS_PSRAM
  Serial.printf(", PSRAM free %u", (unsigned)ESP.getFreePsram());
#endif
  Serial.println();
  return true;
}
#endif

// At most one download per sync, so a status change is never stuck behind four GIFs.
// The "show now" GIF goes first: someone just asked for it.
#if BZZY_HAS_DISPLAY
static bool gaveUp(size_t i) {
  return g_failCount[i] >= kGifTries && strcmp(g_failSha[i], g_wanted[i].sha) == 0;
}

// Hand the main loop a new file for slot i (sha "" removes the slot's GIF).
static void queueSwap(size_t i, const char* sha) {
  xSemaphoreTake(g_mx, portMAX_DELAY);
  strlcpy(g_swapSha[i], sha, sizeof(g_swapSha[i]));
  g_swapMask |= 1u << i;
  xSemaphoreGive(g_mx);
}

// The main loop checks for swaps every pass, so this is quick unless it's stuck.
static bool waitSwapped(size_t i, uint32_t timeoutMs) {
  const uint32_t t0 = millis();
  for (;;) {
    xSemaphoreTake(g_mx, portMAX_DELAY);
    const bool queued = g_swapMask & (1u << i);
    xSemaphoreGive(g_mx);
    if (!queued) return true;
    if (millis() - t0 > timeoutMs) return false;
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}
#endif

#if BZZY_HAS_DISPLAY
// The show now GIF doesn't fit beside the status GIFs (the C6 board has about 640 KB):
// drop status GIFs until `need` bytes are free. False if there was nothing to drop.
static bool makeRoomForShow(const char (&installed)[bzzy::kGifSlots][17], size_t need) {
  bool dropped = false;
  for (size_t j = 0; j < bzzy::kGifSlots && gifFreeBytes() < need; ++j) {
    if (j == bzzy::kShowSlot || !installed[j][0]) continue;
    Serial.printf("[gif] removing %s to make room for show now\n", slotName(j));
    queueSwap(j, "");
    if (!waitSwapped(j, 2000)) break;
    dropped = true;
  }
  return dropped;
}
#endif

static void syncGifs() {
#if BZZY_HAS_DISPLAY
  if (!g_haveWanted) return;
  char installed[bzzy::kGifSlots][17];
  uint8_t queued;
  xSemaphoreTake(g_mx, portMAX_DELAY);
  memcpy(installed, g_installed, sizeof(installed));
  queued = g_swapMask;
  xSemaphoreGive(g_mx);

  uint8_t loading = 0;
  for (size_t i = 0; i < bzzy::kGifSlots; ++i) {
    const bzzy::GifRef& want = g_wanted[i];
    if (want.present && strcmp(want.sha, installed[i]) != 0 && !gaveUp(i)) loading |= 1u << i;
  }
  xSemaphoreTake(g_mx, portMAX_DELAY);
  g_loadingMask = loading;
  xSemaphoreGive(g_mx);

  for (size_t n = 0; n < bzzy::kGifSlots; ++n) {
    const size_t i = (bzzy::kShowSlot + n) % bzzy::kGifSlots;
    if (queued & (1u << i)) continue;

    const bzzy::GifRef& want = g_wanted[i];
    if (!want.present) {
      if (installed[i][0]) {
        queueSwap(i, "");
        // Room was freed (a show ending, say): status GIFs that didn't fit get another go.
        memset(g_failCount, 0, sizeof(g_failCount));
      }
      continue;
    }
    if (strcmp(want.sha, installed[i]) == 0 || gaveUp(i)) continue;

    // Not enough room for the new GIF beside the old one (the C6 board has 640 KB):
    // drop the old one first. The screen shows "Loading GIF" until the new one is in.
    if (installed[i][0] && gifFreeBytes() < cfg::kMaxGifBytes + kGifMargin) {
      Serial.printf("[gif] removing old %s to make room\n", slotName(i));
      queueSwap(i, "");
      if (!waitSwapped(i, 2000)) return;  // try again next sync
    }

    char tmp[32];
    gifPath(tmp, sizeof(tmp), i, "tmp");
    if (downloadTo(want.url, tmp)) {
      queueSwap(i, want.sha);
      g_failCount[i] = 0;
      Serial.printf("[gif] downloaded %s\n", slotName(i));
    } else if (i == bzzy::kShowSlot && g_noRoomNeed && makeRoomForShow(installed, g_noRoomNeed)) {
      // Someone just asked for this GIF: status GIFs made way (they come back once the
      // show ends). Not a failed try; it downloads again next sync.
    } else {
      if (strcmp(g_failSha[i], want.sha) != 0) {
        strlcpy(g_failSha[i], want.sha, sizeof(g_failSha[i]));
        g_failCount[i] = 0;
      }
      if (++g_failCount[i] >= kGifTries) {
        Serial.printf("[gif] giving up on %s after %u tries\n", slotName(i), (unsigned)kGifTries);
        xSemaphoreTake(g_mx, portMAX_DELAY);
        g_loadingMask &= ~(1u << i);
        xSemaphoreGive(g_mx);
      }
    }
    return;
  }
#endif
}

static bool syncOnce() {
  // 1) Push a button press the app hasn't seen.
  bzzy::Override report;
  bool haveReport = false;
  xSemaphoreTake(g_mx, portMAX_DELAY);
  if (g_hasPendingReport) {
    report = g_pendingReport;
    haveReport = true;
  }
  xSemaphoreGive(g_mx);
  if (haveReport) {
    String body = String("{\"active\":") + (report.active ? "true" : "false") +
                  ",\"status\":\"" + bzzy::statusName(report.status) +
                  "\",\"updatedAt\":" + report.updatedAt + "}";
    if (!httpRequest("POST", url("/override"), body, nullptr)) return false;
    xSemaphoreTake(g_mx, portMAX_DELAY);
    // Only clear it if no newer press arrived while we were sending.
    if (g_hasPendingReport && g_pendingReport.updatedAt == report.updatedAt) {
      g_hasPendingReport = false;
    }
    xSemaphoreGive(g_mx);
  }

  // 1b) Tell the app about a dismissed team push, so it stops sending it.
  char ackId[bzzy::kPushIdMax];
  uint32_t ackAt = 0;
  xSemaphoreTake(g_mx, portMAX_DELAY);
  strlcpy(ackId, g_pendingAck, sizeof(ackId));
  ackAt = g_pendingAckAt;
  xSemaphoreGive(g_mx);
  if (ackId[0]) {
    String body = String("{\"id\":\"") + ackId + "\",\"at\":" + ackAt + "}";
    if (!httpRequest("POST", url("/push-ack"), body, nullptr)) return false;
    xSemaphoreTake(g_mx, portMAX_DELAY);
    if (strcmp(g_pendingAck, ackId) == 0) g_pendingAck[0] = '\0';
    xSemaphoreGive(g_mx);
  }

  // 2) Pull the current state. In ship mode on a new Wi-Fi, say it has arrived.
  String resp;
  int status = 0;
  g_sendArrived = bzzy::shipArrived(g_shipArmed, g_shipSsid, WiFi.SSID().c_str());
  const bool got = httpRequest("GET", url("/state"), "", &resp, &status);
  g_sendArrived = false;
  if (!got) {
    // Someone deleted this light in the app (or made it a new token). After a few in a
    // row, forget the id and show a pairing code. The saved settings stay until a new
    // pairing replaces them, so a light set up by hand can still be fixed by hand.
    if (status == 401 && ++g_unauthorized >= 3) {
      Serial.println("[net] the app doesn't know this light any more: pairing again");
      g_settings.deviceId[0] = '\0';
      g_settings.token[0] = '\0';
    }
    return false;
  }
  g_unauthorized = 0;

  // 2b) Ship mode: the light was set up on the bench and is going in a box.
  switch (bzzy::shipStep(g_shipArmed, bzzy::parseShip(resp.c_str(), resp.length()), g_shipSsid, WiFi.SSID().c_str())) {
    case bzzy::ShipAction::Pack:
      // Remember the bench Wi-Fi (so it can tell when it's somewhere else), then forget
      // it. The device id and token stay: at its new home it only needs the owner's Wi-Fi.
      strlcpy(g_shipSsid, WiFi.SSID().c_str(), sizeof(g_shipSsid));
      g_shipArmed = true;
      saveShip();
      g_packed = true;
      Serial.printf("[ship] packed on \"%s\": forgetting Wi-Fi\n", g_shipSsid);
      WiFi.setAutoReconnect(false);
      WiFi.disconnect(true, true);  // radio off, saved network erased
      return true;
    case bzzy::ShipAction::Done:
      Serial.println("[ship] out of ship mode");
      g_shipArmed = false;
      g_shipSsid[0] = '\0';
      saveShip();
      break;
    case bzzy::ShipAction::None:
      break;
  }

  static bzzy::State parsed;  // big-ish: keep it off the task stack
  if (!bzzy::parseState(resp.c_str(), resp.length(), parsed)) {
    Serial.println("[net] couldn't parse state response");
    return false;
  }
  g_pollMs = bzzy::pollIntervalSec(parsed, cfg::kPollIntervalMs / 1000, cfg::kMaxPollMs / 1000) * 1000;
  xSemaphoreTake(g_mx, portMAX_DELAY);
  g_incoming = parsed;
  g_hasIncoming = true;
  xSemaphoreGive(g_mx);

  // 3) A firmware update, if the app offers one and now's a good time. On success this
  //    restarts the device; on failure, carry on and try again in a while.
  static ota::Offer offer;
  if (bzzy::parseFirmwareOffer(resp.c_str(), resp.length(), offer) && ota::wanted(offer, g_quiet) &&
      (int32_t)(millis() - g_nextUpdateTryMs) >= 0) {
    resp = String();
    if (!ota::install(offer, g_settings.apiBase, g_settings.token)) {
      g_nextUpdateTryMs = millis() + 10 * 60 * 1000;
    }
    return true;  // the state above was fine; GIFs can wait for the next sync
  }

  // 4) Fetch any GIF that changed. A failed download doesn't fail the sync:
  //    the status is what matters, and the GIF is retried next time.
  if (bzzy::parseGifs(resp.c_str(), resp.length(), g_wanted)) g_haveWanted = true;
  resp = String();  // free it before downloading
  syncGifs();
  return true;
}

// ---- pairing (network task) ----
static void clearPairing() {
  g_pairId[0] = '\0';
  g_pairSecret[0] = '\0';
  xSemaphoreTake(g_mx, portMAX_DELAY);
  g_pairCode[0] = '\0';
  g_pairUrl[0] = '\0';
  xSemaphoreGive(g_mx);
}

// One step of pairing: ask for a code if there isn't a live one, otherwise ask whether
// it's been claimed. Returns how long to wait before the next step.
static uint32_t pairOnce() {
  if (!g_pairId[0] || (int32_t)(millis() - g_pairExpiresMs) >= 0) {
    clearPairing();
    String resp;
    int status = 0;
    if (!httpRequest("POST", String(g_settings.apiBase) + "/api/pair", "{}", &resp, &status, "")) {
      return status == 429 ? 60 * 1000 : 10 * 1000;
    }
    JsonDocument doc;
    if (deserializeJson(doc, resp)) return 10 * 1000;
    const char* id = doc["id"] | "";
    const char* secret = doc["secret"] | "";
    const char* code = doc["code"] | "";
    const char* link = doc["url"] | "";
    const uint32_t expiresIn = doc["expiresIn"] | 900;
    const uint32_t poll = doc["poll"] | 3;
    if (!id[0] || !secret[0] || !code[0] || strlen(secret) >= sizeof(g_pairSecret)) return 10 * 1000;
    strlcpy(g_pairId, id, sizeof(g_pairId));
    strlcpy(g_pairSecret, secret, sizeof(g_pairSecret));
    // Ask for a new code a little before this one runs out, so the screen never shows a dead one.
    g_pairExpiresMs = millis() + (expiresIn > 20 ? expiresIn - 10 : expiresIn) * 1000;
    g_pairPollMs = constrain(poll, 2u, 30u) * 1000;
    xSemaphoreTake(g_mx, portMAX_DELAY);
    strlcpy(g_pairCode, code, sizeof(g_pairCode));
    strlcpy(g_pairUrl, link, sizeof(g_pairUrl));
    xSemaphoreGive(g_mx);
    Serial.printf("[pair] code %s\n", code);
    return g_pairPollMs;
  }

  String resp;
  int status = 0;
  if (!httpRequest("GET", String(g_settings.apiBase) + "/api/pair/" + g_pairId, "", &resp, &status, g_pairSecret)) {
    if (status == 404) {
      g_pairExpiresMs = millis();  // gone or expired: get a new code straight away
      return 500;
    }
    return 5 * 1000;
  }
  JsonDocument doc;
  if (deserializeJson(doc, resp)) return g_pairPollMs;
  const char* state = doc["state"] | "";
  const char* deviceId = doc["deviceId"] | "";
  if (strcmp(state, "paired") != 0 || !deviceId[0] || strlen(deviceId) >= sizeof(g_settings.deviceId)) return g_pairPollMs;

  // Claimed. The pairing secret is this light's token from now on.
  strlcpy(g_settings.deviceId, deviceId, sizeof(g_settings.deviceId));
  strlcpy(g_settings.token, g_pairSecret, sizeof(g_settings.token));
  saveSettings();
  g_unauthorized = 0;
  xSemaphoreTake(g_mx, portMAX_DELAY);
  strlcpy(g_pairedName, doc["name"] | "", sizeof(g_pairedName));
  xSemaphoreGive(g_mx);
  clearPairing();
  Serial.printf("[pair] paired as %s\n", deviceId);
  return 0;
}

static void networkTask(void*) {
  uint32_t backoff = cfg::kPollIntervalMs;
  for (;;) {
    if (WiFi.status() == WL_CONNECTED && !configured() && g_settings.apiBase[0] && !g_portalOpen) {
      g_lastSyncOk = false;
      vTaskDelay(pdMS_TO_TICKS(pairOnce()));
      backoff = cfg::kPollIntervalMs;
      continue;
    }
    if (WiFi.status() == WL_CONNECTED && configured()) {
      bool ok = syncOnce();
      g_lastSyncOk = ok;
      if (ok) ota::markHealthy();  // the first good sync after an update keeps it
      // On success, wait as long as the app asked (longer outside working hours).
      backoff = ok ? (g_fastPoll ? cfg::kPollIntervalMs : g_pollMs) : min<uint32_t>(backoff * 2, cfg::kMaxBackoffMs);
    } else {
      g_lastSyncOk = false;
      backoff = cfg::kPollIntervalMs;
    }
    // Wake early if there's a button press to report, or the light was just woken
    // during a long off-hours wait.
    for (uint32_t waited = 0; waited < backoff; waited += 250) {
      vTaskDelay(pdMS_TO_TICKS(250));
      if (g_hasPendingReport && WiFi.status() == WL_CONNECTED && waited >= 1000) break;
      if (g_fastPoll && g_lastSyncOk && waited >= cfg::kPollIntervalMs) break;
    }
  }
}

// ---- public ----
static void loadInstalledGifs() {
  Preferences p;
  p.begin("bzzy-gif", true);
  for (size_t i = 0; i < bzzy::kGifSlots; ++i) {
    g_installed[i][0] = '\0';
    p.getString(slotName(i), g_installed[i], sizeof(g_installed[i]));
    // A download cut off by a restart leaves its .tmp behind, taking up room.
    char tmp[32];
    gifPath(tmp, sizeof(tmp), i, "tmp");
    if (LittleFS.exists(tmp)) LittleFS.remove(tmp);
  }
  p.end();
}

// Some boards brown out (and reset) at full Wi-Fi power: see BZZY_WIFI_TX_POWER.
static void capTxPower() {
#ifdef BZZY_WIFI_TX_POWER
  // Only while the setup page is up: running it and joining a network at once is what
  // browned out. At full power otherwise, or a weak signal makes downloads crawl.
  const wifi_power_t want = g_portalOpen ? BZZY_WIFI_TX_POWER : WIFI_POWER_20dBm;
  if (WiFi.getMode() == WIFI_OFF || WiFi.getTxPower() == want) return;
  const int was = WiFi.getTxPower();
  WiFi.setTxPower(want);
  Serial.printf("[wifi] tx power %d -> %d (quarter dBm)\n", was, (int)WiFi.getTxPower());
#endif
}

void begin(bool openSetupPortal) {
  g_mx = xSemaphoreCreateMutex();
  // Why Wi-Fi drops or won't join (the reason codes are wifi_err_reason_t).
  WiFi.onEvent([](WiFiEvent_t, WiFiEventInfo_t info) {
    Serial.printf("[wifi] disconnected from \"%.32s\", reason %u, rssi %d\n",
                  (const char*)info.wifi_sta_disconnected.ssid, info.wifi_sta_disconnected.reason,
                  (int)info.wifi_sta_disconnected.rssi);
  }, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
  WiFi.onEvent([](WiFiEvent_t, WiFiEventInfo_t info) {
    Serial.printf("[wifi] connected, ip %s, rssi %d\n", IPAddress(info.got_ip.ip_info.ip.addr).toString().c_str(),
                  (int)WiFi.RSSI());
  }, ARDUINO_EVENT_WIFI_STA_GOT_IP);
  loadSettings();
  loadInstalledGifs();
  rtc::begin();
  restoreClockFromRtc();
  configTzTime(cfg::kTimezone, cfg::kNtpServer);

  // The token field starts empty on purpose: see saveParams.
  g_pApi.setValue(g_settings.apiBase, sizeof(Settings::apiBase) - 1);
  g_pId.setValue(g_settings.deviceId, sizeof(Settings::deviceId) - 1);
  g_wm.addParameter(&g_pAdvOpen);
  g_wm.addParameter(&g_pApi);
  g_wm.addParameter(&g_pId);
  g_wm.addParameter(&g_pToken);
  g_wm.addParameter(&g_pAdvClose);
  g_wm.setSaveParamsCallback(saveParams);
  g_wm.setSaveConfigCallback(saveParams);
  g_wm.setConfigPortalBlocking(false);
  g_wm.setTitle("bzzy");
  // WiFiManager joins the new network while blocking the main loop (the screen and
  // button freeze), for up to 60 s if this isn't set.
  g_wm.setConnectTimeout(20);

  // A name of its own, so two new lights in one office don't share a setup network.
  const uint64_t mac = ESP.getEfuseMac();
  snprintf(g_apName, sizeof(g_apName), "%s%02X%02X", cfg::kSetupApPrefix, (unsigned)((mac >> 32) & 0xFF),
           (unsigned)((mac >> 40) & 0xFF));

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  const bool wifiSaved = g_wm.getWiFiIsSaved();
  if (openSetupPortal || !wifiSaved) {
    // Only open the setup page when asked or when there's no Wi-Fi saved. If the
    // office Wi-Fi is just down, keep retrying quietly instead. A light with Wi-Fi
    // but no device id goes straight to pairing.
    // A new light waits on its setup page for as long as it takes; one opened with
    // the button gives up after 5 minutes and goes back to the Wi-Fi it had.
    g_wm.setConfigPortalTimeout(wifiSaved ? 300 : 0);
    // Stop retrying the saved network while the page is open: a join in progress
    // makes the radio refuse scans (an empty network list) and new settings (the
    // network you pick is never tried). loop() turns it back on when the page closes.
    WiFi.setAutoReconnect(false);
    g_wm.startConfigPortal(g_apName);
    WiFi.disconnect(false, false);  // stop the station's join; keeps the setup network and saved network
    g_portalOpen = true;
  } else {
    WiFi.begin();
  }
  capTxPower();

  xTaskCreatePinnedToCore(networkTask, "bzzy-net", 12288, nullptr, 1, nullptr, 0);
}

void loop() {
  // WiFiManager switches modes as it goes, which can put the power back up.
  static uint32_t txCheckedMs = 0;
  if (millis() - txCheckedMs >= 1000) {
    txCheckedMs = millis();
    capTxPower();
  }
  if (g_portalOpen) {
    g_wm.process();
    if (!g_wm.getConfigPortalActive()) {
      g_portalOpen = false;
      WiFi.setAutoReconnect(true);
      WiFi.mode(WIFI_STA);
      WiFi.begin();
      capTxPower();
    }
  }
  // Once NTP has set the clock, copy it to the battery-backed RTC.
  if (!g_clockFromNtp && WiFi.status() == WL_CONNECTED) {
    struct tm t;
    if (getLocalTime(&t, 0) && now()) {
      rtc::write(time(nullptr));
      g_clockFromNtp = true;
    }
  }
}

bool online() { return WiFi.status() == WL_CONNECTED && g_lastSyncOk; }
bool setupPortalOpen() { return g_portalOpen; }
bool packed() { return g_packed; }

void setupInfo(SetupInfo& out) {
  out.portalOpen = g_portalOpen;
  out.apStations = g_portalOpen ? WiFi.softAPgetStationNum() : 0;
  out.wifiUp = WiFi.status() == WL_CONNECTED;
  out.paired = configured();
  strlcpy(out.apName, g_apName, sizeof(out.apName));
  strlcpy(out.ssid, out.wifiUp ? WiFi.SSID().c_str() : "", sizeof(out.ssid));
  strlcpy(out.apiBase, g_settings.apiBase, sizeof(out.apiBase));
  xSemaphoreTake(g_mx, portMAX_DELAY);
  strlcpy(out.code, g_pairCode, sizeof(out.code));
  strlcpy(out.pairUrl, g_pairUrl, sizeof(out.pairUrl));
  strlcpy(out.pairedName, g_pairedName, sizeof(out.pairedName));
  xSemaphoreGive(g_mx);
}
void setQuiet(bool quiet) { g_quiet = quiet; }
void setFastPoll(bool fast) { g_fastPoll = fast; }

bool takeIncoming(bzzy::State& out) {
  bool got = false;
  xSemaphoreTake(g_mx, portMAX_DELAY);
  if (g_hasIncoming) {
    out = g_incoming;
    g_hasIncoming = false;
    got = true;
  }
  xSemaphoreGive(g_mx);
  return got;
}

void reportOverride(const bzzy::Override& o) {
  xSemaphoreTake(g_mx, portMAX_DELAY);
  g_pendingReport = o;
  g_hasPendingReport = true;
  xSemaphoreGive(g_mx);
}

void reportPushAck(const char* id, uint32_t at) {
  // Ids from the app are UUIDs; don't put anything else in the JSON by hand.
  for (const char* c = id; *c; ++c) {
    if (!isalnum(static_cast<unsigned char>(*c)) && *c != '-') return;
  }
  xSemaphoreTake(g_mx, portMAX_DELAY);
  strlcpy(g_pendingAck, id, sizeof(g_pendingAck));
  g_pendingAckAt = at;
  xSemaphoreGive(g_mx);
}

bool gifInstalled(size_t slot, const char* sha) {
  if (slot >= bzzy::kGifSlots || !sha || !*sha) return false;
  xSemaphoreTake(g_mx, portMAX_DELAY);
  bool same = strcmp(g_installed[slot], sha) == 0;
  xSemaphoreGive(g_mx);
  return same;
}

bool gifLoading(size_t slot) {
  if (slot >= bzzy::kGifSlots) return false;
  xSemaphoreTake(g_mx, portMAX_DELAY);
  bool loading = g_loadingMask & (1u << slot);
  xSemaphoreGive(g_mx);
  return loading;
}

bool gifDownload(int32_t& got, int32_t& total) {
  got = g_dlGot;
  total = g_dlLen;
  return got >= 0;
}

bool gifOnFlash(size_t slot) {
  if (slot >= bzzy::kGifSlots) return false;
  xSemaphoreTake(g_mx, portMAX_DELAY);
  bool any = g_installed[slot][0] != '\0';
  xSemaphoreGive(g_mx);
  return any;
}

bool gifsReady() {
  xSemaphoreTake(g_mx, portMAX_DELAY);
  bool ready = g_swapMask != 0;
  xSemaphoreGive(g_mx);
  return ready;
}

// Main loop only, after display::releaseGif(), so no file is open while it's replaced.
void installGifs() {
  uint8_t mask;
  char shas[bzzy::kGifSlots][17];
  xSemaphoreTake(g_mx, portMAX_DELAY);
  mask = g_swapMask;
  memcpy(shas, g_swapSha, sizeof(shas));
  xSemaphoreGive(g_mx);

  Preferences p;
  p.begin("bzzy-gif", false);
  for (size_t i = 0; i < bzzy::kGifSlots; ++i) {
    if (!(mask & (1u << i))) continue;
    char gif[32], tmp[32];
    gifPath(gif, sizeof(gif), i, "gif");
    gifPath(tmp, sizeof(tmp), i, "tmp");
    LittleFS.remove(gif);
    if (shas[i][0]) LittleFS.rename(tmp, gif);
    p.putString(slotName(i), shas[i]);
    xSemaphoreTake(g_mx, portMAX_DELAY);
    strlcpy(g_installed[i], shas[i], sizeof(g_installed[i]));
    g_swapMask &= ~(1u << i);
    xSemaphoreGive(g_mx);
  }
  p.end();
}

}  // namespace net
