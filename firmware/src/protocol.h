// JSON <-> State. The same format is used for the companion app's response
// and for the copy cached on the device's flash. See docs/protocol.md.
#pragma once

#include <Arduino.h>

#include "status_engine.h"

namespace bzzy {

// Returns false (and leaves `out` untouched) if the JSON is malformed.
bool parseState(const char* json, size_t len, State& out);
String serializeState(const State& st);

}  // namespace bzzy
