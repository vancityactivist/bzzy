// The setup screens: which step shows, and the "done" card between steps. Run from
// test_status_engine.cpp's main().
#include <string.h>
#include <unity.h>

#include "setup_flow.h"

using namespace bzzy;

static SetupInputs portal(uint8_t phones) { return {true, phones, false, false, false}; }
static SetupInputs online(bool paired, bool code) { return {false, 0, true, paired, code}; }

static void test_fresh_light_walks_through_three_steps() {
  SetupFlow f;
  SetupScreen s = f.update(portal(0), 0);
  TEST_ASSERT_EQUAL(SetupStep::JoinAp, s.step);
  TEST_ASSERT_EQUAL(SetupNote::None, s.note);
  TEST_ASSERT_EQUAL(1, s.number);
  TEST_ASSERT_EQUAL(3, s.total);

  s = f.update(portal(1), 1000);
  TEST_ASSERT_EQUAL(SetupStep::ChooseWifi, s.step);
  TEST_ASSERT_EQUAL(SetupNote::PhoneJoined, s.note);
  TEST_ASSERT_EQUAL(2, s.number);
  // The card stays up for a moment, then the step shows.
  TEST_ASSERT_EQUAL(SetupNote::PhoneJoined, f.update(portal(1), 1000 + kSetupNoteMs - 1).note);
  TEST_ASSERT_EQUAL(SetupNote::None, f.update(portal(1), 1000 + kSetupNoteMs).note);

  s = f.update(online(false, false), 10000);
  TEST_ASSERT_EQUAL(SetupStep::GetCode, s.step);
  TEST_ASSERT_EQUAL(SetupNote::Online, s.note);
  TEST_ASSERT_EQUAL(3, s.number);

  s = f.update(online(false, true), 11000);
  TEST_ASSERT_EQUAL(SetupStep::ShowCode, s.step);
  TEST_ASSERT_EQUAL(SetupNote::Online, s.note);  // still the "online" card

  s = f.update(online(true, false), 60000);
  TEST_ASSERT_EQUAL(SetupStep::None, s.step);
  TEST_ASSERT_EQUAL(SetupNote::Paired, s.note);
  TEST_ASSERT_EQUAL(SetupNote::None, f.update(online(true, false), 60000 + kSetupNoteMs).note);
}

static void test_phone_leaving_goes_back_quietly() {
  SetupFlow f;
  f.update(portal(1), 0);
  SetupScreen s = f.update(portal(0), 5000);
  TEST_ASSERT_EQUAL(SetupStep::JoinAp, s.step);
  TEST_ASSERT_EQUAL(SetupNote::None, s.note);
}

static void test_paired_light_changing_wifi_has_two_steps() {
  SetupFlow f;
  SetupInputs in = {true, 0, false, true, false};
  SetupScreen s = f.update(in, 0);
  TEST_ASSERT_EQUAL(SetupStep::JoinAp, s.step);
  TEST_ASSERT_EQUAL(2, s.total);
  in.portalOpen = false;  // saved; not connected yet
  s = f.update(in, 1000);
  TEST_ASSERT_EQUAL(SetupStep::Connecting, s.step);
  in.wifiUp = true;
  s = f.update(in, 2000);
  TEST_ASSERT_EQUAL(SetupStep::None, s.step);
  TEST_ASSERT_EQUAL(SetupNote::Online, s.note);
}

static void test_paired_light_with_wifi_down_shows_nothing() {
  SetupFlow f;
  SetupScreen s = f.update({false, 0, false, true, false}, 0);
  TEST_ASSERT_EQUAL(SetupStep::None, s.step);
  TEST_ASSERT_EQUAL(SetupNote::None, s.note);
}

static void test_removed_light_shows_a_code_without_step_numbers() {
  SetupFlow f;
  f.update(online(true, false), 0);
  SetupScreen s = f.update(online(false, true), 1000);
  TEST_ASSERT_EQUAL(SetupStep::ShowCode, s.step);
  TEST_ASSERT_EQUAL(0, s.number);
}

static void test_wifi_qr_payload() {
  char buf[64];
  TEST_ASSERT_TRUE(wifiQrPayload("bzzy-3F2A", buf, sizeof(buf)));
  TEST_ASSERT_EQUAL_STRING("WIFI:T:nopass;S:bzzy-3F2A;;", buf);
  TEST_ASSERT_TRUE(wifiQrPayload("a;b:c", buf, sizeof(buf)));
  TEST_ASSERT_EQUAL_STRING("WIFI:T:nopass;S:a\\;b\\:c;;", buf);
  TEST_ASSERT_FALSE(wifiQrPayload("bzzy-3F2A", buf, 10));
}

static void test_pair_code_and_host() {
  char buf[32];
  formatPairCode("K7QF2M", buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("K7Q-F2M", buf);
  formatPairCode("ABC", buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("ABC", buf);
  hostOf("https://bzzy.ca", buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("bzzy.ca", buf);
  hostOf("http://192.168.1.5:3000/x", buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("192.168.1.5:3000", buf);
}

void run_setup_flow_tests() {
  RUN_TEST(test_fresh_light_walks_through_three_steps);
  RUN_TEST(test_phone_leaving_goes_back_quietly);
  RUN_TEST(test_paired_light_changing_wifi_has_two_steps);
  RUN_TEST(test_paired_light_with_wifi_down_shows_nothing);
  RUN_TEST(test_removed_light_shows_a_code_without_step_numbers);
  RUN_TEST(test_wifi_qr_payload);
  RUN_TEST(test_pair_code_and_host);
}
