// Over-the-air firmware updates. The app offers a new release in its poll response;
// this downloads it into the spare app slot, checks its signature and hash, and
// restarts into it. If the new firmware can't reach the app within 10 minutes (or
// crashes first), the device goes back to the old slot and stops offering to take
// that version. See docs/ota.md.
#pragma once

#include <Arduino.h>

#include "ota_policy.h"

namespace ota {

struct Offer {
  char version[bzzy::kVersionMax] = "";
  char url[200] = "";
  uint32_t size = 0;
  char sha256[65] = "";  // hex
  char sig[128] = "";    // base64 DER ECDSA P-256 signature of bzzy::otaSignedMessage
  uint32_t nowId = 0;    // non-zero: someone pressed "Update now"
};

// Call early in setup(), before the network starts.
void begin();
// Call from the main loop: rolls back an update that never managed to sync.
void loop(uint32_t ms);

const char* version();        // this firmware, e.g. "0.2.0", or "dev"
const char* board();          // the PlatformIO env it was built for
const char* failedVersion();  // last version that rolled back, or ""
uint32_t lastNowId();         // the last "Update now" press acted on, or 0

// The network task calls this after each successful sync. The first one after an
// update confirms the new firmware, so it's kept.
void markHealthy();

// Whether to take this offer now (quiet: a good moment for an automatic update).
bool wanted(const Offer& o, bool quiet);

// Downloads, verifies and installs, then restarts. Returns only if it failed.
// Runs on the network task. The token is only sent to the app, never to the
// download host it redirects to.
bool install(const Offer& o, const char* appBase, const char* token);

// -1 when no update is downloading, else 0..100.
int progress();

}  // namespace ota
