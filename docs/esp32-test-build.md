# Trying bzzy on a plain ESP32

You don't need the Waveshare board to try bzzy. Any classic ESP32 dev board (ESP32-WROOM-32D or 32E, the cheap kind with a CP2102 or CH340 USB chip), a 16x2 character LCD, a strip of WS2812B LEDs and a push button run the same firmware as the real light, minus the colour screen.

The PlatformIO env is `esp32_lcd1602`. It's built on every pull request and included in firmware releases, so a light like this updates itself like any other.

## What works

| Feature | On this build |
|---|---|
| Setup: the `bzzy-XXXX` Wi-Fi, picking your network, pairing at `/pair` | Yes. The LCD shows the Wi-Fi name and the pairing code as text instead of QR codes |
| Syncing with the app every 20 s, calendar, statuses | Yes |
| Status and "Show now" text | Yes, on the LCD. Long text scrolls |
| Ring effects, meeting warning, team pushes | Yes, on the LED strip |
| Working hours (dark off-hours, a press wakes it) | Yes. The LCD's text turns off, but its backlight stays lit (it's wired straight to 5 V) |
| Button: next status, hold for automatic, hold at power-on for Wi-Fi setup | Yes |
| Over-the-air updates | Yes, once you've flashed it over USB once (see [ota.md](ota.md)) |
| GIFs | No: it never downloads them, and "Show now" with a GIF shows just its message |
| Keeping the time through a power cut | No (no clock chip). It gets the time from the internet each boot |

## Parts

| Part | Notes |
|---|---|
| ESP32 dev board | ESP32-WROOM-32D/32E. Not the S2, S3 or C3 (those are different chips) |
| 16x2 LCD, HD44780 | The 16-pin parallel kind. One with an I2C backpack works too if you take the backpack off, or ask for an I2C version of this build |
| 10 kΩ potentiometer | For the LCD's contrast. A 1 kΩ to 2.2 kΩ resistor to GND works if you don't have one |
| WS2812B LEDs | A strip, ring or a few loose pixels. 5 V ones |
| 330 Ω resistor | In series with the LED data line |
| 470 µF capacitor, 10 V or more | Across the LED strip's 5 V and GND, near the strip |
| Push button (optional) | Any momentary switch. The board's BOOT button also steps the status |
| Breadboard and jumper wires | And header pins soldered onto the LCD |

## Wiring

"5V" is the dev board's 5V (or VIN) pin, which comes straight from USB.

### LCD (16 pins, numbered from the end with pin 1 marked)

| LCD pin | Name | Goes to |
|---|---|---|
| 1 | VSS | GND |
| 2 | VDD | 5V |
| 3 | V0 (contrast) | Middle leg of the 10 kΩ pot. Its outer legs go to 5V and GND |
| 4 | RS | **GPIO19** |
| 5 | RW | **GND** (important, see below) |
| 6 | E | **GPIO23** |
| 7 to 10 | D0 to D3 | Nothing (4-bit mode) |
| 11 | D4 | **GPIO18** |
| 12 | D5 | **GPIO17** |
| 13 | D6 | **GPIO16** |
| 14 | D7 | **GPIO4** |
| 15 | A (backlight +) | 5V. Most modules have a backlight resistor on the back (often marked R8 or 101/151). If yours has none, put 100 to 220 Ω in series |
| 16 | K (backlight -) | GND |

The LCD runs on 5 V while the ESP32 talks 3.3 V. That's fine here because the firmware only ever writes to the LCD, and the LCD reads anything above about 2.2 V as a 1. Tie **RW to GND** so the LCD never drives 5 V back into the ESP32. Never wire RW to a GPIO.

Some newer LCDs are 3.3 V-only (the back says so, or the backlight is very dim at 3.3 V). Those go on the 3V3 pin instead of 5V.

### LED strip

| Strip | Goes to |
|---|---|
| 5V (+5V, VCC) | 5V |
| GND | GND |
| DIN (data in, the end with the arrow pointing away) | 330 Ω resistor, then **GPIO13** |

Put the 470 µF capacitor across 5V and GND at the strip (the stripe on the can is minus).

The firmware drives **12 LEDs** (a common prototype ring) and caps their current at 400 mA, which is safe on a laptop USB port. If your strip has a different count, change `-DBZZY_LED_COUNT=12` in `firmware/platformio.ini` (env `esp32_lcd1602`) before flashing. Extra LEDs past that number just stay dark. Over-the-air updates are built with 12, so a custom count goes back to 12 after an update.

WS2812B at 5 V officially wants a 3.5 V data signal and the ESP32 gives 3.3 V. It almost always works with short wires. If the first LED flickers or shows the wrong colours, any one of these fixes it:

- a level shifter (74AHCT125 or 74AHCT1G125, the same one the real ring board uses), or
- feed the strip's 5V through a diode (1N5817 or 1N4148), which drops it to about 4.5 V so 3.3 V counts as high.

### Button

One leg to **GPIO27**, the other to GND. No resistor needed (the firmware turns on the pull-up). It works like the real light's top button: a short press steps Free → Busy → Do not disturb → automatic, holding for one second goes straight back to automatic, and holding it for 3 seconds while plugging in opens the Wi-Fi setup page. BOOT steps the status too.

### All the pins at once

| GPIO | Used for |
|---|---|
| 4 | LCD D7 |
| 13 | LED data |
| 16 | LCD D6 |
| 17 | LCD D5 |
| 18 | LCD D4 |
| 19 | LCD RS |
| 23 | LCD E |
| 27 | Button |
| 0 | BOOT button (already on the board) |

These stay clear of the flash pins (6 to 11), the strapping pins (0, 2, 5, 12, 15) and the input-only pins (34 to 39). On an ESP32-WROVER board GPIO16 and 17 are taken by PSRAM, so move D5 and D6 elsewhere in `firmware/src/config.h`.

### Adafruit HUZZAH32 (ESP32 Feather)

Every pin above is on the Feather's headers (16 and 17 are labelled RX and TX, 18 MOSI, 19 MISO, 23 SDA, 4 A5). Use the **USB** pin wherever this guide says 5V. GPIO13 also lights the small red LED on the board, which is harmless. The Feather has no BOOT button, so the button on GPIO27 is the only way to change the status by hand. The orange charge light flickers whenever no battery is plugged in. That's normal.

## Flashing (Windows, PowerShell)

1. Install Python if you don't have it (`py` not recognised means you don't), then **close and reopen PowerShell**, then install PlatformIO:

   ```powershell
   winget install -e --id Python.Python.3.12
   # reopen PowerShell here
   py -m pip install --user platformio
   ```

   If `py` still isn't found, use `python` in its place.

   (Or install VS Code with the PlatformIO extension and use its terminal.)

2. Plug the ESP32 in. If Windows doesn't give it a COM port in Device Manager, install the driver for its USB chip: CP210x (Silicon Labs) or CH340 (WCH). The chip's name is printed on it, next to the USB socket.

3. Build and flash:

   ```powershell
   cd bzzy\firmware
   py -m platformio run -e esp32_lcd1602 -t upload
   py -m platformio device monitor
   ```

   If it stops at `Connecting....`, hold BOOT until it starts writing. With more than one COM port, add `--upload-port COM5` (your port). On `Invalid head of packet`, close anything else using the port (an ESPHome dashboard, a serial monitor), plug in directly rather than through a hub, and try `upload_speed = 115200` under `[env:esp32_lcd1602]`.

4. Turn the contrast pot until you see the text. Blank with the backlight on, or a row of solid blocks, both mean the contrast is off.

## Setting it up

The LCD walks you through it, like the real light's screen:

1. `Join this Wi-Fi` / `Wi-Fi: bzzy-3F2A`. Join that open network on your phone.
2. `Pick your Wi-Fi`. The setup page usually opens by itself. If not, go to `192.168.4.1`. Choose your network and type its password.
3. `Code K7Q-F2M` / `bzzy.ca/pair`. Go to [bzzy.ca/pair](https://bzzy.ca/pair) on any device, sign in, type the code, name the light and pick a team.
4. `All set` and two green flashes on the strip.

After that the top row shows the status (`BUSY til 3:30pm`) and the bottom row the event or your custom text. A small Wi-Fi mark in the top right corner means it can't reach the app right now. It keeps following your calendar from its saved copy until it can.

## Things to try

- Change your status in the app: the strip and LCD follow within 20 seconds.
- Press the button: the app shows the change on its next refresh.
- Send a "Show now" message, with and without a ring effect.
- Set working hours that end in a few minutes: the light goes dark, and a press wakes it for 5 minutes.
- Unplug your router (or move out of range): the Wi-Fi mark appears, and the status keeps going.
- Send a team push from another account.
