#!/usr/bin/env python3
"""Rev A placement concept for the bzzy main board (docs/hardware/main-board.md).

Draws every part to scale on the front and back of the 52 x 61 mm board and writes
placement.svg next to this script. This is a placement study, not a routed PCB:
footprint sizes are nominal body sizes and positions are a starting point for KiCad.

Coordinates: mm, origin at the screen centre, +y down, seen from the FRONT.
The back view is drawn mirrored (as you'd see it turning the board over).
"""
from pathlib import Path

BOARD_W, BOARD_H, BOARD_R = 52.0, 61.0, 4.0
HOLES = [(-22, -25), (22, -25), (22, 25), (-22, 25)]
HOLE_KEEPOUT_R = 2.7
# Same 16 LED positions as the rev C ring board (hardware/case/board_dims.scad).
LEDS = [(-13.6, 27.0), (-17.2, 27.0), (-23.0, 18.0), (-23.0, 6.0), (-23.0, -6.0), (-23.0, -18.0),
        (-15.0, -27.0), (-5.0, -27.0), (5.0, -27.0), (15.0, -27.0), (23.0, -18.0), (23.0, -6.0),
        (23.0, 6.0), (23.0, 18.0), (16.6, 27.0), (13.0, 27.0)]
PANEL_W, PANEL_H = 30.07, 37.43   # typical 1.69" 240x280 panel outline (verify with chosen panel)
WINDOW_W, WINDOW_H = 28.6, 33.2   # case's visible window

# (ref, label, x, y, w, h, side, colour key, note)  x/y = body centre, front-view coordinates
PARTS = [
    # front
    ("SW1", "top button", 0.0, -28.75, 4.7, 3.5, "F", "mech", "Alps SKRTLAE010, plunger up"),
    # back
    ("U1", "ESP32-S3-WROOM-1U-N16R8", 0.0, -19.6, 18.0, 19.2, "B", "mcu", "u.FL at top"),
    ("J2", "u.FL", 6.8, -27.6, 3.0, 3.0, "B", "rf", "antenna cable to case top"),
    ("J3", "panel FPC conn", 0.0, 12.0, 13.0, 3.6, "B", "conn", "tail through slot, folds up"),
    ("J1", "USB-C 16p", 0.0, 26.85, 8.94, 7.3, "B", "conn", "mid-mount, bottom edge"),
    ("U2", "3V3 LDO 1A", 13.5, 17.0, 6.5, 7.0, "B", "power", "AMS1117-3.3 (SOT-223)"),
    ("U3", "USB ESD", 8.0, 23.8, 3.0, 3.0, "B", "power", "USBLC6-2SC6"),
    ("F1", "polyfuse", -8.5, 23.5, 3.2, 1.6, "B", "power", "1206, ~750 mA hold"),
    ("D1", "5V TVS", -8.5, 20.5, 1.6, 0.8, "B", "power", "SOD-523"),
    ("FB1", "ferrite", -12.0, 20.5, 1.6, 0.8, "B", "power", "0603, DNP"),
    ("U4", "RTC PCF85063", -12.5, 1.0, 3.0, 3.0, "B", "logic", "MSOP-8"),
    ("Y1", "32.768k", -12.5, 4.8, 3.2, 1.5, "B", "logic", "3215"),
    ("C1", "0.22F supercap", -13.0, 10.5, 6.8, 6.8, "B", "power", "5.5 V coin-type"),
    ("D2", "Schottky", -8.0, 8.0, 1.6, 0.8, "B", "power", "supercap charge"),
    ("U5", "74AHCT1G125", 14.0, -4.0, 2.9, 2.8, "B", "logic", "3.3 V to 5 V LED data"),
    ("Q1", "BL MOSFET", 11.0, 6.0, 2.9, 2.4, "B", "logic", "SOT-23, backlight PWM"),
    ("SW2", "BOOT", -15.0, -6.0, 3.0, 2.0, "B", "mech", "behind pinhole"),
    ("SW3", "RESET", 15.0, 1.5, 3.0, 2.0, "B", "mech", "behind pinhole"),
    ("J4", "GH1.25 12p (DNP)", 0.0, 3.5, 16.5, 4.3, "B", "dnp", "Waveshare module fallback"),
    ("BZ1", "buzzer (DNP)", -15.5, -14.5, 5.0, 5.0, "B", "dnp", "for 'knock' later"),
    ("C2", "22u", 8.6, 14.5, 2.0, 1.25, "B", "power", "LDO in"),
    ("C3", "22u", 13.5, 9.0, 2.0, 1.25, "B", "power", "LDO out"),
    ("C4", "10u", 10.2, -8.0, 2.0, 1.25, "B", "power", "module 3V3"),
    ("C5", "10u x2", -19.0, 13.0, 2.0, 1.25, "B", "power", "LED bulk 5 V"),
]
SLOT = (0.0, 19.9, 14.0, 1.2)  # FPC slot below the panel (cx, cy, w, h)
LED_SIZE = 2.0

COL = {
    "mcu": "#4f6d8f", "rf": "#c0563b", "conn": "#8a6d3b", "power": "#5f8a5a",
    "logic": "#7a5a8a", "mech": "#555555", "dnp": "#9a9a9a", "led": "#d9a400",
}

SCALE = 9.0       # px per mm
GAP = 150         # px between views
PAD = 70
VIEW_W = BOARD_W * SCALE
VIEW_H = BOARD_H * SCALE


def view(ox, oy, side):
    """Return svg for one side. ox/oy = top-left of the board in px."""
    mirror = side == "B"

    def X(x):
        return ox + ((-x if mirror else x) + BOARD_W / 2) * SCALE

    def Y(y):
        return oy + (y + BOARD_H / 2) * SCALE

    def rect(cx, cy, w, h, **a):
        x0 = X(cx) - w * SCALE / 2
        y0 = Y(cy) - h * SCALE / 2
        attrs = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in a.items())
        return f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{w*SCALE:.1f}" height="{h*SCALE:.1f}" {attrs}/>'

    out = []
    out.append(f'<rect x="{ox}" y="{oy}" width="{VIEW_W}" height="{VIEW_H}" rx="{BOARD_R*SCALE}" '
               f'fill="#1f4d3a" stroke="#0e2a1f" stroke-width="2"/>')
    for hx, hy in HOLES:
        out.append(f'<circle cx="{X(hx):.1f}" cy="{Y(hy):.1f}" r="{HOLE_KEEPOUT_R*SCALE:.1f}" fill="#2e6a51" stroke="#c9b37a" stroke-dasharray="3 3"/>')
        out.append(f'<circle cx="{X(hx):.1f}" cy="{Y(hy):.1f}" r="{1.1*SCALE:.1f}" fill="#f4f1ea"/>')
    # panel footprint (front: the panel itself; back: shadow)
    if side == "F":
        out.append(rect(0, 0, PANEL_W, PANEL_H, fill="#111", stroke="#888", stroke_width=1))
        out.append(rect(0, 0, WINDOW_W, WINDOW_H, fill="#1d2833", stroke="none"))
        out.append(f'<text x="{X(0):.1f}" y="{Y(-2):.1f}" class="big">1.69" panel</text>')
        out.append(f'<text x="{X(0):.1f}" y="{Y(1.5):.1f}" class="sub">240 x 280, ST7789V2 + CST816T</text>')
        out.append(f'<text x="{X(0):.1f}" y="{Y(4.5):.1f}" class="sub">on foam pad, ~30 x 37 mm</text>')
    else:
        out.append(rect(0, 0, PANEL_W, PANEL_H, fill="none", stroke="#8fb3a2", stroke_width=1, stroke_dasharray="6 4"))
        out.append(f'<text x="{X(0):.1f}" y="{Y(17.6):.1f}" class="ghost">panel outline (front)</text>')
    # FPC slot (through board, both sides)
    out.append(rect(*SLOT, fill="#0b0b0b", stroke="#444"))
    if side == "F":
        out.append(f'<text x="{X(0):.1f}" y="{Y(22.4):.1f}" class="tiny">FPC slot</text>')
    # LEDs (front only)
    if side == "F":
        for i, (lx, ly) in enumerate(LEDS, 1):
            out.append(rect(lx, ly, LED_SIZE, LED_SIZE, fill=COL["led"], stroke="#7a5c00"))
            dx = 3.4 if lx < -20 else (-3.4 if lx > 20 else 0)
            dy = 0 if dx else (-2.2 if ly < 0 else 3.2)
            out.append(f'<text x="{X(lx+dx):.1f}" y="{Y(ly+dy)+3:.1f}" class="tiny">D{i}</text>')
    for ref, label, x, y, w, h, s, ck, note in PARTS:
        if s != side:
            continue
        dash = 'stroke-dasharray="4 3"' if ck == "dnp" else ""
        fill = "none" if ck == "dnp" else COL[ck]
        x0 = X(x) - w * SCALE / 2
        y0 = Y(y) - h * SCALE / 2
        out.append(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{w*SCALE:.1f}" height="{h*SCALE:.1f}" rx="2" '
                   f'fill="{fill}" fill-opacity="0.92" stroke="{COL[ck]}" stroke-width="1.5" {dash}/>')
        big = w * h > 40
        if big:
            out.append(f'<text x="{X(x):.1f}" y="{Y(y)-2:.1f}" class="ref">{ref}</text>')
            out.append(f'<text x="{X(x):.1f}" y="{Y(y)+12:.1f}" class="lbl">{label}</text>')
        else:
            out.append(f'<text x="{X(x):.1f}" y="{Y(y)+4:.1f}" class="refs">{ref}</text>')
    if side == "B":
        # antenna cable hint
        ax, ay = X(6.8), Y(-27.6)
        out.append(f'<path d="M{ax:.1f},{ay:.1f} C{ax:.1f},{oy-14:.1f} {ax-40:.1f},{oy-10:.1f} {ax-70:.1f},{oy-18:.1f}" '
                   f'fill="none" stroke="{COL["rf"]}" stroke-width="2.5"/>')
        out.append(f'<text x="{ax-76:.1f}" y="{oy-14:.1f}" class="note" style="text-anchor:end">cable to FPC antenna in case top</text>')
    # edge labels
    out.append(f'<text x="{ox+VIEW_W/2:.1f}" y="{oy+VIEW_H+28:.1f}" class="note">bottom edge: USB-C</text>')
    return "\n".join(out)


def legend(x, y):
    items = [("mcu", "module"), ("rf", "RF"), ("power", "power / USB"), ("logic", "logic"),
             ("conn", "connectors"), ("mech", "switches"), ("led", "WS2812B-2020 LEDs"), ("dnp", "not fitted (DNP)")]
    out = []
    for i, (k, t) in enumerate(items):
        xx = x + (i % 4) * 230
        yy = y + (i // 4) * 26
        dash = 'stroke-dasharray="4 3" fill="none"' if k == "dnp" else f'fill="{COL[k]}"'
        out.append(f'<rect x="{xx}" y="{yy-12}" width="16" height="16" rx="2" stroke="{COL[k]}" stroke-width="1.5" {dash}/>')
        out.append(f'<text x="{xx+24}" y="{yy+1}" class="leg">{t}</text>')
    return "\n".join(out)


def main():
    W = PAD * 2 + VIEW_W * 2 + GAP
    top = PAD + 70
    H = top + VIEW_H + 150
    css = """
    text { font-family: Geist, 'Helvetica Neue', Arial, sans-serif; text-anchor: middle; }
    .title { font-size: 26px; font-weight: 600; fill: #111; text-anchor: start; }
    .h { font-size: 19px; font-weight: 600; fill: #222; }
    .big { font-size: 17px; font-weight: 600; fill: #eee; }
    .sub { font-size: 12px; fill: #bbb; }
    .ghost { font-size: 12px; fill: #8fb3a2; }
    .ref { font-size: 15px; font-weight: 700; fill: #fff; }
    .lbl { font-size: 11px; fill: #f2f2f2; }
    .refs { font-size: 10px; font-weight: 700; fill: #fff; }
    .tiny { font-size: 10px; fill: #e8e2cf; }
    .note { font-size: 13px; fill: #555; }
    .leg { font-size: 14px; fill: #333; text-anchor: start; }
    """
    lx = PAD
    rx = PAD + VIEW_W + GAP
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" viewBox="0 0 {W:.0f} {H:.0f}">',
           f'<style>{css}</style>', f'<rect width="100%" height="100%" fill="#fbfaf7"/>',
           f'<text x="{PAD}" y="{PAD-18}" class="title">bzzy main board rev A: placement concept (to scale, 52 x 61 mm)</text>',
           f'<text x="{lx+VIEW_W/2:.1f}" y="{top-60}" class="h">Front (screen side)</text>',
           f'<text x="{rx+VIEW_W/2:.1f}" y="{top-60}" class="h">Back (seen from behind, mirrored)</text>',
           view(lx, top, "F"), view(rx, top, "B"),
           legend(PAD, top + VIEW_H + 80),
           '</svg>']
    Path(__file__).with_name("placement.svg").write_text("\n".join(svg))


if __name__ == "__main__":
    main()
