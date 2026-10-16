"""Fork sensor: tells you when a metal fork is resting on a copper-tape pad.

Wiring: copper tape pad -> alligator clip -> an electrode pin (default 0) on the
Adafruit MPR121 gator breakout, which sits on the Pi's I2C bus (address 0x5A).
Nothing else needs to be wired to the pad; the fork bridges onto the tape and
adds capacitance, which lowers the MPR121's filtered reading.

  python fork_sensor.py                  watch pin 0 with default thresholds
  python fork_sensor.py --tune           live readings, to pick a threshold
  python fork_sensor.py --calibrate      guided: measures empty pad vs. fork
  python fork_sensor.py --pins 0 1 2     watch several pads (one per slot)

Why not just use mpr121[i].value? The chip's baseline keeps re-tracking, so a
fork that stays put gets "absorbed" and the touch flag eventually clears. Here
the reference only updates while the pad is empty, so a fork stays detected for
as long as it is there.
"""
import argparse
import sys
import time

SAMPLE_HZ = 20


class PadDetector:
    """Turns a stream of MPR121 filtered readings into fork down / fork up events.

    Readings DROP when something conductive touches the pad, so
    delta = reference - reading is positive while the fork is on.
    Hysteresis (on > off) and a confirm count stop it flickering at the edge.
    """

    def __init__(self, reference, on=8, off=4, confirm=3, drift=0.01):
        self.reference = float(reference)
        self.on = on
        self.off = off
        self.confirm = confirm
        self.drift = drift  # how fast the empty-pad reference follows slow changes
        self.present = False
        self._streak = 0

    def delta(self, reading):
        return self.reference - reading

    def update(self, reading):
        """Feed one reading. Returns True (fork down), False (fork up) or None."""
        threshold = self.off if self.present else self.on
        wants_present = self.delta(reading) > threshold
        if wants_present == self.present:
            self._streak = 0
            if not self.present:
                # empty pad: follow temperature/humidity drift
                self.reference += self.drift * (reading - self.reference)
            return None
        self._streak += 1
        if self._streak < self.confirm:
            return None
        self.present = wants_present
        self._streak = 0
        return self.present


def fork_changed(pin, present):
    """Hook for what should happen on a change. Replace the body to drive the
    servo, LEDs, a log file, etc."""
    print(f"[{time.strftime('%H:%M:%S')}] pad {pin}: " + ("FORK DOWN" if present else "fork lifted"))


def sample(mpr, pin, seconds):
    """Average the filtered reading over `seconds`; also returns the peak-to-peak noise."""
    readings = []
    end = time.time() + seconds
    while time.time() < end:
        readings.append(mpr.filtered_data(pin))
        time.sleep(1 / SAMPLE_HZ)
    return sum(readings) / len(readings), max(readings) - min(readings)


def guided_calibration(mpr, pin):
    """Measure the empty pad, then the pad with the fork, and derive thresholds."""
    input(f"\nPad {pin}: take the fork OFF the pad, then press Enter...")
    empty, noise = sample(mpr, pin, 1.5)
    input(f"Pad {pin}: put the fork DOWN on the copper, then press Enter...")
    forked, _ = sample(mpr, pin, 1.5)
    gap = empty - forked
    print(f"  empty={empty:.0f}  fork={forked:.0f}  difference={gap:.0f}  noise={noise}")
    if gap < max(4, noise * 2):
        print("  WARNING: the fork barely changes the reading. Use a bigger copper pad, make sure "
              "the fork touches the tape directly, and check the clip is on the right pin.")
    return empty, max(2, gap * 0.5), max(1, gap * 0.25)


def tune(mpr, pins):
    """Live readout so you can see how far a fork moves the number."""
    print("Tune mode: watch the 'drop' number. Put the fork on/off the pad. Ctrl-C to stop.\n")
    refs = {p: sample(mpr, p, 1.0)[0] for p in pins}
    while True:
        parts = []
        for p in pins:
            drop = refs[p] - mpr.filtered_data(p)
            bar = "#" * max(0, min(30, int(drop)))
            parts.append(f"pad {p}: drop {drop:5.0f} |{bar:<30}|")
        print("\r" + "   ".join(parts), end="", flush=True)
        time.sleep(1 / SAMPLE_HZ)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pins", type=int, nargs="+", default=[0], help="MPR121 electrodes to watch (0-11)")
    parser.add_argument("--address", type=lambda s: int(s, 0), default=0x5A, help="I2C address (default 0x5A)")
    parser.add_argument("--on", type=float, default=8, help="drop needed to call the fork present")
    parser.add_argument("--off", type=float, default=4, help="drop below which the fork counts as gone")
    parser.add_argument("--tune", action="store_true", help="show live readings instead of events")
    parser.add_argument("--calibrate", action="store_true", help="guided calibration of the thresholds")
    args = parser.parse_args()

    # Hardware imports live here so PadDetector can be tested on a laptop.
    import board
    import busio
    import adafruit_mpr121

    try:
        mpr = adafruit_mpr121.MPR121(busio.I2C(board.SCL, board.SDA), address=args.address)
    except (ValueError, RuntimeError, OSError) as err:
        print(f"Could not talk to the MPR121 at {args.address:#04x}: {err}")
        print("Check I2C is on (sudo raspi-config) and run `i2cdetect -y 1`: you should see 5a "
              "(the Servo pHAT shows up separately as 40).")
        sys.exit(1)

    try:
        if args.tune:
            tune(mpr, args.pins)
            return

        detectors = {}
        if args.calibrate:
            for p in args.pins:
                ref, on, off = guided_calibration(mpr, p)
                detectors[p] = PadDetector(ref, on, off)
            input("\nCalibrated. Take the fork off the pads and press Enter to start...")
            for p in args.pins:  # re-measure the empty reference right before running
                detectors[p].reference = sample(mpr, p, 1.0)[0]
        else:
            print("Measuring the empty pad(s): keep the fork off for a second...")
            for p in args.pins:
                detectors[p] = PadDetector(sample(mpr, p, 1.0)[0], args.on, args.off)

        print(f"Watching pad(s) {args.pins}. Ctrl-C to stop.")
        while True:
            for p, det in detectors.items():
                try:
                    change = det.update(mpr.filtered_data(p))
                except OSError:
                    continue  # a dropped I2C read; try again next tick
                if change is not None:
                    fork_changed(p, change)
            time.sleep(1 / SAMPLE_HZ)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
