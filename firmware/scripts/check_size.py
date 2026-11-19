# PlatformIO post-build script: fail the build when firmware.bin won't fit its app slot.
#
# PlatformIO's "Flash: used" figure is the sum of the ELF sections, which on the C6
# came out ~73 KB under the real image (segment padding and alignment). A 1.57 MB
# image passed as "95.5%" of a 1.5 MB slot and the board boot-looped. This checks
# the .bin that actually gets flashed against the smallest app partition in the
# partition table that gets flashed with it.
import os
import struct

Import("env")  # noqa: F821 (provided by PlatformIO)

WARN_BELOW = 32 * 1024  # say so when less than this is left


def app_slot_sizes(path):
    """Sizes of the app partitions in an ESP-IDF partition table binary."""
    sizes = []
    with open(path, "rb") as f:
        data = f.read()
    for i in range(0, len(data) - 31, 32):
        magic, ptype, _subtype, _offset, size = struct.unpack_from("<HBBII", data, i)
        if magic != 0x50AA:  # 0xAA 0x50, little-endian; anything else ends the table
            break
        if ptype == 0x00:  # app
            sizes.append(size)
    return sizes


def check(target, source, env):
    bin_path = str(target[0])
    table = os.path.join(env.subst("$BUILD_DIR"), "partitions.bin")
    if not os.path.isfile(table):
        print(f"check_size: no {table}, skipping")
        return 0
    slots = app_slot_sizes(table)
    if not slots:
        print("check_size: no app partitions found, skipping")
        return 0
    slot = min(slots)
    size = os.path.getsize(bin_path)
    left = slot - size
    pct = 100.0 * size / slot
    print(f"check_size: firmware.bin {size:,} bytes of a {slot:,}-byte app slot ({pct:.1f}%, {left:,} bytes left)")
    if left < 0:
        print(f"check_size: ERROR: firmware.bin is {-left:,} bytes too big for its app slot. "
              "It would boot-loop. Make it smaller or give the slots more room (board_build.partitions).")
        env.Exit(1)
    if left < WARN_BELOW:
        print(f"check_size: WARNING: under {WARN_BELOW // 1024} KB left in the app slot")
    return 0


env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", check)  # noqa: F821
