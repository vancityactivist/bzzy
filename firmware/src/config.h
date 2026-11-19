// Board pins and tunable defaults.
#pragma once

#include <stdint.h>

#if defined(BZZY_BOARD_WAVESHARE_S3_TOUCH_LCD169)
// Waveshare ESP32-S3-Touch-LCD-1.69 (SKU 27350). From Waveshare's docs page.
// Same screen wiring as the non-touch board, plus the CST816T touch chip.
#define PIN_LCD_SCLK 6
#define PIN_LCD_MOSI 7
#define PIN_LCD_CS 5
#define PIN_LCD_DC 4
#define PIN_LCD_RST 8
#define PIN_LCD_BL 15
#define PIN_I2C_SDA 11  // shared: touch @ 0x15, IMU @ 0x6B, RTC @ 0x51
#define PIN_I2C_SCL 10
#define PIN_TOUCH_INT 14
#define PIN_TOUCH_RST 13
#define PIN_BUTTON 0     // BOOT button
#define PIN_LED_DATA 17  // free pins on this board: 2, 3, 17, 18 (3 is a strapping pin)
#define PIN_TOP_BUTTON 18  // LED ring board's top button (hardware/, rev B): to GND, internal pull-up
#define BZZY_HAS_RTC 1
#define BZZY_HAS_TOUCH 1
#elif defined(BZZY_BOARD_WAVESHARE_S3_LCD169)
// Waveshare ESP32-S3-LCD-1.69 (V2). Read from the V2 schematic; check against the
// printed pinout if something doesn't respond.
#define PIN_LCD_SCLK 6
#define PIN_LCD_MOSI 7
#define PIN_LCD_CS 5
#define PIN_LCD_DC 4
#define PIN_LCD_RST 8
#define PIN_LCD_BL 15
#define PIN_I2C_SDA 11  // shared by the RTC (PCF85063 @ 0x51) and IMU
#define PIN_I2C_SCL 10
#define PIN_BUTTON 0     // BOOT button: safe to read after boot
#define PIN_LED_DATA 16  // header pin. Any free GPIO works; update if you wire elsewhere.
#define BZZY_HAS_RTC 1
#elif defined(BZZY_BOARD_WAVESHARE_C6_LCD147)
// Waveshare ESP32-C6-LCD-1.47: ESP32-C6FH4 (4 MB flash, no PSRAM), ST7789 172x320, one
// WS2812 RGB LED on board. A test board: docs/esp32-c6-test-build.md. Pins from
// Waveshare's wiki. The TF card slot shares SCLK/MOSI (its CS is GPIO4); we don't use it.
#define PIN_LCD_SCLK 7
#define PIN_LCD_MOSI 6
#define PIN_LCD_CS 14
#define PIN_LCD_DC 15
#define PIN_LCD_RST 21
#define PIN_LCD_BL 22
#define PIN_BUTTON 9     // BOOT button (a strapping pin, fine to read after boot)
#define BZZY_BOOT_AS_TOP_BUTTON 1  // the only button: short press steps, hold = automatic
#define PIN_LED_DATA 8   // the onboard RGB LED (also a strapping pin; the LED is wired there)
#define BZZY_LED_ORDER RGB  // unlike the ring: with GRB, red and green came out swapped
// At full Wi-Fi power (20 dBm) the board browned out and reset while joining a network
// with its setup network up, even on a Mac's USB port. Used only while the setup page
// is open (net.cpp).
#define BZZY_WIFI_TX_POWER WIFI_POWER_15dBm
#define BZZY_HAS_RTC 0
// Screen geometry for display.cpp: 172 wide, centred in the ST7789's 240 columns.
#define BZZY_LCD_W 172
#define BZZY_LCD_H 320
#define BZZY_LCD_OFFSET_X 34
#define BZZY_LCD_OFFSET_Y 0
#define BZZY_LCD_PWM_CHANNEL 1  // the C6 has LEDC channels 0-5 only
#ifndef BZZY_LED_COUNT
#define BZZY_LED_COUNT 1
#endif
#elif defined(BZZY_BOARD_S3_DEVKIT_TFT169)
// Bench test for the bzzy main board (docs/hardware/main-board.md): an Espressif
// ESP32-S3-DevKitC-1(U) wired to the East Rising ER-TFT1.69-4 panel (240x280 ST7789 +
// CST816 touch) through an 18-pin FPC breakout. Uses the SAME pins as the main board,
// which kept the Waveshare mapping. Wiring: docs/s3-devkit-bench-test.md.
#define PIN_LCD_SCLK 6
#define PIN_LCD_MOSI 7
#define PIN_LCD_CS 5
#define PIN_LCD_DC 4
#define PIN_LCD_RST 8
#define PIN_LCD_BL 15
#define PIN_I2C_SDA 11  // touch @ 0x15 (and the RTC @ 0x51 on the main board)
#define PIN_I2C_SCL 10
#define PIN_TOUCH_INT 14
#define PIN_TOUCH_RST 13
#define PIN_BUTTON 0       // BOOT button
#define PIN_LED_DATA 17    // optional WS2812B strip
#define PIN_TOP_BUTTON 18  // optional push button to GND, internal pull-up
#define BZZY_HAS_RTC 0     // no clock chip on the bench; the main board has one
#define BZZY_HAS_TOUCH 1
// On the bench the backlight cathode (panel pin 2) goes through a resistor straight
// into GPIO15, so LOW = lit. The main board uses a MOSFET instead (not inverted).
#define BZZY_LCD_BL_INVERT 1
#elif defined(BZZY_BOARD_GENERIC)
// Any classic ESP32 dev board (ESP32-WROOM-32D/E). Wiring: docs/esp32-test-build.md.
// Kept clear of the flash pins (6-11), the strapping pins (0, 2, 5, 12, 15) and the
// input-only pins (34-39).
#define PIN_BUTTON 0       // BOOT button on most dev boards
#define PIN_LED_DATA 13
#define PIN_TOP_BUTTON 27  // optional push button to GND, internal pull-up
#define BZZY_HAS_RTC 0
#if BZZY_HAS_TEXT_LCD
// 16x2 HD44780 character LCD in 4-bit mode (RW tied to GND, so we only write).
#define PIN_LCD_RS 19
#define PIN_LCD_EN 23
#define PIN_LCD_D4 18
#define PIN_LCD_D5 17
#define PIN_LCD_D6 16
#define PIN_LCD_D7 4
#endif
#else
#error "Pick a board env in platformio.ini"
#endif

#ifndef BZZY_HAS_TOUCH
#define BZZY_HAS_TOUCH 0
#endif

#ifndef BZZY_BOOT_AS_TOP_BUTTON
#define BZZY_BOOT_AS_TOP_BUTTON 0
#endif

// FastLED colour order of the LEDs. The ring's WS2812Bs are GRB; a board's onboard LED
// may not be.
#ifndef BZZY_LED_ORDER
#define BZZY_LED_ORDER GRB
#endif

// BZZY_HAS_DISPLAY is the full colour screen (GIFs, QR codes). BZZY_HAS_TEXT_LCD is a
// 16x2 character LCD instead: text only, so the light never downloads GIFs.
#ifndef BZZY_HAS_DISPLAY
#define BZZY_HAS_DISPLAY 0
#endif

#ifndef BZZY_HAS_TEXT_LCD
#define BZZY_HAS_TEXT_LCD 0
#endif

#if BZZY_HAS_DISPLAY && BZZY_HAS_TEXT_LCD
#error "Pick one: BZZY_HAS_DISPLAY or BZZY_HAS_TEXT_LCD"
#endif

// A test strip can be any length: build with -DBZZY_LED_COUNT=30 (platformio.ini).
#ifndef BZZY_LED_COUNT
#define BZZY_LED_COUNT 16
#endif

namespace cfg {
constexpr uint16_t kLedCount = BZZY_LED_COUNT;  // 16 on the ring board (12 if you use a 12-LED prototype ring)
constexpr uint16_t kLedMaxMilliamps = 400;  // keeps total draw comfortable on a laptop USB port
constexpr uint8_t kLedBrightness = 96;

constexpr uint32_t kPollIntervalMs = 20 * 1000;
constexpr uint32_t kMaxBackoffMs = 5 * 60 * 1000;
// Outside working hours the app asks for slower polls (5 min); never wait longer than this.
constexpr uint32_t kMaxPollMs = 10 * 60 * 1000;
// Outside working hours the light is dark; a press wakes it for this long.
constexpr uint32_t kWakeMs = 5 * 60 * 1000;
constexpr uint32_t kHttpTimeoutMs = 6000;

constexpr uint32_t kMaxGifBytes = 700 * 1024;  // the app sends at most 600 KB

constexpr uint32_t kStaleAfterSec = 24 * 3600;  // cached calendar older than this isn't trusted

constexpr uint32_t kLongPressMs = 1000;  // top button: hold this long to go back to automatic
constexpr uint32_t kSetupHoldMs = 3000;  // hold a button this long at boot for the Wi-Fi setup page
constexpr const char* kSetupApPrefix = "bzzy-";  // + 4 hex digits from the MAC: bzzy-3F2A
constexpr uint32_t kSplashMs = 1500;  // the logo at power-on

// BC moved to year-round UTC-7 in 2026, so no daylight-saving rule. (POSIX TZ signs are reversed.)
constexpr const char* kTimezone = "<-07>7";  // Vancouver
constexpr const char* kNtpServer = "pool.ntp.org";
// Pre-filled "Companion app URL" in the setup portal.
constexpr const char* kDefaultApiBase = "https://bzzy.ca";
// The app's first home. A device that saved it is moved to kDefaultApiBase on boot.
constexpr const char* kOldApiBase = "https://bzzy.vercel.app";
}  // namespace cfg
