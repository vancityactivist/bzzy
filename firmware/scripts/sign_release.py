#!/usr/bin/env python3
"""Signs the firmware files for a release and writes manifest.json (docs/ota.md).

  sign_release.py --version 0.2.0 --tag fw-v0.2.0 --key signing-key.pem \
      --out dist build/waveshare_s3_touch_lcd169.bin build/esp32_generic.bin ...

Each input is named <board>.bin (the PlatformIO env). For each one it writes
dist/bzzy-<board>-<version>.bin and adds to the manifest its size, SHA-256, and an
ECDSA P-256 signature of "bzzy-fw|1|<board>|<version>|<sha256>", the message the
device checks (firmware/lib/core/src/ota_policy.h). Needs the openssl command.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time

VERSION_RE = re.compile(r"^\d{1,6}\.\d{1,6}\.\d{1,6}(-[0-9A-Za-z.]+)?$")


def sign(message: str, key: str) -> str:
    sig = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", key],
        input=message.encode(),
        capture_output=True,
        check=True,
    ).stdout
    return base64.b64encode(sig).decode()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True)
    ap.add_argument("--tag", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("bins", nargs="+")
    args = ap.parse_args()

    if not VERSION_RE.match(args.version) or len(args.version) >= 24:
        print(f"'{args.version}' isn't a release version like 0.2.0", file=sys.stderr)
        return 1

    os.makedirs(args.out, exist_ok=True)
    boards = {}
    for path in args.bins:
        board = os.path.basename(path).removesuffix(".bin")
        with open(path, "rb") as f:
            data = f.read()
        sha = hashlib.sha256(data).hexdigest()
        name = f"bzzy-{board}-{args.version}.bin"
        shutil.copyfile(path, os.path.join(args.out, name))
        boards[board] = {
            "file": name,
            "size": len(data),
            "sha256": sha,
            "sig": sign(f"bzzy-fw|1|{board}|{args.version}|{sha}", args.key),
        }
        print(f"{name}: {len(data)} bytes, sha256 {sha}")

    manifest = {
        "schema": 1,
        "version": args.version,
        "tag": args.tag,
        "builtAt": int(time.time()),
        "boards": boards,
    }
    with open(os.path.join(args.out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
