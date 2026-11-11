// Wi-Fi, clock sync and talking to the companion app. HTTP runs on its own
// task so a slow request never freezes the GIF or LEDs.
#pragma once

#include <Arduino.h>

#include "status_engine.h"

namespace net {

struct Settings {
  char apiBase[96] = "";   // e.g. https://bzzy.vercel.app
  char deviceId[40] = "";
  char token[64] = "";
};

// openSetupPortal: force the Wi-Fi setup page even if Wi-Fi is already saved.
void begin(bool openSetupPortal);
void loop();  // call from the main loop

bool online();         // Wi-Fi up AND the last sync worked
bool setupPortalOpen();
uint32_t now();        // unix seconds, or 0 if the clock isn't set yet

// If a new state arrived from the app since the last call, copy it out.
bool takeIncoming(bzzy::State& out);
// Tell the app about a button press (retried until it succeeds).
void reportOverride(const bzzy::Override& o);

// New GIFs are downloaded in the background to /gif/<status>.tmp. The main loop
// swaps them in (after closing the one on screen) when this says some are ready.
bool gifsReady();
void installGifs();

}  // namespace net
