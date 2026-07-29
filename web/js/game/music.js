// Menu theme: a self-contained, inspiring cinematic loop synthesized with
// WebAudio (no audio files, no licensing). No percussion: warm detuned
// pads, a gentle plucked arpeggio, deep bass swells, and a sparse bell
// melody with echo. Progression: C G Am F (two bars each) at 72 BPM.
//
// Browsers keep AudioContext suspended until a user gesture; start() is
// safe to call early and arms a one-time gesture listener as a fallback.

const BPM = 72;
const SIXTEENTH = 60 / BPM / 4;
const STEPS_PER_BAR = 16;
const BARS = 8;
const TOTAL_STEPS = STEPS_PER_BAR * BARS;

// [bass root midi, chord tones (midi)] per 2-bar block: C G Am F.
const BLOCKS = [
  [36, [60, 64, 67]],
  [43, [59, 62, 67]],
  [45, [60, 64, 69]],
  [41, [60, 65, 69]],
];

// Sparse uplifting melody: [absolute 16th step, midi, duration in beats].
const MELODY = [
  [0, 76, 3], [12, 74, 1], [16, 79, 4], [28, 76, 1],
  [32, 74, 3], [44, 71, 1], [48, 74, 4],
  [64, 72, 3], [76, 69, 1], [80, 76, 4],
  [96, 69, 2], [104, 72, 2], [112, 77, 4],
];

function midiHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class Music {
  constructor() {
    this.enabled = localStorage.getItem("vizdrive-music") !== "off";
    this.ctx = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.level = 0.5; // master target when audible
    this.armed = false;
  }

  _ensure() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext ?? window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(ctx.destination);

    // Long echo bus for the bell melody.
    this.delay = ctx.createDelay(2.0);
    this.delay.delayTime.value = SIXTEENTH * 6;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.4;
    this.delayMix = ctx.createGain();
    this.delayMix.gain.value = 0.5;
    this.delay.connect(this.delayGain);
    this.delayGain.connect(this.delay);
    this.delay.connect(this.delayMix);
    this.delayMix.connect(this.master);
  }

  // Soft bell: fundamental + quiet octave, long exponential decay.
  _bell(midi, t, dur, peak) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    gain.connect(this.master);
    gain.connect(this.delay);
    for (const [mult, g] of [[1, 1.0], [2, 0.35]]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = midiHz(midi) * mult;
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og);
      og.connect(gain);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
  }

  // Gentle pluck: triangle with a fast decay through a soft lowpass.
  _pluck(midi, t, peak) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiHz(midi);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  // Deep sine bass swell for a whole chord block.
  _bass(midi, t, dur) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiHz(midi);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.15, t + dur * 0.25);
    gain.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  // Warm detuned pad with a slow breathing filter.
  _pad(tones, t, dur) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.045, t + dur * 0.35);
    gain.gain.linearRampToValueAtTime(0.0001, t + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
    filter.frequency.linearRampToValueAtTime(500, t + dur);
    filter.connect(gain);
    gain.connect(this.master);
    for (const m of tones) {
      for (const det of [-5, 5]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = midiHz(m);
        osc.detune.value = det;
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + dur + 0.1);
      }
    }
  }

  _scheduleStep(step, t) {
    const blockLen = STEPS_PER_BAR * 2;
    const [bassRoot, chord] = BLOCKS[Math.floor(step / blockLen) % 4];

    // Chord block start: pad + bass swell.
    if (step % blockLen === 0) {
      const dur = blockLen * SIXTEENTH;
      this._pad(chord, t, dur);
      this._bass(bassRoot, t, dur);
    }
    // Gentle arpeggio on 8th notes: low-high ripple across the chord.
    if (step % 2 === 0) {
      const ripple = [0, 1, 2, 1];
      const idx = ripple[(step / 2) % ripple.length];
      const octave = step % STEPS_PER_BAR >= 8 ? 12 : 0;
      this._pluck(chord[idx] + octave, t, 0.03);
    }
    // Bell melody.
    for (const [at, midi, beats] of MELODY) {
      if (at === step) {
        this._bell(midi, t, Math.max(1.2, beats * 4 * SIXTEENTH), 0.09);
      }
    }
  }

  _run() {
    if (this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => {
      while (this.nextTime < this.ctx.currentTime + 0.3) {
        this._scheduleStep(this.step % TOTAL_STEPS, this.nextTime);
        this.step += 1;
        this.nextTime += SIXTEENTH;
      }
    }, 80);
  }

  _fadeTo(value, seconds) {
    const g = this.master.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(g.value, this.ctx.currentTime);
    g.linearRampToValueAtTime(value, this.ctx.currentTime + seconds);
  }

  // Try to start now; if the browser blocks audio until a gesture, arm a
  // one-time listener so the theme begins on the first click/keypress.
  start() {
    if (!this.enabled) return;
    this._ensure();
    this._run();
    this._fadeTo(this.level, 2.5);
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
      if (!this.armed) {
        this.armed = true;
        const kick = () => {
          this.ctx.resume();
          window.removeEventListener("pointerdown", kick);
          window.removeEventListener("keydown", kick);
        };
        window.addEventListener("pointerdown", kick);
        window.addEventListener("keydown", kick);
      }
    }
  }

  fadeOut(seconds = 1.5) {
    if (this.ctx) this._fadeTo(0.0, seconds);
  }

  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem("vizdrive-music", on ? "on" : "off");
    if (on) this.start();
    else this.fadeOut(0.4);
  }
}
