#include "setup_flow.h"

#include <string.h>

namespace bzzy {

static uint8_t numberOf(SetupStep s, bool wifiSteps) {
  switch (s) {
    case SetupStep::JoinAp: return 1;
    case SetupStep::ChooseWifi:
    case SetupStep::Connecting: return 2;
    case SetupStep::GetCode:
    case SetupStep::ShowCode: return wifiSteps ? 3 : 1;
    default: return 0;
  }
}

static bool isWifiStep(SetupStep s) {
  return s == SetupStep::JoinAp || s == SetupStep::ChooseWifi || s == SetupStep::Connecting;
}
static bool isPairStep(SetupStep s) { return s == SetupStep::GetCode || s == SetupStep::ShowCode; }

SetupScreen SetupFlow::update(const SetupInputs& in, uint32_t nowMs) {
  if (!started_) {
    started_ = true;
    pairedAtStart_ = in.paired;
  }
  if (in.portalOpen) sawPortal_ = true;

  SetupStep step;
  if (in.portalOpen) {
    step = in.apStations ? SetupStep::ChooseWifi : SetupStep::JoinAp;
  } else if (!in.paired) {
    step = !in.wifiUp ? SetupStep::Connecting : in.haveCode ? SetupStep::ShowCode : SetupStep::GetCode;
  } else if (sawPortal_ && !in.wifiUp && last_ != SetupStep::None) {
    // Changing the Wi-Fi of a light that's already paired: wait until it's on.
    step = SetupStep::Connecting;
  } else {
    step = SetupStep::None;
  }
  if (isPairStep(step)) sawPairing_ = true;

  // A step forward gets a card. Going back (the phone left the setup Wi-Fi) doesn't.
  SetupNote note = SetupNote::None;
  if (last_ == SetupStep::JoinAp && step == SetupStep::ChooseWifi) {
    note = SetupNote::PhoneJoined;
  } else if (isWifiStep(last_) && (isPairStep(step) || step == SetupStep::None)) {
    note = SetupNote::Online;
  } else if (isPairStep(last_) && step == SetupStep::None) {
    note = SetupNote::Paired;
  }
  if (note != SetupNote::None) {
    note_ = note;
    noteUntil_ = nowMs + kSetupNoteMs;
  }
  last_ = step;
  if (note_ != SetupNote::None && (int32_t)(nowMs - noteUntil_) >= 0) note_ = SetupNote::None;

  // Steps are numbered only when there's more than one this time round.
  const bool wifiSteps = sawPortal_;
  const bool pairStep = sawPairing_ || !pairedAtStart_;
  const uint8_t total = (wifiSteps ? 2 : 0) + (pairStep ? 1 : 0);
  SetupScreen out = {step, note_, 0, 0};
  if (total > 1 && step != SetupStep::None) {
    out.number = numberOf(step, wifiSteps);
    out.total = total;
  }
  return out;
}

bool wifiQrPayload(const char* ssid, char* out, size_t n) {
  static const char kHead[] = "WIFI:T:nopass;S:";
  size_t o = 0;
  auto put = [&](char c) {
    if (o + 1 >= n) return false;
    out[o++] = c;
    return true;
  };
  for (const char* p = kHead; *p; ++p)
    if (!put(*p)) return false;
  for (const char* p = ssid; *p; ++p) {
    if (strchr("\\;,:\"", *p) && !put('\\')) return false;
    if (!put(*p)) return false;
  }
  if (!put(';') || !put(';')) return false;
  out[o] = '\0';
  return true;
}

void formatPairCode(const char* code, char* out, size_t n) {
  if (!n) return;
  if (strlen(code) != 6 || n < 8) {
    strncpy(out, code, n - 1);
    out[n - 1] = '\0';
    return;
  }
  memcpy(out, code, 3);
  out[3] = '-';
  memcpy(out + 4, code + 3, 3);
  out[7] = '\0';
}

void hostOf(const char* url, char* out, size_t n) {
  if (!n) return;
  const char* p = strstr(url, "://");
  p = p ? p + 3 : url;
  size_t len = strcspn(p, "/?#");
  if (len >= n) len = n - 1;
  memcpy(out, p, len);
  out[len] = '\0';
}

}  // namespace bzzy
