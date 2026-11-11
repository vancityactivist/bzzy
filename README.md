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

1. **Parts and breadboard prototype** ← this repo is here
2. Companion app: status buttons, GIF/text uploads, device API
3. Calendar rules from the ICS feed, with manual override
4. Enclosure and monitor clip (OpenSCAD, sent out for printing)

## Hardware

| Part | Notes |
|---|---|
| [Waveshare ESP32-S3-LCD-1.69](https://www.waveshare.com/esp32-s3-lcd-1.69.htm) | ESP32-S3, 8 MB PSRAM, 16 MB flash, 1.69" 240×280 ST7789V2 screen, RTC, USB-C |
| WS2812B LEDs | 12-LED ring for prototyping; ~16 LEDs of 144/m strip for the final bezel |
| 330 Ω resistor | in series on the LED data line |
| 220–470 µF capacitor | across LED 5V/GND, near the LEDs |

Wiring: LED data to **GPIO16** on the Waveshare board (GPIO13 on a generic ESP32), LED 5V to the board's 5V/VBUS, GND to GND. LED current is capped at 400 mA in firmware.

## Firmware

Built with [PlatformIO](https://platformio.org/).

```sh
cd firmware
pio run -e waveshare_s3_lcd169 -t upload    # the real board
pio run -e esp32_generic -t upload          # a plain ESP32: LEDs, Wi-Fi and sync only
pio test -e native                          # status logic unit tests, no hardware needed
pio device monitor
```

**First boot / changing Wi-Fi:** with nothing saved, or if you hold the BOOT button for 3 seconds while plugging in, the device opens a Wi-Fi network called `bzzy-setup`. Join it from your phone, pick your Wi-Fi, and fill in the companion app URL, device ID and token.

**Button:** each press steps Free → Busy → Do not disturb → back to automatic.

**GIFs:** put files at `/gif/free.gif`, `/gif/busy.gif`, `/gif/dnd.gif`, `/gif/away.gif` on the device's LittleFS (for now, via `firmware/data/` and `pio run -t uploadfs`). Keep them 240 px wide and up to 200 px tall. Without a GIF the screen shows a coloured card with large text.

### When things go wrong

| Situation | What it shows |
|---|---|
| Wi-Fi or app down | Last-known status and calendar, small hollow ring in the corner |
| No good data for 24 h, or clock never set | Slow grey breathing light, "?" and a note on screen |
| Power cut with no Wi-Fi | Clock comes back from the board's RTC, cached calendar keeps working |

### Not done yet

- HTTPS certificate checking is off (`setInsecure`) until the companion app exists.
- Untested on real hardware: pin numbers come from Waveshare's V2 schematic.
- GIFs aren't downloaded from the app yet; that's part of step 2.
