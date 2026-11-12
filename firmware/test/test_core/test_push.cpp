// Team pushes: on screen until dismissed, beat status changes, flash first. Run from
// test_status_engine.cpp's main().
#include <string.h>
#include <unity.h>

#include "status_engine.h"

using namespace bzzy;

static const uint32_t T0 = 1762891200;

static State withPush(const char* id, uint32_t sentAt, uint32_t until = 0) {
  State st;
  st.lastSync = T0;
  st.show.active = true;
  strncpy(st.show.text, "Fire drill at 3", kTextMax - 1);
  st.show.until = until;
  st.show.updatedAt = sentAt;
  st.push.active = true;
  strncpy(st.push.id, id, kPushIdMax - 1);
  st.push.updatedAt = sentAt;
  return st;
}

static void test_push_beats_a_newer_status_change() {
  State st = withPush("p1", T0);
  cycleLocalOverride(st, T0 + 30);  // a plain "show now" would hide here
  TEST_ASSERT_TRUE(showVisible(st, T0 + 31));
  TEST_ASSERT_TRUE(pushVisible(st, T0 + 31));
}

static void test_push_ends_on_time() {
  State st = withPush("p1", T0, T0 + 900);
  TEST_ASSERT_TRUE(showVisible(st, T0 + 899));
  TEST_ASSERT_FALSE(showVisible(st, T0 + 900));
}

static void test_dismiss_hides_it_once() {
  State st = withPush("p1", T0);
  TEST_ASSERT_TRUE(dismissPush(st));
  TEST_ASSERT_EQUAL_STRING("p1", st.dismissedPush);
  TEST_ASSERT_FALSE(showVisible(st, T0 + 5));
  // A second press is a normal press again.
  TEST_ASSERT_FALSE(dismissPush(st));
}

static void test_no_push_nothing_to_dismiss() {
  State st;
  st.show.active = true;
  st.show.updatedAt = T0;
  TEST_ASSERT_FALSE(dismissPush(st));
}

static void test_merge_keeps_dismissal_while_server_still_sends_it() {
  State cached = withPush("p1", T0);
  dismissPush(cached);
  State fromServer = withPush("p1", T0);  // the ack hasn't landed yet
  mergeFromServer(cached, fromServer, T0 + 20);
  TEST_ASSERT_FALSE(showVisible(cached, T0 + 20));

  // A new push replaces it and shows.
  State newer = withPush("p2", T0 + 40);
  mergeFromServer(cached, newer, T0 + 41);
  TEST_ASSERT_EQUAL_STRING("", cached.dismissedPush);
  TEST_ASSERT_TRUE(showVisible(cached, T0 + 41));
}

static void test_without_push_show_rules_are_unchanged() {
  State cached = withPush("p1", T0);
  dismissPush(cached);
  State fromServer;
  fromServer.show.active = true;
  fromServer.show.updatedAt = T0 - 100;  // their own show from earlier
  mergeFromServer(cached, fromServer, T0 + 20);
  TEST_ASSERT_EQUAL_STRING("", cached.dismissedPush);
  TEST_ASSERT_TRUE(showVisible(cached, T0 + 20));
  cycleLocalOverride(cached, T0 + 30);
  TEST_ASSERT_FALSE(showVisible(cached, T0 + 31));
}

static void test_push_flash_comes_first() {
  State st = withPush("p1", T0);
  st.push.leds.set = true;
  st.push.leds.pattern = Pattern::Strobe;
  st.ledStyles[0].set = true;
  st.ledStyles[0].pattern = Pattern::Pulse;
  st.meetingWarn.minutes = 5;
  st.meetingWarn.leds.set = true;
  st.meetingWarn.leds.pattern = Pattern::Blink;
  st.blocks[0].start = T0 + 120;
  st.blocks[0].end = T0 + 600;
  st.blockCount = 1;

  LedChoice c = chooseLeds(st, Status::Free, T0 + 10);
  TEST_ASSERT_TRUE(c.push);
  TEST_ASSERT_EQUAL(Pattern::Strobe, c.style.pattern);
  TEST_ASSERT_EQUAL_UINT32(T0, c.startedAt);

  // Dismissed: back to the meeting warning.
  dismissPush(st);
  c = chooseLeds(st, Status::Free, T0 + 10);
  TEST_ASSERT_FALSE(c.push);
  TEST_ASSERT_TRUE(c.warning);
}

static void test_push_without_flash_keeps_the_status_style() {
  State st = withPush("p1", T0);
  st.ledStyles[1].set = true;
  st.ledStyles[1].pattern = Pattern::Pulse;
  const LedChoice c = chooseLeds(st, Status::Busy, T0 + 10);
  TEST_ASSERT_FALSE(c.push);
  TEST_ASSERT_EQUAL(Pattern::Pulse, c.style.pattern);
}

void run_push_tests() {
  RUN_TEST(test_push_beats_a_newer_status_change);
  RUN_TEST(test_push_ends_on_time);
  RUN_TEST(test_dismiss_hides_it_once);
  RUN_TEST(test_no_push_nothing_to_dismiss);
  RUN_TEST(test_merge_keeps_dismissal_while_server_still_sends_it);
  RUN_TEST(test_without_push_show_rules_are_unchanged);
  RUN_TEST(test_push_flash_comes_first);
  RUN_TEST(test_push_without_flash_keeps_the_status_style);
}
