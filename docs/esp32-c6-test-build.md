# Trying bzzy on the Waveshare ESP32-C6-LCD-1.47

The [Waveshare ESP32-C6-LCD-1.47](https://docs.waveshare.com/ESP32-C6-LCD-1.47) is a small, cheap board with a colour screen and one RGB LED already on it, so it runs bzzy with no wiring at all. Its screen is narrower and taller than the real light's (172x320 against 240x280), so the same screens are drawn a little differently.

The PlatformIO env is `waveshare_c6_lcd147`. It's built on every pull request and included in firmware releases, so it updates itself like any other light.

## What works

| Feature | On this board |
|---|---|
| Logo at power-on, Wi-Fi QR code setup, pairing at `/pair` | Yes, on the screen, moved down to sit in the middle of the taller screen |
| Syncing with the app every 20 s, calendar, statuses | Yes |
| Status screens and "Show now" messages | Yes. Messages wrap to the narrower width; a label too wide for the screen ("DO NOT DISTURB" under a GIF) drops to a smaller font |
| GIFs | Yes, but the app makes them 240 px wide, so 34 px are cropped off each side. There's about 640 KB for GIFs (the real light has 9 MB), so a big one may not download while others are stored |
| Ring effects, meeting warning, team pushes | Yes, on the one onboard LED: colours, pulse, blink and strobe. A "spin" pulses instead |
| Working hours (dark off-hours, a press wakes it) | Yes. The backlight turns off too |
| Button | The BOOT button works like the real light's top button: a short press steps Free → Busy → Do not disturb → automatic, and holding it for a second goes back to automatic. For the Wi-Fi setup page, press RESET, then press and hold BOOT once the logo appears, for 3 seconds. (Holding BOOT *while* plugging in or pressing RESET starts the chip's flasher instead, which is how you flash it by hand.) |
| Over-the-air updates | Yes, once you've flashed it over USB once (see [ota.md](ota.md)) |
| Keeping the time through a power cut | No (no clock chip). It gets the time from the internet each boot |
| Touch, the top button, the 16-LED ring | No: none of those are on this board |

## The board

| | |
|---|---|
| Chip | ESP32-C6FH4: one RISC-V core, Wi-Fi 6, 4 MB flash, no PSRAM |
| Screen | 1.47" ST7789, 172x320, portrait |
| LED | One WS2812-style RGB LED on GPIO8 |
| Buttons | BOOT (GPIO9) and RESET |
| USB | USB-C straight into the chip (no USB-serial chip, so no driver to install) |

Pins the firmware uses (from Waveshare's wiki, in `firmware/src/config.h`):

| GPIO | Used for |
|---|---|
| 6 | Screen MOSI (shared with the TF card slot, which bzzy doesn't use) |
| 7 | Screen SCLK (shared with the TF card slot) |
| 14 | Screen CS |
| 15 | Screen DC |
| 21 | Screen reset |
| 22 | Screen backlight |
| 8 | RGB LED |
| 9 | BOOT button |

The C6 needs version 3 of the Arduino core, which PlatformIO's own `espressif32` platform doesn't have yet, so this env uses the community [pioarduino](https://github.com/pioarduino/platform-espressif32) platform, pinned to release 55.03.35 (Arduino core 3.3.5). PlatformIO downloads it the first time you build, which takes a few minutes.

The 4 MB of flash is split into two 1.625 MB app slots (so over-the-air updates can roll back) and 640 KB for GIFs: `firmware/partitions/c6_4mb_ota.csv`.

## Flashing (Windows, PowerShell)

1. Plug the board in with a USB-C data cable. It shows up in Device Manager as a "USB Serial Device" or "USB JTAG/serial debug unit" COM port.

2. Build and flash (use your COM port):

   ```powershell
   cd bzzy\firmware
   & "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e waveshare_c6_lcd147 -t upload --upload-port COM5
   & "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" device monitor -p COM5
   ```

   The first build downloads the C6 toolchain and is slow. Later ones are quick.

3. If it can't connect, or the COM port vanishes after flashing, put it into download mode by hand: hold **BOOT**, tap **RESET**, let go of BOOT, then flash again. Press RESET once it's done. The COM port number can change between normal and download mode, so check Device Manager.

## Flashing (macOS)

1. Plug the board straight into the Mac with a USB-C data cable (a charge-only cable shows nothing at all). Allow the accessory if macOS asks. It shows up as `/dev/cu.usbmodem…`: `ls /dev/cu.usbmodem*`.

2. PlatformIO needs Python 3.13 or older for the C6's platform. With [uv](https://docs.astral.sh/uv/):

   ```sh
   uv tool install --python 3.13 platformio
   cd bzzy/firmware
   pio run -e waveshare_c6_lcd147 -t upload --upload-port /dev/cu.usbmodem101
   pio device monitor -p /dev/cu.usbmodem101
   ```

3. Same as Windows if it can't connect: hold **BOOT**, tap **RESET**, let go of BOOT, then flash again.

## Setting it up

Same as the real light: the screen shows a QR code for its `bzzy-XXXX` Wi-Fi, then one for the setup page, then the pairing code for [bzzy.ca/pair](https://bzzy.ca/pair). The LED breathes white while it waits, glows bronze while it shows the code, and flashes green twice when it's done.

## Things to check (it's the first board on the C6)

- **The LED's colours.** Free should be green and Busy red. The onboard LED is RGB order, not GRB like the ring (`BZZY_LED_ORDER` in `config.h`); on the first board we tried, GRB swapped red and green.
- **The screen's edges.** If there's a stripe of noise down one side or everything is shifted, the 34 px column offset is off.
- **Over-the-air rollback.** Arduino core 3 is new to bzzy. After the first update over the air, check the light says the new version in the app's Devices page.
- Everything in [Things to try](esp32-test-build.md#things-to-try) for the classic ESP32 build.
