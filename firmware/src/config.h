// Board pins and tunable defaults.
#pragma once

#include <stdint.h>

#if defined(BZZY_BOARD_WAVESHARE_S3_LCD169)
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

constexpr uint32_t kStaleAfterSec = 24 * 3600;  // cached calendar older than this isn't trusted

constexpr uint32_t kSetupHoldMs = 3000;  // hold the button this long at boot for the Wi-Fi setup page
constexpr const char* kSetupApName = "bzzy-setup";

constexpr const char* kTimezone = "PST8PDT,M3.2.0,M11.1.0";  // Vancouver
constexpr const char* kNtpServer = "pool.ntp.org";
}  // namespace cfg
