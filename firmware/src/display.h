// Screen: a GIF (if one is stored for the status) above a text bar, or a solid
// colour card with big text when there's no GIF. No-ops on boards without a screen.
#pragma once

#include <stdint.h>

#include "status_engine.h"

namespace display {

struct View {
  bzzy::Status status;
  const char* text;  // event or custom text; may be ""
  uint32_t until;    // unix seconds; 0 = don't show a time
  bool online;
  const char* notice;  // one-off line such as "Wi-Fi setup: join bzzy-setup"; may be nullptr
};

void begin();
void show(const View& v);  // redraws only when something changed
void tick(uint32_t nowMs); // advances GIF frames
void releaseGif();         // close the GIF file so it can be replaced
void invalidate();         // redraw on the next show(), reopening the GIF

}  // namespace display
