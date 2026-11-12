#!/usr/bin/env python3
"""Generate the bzzy LED ring board: KiCad schematic, routed PCB, JLCPCB BOM/CPL,
a DRC report, and the board dimensions the OpenSCAD case uses.

One source of truth for the netlist, placement and routing. Run it with KiCad's
Python (the one that can `import pcbnew`; tested with KiCad 7.0) from this folder:

    python3 gen_led_ring.py

It overwrites the .kicad_sch and .kicad_pcb, so make changes here rather than in
KiCad. Once the design settles you can stop using the script and edit in KiCad.

Coordinates are in mm, relative to the centre of the screen, KiCad style:
+x right, +y DOWN, looking at the front (LED side) of the board.
"""
import csv
import json
import math
import os
import re
import uuid

import sexp
from sexp import Q

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = "bzzy-led-ring"
KICAD_SYM = "/usr/share/kicad/symbols"
KICAD_FP = "/usr/share/kicad/footprints"

# ---------------------------------------------------------------- geometry
# The Waveshare ESP32-S3-Touch-LCD-1.69 outline. ESTIMATES: Waveshare only
# publishes the outline as an image. Measure your board with calipers and
# update these three numbers before ordering anything.
WS_W, WS_H = 33.0, 41.5      # board + glass footprint, mm
WS_T = 9.5                   # front of glass to back of tallest part, mm
CUT_CLEAR = 0.6              # gap around the Waveshare board in the cutout

CUT_W, CUT_H, CUT_R = WS_W + 2 * CUT_CLEAR, WS_H + 2 * CUT_CLEAR, 1.5
OUT_W, OUT_H, OUT_R = 52.0, 61.0, 4.0
PCB_T = 1.6
# Rev C: the Waveshare USB-C socket is on its bottom edge, so the plug has to pass
# through the ring. The notch runs the full depth of the bottom band, from the
# cutout to the board edge, and is wider than a typical USB-C overmould (~12 mm).
NOTCH_W = 14.0
# Keep copper this far from each M2 hole centre, so a screw head or washer
# can't sit on +5V or GND.
HOLE_KEEPOUT_R = 2.7

LED_X = OUT_W / 2 - 3.0      # LED centre line on the left/right sides
LED_Y = OUT_H / 2 - 3.5      # LED centre line on the top/bottom
CAP_INSET = 2.6              # per-LED 100 nF cap sits this far inside its LED

SIDE_YS = [18.0, 6.0, -6.0, -18.0]   # bottom -> top
TOP_XS = [-15.0, -5.0, 5.0, 15.0]    # left -> right
# Bottom LEDs sit either side of the notch. The input circuit (U1 and friends) is
# between D1 and the notch; TP1 and a bulk cap are between D16 and the notch.
BOTTOM_LEFT_XS = [-13.6, -17.2]      # D1, D2 (going left)
BOTTOM_RIGHT_XS = [16.6, 13.0]       # D15, D16 (going left)


def led_positions():
    """16 LEDs clockwise (seen from the front), starting just left of the notch at the bottom.

    Each LED is turned so its DOUT pad faces the next LED: at 0 degrees the chain
    runs right to left, and KiCad turns parts anticlockwise.
    """
    pos = []
    pos += [(x, LED_Y, 0) for x in BOTTOM_LEFT_XS]          # bottom, going left
    pos += [(-LED_X, y, 270) for y in SIDE_YS]               # left, going up
    pos += [(x, -LED_Y, 180) for x in TOP_XS]                # top, going right
    pos += [(LED_X, -y, 90) for y in SIDE_YS]                # right, going down
    pos += [(x, LED_Y, 0) for x in BOTTOM_RIGHT_XS]         # bottom, going left
    return pos


def cap_position(x, y, rot):
    if rot in (90, 270):
        return (x - math.copysign(CAP_INSET, x), y, 90)
    return (x, y - math.copysign(CAP_INSET, y), 0)


# ---------------------------------------------------------------- parts
# ref, lib:symbol, value, footprint, {pin: net}, pcb (x, y, rot) or None, MPN, notes
P5, GND = "+5V", "GND"
parts = []


def part(ref, sym, value, fp, pins, pcb, mpn="", note="", sch=None, assemble=True, back=False):
    parts.append(dict(ref=ref, sym=sym, value=value, fp=fp, pins=pins, pcb=pcb,
                      mpn=mpn, note=note, sch=sch, assemble=assemble, back=back))


# J1 is on the left side, clear of the USB-C plug: 5V at the top, data at the bottom.
part("J1", "Connector_Generic:Conn_01x03", "Wire pads", "Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical",
     {"1": P5, "2": GND, "3": "LED_DATA_3V3"}, (-19.0, 9.0, 0), note="Wire pads, hand-soldered: 5V, GND, GPIO17",
     sch=(45, 60), assemble=False)
part("R1", "Device:R_Small", "100k", "Resistor_SMD:R_0402_1005Metric",
     {"1": "LED_DATA_3V3", "2": GND}, (-12.6, 22.6, 90), mpn="0402WGF1003TCE", note="Holds data low while the ESP32 boots",
     sch=(70, 75))
part("U1", "74xGxx:74AHCT1G125", "74AHCT1G125", "Package_TO_SOT_SMD:SOT-23-5",
     {"1": GND, "2": "LED_DATA_3V3", "3": GND, "4": "LED_DATA_5V", "5": P5}, (-10.0, 24.4, 0),
     mpn="74AHCT1G125GV,125", note="3.3 V to 5 V level shifter for the LED data line", sch=(100, 60))
part("C1", "Device:C_Small", "100nF", "Capacitor_SMD:C_0402_1005Metric",
     {"1": P5, "2": GND}, (-8.9, 22.15, 180), mpn="CL05B104KO5NNNC", note="U1 decoupling", sch=(100, 90))
part("R2", "Device:R_Small", "33R", "Resistor_SMD:R_0402_1005Metric",
     {"1": "LED_DATA_5V", "2": "DIN1"}, (-10.4, 27.55, 180), mpn="0402WGF330JTCE", note="Series resistor, first LED",
     sch=(130, 60))
part("C2", "Device:C_Small", "10uF", "Capacitor_SMD:C_0805_2012Metric",
     {"1": P5, "2": GND}, (-18.9, 0.0, 90), mpn="CL21A106KAYNNNE", note="Bulk, next to the power input", sch=(55, 90))
part("C3", "Device:C_Small", "10uF", "Capacitor_SMD:C_0805_2012Metric",
     {"1": P5, "2": GND}, (9.6, 23.0, 180), mpn="CL21A106KAYNNNE", note="Bulk, far end of the +5V ring", sch=(70, 90))

for i, (x, y, rot) in enumerate(led_positions(), start=1):
    dout = f"DIN{i + 1}" if i < 16 else "LED_DOUT"
    col, row = (i - 1) % 8, (i - 1) // 8
    part(f"D{i}", "LED:WS2812B-2020", "WS2812B-2020", "LED_SMD:LED_WS2812B-2020_PLCC4_2.0x2.0mm",
         {"1": dout, "2": GND, "3": f"DIN{i}", "4": P5}, (x, y, rot), mpn="WS2812B-2020",
         note="Addressable RGB LED, 2x2 mm", sch=(40 + col * 40, 130 + row * 50))
    cx, cy, crot = cap_position(x, y, rot)
    part(f"C{i + 3}", "Device:C_Small", "100nF", "Capacitor_SMD:C_0402_1005Metric",
         {"1": P5, "2": GND}, (cx, cy, crot), mpn="CL05B104KO5NNNC", note="LED decoupling",
         sch=(52 + col * 40, 115 + row * 50))

part("TP1", "Connector:TestPoint", "DOUT", "TestPoint:TestPoint_Pad_D1.0mm",
     {"1": "LED_DOUT"}, (9.6, 26.45, 0), note="End of the chain, to add more LEDs later", sch=(200, 75),
     assemble=False)
# Top button: a side-push switch on the top edge, pressed through a flexure in the case.
# Its plunger tip sits on the board edge.
part("SW1", "Switch:SW_Push", "Top button", "Button_Switch_SMD:SW_Push_1P1T-MP_NO_Horizontal_Alps_SKRTLAE010",
     {"1": GND, "2": "BTN"}, (0.0, -OUT_H / 2 + 2.04, 180), mpn="SKRTLAE010",
     note="Side-push button, plunger up. Firmware: GPIO18 with the internal pull-up", sch=(150, 60))
part("J2", "Connector_Generic:Conn_01x01", "To GPIO18", "TestPoint:TestPoint_THTPad_1.5x1.5mm_Drill0.7mm",
     {"1": "BTN"}, (10.5, -28.9, 0), note="Plated wire hole, top right of the button: to the Waveshare GPIO18 pad",
     sch=(175, 60), assemble=False)
for n, (x, y) in enumerate([(-22.0, -25.0), (22.0, -25.0), (22.0, 25.0), (-22.0, 25.0)], start=1):
    part(f"H{n}", "Mechanical:MountingHole", "M2", "MountingHole:MountingHole_2.2mm_M2",
         {}, (x, y, 0), note="M2 screw or printed peg", sch=(150 + n * 12, 95), assemble=False)

NETS = sorted({n for p in parts for n in p["pins"].values()})


# ---------------------------------------------------------------- schematic
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
                    out[sexp.first(e, "number")[1]] = (float(at[1]), float(at[2]), float(at[3]))
                else:
                    walk(e)
    walk(sym)
    return out


def write_schematic():
    root = uid()
    items, lib_ids = [], []
    counters = {"#PWR": 0, "#FLG": 0}

    def eff(hide=False, justify=None):
        e = ["effects", ["font", ["size", 1.27, 1.27]]]
        if justify:
            e.append(["justify"] + justify)
        if hide:
            e.append("hide")
        return e

    def place(lib_id, ref, value, fp, x, y, mpn="", rot=0, val_at=None):
        if lib_id not in lib_ids:
            lib_ids.append(lib_id)
        sym = lib_symbol(lib_id)
        pins = pins_of(sym)
        node = ["symbol", ["lib_id", Q(lib_id)], ["at", x, y, rot], ["unit", 1],
                ["in_bom", "no" if ref.startswith("#") else "yes"], ["on_board", "no" if ref.startswith("#") else "yes"],
                ["dnp", "no"], ["uuid", uid()],
                ["property", Q("Reference"), Q(ref), ["at", x + 2.5, y - 3.5 if not ref.startswith("#") else y + 4, 0],
                 eff(hide=ref.startswith("#"), justify=["left"])],
                ["property", Q("Value"), Q(value), val_at or ["at", x + 2.5, y + 3.5, 0],
                 eff(justify=None if val_at else ["left"])],
                ["property", Q("Footprint"), Q(fp), ["at", x, y, 0], eff(hide=True)],
                ["property", Q("Datasheet"), Q(""), ["at", x, y, 0], eff(hide=True)]]
        if mpn:
            node.append(["property", Q("MPN"), Q(mpn), ["at", x, y, 0], eff(hide=True)])
        for num in pins:
            node.append(["pin", Q(num), ["uuid", uid()]])
        node.append(["instances", ["project", Q(NAME), ["path", Q("/" + root), ["reference", Q(ref)], ["unit", 1]]]])
        items.append(node)
        return pins

    def power(net, x, y):
        counters["#PWR"] += 1
        vy = y + 5.0 if net == GND else y - 3.8
        place(f"power:{net}", f"#PWR{counters['#PWR']:02d}", net, "", x, y, val_at=["at", x, vy, 0])

    for p in parts:
        x, y = p["sch"]
        pins = place(p["sym"], p["ref"], p["value"], p["fp"], x, y, p["mpn"])
        for num, net in p["pins"].items():
            px, py, ang = pins[num]
            ex, ey = x + px, y - py                       # library y is up, sheet y is down
            dx, dy = -math.cos(math.radians(ang)), math.sin(math.radians(ang))
            sx, sy = round(ex + 2.54 * dx, 2), round(ey + 2.54 * dy, 2)
            items.append(["wire", ["pts", ["xy", ex, ey], ["xy", sx, sy]],
                          ["stroke", ["width", 0], ["type", "default"]], ["uuid", uid()]])
            if net in (P5, GND):
                power(net, sx, sy)
            else:
                lang = {(1, 0): 0, (-1, 0): 180, (0, -1): 90, (0, 1): 270}[(round(dx), round(dy))]
                just = ["right", "bottom"] if lang in (180, 270) else ["left", "bottom"]
                items.append(["label", Q(net), ["at", sx, sy, lang], ["fields_autoplaced"],
                              eff(justify=just), ["uuid", uid()]])

    # Power flags: the supply comes in on wires, so tell ERC where it's driven.
    for net, x in ((P5, 200), (GND, 220)):
        counters["#FLG"] += 1
        place("power:PWR_FLAG", f"#FLG{counters['#FLG']:02d}", "PWR_FLAG", "", x, 45,
              val_at=["at", x, 40.5, 0])
        power(net, x, 45)

    def text(s, x, y, size=1.27):
        items.append(["text", Q(s), ["at", x, y, 0],
                      ["effects", ["font", ["size", size, size]], ["justify", "left", "bottom"]], ["uuid", uid()]])

    text("bzzy LED ring: 16 x WS2812B-2020 around the Waveshare ESP32-S3-Touch-LCD-1.69", 25, 20, 2.5)
    text("J1 is three wire holes (5V, GND, GPIO17) and J2 one more (GPIO18, top button). Wire them to the Waveshare board's pads.", 25, 25)
    text("U1 lifts the 3.3 V data to 5 V logic. R1 keeps the line low while the ESP32 boots.", 25, 45)
    text("LED chain: D1 (bottom-left) runs clockwise to D16. TP1 is the chain's DOUT, for adding more LEDs later.", 25, 108)

    sch = ["kicad_sch", ["version", 20230121], ["generator", "bzzy_gen"], ["uuid", root], ["paper", "A3"],
           ["title_block", ["title", Q("bzzy LED ring")], ["rev", Q("C")], ["company", Q("bzzy")],
            ["comment", 1, Q("Generated by gen_led_ring.py. Edit the script, not this file.")]],
           ["lib_symbols"] + [lib_symbol(l) for l in lib_ids]] + items + \
          [["sheet_instances", ["path", Q("/"), ["page", Q("1")]]]]
    with open(os.path.join(HERE, NAME + ".kicad_sch"), "w") as f:
        f.write(sexp.dump(sch) + "\n")


# ---------------------------------------------------------------- PCB
def write_pcb():
    import pcbnew
    board = pcbnew.BOARD()
    ds = board.GetDesignSettings()
    ds.SetBoardThickness(pcbnew.FromMM(PCB_T))
    # JLCPCB standard 2-layer capabilities, with margin
    ds.m_TrackMinWidth = pcbnew.FromMM(0.15)
    ds.m_MinClearance = pcbnew.FromMM(0.15)
    ds.m_ViasMinSize = pcbnew.FromMM(0.5)
    ds.m_MinThroughDrill = pcbnew.FromMM(0.3)
    ds.m_CopperEdgeClearance = pcbnew.FromMM(0.3)
    ns = ds.m_NetSettings
    dflt = ns.m_DefaultNetClass
    dflt.SetTrackWidth(pcbnew.FromMM(0.2))
    dflt.SetClearance(pcbnew.FromMM(0.18))
    dflt.SetViaDiameter(pcbnew.FromMM(0.6))
    dflt.SetViaDrill(pcbnew.FromMM(0.3))

    O = (100.0, 100.0)  # board centre on the KiCad page

    def V(x, y):
        return pcbnew.VECTOR2I(pcbnew.FromMM(O[0] + x), pcbnew.FromMM(O[1] + y))

    def edge(a, b):
        s = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_SEGMENT)
        s.SetStart(V(*a)); s.SetEnd(V(*b))
        s.SetLayer(pcbnew.Edge_Cuts); s.SetWidth(pcbnew.FromMM(0.1))
        board.Add(s)

    def rounded_rect(w, h, r, gap):
        """A rounded rectangle whose bottom edge is open for |x| < gap / 2."""
        hw, hh, g = w / 2, h / 2, gap / 2
        for a, b in [((-hw + r, -hh), (hw - r, -hh)), ((hw, -hh + r), (hw, hh - r)),
                     ((hw - r, hh), (g, hh)), ((-g, hh), (-hw + r, hh)), ((-hw, hh - r), (-hw, -hh + r))]:
            edge(a, b)
        for cx, cy, sx, sy in [(hw - r, -hh + r, hw - r, -hh), (hw - r, hh - r, hw, hh - r),
                               (-hw + r, hh - r, -hw + r, hh), (-hw + r, -hh + r, -hw, -hh + r)]:
            s = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_ARC)
            s.SetCenter(V(cx, cy)); s.SetStart(V(sx, sy))
            s.SetArcAngleAndEnd(pcbnew.EDA_ANGLE(90, pcbnew.DEGREES_T), True)
            s.SetLayer(pcbnew.Edge_Cuts); s.SetWidth(pcbnew.FromMM(0.1))
            board.Add(s)

    # One outline: the board, open at the bottom middle into the screen cutout.
    rounded_rect(OUT_W, OUT_H, OUT_R, NOTCH_W)
    rounded_rect(CUT_W, CUT_H, CUT_R, NOTCH_W)
    for sx in (-1, 1):
        edge((sx * NOTCH_W / 2, CUT_H / 2), (sx * NOTCH_W / 2, OUT_H / 2))

    nets = {}
    for n in NETS:
        ni = pcbnew.NETINFO_ITEM(board, n)
        board.Add(ni)
        nets[n] = ni

    for p in parts:
        lib, name = p["fp"].split(":")
        fp = pcbnew.FootprintLoad(f"{KICAD_FP}/{lib}.pretty", name)
        fp.SetFPID(pcbnew.LIB_ID(lib, name))
        fp.SetReference(p["ref"])
        fp.SetValue(p["value"])
        x, y, rot = p["pcb"]
        fp.SetPosition(V(x, y))
        fp.SetOrientationDegrees(rot)
        # Too dense for designators on the silkscreen; they stay on the fab layer.
        fp.Reference().SetLayer(pcbnew.F_Fab)
        fp.Value().SetVisible(False)
        for pad in fp.Pads():
            net = p["pins"].get(pad.GetNumber())
            if net:
                pad.SetNet(nets[net])
        board.Add(fp)
        if p["back"]:
            fp.Flip(V(x, y), False)  # only once it's on the board; before that pcbnew 7 crashes

    def silk(s, x, y, size=1.0, layer=pcbnew.F_SilkS):
        t = pcbnew.PCB_TEXT(board)
        t.SetText(s); t.SetPosition(V(x, y)); t.SetLayer(layer)
        t.SetTextSize(pcbnew.VECTOR2I(pcbnew.FromMM(size), pcbnew.FromMM(size)))
        t.SetTextThickness(pcbnew.FromMM(size * 0.15))
        if layer == pcbnew.B_SilkS:
            t.SetMirrored(True)
        board.Add(t)

    j1 = next(p for p in parts if p["ref"] == "J1")["pcb"]
    for k, label in enumerate(("5V", "GND", "IO17")):
        silk(label, j1[0] - 2.8, j1[1] + 2.54 * k, 0.8, pcbnew.B_SilkS)
    j2 = next(p for p in parts if p["ref"] == "J2")["pcb"]
    silk("IO18", j2[0], j2[1] + 1.7, 0.8, pcbnew.B_SilkS)
    silk("bzzy LED ring rev C", 0, -23.4, 1.0, pcbnew.B_SilkS)

    # No copper under the M2 screw heads.
    for p in parts:
        if p["ref"].startswith("H"):
            hx, hy = p["pcb"][:2]
            ka = pcbnew.ZONE(board)
            ka.SetIsRuleArea(True)
            ka.SetDoNotAllowCopperPour(True)
            ka.SetDoNotAllowTracks(True)
            ka.SetDoNotAllowVias(True)
            ka.SetDoNotAllowPads(False)
            ka.SetDoNotAllowFootprints(False)
            ls = pcbnew.LSET()
            ls.AddLayer(pcbnew.F_Cu); ls.AddLayer(pcbnew.B_Cu)
            ka.SetLayerSet(ls)
            ka.SetZoneName(f"keepout_{p['ref']}")
            ol = ka.Outline()
            ol.NewOutline()
            for k in range(32):
                a = 2 * math.pi * k / 32
                ol.Append(V(hx + HOLE_KEEPOUT_R * math.cos(a), hy + HOLE_KEEPOUT_R * math.sin(a)))
            board.Add(ka)

    route(board, V)

    path = os.path.join(HERE, NAME + ".kicad_pcb")
    board.SetFileName(path)
    pcbnew.SaveBoard(path, board)
    # Zone filling needs a board that's been through a load; filling the one we
    # just built crashes pcbnew 7.
    board = pcbnew.LoadBoard(path)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    pcbnew.SaveBoard(path, board)
    os.makedirs(os.path.join(HERE, "fab"), exist_ok=True)
    report = os.path.join(HERE, "fab", "drc-report.txt")
    pcbnew.WriteDRCReport(board, report, pcbnew.EDA_UNITS_MILLIMETRES, True)
    lines = open(report).read().replace(HERE + "/", "").splitlines()
    open(report, "w").write("\n".join(l for l in lines if not l.startswith("** Created on")) + "\n")
    return board


# ---------------------------------------------------------------- routing
# The ring is regular enough to route by rule rather than with an autorouter:
#   top    data chain along the LEDs, plus the input circuit; GND pour
#   bottom a 0.8 mm +5V ring just inside the LEDs (a U, open at the notch), the
#          GPIO17 and GPIO18 runs; GND pour
# VDD is on the inside edge of every LED and VSS on the outside, because the chain
# runs clockwise. Each VDD drops through a via onto the +5V ring.
RING_IN = 1.25          # VDD pad -> +5V via, towards the screen
VIA_OUT = 1.3           # VSS pad -> GND stitching via, towards the board edge
PWR_W, SIG_W = 0.8, 0.25


def route(board, V):
    import pcbnew
    fps = {f.GetReference(): f for f in board.GetFootprints()}

    def pad(ref, num):
        p = fps[ref].FindPadByNumber(num).GetPosition()
        return (pcbnew.ToMM(p.x) - 100, pcbnew.ToMM(p.y) - 100)

    def net(name):
        return board.FindNet(name)

    def track(pts, netname, width=SIG_W, layer=None):
        layer = pcbnew.F_Cu if layer is None else layer
        for a, b in zip(pts, pts[1:]):
            t = pcbnew.PCB_TRACK(board)
            t.SetStart(V(*a)); t.SetEnd(V(*b))
            t.SetWidth(pcbnew.FromMM(width)); t.SetLayer(layer); t.SetNet(net(netname))
            board.Add(t)

    def via(pt, netname, size=0.6, drill=0.3):
        v = pcbnew.PCB_VIA(board)
        v.SetPosition(V(*pt)); v.SetWidth(pcbnew.FromMM(size)); v.SetDrill(pcbnew.FromMM(drill))
        v.SetNet(net(netname))
        board.Add(v)

    def inward(x, y):
        """Unit vector from an LED towards the screen."""
        if abs(abs(x) - LED_X) < 0.01:
            return (-math.copysign(1, x), 0.0)
        return (0.0, -math.copysign(1, y))

    leds = [p for p in parts if p["ref"].startswith("D")]
    holes = {(math.copysign(1, p["pcb"][0]), math.copysign(1, p["pcb"][1])): p["pcb"][:2]
             for p in parts if p["ref"].startswith("H")}

    for i, p in enumerate(leds, start=1):
        lx, ly, _ = p["pcb"]
        nx, ny = inward(lx, ly)
        vdd, vss = pad(p["ref"], "4"), pad(p["ref"], "2")
        v5 = (vdd[0] + nx * RING_IN, vdd[1] + ny * RING_IN)
        via(v5, P5, 0.8, 0.4)
        track([vdd, v5], P5, 0.5)
        g = (vss[0] - nx * VIA_OUT, vss[1] - ny * VIA_OUT)
        via(g, GND)
        track([vss, g], GND, 0.4)

        # Decoupling cap: turn it so its +5V end faces the via, then wire it up.
        cap = fps[f"C{i + 3}"]
        if math.dist(pad(cap.GetReference(), "2"), v5) < math.dist(pad(cap.GetReference(), "1"), v5):
            cap.SetOrientationDegrees(cap.GetOrientationDegrees() + 180)
        c1, c2 = pad(cap.GetReference(), "1"), pad(cap.GetReference(), "2")
        track([c1, v5], P5, 0.4)
        cg = (c2[0] + nx * 1.1, c2[1] + ny * 1.1)
        via(cg, GND)
        track([c2, cg], GND, 0.4)

        # Data: DOUT of this LED to DIN of the next.
        if i == len(leds):
            continue
        q = leds[i]
        a, b = pad(p["ref"], "1"), pad(q["ref"], "3")
        sw = fps["SW1"].GetPosition()
        swx = pcbnew.ToMM(sw.x) - 100
        if inward(lx, ly) == inward(*q["pcb"][:2]) and ly < 0 and min(lx, q["pcb"][0]) < swx < max(lx, q["pcb"][0]):
            # Step inside the top button, then back out to the next LED's DIN.
            jog = a[1] + 0.75
            side = 2.4 * math.copysign(1, b[0] - a[0])
            track([a, (a[0] + math.copysign(1.5, b[0] - a[0]), jog), (swx + side, jog),
                   (swx + side, b[1]), b], f"DIN{i + 1}")
        elif inward(lx, ly) == inward(*q["pcb"][:2]):
            track([a, b], f"DIN{i + 1}")
        else:
            # Round a corner on the screen side of the mounting hole, outside its keep-out.
            sx, sy = math.copysign(1, lx + q["pcb"][0]), math.copysign(1, ly + q["pcb"][1])
            hx, hy = holes[(sx, sy)]
            corner = (hx - sx * 2.4, hy - sy * 2.2)
            qx, qy = q["pcb"][:2]
            if sx > 0 and sy > 0:
                # Bottom right: D15's DIN is on its outer corner, so come down between
                # its +5V via and the hole's keep-out.
                corner = (hx - 2.6, hy - 2.2)
                track([a, corner, (b[0] + 1.235, hy + 0.2), (b[0] + 1.235, b[1] - 0.55), b], f"DIN{i + 1}")
                continue
            if abs(abs(qx) - LED_X) < 0.01:      # next LED is on a side
                lead = (b[0], b[1] + sy * 1.58)
            else:
                lead = (b[0] + sx * 1.58, b[1])
            track([a, corner, lead, b], f"DIN{i + 1}")

    # +5V ring on the bottom layer: a U, open at the notch. J1 feeds it on the left side.
    # The chamfers keep it clear of the screw-head keep-outs.
    cx, cy, ch_x, ch_y = LED_X - 1.8, LED_Y - RING_IN - 0.55, 3.6, 4.6
    u_feed = (-7.75, 22.5)           # +5V via beside U1, at the left end of the U
    c3_feed = (pad("C3", "1")[0], cy)   # C3's +5V via, at the right end
    ring = [u_feed, (u_feed[0], cy), (-(cx - ch_x), cy), (-cx, cy - ch_y), (-cx, -(cy - ch_y)),
            (-(cx - ch_x), -cy), (cx - ch_x, -cy), (cx, -(cy - ch_y)), (cx, cy - ch_y),
            (cx - ch_x, cy), c3_feed]
    track(ring, P5, PWR_W, pcbnew.B_Cu)
    via(u_feed, P5, 0.8, 0.4)

    # J1 (left side): 5V straight out to the ring, GND to the pours, data down the
    # inside of the ring on the back to U1.
    j5, jg, jd = pad("J1", "1"), pad("J1", "2"), pad("J1", "3")
    track([j5, (-cx, j5[1])], P5, PWR_W, pcbnew.B_Cu)
    track([jg, (jg[0] + 1.2, jg[1])], GND, 0.5)
    via((jg[0] + 1.2, jg[1]), GND)
    d_via = (-12.3, 24.0)
    track([jd, (-18.2, jd[1] + 0.8), (-18.2, 22.0), (d_via[0], 22.0), d_via], "LED_DATA_3V3", SIG_W, pcbnew.B_Cu)
    via(d_via, "LED_DATA_3V3")

    # Bulk caps. C2 beside J1, C3 at the far (right) end of the ring.
    c2p, c2g = pad("C2", "1"), pad("C2", "2")
    v = (c2p[0] - 1.5, c2p[1])
    track([c2p, v], P5, 0.6)
    via(v, P5, 0.8, 0.4)
    track([v, (-cx, v[1])], P5, PWR_W, pcbnew.B_Cu)
    track([c2g, (c2g[0], c2g[1] - 1.45)], GND, 0.5)
    via((c2g[0], c2g[1] - 1.45), GND)
    c3p, c3g = pad("C3", "1"), pad("C3", "2")
    track([c3p, c3_feed], P5, 0.6)
    via(c3_feed, P5, 0.8, 0.4)
    track([c3g, (c3g[0], c3g[1] + 1.4)], GND, 0.5)
    via((c3g[0], c3g[1] + 1.4), GND)

    # Input, between D1 and the notch: data via -> R1 pull-down and U1.A;
    # U1.Y -> R2 -> D1.DIN. U1 and C1 take +5V from the via at the end of the U.
    r1d, r1g = pad("R1", "1"), pad("R1", "2")
    oe, a_in, u_gnd, y_out, u_vcc = (pad("U1", n) for n in "12345")
    track([d_via, r1d], "LED_DATA_3V3")
    track([d_via, a_in], "LED_DATA_3V3")
    g_top = (oe[0], oe[1] - 0.85)                 # GND via above U1 pin 1 (OE, tied low)
    track([oe, g_top], GND, 0.4)
    via(g_top, GND)
    track([r1g, g_top], GND, 0.3)
    c1p, c1g = pad("C1", "1"), pad("C1", "2")
    track([c1g, g_top], GND, 0.3)
    track([c1p, u_feed], P5, 0.4)
    track([u_vcc, u_feed], P5, 0.4)
    g_bot = (u_gnd[0], u_gnd[1] + 1.15)
    track([u_gnd, g_bot], GND, 0.4)
    via(g_bot, GND)
    r2a, r2b, din1 = pad("R2", "1"), pad("R2", "2"), pad("D1", "3")
    track([y_out, (y_out[0], r2a[1]), r2a], "LED_DATA_5V")
    track([r2b, din1], "DIN1")

    # Top button: tie its two GND pads together round the inside of the BTN pad, and
    # drop to ground through a via. BTN goes through a via, then along the top edge on
    # the back to J2, a plated hole off to the side so soldering it doesn't heat SW1.
    g_pads = sorted((pcbnew.ToMM(q.GetPosition().x) - 100, pcbnew.ToMM(q.GetPosition().y) - 100)
                    for q in fps["SW1"].Pads() if q.GetNumber() == "1")
    (lx_, ly_), (rx_, ry_) = g_pads
    link_y = ly_ + 1.26
    track([(lx_, ly_), (lx_, link_y), (rx_, link_y), (rx_, ry_)], GND, 0.3)
    track([(lx_, ly_ + 0.7), (lx_ - 1.075, ly_ + 0.7)], GND, 0.3)
    via((lx_ - 1.075, ly_ + 0.7), GND)
    btn = pad("SW1", "2")
    bv = (btn[0], btn[1] - 1.35)
    track([btn, bv], "BTN", 0.3)
    via(bv, "BTN")
    j2 = pad("J2", "1")
    edge_y = -OUT_H / 2 + 0.65
    track([bv, (bv[0], edge_y), (j2[0] - 1.5, edge_y), j2], "BTN", 0.3, pcbnew.B_Cu)

    dout = pad("D16", "1")
    track([dout, pad("TP1", "1")], "LED_DOUT")

    # Ground pour on both layers.
    outline = pcbnew.SHAPE_POLY_SET()
    board.GetBoardPolygonOutlines(outline)
    for layer in (pcbnew.F_Cu, pcbnew.B_Cu):
        zone = pcbnew.ZONE(board)
        zone.SetLayer(layer)
        zone.SetNet(net(GND))
        zone.SetMinThickness(pcbnew.FromMM(0.2))
        zone.SetLocalClearance(pcbnew.FromMM(0.25))
        zone.SetThermalReliefGap(pcbnew.FromMM(0.3))
        zone.SetThermalReliefSpokeWidth(pcbnew.FromMM(0.35))
        zone.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
        zone.Outline().Append(outline)
        board.Add(zone)


# ---------------------------------------------------------------- outputs
# LCSC numbers for JLC assembly, by MPN. Check each one in JLC's BOM matcher.
LCSC = {
    "0402WGF1003TCE": "C25741",
    "74AHCT1G125GV,125": "C12494",
    "CL05B104KO5NNNC": "C1525",
    "0402WGF330JTCE": "C25105",
    "CL21A106KAYNNNE": "C15850",
    "WS2812B-2020": "C965555",
    "SKRTLAE010": "C110293",
}

# JLC's library footprints aren't always oriented like KiCad's, so the CPL needs these
# offsets (from KiBot's JLC rotation table). Still check every part in JLC's placement
# preview before ordering: their footprint for a given LCSC part is what counts.
JLC_ROT_OFFSET = [
    (r"^SOT-23", 180),
    (r"^LED_WS2812B-2020", 90),
]


def write_fab(board):
    """JLCPCB-style BOM and placement (CPL). Rotations may need nudging in JLC's preview."""
    os.makedirs(os.path.join(HERE, "fab"), exist_ok=True)
    groups = {}
    for p in parts:
        if not p["assemble"]:
            continue
        key = (p["value"], p["fp"], p["mpn"])
        groups.setdefault(key, []).append(p["ref"])
    with open(os.path.join(HERE, "fab", "bom-jlcpcb.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Comment", "Designator", "Footprint", "MPN", "Qty", "LCSC Part #"])
        for (value, fp, mpn), refs in groups.items():
            w.writerow([value, ",".join(refs), fp.split(":")[1], mpn, len(refs), LCSC.get(mpn, "")])
    with open(os.path.join(HERE, "fab", "cpl-jlcpcb.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Designator", "Mid X", "Mid Y", "Layer", "Rotation"])
        import pcbnew
        for p in parts:
            if p["assemble"]:
                fp = board.FindFootprintByReference(p["ref"])
                # Same frame as the Gerbers (absolute KiCad coordinates, +y up), so JLC
                # doesn't have to guess an offset between the CPL and the board.
                x = pcbnew.ToMM(fp.GetPosition().x)
                y = -pcbnew.ToMM(fp.GetPosition().y)
                name = fp.GetFPID().GetLibItemName().wx_str()
                off = next((o for pat, o in JLC_ROT_OFFSET if re.match(pat, name)), 0)
                rot = (round(fp.GetOrientationDegrees()) + off) % 360
                w.writerow([p["ref"], f"{x:.2f}mm", f"{y:.2f}mm", "Top", rot])


def write_case_dims(board=None):
    holes = [p["pcb"][:2] for p in parts if p["ref"].startswith("H")]
    leds = [p["pcb"][:2] for p in parts if p["ref"].startswith("D")]
    out = os.path.join(HERE, "..", "case", "board_dims.scad")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        f.write("// Generated by hardware/led-ring/gen_led_ring.py. Edit the script, not this file.\n")
        f.write("// Board coordinates: origin at screen centre, +y DOWN (KiCad). The case flips y.\n")
        for k, v in dict(WS_W=WS_W, WS_H=WS_H, WS_T=WS_T, CUT_W=CUT_W, CUT_H=CUT_H, CUT_R=CUT_R,
                         RING_W=OUT_W, RING_H=OUT_H, RING_R=OUT_R, PCB_T=PCB_T, NOTCH_W=NOTCH_W).items():
            f.write(f"{k} = {v};\n")
        f.write("// NOTCH_W: the ring is open at the bottom middle, full depth from the cutout to the\n")
        f.write("// edge, so the USB-C plug can reach the Waveshare socket.\n")
        f.write(f"RING_HOLES = {json.dumps([list(h) for h in holes])};\n")
        f.write(f"HOLE_KEEPOUT_R = {HOLE_KEEPOUT_R};  // no copper inside this radius: screw heads can sit here\n")
        f.write(f"RING_LEDS = {json.dumps([list(l) for l in leds])};\n")
        sw = next(p for p in parts if p["ref"] == "SW1")
        f.write(f"TOP_BUTTON_X = {sw['pcb'][0]};  // plunger tip is on the board's top edge\n")
        f.write(f"TOP_BUTTON_EDGE_Y = {-OUT_H / 2};  // plunger tip, flush with the edge; 2 mm wide, 0.2 mm travel\n")
        if board is not None:
            import pcbnew

            def pads(ref):
                fp = board.FindFootprintByReference(ref)
                return [[round(pcbnew.ToMM(q.GetPosition().x) - 100, 2), round(pcbnew.ToMM(q.GetPosition().y) - 100, 2)]
                        for q in sorted(fp.Pads(), key=lambda q: q.GetNumber())]
            f.write("// Hand-soldered wires leave from these pads on the back (keep the case clear of them).\n")
            f.write(f"J1_PADS = {json.dumps(pads('J1'))};  // plated holes, left side: 5V, GND, GPIO17\n")
            f.write(f"J2_PAD = {json.dumps(pads('J2')[0])};  // plated hole, top right of the button: GPIO18\n")
            f.write("// Front part heights: 0805 caps ~1.25, SOT-23-5 ~1.1, LEDs 0.84 mm (SW1: see its datasheet).\n")


if __name__ == "__main__":
    write_schematic()
    board = write_pcb()
    write_case_dims(board)
    write_fab(board)
    print(f"{len(parts)} parts, {len(NETS)} nets")
