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
uint32_t now();        // unix seconds, or 0 if the clock isn't set yet

// Whether now is a good moment for an automatic firmware update (free or away, and
// nothing from the app on the screen). "Update now" from the app doesn't wait.
void setQuiet(bool quiet);

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
void installGifs();

}  // namespace net
