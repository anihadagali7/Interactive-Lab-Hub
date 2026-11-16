// One place every control goes through. The keyboard drives it today; the Pi controller
// will call the same two functions (input.axis and input.button) when it is connected.
//
//   input.axis('steer', v)     v in -1..1, +1 = full right
//   input.axis('drive', v)     v in -1..1, +1 = accelerate, -1 = brake / reverse
//   input.button(name, down)   names are listed in KEYS below

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const listeners = {};

export const input = {
  steer: 0,
  drive: 0,
  held: new Set(),

  axis(name, value) { this[name] = clamp(value, -1, 1); },

  button(name, down) {
    if (down === this.held.has(name)) return;        // ignore key auto-repeat
    if (down) this.held.add(name); else this.held.delete(name);
    for (const fn of listeners[name] || []) fn(down);
  },

  /** Run fn(down) whenever the named button changes. */
  on(name, fn) { (listeners[name] ||= []).push(fn); },
  /** Run fn() each time the named button is pressed. */
  onPress(name, fn) { this.on(name, down => { if (down) fn(); }); },
  isDown(name) { return this.held.has(name); },
};

// Keyboard code -> button name. Steering and driving keys are turned into axes below.
export const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake', ShiftLeft: 'nitro', ShiftRight: 'nitro',
  KeyE: 'accept', Enter: 'accept', KeyQ: 'decline', KeyX: 'cancel',
  Digit1: 'reply1', Digit2: 'reply2', Digit3: 'reply3',
  KeyM: 'map', KeyV: 'camera', KeyH: 'horn', KeyC: 'help', KeyR: 'reset', KeyP: 'pause',
  Digit0: 'mute',
};

export function attachKeyboard(target = window) {
  const refreshAxes = () => {
    input.axis('steer', (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0));
    input.axis('drive', (input.isDown('up') ? 1 : 0) - (input.isDown('down') ? 1 : 0));
  };
  const handle = down => e => {
    const name = KEYS[e.code];
    if (!name || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    input.button(name, down);
    refreshAxes();
  };
  target.addEventListener('keydown', handle(true));
  target.addEventListener('keyup', handle(false));
  // Releasing a key while the window is unfocused would leave it stuck down.
  target.addEventListener('blur', () => {
    for (const name of [...input.held]) input.button(name, false);
    refreshAxes();
  });
}
