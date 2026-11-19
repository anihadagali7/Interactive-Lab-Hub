# Controller case

A 206 × 65 × 27.5 mm case for the Five Star Taxi controller: the Raspberry Pi 5 with its Mini
PiTFT inside, the Qwiic joystick on the left, the red and green Qwiic buttons on the right. The
joystick's housing sits flush with the top, and the button caps stand 1 mm proud.

`controller_case.scad` is the model (OpenSCAD); every size is a named number at the top. The
STL files in `stl/` are exported from it and ready to slice.

## Print

| File | What | Orientation | Time (roughly) |
|---|---|---|---|
| `stl/coupon.stl` | Two small pieces of the lid, to check the fit first | as exported | 30 min |
| `stl/lid.stl` | Top: stick, button and screen openings, posts for the boards | as exported (top face down) | 2–3 h |
| `stl/tub.stl` | Bottom: walls, Pi posts, screw bosses | as exported (floor down) | 3–4 h |

PLA, 0.2 mm layers, 3 walls, 20% infill, **no supports**. Needs a bed at least 210 mm long
(Prusa MK4, Bambu, Ultimaker S3 and Ender 3 all fit; a Prusa Mini does not).

**Print the coupon first.** Screw the joystick and one button onto its posts and check:
the joystick's round housing should be level with the top surface, and the button cap should
stand about 1 mm above it and press without rubbing. If not, change `JOY_HOUSING`, `BTN_BODY`,
`BTN_CAP` or `BTN_CAP_D` in the model and export again.

## Screws

| Where | Screw | How many |
|---|---|---|
| Joystick and buttons onto the lid posts | M3 × 6 (or 4-40 × 1/4"), self-tapping into plastic | 8 |
| Pi onto the tub posts | M2.5 × 6 | 4 |
| Lid onto the tub, from the top | M3 × 10 countersunk | 4 |

## Not settled yet

- **Button cap diameter** is a guess (10.5 mm). Measure it.
- **Screen height** is a guess: the screen sits about 5 mm below the lid's surface. Measure from
  the table to the screen glass with the PiTFT on the Pi, and the window can be brought closer.
- **Speaker:** not inside yet. A slot in the back wall lets a USB cable out beside the Pi's USB
  ports. Once its size is known it can go inside with a grille in the lid.
- **Cooling:** vents over the Pi's processor and along the front. If the Pi gets an Active Cooler,
  the lid still clears it.
- The Pi's USB-C power cable leaves through a slot in the back wall.
