// All sound is synthesised with the Web Audio API, so there are no audio files to load.
// Browsers only allow sound after a click or key press: call start() from one.

const CHIMES = {
  request: [[880, 0], [1175, 0.13], [880, 0.34], [1175, 0.47]],
  accept: [[660, 0], [990, 0.1]],
  decline: [[440, 0], [330, 0.12]],
  chat: [[1320, 0]],
  pickup: [[784, 0], [988, 0.1], [1175, 0.2]],
  rating: [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36]],
  bad: [[392, 0], [311, 0.16], [262, 0.32]],
};

export class Audio {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = this.ctx = new Ctx();
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // engine: two detuned saws through a low-pass that opens with speed
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engine = [1, 1.51].map(ratio => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.connect(this.engineFilter);
      osc.start();
      return { osc, ratio };
    });

    const noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = noise;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  /** @param speed 0..1 of top speed; @param load 0..1 how hard the engine is pulling */
  setEngine(speed, load, boosting) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, base = 52 + speed * 120 + (boosting ? 30 : 0);
    for (const { osc, ratio } of this.engine) osc.frequency.setTargetAtTime(base * ratio, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(350 + speed * 1500 + (boosting ? 900 : 0), now, 0.1);
    this.engineGain.gain.setTargetAtTime(0.035 + load * 0.05 + (boosting ? 0.04 : 0), now, 0.1);
  }

  silenceEngine() { if (this.ctx) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); }

  tone(freq, at, length = 0.16, type = 'triangle', volume = 0.22) {
    const ctx = this.ctx, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    osc.connect(gain).connect(this.master);
    osc.start(at); osc.stop(at + length + 0.02);
  }

  chime(name) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [freq, delay] of CHIMES[name]) this.tone(freq, now + delay);
  }

  /** A crash: filtered noise, louder and brighter for harder hits. @param strength 0..1.5 */
  thud(strength) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = this.noise;
    filter.type = 'lowpass'; filter.frequency.value = 300 + strength * 900;
    gain.gain.setValueAtTime(Math.min(0.9, 0.25 + strength * 0.5), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    this.tone(70, now, 0.25, 'sine', 0.5);
  }

  horn(on) {
    if (!this.ctx) return;
    if (on && !this.hornNodes) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0.12;
      gain.connect(this.master);
      this.hornNodes = [392, 494].map(freq => {
        const osc = this.ctx.createOscillator();
        osc.type = 'square'; osc.frequency.value = freq;
        osc.connect(gain); osc.start();
        return osc;
      });
    } else if (!on && this.hornNodes) {
      for (const osc of this.hornNodes) osc.stop();
      this.hornNodes = null;
    }
  }
}
