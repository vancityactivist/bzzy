// Battery-backed clock (PCF85063) so calendar blocks still switch on time
// after a power cut with no Wi-Fi. No-ops on boards without one.
#pragma once

#include <time.h>

namespace rtc {
void begin();
// Returns 0 if there is no RTC or it doesn't hold a believable time.
time_t read();
void write(time_t t);
}  // namespace rtc
