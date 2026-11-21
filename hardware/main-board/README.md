# bzzy main board, rev A

The custom board that built bzzys will be sold on: an ESP32-S3-WROOM-1U-N16R8 module with a stuck-on antenna, the ER-TFT1.69-4 touch screen on an FPC connector, USB-C, a clock with a supercap, and the 16-LED ring with the top button. Why and how: [docs/hardware/main-board.md](../../docs/hardware/main-board.md).

> **Schematic only.** Nothing here has been laid out, ordered or built. The layout waits until a real panel's ribbon has been folded and measured.

| File | What it is |
|---|---|
| [`bzzy-main-board.pdf`](bzzy-main-board.pdf) | The schematic, to read |
| `bzzy-main-board.kicad_sch` | The same, for KiCad 7+ |
| [`bom.csv`](bom.csv) | Parts list, grouped, with MPN, LCSC numbers and notes |
| [`bom-jlcpcb.csv`](bom-jlcpcb.csv) | The same for JLCPCB's BOM upload: fitted, on-board parts only |
| `gen_main_board.py` | **The source.** Writes the schematic and BOM |
| `placement.py` / `.png` / `.svg` | The earlier placement study (spec section 7.2) |

Regenerate after editing the script (needs KiCad 7's symbol library at `/usr/share/kicad/symbols`):

```sh
python3 gen_main_board.py
kicad-cli sch export pdf -o bzzy-main-board.pdf bzzy-main-board.kicad_sch
```

The schematic is drawn as blocks joined by net labels, so the netlist is exactly the `pins` maps in the script. As with the ring board, edit the script, not the schematic, until the design settles.

## Blocks

1. **USB-C and power.** HRO TYPE-C-31-M-12 receptacle, 5.1 kΩ on each CC pin, USBLC6-2SC6 ESD array (with 100 nF on its VBUS pin), 750 mA polyfuse, 5 V TVS, a 100 Ω ferrite bead, then an AMS1117-3.3 with 22 µF in and out. The LEDs run off the fused 5 V rail.
2. **ESP32-S3 module.** WROOM-1U-N16R8 (same memory as the Waveshare, so the firmware partitions don't change). EN has 10 kΩ + 1 µF (Espressif's reset delay) and a RESET switch; GPIO0 has 10 kΩ and a BOOT switch. Both switches go on the back behind pinholes. Test pads: TXD0 and RXD0 (where bootloader errors print, as the DevKit clone showed), GPIO1, GPIO2 and the rails.
3. **Screen.** 18-pin 0.5 mm FPC (J3) with the ER-TFT1.69-4 pinout from the East Rising datasheet. 22 Ω on the SPI clock. The panel's VCC is both its logic supply and the backlight anode, so Q1 (AO3400A) switches the backlight cathode K through R6, with PWM on GPIO15 (not inverted, like the Waveshare). I2C pull-ups for the touch chip and clock.
4. **Clock.** PCF85063A (same chip and driver as the Waveshare) with a 32.768 kHz crystal. It runs from VRTC: 3.3 V through a Schottky while plugged in, a 0.22 F supercap through 1 kΩ when not. Its interrupt goes to GPIO21 in case alarms are wanted later.
5. **LED ring and button.** As the ring board rev D: 74AHCT1G125 level shifter on GPIO17, 10 kΩ pull-down, 33 Ω into the first LED, 16 WS2812B-2020 each with 100 nF, 2 × 10 µF bulk, a test pad on the last LED's output. Top button (Alps SKRT side-push) to GPIO18 through 1 kΩ. Buzzer footprint on GPIO16, not fitted.

### Pin map

Same as the Waveshare and the `s3_devkit_tft169` bench build, so the firmware for this board is a new config block.

| GPIO | Use | GPIO | Use |
|---|---|---|---|
| 4 | LCD DC | 13 | Touch RST |
| 5 | LCD CS | 14 | Touch INT |
| 6 | LCD SCLK (through R5) | 15 | Backlight PWM |
| 7 | LCD MOSI | 16 | Buzzer (not fitted) |
| 8 | LCD RST | 17 | LED data |
| 10 | I2C SCL | 18 | Top button |
| 11 | I2C SDA | 19 / 20 | USB D- / D+ |
| 0 | BOOT | 21 | Clock interrupt |
| 1, 2, TXD0, RXD0 | Test pads | 35 to 37 | Used by the PSRAM inside the module |

## Before layout: still to check

- **LCSC numbers.** 25 were matched by JLCPCB's BOM tool on 2026-11-21 (no "(check)" in `bom.csv`). Still to pick: the polyfuse (JLC's tool suggested a glass fuse, which is wrong), R6 (moved to 0603, since JLC has no 4.7 Ω 0402; needs a re-match), the supercap, the FPC connector, and a check of C318884 for the BOOT/RESET switches. The PCF85063ATL (C404360) is out of stock at JLC: pre-order (MOQ 15) or switch package. Upload `bom-jlcpcb.csv` to JLC: it has only the fitted, on-board parts in JLC's columns.
- **FPC contact side.** J3 uses the Hirose FH12 footprint as a placeholder. Which side the contacts face, and so the connector, depends on how the tail folds behind the screen: test-fold a real panel first.
- **Backlight current.** R6 = 4.7 Ω gives about 60 mA at the datasheet's 3.0 V forward voltage, but it's sensitive to the real forward voltage. Measure on the bench with the panel samples.
- **Supercap footprint.** C9's footprint is a 6.3 mm placeholder for an Elna DSK-series 0.22 F part. Pick the real part and its footprint at layout. Hold time is a few days if leakage is as the datasheet says.
- **Crystal load.** The FC-135 is a 12.5 pF crystal, so the firmware must set the PCF85063's CAP_SEL bit (the Waveshare driver may assume 7 pF).
- **USB inrush.** There's about 45 µF on the 5 V side in total (LDO and LED caps). USB 2.0 asks for 10 µF or less at plug-in. Most devices exceed it and it's not part of ICES-003, so it's left as is; a soft-start isn't worth it for rev A.

## Review

Run through the kicad-happy schematic analyzer on 2026-11-21, with no datasheets synced. The netlist matches the script's intent pin for pin.

- **Flagged, not a problem:** "LED_DATA_3V3 crosses 3.3 V / 5 V without a level shifter". It does go through U5, the level shifter; the analyzer sees U5's 5 V supply on the same part. "No decoupling on VBUS at J1": C29 sits at U3, a few mm away, and the 5 V caps follow the fuse.
- **Fixed from the review:** added C29 (100 nF on U3's VBUS pin, as the USBLC6 datasheet shows).
- **Accepted:** the CC pins have no ESD diodes (common on USB 2.0 devices; the 5.1 kΩ resistors take the hit), and J3's lines have none (they never leave the case).
- **Not done yet:** pin-by-pin checks against the PDF datasheets (module, PCF85063, USBLC6, AO3400A, panel). The module, LDO, MOSFET, level shifter and USBLC6 pinouts match their datasheets as I know them; the PCF85063ATL's DFN pinout comes from KiCad's library and needs checking against NXP's datasheet.
