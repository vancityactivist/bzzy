# bzzy plan

Where bzzy is going next, in order. Agreed 2026-11-19, after the switch from the Waveshare board plus a ring board to one custom main board. Update this file as steps finish.

## Why the plan changed

Until 2026-11-18 the plan was to put the Waveshare ESP32-S3-Touch-LCD-1.69 inside a custom LED ring board ([archived](../hardware/archive/led-ring-revC/README.md)) and a printed case. To sell built bzzys in Canada, every part with a radio needs ISED certification, and the Waveshare board has none: its ESP32-S3 is a bare chip with its own antenna, not a certified module. Certifying it ourselves would cost thousands more and repeat for every board change.

So the product becomes **one custom board** with Espressif's pre-certified ESP32-S3-WROOM-1U module and a small stuck-on antenna, the bare 1.69" screen (BuyDisplay ER-TFT1.69-4), USB-C, a clock and the 16-LED ring. The radio certification comes with the module, so bzzy itself only needs an ICES-003 emissions test. Full spec: [hardware/main-board.md](hardware/main-board.md).

- The Waveshare board stays as the **development board**. Firmware keeps its build.
- The ring board (rev B, B2, C) was never ordered. Rev D is dropped; its review fixes and the 250 mA LED cap fold into the main board.

## Hardware path

| # | Step | Status |
|---|---|---|
| 1 | **Waveshare test.** Run the firmware on the Waveshare ESP32-S3-Touch-LCD-1.69. Wire a few WS2812 LEDs to GPIO17 for an early LED test. Caliper the screen glass and board | Today (2026-11-19) |
| 2 | **Screen bench test.** The ER-TFT1.69-4 panel on an ESP32-S3 DevKitC through an FPC breakout, same pins as the main board: pinout, offsets, touch chip, backlight, Wi-Fi range with the -1U antenna. Guide: [s3-devkit-bench-test.md](s3-devkit-bench-test.md) | Parts arrive Sat 2026-11-21 |
| 3 | **Main board design.** KiCad schematic, then layout of the merged board (rev A), kicad-happy review. Case redesign to match. Decide the final size (52 × 61 mm today; about 40 × 47 mm is possible) | After step 2 |
| 4 | **Prototypes.** Order 5 to 10 from JLCPCB. Bring-up: flash, screen, touch, LEDs, clock, Wi-Fi range against the Waveshare, light in the case. Expect a second spin | |
| 5 | **Certification.** Quotes from 2 or 3 labs for ICES-003 Class B (and FCC Part 15B in the same visit), a pre-scan on a cased prototype, then the formal test, labels and technical file. See [main board spec section 11](hardware/main-board.md#11-certification-canada-now-us-later) | Ask for quotes during step 3 |
| 6 | **First batch.** On the batch ordering system | |

Rough time from step 3 to batch-ready: 2 to 3 months, mostly shipping and lab lead time.

## Business path (in parallel)

| Step | When |
|---|---|
| Move Vercel to **Pro**. Hobby is for non-commercial use only | Before the first charge |
| A **BC lawyer** reviews the pre-order terms | Before taking orders |
| **Stripe and the ordering build**, from the batch ordering spec (`docs/commerce/batch-orders.md`, draft PR #81) | Alongside steps 3 to 5 |

## Loose ends

- [x] Tag `fw-v0.3.2` (no flicker on update progress, double-press fix). Tagged 2026-11-18.
- [ ] Run `npm run db:migrate` against production. Migrations go up to `0015_gif_prefs` (GIF library) on `main`; 0010 to 0012 (working hours, show-now ring effects, pairing) were still listed as pending.
- [ ] Check the `fw-v0.3.2` release on GitHub isn't marked pre-release.

## Software roadmap

App features keep going alongside the hardware. The order agreed on 2026-11-14: working hours and smarter polling (done), button gestures and a focus timer, the public API and webhooks (done), a desktop mic and camera helper for call presence, a team board, a "knock" QR code, more calendar sources, then cloud presence (Teams, Zoom, Slack). The ICS link stays the default calendar.
