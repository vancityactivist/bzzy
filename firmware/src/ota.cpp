#include "ota.h"

#include <HTTPClient.h>
#include <Preferences.h>
#include <Update.h>
#include <WiFiClientSecure.h>
#include <esp_ota_ops.h>
#include <mbedtls/base64.h>
#include <mbedtls/pk.h>
#include <mbedtls/sha256.h>
#include <mbedtls/version.h>

#include "config.h"
#include "ota_key.h"

#ifndef BZZY_FW_VERSION
#define BZZY_FW_VERSION "dev"
#endif
#ifndef BZZY_BOARD_NAME
#define BZZY_BOARD_NAME "unknown"
#endif

// The Arduino core confirms a freshly installed app as soon as it boots unless this
// says we'll do it ourselves. We do: only once it has synced with the app.
extern "C" bool verifyRollbackLater() { return true; }

namespace ota {

static constexpr const char* kPrefs = "bzzy-ota";
static constexpr uint32_t kConfirmWithinMs = 10 * 60 * 1000;
static constexpr uint32_t kStallMs = 20 * 1000;  // give up if no bytes arrive for this long

static volatile bool g_pendingVerify = false;  // running a new update that isn't confirmed yet
static char g_failed[bzzy::kVersionMax] = "";
static uint32_t g_lastNowId = 0;
static volatile int g_progress = -1;

#if MBEDTLS_VERSION_MAJOR >= 3
#define SHA256_START(c) mbedtls_sha256_starts(c, 0)
#define SHA256_UPDATE(c, d, n) mbedtls_sha256_update(c, d, n)
#define SHA256_FINISH(c, out) mbedtls_sha256_finish(c, out)
#else
#define SHA256_START(c) mbedtls_sha256_starts_ret(c, 0)
#define SHA256_UPDATE(c, d, n) mbedtls_sha256_update_ret(c, d, n)
#define SHA256_FINISH(c, out) mbedtls_sha256_finish_ret(c, out)
#endif

const char* version() { return BZZY_FW_VERSION; }
const char* board() { return BZZY_BOARD_NAME; }
const char* failedVersion() { return g_failed; }
uint32_t lastNowId() { return g_lastNowId; }
int progress() { return g_progress; }

void begin() {
  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t state;
  g_pendingVerify = running && esp_ota_get_state_partition(running, &state) == ESP_OK &&
                    state == ESP_OTA_IMG_PENDING_VERIFY;

  Preferences p;
  p.begin(kPrefs, false);
  // "trying" is the version we restarted into. If we're not running it, it didn't
  // stick (crashed, or never reached the app) and the bootloader brought us back.
  String trying = p.getString("trying", "");
  if (trying.length() && trying != version()) {
    Serial.printf("[ota] %s didn't start properly; back on %s\n", trying.c_str(), version());
    p.putString("failed", trying);
    p.remove("trying");
  }
  p.getString("failed", g_failed, sizeof(g_failed));
  g_lastNowId = p.getUInt("nowId", 0);
  p.end();

  Serial.printf("[ota] firmware %s for %s%s\n", version(), board(), g_pendingVerify ? " (new, not confirmed yet)" : "");
  if (!kOtaPublicKeyPem[0]) Serial.println("[ota] no signing key built in: updates are off");
}

void markHealthy() {
  if (!g_pendingVerify) return;
  esp_ota_mark_app_valid_cancel_rollback();
  g_pendingVerify = false;
  Preferences p;
  p.begin(kPrefs, false);
  p.remove("trying");
  p.remove("failed");
  p.end();
  g_failed[0] = '\0';
  Serial.printf("[ota] %s confirmed\n", version());
}

void loop(uint32_t ms) {
  if (g_pendingVerify && ms > kConfirmWithinMs) {
    Serial.println("[ota] new firmware never reached the app: rolling back");
    delay(100);
    esp_ota_mark_app_invalid_rollback_and_reboot();  // doesn't return if there's an old slot
    g_pendingVerify = false;
  }
}

bool wanted(const Offer& o, bool quiet) {
  if (!kOtaPublicKeyPem[0] || !o.version[0]) return false;
  return bzzy::shouldInstall({o.version, o.nowId}, {version(), g_failed, g_lastNowId, quiet});
}

// ---- checks ----

static void toHex(const uint8_t* b, size_t n, char* out) {
  static const char* kHex = "0123456789abcdef";
  for (size_t i = 0; i < n; ++i) {
    out[i * 2] = kHex[b[i] >> 4];
    out[i * 2 + 1] = kHex[b[i] & 15];
  }
  out[n * 2] = '\0';
}

static bool signatureOk(const Offer& o) {
  char msg[200];
  if (!bzzy::otaSignedMessage(msg, sizeof(msg), board(), o.version, o.sha256)) return false;

  uint8_t sig[96];
  size_t sigLen = 0;
  if (mbedtls_base64_decode(sig, sizeof(sig), &sigLen, (const uint8_t*)o.sig, strlen(o.sig)) != 0) return false;

  uint8_t hash[32];
  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  SHA256_START(&sha);
  SHA256_UPDATE(&sha, (const uint8_t*)msg, strlen(msg));
  SHA256_FINISH(&sha, hash);
  mbedtls_sha256_free(&sha);

  mbedtls_pk_context pk;
  mbedtls_pk_init(&pk);
  bool ok = mbedtls_pk_parse_public_key(&pk, (const uint8_t*)kOtaPublicKeyPem, sizeof(kOtaPublicKeyPem)) == 0 &&
            mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256, hash, sizeof(hash), sig, sigLen) == 0;
  mbedtls_pk_free(&pk);
  return ok;
}

static bool isHex64(const char* s) {
  if (strlen(s) != 64) return false;
  for (const char* p = s; *p; ++p) {
    if (!((*p >= '0' && *p <= '9') || (*p >= 'a' && *p <= 'f'))) return false;
  }
  return true;
}

// ---- download ----

static bool isRedirect(int code) { return code == 301 || code == 302 || code == 303 || code == 307 || code == 308; }

static bool fail(const char* why) {
  Serial.printf("[ota] update failed: %s\n", why);
  g_progress = -1;
  return false;
}

bool install(const Offer& o, const char* appBase, const char* token) {
  const esp_partition_t* slot = esp_ota_get_next_update_partition(nullptr);
  if (!slot) return fail("no spare app slot (partition table)");
  if (o.size == 0 || o.size > slot->size) return fail("size doesn't fit the app slot");
  if (!isHex64(o.sha256)) return fail("bad sha256");
  // Check the signature before downloading anything: it covers board, version and hash,
  // so an offer for the wrong board or a made-up version stops here.
  if (!signatureOk(o)) return fail("signature doesn't match");

  Serial.printf("[ota] installing %s (%u bytes)\n", o.version, (unsigned)o.size);
  g_progress = 0;

  // The app answers with a short-lived redirect to the file. Follow it by hand so the
  // device token only ever goes to the app.
  WiFiClientSecure appClient, fileClient;
  appClient.setInsecure();   // the signature and hash are what we trust, not the connection
  fileClient.setInsecure();
  HTTPClient http;
  http.setTimeout(kStallMs);
  http.setConnectTimeout(cfg::kHttpTimeoutMs);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!http.begin(appClient, o.url)) return fail("bad url");
  if (token && token[0] && appBase && appBase[0] && strncmp(o.url, appBase, strlen(appBase)) == 0) {
    http.addHeader("Authorization", String("Bearer ") + token);
  }
  int code = http.GET();
  for (int hops = 0; isRedirect(code) && hops < 3; ++hops) {
    String next = http.getLocation();
    http.end();
    if (!next.startsWith("https://")) return fail("redirect isn't https");
    if (!http.begin(fileClient, next)) return fail("bad redirect");
    code = http.GET();
  }
  if (code != 200) {
    Serial.printf("[ota] GET -> %d\n", code);
    http.end();
    return fail("download refused");
  }
  const int len = http.getSize();
  if (len >= 0 && (uint32_t)len != o.size) {
    http.end();
    return fail("size doesn't match the offer");
  }

  if (!Update.begin(o.size, U_FLASH)) {
    http.end();
    return fail(Update.errorString());
  }

  uint8_t* buf = (uint8_t*)malloc(4096);
  if (!buf) {
    Update.abort();
    http.end();
    return fail("out of memory");
  }
  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  SHA256_START(&sha);

  WiFiClient* stream = http.getStreamPtr();
  uint32_t got = 0;
  uint32_t lastData = millis();
  bool writeOk = true;
  while (got < o.size) {
    size_t avail = stream->available();
    if (!avail) {
      if (!stream->connected() || millis() - lastData > kStallMs) break;
      vTaskDelay(pdMS_TO_TICKS(5));
      continue;
    }
    size_t want = min<size_t>(min<size_t>(avail, 4096), o.size - got);
    int n = stream->readBytes(buf, want);
    if (n <= 0) continue;
    SHA256_UPDATE(&sha, buf, n);
    if (Update.write(buf, n) != (size_t)n) {
      writeOk = false;
      break;
    }
    got += n;
    lastData = millis();
    g_progress = (int)((uint64_t)got * 100 / o.size);
  }
  free(buf);
  http.end();

  uint8_t digest[32];
  char hex[65];
  SHA256_FINISH(&sha, digest);
  mbedtls_sha256_free(&sha);
  toHex(digest, sizeof(digest), hex);

  if (!writeOk || got != o.size) {
    Update.abort();
    return fail(writeOk ? "download cut short" : Update.errorString());
  }
  if (strcmp(hex, o.sha256) != 0) {
    Update.abort();
    return fail("file doesn't match its signed hash");
  }
  if (!Update.end()) return fail(Update.errorString());  // also marks the new slot to boot next

  // Remember what we're trying, so the old firmware can tell if it comes back.
  Preferences p;
  p.begin(kPrefs, false);
  p.putString("trying", o.version);
  if (o.nowId) p.putUInt("nowId", o.nowId);
  p.end();

  Serial.printf("[ota] %s installed, restarting\n", o.version);
  g_progress = 100;
  delay(500);
  ESP.restart();
  return true;  // not reached
}

}  // namespace ota
