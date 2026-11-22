// bzzy mounts (2026-11): parts that slide onto the case's mount rail.
//
// Every mount starts from the same carriage: a block with a dovetail slot that fits
// the rail on the back plate (the standard is in hardware/README.md, "Mount rail").
// The slot is open at the top and closed at the bottom, so the device drops in from
// above and its weight sits on the closed end. A small sprung tongue in the slot's
// floor clicks over the top end of the rail, so a knock doesn't lift the device off.
// The snap is all in the mount: the rail itself is unchanged.
//
//   stand    Desk stand. Leans the device back 15 degrees.
//   tripod   1/4"-20 camera thread (a captured hex nut), for mini tripods, phone
//            arms, monitor-arm camera mounts and the like.
//   magnet   Flat plate with pockets for four 10 x 3 mm disc magnets. Sticks to
//            steel. Without magnets, it's a wall plate for double-sided tape.
//
// Render one mount:   openscad -D 'MOUNT="stand"' -o stand.stl bzzy_mounts.scad
// MOUNT = "show_stand" (or show_tripod, show_magnet) shows it with the device on it.
//
// Same axes as bzzy_case.scad: x right, y up, z towards you, z = 0 the ring board's
// front face. The carriage is drawn where it sits on the device.

include <bzzy_case.scad>
PART = "none";       // the case file draws nothing; this file picks what to draw

MOUNT = "show_stand";   // stand | tripod | magnet | show_stand | show_tripod | show_magnet

// ---------------------------------------------------------------- tunables
FLOOR = 2.4;         // carriage wall behind the slot
CAR_GAP = 0.2;       // gap between the carriage and the device's back face
CAR_END = 2.4;       // closed bottom end of the slot (the stop)

// The snap: a tongue in the slot's floor with a bump at its free end. The bump stands
// SNAP_H proud of the floor, which is SNAP_H - RAIL_FIT into the rail's outer face.
// About 0.35 mm on a 10 mm PA12/PETG tongue: you feel a click, and it takes a firm
// lift (roughly half a kilo) to pull the device off. Make SNAP_H smaller to soften it.
SNAP_H = 0.6;
TONGUE_W = 6;
TONGUE_L = 10;
TONGUE_SLIT = 0.8;   // cuts either side of the tongue
TONGUE_RELIEF = 0.8; // tongue is this much thinner than the floor, so it can flex
                     // even when the plate's back is flat against a wall

STAND_TILT = 15;     // degrees back from upright
STAND_BASE_T = 3;
STAND_CLEAR = 1;     // the device's lowest (back bottom) edge above the base
STAND_DEPTH = 46;    // base, behind the device's bottom front edge
STAND_FRONT = 10;    // base in front of the device. The frosted band's bottom edge throws
                     // the status colour onto it, which the owner sees from behind
STAND_R = 10;        // corner radius of the base, seen from above
STAND_SOFT = 1.6;    // rounded top edge of the base, and the spine's rounding

// 1/4"-20 UNC hex nut: 7/16" (11.11 mm) across flats, 7/32" (5.56 mm) thick.
NUT_AF = 11.11 + 0.1;  // press fit. Loose? A drop of glue.
NUT_T = 5.56 + 0.3;
NUT_FLOOR = 2.4;     // under the nut. Tripod screws stand 4.5 to 6 mm proud, so this leaves 2 to 3 mm of thread
TRIPOD_HOLE = 6.8;

MAG_D = 10;          // disc magnets, 10 x 3 mm (N52 or N42)
MAG_T = 3;
MAG_FIT = 0.2;

// ---------------------------------------------------------------- carriage
RAIL_Y0 = RAIL_Y - RAIL_L / 2;               // bottom end of the rail
RAIL_Y1 = RAIL_Y + RAIL_L / 2;               // top end
SLOT_Z = SHELL_Z - RAIL_T - RAIL_FIT;        // slot floor
CAR_Z0 = SLOT_Z - FLOOR;                     // carriage back face
CAR_Z1 = SHELL_Z - CAR_GAP;                  // carriage front face
CAR_Y0 = RAIL_Y0 - CAR_END;
SNAP_Y = RAIL_Y1 + 0.1;                      // bump's catching face, just above the rail's end
CAR_Y1 = SNAP_Y + SNAP_H + SNAP_H / tan(30) + 0.2;   // carriage top: 45-degree catch, 30-degree lead-in
TONGUE_Y0 = CAR_Y1 - TONGUE_L;

module carriage(w, r = 2) {
  difference() {
    translate([0, (CAR_Y0 + CAR_Y1) / 2, CAR_Z0]) linear_extrude(CAR_Z1 - CAR_Z0)
      rrect(w, CAR_Y1 - CAR_Y0, r);
    slot();
    // slits either side of the tongue, and its thinner back
    for (s = [-1, 1]) translate([s * (TONGUE_W + TONGUE_SLIT) / 2, (TONGUE_Y0 + CAR_Y1 + 1) / 2, (CAR_Z0 + SLOT_Z) / 2])
      cube([TONGUE_SLIT, CAR_Y1 + 1 - TONGUE_Y0, SLOT_Z - CAR_Z0 + 0.02], center = true);
    tongue_relief(0);
  }
  // the bump, across the tongue's tip
  translate([-TONGUE_W / 2, 0, 0]) rotate([90, 0, 90]) linear_extrude(TONGUE_W)
    polygon([[SNAP_Y, SLOT_Z - 0.01], [SNAP_Y + SNAP_H, SLOT_Z + SNAP_H],
             [SNAP_Y + SNAP_H + SNAP_H / tan(30), SLOT_Z - 0.01]]);
}

// The dovetail slot: the rail's profile grown by RAIL_FIT, closed at RAIL_Y0, open at the top.
module slot() {
  translate([0, (RAIL_Y0 + CAR_Y1 + 1) / 2, SHELL_Z]) rotate([90, 0, 0])
    linear_extrude(CAR_Y1 + 1 - RAIL_Y0, center = true) offset(delta = RAIL_FIT) dovetail(RAIL_W, RAIL_T);
}

// Room behind the tongue. Anything a mount adds behind the carriage must leave this
// empty (deep > 0), or the tongue can't flex.
module tongue_relief(deep) {
  w = TONGUE_W + 2 * TONGUE_SLIT;
  translate([-w / 2, TONGUE_Y0, CAR_Z0 - deep - 0.01]) cube([w, CAR_Y1 + 1 - TONGUE_Y0, TONGUE_RELIEF + deep + 0.01]);
}

// Room the device needs, for cutting out of mounts that reach round it.
module device_keepout() {
  case_box(SHELL_Z - 0.01, FRONT_Z + 0.5, 0.4);
}

// ---------------------------------------------------------------- desk stand
// Built standing on the table: X right, Y away from you, Z up. stand_place() puts
// device coordinates there, front facing you, leaning back STAND_TILT, with the
// bottom front edge at Y = 0 and the back bottom edge STAND_CLEAR above the base.
STAND_LIFT = STAND_BASE_T + STAND_CLEAR + DEPTH * sin(STAND_TILT);
module stand_place() {
  translate([0, 0, STAND_LIFT]) rotate([-STAND_TILT, 0, 0]) rotate([90, 0, 0])
    translate([0, OUT_H / 2 + CHIN_H, -FRONT_Z]) children();
}

STAND_W = OUT_W - 6;

module spine_slab(w) {
  translate([-w / 2, CAR_Y0, CAR_Z0 - 0.01]) cube([w, 0.55 * (CAR_Y1 - CAR_Y0), 0.02]);
}

// A slab with rounded corners and a rounded top edge (radius soft), flat underneath.
module soft_slab(w, d, r, t, soft) {
  hull() {
    linear_extrude(t - soft) rrect(w, d, r);
    for (a = [15 : 15 : 90])
      translate([0, 0, t - soft + soft * sin(a) - 0.01]) linear_extrude(0.01) rrect(w - 2 * soft * (1 - cos(a)), d - 2 * soft * (1 - cos(a)), r - soft * (1 - cos(a)));
  }
}

// Soft, rounded stand: rounded base, rounded spine, rounded carriage corners.
module stand() {
  spine_w = 22 - 2 * STAND_SOFT;
  difference() {
    union() {
      stand_place() carriage(26, 4);
      // spine: from the back of the carriage straight down to the base, and back to
      // its rear edge. All of it is behind the carriage's back face. Rounded all over.
      minkowski() {
        hull() {
          stand_place() spine_slab(spine_w);
          linear_extrude(STAND_BASE_T) projection() stand_place() spine_slab(spine_w);
          translate([-spine_w / 2, STAND_DEPTH - 14, 0]) cube([spine_w, 8, STAND_BASE_T]);
        }
        sphere(r = STAND_SOFT, $fn = 16);
      }
      // base
      translate([0, (STAND_DEPTH - STAND_FRONT) / 2, 0]) soft_slab(STAND_W, STAND_DEPTH + STAND_FRONT, STAND_R, STAND_BASE_T, STAND_SOFT);
    }
    stand_place() { device_keepout(); tongue_relief(3); }
    translate([0, 0, -50]) cube(100, center = true);   // flat underneath
  }
}

// ---------------------------------------------------------------- tripod adapter
// A block behind the bottom of the carriage, with the nut pocket open at the top and
// the screw hole underneath. The block reaches 2 mm below the device, so the
// device's bottom edge stays off the tripod's plate.
TRI_W = 22;
TRI_D = 17;          // block depth, behind the carriage
TRI_Y0 = -OUT_H / 2 - CHIN_H - 2;
TRI_AXIS_Z = CAR_Z0 - TRI_D / 2;

module tripod() {
  difference() {
    union() {
      carriage(26);
      hull() {
        translate([-TRI_W / 2, TRI_Y0, CAR_Z0 - TRI_D]) cube([TRI_W, NUT_FLOOR + NUT_T + 1.2, TRI_D + 0.01]);
        translate([-13, TRI_Y0, CAR_Z0 - 0.01]) cube([26, CAR_Y0 - TRI_Y0 + 14, 0.02]);   // blends into the carriage
      }
      translate([-13, TRI_Y0, CAR_Z0]) cube([26, CAR_Y0 - TRI_Y0 + 0.01, CAR_Z1 - CAR_Z0]);   // carriage foot
    }
    device_keepout();
    tongue_relief(3);
    translate([0, TRI_Y0 - 1, TRI_AXIS_Z]) rotate([-90, 0, 0]) cylinder(d = TRIPOD_HOLE, h = 50);
    translate([0, TRI_Y0 + NUT_FLOOR, TRI_AXIS_Z]) rotate([-90, 0, 0]) rotate([0, 0, 30])
      cylinder(d = NUT_AF / cos(30), h = 50, $fn = 6);
  }
}

// ---------------------------------------------------------------- magnet plate
MAG_W = 46;
MAG_X = 15;
mag_pockets = [for (x = [-MAG_X, MAG_X]) for (y = [CAR_Y0 + 9, CAR_Y1 - 9]) [x, y]];

module magnet() {
  difference() {
    carriage(MAG_W, 4);
    for (p = mag_pockets) translate([p[0], p[1], CAR_Z0 - 0.01]) cylinder(d = MAG_D + MAG_FIT, h = MAG_T + 0.1, $fn = 64);
  }
}

// ---------------------------------------------------------------- layout
// Each STL is turned the way it prints best. MJF or resin: any way up.
if (MOUNT == "stand") stand();                                                // base down
else if (MOUNT == "tripod") translate([0, 0, -TRI_Y0]) rotate([90, 0, 0]) tripod();   // screw face down
else if (MOUNT == "magnet") translate([0, 0, -CAR_Z0]) magnet();                 // back face down
else if (MOUNT == "show_stand") { stand(); stand_place() assembly(show_clip = false); }
else if (MOUNT == "show_tripod") rotate([90, 0, 0]) { color("#444") tripod(); assembly(show_clip = false); }
else if (MOUNT == "show_magnet") rotate([90, 0, 0]) { color("#444") magnet(); assembly(show_clip = false); }

echo(str("bzzy mounts: carriage ", CAR_Y1 - CAR_Y0, " mm tall, ", CAR_Z1 - CAR_Z0, " mm deep; snap ",
         SNAP_H - RAIL_FIT, " mm into the rail; rail ", RAIL_L, " mm"));
