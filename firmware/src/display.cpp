#include "display.h"

#include "config.h"
#include "text_wrap.h"

#include "logo_wordmark.h"

#if BZZY_HAS_DISPLAY

#define LGFX_USE_V1
#include <AnimatedGIF.h>
#include <LittleFS.h>
#include <LovyanGFX.hpp>
#include <time.h>

// Screen geometry. The defaults are the Waveshare 1.69" (240x280, centred in the
// ST7789's 320 lines); config.h overrides them for other boards.
#ifndef BZZY_LCD_W
#define BZZY_LCD_W 240
#endif
#ifndef BZZY_LCD_H
#define BZZY_LCD_H 280
#endif
#ifndef BZZY_LCD_OFFSET_X
#define BZZY_LCD_OFFSET_X 0
#endif
#ifndef BZZY_LCD_OFFSET_Y
#define BZZY_LCD_OFFSET_Y 20
#endif
#ifndef BZZY_LCD_BL_INVERT
#define BZZY_LCD_BL_INVERT 0  // 1 when the backlight is lit by pulling its pin LOW
#endif
#ifndef BZZY_LCD_PWM_CHANNEL
#define BZZY_LCD_PWM_CHANNEL 7
#endif

namespace display {

class Panel : public lgfx::LGFX_Device {
  lgfx::Panel_ST7789 panel_;
  lgfx::Bus_SPI bus_;
  lgfx::Light_PWM light_;

 public:
  Panel() {
    {
      auto c = bus_.config();
      c.spi_host = SPI2_HOST;
      c.spi_mode = 0;
      c.freq_write = 40000000;
      c.spi_3wire = true;
      c.use_lock = true;
      c.dma_channel = SPI_DMA_CH_AUTO;
      c.pin_sclk = PIN_LCD_SCLK;
      c.pin_mosi = PIN_LCD_MOSI;
      c.pin_miso = -1;
      c.pin_dc = PIN_LCD_DC;
      bus_.config(c);
      panel_.setBus(&bus_);
    }
    {
      auto c = panel_.config();
      c.pin_cs = PIN_LCD_CS;
      c.pin_rst = PIN_LCD_RST;
      c.pin_busy = -1;
      c.memory_width = 240;
      c.memory_height = 320;
      c.panel_width = BZZY_LCD_W;
      c.panel_height = BZZY_LCD_H;
      c.offset_x = BZZY_LCD_OFFSET_X;  // where the glass sits in the ST7789's 240x320
      c.offset_y = BZZY_LCD_OFFSET_Y;
      c.readable = false;
      c.invert = true;
      c.bus_shared = false;
      panel_.config(c);
    }
    {
      auto c = light_.config();
      c.pin_bl = PIN_LCD_BL;
      c.freq = 44100;
      c.pwm_channel = BZZY_LCD_PWM_CHANNEL;
      c.invert = BZZY_LCD_BL_INVERT;
      light_.config(c);
      panel_.setLight(&light_);
    }
    setPanel(&panel_);
  }
};

static Panel g_lcd;
static AnimatedGIF g_gif;
static bool g_gifOpen = false;
static uint32_t g_nextFrameMs = 0;
static constexpr uint8_t kBrightness = 180;
static View g_last = {Layout::Status, bzzy::Status::Unknown, nullptr, 0, false, nullptr, -1};
static char g_lastText[bzzy::kTextMax] = "";
static char g_lastNotice[64] = "";
static bool g_drawn = false;

static constexpr int kW = BZZY_LCD_W;
static constexpr int kH = BZZY_LCD_H;
static constexpr int kGifH = 200;  // GIF area; the bar below holds text
// The layout is drawn for 240x280. A taller screen (the C6 test board's 320) moves it
// down by kDy so it sits in the middle, and a narrower one wraps text to kTextW.
static constexpr int kDy = (kH - 280) / 2;
static constexpr int kTextW = kW < 240 ? kW - 20 : bzzy::kMessageWidth;
static constexpr bool kNarrow = kW < 240;

static uint16_t bgFor(bzzy::Status s) {
  switch (s) {
    case bzzy::Status::Free: return g_lcd.color565(0, 140, 50);
    case bzzy::Status::Busy: return g_lcd.color565(200, 20, 20);
    case bzzy::Status::Dnd: return g_lcd.color565(110, 0, 170);
    case bzzy::Status::Away: return g_lcd.color565(210, 120, 0);
    default: return g_lcd.color565(60, 60, 60);
  }
}

static const char* labelFor(bzzy::Status s) {
  switch (s) {
    case bzzy::Status::Free: return "FREE";
    case bzzy::Status::Busy: return "BUSY";
    case bzzy::Status::Dnd: return "DO NOT\nDISTURB";
    case bzzy::Status::Away: return "AWAY";
    default: return "?";
  }
}

// ---- AnimatedGIF file callbacks (LittleFS) ----
static void* gifOpen(const char* name, int32_t* size) {
  File* f = new File(LittleFS.open(name, "r"));
  if (!*f) {
    delete f;
    return nullptr;
  }
  *size = f->size();
  return f;
}
static void gifClose(void* h) {
  File* f = static_cast<File*>(h);
  f->close();
  delete f;
}
static int32_t gifRead(GIFFILE* gf, uint8_t* buf, int32_t len) {
  File* f = static_cast<File*>(gf->fHandle);
  int32_t n = f->read(buf, len);
  gf->iPos = f->position();
  return n;
}
static int32_t gifSeek(GIFFILE* gf, int32_t pos) {
  File* f = static_cast<File*>(gf->fHandle);
  f->seek(pos);
  gf->iPos = f->position();
  return gf->iPos;
}
// Where the open GIF is drawn: centred in an area of the screen (the top 200 rows,
// or the whole screen for a "show now" GIF with no message).
static int g_gifX = 0, g_gifY = 0, g_gifBottom = kGifH;

static void gifDraw(GIFDRAW* d) {
  static uint16_t line[kW];
  int y = g_gifY + d->iY + d->y;
  if (y >= g_gifBottom) return;
  int x0 = g_gifX + d->iX;
  int skip = 0;  // a GIF wider than the screen is cropped on both sides
  if (x0 < 0) {
    skip = -x0;
    x0 = 0;
  }
  int w = d->iWidth - skip;
  if (x0 + w > kW) w = kW - x0;
  if (w <= 0) return;
  const uint8_t* px = d->pPixels + skip;
  // Palette entries are byte-swapped RGB565 (BIG_ENDIAN_PIXELS), which is what
  // LovyanGFX's pushImage expects from a uint16_t buffer.
  if (!d->ucHasTransparency || d->ucDisposalMethod == 2) {
    // No transparency, or the frame is disposed to background: fill every pixel.
    const uint16_t bg = d->pPalette[d->ucBackground];
    for (int x = 0; x < w; ++x) {
      line[x] = (d->ucHasTransparency && px[x] == d->ucTransparent) ? bg : d->pPalette[px[x]];
    }
    g_lcd.pushImage(x0, y, w, 1, line);
    return;
  }
  // A transparent pixel keeps what the last frame drew there, so push only the runs of
  // opaque pixels. (Painting them with the background smears blotches over animations.)
  int x = 0;
  while (x < w) {
    while (x < w && px[x] == d->ucTransparent) ++x;
    const int start = x;
    while (x < w && px[x] != d->ucTransparent) {
      line[x - start] = d->pPalette[px[x]];
      ++x;
    }
    if (x > start) g_lcd.pushImage(x0 + start, y, x - start, 1, line);
  }
}

static void closeGif() {
  if (g_gifOpen) g_gif.close();
  g_gifOpen = false;
}

static bool openGif(const char* slot, int areaH = kGifH) {
  closeGif();
  char path[32];
  snprintf(path, sizeof(path), "/gif/%s.gif", slot);
  if (!LittleFS.exists(path)) return false;
  g_gifOpen = g_gif.open(path, gifOpen, gifClose, gifRead, gifSeek, gifDraw);
  g_nextFrameMs = 0;
  if (g_gifOpen) {
    const int cw = g_gif.getCanvasWidth(), ch = g_gif.getCanvasHeight();
    g_gifX = (kW - cw) / 2;  // negative when the GIF is wider: gifDraw crops its sides
    g_gifY = ch < areaH ? (areaH - ch) / 2 : 0;
    g_gifBottom = areaH;
  }
  return g_gifOpen;
}

static void untilText(uint32_t until, char* buf, size_t n) {
  time_t t = until;
  struct tm lt;
  localtime_r(&t, &lt);
  char clock[12];
  strftime(clock, sizeof(clock), "%I:%M %p", &lt);
  snprintf(buf, n, "until %s", clock[0] == '0' ? clock + 1 : clock);
}

static void drawUntil(uint32_t until, int y, uint16_t bg) {
  if (!until) return;
  char buf[24];
  untilText(until, buf, sizeof(buf));
  g_lcd.setTextDatum(lgfx::top_center);
  g_lcd.setFont(&fonts::FreeSans9pt7b);
  g_lcd.setTextColor(TFT_WHITE, bg);
  g_lcd.drawString(buf, kW / 2, y);
}

static void drawOfflineBadge(bool online) {
  // Small hollow ring in the bottom corner: noticeable, but not alarming.
  // Bottom corner so GIF frames above never paint over it.
  if (online) return;
  g_lcd.fillCircle(kW - 14, kH - 14, 6, TFT_WHITE);
  g_lcd.fillCircle(kW - 14, kH - 14, 3, TFT_BLACK);
}

static const lgfx::IFont* fontFor(bzzy::Font f) {
  return f == bzzy::Font::Bold18 ? &fonts::FreeSansBold18pt7b : &fonts::FreeSansBold12pt7b;
}

// On a narrow screen, text too wide for `font` gets `smaller`. The 240 px screen always
// uses `font`, so it matches the app's preview.
static void setFittingFont(const char* text, const lgfx::IFont* font, const lgfx::IFont* smaller) {
  g_lcd.setFont(font);
  if (kNarrow && g_lcd.textWidth(text) > kW - 8) g_lcd.setFont(smaller);
}

// A status's message (or label) as the screen draws it: one line when it fits across the
// whole screen in bold 12 pt, else wrapped to two (app/src/lib/screen.ts statusLines()).
// A narrow screen first tries a smaller font on one line, like setFittingFont().
static constexpr int kStatusLineGap = 26;
static bzzy::Wrapped statusLines(const char* text) {
  bzzy::Wrapped one;
  one.count = 1;
  const size_t n = strlen(text);
  if (bzzy::textWidth(text, n, bzzy::Font::Bold12) <= kW) return one;
  if (kNarrow) {
    g_lcd.setFont(&fonts::FreeSansBold9pt7b);
    if (g_lcd.textWidth(text) <= kW - 8) return one;
  }
  return bzzy::wrapBar(text, kTextW);
}

// Wrapped lines, centred, the first one's top at y and each `gap` below the last.
static void drawLinesAt(const char* text, const bzzy::Wrapped& w, int y, int gap, uint16_t bg,
                        const lgfx::IFont* font = nullptr) {
  g_lcd.setTextDatum(lgfx::top_center);
  g_lcd.setFont(font ? font : fontFor(w.font));
  g_lcd.setTextColor(TFT_WHITE, bg);
  char line[bzzy::kTextMax];
  for (size_t i = 0; i < w.count; ++i) {
    const size_t len = w.lines[i].len < sizeof(line) - 1 ? w.lines[i].len : sizeof(line) - 1;
    memcpy(line, text + w.lines[i].start, len);
    line[len] = '\0';
    g_lcd.drawString(line, kW / 2, y + (int)i * gap);
  }
}

// Wrapped lines, centred, the first one's top at y.
static void drawLines(const char* text, const bzzy::Wrapped& w, int y, uint16_t bg, uint16_t fg = TFT_WHITE) {
  g_lcd.setTextDatum(lgfx::top_center);
  g_lcd.setFont(fontFor(w.font));
  g_lcd.setTextColor(fg, bg);
  char line[bzzy::kTextMax];
  for (size_t i = 0; i < w.count; ++i) {
    const size_t len = w.lines[i].len < sizeof(line) - 1 ? w.lines[i].len : sizeof(line) - 1;
    memcpy(line, text + w.lines[i].start, len);
    line[len] = '\0';
    g_lcd.drawString(line, kW / 2, y + (int)i * bzzy::lineHeight(w.font));
  }
}

// "Show now" colours: what the app picked (white on black by default). A "status"
// background is the status's own screen colour, so it matches the ring.
static uint16_t showBg(const View& v) {
  if (v.showBgStatus) return bgFor(v.status);
  return g_lcd.color888(v.showBg >> 16, (v.showBg >> 8) & 0xff, v.showBg & 0xff);
}
static uint16_t showFg(const View& v) {
  return g_lcd.color888(v.showFg >> 16, (v.showFg >> 8) & 0xff, v.showFg & 0xff);
}

// "Show now" takes over the screen: its background colour, with only what was asked
// for on it. The LEDs still show the status.
static void drawShowText(const View& v) {
  const uint16_t bg = showBg(v);
  g_lcd.fillScreen(bg);
  const bzzy::Wrapped w = bzzy::wrapMessage(v.text, kTextW);
  const int block = (int)w.count * bzzy::lineHeight(w.font);
  drawLines(v.text, w, (kH - block) / 2, bg, showFg(v));
}

static bool g_dark = false;

// The black bar along the bottom with a one-off line ("Updating firmware 42%"), and a
// thin progress bar along its top edge when `progress` is 0-100. With `clear` false the
// bar is already there: the text is drawn over the old text with a black background
// the width of the screen, so nothing blanks between the two.
static void drawNotice(const char* notice, int progress, bool clear = true) {
  constexpr int kBarH = 3;
  if (clear) g_lcd.fillRect(0, kH - 28, kW, 28, TFT_BLACK);
  if (progress >= 0) {
    const int w = kW * (progress > 100 ? 100 : progress) / 100;
    g_lcd.fillRect(0, kH - 28, w, kBarH, TFT_WHITE);
    g_lcd.fillRect(w, kH - 28, kW - w, kBarH, g_lcd.color888(0x3a, 0x3a, 0x3a));
  } else if (!clear) {
    g_lcd.fillRect(0, kH - 28, kW, kBarH, TFT_BLACK);  // the size stopped being known
  }
  g_lcd.setFont(&fonts::Font2);
  g_lcd.setTextDatum(lgfx::middle_center);
  g_lcd.setTextColor(TFT_WHITE, TFT_BLACK);
  g_lcd.setTextPadding(clear ? 0 : kW - 40);  // clear of the offline badge in the corner
  g_lcd.drawString(notice, kW / 2, kH - 14);
  g_lcd.setTextPadding(0);
}

static void redraw(const View& v) {
  if (v.layout == Layout::Off) {
    closeGif();
    g_lcd.fillScreen(TFT_BLACK);
    g_lcd.setBrightness(0);
    g_dark = true;
    return;
  }
  if (g_dark) {
    g_lcd.setBrightness(kBrightness);
    g_dark = false;
  }
  const uint16_t bg = bgFor(v.status);
  const bool showMessage = v.text && *v.text;
  if (v.layout == Layout::ShowText) {
    closeGif();
    drawShowText(v);
  } else if (v.layout == Layout::ShowGif && openGif("show", showMessage ? kGifH : kH)) {
    // The background fills round a GIF smaller than the screen and the bar under it.
    const uint16_t sbg = showBg(v);
    g_lcd.fillScreen(sbg);
    if (showMessage) {
      // The message under the GIF, centred in the bar.
      const bzzy::Wrapped w = bzzy::wrapBar(v.text, kTextW);
      const int block = (int)w.count * bzzy::lineHeight(w.font);
      drawLines(v.text, w, kGifH + (kH - kGifH - block) / 2, sbg, showFg(v));
    }
  } else if (v.layout != Layout::Loading && openGif(bzzy::statusName(v.status))) {
    // Clear the GIF area too: a GIF smaller than 240x200 doesn't cover all of it.
    g_lcd.fillRect(0, 0, kW, kGifH, TFT_BLACK);
    g_lcd.fillRect(0, kGifH, kW, kH - kGifH, bg);
    g_lcd.setTextDatum(lgfx::top_center);
    g_lcd.setTextColor(TFT_WHITE, bg);
    // One line in the bar; drawString would drop the '\n' and run "DO NOTDISTURB" together.
    const char* label = v.status == bzzy::Status::Dnd ? "DO NOT DISTURB" : labelFor(v.status);
    const char* line = v.text && *v.text ? v.text : label;
    const bzzy::Wrapped w = statusLines(line);
    if (w.count > 1) {
      // Too wide for one line: two, a little tighter, with the end time under them.
      drawLinesAt(line, w, kGifH + kDy + 3, kStatusLineGap, bg);
      drawUntil(v.until, kGifH + kDy + 57, bg);
    } else {
      setFittingFont(line, &fonts::FreeSansBold12pt7b, &fonts::FreeSansBold9pt7b);
      g_lcd.drawString(line, kW / 2, kGifH + kDy + 12);
      drawUntil(v.until, kGifH + kDy + 46, bg);
    }
  } else {
    // No GIF (or its new one still downloading): the colour card.
    closeGif();
    g_lcd.fillScreen(bg);
    g_lcd.setTextColor(TFT_WHITE, bg);
    g_lcd.setTextDatum(lgfx::middle_center);
    g_lcd.setFont(&fonts::FreeSansBold24pt7b);
    const char* label = labelFor(v.status);
    if (strchr(label, '\n')) {
      g_lcd.setFont(&fonts::FreeSansBold18pt7b);
      g_lcd.drawString("DO NOT", kW / 2, kDy + 100);
      g_lcd.drawString("DISTURB", kW / 2, kDy + 140);
    } else {
      g_lcd.drawString(label, kW / 2, kDy + 120);
    }
    const bzzy::Wrapped w = v.text && *v.text ? statusLines(v.text) : bzzy::Wrapped{};
    if (w.count > 1) {
      // Two lines of the message, wrapped the same way as in the bar (regular weight here,
      // which is narrower than the bold widths it was wrapped with, so it always fits).
      drawLinesAt(v.text, w, kDy + 166, kStatusLineGap, bg, &fonts::FreeSans12pt7b);
    } else if (v.text && *v.text) {
      setFittingFont(v.text, &fonts::FreeSans12pt7b, &fonts::FreeSans9pt7b);
      g_lcd.setTextDatum(lgfx::top_center);
      g_lcd.drawString(v.text, kW / 2, kDy + 180);
    }
    drawUntil(v.until, kDy + 222, bg);
  }

  if (v.notice && *v.notice) drawNotice(v.notice, v.progress);
  drawOfflineBadge(v.online);
}

void begin() {
  g_lcd.init();
  g_lcd.setRotation(0);
  g_lcd.setBrightness(kBrightness);
  g_lcd.fillScreen(TFT_BLACK);
  g_gif.begin(BIG_ENDIAN_PIXELS);  // byte-swapped RGB565: see gifDraw
}

// ---- the logo ----
// The tile and dots follow docs/brand (a 64-unit grid); the letters are a bitmap.
static void drawLogo() {
  closeGif();
  g_lcd.fillScreen(TFT_BLACK);
  const float u = 96.0f / 64.0f;  // tile 96 px
  const int tx = (kW - 96) / 2, ty = kDy + 52;
  g_lcd.fillSmoothRoundRect(tx, ty, 96, 96, (int)(15 * u), g_lcd.color888(0x17, 0x17, 0x17));
  g_lcd.drawRoundRect(tx, ty, 96, 96, (int)(15 * u), g_lcd.color888(0x3a, 0x3a, 0x3a));
  const uint32_t dots[4] = {0x16a34a, 0xdc2626, 0x7c3aed, 0xea580c};  // free, busy, dnd, away
  for (int i = 0; i < 4; ++i) {
    const float cx = tx + (i % 2 ? 43.5f : 20.5f) * u;
    const float cy = ty + (i / 2 ? 43.5f : 20.5f) * u;
    g_lcd.fillSmoothCircle((int)cx, (int)cy, (int)(6.75f * u + 0.5f),
                          g_lcd.color888(dots[i] >> 16, (dots[i] >> 8) & 0xff, dots[i] & 0xff));
  }
  g_lcd.pushGrayscaleImage((kW - kWordmarkW) / 2, ty + 96 + 28, kWordmarkW, kWordmarkH, kWordmark,
                           lgfx::grayscale_4bit, g_lcd.color888(0xfa, 0xfa, 0xfa), g_lcd.color888(0, 0, 0));
}

void splash() {
  drawLogo();
  g_drawn = false;  // whatever comes next draws in full
}

// ---- setup screens ----
static uint32_t g_setupHash = 0;
static bool g_inSetup = false;

static uint32_t hashStr(uint32_t h, const char* s) {
  if (!s) s = "";
  for (; *s; ++s) h = (h ^ (uint8_t)*s) * 16777619u;
  return (h ^ 0xff) * 16777619u;
}

static void drawStepDots(uint8_t number, uint8_t total) {
  if (!total) return;
  const int gap = 18, y = kDy + 18;
  const int x0 = kW / 2 - (total - 1) * gap / 2;
  for (int i = 1; i <= total; ++i) {
    const int x = x0 + (i - 1) * gap;
    if (i == number) {
      g_lcd.fillSmoothCircle(x, y, 5, TFT_WHITE);
    } else if (i < number) {
      g_lcd.fillSmoothCircle(x, y, 3, g_lcd.color888(0x16, 0xa3, 0x4a));
    } else {
      g_lcd.drawCircle(x, y, 3, g_lcd.color888(0x70, 0x70, 0x70));
    }
  }
}

static void drawCentred(const char* text, int y, const lgfx::IFont* font, uint32_t color) {
  if (!text || !*text) return;
  g_lcd.setFont(font);
  g_lcd.setTextDatum(lgfx::top_center);
  g_lcd.setTextColor(color, TFT_BLACK);
  g_lcd.drawString(text, kW / 2, y);
}

// The "done" card between steps: a big green check, so moving on is unmistakable.
static void drawNote(const SetupView& v) {
  const int cx = kW / 2, cy = kDy + 104;
  g_lcd.fillSmoothCircle(cx, cy, 46, g_lcd.color888(0x16, 0xa3, 0x4a));
  g_lcd.drawWideLine(cx - 20, cy + 1, cx - 6, cy + 16, 5, TFT_WHITE);
  g_lcd.drawWideLine(cx - 6, cy + 16, cx + 22, cy - 14, 5, TFT_WHITE);
  drawCentred(v.title, kDy + 172, &fonts::FreeSansBold12pt7b, TFT_WHITE);
  drawCentred(v.line1, kDy + 208, &fonts::FreeSans9pt7b, g_lcd.color888(0xb0, 0xb0, 0xb0));
  drawCentred(v.line2, kDy + 232, &fonts::FreeSans9pt7b, g_lcd.color888(0xb0, 0xb0, 0xb0));
}

static void drawStep(const SetupView& v) {
  drawStepDots(v.number, v.total);
  drawCentred(v.title, kDy + 34, &fonts::FreeSansBold12pt7b, TFT_WHITE);
  const uint32_t muted = g_lcd.color888(0xb0, 0xb0, 0xb0);
  if (v.qr && *v.qr) {
    // A white square behind the code gives it the quiet border phone cameras look for.
    constexpr int kBox = 160, kQr = 148;
    const int bx = (kW - kBox) / 2, by = kDy + 66;
    g_lcd.fillRoundRect(bx, by, kBox, kBox, 8, TFT_WHITE);
    g_lcd.qrcode(v.qr, bx + (kBox - kQr) / 2, by + (kBox - kQr) / 2, kQr, 1);
    if (v.bigLine1) {
      drawCentred(v.line1, kDy + 232, &fonts::FreeSansBold12pt7b, TFT_WHITE);
      drawCentred(v.line2, kDy + 260, &fonts::Font2, muted);
    } else {
      drawCentred(v.line1, kDy + 234, &fonts::FreeSans9pt7b, TFT_WHITE);
      drawCentred(v.line2, kDy + 256, &fonts::Font2, muted);
    }
  } else {
    // No code yet (connecting, asking for a code): just words, in the middle.
    drawCentred(v.line1, kDy + 132, &fonts::FreeSans9pt7b, muted);
    drawCentred(v.line2, kDy + 156, &fonts::FreeSans9pt7b, muted);
  }
}

void showSetup(const SetupView& v) {
  uint32_t h = 2166136261u;
  h = hashStr(h, v.qr);
  h = hashStr(h, v.title);
  h = hashStr(h, v.line1);
  h = hashStr(h, v.line2);
  h = (h ^ ((uint32_t)v.step << 24 | (uint32_t)v.note << 16 | v.number << 8 | v.total | v.bigLine1 << 7)) * 16777619u;
  if (g_inSetup && h == g_setupHash) return;
  g_setupHash = h;
  g_inSetup = true;
  closeGif();
  if (g_dark) {
    g_lcd.setBrightness(kBrightness);
    g_dark = false;
  }
  g_lcd.fillScreen(TFT_BLACK);
  if (v.note != bzzy::SetupNote::None) {
    drawNote(v);
  } else {
    drawStep(v);
  }
  g_drawn = false;  // the status screen redraws in full afterwards
}

void show(const View& v) {
  g_inSetup = false;
  const char* text = v.text ? v.text : "";
  const char* notice = v.notice ? v.notice : "";
  const bool sameColours = v.showBg == g_last.showBg && v.showFg == g_last.showFg && v.showBgStatus == g_last.showBgStatus;
  if (g_drawn && v.layout == g_last.layout && v.status == g_last.status && v.until == g_last.until &&
      v.online == g_last.online && sameColours && strcmp(text, g_lastText) == 0 &&
      strcmp(notice, g_lastNotice) == 0) {
    return;
  }
  // Only the notice's wording changed (the update's percentage ticking up): redraw just
  // its bar, not the whole screen, which flickered on every percent.
  const bool onlyNotice = g_drawn && v.layout == g_last.layout && v.status == g_last.status &&
                          v.until == g_last.until && v.online == g_last.online && sameColours &&
                          strcmp(text, g_lastText) == 0 && *notice && *g_lastNotice;
  g_last = v;
  strlcpy(g_lastText, text, sizeof(g_lastText));
  strlcpy(g_lastNotice, notice, sizeof(g_lastNotice));
  g_drawn = true;
  if (onlyNotice) {
    drawNotice(notice, v.progress, false);
    return;
  }
  redraw(v);
}

void tick(uint32_t nowMs) {
  if (!g_gifOpen || (int32_t)(nowMs - g_nextFrameMs) < 0) return;
  int delayMs = 0;
  g_lcd.startWrite();
  int r = g_gif.playFrame(false, &delayMs);
  g_lcd.endWrite();
  if (r == 0) g_gif.reset();  // loop forever
  if (r < 0) {
    closeGif();
    return;
  }
  g_nextFrameMs = nowMs + (delayMs > 0 ? delayMs : 50);
}

void releaseGif() { closeGif(); }
void invalidate() { g_drawn = false; }

}  // namespace display

#elif !BZZY_HAS_TEXT_LCD  // the 16x2 LCD lives in display_lcd1602.cpp

namespace display {
void begin() {}
void splash() {}
void show(const View&) {}
void showSetup(const SetupView&) {}
void tick(uint32_t) {}
void releaseGif() {}
void invalidate() {}
}  // namespace display

#endif
