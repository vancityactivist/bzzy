// Over-the-air update rules: version numbers, what the release signs, and whether
// to install an update the app offers. Pure (no Arduino), so it runs in native unit
// tests. app/src/lib/firmware.ts has the same version rules. See docs/ota.md.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace bzzy {

constexpr size_t kVersionMax = 24;  // "12.34.56" plus room for a "-rc.1" suffix

// A release version is "MAJOR.MINOR.PATCH", optionally followed by "-something".
// Anything else (an empty string, "dev") is a build flashed over USB.
bool isReleaseVersion(const char* v);

// <0 if a is older than b, 0 if the same, >0 if newer. Both must be release versions.
// "1.2.0-rc.1" is older than "1.2.0".
int compareVersions(const char* a, const char* b);

// What the release workflow signs for each board's file:
//   "bzzy-fw|1|<board>|<version>|<sha256 hex>"
// Signing the board and version (not just the file) means a signed file can't be
// passed off as a different version or sent to the wrong board.
// Returns the length, or 0 if it doesn't fit in `out`.
size_t otaSignedMessage(char* out, size_t n, const char* board, const char* version, const char* sha256Hex);

struct OtaOffer {
  const char* version;
  uint32_t nowId;  // non-zero: someone pressed "Update now" in the app
};

struct OtaContext {
  const char* running;        // this firmware's version
  const char* failedVersion;  // a version that was installed and rolled back, or ""
  uint32_t lastNowId;         // the last "Update now" press already acted on
  bool quiet;                 // a good moment: free or away, nothing on screen from the app
};

// Whether to download and install an offer now. The app only offers updates when
// auto-update is on or someone pressed "Update now"; this adds the device's own rules:
// - never a non-release version, and never older than (or the same as) what's running;
// - "Update now" installs right away, once per press, even on a test build or after
//   that version rolled back;
// - otherwise: not on a test build, not a version that rolled back, and only while quiet.
bool shouldInstall(const OtaOffer& offer, const OtaContext& ctx);

}  // namespace bzzy
