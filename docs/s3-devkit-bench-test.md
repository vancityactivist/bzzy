# Bench test: ESP32-S3 DevKit + ER-TFT1.69-4

This is a dry run of the bzzy main board ([hardware/main-board.md](hardware/main-board.md)) on the bench. An Espressif ESP32-S3 DevKit drives a sample of the main board's screen, the East Rising **ER-TFT1.69-4** (1.69", 240 × 280, ST7789 + CST816 touch), through an 18-pin FPC breakout. It uses **the same GPIOs as the main board**, so what works here carries straight over.

It answers, before we order a PCB:

- Is the panel's pinout what the datasheet says, and which way round does the breakout number it?
- Do the screen offsets and colours match the Waveshare (so GIFs and layouts line up)?
- Which CST816 variant is on the touch panel, and do taps and swipes work?
- How bright is the backlight from 3.3 V?
- With a -1U DevKit and a flex antenna: how is Wi-Fi range compared with the Waveshare?

PlatformIO env: `s3_devkit_tft169`. CI builds it on every pull request. It isn't in firmware releases, so it won't update itself over the air; flash it over USB.

## Parts

| Part | Notes |
|---|---|
| ESP32-S3-DevKitC-1U-N8R8 | Same module family as the main board (-1U, antenna socket). The DevKitC-1-N16R8 (printed antenna) also works for the screen test |
| ER-TFT1.69-4 with touch | The sample panels, touch fitted |
| 18-pin 0.5 mm FPC breakout | With its ZIF connector fitted (or solder on one of the BuyDisplay ZIF connectors) |
| 15 Ω resistor | Backlight (anything from 10 to 22 Ω is fine) |
| Jumper wires | About 15 |
| Optional: 2 × 4.7 kΩ | I2C pull-ups for touch, if it doesn't answer (see below) |
| Optional: 2.4 GHz u.FL flex antenna, ≤ 2 dBi | For the -1U DevKit. **Don't power the -1U without an antenna plugged in** |
| Optional: WS2812B strip, push button | To see the ring and top button too |

## Before you wire: find pin 1

FPC breakouts number their pads 1 to 18, but depending on which side the ZIF connector's contacts are on, the breakout's pin 1 can be the panel's pin 18. Check before powering anything:

1. Plug the panel's tail into the breakout's connector, contacts facing the connector's contacts.
2. With a multimeter on continuity, check breakout pads **5 and 6**. On the panel these are both GND, so they should beep together, and also with pads 1, 12 and 18.
3. If instead 13 and 14 beep together (and with 1, 7 and 18), the numbering is mirrored: panel pin N is breakout pad 19 − N. Use the "if mirrored" column below.

## Wiring

DevKit pin names are the GPIO numbers printed on the board.

| Panel pin | Signal | Breakout pad (if mirrored) | DevKit |
|---|---|---|---|
| 1 | GND | 1 (18) | GND |
| 2 | K (backlight cathode) | 2 (17) | **15 Ω → GPIO15** (LOW lights it) |
| 3 | VCC (logic + backlight anode) | 3 (16) | 3V3 |
| 4 | IOVCC | 4 (15) | 3V3 |
| 5, 6 | GND | 5, 6 (14, 13) | GND |
| 7 | DC | 7 (12) | GPIO4 |
| 8 | CS | 8 (11) | GPIO5 |
| 9 | SCL (SPI clock) | 9 (10) | GPIO6 |
| 10 | SDA (SPI data) | 10 (9) | GPIO7 |
| 11 | RESET | 11 (8) | GPIO8 |
| 12 | GND | 12 (7) | GND |
| 13 | CTP_SCL | 13 (6) | GPIO10 |
| 14 | CTP_SDA | 14 (5) | GPIO11 |
| 15 | CTP_RST | 15 (4) | GPIO13 |
| 16 | CTP_INT | 16 (3) | GPIO14 |
| 17 | CTP_VCC | 17 (2) | 3V3 |
| 18 | GND | 18 (1) | GND |

Optional extras, same pins as the main board:

- WS2812B strip: data to **GPIO17** (through 330 Ω), 5 V from the DevKit's **5V** pin, GND. Keep it short (a few LEDs) on USB power.
- Top button: **GPIO18** to GND.

Why the resistor on K: the panel's three backlight LEDs share VCC as their anode, and their cathode (K) has to be pulled low to light them. A GPIO can sink about 20 mA safely, so the resistor limits it; the screen is a little dimmer than on the real board, which switches K with a MOSFET.

## Flash and run

Plug a USB-C cable into the DevKit's port labelled **USB** (the S3's own USB), not **UART**.

```sh
cd firmware
pio run -e s3_devkit_tft169 -t upload
pio device monitor
```

On Windows, use the full path to `pio` as in [esp32-c6-test-build.md](esp32-c6-test-build.md) if it isn't on your PATH. If the upload can't find the board, hold **BOOT**, tap **RESET**, release BOOT, and upload again.

It then behaves like any bzzy: the logo, the `bzzy-XXXX` Wi-Fi setup QR code, pairing at `/pair`, statuses and GIFs.

## What to check and report back

| Check | Good result | If not |
|---|---|---|
| Screen lights and shows the logo | Logo centred, no garbage band at top or bottom | A band means the offset differs from the Waveshare: note how many pixels and on which edge |
| Colours | bzzy's green for Free, red for Busy | Swapped red/blue or inverted colours: tell me, it's a one-line setting |
| Touch | Serial log shows taps and swipes; tapping changes the screen as on the Waveshare | No touch at all: try the 4.7 kΩ pull-ups from GPIO10 and GPIO11 to 3V3. Then send the serial log |
| Touch chip | Serial log at boot | Read the label on the touch flex's chip if it's visible (CST816S, T or D) |
| Backlight | Readable indoors at full brightness | Try 10 Ω |
| Wi-Fi (-1U + antenna) | Joins your Wi-Fi from your usual desk | Compare the signal strength in the serial log with the Waveshare at the same spot |
| Ribbon fold | Fold the tail back behind the panel and measure where its end lands | The main board's connector position depends on it |
