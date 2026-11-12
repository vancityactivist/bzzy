#include "text_wrap.h"

namespace bzzy {

namespace {
// Advance widths (pixels) of ' '..'~' in LovyanGFX's FreeSansBold fonts, copied
// from the glyph tables in LovyanGFX/src/lgfx/Fonts/GFXFF. app/src/lib/screen.ts
// has the same tables for the app's preview.
constexpr uint8_t kBold12[95] = {
    7, 8, 11, 13, 13, 21, 17, 6, 8, 8, 9, 14, 6, 8, 6, 7,
    13, 14, 13, 13, 13, 13, 13, 13, 13, 13, 6, 6, 14, 14, 14, 15,
    23, 17, 17, 17, 17, 16, 15, 18, 18, 7, 14, 17, 15, 21, 18, 19,
    16, 19, 17, 16, 15, 18, 16, 23, 16, 15, 15, 8, 7, 8, 14, 13,
    6, 14, 15, 13, 15, 14, 8, 15, 14, 7, 7, 14, 6, 21, 15, 15,
    15, 15, 9, 13, 8, 15, 13, 19, 13, 13, 12, 9, 7, 9, 12,
};
constexpr uint8_t kBold18[95] = {
    10, 12, 17, 19, 19, 31, 25, 9, 12, 12, 14, 20, 9, 12, 9, 10,
    19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 9, 9, 20, 20, 20, 21,
    34, 24, 25, 25, 25, 23, 22, 27, 26, 11, 20, 25, 22, 30, 26, 27,
    24, 27, 25, 24, 23, 26, 23, 34, 24, 22, 21, 12, 10, 12, 20, 19,
    9, 20, 22, 20, 22, 20, 12, 21, 21, 10, 10, 20, 9, 31, 21, 21,
    22, 22, 14, 19, 12, 21, 19, 27, 19, 19, 18, 14, 10, 14, 18,
};
}  // namespace

int lineHeight(Font f) { return f == Font::Bold18 ? 42 : 29; }

int textWidth(const char* s, size_t n, Font f) {
  const uint8_t* w = f == Font::Bold18 ? kBold18 : kBold12;
  int total = 0;
  for (size_t i = 0; i < n && s[i]; ++i) {
    const unsigned char c = static_cast<unsigned char>(s[i]);
    // The fonts only have printable ASCII; anything else isn't drawn.
    if (c >= 0x20 && c <= 0x7e) total += w[c - 0x20];
  }
  return total;
}

size_t wrapText(const char* s, Font f, int maxWidth, size_t maxLines, Line* out, bool* cut) {
  size_t n = 0;
  while (s[n]) ++n;
  size_t count = 0;
  size_t i = 0;
  auto skipSpaces = [&](size_t j) {
    while (j < n && s[j] == ' ') ++j;
    return j;
  };
  i = skipSpaces(i);
  while (i < n && count < maxLines) {
    const size_t start = i;
    size_t end = start;  // end of the last word that fits
    size_t j = start;
    while (j < n) {
      size_t k = j;
      while (k < n && s[k] != ' ') ++k;
      if (textWidth(s + start, k - start, f) > maxWidth) break;
      end = k;
      j = skipSpaces(k);
    }
    if (end == start) {
      // One word wider than the line: break it between characters.
      size_t k = start;
      while (k < n && s[k] != ' ' && textWidth(s + start, k + 1 - start, f) <= maxWidth) ++k;
      if (k == start) ++k;  // always make progress
      end = k;
      j = k;
    }
    out[count].start = static_cast<uint8_t>(start);
    out[count].len = static_cast<uint8_t>(end - start);
    ++count;
    i = skipSpaces(j);
  }
  if (cut) *cut = i < n;
  return count;
}

Wrapped wrapMessage(const char* text) {
  Wrapped w;
  bool cut = false;
  w.font = Font::Bold18;
  w.count = wrapText(text, w.font, kMessageWidth, 4, w.lines, &cut);
  if (cut) {
    w.font = Font::Bold12;
    w.count = wrapText(text, w.font, kMessageWidth, kMaxLines, w.lines, &cut);
  }
  return w;
}

Wrapped wrapBar(const char* text) {
  Wrapped w;
  w.font = Font::Bold12;
  w.count = wrapText(text, w.font, kMessageWidth, 2, w.lines, nullptr);
  return w;
}

}  // namespace bzzy
