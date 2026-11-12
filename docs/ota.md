# Firmware updates over the air

Lights update themselves from GitHub Releases, through the companion app. The device still only makes outbound HTTPS requests, so this works on guest Wi-Fi.

```
 git tag fw-v0.3.0 ──▶ GitHub Action: build each board, sign, publish a Release
                                                │
                     app reads the latest release (read-only token, every ~10 min)
                                                │
 device poll ──(X-Bzzy-Firmware: 0.2.0)──▶ app ──▶ "firmware": { 0.3.0, url, sha256, sig }
                                                │
 device ──▶ app /firmware/0.3.0 ──302──▶ GitHub file ──▶ spare app slot ──▶ restart
```

## One-time setup

1. **Make the signing key**, on your own computer, from the repo root:

   ```sh
   firmware/scripts/make-ota-key.sh
   ```

   It keeps the private key in `~/.bzzy/ota-signing-key.pem`, writes the public key into `firmware/src/ota_key.h`, and saves the private key as the `BZZY_OTA_SIGNING_KEY` repo secret (with the GitHub CLI signed in; otherwise it tells you how to add it by hand). Commit `ota_key.h`. Keep the `.pem` file safe: anyone with it can make firmware your lights will install. Until `ota_key.h` has a key, lights never install updates.

2. **Let the app read releases.** The repo is private, so make a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to only this repo and only **Contents: Read**. Add it to the Vercel project as `FIRMWARE_GITHUB_TOKEN`. (`FIRMWARE_REPO` defaults to `vancityactivist/bzzy`.) With no token the app tries without one, which only works for a public repo.

3. **Flash each light over USB once** with firmware that has the key and the update code. After that, updates come over Wi-Fi.

## Releasing

```sh
git tag fw-v0.3.0 && git push origin fw-v0.3.0
```

The `firmware-release` workflow builds every board with that version baked in, checks that the signing secret matches `ota_key.h` (a mismatch would make every light refuse the release), signs each file, and publishes a GitHub Release with:

- `bzzy-<board>-<version>.bin` for each board (the app image, not a full flash image)
- `manifest.json`: for each board, the file name, size, SHA-256 and signature

A tag with a suffix (`fw-v0.3.0-rc.1`) is published as a pre-release. GitHub's "latest release" skips pre-releases, so lights never get one automatically.

Versions are `MAJOR.MINOR.PATCH`. A build without a version (anything you build yourself with `pio run`) is `dev`.

## What the device does

On each poll the device sends its version and board in headers (see [protocol.md](protocol.md)). When the app's reply has a `firmware` offer, the device installs it if all of these hold:

- the offered version is newer than what it runs (it never goes back to an older version, even when asked);
- and either someone pressed **Update now** (installs straight away, once per press), or:
  - it's running a release, not a `dev` build you flashed over USB,
  - that version hasn't already failed on this light, and
  - it's a quiet moment: the status is Free or Away and nothing from "show now" is on screen.

The rules are in `firmware/lib/core/src/ota_policy.cpp`, with unit tests.

Installing:

1. Check the signature before downloading anything. The release signs `bzzy-fw|1|<board>|<version>|<sha256>` with ECDSA P-256, so a file can't be passed off as another version or sent to the wrong board.
2. Ask the app's `/firmware/<version>` route for the file. It answers with a short-lived redirect to GitHub. The device follows it **without** its token.
3. Stream the file into the spare app slot (the board has two), hashing as it goes. If the size or SHA-256 doesn't match, throw it away. The screen shows "Updating firmware 42%" while this happens.
4. Mark the new slot to boot, remember which version it's trying, and restart.

The device doesn't check the HTTPS certificate yet (see the TODO in `net.cpp`). The signature is what makes updates safe regardless.

## Rollback

The new firmware starts on probation. It's kept once it completes a sync with the app. If it crashes before that, the bootloader goes back to the old slot on the next restart. If it runs for 10 minutes without a successful sync, it rolls itself back.

Back on the old firmware, the device notices the version it tried isn't the one running. It reports that version as failed (`X-Bzzy-Update-Failed`) and won't install it automatically again. The Devices page says the update didn't start properly and offers **Try again**. A newer release installs as normal.

The bootloader can only roll back to firmware that's still in the other slot, so this protects against a bad update, not against a light that never had a good one.

## In the app

- **Add device** has "Update the firmware automatically", ticked by default.
- Each device card shows the firmware version, an **Update automatically** switch, and **Update now** when a newer release is out (or **Install** for a test build, **Try again** after a rollback).
- The app re-reads the latest release when a device polls or the Devices page loads and the saved copy is more than 10 minutes old. There's no cron.

## Testing an update

1. Flash a light over USB with a released version: `BZZY_FW_VERSION=0.1.0 pio run -e waveshare_s3_touch_lcd169 -t upload` from `firmware/`.
2. Push a newer tag. Within ten minutes the Devices page shows the new version as available.
3. Press **Update now** (or wait for a quiet moment with auto-update on) and watch `pio device monitor`: `[ota] installing…`, then a restart, then `[ota] 0.x.y confirmed` after the first sync.
