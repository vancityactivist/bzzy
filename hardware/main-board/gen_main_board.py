#!/usr/bin/env python3
"""Generate the bzzy main board (rev A) schematic and its BOM.

One merged board: ESP32-S3-WROOM-1U-N16R8 + u.FL antenna, the ER-TFT1.69-4 screen on
an 18-pin FPC connector, USB-C power, PCF85063 clock with a supercap, and the 16-LED
ring with the top button. Spec: docs/hardware/main-board.md.

Run it from this folder (plain Python 3, KiCad 7's symbol library installed):

    python3 gen_main_board.py

It overwrites bzzy-main-board.kicad_sch and the BOM files, so make changes here rather
than in KiCad. The PCB layout comes later (it waits for a real panel's ribbon fold test).

The schematic is drawn as blocks joined by net labels: every pin gets a short wire and
a label (or a power symbol), so the netlist is exactly the `pins` maps below.
"""
import csv
import math
import os
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "led-ring"))
sys.dont_write_bytecode = True
import sexp  # noqa: E402
from sexp import Q  # noqa: E402

NAME = "bzzy-main-board"
REV = "A"
KICAD_SYM = "/usr/share/kicad/symbols"

GND, P5, P3, VBUS = "GND", "+5V", "+3V3", "VBUS"
POWER = (GND, P5, P3, VBUS)
NC = None          # pin left unconnected on purpose (gets a no-connect flag)
G = 2.54           # schematic grid, mm

R0402 = "Resistor_SMD:R_0402_1005Metric"
C0402 = "Capacitor_SMD:C_0402_1005Metric"
C0805 = "Capacitor_SMD:C_0805_2012Metric"

parts = []


def part(ref, sym, value, fp, pins, at, mpn="", lcsc="", note="", dnp=False, board=True):
    """at = (x, y) in grid units on the sheet."""
    parts.append(dict(ref=ref, sym=sym, value=value, fp=fp, pins=pins, at=(at[0] * G, at[1] * G),
                      mpn=mpn, lcsc=lcsc, note=note, dnp=dnp, board=board))


def R(ref, value, a, b, at, mpn, lcsc="", note="", dnp=False):
    part(ref, "Device:R_Small", value, R0402, {"1": a, "2": b}, at, mpn, lcsc, note, dnp)


def C(ref, value, a, b, at, mpn, lcsc="", note="", fp=C0402):
    part(ref, "Device:C_Small", value, fp, {"1": a, "2": b}, at, mpn, lcsc, note)


# LCSC numbers: the ones in CONFIRMED were matched by JLCPCB's BOM tool on 2026-11-21
# (Adam ran bom.csv through it). Any other number is from memory and says "(check)".
CONFIRMED = {"C1015", "C110293", "C11702", "C1525", "C15850", "C165948", "C19077497", "C20917", "C25076",
             "C25092", "C25105", "C25741", "C25744", "C25900", "C25905", "C3013946", "C32346", "C45783",
             "C52917434", "C52923", "C6186", "C20987", "C23164", "C318884", "C7484", "C7502694", "C7519", "C404360"}
R10K = ("0402WGF1002TCE", "C25744")
R1K = ("0402WGF1001TCE", "C11702")
R4K7 = ("0402WGF4701TCE", "C25900")
R5K1 = ("0402WGF5101TCE", "C25905")
R100K = ("0402WGF1003TCE", "C25741")
C100N = ("CL05B104KO5NNNC", "C1525")
C1U = ("CL05A105KA5NQNC", "C52923")
C10U = ("CL21A106KAYNNNE", "C15850")
C22U = ("CL21A226MAQNNNE", "C45783")

# ---------------------------------------------------------------- 1. USB-C and power
# Block origin: top left.
part("J1", "Connector:USB_C_Receptacle_USB2.0_16P", "USB-C", "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12",
     {"A4": VBUS, "A9": VBUS, "B4": VBUS, "B9": VBUS, "A1": GND, "B1": GND, "A12": GND, "B12": GND,
      "A5": "CC1", "B5": "CC2", "A6": "USB_DP", "B6": "USB_DP", "A7": "USB_DN", "B7": "USB_DN",
      "A8": NC, "B8": NC, "S1": GND},
     (16, 26), "TYPE-C-31-M-12", "C165948", "USB 2.0 Type-C receptacle, 16 pin, at the bottom edge")
R("R1", "5.1k", "CC1", GND, (32, 26), *R5K1, note="CC1 pull-down: C-to-C cables give 5 V")
R("R2", "5.1k", "CC2", GND, (38, 26), *R5K1, note="CC2 pull-down")
part("U3", "Power_Protection:USBLC6-2SC6", "USBLC6-2SC6", "Package_TO_SOT_SMD:SOT-23-6",
     {"1": "USB_DP", "6": "USB_DP", "3": "USB_DN", "4": "USB_DN", "5": VBUS, "2": GND},
     (52, 26), "USBLC6-2SC6", "C7519", "USB ESD array, right at J1")
C("C29", "100nF", VBUS, GND, (62, 28), *C100N, note="VBUS decoupling at U3, as its datasheet asks")
part("F1", "Device:Polyfuse_Small", "PTC 0.75A 1206", "Fuse:Fuse_1206_3216Metric", {"1": VBUS, "2": P5},
     (66, 24), "SMD1206P075TF", "C20987", "Resettable PTC (polyfuse), 1206, 750 mA hold (RUILON; picked by Adam at JLC 2026-11-21). Not 350 mA (C20985, too small). NOT a glass fuse: JLC's tool suggested C3166845 (0251.750MAT1L), which is wrong")
part("D17", "Device:D_TVS", "SMF5.0A", "Diode_SMD:D_SOD-123F", {"1": P5, "2": GND},
     (74, 28), "SMF5.0A", "C19077497", "5 V TVS on the fused rail")
part("FB1", "Device:FerriteBead_Small", "100R@100MHz", "Inductor_SMD:L_0805_2012Metric", {"1": P5, "2": "5V_LDO"},
     (82, 24), "GZ2012D101TF", "C1015", "Keeps 3.3 V regulator noise off the 5 V rail (emissions)")
C("C1", "22uF", "5V_LDO", GND, (90, 28), *C22U, note="LDO input", fp=C0805)
part("U2", "Regulator_Linear:AMS1117-3.3", "AMS1117-3.3", "Package_TO_SOT_SMD:SOT-223-3_TabPin2",
     {"3": "5V_LDO", "2": P3, "1": GND}, (100, 26), "AMS1117-3.3", "C6186", "3.3 V LDO, 1 A")
C("C2", "22uF", P3, GND, (110, 28), *C22U, note="LDO output", fp=C0805)

# ---------------------------------------------------------------- 2. ESP32-S3 module
MOD = {
    "1": GND, "40": GND, "41": GND, "2": P3, "3": "EN",
    "4": "LCD_DC", "5": "LCD_CS", "6": "LCD_SCK_MCU", "7": "LCD_MOSI", "12": "LCD_RST", "8": "LCD_BL",
    "18": "I2C_SCL", "19": "I2C_SDA", "22": "TP_INT", "21": "TP_RST",
    "10": "LED_DATA_3V3", "11": "IO18", "23": "RTC_INT", "9": "BUZZER",
    "13": "USB_DN", "14": "USB_DP", "27": "IO0",
    "37": "TXD0", "36": "RXD0", "39": "IO1", "38": "IO2",
    # Unused. GPIO35-37 belong to the octal PSRAM; 3, 45 and 46 are strapping pins left
    # at their defaults.
    "15": NC, "16": NC, "17": NC, "20": NC, "24": NC, "25": NC, "26": NC,
    "28": NC, "29": NC, "30": NC, "31": NC, "32": NC, "33": NC, "34": NC, "35": NC,
}
part("U1", "RF_Module:ESP32-S3-WROOM-1", "ESP32-S3-WROOM-1U-N16R8", "RF_Module:ESP32-S3-WROOM-1U", MOD,
     (30, 72), "ESP32-S3-WROOM-1U-N16R8", "C3013946", "Pre-certified module (IC 21098-ESPS3WROOMU), u.FL antenna socket")
C("C3", "10uF", P3, GND, (54, 54), *C10U, note="Module 3V3, at pin 2", fp=C0805)
C("C4", "100nF", P3, GND, (60, 54), *C100N, note="Module 3V3, at pin 2")
R("R3", "10k", P3, "EN", (54, 66), *R10K, note="EN pull-up (RC reset delay with C5)")
C("C5", "1uF", "EN", GND, (60, 66), *C1U, note="EN delay")
part("SW2", "Switch:SW_Push", "RESET", "Button_Switch_SMD:SW_Push_1P1T_XKB_TS-1187A", {"1": "EN", "2": GND},
     (70, 66), "TS-1187A-B-A-B", "C318884", "Reset, on the back behind a pinhole")
R("R4", "10k", P3, "IO0", (54, 80), *R10K, note="GPIO0 pull-up: normal boot")
part("SW3", "Switch:SW_Push", "BOOT", "Button_Switch_SMD:SW_Push_1P1T_XKB_TS-1187A", {"1": "IO0", "2": GND},
     (70, 80), "TS-1187A-B-A-B", "C318884", "Hold at reset for the ROM flasher (rescue only)")

# Test pads: the UART (where bootloader errors print), spare GPIOs and the rails.
for n, (net, x) in enumerate([("TXD0", 8), ("RXD0", 14), ("IO1", 20), ("IO2", 26),
                              (P5, 32), (P3, 38), (GND, 44)], start=1):
    part(f"TP{n}", "Connector:TestPoint", net if net not in POWER else net, "TestPoint:TestPoint_Pad_D1.0mm",
         {"1": net}, (x, 96), note="Test pad", board=True)

# ---------------------------------------------------------------- 3. Screen, touch, backlight
# ER-TFT1.69-4 + ER-TPC1.69-4, pins per the East Rising datasheet. VCC (pin 3) is both the
# logic supply and the backlight anode; the backlight cathode K (pin 2) is switched low.
J3 = {"1": GND, "2": "LCD_K", "3": P3, "4": P3, "5": GND, "6": GND, "7": "LCD_DC", "8": "LCD_CS",
      "9": "LCD_SCK", "10": "LCD_MOSI", "11": "LCD_RST", "12": GND, "13": "I2C_SCL", "14": "I2C_SDA",
      "15": "TP_RST", "16": "TP_INT", "17": P3, "18": GND, "MP": GND}
part("J3", "Connector_Generic_MountingPin:Conn_01x18_MountingPin", "Screen FPC",
     "Connector_FFC-FPC:Hirose_FH12-18S-0.5SH_1x18-1MP_P0.50mm_Horizontal", J3, (152, 70),
     "FH12-18S-0.5SH(55)", "", "18-pin 0.5 mm FPC, behind the screen. Contact side to confirm with a real panel")
R("R5", "22R", "LCD_SCK_MCU", "LCD_SCK", (122, 56), "0402WGF220JTCE", "C25092",
  note="Softens SPI clock edges (emissions)")
C("C6", "10uF", P3, GND, (172, 54), *C10U, note="Panel supply, at J3", fp=C0805)
C("C7", "100nF", P3, GND, (178, 54), *C100N, note="Panel supply, at J3")
part("R6", "Device:R_Small", "4.7R", "Resistor_SMD:R_0603_1608Metric", {"1": "LCD_K", "2": "BL_SW"}, (172, 70), "0603WAF470KT5E", "C23164",
     note="Backlight current limit (~60 mA at Vf 3.0 V; check on the bench). 0603: JLC has no 4.7R 0402")
part("Q1", "Transistor_FET:AO3400A", "AO3400A", "Package_TO_SOT_SMD:SOT-23", {"1": "BL_GATE", "2": GND, "3": "BL_SW"},
     (186, 84), "AO3400A", "C20917", "Backlight low-side switch, PWM from GPIO15")
R("R7", "100R", "LCD_BL", "BL_GATE", (172, 84), "0402WGF1000TCE", "C25076", note="Gate resistor")
R("R8", "100k", "BL_GATE", GND, (178, 92), *R100K, note="Keeps the backlight off while booting")
R("R9", "4.7k", P3, "I2C_SDA", (122, 72), *R4K7, note="I2C pull-up (touch + clock)")
R("R10", "4.7k", P3, "I2C_SCL", (128, 72), *R4K7, note="I2C pull-up (touch + clock)")

# ---------------------------------------------------------------- 4. Clock
# PCF85063A (same chip and driver as the Waveshare) runs from VRTC: 3.3 V through a
# Schottky while powered, the supercap through R12 when not.
part("U4", "Timer_RTC:PCF85063ATL", "PCF85063ATL", "Package_DFN_QFN:DFN-10-1EP_2.6x2.6mm_P0.5mm_EP1.3x2.2mm",
     {"1": "XTAL_I", "2": "XTAL_O", "3": GND, "4": "RTC_INT", "5": GND, "6": "I2C_SDA", "7": "I2C_SCL",
      "8": NC, "9": NC, "10": "VRTC"}, (146, 118), "PCF85063ATL/1,118", "C404360", "RTC. CLKOE tied low (no clock out). Out of stock at JLC on 2026-11-21 (pre-order, MOQ 15)")
part("Y1", "Device:Crystal_Small", "32.768kHz", "Crystal:Crystal_SMD_3215-2Pin_3.2x1.5mm",
     {"1": "XTAL_I", "2": "XTAL_O"}, (126, 118), "Q13FC1350000400", "C32346",
     "12.5 pF load: set the PCF85063 CAP_SEL bit in firmware")
part("D18", "Device:D_Schottky_Small", "BAT54WS", "Diode_SMD:D_SOD-323", {"1": "VRTC", "2": P3},
     (164, 114), "BAT54WS", "C7502694", "Feeds VRTC from 3.3 V; blocks the supercap from back-feeding the board (check part)")
C("C8", "100nF", "VRTC", GND, (172, 120), *C100N, note="RTC decoupling")
R("R11", "1k", "VRTC", "VCAP", (178, 120), *R1K, note="Limits the supercap's charging current")
part("C9", "Device:C_Polarized_Small", "0.22F 3.3V", "Capacitor_SMD:CP_Elec_6.3x5.4",
     {"1": "VCAP", "2": GND}, (184, 120), "DSK-3R3H224U-HL", "",
     "Supercap, keeps the clock running for days unplugged. Footprint is a placeholder: replace at layout")
R("R12", "10k", P3, "RTC_INT", (190, 120), *R10K, note="RTC interrupt pull-up (alarm, unused so far)")

# ---------------------------------------------------------------- 5. LED ring, top button, buzzer
part("U5", "74xGxx:74AHCT1G125", "74AHCT1G125", "Package_TO_SOT_SMD:SOT-23-5",
     {"1": GND, "2": "LED_DATA_3V3", "3": GND, "4": "LED_DATA_5V", "5": P5}, (24, 116),
     "SN74AHCT1G125DBVR", "C7484", "3.3 V to 5 V level shifter for the LED data")
C("C10", "100nF", P5, GND, (32, 118), *C100N, note="U5 decoupling")
R("R13", "10k", "LED_DATA_3V3", GND, (8, 120), *R10K, note="Holds LED data low while the ESP32 boots")
R("R14", "33R", "LED_DATA_5V", "DIN1", (40, 118), "0402WGF330JTCE", "C25105", note="Series resistor, first LED")
C("C11", "10uF", P5, GND, (48, 118), *C10U, note="LED bulk", fp=C0805)
C("C12", "10uF", P5, GND, (54, 118), *C10U, note="LED bulk, far side of the ring", fp=C0805)
for i in range(1, 17):
    col, row = (i - 1) % 8, (i - 1) // 8
    dout = f"DIN{i + 1}" if i < 16 else "LED_DOUT"
    part(f"D{i}", "LED:WS2812B-2020", "WS2812B-2020", "LED_SMD:LED_WS2812B-2020_PLCC4_2.0x2.0mm",
         {"1": dout, "2": GND, "3": f"DIN{i}", "4": P5}, (10 + col * 22, 134 + row * 18),
         "WS2812B-2020-V6", "C52917434", "Addressable RGB LED, 2 x 2 mm, front side")
    part(f"C{12 + i}", "Device:C_Small", "100nF", C0402, {"1": P5, "2": GND}, (16 + col * 22, 128 + row * 18),
         *C100N, note="LED decoupling")
part("TP8", "Connector:TestPoint", "LED_DOUT", "TestPoint:TestPoint_Pad_D1.0mm", {"1": "LED_DOUT"},
     (108, 118), note="End of the LED chain")
part("SW1", "Switch:SW_Push", "Top button", "Button_Switch_SMD:SW_Push_1P1T-MP_NO_Horizontal_Alps_SKRTLAE010",
     {"1": GND, "2": "BTN", "MP": GND}, (76, 118), "SKRTLAE010", "C110293",
     "Side-push button on the top edge. GPIO18 with the internal pull-up")
R("R15", "1k", "IO18", "BTN", (66, 118), *R1K, note="Limits ESD current into GPIO18")
R("R16", "100R", "BUZZER", "BZ_DRV", (90, 118), "0402WGF1000TCE", "C25076", note="Buzzer drive (not fitted)", dnp=True)
part("BZ1", "Device:Buzzer", "Piezo", "Buzzer_Beeper:Buzzer_Murata_PKMCS0909E", {"1": "BZ_DRV", "2": GND},
     (98, 118), "PKMCS0909E4000-R1", "", "Footprint only, for a future 'knock' sound", dnp=True)

for n, (x, y) in enumerate([(196, 18), (202, 18), (208, 18), (214, 18)], start=1):
    part(f"H{n}", "Mechanical:MountingHole", "M2", "MountingHole:MountingHole_2.2mm_M2", {}, (x, y),
         note="M2 screw or printed peg")

# Not on the board, but in the build: the antenna on the u.FL cable and the screen.
EXTRA_BOM = [
    ("AE1", "2.4 GHz FPC monopole antenna, u.FL, <= 2.33 dBi, ~100 mm cable", "",
     "Same type as the module's certified antenna, equal or lower gain (spec 4.1). Stuck inside the case top"),
    ("LCD1", "ER-TFT1.69-4 + ER-TPC1.69-4 touch", "", "BuyDisplay. Fitted by hand into J3"),
]

FLAGS = [VBUS, P5, GND, "5V_LDO", "VRTC"]   # nets driven only through passive pins


# ---------------------------------------------------------------- schematic writer
def uid():
    return str(uuid.uuid4())


_lib_cache = {}


def lib_symbol(lib_id):
    """The library symbol, flattened (no `extends`) and renamed lib:name for embedding."""
    lib, name = lib_id.split(":")
    if lib not in _lib_cache:
        _lib_cache[lib] = sexp.parse(open(f"{KICAD_SYM}/{lib}.kicad_sym").read())
    syms = {s[1]: s for s in sexp.find(_lib_cache[lib], "symbol")}
    s = [list(e) if isinstance(e, list) else e for e in syms[name]]
    ext = sexp.first(s, "extends")
    if ext:
        parent = syms[ext[1]]
        props = sexp.find(s, "property")
        s = ["symbol", name] + [e for e in parent[2:] if not (isinstance(e, list) and e[0] == "property")]
        s = s[:2] + props + s[2:]
        for e in s:
            if isinstance(e, list) and e[0] == "symbol":
                e[1] = Q(e[1].replace(ext[1], name))
    s[1] = Q(lib_id)
    return s


def pins_of(sym):
    out = {}

    def walk(n):
        for e in n:
            if isinstance(e, list):
                if e[0] == "pin":
                    at = sexp.first(e, "at")
                    num = sexp.first(e, "number")[1]
                    out.setdefault(num, (float(at[1]), float(at[2]), float(at[3])))
                else:
                    walk(e)
    walk(sym)
    return out


def write_schematic():
    root = uid()
    items, lib_ids = [], []
    counters = {"#PWR": 0, "#FLG": 0}

    def eff(hide=False, justify=None, size=1.27):
        e = ["effects", ["font", ["size", size, size]]]
        if justify:
            e.append(["justify"] + justify)
        if hide:
            e.append("hide")
        return e

    def place(lib_id, ref, value, fp, x, y, mpn="", lcsc="", dnp=False, board=True, val_at=None, rot=0):
        if lib_id not in lib_ids:
            lib_ids.append(lib_id)
        sym = lib_symbol(lib_id)
        pins = pins_of(sym)
        virtual = ref.startswith("#")
        node = ["symbol", ["lib_id", Q(lib_id)], ["at", x, y, rot], ["unit", 1],
                ["in_bom", "no" if virtual else "yes"], ["on_board", "no" if virtual or not board else "yes"],
                ["dnp", "yes" if dnp else "no"], ["uuid", uid()],
                ["property", Q("Reference"), Q(ref), ["at", x + 2.5, y - 3.5 if not virtual else y + 4, 0],
                 eff(hide=virtual, justify=["left"])],
                ["property", Q("Value"), Q(value), val_at or ["at", x + 2.5, y + 3.5, 0],
                 eff(justify=None if val_at else ["left"])],
                ["property", Q("Footprint"), Q(fp), ["at", x, y, 0], eff(hide=True)],
                ["property", Q("Datasheet"), Q(""), ["at", x, y, 0], eff(hide=True)]]
        if mpn:
            node.append(["property", Q("MPN"), Q(mpn), ["at", x, y, 0], eff(hide=True)])
        if lcsc:
            node.append(["property", Q("LCSC"), Q(lcsc), ["at", x, y, 0], eff(hide=True)])
        for num in pins:
            node.append(["pin", Q(num), ["uuid", uid()]])
        node.append(["instances", ["project", Q(NAME), ["path", Q("/" + root), ["reference", Q(ref)], ["unit", 1]]]])
        items.append(node)
        return pins

    def power(net, x, y, d=None):
        """d = the stub's direction; the symbol points the same way."""
        counters["#PWR"] += 1
        d = d or ((0, 1) if net == GND else (0, -1))
        if net == GND:
            rot = {(0, 1): 0, (1, 0): 90, (0, -1): 180, (-1, 0): 270}[d]
        else:
            rot = {(0, -1): 0, (-1, 0): 90, (0, 1): 180, (1, 0): 270}[d]
        vx, vy = x + d[0] * 6.0, y + d[1] * (5.0 if d[1] > 0 else 3.8)
        ang = 0
        if d[0]:                                  # sideways symbol: keep its name horizontal
            vx, vy, ang = x + d[0] * 7.5, y - 0.4, 90
        place(f"power:{net}", f"#PWR{counters['#PWR']:03d}", net, "", x, y, rot=rot, val_at=["at", vx, vy, ang])

    def label(net, x, y, ang):
        just = ["right", "bottom"] if ang in (180, 270) else ["left", "bottom"]
        items.append(["label", Q(net), ["at", x, y, ang], ["fields_autoplaced"], eff(justify=just), ["uuid", uid()]])

    for p in parts:
        x, y = p["at"]
        pins = place(p["sym"], p["ref"], p["value"], p["fp"], x, y, p["mpn"], p["lcsc"], p["dnp"], p["board"])
        missing = set(p["pins"]) - set(pins) - {"MP"}
        assert not missing, (p["ref"], missing)
        for num, net in p["pins"].items():
            if num not in pins:
                continue                                  # SW1's mounting tabs: PCB only
            px, py, ang = pins[num]
            ex, ey = round(x + px, 2), round(y - py, 2)   # library y is up, sheet y is down
            if net is NC:
                items.append(["no_connect", ["at", ex, ey], ["uuid", uid()]])
                continue
            dx, dy = -math.cos(math.radians(ang)), math.sin(math.radians(ang))
            sx, sy = round(ex + G * dx, 2), round(ey + G * dy, 2)
            items.append(["wire", ["pts", ["xy", ex, ey], ["xy", sx, sy]],
                          ["stroke", ["width", 0], ["type", "default"]], ["uuid", uid()]])
            if net in POWER:
                power(net, sx, sy, (round(dx), round(dy)))
            else:
                label(net, sx, sy, {(1, 0): 0, (-1, 0): 180, (0, -1): 90, (0, 1): 270}[(round(dx), round(dy))])

    # Power flags: tell ERC where nets that only meet passive pins are driven.
    for n, net in enumerate(FLAGS):
        x, y = (192 + n * 7) * G, 30 * G
        counters["#FLG"] += 1
        place("power:PWR_FLAG", f"#FLG{counters['#FLG']:02d}", "PWR_FLAG", "", x, y, val_at=["at", x, y - 4.5, 0])
        items.append(["wire", ["pts", ["xy", x, y], ["xy", x, y + G]], ["stroke", ["width", 0], ["type", "default"]],
                      ["uuid", uid()]])
        if net in POWER:
            power(net, x, y + G)
        else:
            label(net, x, y + G, 270)

    def text(s, x, y, size=1.27):
        items.append(["text", Q(s), ["at", x * G, y * G, 0],
                      ["effects", ["font", ["size", size, size]], ["justify", "left", "bottom"]], ["uuid", uid()]])

    text("bzzy main board rev A: ESP32-S3-WROOM-1U-N16R8, ER-TFT1.69-4 screen, USB-C, clock, 16-LED ring", 6, 8, 3)
    text("Spec: docs/hardware/main-board.md. Pins match the Waveshare ESP32-S3-Touch-LCD-1.69, so the firmware is a new config block.", 6, 11)
    text("1. USB-C and power: CC pull-downs, ESD, polyfuse, 5 V TVS, ferrite, 3.3 V LDO", 6, 15, 2)
    text("2. ESP32-S3 module: EN reset delay, BOOT and RESET switches on the back, test pads for UART and spare GPIOs", 6, 44, 2)
    text("3. Screen: 18-pin FPC to the ER-TFT1.69-4 (ST7789 + CST816 touch). Backlight cathode switched by Q1", 116, 44, 2)
    text("4. Clock: PCF85063A on VRTC (3.3 V via D18, or the supercap when unplugged)", 116, 104, 2)
    text("5. LED ring: GPIO17 -> 74AHCT1G125 -> 16 x WS2812B-2020 (front). Top button on GPIO18. Buzzer footprint (not fitted)", 6, 104, 2)
    text("Power flags (ERC)", 190, 26)

    sch = ["kicad_sch", ["version", 20230121], ["generator", "bzzy_gen"], ["uuid", root], ["paper", "A2"],
           ["title_block", ["title", Q("bzzy main board")], ["rev", Q(REV)], ["company", Q("bzzy")],
            ["comment", 1, Q("Generated by gen_main_board.py. Edit the script, not this file.")],
            ["comment", 2, Q("Not yet laid out or built. LCSC numbers marked 'check' in bom.csv need confirming.")]],
           ["lib_symbols"] + [lib_symbol(l) for l in lib_ids]] + items + \
          [["sheet_instances", ["path", Q("/"), ["page", Q("1")]]]]
    with open(os.path.join(HERE, NAME + ".kicad_sch"), "w") as f:
        f.write(sexp.dump(sch) + "\n")


# ---------------------------------------------------------------- BOM
def write_bom():
    groups = {}
    for p in parts:
        if not p["board"] or p["sym"].startswith(("Mechanical:", "Connector:TestPoint")):
            continue
        key = (p["value"], p["fp"].split(":")[-1], p["mpn"], p["lcsc"], p["dnp"])
        groups.setdefault(key, []).append(p)
    rows = sorted(groups.items(), key=lambda kv: kv[1][0]["ref"])
    jlc = []
    with open(os.path.join(HERE, "bom.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Comment", "Designator", "Footprint", "MPN", "Qty", "LCSC Part #", "Fitted", "Notes"])
        for (value, fp, mpn, lcsc, dnp), ps in rows:
            refs = ",".join(sorted((q["ref"] for q in ps), key=lambda r: (r.rstrip("0123456789"), int(r.lstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ") or 0))))
            notes = "; ".join(dict.fromkeys(q["note"] for q in ps if q["note"]))
            code = lcsc if lcsc in CONFIRMED else (lcsc + " (check)") if lcsc else "TBD"
            w.writerow([value, refs, fp, mpn, len(ps), code, "no" if dnp else "yes", notes])
            if not dnp:
                jlc.append([value, refs, fp, lcsc])
        for ref, desc, lcsc, note in EXTRA_BOM:
            w.writerow([desc, ref, "(off board)", "", 1, lcsc or "n/a", "yes", note])
    # For JLCPCB's BOM upload: fitted, on-board parts only, in its four columns.
    with open(os.path.join(HERE, "bom-jlcpcb.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Comment", "Designator", "Footprint", "LCSC Part #"])
        w.writerows(jlc)


def netlist():
    nets = {}
    for p in parts:
        for num, net in p["pins"].items():
            if net is not NC:
                nets.setdefault(net, []).append(f"{p['ref']}.{num}")
    return nets


if __name__ == "__main__":
    write_schematic()
    write_bom()
    nets = netlist()
    singles = [n for n, ps in nets.items() if len(ps) < 2 and n not in ("TXD0", "RXD0", "IO1", "IO2")]
    print(f"{len(parts)} parts, {len(nets)} nets")
    if singles:
        print("nets with one connection:", singles)
