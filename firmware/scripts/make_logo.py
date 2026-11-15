"""Turn a white-on-black render of the "bzzy" wordmark into src/logo_wordmark.h.

The wordmark is outlined in docs/brand/bzzy-lockup-dark.svg. Render just its <g>
group white on black (any browser screenshot will do), then:

    python3 scripts/make_logo.py word.png 140 > src/logo_wordmark.h

The output is 4-bit greyscale, two pixels a byte, high nibble first, which is what
LovyanGFX's pushGrayscaleImage takes. The tile and its four dots are drawn with
shapes on the device, so only the letters need a bitmap.
"""

import sys

from PIL import Image


def main(path: str, width: int) -> None:
    im = Image.open(path).convert("L")
    im = im.crop(im.getbbox())
    width += width % 2  # rows are whole bytes
    height = round(im.height * width / im.width)
    im = im.resize((width, height), Image.LANCZOS)
    px = list(im.getdata())
    out = []
    for i in range(0, len(px), 2):
        hi, lo = (round(v * 15 / 255) for v in px[i : i + 2])
        out.append(f"0x{hi << 4 | lo:02x}")
    print("// Made by scripts/make_logo.py from docs/brand/bzzy-lockup-dark.svg. Don't edit by hand.")
    print("#pragma once")
    print("#include <stdint.h>")
    print(f"constexpr int kWordmarkW = {width};")
    print(f"constexpr int kWordmarkH = {height};")
    print("static const uint8_t kWordmark[] = {")
    for i in range(0, len(out), 20):
        print("  " + ", ".join(out[i : i + 20]) + ",")
    print("};")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 140)
