// Five Star Taxi controller case: a tub with the Raspberry Pi inside, and a lid that carries the
// joystick and the two buttons. Units are millimetres. X runs left to right as the player holds it,
// Y away from the player, Z up from the bottom of the case.
//
// Export one part at a time (OpenSCAD: set `part`, render with F6, then File > Export > STL), or
// from a terminal:  openscad -D 'part="lid"' -o lid.stl controller_case.scad
//
//   tub       the bottom half: walls, Pi standoffs, lid screw bosses. Print floor down.
//   lid       the top: holes for the stick, buttons and screen, posts the boards screw onto.
//             Printed upside down (top face on the bed), already turned over in this export.
//   coupon    two small pieces of the lid, the joystick corner and one button, to check the fit
//             (about 30 minutes) before printing the whole lid.
//   assembly  everything in place with stand-ins for the boards, for looking at.
//   open      the same with the lid lifted off.
//   check     what overlaps between the case and the boards: should render empty.

part = "assembly";

// ---------------------------------------------------------------- measured on the real parts
JOY_HOUSING = 13.14;   // table to the top of the joystick's round housing (31.35 - 18.21)
JOY_CAP = 18.21;       // housing top to the top of the thumb cap
BTN_BODY = 4.68;       // button board top to the top of the square switch body
BTN_CAP = 3.46;        // the round cap above the switch body
PCB = 1.6;             // board thickness

// ---------------------------------------------------------------- guesses: measure and replace
BTN_CAP_D = 10.5;      // GUESS: diameter of the round button cap
PI_SCREEN = 13.5;      // GUESS: Pi board top to the top of the screen glass, with the PiTFT on
JOY_CAP_D = 25.4;      // from SparkFun's drawing of the joystick

// ---------------------------------------------------------------- choices
BTN_PROUD = 1.0;       // how far the button caps rise above the lid
WALL = 2.4;
FLOOR = 2;
LID = 2;
CORNER = 10;           // corner radius seen from above
CLEAR = 0.4;           // printing clearance round holes
JOY_HOLE = 26;         // opening round the stick: clears the housing and its metal frame
SCREW_D = 3.4;         // M3 (or 4-40) clearance
PILOT_D = 2.6;         // M3 self-tapping into plastic
PI_PILOT_D = 2.2;      // M2.5 self-tapping, for the Pi's own holes
USB_GAP = 20;          // between the joystick and the Pi's USB ports, for plugs

// ---------------------------------------------------------------- where everything goes
PI_BOTTOM = FLOOR + 5;                 // the Pi stands on 5 mm posts
PI_TOP = PI_BOTTOM + PCB;
UNDER = PI_TOP + 16 + 0.9;             // lid underside: just clears the Pi's stacked USB ports (16 mm)
TOP = UNDER + LID;                     // top surface of the lid

JX = 10.5;                             // joystick board's front-left corner (clear of the corner screw)
D = WALL + 2 + 56 + 2 + WALL;          // depth: the Pi plus room round it
JY = (D - 50.8) / 2;
JOY_TOP = TOP - (JOY_HOUSING - PCB);   // joystick board's top face: puts the housing flush with the lid
STICK = [JX + 12.7, JY + 12.7];

PX = JX + 25.4 + USB_GAP;              // the Pi's footprint starts here, turned round so its USB ports
PY = WALL + 2;                         // face the joystick and its power socket faces the back
function pi(p) = [PX + 85 - p[0], PY + 56 - p[1]];   // a point on the Pi's own drawing -> the case

BX = [PX + 85 + 5, PX + 85 + 5 + 25.4 + 4];   // red button board, green button board (left edges)
BY = WALL + 10;                        // room in front for the Qwiic plugs, which face front and back
BTN_TOP = TOP + BTN_PROUD - (BTN_BODY + BTN_CAP);
function button(k) = [BX[k] + 7.62, BY + 12.7];      // each board is turned a quarter so its plugs face front/back

W = BX[1] + 25.4 + 3 + WALL;

// the screen's visible area, from Adafruit's drawing of the Mini PiTFT (Pi coordinates)
SCREEN = [pi([34, 48.3]), pi([8, 34.2])];   // two corners, already in case coordinates
SCREEN_TOP = PI_TOP + PI_SCREEN;

BOSSES = [[WALL + 4, WALL + 4], [W - WALL - 4, WALL + 4], [WALL + 4, D - WALL - 4], [W - WALL - 4, D - WALL - 4]];
JOY_POSTS = [for (h = [[2.54, 48.26], [22.86, 48.26], [2.54, 27.94], [22.86, 27.94]]) [JX + h[0], JY + h[1]]];
BTN_POSTS = [for (k = [0, 1], h = [[2.54, 2.54], [2.54, 22.86]]) [BX[k] + h[0], BY + h[1]]];
PI_POSTS = [for (h = [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]]) pi(h)];

assert(BTN_TOP + BTN_BODY < UNDER, "button switch bodies would hit the lid");
assert(JOY_TOP + 9.5 < UNDER, "joystick frame would hit the lid");
assert(SCREEN_TOP < UNDER, "screen would hit the lid");

$fn = 48;

// ---------------------------------------------------------------- shapes

module outline(inset = 0) {
    offset(r = -inset) translate([CORNER, CORNER]) offset(r = CORNER) square([W - 2 * CORNER, D - 2 * CORNER]);
}

module tub() {
    difference() {
        union() {
            difference() {
                linear_extrude(UNDER) outline();
                translate([0, 0, FLOOR]) linear_extrude(UNDER) outline(WALL);
            }
            for (b = BOSSES) translate([b[0], b[1], 0]) cylinder(d = 8, h = UNDER);
            for (p = PI_POSTS) translate([p[0], p[1], 0]) cylinder(d = 6, h = PI_BOTTOM);
        }
        for (b = BOSSES) translate([b[0], b[1], UNDER - 12]) cylinder(d = PILOT_D, h = 13);
        for (p = PI_POSTS) translate([p[0], p[1], FLOOR]) cylinder(d = PI_PILOT_D, h = 10);
        // power cable: the Pi's USB-C socket (11.2 mm along its edge) through the back wall
        usbc = pi([11.2, 0]);
        translate([usbc[0] - 7, D - WALL - 1, PI_TOP - 3]) cube([14, WALL + 2, UNDER]);
        // a cable out for whatever plugs into the USB ports (the speaker for now)
        translate([JX + 25.4 + USB_GAP / 2 - 6, D - WALL - 1, PI_TOP + 2]) cube([12, WALL + 2, UNDER]);
        // vents low on the front, under the Pi
        for (x = [PX + 20 : 6 : PX + 70]) translate([x, -1, FLOOR + 2]) cube([2.5, WALL + 2, 3]);
    }
}

module lid() {
    difference() {
        union() {
            translate([0, 0, UNDER]) linear_extrude(LID) outline();
            // a lip just inside the walls keeps the lid from sliding
            translate([0, 0, UNDER - 1.5]) linear_extrude(1.5) difference() {
                outline(WALL + 0.3);
                outline(WALL + 1.5);
                for (b = BOSSES) translate(b) circle(d = 9);
            }
            for (p = JOY_POSTS) translate([p[0], p[1], JOY_TOP]) cylinder(d = 6.5, h = UNDER - JOY_TOP + 0.01);
            for (p = BTN_POSTS) translate([p[0], p[1], BTN_TOP]) cylinder(d = 6.5, h = UNDER - BTN_TOP + 0.01);
        }
        translate([STICK[0], STICK[1], UNDER - 1]) cylinder(d = JOY_HOLE, h = LID + 2);
        for (k = [0, 1]) translate([button(k)[0], button(k)[1], UNDER - 1]) cylinder(d = BTN_CAP_D + 2 * CLEAR, h = LID + 2);
        // screen window, bevelled toward the player
        translate([SCREEN[0][0], SCREEN[0][1], UNDER - 1]) {
            sx = SCREEN[1][0] - SCREEN[0][0]; sy = SCREEN[1][1] - SCREEN[0][1];
            cube([sx, sy, LID + 2]);
            translate([0, 0, 1 + LID - 1.2]) hull() {
                cube([sx, sy, 0.01]);
                translate([-1.5, -1.5, 1.2]) cube([sx + 3, sy + 3, 0.5]);
            }
        }
        // vents over the Pi's processor, behind the screen
        for (x = [SCREEN[0][0] - 8 : 5 : SCREEN[1][0] + 4]) translate([x, SCREEN[1][1] + 6, UNDER - 1]) cube([2.4, 22, LID + 2]);
        // lid screws, countersunk
        for (b = BOSSES) translate([b[0], b[1], UNDER - 2]) {
            cylinder(d = SCREW_D, h = LID + 4);
            translate([0, 0, 2 + LID - 1.8]) cylinder(d1 = SCREW_D, d2 = 6.6, h = 1.81);
        }
        for (p = concat(JOY_POSTS, BTN_POSTS)) translate([p[0], p[1], 0]) cylinder(d = PILOT_D, h = UNDER - 0.6);
    }
}

// ---------------------------------------------------------------- stand-ins for the electronics

module in_pi(z = PI_BOTTOM) {
    translate([PX + 85, PY + 56, z]) rotate(180) children();
}

module electronics() {
    color("darkgreen") in_pi() cube([85, 56, PCB]);
    color("silver") in_pi(PI_TOP) {
        translate([66, 2, 0]) cube([21.5, 16, 13.5]);                // Ethernet
        for (y = [21, 39]) translate([70, y, 0]) cube([17.5, 15, 16]);  // USB pairs
        translate([7, -1, 0]) cube([9, 7.5, 3.2]);                   // USB-C power
    }
    color("black") in_pi(PI_TOP) translate([7.1, 50, 0]) cube([51, 5, SCREEN_TOP - PI_TOP - 3.8]);   // header
    color("midnightblue") in_pi(PI_TOP) {
        translate([0, 32.35, SCREEN_TOP - PI_TOP - 3.8]) cube([38.1, 24.4, PCB]);    // PiTFT board
        translate([6.97, 32.44, SCREEN_TOP - PI_TOP - 2.2]) cube([31, 17.6, 2.2]);   // screen
    }
    // joystick
    color("crimson") translate([JX, JY, JOY_TOP - PCB]) cube([25.4, 50.8, PCB]);
    color("gray") translate([STICK[0] - 9, STICK[1] - 9, JOY_TOP]) cube([18, 18, 9.5]);
    color("dimgray") translate([STICK[0], STICK[1], JOY_TOP]) cylinder(d = 14, h = TOP - JOY_TOP);
    color("black") translate([STICK[0], STICK[1], TOP]) {
        cylinder(d = 5, h = JOY_CAP);
        translate([0, 0, JOY_CAP - 6]) cylinder(d = JOY_CAP_D, h = 6);
    }
    // buttons: red, then green
    for (k = [0, 1]) {
        color("crimson") translate([BX[k], BY, BTN_TOP - PCB]) cube([25.4, 25.4, PCB]);
        color("ivory") translate([button(k)[0] - 6, button(k)[1] - 6, BTN_TOP]) cube([12, 12, BTN_BODY]);
        color(k ? "limegreen" : "red") translate([button(k)[0], button(k)[1], BTN_TOP + BTN_BODY]) cylinder(d = BTN_CAP_D, h = BTN_CAP);
    }
}

// ---------------------------------------------------------------- what to show

if (part == "tub") tub();
if (part == "lid") translate([0, D, TOP]) rotate([180, 0, 0]) lid();
module lid_piece(x, y, w, d) { intersection() { lid(); translate([x, y, 0]) cube([w, d, TOP + 1]); } }
if (part == "coupon") translate([0, D, TOP]) rotate([180, 0, 0]) {
    lid_piece(JX - 4, JY - 2, 25.4 + 8, 50.8 + 4);                        // joystick corner
    translate([(JX - 4 + 25.4 + 8 + 5) - (BX[0] - 4), 0, 0])                // red button, moved alongside
        lid_piece(BX[0] - 4, BY - 4, 25.4 + 8, 25.4 + 8);
}
if (part == "assembly") { color("#2b2b2b") tub(); color("#ffc21a") lid(); electronics(); }
if (part == "open") { color("#2b2b2b") tub(); color("#ffc21a") translate([0, 0, 45]) lid(); electronics(); }
if (part == "check") intersection() { union() { tub(); lid(); } electronics(); }

echo(str("Case: ", W, " x ", D, " x ", TOP, " mm"));
