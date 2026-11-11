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
#elif defined(BZZY_BOARD_GENERIC)
#define PIN_BUTTON 0      // BOOT button on most dev boards
#define PIN_LED_DATA 13
#define BZZY_HAS_RTC 0
#else
#error "Pick a board env in platformio.ini"
#endif

#ifndef BZZY_HAS_TOUCH
#define BZZY_HAS_TOUCH 0
#endif

#ifndef BZZY_HAS_DISPLAY
#define BZZY_HAS_DISPLAY 0
#endif

namespace cfg {
constexpr uint16_t kLedCount = 16;         // 12 for the prototype ring; ~16 for the bezel strip
constexpr uint16_t kLedMaxMilliamps = 400;  // keeps total draw comfortable on a laptop USB port
constexpr uint8_t kLedBrightness = 96;

constexpr uint32_t kPollIntervalMs = 20 * 1000;
constexpr uint32_t kMaxBackoffMs = 5 * 60 * 1000;
constexpr uint32_t kHttpTimeoutMs = 6000;

constexpr uint32_t kMaxGifBytes = 700 * 1024;  // the app sends at most 600 KB

constexpr uint32_t kStaleAfterSec = 24 * 3600;  // cached calendar older than this isn't trusted

constexpr uint32_t kLongPressMs = 1000;  // top button: hold this long to go back to automatic
constexpr uint32_t kSetupHoldMs = 3000;  // hold a button this long at boot for the Wi-Fi setup page
constexpr const char* kSetupApName = "bzzy-setup";

// BC moved to year-round UTC-7 in 2026, so no daylight-saving rule. (POSIX TZ signs are reversed.)
constexpr const char* kTimezone = "<-07>7";  // Vancouver
constexpr const char* kNtpServer = "pool.ntp.org";
}  // namespace cfg
