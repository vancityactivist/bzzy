// The display API (display.h) on a 16x2 HD44780 character LCD, for the classic ESP32
// test build (env esp32_lcd1602, docs/esp32-test-build.md). Text only: no GIFs and no
// QR codes, so setup shows the Wi-Fi name and the pairing code as words instead.
//
//   Status:   "BUSY  til 3:30pm"   the status, and when it ends
//             "Budget meeting"     the event or custom text, or a notice
//   Show now: the message on both rows (word-wrapped), or scrolling if it's longer
//
// Rows longer than 16 characters scroll. A small Wi-Fi mark top right means the light
// can't reach the app right now.

#include "display.h"

#include "config.h"

#if BZZY_HAS_TEXT_LCD

#include <Arduino.h>
#include <LiquidCrystal.h>
#include <string.h>
#include <time.h>

#include "ota.h"

namespace display {

static constexpr int kCols = 16;
static constexpr size_t kRowMax = 112;  // longest row we keep (it scrolls)
static constexpr uint32_t kScrollStepMs = 350;
static constexpr uint32_t kScrollPauseMs = 1500;  // at each end, so it can be read
static constexpr uint8_t kGlyphOffline = 0;       // custom character slot

static LiquidCrystal g_lcd(PIN_LCD_RS, PIN_LCD_EN, PIN_LCD_D4, PIN_LCD_D5, PIN_LCD_D6, PIN_LCD_D7);

struct Row {
  char text[kRowMax] = "";
  size_t len = 0;
  size_t offset = 0;      // first character shown while scrolling
  uint32_t nextMs = 0;    // when to move on
  char shown[kCols + 1] = "";  // what's on the glass now, so we only write changes
};

static Row g_rows[2];
static bool g_offline = false;
static bool g_on = true;
static uint32_t g_hash = 0;
static bool g_drawn = false;

static uint32_t hashStr(uint32_t h, const char* s) {
  if (!s) s = "";
  for (; *s; ++s) h = (h ^ (uint8_t)*s) * 16777619u;
  return (h ^ 0xff) * 16777619u;
}

// The LCD's character ROM is ASCII plus Japanese katakana, so UTF-8 is folded down:
// curly quotes and dashes become plain ones and anything else becomes '?'.
static void toLcd(const char* in, char* out, size_t n) {
  size_t o = 0;
  if (!in) in = "";
  const uint8_t* s = (const uint8_t*)in;
  while (*s && o + 3 < n) {
    if (*s < 0x80) {
      // The ROM has a yen sign at '\\' and an arrow at '~'.
      out[o++] = *s < 0x20 ? ' ' : *s == '\\' ? '/' : *s == '~' ? '-' : (char)*s;
      ++s;
      continue;
    }
    // Decode one multi-byte character.
    uint32_t cp = 0;
    int extra = (*s >= 0xf0) ? 3 : (*s >= 0xe0) ? 2 : (*s >= 0xc0) ? 1 : 0;
    cp = *s & (0x3f >> extra);
    ++s;
    for (int i = 0; i < extra && (*s & 0xc0) == 0x80; ++i, ++s) cp = (cp << 6) | (*s & 0x3f);
    switch (cp) {
      case 0x2018: case 0x2019: out[o++] = '\''; break;
      case 0x201c: case 0x201d: out[o++] = '"'; break;
      case 0x2013: case 0x2014: out[o++] = '-'; break;
      case 0x2026: out[o++] = '.'; out[o++] = '.'; out[o++] = '.'; break;
      case 0x00b0: out[o++] = (char)0xdf; break;  // degree sign is in the ROM
      case 0x00a0: out[o++] = ' '; break;
      default:
        if (cp >= 0x1f000 || (cp >= 0x2600 && cp < 0x2800) || cp == 0xfe0f || cp == 0x200d) break;  // emoji: drop
        out[o++] = '?';
    }
  }
  out[o] = '\0';
}

static void setRow(int r, const char* text) {
  Row& row = g_rows[r];
  char buf[kRowMax];
  toLcd(text, buf, sizeof(buf));
  // Trim trailing spaces so a short row doesn't scroll.
  size_t len = strlen(buf);
  while (len && buf[len - 1] == ' ') buf[--len] = '\0';
  if (strcmp(buf, row.text) == 0) return;
  strlcpy(row.text, buf, sizeof(row.text));
  row.len = len;
  row.offset = 0;
  row.nextMs = millis() + kScrollPauseMs;
  row.shown[0] = '\0';  // force a redraw
}

// Two rows of `left` and `right`, the right one pushed to the end (col 15 is kept free
// for the offline mark).
static void setSplitRow(int r, const char* left, const char* right) {
  char a[kRowMax], b[24], line[kRowMax + 32];
  toLcd(left, a, sizeof(a));
  toLcd(right, b, sizeof(b));
  const int room = kCols - 1;
  const int la = strlen(a), lb = strlen(b);
  if (lb == 0) {
    setRow(r, a);
    return;
  }
  if (la + 1 + lb > room) {
    snprintf(line, sizeof(line), "%s %s", a, b);  // too long: let it scroll
  } else {
    snprintf(line, sizeof(line), "%-*s%s", room - lb, a, b);
  }
  setRow(r, line);
}

// Word wrap into two 16-character rows. Returns false if it doesn't fit.
static bool wrapTwo(const char* text, char* r0, char* r1) {
  char buf[kRowMax];
  toLcd(text, buf, sizeof(buf));
  size_t len = strlen(buf);
  if (len <= (size_t)kCols) {
    strlcpy(r0, buf, kCols + 1);
    r1[0] = '\0';
    return true;
  }
  if (len > 2 * (size_t)kCols + 1) return false;
  // Break at the last space that leaves the first row within 16 characters.
  for (int i = kCols; i > 0; --i) {
    if (buf[i] == ' ' && len - i - 1 <= (size_t)kCols) {
      memcpy(r0, buf, i);
      r0[i] = '\0';
      strlcpy(r1, buf + i + 1, kCols + 1);
      return true;
    }
  }
  return false;
}

static const char* labelFor(bzzy::Status s, bool shortForm) {
  switch (s) {
    case bzzy::Status::Free: return "FREE";
    case bzzy::Status::Busy: return "BUSY";
    case bzzy::Status::Dnd: return shortForm ? "DND" : "DO NOT DISTURB";
    case bzzy::Status::Away: return "AWAY";
    default: return "...";
  }
}

static void untilText(uint32_t until, char* buf, size_t n) {
  buf[0] = '\0';
  if (!until) return;
  time_t t = until;
  struct tm lt;
  localtime_r(&t, &lt);
  const int h = lt.tm_hour % 12 == 0 ? 12 : lt.tm_hour % 12;
  snprintf(buf, n, "til %d:%02d%s", h, lt.tm_min, lt.tm_hour < 12 ? "am" : "pm");
}

static void power(bool on) {
  if (on == g_on) return;
  g_on = on;
  if (on) {
    g_lcd.display();
  } else {
    g_lcd.noDisplay();  // characters off; the backlight is wired to 5 V and stays lit
  }
}

// Paint both rows, scrolling the long ones.
static void paint(uint32_t nowMs) {
  if (!g_on) return;
  for (int r = 0; r < 2; ++r) {
    Row& row = g_rows[r];
    const int width = (r == 0 && g_offline) ? kCols - 1 : kCols;
    if (row.len > (size_t)width && (int32_t)(nowMs - row.nextMs) >= 0) {
      if (row.offset + width >= row.len) {
        row.offset = 0;  // back to the start, and pause there
        row.nextMs = nowMs + kScrollPauseMs;
      } else {
        ++row.offset;
        row.nextMs = nowMs + (row.offset + width >= row.len ? kScrollPauseMs : kScrollStepMs);
      }
    }
    char line[kCols + 1];
    snprintf(line, sizeof(line), "%-*.*s", width, width, row.text + (row.len > (size_t)width ? row.offset : 0));
    if (width < kCols) {
      line[kCols - 1] = '\x01';  // placeholder for the offline mark, swapped below
      line[kCols] = '\0';
    }
    if (strcmp(line, row.shown) == 0) continue;
    strlcpy(row.shown, line, sizeof(row.shown));
    g_lcd.setCursor(0, r);
    for (int c = 0; c < kCols; ++c) {
      if (line[c] == '\x01') {
        g_lcd.write((uint8_t)kGlyphOffline);
      } else {
        g_lcd.write((uint8_t)line[c]);
      }
    }
  }
}

void begin() {
  g_lcd.begin(kCols, 2);
  // A small Wi-Fi mark with a line under it: "can't reach the app".
  uint8_t offline[8] = {0b00000, 0b01110, 0b10001, 0b00100, 0b01010, 0b00000, 0b00100, 0b11111};
  g_lcd.createChar(kGlyphOffline, offline);
  g_lcd.clear();
}

void splash() {
  power(true);
  g_offline = false;
  setRow(0, "      bzzy");
  char line[32];
  snprintf(line, sizeof(line), "firmware %s", ota::version());
  setRow(1, line);
  paint(millis());
  g_drawn = false;
}

void show(const View& v) {
  uint32_t h = hashStr(hashStr(0x811c9dc5u ^ (uint32_t)v.layout, v.text), v.notice);
  h = (h ^ ((uint32_t)v.status << 1 | (v.online ? 1u : 0u))) * 16777619u;
  h = (h ^ v.until) * 16777619u;
  if (g_drawn && h == g_hash) return;
  g_hash = h;
  g_drawn = true;

  if (v.layout == Layout::Off) {
    power(false);
    return;
  }
  power(true);
  g_offline = !v.online;
  const char* text = v.text ? v.text : "";
  const char* notice = v.notice ? v.notice : "";
  char until[16];
  untilText(v.until, until, sizeof(until));

  if (v.layout == Layout::ShowText || v.layout == Layout::ShowGif) {
    char r0[kCols + 1], r1[kCols + 1];
    if (*notice) {
      setRow(0, text);
      setRow(1, notice);
    } else if (wrapTwo(text, r0, r1) && (r1[0] || !until[0])) {
      setRow(0, r0);
      setRow(1, r1);
    } else if (wrapTwo(text, r0, r1)) {
      setRow(0, r0);  // one row of message, then when it ends
      setRow(1, until);
    } else {
      setSplitRow(0, labelFor(v.status, true), until);
      setRow(1, text);  // too long for two rows: scroll it
    }
    return;
  }

  setSplitRow(0, labelFor(v.status, until[0] != '\0'), until);
  setRow(1, *notice ? notice : text);
}

static void setupRows(const SetupView& v);

void showSetup(const SetupView& v) {
  setupRows(v);
  paint(millis());  // the setup loop doesn't call tick(), so scroll from here
}

static void setupRows(const SetupView& v) {
  const uint32_t h = hashStr(hashStr(hashStr(0x9e3779b9u ^ ((uint32_t)v.step << 8) ^ (uint32_t)v.note, v.title),
                                     v.line1),
                             v.line2);
  if (g_drawn && h == g_hash) return;
  g_hash = h;
  g_drawn = true;
  power(true);
  g_offline = false;

  char row1[kRowMax];
  switch (v.step) {
    case bzzy::SetupStep::JoinAp:
      // "Wi-Fi: bzzy-3F2A" is exactly 16 characters: no QR code, so the name does the job.
      if (v.note == bzzy::SetupNote::None) {
        setRow(0, "Join this Wi-Fi");
        setRow(1, v.line1);
        return;
      }
      break;
    case bzzy::SetupStep::ChooseWifi:
      if (v.note == bzzy::SetupNote::None) {
        setRow(0, "Pick your Wi-Fi");
        setRow(1, "on the page, or go to 192.168.4.1");
        return;
      }
      break;
    case bzzy::SetupStep::ShowCode:
      if (v.note == bzzy::SetupNote::None) {
        // line1 is the code ("ABC-123"), line2 "or type it at bzzy.ca/pair"
        snprintf(row1, sizeof(row1), "Code %s", v.line1 ? v.line1 : "");
        setRow(0, row1);
        setRow(1, v.line2 && strncmp(v.line2, "or type it at ", 14) == 0 ? v.line2 + 14 : v.line2);
        return;
      }
      break;
    default:
      break;
  }
  // Everything else (and the "done" cards): the title, then the two lines joined.
  setRow(0, v.title);
  const char* a = v.line1 ? v.line1 : "";
  const char* b = v.line2 ? v.line2 : "";
  snprintf(row1, sizeof(row1), "%s%s%s", a, (*a && *b) ? " " : "", b);
  setRow(1, row1);
}

void tick(uint32_t nowMs) { paint(nowMs); }
void releaseGif() {}
void invalidate() { g_drawn = false; }

}  // namespace display

#endif
