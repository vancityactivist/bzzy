// bzzy case, concept rev A: a glowing frame around the screen, clipped to a monitor.
//
// Four printed parts plus the LED ring board and the Waveshare board:
//   diffuser   front frame and sides, printed in translucent white (PETG or resin).
//              The LEDs light the whole frame, front and sides.
//   baffle     black sleeve round the screen, so LED light doesn't bleed into it
//   shell      back cover, opaque. Holds the boards and has the USB-C opening.
//   clip       slides onto the shell's rail and hooks over the top of the monitor
//
// Render one part for export:   openscad -D 'PART="diffuser"' -o diffuser.stl bzzy_case.scad
// PART = "assembly" shows everything; "exploded" pulls it apart.
//
// Axes: x right, y up, z towards you. z = 0 is the front face of the LED ring board.
// The board sizes come from board_dims.scad, which gen_led_ring.py writes.
//
// MEASURE BEFORE PRINTING: WS_W / WS_H / WS_T (in gen_led_ring.py), and below
// GLASS_Z, SCREEN_*, USB_* and BUTTON_* against your Waveshare board.

include <board_dims.scad>

PART = "exploded";  // assembly | exploded | diffuser | baffle | shell | clip

// ---------------------------------------------------------------- tunables
WALL = 1.8;          // side walls
FRONT_T = 1.2;       // front face of the diffuser: thin enough to glow evenly
FIT = 0.3;           // gap between printed parts and boards

GLASS_Z = 3.6;       // front of the Waveshare glass, measured from the ring board's front face
SCREEN_W = 28.6;     // visible screen window (1.69" panel active area is about 28 x 32.6)
SCREEN_H = 33.2;
SCREEN_R = 3.0;
SCREEN_DY = 0.0;     // window offset if the panel isn't centred on the Waveshare board

USB_W = 12.0;        // opening for the USB-C plug's overmould
USB_H = 6.5;
USB_X = 0.0;         // centre of the Waveshare board's USB-C socket
USB_Z = -3.5;        // ... and its height relative to the ring board's front face

BUTTON_D = 2.2;      // pinhole for the BOOT button (hold at power-up for Wi-Fi setup)
BUTTON_X = -8.0;     // ESTIMATE: set from your board
BUTTON_Z = -3.5;

MONITOR_T = 14;      // thickness of your monitor's top edge
CLIP_DROP = 22;      // how far the clip reaches down the back of the monitor
FRONT_LIP = 3;       // small hook down the front of the monitor

SCREW_D = 1.8;       // M2 self-tapping screw pilot (into the diffuser bosses)
SCREW_CLEAR = 2.4;   // M2 clearance through the shell
BOSS_D = 4.6;

// ---------------------------------------------------------------- derived
OUT_W = RING_W + 2 * (FIT + WALL);
OUT_H = RING_H + 2 * (FIT + WALL);
OUT_R = RING_R + FIT + WALL;
FRONT_Z = GLASS_Z + FRONT_T;                 // front face of the device
BACK_SPACE = WS_T - GLASS_Z + 2.5;           // room behind the ring board's front face
SHELL_Z = -BACK_SPACE - WALL;                // back face of the device
DEPTH = FRONT_Z - SHELL_Z;
holes = [for (h = RING_HOLES) [h[0], -h[1]]];   // KiCad y is down; OpenSCAD y is up

$fn = 48;

module rrect(w, h, r) {
  offset(r = r) square([w - 2 * r, h - 2 * r], center = true);
}

module rbox(w, h, r, z0, z1) {
  translate([0, 0, z0]) linear_extrude(z1 - z0) rrect(w, h, r);
}

// ---------------------------------------------------------------- reference models
module ring_pcb() {
  color("darkgreen") difference() {
    rbox(RING_W, RING_H, RING_R, -PCB_T, 0);
    rbox(CUT_W, CUT_H, CUT_R, -PCB_T - 1, 1);
    for (h = holes) translate([h[0], h[1], -5]) cylinder(d = 2.2, h = 10);
  }
  for (l = RING_LEDS) color("white") translate([l[0], -l[1], 0.4]) cube([2, 2, 0.8], center = true);
}

module waveshare() {
  color("steelblue") translate([0, 0, GLASS_Z - WS_T]) linear_extrude(WS_T - 1.2) rrect(WS_W, WS_H, 1.5);
  color("black") translate([0, 0, GLASS_Z - 1.2]) linear_extrude(1.2) rrect(WS_W - 1.5, WS_H - 1.5, 2.5);
}

// ---------------------------------------------------------------- parts
// Translucent front frame: front face + side skirt down past the ring board's edge.
module diffuser() {
  difference() {
    union() {
      difference() {
        rbox(OUT_W, OUT_H, OUT_R, -PCB_T, FRONT_Z);
        rbox(OUT_W - 2 * WALL, OUT_H - 2 * WALL, OUT_R - WALL, -PCB_T - 1, GLASS_Z);
      }
      // Bosses down to the ring board, for the M2 screws from the back.
      for (h = holes) translate([h[0], h[1], 0]) cylinder(d = BOSS_D, h = GLASS_Z + 0.01);
    }
    translate([0, SCREEN_DY, GLASS_Z - 1]) linear_extrude(FRONT_T + 2) rrect(SCREEN_W, SCREEN_H, SCREEN_R);
    for (h = holes) translate([h[0], h[1], -1]) cylinder(d = SCREW_D, h = GLASS_Z);
  }
}

// Opaque sleeve between the LEDs and the screen. Stands on the ring board's inner
// edge (clear of parts for 2 mm) and meets the diffuser's front face.
module baffle() {
  t = 1.0;
  difference() {
    rbox(CUT_W + 2 * t + 0.4, CUT_H + 2 * t + 0.4, CUT_R + t, 0, GLASS_Z);
    rbox(CUT_W + 0.4, CUT_H + 0.4, CUT_R, -1, GLASS_Z + 1);
  }
}

// Back cover. Its rim holds the ring board against the diffuser.
module shell() {
  difference() {
    union() {
      difference() {
        rbox(OUT_W, OUT_H, OUT_R, SHELL_Z, -PCB_T);
        rbox(OUT_W - 2 * WALL, OUT_H - 2 * WALL, OUT_R - WALL, SHELL_Z + WALL, 0);
      }
      // Ledge the ring board's back sits on, and screw posts.
      difference() {
        rbox(RING_W, RING_H, RING_R, -PCB_T - 1.5, -PCB_T);
        rbox(CUT_W + 6, CUT_H + 6, CUT_R + 3, -PCB_T - 2, 0);
      }
      for (h = holes) translate([h[0], h[1], SHELL_Z]) cylinder(d = BOSS_D + 1, h = -PCB_T - SHELL_Z);
      // Dovetail rail for the clip, down the back.
      translate([0, 0, SHELL_Z]) rotate([90, 0, 0])
        linear_extrude(OUT_H - 10, center = true) dovetail(14, 3);
    }
    // Notch in the ledge for J1's wire pads and the wires to the Waveshare board.
    translate([0, -27.0, -PCB_T - 1]) cube([12, 7, 4], center = true);
    for (h = holes) translate([h[0], h[1], SHELL_Z - 5]) {
      cylinder(d = SCREW_CLEAR, h = 20);
      cylinder(d = 4.2, h = 5 + 1.5);   // screw head pocket
    }
    // USB-C, bottom edge
    translate([USB_X, -OUT_H / 2, USB_Z]) cube([USB_W, 4 * WALL, USB_H], center = true);
    // BOOT button pinhole, bottom edge
    translate([BUTTON_X, -OUT_H / 2, BUTTON_Z]) rotate([90, 0, 0]) cylinder(d = BUTTON_D, h = 4 * WALL, center = true);
  }
}

module dovetail(w, h) {
  polygon([[-w / 2 + h, 0], [w / 2 - h, 0], [w / 2, -h], [-w / 2, -h]]);
}

// Hooks over the top of the monitor: the device stands on the monitor's top edge.
// Two legs, so the USB-C plug in the middle of the bottom edge stays clear.
module clip() {
  t = 2.4;
  leg_w = 8;
  y0 = -OUT_H / 2;                          // device's bottom edge
  plate_z = SHELL_Z - 3;                    // back of the rail
  rear_z = FRONT_Z - MONITOR_T;             // back face of the monitor
  shelf_back = min(plate_z - t, rear_z - t);
  plate_h = OUT_H - 14;
  difference() {
    // plate that slides up onto the rail; the closed bottom end is the stop
    translate([-OUT_W / 2 + 4, y0 - t, plate_z - t]) cube([OUT_W - 8, plate_h + t, t + 3]);
    translate([0, y0 + 5 + plate_h / 2, SHELL_Z]) rotate([90, 0, 0])
      linear_extrude(plate_h, center = true) offset(delta = 0.25) dovetail(14, 3);
    translate([USB_X, y0, plate_z]) cube([USB_W + 6, 30, 20], center = true);
  }
  for (sx = [-1, 1]) translate([sx * (OUT_W / 2 - 4 - leg_w / 2) - leg_w / 2, 0, 0]) {
    translate([0, y0 - t, shelf_back]) cube([leg_w, t, FRONT_Z - shelf_back]);             // shelf
    translate([0, y0 - t - FRONT_LIP, FRONT_Z - t]) cube([leg_w, FRONT_LIP + t, t]);       // front lip
    translate([0, y0 - t - CLIP_DROP, rear_z - t]) cube([leg_w, CLIP_DROP + t, t]);        // rear drop
  }
}

// ---------------------------------------------------------------- layout
module assembly(gap = 0) {
  translate([0, 0, 3 * gap]) color("white", 0.55) diffuser();
  translate([0, 0, 2 * gap]) color("#222") baffle();
  translate([0, 0, gap]) { ring_pcb(); waveshare(); }
  color("#333") shell();
  translate([0, 0, -gap]) color("#555") clip();
}

// Previews stand the device up (front facing -y) so the default camera makes sense.
if (PART == "assembly") rotate([90, 0, 0]) assembly();
else if (PART == "exploded") rotate([90, 0, 0]) assembly(14);
else if (PART == "diffuser") rotate([180, 0, 0]) diffuser();   // print face down
else if (PART == "baffle") baffle();
else if (PART == "shell") translate([0, 0, -SHELL_Z]) shell();
else if (PART == "clip") rotate([0, -90, 0]) clip();

echo(str("bzzy case: ", OUT_W, " x ", OUT_H, " x ", DEPTH, " mm (w x h x d), plus the clip"));
