// LED patterns and which style applies. Run from test_status_engine.cpp's main().
#include <string.h>
#include <unity.h>

#include "led_pattern.h"
#include "status_engine.h"

using namespace bzzy;

static const uint32_t T0 = 1762891200;

static LedStyle style(Pattern p, uint8_t speed = 2, uint16_t forSec = 0) {
  LedStyle s;
  s.set = true;
  s.pattern = p;
  s.speed = speed;
  s.forSec = forSec;
  return s;
}

static void allEqual(const uint8_t* v, size_t n, uint8_t want) {
  for (size_t i = 0; i < n; ++i) TEST_ASSERT_EQUAL_UINT8(want, v[i]);
}

static void test_unset_and_solid_are_steady() {
  uint8_t v[16];
  renderPattern(LedStyle(), 1234, v, 16);
  allEqual(v, 16, 255);
  renderPattern(style(Pattern::Solid), 1234, v, 16);
  allEqual(v, 16, 255);
}

static void test_blink_halves() {
  uint8_t v[16];
  const LedStyle s = style(Pattern::Blink, 2);  // 2 Hz: 250 ms on, 250 off
  renderPattern(s, 100, v, 16);
  allEqual(v, 16, 255);
  renderPattern(s, 300, v, 16);
  allEqual(v, 16, 0);
  renderPattern(s, 600, v, 16);
  allEqual(v, 16, 255);
}

static void test_flashing_never_beats_3hz() {
  for (uint8_t speed = 0; speed < 255; ++speed) {
    TEST_ASSERT_TRUE(patternPeriodMs(Pattern::Blink, speed) >= 1000 / kMaxFlashHz);
    TEST_ASSERT_TRUE(patternPeriodMs(Pattern::Strobe, speed) >= 1000 / kMaxFlashHz);
  }
}

static void test_strobe_is_a_short_burst() {
  uint8_t v[4];
  const LedStyle s = style(Pattern::Strobe, 1);  // once a second
  renderPattern(s, 30, v, 4);
  allEqual(v, 4, 255);
  renderPattern(s, kStrobeOnMs + 10, v, 4);
  allEqual(v, 4, 0);
  renderPattern(s, 1000 + 10, v, 4);
  allEqual(v, 4, 255);
}

static void test_pulse_stays_between_25_and_100_percent() {
  uint8_t v[1];
  const LedStyle s = style(Pattern::Pulse, 2);
  uint8_t lo = 255, hi = 0;
  for (uint32_t t = 0; t < 2000; t += 10) {
    renderPattern(s, t, v, 1);
    if (v[0] < lo) lo = v[0];
    if (v[0] > hi) hi = v[0];
  }
  TEST_ASSERT_EQUAL_UINT8(255, hi);
  TEST_ASSERT_UINT8_WITHIN(2, 64, lo);
  renderPattern(s, 0, v, 1);
  TEST_ASSERT_EQUAL_UINT8(255, v[0]);  // starts bright
}

static void test_spin_moves_round_the_ring() {
  uint8_t v[16];
  const LedStyle s = style(Pattern::Spin, 2);  // one turn a second
  renderPattern(s, 0, v, 16);
  TEST_ASSERT_EQUAL_UINT8(255, v[0]);
  TEST_ASSERT_EQUAL_UINT8(255, v[13]);  // the arc trails behind the head
  TEST_ASSERT_EQUAL_UINT8(127, v[12]);  // then the tail
  TEST_ASSERT_EQUAL_UINT8(0, v[5]);
  renderPattern(s, 500, v, 16);         // half a turn later
  TEST_ASSERT_EQUAL_UINT8(255, v[8]);
  TEST_ASSERT_EQUAL_UINT8(0, v[0]);
}

static void test_for_goes_steady_afterwards() {
  uint8_t v[4];
  const LedStyle s = style(Pattern::Blink, 2, 30);
  renderPattern(s, 29 * 1000 + 300, v, 4);
  allEqual(v, 4, 0);  // still blinking (off phase)
  renderPattern(s, 30 * 1000 + 300, v, 4);
  allEqual(v, 4, 255);
}

static void test_parse_names_and_colours() {
  Pattern p = Pattern::Solid;
  TEST_ASSERT_TRUE(parsePattern("spin", p));
  TEST_ASSERT_EQUAL(Pattern::Spin, p);
  TEST_ASSERT_FALSE(parsePattern("rainbow", p));
  TEST_ASSERT_EQUAL(Pattern::Spin, p);
  uint32_t c = 0;
  TEST_ASSERT_TRUE(parseColor("#FF2000", c));
  TEST_ASSERT_EQUAL_HEX32(0xFF2000, c);
  TEST_ASSERT_FALSE(parseColor("ff2000", c));
  TEST_ASSERT_FALSE(parseColor("#ff20", c));
  TEST_ASSERT_FALSE(parseColor("#gg2000", c));
}

static State withMeeting(uint32_t start) {
  State st;
  st.lastSync = T0;
  st.blocks[0].start = start;
  st.blocks[0].end = start + 3600;
  st.blocks[0].status = Status::Busy;
  st.blockCount = 1;
  return st;
}

static void test_status_style_applies() {
  State st;
  st.ledStyles[static_cast<size_t>(Status::Dnd)] = style(Pattern::Pulse, 1);
  TEST_ASSERT_TRUE(chooseLeds(st, Status::Dnd, T0).style.set);
  TEST_ASSERT_FALSE(chooseLeds(st, Status::Busy, T0).style.set);
  TEST_ASSERT_FALSE(chooseLeds(st, Status::Unknown, T0).style.set);
}

static void test_meeting_warning_window() {
  State st = withMeeting(T0 + 600);
  st.meetingWarn.minutes = 5;
  st.meetingWarn.leds = style(Pattern::Pulse, 2);
  TEST_ASSERT_FALSE(chooseLeds(st, Status::Free, T0).warning);  // 10 min out
  LedChoice c = chooseLeds(st, Status::Free, T0 + 400);         // 3m20s out
  TEST_ASSERT_TRUE(c.warning);
  TEST_ASSERT_EQUAL_UINT32(T0 + 300, c.startedAt);
  TEST_ASSERT_FALSE(chooseLeds(st, Status::Busy, T0 + 600).warning);  // it started
}

static void test_meeting_warning_beats_status_style_and_needs_a_clock() {
  State st = withMeeting(T0 + 120);
  st.meetingWarn.minutes = 5;
  st.meetingWarn.leds = style(Pattern::Blink, 2);
  st.ledStyles[static_cast<size_t>(Status::Free)] = style(Pattern::Spin);
  TEST_ASSERT_EQUAL(Pattern::Blink, chooseLeds(st, Status::Free, T0).style.pattern);
  TEST_ASSERT_EQUAL(Pattern::Spin, chooseLeds(st, Status::Free, 0).style.pattern);  // no clock: no warning
}

static void test_meeting_warning_off_by_default() {
  State st = withMeeting(T0 + 60);
  TEST_ASSERT_FALSE(chooseLeds(st, Status::Free, T0).warning);
}

void run_led_pattern_tests() {
  RUN_TEST(test_unset_and_solid_are_steady);
  RUN_TEST(test_blink_halves);
  RUN_TEST(test_flashing_never_beats_3hz);
  RUN_TEST(test_strobe_is_a_short_burst);
  RUN_TEST(test_pulse_stays_between_25_and_100_percent);
  RUN_TEST(test_spin_moves_round_the_ring);
  RUN_TEST(test_for_goes_steady_afterwards);
  RUN_TEST(test_parse_names_and_colours);
  RUN_TEST(test_status_style_applies);
  RUN_TEST(test_meeting_warning_window);
  RUN_TEST(test_meeting_warning_beats_status_style_and_needs_a_clock);
  RUN_TEST(test_meeting_warning_off_by_default);
}
