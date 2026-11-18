"""Five Star Taxi controller bridge. Runs on the Raspberry Pi.

Reads the Qwiic Joystick and Qwiic Button about 60 times a second and streams them to the game
in the laptop's browser as server-sent events. The game posts back to light the button's LED.
Standard library only, plus the SparkFun Qwiic packages already in the Lab 4 venv.

    python bridge.py           serve on port 8765
    python bridge.py --test    print what the controls read, to check the joystick's directions

Endpoints (CORS open, so a page served from the laptop can use them):
    GET  /events   stream of JSON messages:
                   {"axis": {"steer": -1..1, "drive": -1..1}}   +steer = right, +drive = forward
                   {"button": name, "down": true|false}
    POST /led      body "pulse", "on" or "off"
"""
import json
import queue
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8765
RATE = 60                      # hardware reads per second
DEADZONE = 0.08                # share of travel ignored around the centre
HOLD = 0.5                     # seconds the button is held before a tap becomes a hold

# How the joystick sits in the controller. Check with --test: pushing right should give steer > 0,
# pushing forward should give drive > 0. Flip or swap here if not.
SWAP_XY = False
FLIP_X = False
FLIP_Y = False


def to_axis(raw, centre, flip):
    """A 10-bit joystick reading (0..1023) to -1..1, with a dead zone round the resting centre."""
    span = (1023 - centre) if raw >= centre else centre
    v = (raw - centre) / max(span, 1)
    if flip:
        v = -v
    if abs(v) < DEADZONE:
        return 0.0
    v = (abs(v) - DEADZONE) / (1 - DEADZONE) * (1 if v > 0 else -1)
    return round(max(-1.0, min(1.0, v)), 3)


class OneButton:
    """One physical button doing two jobs. A tap is 'accept'. Holding past HOLD seconds is a tap of
    'decline' (turns down a request) and holds 'cancel' down until release (the game cancels a ride
    once cancel has been held for another second)."""

    def __init__(self):
        self.since = None          # when the current press started
        self.holding = False

    def update(self, pressed, now):
        """@returns the (name, down) events to send for this reading."""
        events = []
        if pressed and self.since is None:
            self.since = now
        elif pressed and not self.holding and now - self.since >= HOLD:
            self.holding = True
            events += [('decline', True), ('decline', False), ('cancel', True)]
        elif not pressed and self.since is not None:
            events += [('cancel', False)] if self.holding else [('accept', True), ('accept', False)]
            self.since, self.holding = None, False
        return events


class Hardware:
    def __init__(self):
        import qwiic_button
        import qwiic_joystick
        self.stick = qwiic_joystick.QwiicJoystick()
        self.button = qwiic_button.QwiicButton()
        if not self.stick.connected or not self.button.begin():
            sys.exit('Joystick (0x20) or button (0x6F) not found on the I2C bus.')
        self.stick.begin()
        # the resting position, read at start: do not touch the stick while the bridge starts
        xs, ys = zip(*[(self.stick.horizontal, self.stick.vertical) for _ in range(8)])
        self.centre = (sum(xs) / 8, sum(ys) / 8)
        self.button.LED_off()

    def read(self):
        """@returns steer, drive, joystick clicked, button pressed"""
        x, y = self.stick.horizontal, self.stick.vertical
        cx, cy = self.centre
        if SWAP_XY:
            x, y, cx, cy = y, x, cy, cx
        return (to_axis(x, cx, FLIP_X), to_axis(y, cy, FLIP_Y),
                self.stick.button == 0, self.button.is_button_pressed())

    def led(self, state):
        if state == 'pulse':
            self.button.LED_config(200, 1000, 300)       # brightness, cycle ms, off ms
        elif state == 'on':
            self.button.LED_on(200)
        else:
            self.button.LED_off()


class Bridge:
    def __init__(self, hw):
        self.hw = hw
        self.lock = threading.Lock()
        self.clients = []
        self.axes = {'steer': 0.0, 'drive': 0.0}
        self.i2c = threading.Lock()                     # the LED is set from the web thread

    def send(self, message):
        data = json.dumps(message)
        with self.lock:
            for q in self.clients:
                q.put(data)

    def run(self):
        main, nitro = OneButton(), False
        while True:
            start = time.monotonic()
            try:
                with self.i2c:
                    steer, drive, clicked, pressed = self.hw.read()
            except OSError as e:                         # a glitch on the bus: skip this reading
                print('read failed:', e, file=sys.stderr)
                time.sleep(0.05)
                continue
            if abs(steer - self.axes['steer']) > 0.01 or abs(drive - self.axes['drive']) > 0.01:
                self.axes = {'steer': steer, 'drive': drive}
                self.send({'axis': self.axes})
            if clicked != nitro:
                nitro = clicked
                self.send({'button': 'nitro', 'down': nitro})
            for name, down in main.update(pressed, start):
                self.send({'button': name, 'down': down})
            time.sleep(max(0, 1 / RATE - (time.monotonic() - start)))


def make_handler(bridge):
    class Handler(BaseHTTPRequestHandler):
        def cors(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Private-Network', 'true')

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.send_header('Access-Control-Allow-Methods', 'GET, POST')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()

        def do_GET(self):
            if self.path != '/events':
                self.send_error(404)
                return
            self.send_response(200)
            self.cors()
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            q = queue.Queue()
            q.put(json.dumps({'axis': bridge.axes}))
            with bridge.lock:
                bridge.clients.append(q)
            print('game connected from', self.client_address[0])
            try:
                while True:
                    try:
                        self.wfile.write(f'data: {q.get(timeout=5)}\n\n'.encode())
                    except queue.Empty:
                        self.wfile.write(b': still here\n\n')   # keeps the connection from idling out
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                with bridge.lock:
                    bridge.clients.remove(q)
                print('game disconnected')

        def do_POST(self):
            if self.path != '/led':
                self.send_error(404)
                return
            state = self.rfile.read(min(int(self.headers.get('Content-Length', 0)), 16)).decode().strip()
            if state in ('pulse', 'on', 'off'):
                with bridge.i2c:
                    bridge.hw.led(state)
            self.send_response(204 if state in ('pulse', 'on', 'off') else 400)
            self.cors()
            self.end_headers()

        def log_message(self, *args):
            pass

    return Handler


def test(hw):
    print('Move the stick and press things. Ctrl+C to stop.')
    while True:
        steer, drive, clicked, pressed = hw.read()
        print(f'\rsteer {steer:+.2f}  drive {drive:+.2f}  click {clicked!s:5}  button {pressed!s:5}', end='', flush=True)
        time.sleep(0.05)


if __name__ == '__main__':
    hw = Hardware()
    if '--test' in sys.argv:
        try:
            test(hw)
        except KeyboardInterrupt:
            print()
        sys.exit()
    bridge = Bridge(hw)
    threading.Thread(target=bridge.run, daemon=True).start()
    server = ThreadingHTTPServer(('0.0.0.0', PORT), make_handler(bridge))
    server.daemon_threads = True
    print(f'Controller bridge on port {PORT}. Joystick centre {hw.centre[0]:.0f}, {hw.centre[1]:.0f}.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        hw.led('off')
