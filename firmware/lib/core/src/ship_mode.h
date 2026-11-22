// Ship mode (docs/provisioning.md): a light set up on someone's bench and boxed up for
// its owner. When the app's answer says `ship: true`, the light remembers which Wi-Fi
// it was on, forgets that Wi-Fi (keeping its device id and token) and shows "Packed".
// At its new home it gets set up on the owner's Wi-Fi, and its first poll from a
// different network says so with `X-Bzzy-Arrived: 1`. Pure, so it's unit-tested.
#pragma once

#include <stddef.h>

namespace bzzy {

enum class ShipAction {
  None,
  Pack,  // in ship mode on the bench Wi-Fi: save the Wi-Fi name, forget the Wi-Fi
  Done,  // ship mode is over (it arrived, or the app took it out): forget the saved name
};

// What to do with the latest answer from the app. `armed`: ship mode is saved on the
// light. Back on the Wi-Fi it was packed on (tested again on the bench), it packs again,
// so it never reaches its owner with the bench Wi-Fi still saved.
ShipAction shipStep(bool armed, bool shipInAnswer, const char* packedSsid, const char* currentSsid);

// Whether the next poll says the light has reached its owner: in ship mode, on a Wi-Fi
// network with a different name from the one it was packed on.
bool shipArrived(bool armed, const char* packedSsid, const char* currentSsid);

}  // namespace bzzy
