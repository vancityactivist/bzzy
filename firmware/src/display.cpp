#include "display.h"

#include "config.h"

#if BZZY_HAS_DISPLAY

#define LGFX_USE_V1
#include <AnimatedGIF.h>
#include <LittleFS.h>
#include <LovyanGFX.hpp>
#include <time.h>

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
      c.panel_width = 240;
      c.panel_height = 280;
      c.offset_y = 20;  // the 280-line glass sits in the middle of the ST7789's 320 lines
      c.readable = false;
      c.invert = true;
      c.bus_shared = false;
      panel_.config(c);
    }
    {
      auto c = light_.config();
      c.pin_bl = PIN_LCD_BL;
      c.freq = 44100;
      c.pwm_channel = 7;
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
static View g_last = {bzzy::Status::Unknown, nullptr, 0, false, nullptr};
static char g_lastText[bzzy::kTextMax] = "";
static char g_lastNotice[64] = "";
static bool g_drawn = false;

static constexpr int kW = 240;
static constexpr int kH = 280;
static constexpr int kGifH = 200;  // GIF area; the bar below holds text

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
static void gifDraw(GIFDRAW* d) {
  static uint16_t line[kW];
  int y = d->iY + d->y;
  if (y >= kGifH) return;
  int w = d->iWidth;
  if (d->iX + w > kW) w = kW - d->iX;
  if (w <= 0) return;
  uint16_t bg = d->pPalette[d->ucBackground];
  for (int x = 0; x < w; ++x) {
    uint8_t idx = d->pPixels[x];
    line[x] = (d->ucHasTransparency && idx == d->ucTransparent) ? bg : d->pPalette[idx];
  }
  g_lcd.pushImage(d->iX, y, w, 1, line);
}

static void closeGif() {
  if (g_gifOpen) g_gif.close();
  g_gifOpen = false;
}

static bool openGifFor(bzzy::Status s) {
  closeGif();
  char path[32];
  snprintf(path, sizeof(path), "/gif/%s.gif", bzzy::statusName(s));
  if (!LittleFS.exists(path)) return false;
  g_gifOpen = g_gif.open(path, gifOpen, gifClose, gifRead, gifSeek, gifDraw);
  g_nextFrameMs = 0;
  return g_gifOpen;
}

static void drawUntil(uint32_t until, int y, uint16_t bg) {
  if (!until) return;
  time_t t = until;
  struct tm lt;
  localtime_r(&t, &lt);
  char clock[12];
  strftime(clock, sizeof(clock), "%I:%M %p", &lt);
  char buf[24];
  snprintf(buf, sizeof(buf), "until %s", clock[0] == '0' ? clock + 1 : clock);
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

static void redraw(const View& v) {
  const uint16_t bg = bgFor(v.status);
  const bool gif = openGifFor(v.status);

  if (gif) {
    g_lcd.fillRect(0, kGifH, kW, kH - kGifH, bg);
    g_lcd.setTextDatum(lgfx::top_center);
    g_lcd.setFont(&fonts::FreeSansBold12pt7b);
    g_lcd.setTextColor(TFT_WHITE, bg);
    g_lcd.drawString(v.text && *v.text ? v.text : labelFor(v.status), kW / 2, kGifH + 12);
    drawUntil(v.until, kGifH + 46, bg);
  } else {
    g_lcd.fillScreen(bg);
    g_lcd.setTextColor(TFT_WHITE, bg);
    g_lcd.setTextDatum(lgfx::middle_center);
    g_lcd.setFont(&fonts::FreeSansBold24pt7b);
    const char* label = labelFor(v.status);
    if (strchr(label, '\n')) {
      g_lcd.setFont(&fonts::FreeSansBold18pt7b);
      g_lcd.drawString("DO NOT", kW / 2, 100);
      g_lcd.drawString("DISTURB", kW / 2, 140);
    } else {
      g_lcd.drawString(label, kW / 2, 120);
    }
    if (v.text && *v.text) {
      g_lcd.setFont(&fonts::FreeSans12pt7b);
      g_lcd.setTextDatum(lgfx::top_center);
      g_lcd.drawString(v.text, kW / 2, 180);
    }
    drawUntil(v.until, 220, bg);
  }

  if (v.notice && *v.notice) {
    g_lcd.fillRect(0, kH - 28, kW, 28, TFT_BLACK);
    g_lcd.setFont(&fonts::Font2);
    g_lcd.setTextDatum(lgfx::middle_center);
    g_lcd.setTextColor(TFT_WHITE, TFT_BLACK);
    g_lcd.drawString(v.notice, kW / 2, kH - 14);
  }
  drawOfflineBadge(v.online);
}

void begin() {
  g_lcd.init();
  g_lcd.setRotation(0);
  g_lcd.setBrightness(180);
  g_lcd.fillScreen(TFT_BLACK);
  g_gif.begin(LITTLE_ENDIAN_PIXELS);
}

void show(const View& v) {
  const char* text = v.text ? v.text : "";
  const char* notice = v.notice ? v.notice : "";
  if (g_drawn && v.status == g_last.status && v.until == g_last.until &&
      v.online == g_last.online && strcmp(text, g_lastText) == 0 &&
      strcmp(notice, g_lastNotice) == 0) {
    return;
  }
  g_last = v;
  strlcpy(g_lastText, text, sizeof(g_lastText));
  strlcpy(g_lastNotice, notice, sizeof(g_lastNotice));
  g_drawn = true;
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

}  // namespace display

#else

namespace display {
void begin() {}
void show(const View&) {}
void tick(uint32_t) {}
}  // namespace display

#endif
