// Wi-Fi, clock sync and talking to the companion app. HTTP runs on its own
// task so a slow request never freezes the GIF or LEDs.
#pragma once

#include <Arduino.h>

#include "status_engine.h"

namespace net {

struct Settings {
  char apiBase[96] = "";   // e.g. https://bzzy.ca
  char deviceId[40] = "";
  char token[64] = "";
};

// openSetupPortal: force the Wi-Fi setup page even if Wi-Fi is already saved.
void begin(bool openSetupPortal);
void loop();  // call from the main loop

bool online();         // Wi-Fi up AND the last sync worked
bool setupPortalOpen();

// What the setup screens need (lib/core setup_flow.h). Safe to call from the main loop.
struct SetupInfo {
  bool portalOpen;
  uint8_t apStations;   // phones on the setup Wi-Fi
  bool wifiUp;
  bool paired;          // has a device id and token
  char apName[16];      // the setup Wi-Fi, bzzy-XXXX
  char ssid[33];        // the Wi-Fi it's on, when wifiUp
  char apiBase[96];
  char code[8];         // pairing code; "" until the app gives one
  char pairUrl[96];     // where its QR code goes
  char pairedName[61];  // the name it was given in the app, once paired
};
void setupInfo(SetupInfo& out);
uint32_t now();        // unix seconds, or 0 if the clock isn't set yet

// Whether now is a good moment for an automatic firmware update (free or away, and
// nothing from the app on the screen). "Update now" from the app doesn't wait.
void setQuiet(bool quiet);

// While the light is awake outside working hours, poll every 20 s anyway, so what
// someone does in the app shows up quickly.
void setFastPoll(bool fast);

// If a new state arrived from the app since the last call, copy it out.
bool takeIncoming(bzzy::State& out);
// Tell the app about a button press (retried until it succeeds).
void reportOverride(const bzzy::Override& o);
// The person dismissed a team push with the button; retried until the app has it.
void reportPushAck(const char* id, uint32_t at);

// New GIFs are downloaded in the background to /gif/<status>.tmp. The main loop
// swaps them in (after closing the one on screen) when this says some are ready.
bool gifsReady();
// Whether the GIF with this sha is the one on flash for a slot (see protocol.h).
bool gifInstalled(size_t slot, const char* sha);
// Whether a slot has any GIF on flash.
bool gifOnFlash(size_t slot);
// Whether the app wants a GIF for this slot that's still downloading (false once it
// arrives, or once the light gives up on it).
bool gifLoading(size_t slot);
void installGifs();

}  // namespace net
