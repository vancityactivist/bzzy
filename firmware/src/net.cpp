#include "net.h"

#include <HTTPClient.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <sys/time.h>

#include "config.h"
#include "protocol.h"
#include "rtc.h"

namespace net {

static Settings g_settings;
static WiFiManager g_wm;
static WiFiManagerParameter g_pApi("api", "Companion app URL", "", sizeof(Settings::apiBase) - 1);
static WiFiManagerParameter g_pId("device", "Device ID", "", sizeof(Settings::deviceId) - 1);
static WiFiManagerParameter g_pToken("token", "Device token", "", sizeof(Settings::token) - 1);

static SemaphoreHandle_t g_mx;
static bzzy::State g_incoming;  // guarded by g_mx
static bool g_hasIncoming = false;
static bzzy::Override g_pendingReport;
static volatile bool g_hasPendingReport = false;
static volatile bool g_lastSyncOk = false;
static bool g_portalOpen = false;
static bool g_clockFromNtp = false;

// GIFs. g_wanted is only touched by the network task. g_installed (the hash of the
// GIF on flash for each status) and the swap queue are shared, guarded by g_mx.
static bzzy::GifRef g_wanted[bzzy::kGifSlots];
static bool g_haveWanted = false;
static char g_installed[bzzy::kGifSlots][17];
static uint8_t g_swapMask = 0;  // bit i: slot i has a new file (or a removal) waiting
static char g_swapSha[bzzy::kGifSlots][17];

// ---- settings ----
static void loadSettings() {
  Preferences p;
  p.begin("bzzy", true);
  p.getString("api", g_settings.apiBase, sizeof(g_settings.apiBase));
  p.getString("device", g_settings.deviceId, sizeof(g_settings.deviceId));
  p.getString("token", g_settings.token, sizeof(g_settings.token));
  p.end();
}

static void saveParams() {
  strlcpy(g_settings.apiBase, g_pApi.getValue(), sizeof(g_settings.apiBase));
  strlcpy(g_settings.deviceId, g_pId.getValue(), sizeof(g_settings.deviceId));
  strlcpy(g_settings.token, g_pToken.getValue(), sizeof(g_settings.token));
  // Drop a trailing slash so URL joins are predictable.
  size_t n = strlen(g_settings.apiBase);
  if (n && g_settings.apiBase[n - 1] == '/') g_settings.apiBase[n - 1] = '\0';
  Preferences p;
  p.begin("bzzy", false);
  p.putString("api", g_settings.apiBase);
  p.putString("device", g_settings.deviceId);
  p.putString("token", g_settings.token);
  p.end();
}

static bool configured() { return g_settings.apiBase[0] && g_settings.deviceId[0]; }

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

static bool httpRequest(const char* method, const String& u, const String& body, String* resp) {
  // TODO(step 2): pin the companion app's certificate instead of skipping
  // verification. Fine for a prototype on test data; not for real calendars.
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(cfg::kHttpTimeoutMs);
  http.setConnectTimeout(cfg::kHttpTimeoutMs);
  if (!http.begin(client, u)) return false;
  if (g_settings.token[0]) http.addHeader("Authorization", String("Bearer ") + g_settings.token);
  int code;
  if (strcmp(method, "POST") == 0) {
    http.addHeader("Content-Type", "application/json");
    code = http.POST(body);
  } else {
    code = http.GET();
  }
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
static bool downloadTo(const char* u, const char* path) {
  WiFiClientSecure client;
  client.setInsecure();  // see the TODO in httpRequest
  HTTPClient http;
  http.setTimeout(cfg::kHttpTimeoutMs * 2);
  http.setConnectTimeout(cfg::kHttpTimeoutMs);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
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
  size_t free = LittleFS.totalBytes() - LittleFS.usedBytes();
  if (len > (int)cfg::kMaxGifBytes || (len > 0 && (size_t)len + 32 * 1024 > free)) {
    Serial.printf("[gif] %d bytes won't fit (%u free)\n", len, (unsigned)free);
    http.end();
    return false;
  }
  LittleFS.mkdir("/gif");
  File f = LittleFS.open(path, "w");
  if (!f) {
    http.end();
    return false;
  }
  int written = http.writeToStream(&f);
  f.close();
  http.end();
  if (written <= 0 || (len > 0 && written != len) || written > (int)cfg::kMaxGifBytes) {
    LittleFS.remove(path);
    return false;
  }
  return true;
}
#endif

// At most one download per sync, so a status change is never stuck behind four GIFs.
// The "show now" GIF goes first: someone just asked for it.
static void syncGifs() {
#if BZZY_HAS_DISPLAY
  if (!g_haveWanted) return;
  for (size_t n = 0; n < bzzy::kGifSlots; ++n) {
    const size_t i = (bzzy::kShowSlot + n) % bzzy::kGifSlots;
    char installed[17];
    bool queued;
    xSemaphoreTake(g_mx, portMAX_DELAY);
    strlcpy(installed, g_installed[i], sizeof(installed));
    queued = g_swapMask & (1u << i);
    xSemaphoreGive(g_mx);
    if (queued) continue;

    const bzzy::GifRef& want = g_wanted[i];
    if (!want.present) {
      if (installed[0]) {
        xSemaphoreTake(g_mx, portMAX_DELAY);
        g_swapSha[i][0] = '\0';
        g_swapMask |= 1u << i;
        xSemaphoreGive(g_mx);
      }
      continue;
    }
    if (strcmp(want.sha, installed) == 0) continue;

    char tmp[32];
    gifPath(tmp, sizeof(tmp), i, "tmp");
    if (downloadTo(want.url, tmp)) {
      xSemaphoreTake(g_mx, portMAX_DELAY);
      strlcpy(g_swapSha[i], want.sha, sizeof(g_swapSha[i]));
      g_swapMask |= 1u << i;
      xSemaphoreGive(g_mx);
      Serial.printf("[gif] downloaded %s\n", slotName(i));
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

  // 2) Pull the current state.
  String resp;
  if (!httpRequest("GET", url("/state"), "", &resp)) return false;
  static bzzy::State parsed;  // big-ish: keep it off the task stack
  if (!bzzy::parseState(resp.c_str(), resp.length(), parsed)) {
    Serial.println("[net] couldn't parse state response");
    return false;
  }
  xSemaphoreTake(g_mx, portMAX_DELAY);
  g_incoming = parsed;
  g_hasIncoming = true;
  xSemaphoreGive(g_mx);

  // 3) Fetch any GIF that changed. A failed download doesn't fail the sync:
  //    the status is what matters, and the GIF is retried next time.
  if (bzzy::parseGifs(resp.c_str(), resp.length(), g_wanted)) g_haveWanted = true;
  resp = String();  // free it before downloading
  syncGifs();
  return true;
}

static void networkTask(void*) {
  uint32_t backoff = cfg::kPollIntervalMs;
  for (;;) {
    if (WiFi.status() == WL_CONNECTED && configured()) {
      bool ok = syncOnce();
      g_lastSyncOk = ok;
      backoff = ok ? cfg::kPollIntervalMs : min<uint32_t>(backoff * 2, cfg::kMaxBackoffMs);
    } else {
      g_lastSyncOk = false;
      backoff = cfg::kPollIntervalMs;
    }
    // Wake early if there's a button press to report.
    for (uint32_t waited = 0; waited < backoff; waited += 250) {
      vTaskDelay(pdMS_TO_TICKS(250));
      if (g_hasPendingReport && WiFi.status() == WL_CONNECTED && waited >= 1000) break;
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
  }
  p.end();
}

void begin(bool openSetupPortal) {
  g_mx = xSemaphoreCreateMutex();
  loadSettings();
  loadInstalledGifs();
  rtc::begin();
  restoreClockFromRtc();
  configTzTime(cfg::kTimezone, cfg::kNtpServer);

  g_pApi.setValue(g_settings.apiBase, sizeof(Settings::apiBase) - 1);
  g_pId.setValue(g_settings.deviceId, sizeof(Settings::deviceId) - 1);
  g_pToken.setValue(g_settings.token, sizeof(Settings::token) - 1);
  g_wm.addParameter(&g_pApi);
  g_wm.addParameter(&g_pId);
  g_wm.addParameter(&g_pToken);
  g_wm.setSaveParamsCallback(saveParams);
  g_wm.setSaveConfigCallback(saveParams);
  g_wm.setConfigPortalBlocking(false);
  g_wm.setConfigPortalTimeout(300);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  if (openSetupPortal || !g_wm.getWiFiIsSaved() || !configured()) {
    // Only open the setup page when asked or when there's nothing saved. If the
    // office Wi-Fi is just down, keep retrying quietly instead.
    g_wm.startConfigPortal(cfg::kSetupApName);
    g_portalOpen = true;
  } else {
    WiFi.begin();
  }

  xTaskCreatePinnedToCore(networkTask, "bzzy-net", 8192, nullptr, 1, nullptr, 0);
}

void loop() {
  if (g_portalOpen) {
    g_wm.process();
    if (!g_wm.getConfigPortalActive()) {
      g_portalOpen = false;
      WiFi.begin();
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

bool gifInstalled(size_t slot, const char* sha) {
  if (slot >= bzzy::kGifSlots || !sha || !*sha) return false;
  xSemaphoreTake(g_mx, portMAX_DELAY);
  bool same = strcmp(g_installed[slot], sha) == 0;
  xSemaphoreGive(g_mx);
  return same;
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
