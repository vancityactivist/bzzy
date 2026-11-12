#include "ota_policy.h"

#include <stdio.h>
#include <string.h>

namespace bzzy {

namespace {

struct Parsed {
  unsigned long part[3];
  const char* suffix;  // after the '-', or nullptr
};

bool parse(const char* v, Parsed& out) {
  if (!v || !*v) return false;
  const char* p = v;
  for (int i = 0; i < 3; ++i) {
    if (*p < '0' || *p > '9') return false;
    unsigned long n = 0;
    int digits = 0;
    while (*p >= '0' && *p <= '9') {
      n = n * 10 + (unsigned long)(*p - '0');
      if (++digits > 6) return false;
      ++p;
    }
    out.part[i] = n;
    if (i < 2) {
      if (*p != '.') return false;
      ++p;
    }
  }
  if (*p == '\0') {
    out.suffix = nullptr;
  } else if (*p == '-' && p[1]) {
    out.suffix = p + 1;
  } else {
    return false;
  }
  return strlen(v) < kVersionMax;
}

}  // namespace

bool isReleaseVersion(const char* v) {
  Parsed p;
  return parse(v, p);
}

int compareVersions(const char* a, const char* b) {
  Parsed pa, pb;
  if (!parse(a, pa) || !parse(b, pb)) return 0;
  for (int i = 0; i < 3; ++i) {
    if (pa.part[i] != pb.part[i]) return pa.part[i] < pb.part[i] ? -1 : 1;
  }
  if (!pa.suffix && !pb.suffix) return 0;
  if (!pa.suffix) return 1;  // 1.2.0 is newer than 1.2.0-rc.1
  if (!pb.suffix) return -1;
  int c = strcmp(pa.suffix, pb.suffix);
  return c < 0 ? -1 : c > 0 ? 1 : 0;
}

size_t otaSignedMessage(char* out, size_t n, const char* board, const char* version, const char* sha256Hex) {
  int len = snprintf(out, n, "bzzy-fw|1|%s|%s|%s", board, version, sha256Hex);
  if (len <= 0 || (size_t)len >= n) {
    if (n) out[0] = '\0';
    return 0;
  }
  return (size_t)len;
}

bool shouldInstall(const OtaOffer& offer, const OtaContext& ctx) {
  if (!isReleaseVersion(offer.version)) return false;
  const bool runningRelease = isReleaseVersion(ctx.running);
  if (runningRelease && compareVersions(offer.version, ctx.running) <= 0) return false;
  if (offer.nowId != 0 && offer.nowId != ctx.lastNowId) return true;
  if (!runningRelease) return false;
  if (ctx.failedVersion && strcmp(ctx.failedVersion, offer.version) == 0) return false;
  return ctx.quiet;
}

}  // namespace bzzy
