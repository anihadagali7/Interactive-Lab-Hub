// The link to the Raspberry Pi controller (Final Project/controller/bridge.py).
//
// Open the game with ?pi=<the Pi's address>, for example http://localhost:5173/?pi=10.56.129.250
// The address is remembered, so later reloads reconnect on their own; ?pi=off forgets it.
// The keyboard keeps working alongside the controller.
const PORT = 8765;

/**
 * @param input   the input module: every message from the Pi becomes input.axis / input.button
 * @param notify  (text) => void, for "controller connected" messages
 * @returns {led(state), meter(state)}: light the controller's buttons ('pulse', 'on' or 'off'), and
 *   show the game's state on its screen (a plain object, see controller/meter.py). No-ops with no Pi.
 */
export function connectPi(input, notify) {
  let host = new URLSearchParams(location.search).get('pi');
  try {
    if (host === 'off') { localStorage.removeItem('pi'); host = null; }
    else if (host) localStorage.setItem('pi', host);
    else host = localStorage.getItem('pi');
  } catch { /* storage blocked: use the URL only */ }
  if (!host) return { led() {}, meter() {} };

  const base = `http://${host.includes(':') ? host : `${host}:${PORT}`}`;
  const held = new Set();
  let connected = false, lastLed = null, lastMeter = '', meterAt = 0;

  // EventSource reconnects by itself after an error, every few seconds.
  const events = new EventSource(`${base}/events`);
  events.onopen = () => {
    connected = true;
    notify('Controller connected');
    if (lastLed) send(lastLed);
  };
  events.onerror = () => {
    if (!connected) return;
    connected = false;
    // let go of everything, or the taxi would keep driving on the last stick position
    input.axis('steer', 0); input.axis('drive', 0);
    for (const name of held) input.button(name, false);
    held.clear();
    notify('Controller disconnected. Reconnecting...');
  };
  events.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.axis) for (const [name, value] of Object.entries(m.axis)) input.axis(name, value);
    if (m.button) {
      if (m.down) held.add(m.button); else held.delete(m.button);
      input.button(m.button, m.down);
    }
  };

  // text/plain keeps this a simple request, so the browser sends it without a preflight
  const send = state => fetch(`${base}/led`, { method: 'POST', body: state }).catch(() => {});
  return {
    led(state) {
      if (state === lastLed) return;
      lastLed = state;
      if (connected) send(state);
    },
    meter(state) {
      // at most four times a second, only when something changed, and every 2 s regardless so the
      // Pi knows the game is still there
      const text = JSON.stringify(state), now = performance.now();
      if (!connected || now - meterAt < 250 || (text === lastMeter && now - meterAt < 2000)) return;
      lastMeter = text; meterAt = now;
      fetch(`${base}/meter`, { method: 'POST', body: text }).catch(() => {});
    },
  };
}
