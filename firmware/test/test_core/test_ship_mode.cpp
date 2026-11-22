// Ship mode: pack once, arrive on a different Wi-Fi. Run from test_status_engine.cpp's main().
#include <unity.h>

#include "ship_mode.h"

using namespace bzzy;

static void test_ship_packs() {
  TEST_ASSERT_EQUAL(ShipAction::Pack, shipStep(false, true, "", "Workshop"));
  // Tested again on the bench Wi-Fi: packs again, so it doesn't ship with that Wi-Fi saved.
  TEST_ASSERT_EQUAL(ShipAction::Pack, shipStep(true, true, "Workshop", "Workshop"));
  // At its new home, before the app has heard it arrived: carry on as normal.
  TEST_ASSERT_EQUAL(ShipAction::None, shipStep(true, true, "Workshop", "Office Guest"));
}

static void test_ship_ends_when_the_app_says_so() {
  TEST_ASSERT_EQUAL(ShipAction::Done, shipStep(true, false, "Workshop", "Office Guest"));
  TEST_ASSERT_EQUAL(ShipAction::None, shipStep(false, false, "", "Workshop"));
}

static void test_arrives_only_on_a_different_wifi() {
  TEST_ASSERT_FALSE(shipArrived(true, "Workshop", "Workshop"));  // back on the bench Wi-Fi
  TEST_ASSERT_TRUE(shipArrived(true, "Workshop", "Office Guest"));
  TEST_ASSERT_TRUE(shipArrived(true, "", "Office Guest"));         // packed with no name saved
  TEST_ASSERT_FALSE(shipArrived(true, "Workshop", ""));            // not on any Wi-Fi
  TEST_ASSERT_FALSE(shipArrived(false, "Workshop", "Office Guest"));  // not in ship mode
}

void run_ship_mode_tests() {
  RUN_TEST(test_ship_packs);
  RUN_TEST(test_ship_ends_when_the_app_says_so);
  RUN_TEST(test_arrives_only_on_a_different_wifi);
}
