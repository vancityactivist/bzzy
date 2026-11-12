// bzzy case (black, 2026-11): a black case with the screen in the middle of a frosted
// white border, about 1 cm wide, that the LED ring lights. Clips to a monitor.
//
// Printed parts, by material:
//   light    FROSTED WHITE. The glowing border. Translucent white PETG or resin.
//   frame    BLACK. Front rim and the four side walls. USB-C, BOOT and top-button holes.
//   back     BLACK. Back plate with screw posts and the dovetail rail for the clip.
//   trim     BLACK. Sleeve round the Waveshare board and the thin trim round the
//            screen. Keeps LED light off the display.
//   button   BLACK. Cap for the top button. Sits in the frame's top wall.
//   clip     BLACK (needs a little flex: PETG or nylon). Hooks over the monitor.
//
// Render one part:   openscad -D 'PART="light"' -o light.stl bzzy_case.scad
// PART = "assembly" shows everything; "exploded" pulls it apart.
//
// Axes: x right, y up, z towards you. z = 0 is the front face of the LED ring board.
// The board sizes come from board_dims.scad, which gen_led_ring.py writes.
//
// How it holds together: four M2 screws go in from the back, through the back
// plate's posts and the ring board, into bosses on the light ring. That pulls the
// light ring back, and its outer lip clamps the frame's front rim against the
// back plate. No glue.
//
// MEASURE BEFORE PRINTING: WS_W / WS_H / WS_T (in gen_led_ring.py), and below
// GLASS_Z, SCREEN_*, USB_* and BOOT_* against your Waveshare board.

include <board_dims.scad>

PART = "exploded";  // assembly | exploded | light | frame | back | trim | button | clip
LOGO = "top";       // where the bzzy wordmark goes: top | chin | back | none

// ---------------------------------------------------------------- tunables
WALL = 2.6;          // black side walls
FIT = 0.3;           // gap between printed parts and the ring board
SLIDE = 0.15;        // gap between two printed parts that slide together

GLASS_Z = 3.6;       // front of the Waveshare glass, measured from the ring board's front face
TRIM_T = 1.2;        // black trim over the edge of the glass
LIGHT_T = 1.6;       // frosted front: thin enough to glow, thick enough to hide the LEDs
LIP = 1.0;           // the light ring's lip over the frame's front rim (width and depth)

SCREEN_W = 28.6;     // visible screen window (1.69" panel active area is about 28 x 32.6)
SCREEN_H = 33.2;
SCREEN_R = 3.0;
SCREEN_DY = 0.0;     // window offset if the panel isn't centred on the Waveshare board

USB_W = 12.0;        // opening for the USB-C plug's overmould
USB_H = 6.5;
USB_X = 0.0;         // centre of the Waveshare board's USB-C socket
USB_Z = -3.5;        // ... and its height relative to the ring board's front face

BOOT_D = 2.2;        // pinhole for the BOOT button (hold at power-up for Wi-Fi setup)
BOOT_X = -8.0;       // ESTIMATE: set from your board
BOOT_Z = -3.5;

TOP_BTN_Z = 0.8;     // height of the top button's plunger above the ring board (Alps SKRT: about 0.8)
BTN_W = 6.0;         // button cap, as seen from above
BTN_D = 2.4;         // ... and its depth (front to back)
BTN_PROUD = 0.8;     // how far it stands above the top face
BTN_FLANGE = 1.6;    // flange round the cap, inside the wall, that stops it falling out
BTN_FLANGE_T = 1.0;  // flange thickness. Its inner face rests 0.1 mm off the switch's plunger
BTN_PLAY = 0.5;      // the cap can float this far outwards. The switch only travels 0.2 mm and
                     // the board's routed edge is +-0.2 mm, so this keeps a long board from
                     // holding the button down (which would boot into setup every time)

LOGO_SIZE = 5.5;     // wordmark letter size
LOGO_DEPTH = 0.6;    // deboss depth
LOGO_FONT = "Geist:style=SemiBold";   // the app's wordmark font, in fonts/
CHIN = 9;            // extra black below the border, only when LOGO = "chin"

MONITOR_T = 14;      // thickness of your monitor's top edge
CLIP_DROP = 22;      // how far the clip reaches down the back of the monitor
FRONT_LIP = 3;       // small hook down the front of the monitor

SCREW_D = 1.8;       // M2 self-tapping screw pilot (into the light ring's bosses)
SCREW_CLEAR = 2.4;   // M2 clearance through the back plate
BOSS_D = 4.6;
BACK_T = 2.0;        // back plate

use <fonts/Geist-SemiBold.ttf>

// ---------------------------------------------------------------- derived
IN_W = RING_W + 2 * FIT;                     // inside of the frame
IN_H = RING_H + 2 * FIT;
IN_R = RING_R + FIT;
LIGHT_W = IN_W + 2 * LIP;                    // light ring's outer edge, as seen from the front
LIGHT_H = IN_H + 2 * LIP;
OUT_W = IN_W + 2 * WALL;                     // outside of the case
OUT_H = IN_H + 2 * WALL;
OUT_R = IN_R + WALL;
SLEEVE = 0.8;                                // black sleeve round the Waveshare board
SLV_W = CUT_W + 0.4 + 2 * SLEEVE;            // ... its outside (clears U1 and R2 at the bottom)
SLV_H = CUT_H + 0.4 + 2 * SLEEVE;
SLV_R = CUT_R + SLEEVE;

FRONT_Z = GLASS_Z + TRIM_T;                  // front face of the device
PLATE_Z = FRONT_Z - LIGHT_T;                 // back of the frosted front
BACK_SPACE = WS_T - GLASS_Z + 2.5;           // room behind the ring board's front face
SEAM_Z = -BACK_SPACE;                        // frame meets back plate here
SHELL_Z = SEAM_Z - BACK_T;                   // back face of the device
DEPTH = FRONT_Z - SHELL_Z;
CHIN_H = LOGO == "chin" ? CHIN : 0;
RAIL_L = OUT_H - 10 - (LOGO == "back" ? 14 : 0);   // dovetail rail on the back
RAIL_Y = -OUT_H / 2 + 5 + RAIL_L / 2;
BORDER_X = (LIGHT_W - SLV_W) / 2;            // visible width of the frosted border
BORDER_Y = (LIGHT_H - SLV_H) / 2;
holes = [for (h = RING_HOLES) [h[0], -h[1]]];   // KiCad y is down; OpenSCAD y is up
NOTCH = is_undef(NOTCH_W) ? 0 : NOTCH_W;        // rev C board: open at the bottom for the USB-C plug
POST_D = is_undef(HOLE_KEEPOUT_R) ? BOSS_D + 1 : min(BOSS_D + 1, 2 * HOLE_KEEPOUT_R);  // back posts sit on bare board

$fn = 48;

module rrect(w, h, r) {
  offset(r = r) square([w - 2 * r, h - 2 * r], center = true);
}

module rbox(w, h, r, z0, z1) {
  translate([0, 0, z0]) linear_extrude(z1 - z0) rrect(w, h, r);
}

// Outline of the case: the frame's outside, plus the chin if there is one.
module case2d(grow = 0) {
  hull() {
    rrect(OUT_W + 2 * grow, OUT_H + 2 * grow, OUT_R + grow);
    translate([0, -CHIN_H]) rrect(OUT_W + 2 * grow, OUT_H + 2 * grow, OUT_R + grow);
  }
}

module case_box(z0, z1, grow = 0) {
  translate([0, 0, z0]) linear_extrude(z1 - z0) case2d(grow);
}

module wordmark(size = LOGO_SIZE) {
  text("bzzy", size = size, font = LOGO_FONT, halign = "center", valign = "center", spacing = 0.94);
}

// ---------------------------------------------------------------- reference models
module ring_pcb() {
  color("#1b1b1b") difference() {
    rbox(RING_W, RING_H, RING_R, -PCB_T, 0);
    rbox(CUT_W, CUT_H, CUT_R, -PCB_T - 1, 1);
    if (NOTCH > 0) translate([-NOTCH / 2, -RING_H / 2 - 1, -PCB_T - 1]) cube([NOTCH, RING_H / 2, PCB_T + 2]);
    for (h = holes) translate([h[0], h[1], -5]) cylinder(d = 2.2, h = 10);
  }
  for (l = RING_LEDS) color("white") translate([l[0], -l[1], 0.4]) cube([2, 2, 0.8], center = true);
  color("silver") translate([TOP_BUTTON_X, RING_H / 2 - 1.5, 0.7]) cube([3.5, 3, 1.4], center = true);
}

// USB-C plug in the Waveshare socket, for checking clearances: metal shell plus
// a USB_W x USB_H overmould from 6.5 mm out from the board edge to past the case.
module usb_plug() {
  y_edge = -WS_H / 2;
  translate([USB_X, y_edge - 3.3, USB_Z]) cube([8.3, 6.6, 2.5], center = true);
  translate([USB_X - USB_W / 2 + 0.3, -OUT_H / 2 - CHIN_H - 10, USB_Z - USB_H / 2 + 0.3])
    cube([USB_W - 0.6, (y_edge - 6.5) + OUT_H / 2 + CHIN_H + 10, USB_H - 0.6]);
}

module waveshare() {
  color("steelblue") translate([0, 0, GLASS_Z - WS_T]) linear_extrude(WS_T - 1.2) rrect(WS_W, WS_H, 1.5);
  color("#0d0d0d") translate([0, 0, GLASS_Z - 1.2]) linear_extrude(1.2) rrect(WS_W - 1.5, WS_H - 1.5, 2.5);
  color("#3a6ea5") translate([0, SCREEN_DY, GLASS_Z - 0.05]) linear_extrude(0.1) rrect(SCREEN_W - 0.4, SCREEN_H - 0.4, SCREEN_R);
}

// ---------------------------------------------------------------- parts

// Frosted border. A flat front, an outer lip that clamps the frame's rim, a skirt
// for stiffness, and four bosses that the screws pull on. Print it face down.
module light() {
  o_w = IN_W - 2 * SLIDE;                    // fits inside the frame
  o_h = IN_H - 2 * SLIDE;
  o_r = IN_R - SLIDE;
  skirt = 1.0;
  skirt_z0 = 2.2;                            // clears C2, C3, J1 and the button cap's flange
  difference() {
    union() {
      rbox(o_w, o_h, o_r, PLATE_Z, FRONT_Z);                      // frosted front
      rbox(LIGHT_W, LIGHT_H, IN_R + LIP, FRONT_Z - LIP, FRONT_Z);  // lip over the frame's rim
      difference() {                                                // skirt
        rbox(o_w, o_h, o_r, skirt_z0, PLATE_Z + 0.01);
        rbox(o_w - 2 * skirt, o_h - 2 * skirt, o_r - skirt, 0, FRONT_Z);
      }
      for (h = holes) translate([h[0], h[1], 0]) cylinder(d = BOSS_D, h = PLATE_Z + 0.01);
    }
    rbox(SLV_W + 2 * SLIDE, SLV_H + 2 * SLIDE, SLV_R + SLIDE, -1, FRONT_Z + 1);   // the screen trim fits here
    for (h = holes) translate([h[0], h[1], -1]) cylinder(d = SCREW_D, h = PLATE_Z);
  }
}

// Black front rim and side walls. Print it face down.
module frame() {
  y_top = IN_H / 2;
  difference() {
    case_box(SEAM_Z, FRONT_Z);
    rbox(IN_W, IN_H, IN_R, SEAM_Z - 1, FRONT_Z - LIP);                                  // inside
    rbox(LIGHT_W + 2 * SLIDE, LIGHT_H + 2 * SLIDE, IN_R + LIP + SLIDE, FRONT_Z - LIP - 0.01, FRONT_Z + 1);  // light ring's lip
    // USB-C, bottom edge (straight through the chin, if there is one)
    translate([USB_X, -OUT_H / 2 - CHIN_H / 2, USB_Z]) cube([USB_W, 4 * WALL + CHIN_H + 2, USB_H], center = true);
    // BOOT pinhole, bottom edge
    translate([BOOT_X, -OUT_H / 2 - CHIN_H / 2, BOOT_Z]) rotate([90, 0, 0])
      cylinder(d = BOOT_D, h = 4 * WALL + CHIN_H + 2, center = true);
    // Top button: a hole through the top wall, and a pocket inside for the cap's flange.
    translate([TOP_BUTTON_X, y_top + WALL / 2, TOP_BTN_Z])
      cube([BTN_W + 2 * SLIDE, WALL + 2, BTN_D + 2 * SLIDE], center = true);
    translate([TOP_BUTTON_X, y_top, 0]) btn_flange2d(SLIDE, 2 * (BTN_Y1 + BTN_PLAY - y_top));
    // wordmark
    if (LOGO == "top") logo_top_cut();
    if (LOGO == "chin") logo_chin_cut();
  }
}

// On the top face, right of the button. Reads correctly from in front of the device.
// The cap's flange, round the key on three sides: not on the front side, where
// the frame's rim is thin. Centred on y = 0 here.
module btn_flange2d(grow, depth) {
  z0 = TOP_BTN_Z - BTN_D / 2 - BTN_FLANGE - grow;
  z1 = TOP_BTN_Z + BTN_D / 2 + grow;
  translate([0, 0, (z0 + z1) / 2]) cube([BTN_W + 2 * BTN_FLANGE + 2 * grow, depth, z1 - z0], center = true);
}

module logo_top_cut() {
  translate([TOP_BUTTON_X + (OUT_W / 2 - OUT_R + BTN_W / 2) / 2 + 2, OUT_H / 2 - LOGO_DEPTH, (SEAM_Z + FRONT_Z) / 2])
    rotate([-90, 0, 0]) linear_extrude(LOGO_DEPTH + 1) wordmark();
}

// On the front, centred in the chin below the border.
module logo_chin_cut() {
  translate([0, (-(LIGHT_H / 2 + SLIDE) - (OUT_H / 2 + CHIN_H)) / 2, FRONT_Z - LOGO_DEPTH])
    linear_extrude(LOGO_DEPTH + 1) wordmark(min(LOGO_SIZE, CHIN_H * 0.6));
}

// Black sleeve round the Waveshare board, with the trim round the screen on its
// front and a ledge that the light ring holds down. Print it face down.
module trim() {
  difference() {
    union() {
      rbox(SLV_W, SLV_H, SLV_R, 0, FRONT_Z);
      rbox(SLV_W + 1.6, SLV_H + 1.6, SLV_R + 0.8, PLATE_Z - 0.8, PLATE_Z);   // ledge under the light ring (clear of parts)
    }
    rbox(CUT_W + 0.4, CUT_H + 0.4, CUT_R, -1, GLASS_Z);                     // the Waveshare board
    translate([0, SCREEN_DY, 0]) rbox(SCREEN_W, SCREEN_H, SCREEN_R, -1, FRONT_Z + 1);   // screen window
  }
}

// Black back plate. Posts press the ring board forward; the screws go through them.
module back() {
  lip = 1.2;
  difference() {
    union() {
      case_box(SHELL_Z, SEAM_Z);
      difference() {                                                         // locates in the frame
        rbox(IN_W - 2 * SLIDE, IN_H - 2 * SLIDE, IN_R - SLIDE, SEAM_Z - 0.01, SEAM_Z + 1.5);
        rbox(IN_W - 2 * SLIDE - 2 * lip, IN_H - 2 * SLIDE - 2 * lip, IN_R - SLIDE - lip, SEAM_Z - 1, SEAM_Z + 2);
      }
      for (h = holes) translate([h[0], h[1], SEAM_Z - 0.01]) cylinder(d = POST_D, h = -PCB_T - SEAM_Z);
      // dovetail rail for the clip, down the back
      translate([0, RAIL_Y, SHELL_Z]) rotate([90, 0, 0]) linear_extrude(RAIL_L, center = true) dovetail(14, 3);
    }
    for (h = holes) translate([h[0], h[1], SHELL_Z - 5]) {
      cylinder(d = SCREW_CLEAR, h = 20);
      cylinder(d = 4.2, h = 5 + 1.5);                                         // screw head pocket
    }
    if (LOGO == "back")   // reads from behind
      translate([0, OUT_H / 2 - 8, SHELL_Z - 1]) mirror([1, 0, 0]) linear_extrude(LOGO_DEPTH + 1) wordmark();
  }
}

module dovetail(w, h) {
  polygon([[-w / 2 + h, 0], [w / 2 - h, 0], [w / 2, -h], [-w / 2, -h]]);
}

// Top button cap: a rounded key through the top wall, and a flange that keeps it
// in. Its x comes from the board file, and the case locates the board on its screw
// holes, so the cap lines up with the switch. Print it flange down.
BTN_Y0 = RING_H / 2 + 0.1;                   // flange's inner face (plunger tip is on the board edge)
BTN_Y1 = BTN_Y0 + BTN_FLANGE_T;              // flange's outer face

module button() {
  translate([TOP_BUTTON_X, BTN_Y1 - 0.01, TOP_BTN_Z]) rotate([-90, 0, 0])
    linear_extrude(OUT_H / 2 - BTN_Y1 + BTN_PROUD + 0.01) offset(r = 0.8) square([BTN_W - 1.6, BTN_D - 1.6], center = true);
  translate([TOP_BUTTON_X, (BTN_Y0 + BTN_Y1) / 2, 0]) btn_flange2d(0, BTN_Y1 - BTN_Y0);
}

// Hooks over the top of the monitor: the device stands on the monitor's top edge.
// Two legs, so the USB-C plug in the middle of the bottom edge stays clear.
module clip() {
  t = 2.4;
  leg_w = 8;
  y0 = -OUT_H / 2 - CHIN_H;                 // device's bottom edge
  plate_z = SHELL_Z - 3;                    // back of the rail
  rear_z = FRONT_Z - MONITOR_T;             // back face of the monitor
  shelf_back = min(plate_z - t, rear_z - t);
  plate_h = RAIL_L - 4;
  rail_y0 = RAIL_Y - RAIL_L / 2;            // bottom end of the rail
  difference() {
    // plate that slides up onto the rail; the closed bottom end is the stop
    translate([-OUT_W / 2 + 4, y0 - t, plate_z - t]) cube([OUT_W - 8, rail_y0 - y0 + plate_h + t, t + 3]);
    translate([0, rail_y0 + plate_h / 2, SHELL_Z]) rotate([90, 0, 0])
      linear_extrude(plate_h + 0.01, center = true) offset(delta = 0.25) dovetail(14, 3);
    translate([USB_X, y0, plate_z]) cube([USB_W + 6, 30, 20], center = true);
  }
  for (sx = [-1, 1]) translate([sx * (OUT_W / 2 - 4 - leg_w / 2) - leg_w / 2, 0, 0]) {
    translate([0, y0 - t, shelf_back]) cube([leg_w, t, FRONT_Z - shelf_back]);             // shelf
    translate([0, y0 - t - FRONT_LIP, FRONT_Z - t]) cube([leg_w, FRONT_LIP + t, t]);       // front lip
    translate([0, y0 - t - CLIP_DROP, rear_z - t]) cube([leg_w, CLIP_DROP + t, t]);        // rear drop
  }
}

// ---------------------------------------------------------------- layout
BLACK = "#2a2a2a";
GLOW = "";           // preview only: e.g. "#ff3b30" shows the border lit in that colour
FROST = GLOW == "" ? [0.93, 0.93, 0.95] : GLOW;

module assembly(gap = 0, show_clip = true) {
  // render() turns each part into a mesh first, which keeps the preview free of flicker.
  translate([0, 0, 6 * gap]) color(FROST) render() light();
  translate([0, 0, 3 * gap]) color("#151515") render() trim();
  translate([0, 0, 2 * gap]) { ring_pcb(); waveshare(); }
  translate([0, 0, 4 * gap]) color(BLACK) render() frame();
  translate([0, gap * 0.6, 4 * gap]) color("#3a3a3a") render() button();
  color(BLACK) render() back();
  if (show_clip) translate([0, 0, -gap]) color("#444") render() clip();
}

// Previews stand the device up (front facing -y) so the default camera makes sense.
if (PART == "assembly") rotate([90, 0, 0]) assembly();
else if (PART == "exploded") rotate([90, 0, 0]) assembly(14);
else if (PART == "noclip") rotate([90, 0, 0]) assembly(show_clip = false);
else if (PART == "light") rotate([180, 0, 0]) translate([0, 0, -FRONT_Z]) light();    // face down
else if (PART == "frame") rotate([180, 0, 0]) translate([0, 0, -FRONT_Z]) frame();    // face down
else if (PART == "trim") rotate([180, 0, 0]) translate([0, 0, -FRONT_Z]) trim();      // face down
else if (PART == "back") translate([0, 0, 3 - SHELL_Z]) back();   // on its rail (MJF/SLA: any way up)
else if (PART == "button") translate([0, 0, -BTN_Y0]) rotate([90, 0, 0]) translate([-TOP_BUTTON_X, 0, 0]) button();   // flange down
else if (PART == "clip") rotate([0, -90, 0]) clip();

echo(str("bzzy case: ", OUT_W, " x ", OUT_H + CHIN_H, " x ", DEPTH, " mm (w x h x d), plus the clip. ",
         "Frosted border: ", BORDER_X, " mm at the sides, ", BORDER_Y, " mm top and bottom"));
