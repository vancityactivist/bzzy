// What the screen shows while a light is being set up: join the setup Wi-Fi, pick
// your own Wi-Fi, then add the light to bzzy with a pairing code (docs/protocol.md,
// "Pairing"). Each step forward gets a short "done" card first (a big check and a
// green flash on the ring), so moving on never looks like a glitch. Pure, so it's
// unit-tested off the device.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace bzzy {

enum class SetupStep : uint8_t {
  None,        // set up: the normal status screen
  JoinAp,      // QR code that joins the setup Wi-Fi
  ChooseWifi,  // a phone joined: QR code for the setup page, in case it didn't open
  Connecting,  // Wi-Fi saved, not connected yet
  GetCode,     // online, asking the app for a pairing code
  ShowCode,    // QR code for {app}/pair/<code>
};

// The card shown for a moment after a step is done.
enum class SetupNote : uint8_t { None, PhoneJoined, Online, Paired };

struct SetupInputs {
  bool portalOpen;     // the setup Wi-Fi and page are up
  uint8_t apStations;  // phones joined to the setup Wi-Fi
  bool wifiUp;         // connected to the real Wi-Fi
  bool paired;         // has a device id and token
  bool haveCode;       // the app gave us a pairing code
};

struct SetupScreen {
  SetupStep step;
  SetupNote note;   // when not None, show this card instead of the step for now
  uint8_t number;   // "step number of total"; 0 = don't show step numbers
  uint8_t total;
};

constexpr uint32_t kSetupNoteMs = 2500;

class SetupFlow {
 public:
  SetupScreen update(const SetupInputs& in, uint32_t nowMs);

 private:
  bool started_ = false;
  bool pairedAtStart_ = false;
  bool sawPortal_ = false;   // the Wi-Fi steps were shown this boot
  bool sawPairing_ = false;  // the pairing step was needed this boot
  SetupStep last_ = SetupStep::None;
  SetupNote note_ = SetupNote::None;
  uint32_t noteUntil_ = 0;
};

// The text of a QR code that joins an open Wi-Fi network:
// WIFI:T:nopass;S:<ssid>;; with \ ; , : and " escaped. False if it doesn't fit.
bool wifiQrPayload(const char* ssid, char* out, size_t n);

// "K7QF2M" -> "K7Q-F2M". Anything that isn't six characters is copied as it is.
void formatPairCode(const char* code, char* out, size_t n);

// "https://bzzy.ca/" -> "bzzy.ca": what to print under a link.
void hostOf(const char* url, char* out, size_t n);

}  // namespace bzzy
