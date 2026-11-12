// The public half of the key that signs firmware releases. Devices only install
// updates signed by the matching private key, which lives in the repo's
// BZZY_OTA_SIGNING_KEY secret and nowhere else.
//
// Make the pair with firmware/scripts/make-ota-key.sh, which rewrites this file.
// While it's empty, the device never installs an update. See docs/ota.md.
#pragma once

static const char kOtaPublicKeyPem[] = "";
