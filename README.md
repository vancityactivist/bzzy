# bzzy

A homebrew desk busy light: a small screen that shows GIFs, a ring of light around it, and a status (Free, Busy, Do not disturb, Away) set from your phone, your calendar, or the button on the device. It clips to a monitor and is powered over USB.

## How it fits together

```
 ICS calendar feed ──▶ companion app (Next.js) ◀── phone / laptop
                              ▲
                              │ device polls over HTTPS (outbound only)
                              │
                         bzzy device ◀── button
```

The device never needs anything to connect *to* it, so it works on guest Wi-Fi that isolates devices. It saves the last state it received, so it keeps following your calendar and button presses if Wi-Fi or the app goes away. See [docs/protocol.md](docs/protocol.md).

## Plan

1. Parts and breadboard prototype
2. **Companion app** ([app/](app/)): sign-in, teams, status buttons, device API, GIF uploads
3. **Calendar** from an ICS link (Settings → Calendars): meetings make you Busy, out of office makes you Away, manual status still wins
4. Enclosure and monitor clip (OpenSCAD, sent out for printing)

### Later

- **Logo.** Design a proper bzzy logo in the style of the current wordmark: lowercase, black, tight letter spacing (Geist semibold, `tracking-tight`, as in the app's top bar). It should work as an app icon, a favicon, and something small enough to print or engrave on the case.
- **Pre-built lights.** Once the custom board is proven, offer assembled and tested bzzys for people who don't want to order and solder their own. The landing page already says they're coming.
- **Landing page images.** The signed-out home page (`app/src/components/landing.tsx`) uses labelled placeholders for the hero photo, the four status shots, the device photos and app screenshots. Swap each for a real image once there's a working device to photograph.

## Hardware

The target board is the **touch** version. The non-touch board and a plain ESP32 still build, for testing.

The final design adds a custom LED ring board around the Waveshare board and a printed case with a glowing frame. See [hardware/](hardware/README.md). The parts below are for the breadboard prototype.

| Part | Part number to search | Notes |
|---|---|---|
| Main board (touch) | **Waveshare ESP32-S3-Touch-LCD-1.69**, SKU **27350** | ESP32-S3R8 (8 MB PSRAM), 16 MB flash, 1.69" 240×280 ST7789V2, CST816T touch, PCF85063 RTC, QMI8658 IMU, buzzer, USB-C |
| Main board (no touch, alternative) | Waveshare ESP32-S3-LCD-1.69, SKU 27932 | Same board without touch |
| LED ring (prototype) | WS2812B 12-LED ring, 50 mm (or Adafruit NeoPixel Ring 12, #1643) | |
| LED strip (final bezel) | WS2812B 144 LEDs/m, 5 V, IP30 (no silicone sleeve) | ~16 LEDs cut to fit the case |
| Resistor | 330 Ω, 1/4 W | In series on the LED data line |
| Capacitor | 470 µF, 10 V or higher, electrolytic | Across LED 5 V / GND, near the LEDs |
| RTC backup cell (optional) | Rechargeable ML1220 with an SH1.0 2-pin lead | Keeps the clock through power cuts. Without it, the clock comes back from NTP once Wi-Fi does |

**Wiring (touch board):** LED data to **GPIO17**, LED 5 V to the board's 5 V pin, GND to GND. The free pins on this board are 2, 3, 17 and 18. Avoid 3, which is a strapping pin. LED current is capped at 400 mA in firmware.

On the non-touch board the LED data pin is GPIO16. On a generic ESP32 it's GPIO13.

## Firmware

Built with [PlatformIO](https://platformio.org/).

```sh
cd firmware
pio run -e waveshare_s3_touch_lcd169 -t upload   # the real board (touch)
pio run -e waveshare_s3_lcd169 -t upload         # non-touch version
pio run -e esp32_generic -t upload               # a plain ESP32: LEDs, Wi-Fi and sync only
pio test -e native                               # status logic unit tests, no hardware needed
pio device monitor
```

**First boot / changing Wi-Fi:** with nothing saved, or if you hold the BOOT button (or the top button on the final hardware) for 3 seconds while plugging in, the device opens a Wi-Fi network called `bzzy-setup`. Join it from your phone, pick your Wi-Fi, and fill in the companion app URL, device ID and token.

**Controls:** tap the screen (or press BOOT, or the top button on the final hardware) to step Free → Busy → Do not disturb → back to automatic. Long-press the screen or the top button for one second to go straight back to automatic (calendar or default).

**GIFs:** pick one per status on the app's Devices page (built-in or your own uploads from the GIFs page). The device downloads a GIF when it changes and keeps it in flash, so it still plays offline. Choosing "No GIF" shows a coloured card with large text.

### When things go wrong

| Situation | What it shows |
|---|---|
| Wi-Fi or app down | Last-known status and calendar, small hollow ring in the corner |
| No good data for 24 h, or clock never set | Slow grey breathing light, "?" and a note on screen |
| Power cut with no Wi-Fi | Clock comes back from the board's RTC, cached calendar keeps working |

### Not done yet

- HTTPS certificate checking is off (`setInsecure`) until the companion app exists.
- Untested on real hardware: pin numbers come from Waveshare's V2 schematic.
