"""Guided table setup: learn each utensil's sensor thresholds from live readings.

Pure logic with no hardware access: the sensor loop feeds it MPR121 filtered readings.
A utensil resting on its copper pad LOWERS that pad's reading, so "drop" below means
(empty reading - current reading).
"""
from statistics import median

MAX_EMPTY_NOISE = 30   # peak-to-peak counts allowed on a pad while it is measured empty
STUCK_SECONDS = 30     # after this long without detecting a utensil, show a hint


class PadCalibration:
    """Learns one pad. The utensil counts as placed once the drop has stayed above
    `trigger` for `hold` seconds; thresholds are then half and a quarter of the drop."""

    def __init__(self, empty, noise, hold=1.2):
        self.empty = empty
        self.hold = hold
        # Same bar `fork_sensor.py --calibrate` uses for "usable": the drop must be at
        # least twice the pad's own wobble, so the thresholds sit above the noise.
        self.trigger = max(6, 2 * noise)
        self._window = []
        self.result = None  # (on, off) once learned

    def update(self, reading, now):
        if self.result:
            return
        if self.empty - reading <= self.trigger:
            self._window = []
            return
        self._window.append((now, reading))
        if now - self._window[0][0] >= self.hold:
            drop = self.empty - median(r for _, r in self._window)
            self.result = (drop * 0.5, drop * 0.25)


class TableCalibrator:
    """Steps: clear (waiting for 'table is clear') -> measuring -> placing -> done.

    `items` is [(utensil id, display name)] in the order they are placed.
    """

    def __init__(self, items, measure_seconds=1.5, hold=1.2):
        self.items = list(items)
        self.measure_seconds = measure_seconds
        self.hold = hold
        self.reset()

    def reset(self, notice=''):
        self.step = 'clear'
        self.notice = notice
        self.references = {}  # id -> mean empty reading
        self.results = {}     # id -> (on, off)
        self._samples = {}
        self._measure_end = 0
        self._pads = {}
        self._current = 0
        self._placing_since = 0
        self._stuck = False

    def start_measuring(self, now):
        if self.step == 'clear':
            self.step = 'measuring'
            self.notice = ''
            self._samples = {uid: [] for uid, _ in self.items}
            self._measure_end = now + self.measure_seconds

    def feed(self, readings, now):
        """Call every tick while measuring/placing. `readings` maps utensil id -> value."""
        if self.step == 'measuring':
            for uid, value in readings.items():
                self._samples[uid].append(value)
            if now >= self._measure_end:
                self._finish_measuring(now)
        elif self.step == 'placing':
            uid = self.items[self._current][0]
            pad = self._pads[uid]
            pad.update(readings[uid], now)
            if pad.result:
                self.results[uid] = pad.result
                self._current += 1
                self._placing_since = now
                self._stuck = False
                if self._current == len(self.items):
                    self.step = 'done'
            elif now - self._placing_since > STUCK_SECONDS:
                self._stuck = True

    def _finish_measuring(self, now):
        noisy = []
        for uid, name in self.items:
            values = self._samples[uid]
            noise = max(values) - min(values)
            if noise > MAX_EMPTY_NOISE:
                noisy.append(name)
            self.references[uid] = sum(values) / len(values)
            self._pads[uid] = PadCalibration(self.references[uid], noise, self.hold)
        if noisy:
            names = [name.lower() for name in noisy]
            joined = names[0] if len(names) == 1 else ', '.join(names[:-1]) + ' and ' + names[-1]
            self.reset(f"The {joined} pad{'s' if len(names) > 1 else ''} wobbled too much. "
                       "Keep your hands away from the pads and wires, then measure again.")
            return
        self.step = 'placing'
        self._current = 0
        self._placing_since = now

    def view(self):
        """What the phone shows: step, a message, and a status for each utensil."""
        items = []
        for i, (uid, name) in enumerate(self.items):
            if uid in self.results:
                status = 'done'
            elif self.step == 'placing' and i == self._current:
                status = 'current'
            else:
                status = 'pending'
            items.append({'id': uid, 'name': name, 'status': status})
        if self.step == 'clear':
            message = self.notice or 'Take every utensil off its pad and keep your hands away from the table.'
        elif self.step == 'measuring':
            message = 'Measuring the empty table. Hold still…'
        elif self.step == 'placing':
            name = self.items[self._current][1].lower()
            message = f'Now place the {name} on its pad and leave it there.'
            if self._stuck:
                message += (' Not detecting it? Press it firmly onto the copper tape and check the '
                            'connection to the pad.')
        else:
            message = 'Every utensil was detected. Your table is ready.'
        return {'step': self.step, 'message': message, 'items': items}
