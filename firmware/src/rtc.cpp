#include "rtc.h"

#include "config.h"

#if BZZY_HAS_RTC
#include <Wire.h>

namespace rtc {

static constexpr uint8_t kAddr = 0x51;
static constexpr uint8_t kRegSeconds = 0x04;

static uint8_t bcd2bin(uint8_t v) { return (v & 0x0F) + 10 * (v >> 4); }
static uint8_t bin2bcd(uint8_t v) { return ((v / 10) << 4) | (v % 10); }

void begin() { Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL); }

time_t read() {
  Wire.beginTransmission(kAddr);
  Wire.write(kRegSeconds);
  if (Wire.endTransmission(false) != 0) return 0;
  if (Wire.requestFrom(kAddr, (uint8_t)7) != 7) return 0;
  uint8_t sec = Wire.read();
  if (sec & 0x80) return 0;  // oscillator stopped: time is not valid
  struct tm t = {};
  t.tm_sec = bcd2bin(sec & 0x7F);
  t.tm_min = bcd2bin(Wire.read() & 0x7F);
  t.tm_hour = bcd2bin(Wire.read() & 0x3F);
  t.tm_mday = bcd2bin(Wire.read() & 0x3F);
  Wire.read();  // weekday
  t.tm_mon = bcd2bin(Wire.read() & 0x1F) - 1;
  t.tm_year = bcd2bin(Wire.read()) + 100;  // years since 1900; RTC stores 20xx
  // The RTC is kept in UTC. mktime() uses local time, so compute UTC by hand.
  int y = t.tm_year + 1900, m = t.tm_mon + 1;
  if (m <= 2) { y -= 1; m += 12; }
  long days = 365L * y + y / 4 - y / 100 + y / 400 + (153 * (m - 3) + 2) / 5 + t.tm_mday - 719469;
  time_t v = days * 86400L + t.tm_hour * 3600 + t.tm_min * 60 + t.tm_sec;
  return v > 1700000000 ? v : 0;
}

void write(time_t v) {
  struct tm t;
  gmtime_r(&v, &t);
  Wire.beginTransmission(kAddr);
  Wire.write(kRegSeconds);
  Wire.write(bin2bcd(t.tm_sec));  // also clears the "oscillator stopped" flag
  Wire.write(bin2bcd(t.tm_min));
  Wire.write(bin2bcd(t.tm_hour));
  Wire.write(bin2bcd(t.tm_mday));
  Wire.write(bin2bcd(t.tm_wday));
  Wire.write(bin2bcd(t.tm_mon + 1));
  Wire.write(bin2bcd(t.tm_year - 100));
  Wire.endTransmission();
}

}  // namespace rtc

#else

namespace rtc {
void begin() {}
time_t read() { return 0; }
void write(time_t) {}
}  // namespace rtc

#endif
