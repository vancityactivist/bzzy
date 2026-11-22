#include "ship_mode.h"

#include <string.h>

namespace bzzy {

ShipAction shipStep(bool armed, bool shipInAnswer, const char* packedSsid, const char* currentSsid) {
  if (shipInAnswer && !armed) return ShipAction::Pack;
  if (shipInAnswer && !shipArrived(armed, packedSsid, currentSsid)) return ShipAction::Pack;
  if (!shipInAnswer && armed) return ShipAction::Done;
  return ShipAction::None;
}

bool shipArrived(bool armed, const char* packedSsid, const char* currentSsid) {
  if (!armed || !currentSsid || !*currentSsid) return false;
  return !packedSsid || strcmp(packedSsid, currentSsid) != 0;
}

}  // namespace bzzy
