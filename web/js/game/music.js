// Menu theme: a self-contained synthwave loop synthesized with WebAudio
// (no audio files, no licensing). Layers: soft four-on-floor kick, offbeat
// hats, driving 8th-note bass, 16th-note arpeggio through a feedback
// delay, and a slow detuned pad. Loop: Am F C G, two bars each, 110 BPM.
//
// Browsers keep AudioContext suspended until a user gesture; start() is
// safe to call early and arms a one-time gesture listener as a fallback.

const BPM = 110;
const SIXTEENTH = 60 / BPM / 4;
const STEPS_PER_BAR = 16;
const BARS = 8;
const TOTAL_STEPS = STEPS_PER_BAR * BARS;

// [bass root midi, arp chord tones (midi)] per 2-bar block.
const BLOCKS = [
  [45, [57, 60, 64, 69]], // Am
  [41, [53, 57, 60, 65]], // F
  [48, [55, 60, 64, 67]], // C
  [43, [55, 59, 62, 67]], // G
];
const ARP_PATTERN = [0, 1, 2, 3, 2, 3, 1, 2];

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

    // Echo bus for the arp.
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = SIXTEENTH * 3;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.35;
    this.delayMix = ctx.createGain();
    this.delayMix.gain.value = 0.6;
    this.delay.connect(this.delayGain);
    this.delayGain.connect(this.delay);
    this.delay.connect(this.delayMix);
    this.delayMix.connect(this.master);

    // Short noise buffer for hats.
    const len = Math.floor(ctx.sampleRate * 0.06);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  _tone(type, freq, t, dur, peak, out, filterHz = null, glideTo = null) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (filterHz) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = filterHz;
      filter.Q.value = 0.8;
      osc.connect(filter);
      node = filter;
    }
    node.connect(gain);
    gain.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _pad(tones, t, dur) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.05, t + dur * 0.4);
    gain.gain.linearRampToValueAtTime(0.0001, t + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(gain);
    gain.connect(this.master);
    for (const m of tones) {
      for (const det of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = midiHz(m);
        osc.detune.value = det;
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      }
    }
  }

  _hat(t, peak) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  _scheduleStep(step, t) {
    const block = BLOCKS[Math.floor(step / (STEPS_PER_BAR * 2)) % 4];
    const [bassRoot, chord] = block;
    const inBar = step % STEPS_PER_BAR;

    // Kick: four on the floor.
    if (inBar % 4 === 0) {
      this._tone("sine", 105, t, 0.16, 0.5, this.master, null, 42);
    }
    // Hats on the offbeats.
    if (inBar % 4 === 2) {
      this._hat(t, 0.05);
    }
    // Bass: driving 8ths, root with a lift at bar end.
    if (inBar % 2 === 0) {
      const m = inBar >= 14 ? bassRoot + 12 : bassRoot;
      this._tone("sawtooth", midiHz(m), t, SIXTEENTH * 1.8, 0.16,
        this.master, 420);
    }
    // Arp: 16ths through the delay bus.
    const idx = ARP_PATTERN[step % ARP_PATTERN.length];
    const octaveUp = step % 32 >= 16 ? 12 : 0;
    this._tone("square", midiHz(chord[idx] + octaveUp), t,
      SIXTEENTH * 0.9, 0.05, this.delayMix, 2400);
    this._tone("square", midiHz(chord[idx] + octaveUp), t,
      SIXTEENTH * 0.9, 0.045, this.delay, 2400);
    // Pad: one chord per 2-bar block.
    if (step % (STEPS_PER_BAR * 2) === 0) {
      this._pad(chord, t, STEPS_PER_BAR * 2 * SIXTEENTH);
    }
  }

  _run() {
    if (this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => {
      while (this.nextTime < this.ctx.currentTime + 0.25) {
        this._scheduleStep(this.step % TOTAL_STEPS, this.nextTime);
        this.step += 1;
        this.nextTime += SIXTEENTH;
      }
    }, 60);
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
    this._fadeTo(this.level, 2.0);
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
