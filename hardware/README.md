# bzzy hardware

The final device is a frame of light around the screen. It has four parts:

1. The **Waveshare ESP32-S3-Touch-LCD-1.69**, the brains and the screen. It's unchanged from the prototype.
2. A custom **LED ring board** with 16 small RGB LEDs. It sits around the Waveshare board.
3. A printed **frosted white border**, about 1 cm wide, round the screen. The LEDs light it in the status colour.
4. A printed **black case** round all of it, with a button on top, the bzzy wordmark, and a monitor clip.

Nothing changes in the firmware. The ring board uses the same data pin (GPIO17) and LED count (16) that `firmware/src/config.h` already has.

This is **rev B, a concept**. Rev B adds a button on top of the device. The board has been through KiCad's design-rule check, but nobody has built one yet. Measure the Waveshare board before you order anything (see [Before you order](#before-you-order)).

| Front | Busy (lit red) | Top: button and wordmark |
|---|---|---|
| ![front](img/case-front.png) | ![busy](img/case-busy.png) | ![top](img/case-top.png) |
| **Back, with the clip** | **Exploded** | |
| ![back](img/case-back.png) | ![exploded](img/case-exploded.png) | |

## Plan

- **Now (rev B):** an LED ring board around the Waveshare board, with a button on top, plus a printed case. It's cheap and quick to get made.
- **v2 (later):** one custom board with the ESP32-S3, the bare screen, USB-C and the LEDs. See [v2: full custom board](#v2-full-custom-board).

## How it fits together

```mermaid
flowchart LR
  USB[USB-C 5 V] --> WS[Waveshare ESP32-S3<br/>screen, touch, RTC]
  WS -- "5V, GND, GPIO17<br/>(3 wires)" --> J1[J1 wire pads]
  J2[J2 wire pad] -- "GPIO18<br/>(1 wire)" --> WS
  subgraph ring [LED ring board]
    J1 --> U1[74AHCT1G125<br/>3.3 V to 5 V data]
    U1 --> R2[33 Ω] --> D1[D1] --> D2[D2 ... D15] --> D16[D16] --> TP1[TP1: to add more LEDs]
    SW1[SW1 top button<br/>to GND] --> J2
  end
```

## LED ring board

Files are in [led-ring/](led-ring/). Open `bzzy-led-ring.kicad_pro` in KiCad 7 or later.

| | |
|---|---|
| Size | 52 × 61 mm, 2 layers, 1.6 mm. The 34.2 × 42.7 mm cutout fits the Waveshare board |
| LEDs | 16 × WS2812B-2020 (2 × 2 mm), every 10 to 12 mm, chained clockwise from the bottom middle |
| Data | GPIO17 (3.3 V), then a 74AHCT1G125 buffer to 5 V logic, then 33 Ω to the first LED. A 100 kΩ pull-down keeps the LEDs dark while the ESP32 boots |
| Power | 5 V from the Waveshare board's 5V pad. A 0.8 mm power ring on the back, a 100 nF cap per LED, and 2 × 10 µF bulk caps. Firmware caps the LEDs at 400 mA |
| Connection | J1 is three plated holes at the bottom (5V, IO17, GND, labelled on the back). J2 is one pad on the back at the top (IO18). Solder four short wires to the Waveshare board's 5V, GND, GPIO17 and GPIO18 pads |
| Top button | SW1, an Alps SKRT side-push switch on the top edge, with its plunger pointing up. You press it through a black button cap in the case's top wall. It shorts GPIO18 to GND, and the firmware turns on the internal pull-up |
| Mounting | 4 × M2 holes in the corners. The screws go through the case's back plate and the ring board into the light ring |
| Assembly | Every part is on the front, so JLCPCB assembles one side only. You hand-solder the J1 and J2 wires |

![schematic](img/schematic.svg)

| Front (LEDs) | Back (+5V ring, GND pour) |
|---|---|
| ![pcb front](img/pcb-front.svg) | ![pcb back](img/pcb-back.svg) |

### How it's made

[`led-ring/gen_led_ring.py`](led-ring/gen_led_ring.py) is the source of truth. It writes these files:

- the KiCad schematic, with connectivity checked against the script's netlist
- the PCB, with parts placed, traces routed and ground poured
- `fab/bom-jlcpcb.csv` and `fab/cpl-jlcpcb.csv`, for JLCPCB assembly
- `fab/drc-report.txt`. Rev B: **0 violations, 0 unconnected pads**. The switch's own land pattern puts its pads closer to its peg holes than the board rule allows, so `bzzy-led-ring.kicad_dru` allows that within SW1 only
- `case/board_dims.scad`, so the case always matches the board

The ring is regular, so the script routes it by rule instead of with an autorouter. Each LED's 5 V pad drops through a via onto the power ring. Its ground pad joins the ground pour. Its data out runs straight to the next LED, and the corners go round the screen side of the mounting holes.

To change something, edit the script and run `./render.sh` (needs KiCad 7+ and OpenSCAD). Once the design settles, you can stop using the script and edit the board directly in KiCad.

### Bill of materials (per board)

| Ref | Qty | Part | Package | Notes |
|---|---|---|---|---|
| D1 to D16 | 16 | WS2812B-2020 | 2020 | Addressable RGB LED |
| U1 | 1 | 74AHCT1G125 | SOT-23-5 | Level shifter. A 74HCT1G125 works too |
| C1, C4 to C19 | 17 | 100 nF, X7R, 16 V | 0402 | |
| C2, C3 | 2 | 10 µF, X5R, 10 V+ | 0805 | |
| R1 | 1 | 100 kΩ | 0402 | |
| R2 | 1 | 33 Ω | 0402 | |
| SW1 | 1 | Alps SKRTLAE010 | SMD side-push | Top button |
| J1 | – | 3 plated holes, 2.54 mm | – | Wires, hand-soldered |
| J2 | – | 1.5 mm pad on the back | – | Wire to GPIO18, hand-soldered |
| Screws | 4 | M2 × 8 self-tapping (or M2 × 8 with heat-set inserts in the light ring) | | |

The MPNs in `fab/bom-jlcpcb.csv` are suggestions. The LCSC part number column is blank on purpose. Fill it in from JLCPCB's parts search when you order, and use Basic parts where you can, since each Extended part adds a small fee. The WS2812B-2020 and the 74AHCT1G125 will probably be Extended.

**Rough cost:** about US$30 to $50 for 5 assembled boards before shipping and duty. That's an estimate, not a quote.

## Case

[`case/bzzy_case.scad`](case/bzzy_case.scad) is parametric OpenSCAD. The case is black, with the screen in the middle of a frosted white border about 1 cm wide (9.2 mm at the sides, 9.5 mm top and bottom). The LEDs sit under the border. Overall it's about 58 × 67 × 15 mm, plus the clip.

Looking at the front, from the middle out: the screen, a thin black trim over the Waveshare board's own glass edge, the frosted border, then a 1.4 mm black rim. The border starts at the Waveshare board's edge, not at the lit screen, because no LED can sit under the board. The ring board didn't need to change for this.

Export a part with:

```sh
openscad -D 'PART="light"' -o light.stl case/bzzy_case.scad   # or frame, back, trim, button, clip
```

`./render.sh` exports all six to `case/stl/`, each already turned the way it prints best. They aren't committed until the measurements are confirmed.

| Part | Colour and material | Notes |
|---|---|---|
| light | **Frosted white.** Translucent white PETG, or clear or white resin (SLA) with a matte finish | The glowing border. 1.6 mm thick at the front, about 2.4 mm in front of the LEDs. Its outer lip sits over the frame's rim, and four bosses take the screws. Print it face down |
| frame | **Black.** PLA, PETG, or MJF nylon (PA12, dyed black) | Front rim and the four side walls, with the USB-C opening and BOOT pinhole on the bottom, and the button hole and wordmark on top. Print it face down |
| back | **Black** | Back plate. Four posts press the ring board forward and the screws go through them. Dovetail rail for the clip |
| trim | **Black** | Sleeve round the Waveshare board, with the thin trim round the screen. Keeps LED light off the display. The light ring holds it down |
| button | **Black** | Cap for the top button. Sits in a pocket in the frame's top wall, held in by its flange. Print it flange down |
| clip | **Black.** PETG or nylon (needs some flex) | Slides up the rail. Two legs rest on the monitor's top edge, with a lip at the front and a drop at the back. Set `MONITOR_T` to your monitor's thickness |

**For a print service** (JLC3DP, Craftcloud, a local shop): order `light.stl` in translucent or white resin, and the other five in black. MJF nylon in black is tough and has no visible layers, which suits the frame and clip. Resin is fine for the light ring, but ask for the "translucent" or "semi-transparent" option with a matte or sanded finish, so the LEDs don't show as dots. None of the parts need supports in the orientation they're exported in, except the back plate, which stands on its rail. Ask the service to orient it, or use MJF or resin, where it doesn't matter.

### How it goes together

1. Put the button cap into its pocket in the frame's top wall, from the inside.
2. Hold the frame face up and drop the light ring in from the front, so its lip sits on the frame's rim. Turn the two over together, face down on the table.
3. Put the trim in from the back, face down, through the light ring's middle.
4. Put the ring board, LEDs down, onto the light ring's bosses, then the Waveshare board into the trim. The button cap now rests just off the switch.
5. Put a square of 3 mm foam tape on the back of the Waveshare board, then put the back plate on and do up the four M2 screws. They pull the light ring back, and its lip clamps the frame's rim against the back plate. No glue.
6. Slide the clip up the rail.

### The top button

The switch only travels 0.2 mm, and its plunger tip sits on the board's routed edge, which is only accurate to about ± 0.2 mm. So the cap rests 0.1 mm off the plunger and can float 0.5 mm outwards. A board that comes back slightly large pushes the cap out a little, instead of holding the switch down. If the switch were held down, the device would boot into setup every time. `TOP_BTN_Z` is the plunger's height above the board (0.8 mm for the Alps SKRT). Check it against the switch once you have one.

### The wordmark

"bzzy" is debossed 0.6 mm into the top face, right of the button, in Geist SemiBold, the font the app uses, with tight tracking. The font is in `case/fonts/` (SIL Open Font License). Set `LOGO` to move it:

| `LOGO` | Where |
|---|---|
| `"top"` (default) | Top face, right of the button. People standing at your desk see it |
| `"chin"` | Front, in a 9 mm black chin below the border. The device gets taller and the screen sits above centre |
| `"back"` | Back plate, above the clip rail. Hidden when the device is on the monitor |
| `"none"` | No wordmark |

## Before you order

Waveshare only publishes the board's outline as a drawing, which I couldn't read from here, so a few numbers are **estimates**. With calipers, measure:

1. **The Waveshare board's width, height and total thickness** (`WS_W`, `WS_H`, `WS_T` in `gen_led_ring.py`). The cutout and case follow from these. I used 33.0 × 41.5 × 9.5 mm.
2. **Where the screen sits**: the visible area's size, and whether it's centred on the board (`SCREEN_*`, `SCREEN_DY` in the case).
3. **The glass height**: when the Waveshare board sits in the ring's cutout, how far its glass stands proud of the ring board's front face (`GLASS_Z`).
4. **USB-C and BOOT button positions** (`USB_*`, `BOOT_*`). I assumed the USB-C socket is on the bottom edge, in the middle. Also check that the USB-C plug's moulding can pass behind the ring board's bottom edge to reach the socket. If it can't, the ring board needs a notch there.
5. **Your monitor's top edge thickness** (`MONITOR_T`).

Then print the frame, light ring and back once in cheap PLA to check the fit before ordering boards.

## Ordering from JLCPCB

1. Run `./render.sh`, which writes `led-ring/fab/gerbers.zip`. Or, in KiCad, export Gerbers and drill files (File, Fabrication Outputs) with JLCPCB's KiCad settings, and zip the folder.
2. Upload the zip at jlcpcb.com. Defaults are fine: 2 layers, 1.6 mm, HASL lead-free or ENIG, any colour. Black or white looks best behind a translucent frame.
3. Turn on **PCB Assembly**, top side, and upload `fab/bom-jlcpcb.csv` and `fab/cpl-jlcpcb.csv`.
4. In the parts-matching step, pick an LCSC part for each line. In the placement preview, **check every LED's orientation**: the pin 1 dot should match the KiCad drawing. Fix any rotation in the preview if needed.

## v2: full custom board

These are notes for later, once the ring board has proven the case and the light.

- **MCU:** an ESP32-S3-WROOM-1-N16R8 module. It has the same 16 MB flash and 8 MB PSRAM as the Waveshare board, plus a certified antenna. Keep the module's antenna end at the top edge, with no copper or LEDs under it.
- **Screen:** the bare 1.69" 240 × 280 ST7789V2 panel with CST816T touch on an FPC connector. Waveshare sells the panel separately as the "1.69inch Touch LCD Module". Find the panel's FPC pinout before laying out.
- **Pins:** keep the Waveshare mapping (LCD 4 to 8 and 15, I2C 10 and 11, touch 13 and 14, LEDs 17, top button 18, BOOT 0). The firmware then only needs a new PlatformIO env, or none at all.
- **Power:** USB-C into the S3's native USB (GPIO19 and 20), with 5.1 kΩ CC resistors, ESD protection and a fuse. A 3.3 V LDO rated 1 A for the S3's Wi-Fi peaks, and the LEDs straight off 5 V.
- **Keep:** PCF85063 RTC with a coin cell or supercap, and the BOOT and RESET buttons.
- **Drop:** the IMU, buzzer and Li-ion charger, unless there's a reason to keep them.
- **Result:** one board, roughly the ring board's size. That makes the case thinner and the build simpler, with no wires between boards.

## Open questions

- Are 16 LEDs enough? Firmware handles more, and TP1 lets you chain extras.
