// The public half of the key that signs firmware releases. Devices only install
// updates signed by the matching private key, which lives in the repo's
// BZZY_OTA_SIGNING_KEY secret and nowhere else.
//
// Made by firmware/scripts/make-ota-key.sh. See docs/ota.md.
#pragma once

static const char kOtaPublicKeyPem[] =
    "-----BEGIN PUBLIC KEY-----\n"
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEBorCFVhROvOw/t5wW9l51Xx1icQ7\n"
    "fQlI8ySOS8dwwQyW8Hnwu0KBYrp0FqApRFezC5gNd/b9ZlF62jInodhR4w==\n"
    "-----END PUBLIC KEY-----\n"
    ;
