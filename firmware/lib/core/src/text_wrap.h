// Word wrap for messages on the 240 px screen, using the widths of the fonts the
// display draws with. Pure (no Arduino), so it runs in native unit tests, and
// app/src/lib/screen.ts does exactly the same so the app's preview matches.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace bzzy {

enum class Font : uint8_t { Bold12, Bold18 };  // FreeSansBold12pt7b, FreeSansBold18pt7b

constexpr int kMessageWidth = 220;  // 10 px margin each side
constexpr size_t kMaxLines = 6;

struct Line {
  uint8_t start;  // byte offset into the text
  uint8_t len;
};

struct Wrapped {
  Font font = Font::Bold12;
  size_t count = 0;
  Line lines[kMaxLines];
};

int lineHeight(Font f);
// Width in pixels of the first n bytes of s (stops early at a NUL).
int textWidth(const char* s, size_t n, Font f);

// Greedy word wrap into at most maxLines lines no wider than maxWidth. A word too
// wide for a line is broken between characters. Text past the last line is dropped
// and *cut (if given) is set.
size_t wrapText(const char* s, Font f, int maxWidth, size_t maxLines, Line* out, bool* cut);

// A message on its own card: big (18 pt, up to 4 lines) if it fits, else 12 pt
// (up to 6 lines).
Wrapped wrapMessage(const char* text);

// A message in the bar under a GIF: 12 pt, up to 2 lines.
Wrapped wrapBar(const char* text);

}  // namespace bzzy
