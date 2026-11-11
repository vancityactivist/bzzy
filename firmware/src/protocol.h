// JSON <-> State. The same format is used for the companion app's response
// and for the copy cached on the device's flash. See docs/protocol.md.
#pragma once

#include <Arduino.h>

#include "status_engine.h"

namespace bzzy {

// Returns false (and leaves `out` untouched) if the JSON is malformed.
bool parseState(const char* json, size_t len, State& out);
String serializeState(const State& st);

// The GIF the app wants for each status, indexed by Status (Free, Busy, Dnd, Away).
constexpr size_t kGifSlots = 4;
struct GifRef {
  bool present = false;  // false: no GIF, show the colour card
  char url[200] = "";
  char sha[17] = "";     // changes whenever the GIF does
};

// Returns false if the response has no "gifs" (an older app): leave GIFs as they are.
bool parseGifs(const char* json, size_t len, GifRef out[kGifSlots]);

}  // namespace bzzy
