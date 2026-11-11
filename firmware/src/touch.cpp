#include "touch.h"

#include "config.h"

#if BZZY_HAS_TOUCH
#include <Arduino.h>
#include <Wire.h>

namespace touch {

// CST816T registers (CST816S-compatible).
static constexpr uint8_t kAddr = 0x15;
static constexpr uint8_t kRegGesture = 0x01;
static constexpr uint8_t kRegMotionMask = 0xEC;    // enable double-click detection
static constexpr uint8_t kRegLongPressTime = 0xFC;  // seconds
static constexpr uint8_t kRegDisAutoSleep = 0xFE;

static volatile bool g_irq = false;
static void IRAM_ATTR onIrq() { g_irq = true; }

static void writeReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(kAddr);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

void begin() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);  // shared with the RTC; a second begin is harmless
  pinMode(PIN_TOUCH_RST, OUTPUT);
  digitalWrite(PIN_TOUCH_RST, LOW);
  delay(10);
  digitalWrite(PIN_TOUCH_RST, HIGH);
  delay(50);
  writeReg(kRegDisAutoSleep, 0x01);  // stay awake: we're on USB power anyway
  writeReg(kRegMotionMask, 0x01);    // report double taps
  writeReg(kRegLongPressTime, 0x01); // long press = 1 s
  pinMode(PIN_TOUCH_INT, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_TOUCH_INT), onIrq, FALLING);
}

Gesture poll() {
  if (!g_irq) return Gesture::None;
  g_irq = false;

  Wire.beginTransmission(kAddr);
  Wire.write(kRegGesture);
  if (Wire.endTransmission(false) != 0) return Gesture::None;
  if (Wire.requestFrom(kAddr, (uint8_t)1) != 1) return Gesture::None;
  const uint8_t g = Wire.read();

  // The chip keeps reporting while a finger is down; only pass each gesture on once.
  static uint8_t last = 0;
  static uint32_t lastAt = 0;
  const uint32_t ms = millis();
  if (g == last && ms - lastAt < 400) return Gesture::None;
  last = g;
  lastAt = ms;

  switch (g) {
    case 0x01: return Gesture::SwipeUp;
    case 0x02: return Gesture::SwipeDown;
    case 0x03: return Gesture::SwipeLeft;
    case 0x04: return Gesture::SwipeRight;
    case 0x05: return Gesture::Tap;
    case 0x0B: return Gesture::DoubleTap;
    case 0x0C: return Gesture::LongPress;
    default: return Gesture::None;
  }
}

}  // namespace touch

#else

namespace touch {
void begin() {}
Gesture poll() { return Gesture::None; }
}  // namespace touch

#endif
