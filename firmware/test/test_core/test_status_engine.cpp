#include <string.h>
#include <unity.h>

#include "status_engine.h"

using namespace bzzy;

static const uint32_t T0 = 1762891200;  // 2025-11-11 20:00 UTC, any fixed time works

static State freshState() {
  State st;
  st.lastSync = T0;
  st.defaultStatus = Status::Free;
  return st;
}

static void addBlock(State& st, uint32_t start, uint32_t end, Status s, const char* text) {
  Block& b = st.blocks[st.blockCount++];
  b.start = start;
  b.end = end;
  b.status = s;
  strncpy(b.text, text, kTextMax - 1);
}

void setUp() {}
void tearDown() {}

void test_default_when_nothing_scheduled() {
  State st = freshState();
  Resolved r = resolve(st, T0 + 60);
  TEST_ASSERT_EQUAL(Status::Free, r.status);
  TEST_ASSERT_EQUAL(Source::Default, r.source);
}

void test_calendar_block_covers_now() {
  State st = freshState();
  addBlock(st, T0, T0 + 3600, Status::Busy, "Council meeting");
  Resolved r = resolve(st, T0 + 60);
  TEST_ASSERT_EQUAL(Status::Busy, r.status);
  TEST_ASSERT_EQUAL(Source::Calendar, r.source);
  TEST_ASSERT_EQUAL_STRING("Council meeting", r.text);
  TEST_ASSERT_EQUAL_UINT32(T0 + 3600, r.until);
}

void test_block_end_is_exclusive() {
  State st = freshState();
  addBlock(st, T0, T0 + 3600, Status::Busy, "");
  TEST_ASSERT_EQUAL(Status::Free, resolve(st, T0 + 3600).status);
}

void test_default_reports_next_change() {
  State st = freshState();
  addBlock(st, T0 + 7200, T0 + 9000, Status::Dnd, "");
  addBlock(st, T0 + 1800, T0 + 3600, Status::Busy, "");
  Resolved r = resolve(st, T0 + 60);
  TEST_ASSERT_EQUAL(Source::Default, r.source);
  TEST_ASSERT_EQUAL_UINT32(T0 + 1800, r.until);
}

void test_manual_beats_calendar() {
  State st = freshState();
  addBlock(st, T0, T0 + 3600, Status::Busy, "");
  st.manual.active = true;
  st.manual.status = Status::Dnd;
  st.manual.until = T0 + 600;
  TEST_ASSERT_EQUAL(Status::Dnd, resolve(st, T0 + 60).status);
  // After it expires, the calendar takes over again.
  TEST_ASSERT_EQUAL(Status::Busy, resolve(st, T0 + 601).status);
}

void test_stale_data_uses_fallback() {
  State st = freshState();
  addBlock(st, T0, T0 + 200000, Status::Busy, "");
  Settings cfg;
  cfg.staleAfterSec = 3600;
  cfg.fallback = Status::Unknown;
  Resolved r = resolve(st, T0 + 3601, cfg);
  TEST_ASSERT_EQUAL(Status::Unknown, r.status);
  TEST_ASSERT_EQUAL(Source::Fallback, r.source);
}

void test_never_synced_uses_fallback() {
  State st;
  TEST_ASSERT_EQUAL(Source::Fallback, resolve(st, T0).source);
}

void test_no_clock_keeps_manual_but_not_calendar() {
  State st = freshState();
  addBlock(st, T0, T0 + 3600, Status::Busy, "");
  TEST_ASSERT_EQUAL(Source::Fallback, resolve(st, 0).source);
  st.manual.active = true;
  st.manual.status = Status::Dnd;
  st.manual.until = T0 + 600;
  TEST_ASSERT_EQUAL(Status::Dnd, resolve(st, 0).status);
}

void test_button_cycles_and_returns_to_auto() {
  State st = freshState();
  addBlock(st, T0, T0 + 3600, Status::Busy, "");
  cycleLocalOverride(st, T0 + 1);
  TEST_ASSERT_EQUAL(Status::Free, resolve(st, T0 + 2).status);
  cycleLocalOverride(st, T0 + 3);
  TEST_ASSERT_EQUAL(Status::Busy, resolve(st, T0 + 4).status);
  cycleLocalOverride(st, T0 + 5);
  TEST_ASSERT_EQUAL(Status::Dnd, resolve(st, T0 + 6).status);
  cycleLocalOverride(st, T0 + 7);
  Resolved r = resolve(st, T0 + 8);
  TEST_ASSERT_EQUAL(Source::Calendar, r.source);
}

void test_long_press_clears_to_auto() {
  State st = freshState();
  addBlock(st, T0, T0 + 3600, Status::Busy, "");
  cycleLocalOverride(st, T0 + 1);  // Free
  TEST_ASSERT_EQUAL(Status::Free, resolve(st, T0 + 2).status);
  clearLocalOverride(st, T0 + 3);
  Resolved r = resolve(st, T0 + 4);
  TEST_ASSERT_EQUAL(Source::Calendar, r.source);
  TEST_ASSERT_EQUAL(Status::Busy, r.status);
  // The next tap starts the cycle again from Free.
  cycleLocalOverride(st, T0 + 5);
  TEST_ASSERT_EQUAL(Status::Free, resolve(st, T0 + 6).status);
}

void test_merge_keeps_newer_local_press() {
  State cached = freshState();
  cycleLocalOverride(cached, T0 + 100);  // Free, set locally
  cycleLocalOverride(cached, T0 + 101);  // Busy

  State server = freshState();
  server.lastSync = T0 + 200;
  server.manual.active = true;
  server.manual.status = Status::Away;
  server.manual.updatedAt = T0 + 50;  // older than the button press

  mergeFromServer(cached, server, T0 + 200);
  TEST_ASSERT_EQUAL(Status::Busy, resolve(cached, T0 + 201).status);
  TEST_ASSERT_EQUAL_UINT32(T0 + 200, cached.lastSync);
}

void test_merge_takes_newer_server_override() {
  State cached = freshState();
  cycleLocalOverride(cached, T0 + 100);

  State server = freshState();
  server.manual.active = true;
  server.manual.status = Status::Away;
  server.manual.updatedAt = T0 + 150;

  mergeFromServer(cached, server, T0 + 200);
  TEST_ASSERT_EQUAL(Status::Away, resolve(cached, T0 + 201).status);
}

void test_merge_keeps_local_clear_over_older_server_override() {
  State cached = freshState();
  cycleLocalOverride(cached, T0 + 100);
  cycleLocalOverride(cached, T0 + 101);
  cycleLocalOverride(cached, T0 + 102);
  cycleLocalOverride(cached, T0 + 103);  // cleared: back to automatic

  State server = freshState();
  server.manual.active = true;
  server.manual.status = Status::Dnd;
  server.manual.updatedAt = T0 + 10;

  mergeFromServer(cached, server, T0 + 200);
  TEST_ASSERT_EQUAL(Source::Default, resolve(cached, T0 + 201).source);
}

void test_status_names_round_trip() {
  const Status all[] = {Status::Free, Status::Busy, Status::Dnd, Status::Away, Status::Unknown};
  for (Status s : all) {
    Status parsed = Status::Free;
    TEST_ASSERT_TRUE(parseStatus(statusName(s), parsed));
    TEST_ASSERT_EQUAL(s, parsed);
  }
  Status untouched = Status::Busy;
  TEST_ASSERT_FALSE(parseStatus("on-fire", untouched));
  TEST_ASSERT_EQUAL(Status::Busy, untouched);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_default_when_nothing_scheduled);
  RUN_TEST(test_calendar_block_covers_now);
  RUN_TEST(test_block_end_is_exclusive);
  RUN_TEST(test_default_reports_next_change);
  RUN_TEST(test_manual_beats_calendar);
  RUN_TEST(test_stale_data_uses_fallback);
  RUN_TEST(test_never_synced_uses_fallback);
  RUN_TEST(test_no_clock_keeps_manual_but_not_calendar);
  RUN_TEST(test_button_cycles_and_returns_to_auto);
  RUN_TEST(test_long_press_clears_to_auto);
  RUN_TEST(test_merge_keeps_newer_local_press);
  RUN_TEST(test_merge_takes_newer_server_override);
  RUN_TEST(test_merge_keeps_local_clear_over_older_server_override);
  RUN_TEST(test_status_names_round_trip);
  return UNITY_END();
}
