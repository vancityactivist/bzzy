#!/usr/bin/env bash
# Makes the key pair that signs firmware releases (docs/ota.md). Run it once, on
# your own computer, from the repo root:
#
#   firmware/scripts/make-ota-key.sh
#
# It writes the private key to ~/.bzzy/ota-signing-key.pem (keep it safe: anyone
# with it can make firmware your lights will install), puts the public key in
# firmware/src/ota_key.h, and, if the GitHub CLI is signed in, saves the private
# key as the repo's BZZY_OTA_SIGNING_KEY secret. Commit ota_key.h afterwards.
set -euo pipefail

dir="$HOME/.bzzy"
key="$dir/ota-signing-key.pem"
header="$(git rev-parse --show-toplevel)/firmware/src/ota_key.h"

if [[ -e "$key" ]]; then
  echo "Using the existing key at $key"
else
  mkdir -p "$dir"
  chmod 700 "$dir"
  (umask 077 && openssl ecparam -name prime256v1 -genkey -noout -out "$key")
  echo "Made a new key at $key"
fi

pub="$(openssl ec -in "$key" -pubout 2>/dev/null)"
{
  echo '// The public half of the key that signs firmware releases. Devices only install'
  echo '// updates signed by the matching private key, which lives in the repo'"'"'s'
  echo '// BZZY_OTA_SIGNING_KEY secret and nowhere else.'
  echo '//'
  echo '// Made by firmware/scripts/make-ota-key.sh. See docs/ota.md.'
  echo '#pragma once'
  echo ''
  echo 'static const char kOtaPublicKeyPem[] ='
  while IFS= read -r line; do echo "    \"$line\\n\""; done <<<"$pub"
  echo '    ;'
} >"$header"
echo "Wrote the public key to $header"

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  gh secret set BZZY_OTA_SIGNING_KEY <"$key"
  echo "Saved the private key as the BZZY_OTA_SIGNING_KEY repo secret"
else
  echo "Now add the private key as a repo secret named BZZY_OTA_SIGNING_KEY:"
  echo "  GitHub > Settings > Secrets and variables > Actions > New repository secret"
  echo "  (paste the whole of $key)"
fi
echo "Then commit firmware/src/ota_key.h and flash the board once over USB, so it has the key."
