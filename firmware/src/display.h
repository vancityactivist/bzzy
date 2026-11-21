// Screen: a GIF (if one is stored for the status) above a text bar, or a solid
// colour card with big text when there's no GIF. "Show now" swaps in its own GIF
// (ShowGif) or a big wrapped message (ShowText). No-ops on boards without a screen.
#pragma once

#include <stdint.h>

#include "setup_flow.h"
#include "status_engine.h"

namespace display {

enum class Layout : uint8_t {
  Status,    // the status's GIF and label (or its colour card)
  ShowGif,   // the "show now" GIF on its background colour, full screen (or above its message)
  ShowText,  // the "show now" message, big, on its background colour (black by default)
  Loading,   // the status's colour card while the GIF it needs downloads (notice says so)
  Off,       // outside working hours: backlight off
};

struct View {
  Layout layout;
  bzzy::Status status;
  const char* text;  // event, custom or show-now text; may be ""
  uint32_t until;    // unix seconds; 0 = don't show a time
  bool online;
  const char* notice;  // one-off line such as "Updating firmware 40%"; may be nullptr
  int8_t progress = -1;  // 0-100: a bar along the notice; -1 = no bar
  // "Show now" colours (0xRRGGBB) behind and for its message; bgStatus: the status's
  // own screen colour. Only ShowGif and ShowText use them.
  uint32_t showBg = 0x000000;
  uint32_t showFg = 0xFFFFFF;
  bool showBgStatus = false;
};

// A setup screen (lib/core setup_flow.h): the step's QR code and a few lines of text,
// or, when `note` is set, a "done" card with a big check.
struct SetupView {
  bzzy::SetupStep step;
  bzzy::SetupNote note;
  uint8_t number, total;  // step dots; total 0 = none
  const char* qr;         // what the QR code says; nullptr = no QR code
  const char* title;
  const char* line1;      // may be "" or nullptr
  const char* line2;
  bool bigLine1;          // line1 in large type (the pairing code)
};

void begin();
void splash();             // the bzzy logo, shown at power-on
void show(const View& v);  // redraws only when something changed
void showSetup(const SetupView& v);  // likewise
void tick(uint32_t nowMs); // advances GIF frames
void releaseGif();         // close the GIF file so it can be replaced
void invalidate();         // redraw on the next show(), reopening the GIF

}  // namespace display
