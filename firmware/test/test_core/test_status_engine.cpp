#include <string.h>
#include <unity.h>

#include "status_engine.h"
#include "ota_policy.h"
#include "text_wrap.h"

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


static void putShow(State& st, uint32_t updatedAt, uint32_t until = 0) {
  st.show.active = true;
  strncpy(st.show.text, "Lunch!", kTextMax - 1);
  st.show.until = until;
  st.show.updatedAt = updatedAt;
}

void test_show_stays_up_through_calendar_changes() {
  State st = freshState();
  addBlock(st, T0 + 600, T0 + 3600, Status::Busy, "Council meeting");
  putShow(st, T0 + 10);
  TEST_ASSERT_TRUE(showVisible(st, T0 + 60));
  TEST_ASSERT_TRUE(showVisible(st, T0 + 700));
  // The status underneath still follows the calendar (for the LEDs).
  TEST_ASSERT_EQUAL(Status::Busy, resolve(st, T0 + 700).status);
}

void test_show_expires() {
  State st = freshState();
  putShow(st, T0, T0 + 3600);
  TEST_ASSERT_TRUE(showVisible(st, T0 + 3599));
  TEST_ASSERT_FALSE(showVisible(st, T0 + 3600));
  // Without a clock, keep showing it (same as a manual override).
  TEST_ASSERT_TRUE(showVisible(st, 0));
}

void test_newer_button_press_hides_show() {
  State st = freshState();
  putShow(st, T0 + 10);
  cycleLocalOverride(st, T0 + 20);
  TEST_ASSERT_FALSE(showVisible(st, T0 + 21));

  State st2 = freshState();
  putShow(st2, T0 + 10);
  clearLocalOverride(st2, T0 + 20);  // long press: back to automatic, and hides it
  TEST_ASSERT_FALSE(showVisible(st2, T0 + 21));
}

void test_show_newer_than_status_is_visible() {
  State st = freshState();
  cycleLocalOverride(st, T0 + 5);
  putShow(st, T0 + 10);
  TEST_ASSERT_TRUE(showVisible(st, T0 + 11));
  st.show.active = false;
  TEST_ASSERT_FALSE(showVisible(st, T0 + 11));
}

static void lineEquals(const char* text, const Line& l, const char* want) {
  char buf[kTextMax] = {0};
  memcpy(buf, text + l.start, l.len);
  TEST_ASSERT_EQUAL_STRING(want, buf);
}

void test_wrap_short_message_is_one_big_line() {
  Wrapped w = wrapMessage("Lunch!");
  TEST_ASSERT_EQUAL(Font::Bold18, w.font);
  TEST_ASSERT_EQUAL(1, w.count);
  lineEquals("Lunch!", w.lines[0], "Lunch!");
}

void test_wrap_breaks_at_spaces() {
  const char* t = "Back in 10 minutes, grab a coffee";
  Wrapped w = wrapMessage(t);
  TEST_ASSERT_EQUAL(Font::Bold18, w.font);
  TEST_ASSERT_TRUE(w.count > 1);
  for (size_t i = 0; i < w.count; ++i) {
    TEST_ASSERT_TRUE(textWidth(t + w.lines[i].start, w.lines[i].len, w.font) <= kMessageWidth);
    TEST_ASSERT_NOT_EQUAL(' ', t[w.lines[i].start]);
  }
}

void test_wrap_falls_back_to_small_font() {
  const char* t = "WWWWWWWW WWWWWWWW WWWWWWWW WWWWWWWW WWWWWWW";
  Wrapped w = wrapMessage(t);
  TEST_ASSERT_EQUAL(Font::Bold12, w.font);
}

void test_wrap_breaks_long_words() {
  const char* t = "Supercalifragilisticexpialidocious";
  Line lines[kMaxLines];
  bool cut = true;
  size_t n = wrapText(t, Font::Bold18, kMessageWidth, 4, lines, &cut);
  TEST_ASSERT_TRUE(n >= 2);
  TEST_ASSERT_FALSE(cut);
  size_t total = 0;
  for (size_t i = 0; i < n; ++i) total += lines[i].len;
  TEST_ASSERT_EQUAL(strlen(t), total);
}

// ---- over-the-air updates ----

void test_release_versions() {
  TEST_ASSERT_TRUE(isReleaseVersion("0.2.0"));
  TEST_ASSERT_TRUE(isReleaseVersion("12.3.45-rc.1"));
  TEST_ASSERT_FALSE(isReleaseVersion(""));
  TEST_ASSERT_FALSE(isReleaseVersion("dev"));
  TEST_ASSERT_FALSE(isReleaseVersion("1.2"));
  TEST_ASSERT_FALSE(isReleaseVersion("1.2.3."));
  TEST_ASSERT_FALSE(isReleaseVersion("v1.2.3"));
  TEST_ASSERT_FALSE(isReleaseVersion("1.2.3-"));
}

void test_version_order() {
  TEST_ASSERT_TRUE(compareVersions("0.2.0", "0.10.0") < 0);
  TEST_ASSERT_TRUE(compareVersions("1.0.0", "0.99.99") > 0);
  TEST_ASSERT_EQUAL(0, compareVersions("1.2.3", "1.2.3"));
  TEST_ASSERT_TRUE(compareVersions("1.2.0-rc.1", "1.2.0") < 0);
  TEST_ASSERT_TRUE(compareVersions("1.2.0-rc.2", "1.2.0-rc.1") > 0);
}

void test_signed_message() {
  char buf[128];
  size_t n = otaSignedMessage(buf, sizeof(buf), "waveshare_s3_touch_lcd169", "0.2.0", "ab12");
  TEST_ASSERT_EQUAL_STRING("bzzy-fw|1|waveshare_s3_touch_lcd169|0.2.0|ab12", buf);
  TEST_ASSERT_EQUAL(strlen(buf), n);
  char tiny[8];
  TEST_ASSERT_EQUAL(0, otaSignedMessage(tiny, sizeof(tiny), "b", "0.2.0", "ab12"));
}

void test_auto_update_waits_for_a_quiet_moment() {
  OtaOffer offer = {"0.3.0", 0};
  OtaContext ctx = {"0.2.0", "", 0, false};
  TEST_ASSERT_FALSE(shouldInstall(offer, ctx));
  ctx.quiet = true;
  TEST_ASSERT_TRUE(shouldInstall(offer, ctx));
}

void test_never_downgrades() {
  OtaContext ctx = {"0.3.0", "", 0, true};
  TEST_ASSERT_FALSE(shouldInstall({"0.3.0", 0}, ctx));
  TEST_ASSERT_FALSE(shouldInstall({"0.2.9", 0}, ctx));
  TEST_ASSERT_FALSE(shouldInstall({"0.2.9", 7}, ctx));  // not even when asked
  TEST_ASSERT_FALSE(shouldInstall({"dev", 7}, ctx));
}

void test_test_builds_only_update_when_asked() {
  OtaContext ctx = {"dev", "", 0, true};
  TEST_ASSERT_FALSE(shouldInstall({"0.3.0", 0}, ctx));
  TEST_ASSERT_TRUE(shouldInstall({"0.3.0", 7}, ctx));
}

void test_rolled_back_version_needs_a_new_press() {
  OtaContext ctx = {"0.2.0", "0.3.0", 7, true};
  TEST_ASSERT_FALSE(shouldInstall({"0.3.0", 0}, ctx));
  TEST_ASSERT_FALSE(shouldInstall({"0.3.0", 7}, ctx));  // that press was already used
  TEST_ASSERT_TRUE(shouldInstall({"0.3.0", 8}, ctx));
  TEST_ASSERT_TRUE(shouldInstall({"0.3.1", 0}, ctx));   // a newer release is fine
}

void test_update_now_ignores_quiet_time() {
  OtaContext ctx = {"0.2.0", "", 0, false};
  TEST_ASSERT_TRUE(shouldInstall({"0.3.0", 5}, ctx));
}

void run_led_pattern_tests();  // test_led_pattern.cpp

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
  RUN_TEST(test_show_stays_up_through_calendar_changes);
  RUN_TEST(test_show_expires);
  RUN_TEST(test_newer_button_press_hides_show);
  RUN_TEST(test_show_newer_than_status_is_visible);
  RUN_TEST(test_wrap_short_message_is_one_big_line);
  RUN_TEST(test_wrap_breaks_at_spaces);
  RUN_TEST(test_wrap_falls_back_to_small_font);
  RUN_TEST(test_wrap_breaks_long_words);
  RUN_TEST(test_release_versions);
  RUN_TEST(test_version_order);
  RUN_TEST(test_signed_message);
  RUN_TEST(test_auto_update_waits_for_a_quiet_moment);
  RUN_TEST(test_never_downgrades);
  RUN_TEST(test_test_builds_only_update_when_asked);
  RUN_TEST(test_rolled_back_version_needs_a_new_press);
  RUN_TEST(test_update_now_ignores_quiet_time);
  run_led_pattern_tests();
  return UNITY_END();
}
