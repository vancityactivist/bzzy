# bzzy

A homebrew desk busy light: a small screen that shows GIFs, a ring of light around it, and a status (Free, Busy, Do not disturb, Away) set from your phone, your calendar, or the button on top of the device. It clips to a monitor and is powered over USB-C.

The companion app runs at **[bzzy.vercel.app](https://bzzy.vercel.app)**.

## What's in the repo

| Folder | What it is |
|---|---|
| [app/](app/README.md) | The companion app: Next.js on Vercel, Postgres on Neon (Drizzle), GIFs in Vercel Blob, sign-in with GitHub or a passkey |
| [firmware/](firmware/) | PlatformIO firmware for the Waveshare ESP32-S3 board |
| [hardware/](hardware/README.md) | The LED ring board (KiCad, rev C) and the printed case (OpenSCAD) |
| [docs/protocol.md](docs/protocol.md) | How the device and the app talk |
| [docs/ota.md](docs/ota.md) | Firmware updates over Wi-Fi |

## How it fits together

```
 ICS calendar feed ──▶ companion app (Next.js) ◀── phone / laptop
                         ▲          ▲
   firmware releases ────┘          │ device polls over HTTPS (outbound only)
   (GitHub Releases)                │
                               bzzy device ◀── button
```

The device never needs anything to connect *to* it, so it works on guest Wi-Fi that isolates devices. It saves the last state it received, so it keeps following your calendar and button presses if Wi-Fi or the app goes away. See [docs/protocol.md](docs/protocol.md).

## The app

- **Status:** set Free, Busy, Do not disturb or Away, or leave it on automatic. A live preview shows exactly what the light's screen and ring look like right now.
- **Show now:** put a GIF or a short message on the light straight away. It takes over the whole screen until you clear it.
- **Calendar:** add an ICS link (Settings → Calendars). Meetings make you Busy, out of office makes you Away, and a manual status still wins.
- **GIFs:** upload your own or paste a GIPHY or Tenor link, then pick one per status on the Devices page. Long GIFs are thinned out to fit the device.
- **Devices:** add a light, get its ID and token, choose its GIFs, and see its firmware version and updates.
- **Teams:** everyone gets a personal team. Devices, calendars and GIFs belong to a team.
- **Admin:** a sign-up and usage overview for admin users.

Signed out, the home page is a landing page about bzzy. The app has no cron jobs: calendars refresh when a device polls (every 20 seconds) or a page loads. See [app/README.md](app/README.md) to run it locally.

## Where it's at

Done:

1. Breadboard prototype firmware
2. Companion app with sign-in, teams, status, device API, GIFs, show now and the live preview
3. Calendar sync from an ICS link
4. Custom LED ring board (rev C) and a black case with a frosted light border, button cap and bzzy wordmark ([hardware/](hardware/README.md))
5. Signed firmware updates over Wi-Fi from GitHub Releases ([docs/ota.md](docs/ota.md))

Next:

- **Build the first one.** Measure the Waveshare board, order the ring board from JLCPCB, get the case printed, and test it all on real hardware.

### Later

- **Logo.** Design a proper bzzy logo in the style of the current wordmark: lowercase, black, tight letter spacing (Geist semibold, `tracking-tight`, as in the app's top bar). It should work as an app icon, a favicon, and on the case.
- **Pre-built lights.** Once the custom board is proven, offer assembled and tested bzzys for people who don't want to order and solder their own. The landing page already says they're coming.
- **Landing page photos.** The signed-out home page (`app/src/components/landing.tsx`) uses a concept picture and illustrations. Swap them for photos of a real bzzy once one is built.
- **v2 board.** One custom board with the ESP32-S3, the bare screen, USB-C and the LEDs (see [hardware/](hardware/README.md#v2-full-custom-board)).

## Hardware

The target board is the **touch** version. The non-touch board and a plain ESP32 still build, for testing.

The final design is the Waveshare board inside a custom LED ring board (16 LEDs, rev C) and a printed black case with a frosted border that glows in the status colour. See [hardware/](hardware/README.md) for the board, the case and the files to order. The parts below are for the breadboard prototype.

| Part | Part number to search | Notes |
|---|---|---|
| Main board (touch) | **Waveshare ESP32-S3-Touch-LCD-1.69**, SKU **27350** | ESP32-S3R8 (8 MB PSRAM), 16 MB flash, 1.69" 240×280 ST7789V2, CST816T touch, PCF85063 RTC, QMI8658 IMU, buzzer, USB-C |
| Main board (no touch, alternative) | Waveshare ESP32-S3-LCD-1.69, SKU 27932 | Same board without touch |
| LED ring (prototype) | WS2812B 12-LED ring, 50 mm (or Adafruit NeoPixel Ring 12, #1643) | |
| Push button (optional) | Any momentary switch | To try the top button: between GPIO18 and GND |
| Resistor | 330 Ω, 1/4 W | In series on the LED data line |
| Capacitor | 470 µF, 10 V or higher, electrolytic | Across LED 5 V / GND, near the LEDs |
| RTC backup cell (optional) | Rechargeable ML1220 with an SH1.0 2-pin lead | Keeps the clock through power cuts. Without it, the clock comes back from NTP once Wi-Fi does |

**Wiring (touch board):** LED data to **GPIO17**, LED 5 V to the board's 5 V pin, GND to GND. The free pins on this board are 2, 3, 17 and 18. Avoid 3, which is a strapping pin. LED current is capped at 400 mA in firmware. The top button goes from **GPIO18** to GND (the firmware turns on the pull-up).

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

**Updates:** after the first USB flash, lights update themselves over Wi-Fi from GitHub Releases: push a tag like `fw-v0.3.0`. Updates are signed, wait until you're free or away, and roll back if the new firmware can't reach the app. See [docs/ota.md](docs/ota.md) for the one-time setup (a signing key).

**GIFs:** pick one per status on the app's Devices page (built-in or your own uploads from the GIFs page). The device downloads a GIF when it changes and keeps it in flash, so it still plays offline. Choosing "No GIF" shows a coloured card with large text.

### When things go wrong

| Situation | What it shows |
|---|---|
| Wi-Fi or app down | Last-known status and calendar, small hollow ring in the corner |
| No good data for 24 h, or clock never set | Slow grey breathing light, "?" and a note on screen |
| Power cut with no Wi-Fi | Clock comes back from the board's RTC, cached calendar keeps working |

### Not done yet

- HTTPS certificate checking is off (`setInsecure`) for the app connection. Firmware updates don't depend on it: they're checked against a signature.
- Untested on real hardware: pin numbers come from Waveshare's V2 schematic, and the board dimensions the case and ring use are estimates until someone measures one.

## License

bzzy is free to build and use, but not to sell. The software (app and firmware) is under [PolyForm Noncommercial 1.0.0](LICENSES/PolyForm-Noncommercial-1.0.0.md) and the hardware (ring board and case) under [CC BY-NC-SA 4.0](LICENSES/CC-BY-NC-SA-4.0.txt). Using a light you built at your own job is fine. See [LICENSE.md](LICENSE.md) for details, and ask if you'd like to buy one.
