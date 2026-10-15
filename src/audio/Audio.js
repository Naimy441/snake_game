// Every sound is synthesised with Web Audio at runtime: no audio files.
// Sound effects only; the game has no music.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxVolume = 0.8;
    this.muted = false;
  }

  // Browsers only allow audio after a user gesture; call this from one.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.master.connect(this.comp).connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.6);
    this.reverbOut = c.createGain();
    this.reverbOut.gain.value = 0.22;
    this.reverb.connect(this.reverbOut).connect(this.master);

    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.waves = {};
    for (const duty of [0.125, 0.25, 0.5]) this.waves[duty] = this.pulseWave(duty);

    this.sfxSend = c.createGain();
    this.sfxSend.gain.value = 0.35;
    this.sfx.connect(this.sfxSend).connect(this.reverb);
    this.applyVolumes();
  }

  makeImpulse(seconds) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  pulseWave(duty) {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return this.ctx.createPeriodicWave(real, imag);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.sfx.gain.value = this.sfxVolume * 0.55;
  }

  setVolumes({ sfx, muted }) {
    if (sfx !== undefined) this.sfxVolume = sfx;
    if (muted !== undefined) this.muted = muted;
    this.applyVolumes();
  }

  // ---------------------------------------------------------------- voices
  voice(freq, { at = 0, t = null, dur = 0.15, gain = 0.3, wave = 0.5, dest = this.sfx, attack = 0.004, release = 0.06, slide = 0, vibrato = 0, pan = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const start = t ?? c.currentTime + at;
    const o = c.createOscillator();
    if (typeof wave === 'number') o.setPeriodicWave(this.waves[wave]);
    else o.type = wave;
    o.frequency.setValueAtTime(freq, start);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), start + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.setValueAtTime(gain, start + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    let node = o.connect(g);
    if (vibrato > 0 && dur > 0.25) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 5.8;
      lg.gain.setValueAtTime(0, start);
      lg.gain.linearRampToValueAtTime(freq * vibrato, start + Math.min(0.25, dur * 0.5));
      lfo.connect(lg).connect(o.frequency);
      lfo.start(start);
      lfo.stop(start + dur + 0.02);
    }
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(dest);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  noiseHit({ at = 0, t = null, dur = 0.2, gain = 0.3, freq = 1200, q = 0.8, type = 'bandpass', sweep = 1, dest = this.sfx } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const start = t ?? c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, start);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), start + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  // ---------------------------------------------------------------- sfx
  eat(combo = 1, pan = 0) {
    // bright two-tone chime that climbs with the combo
    const b = 83 + Math.min(combo - 1, 7);
    this.voice(midi(b), { wave: 0.5, dur: 0.07, gain: 0.16, pan });
    this.voice(midi(b + 4), { wave: 0.5, at: 0.055, dur: 0.22, gain: 0.15, release: 0.18, pan });
    this.voice(midi(b + 16), { wave: 'sine', at: 0.055, dur: 0.3, gain: 0.06, release: 0.25, pan });
  }

  prism() {
    [0, 4, 7, 11, 14, 19, 23].forEach((n, i) => this.voice(midi(79 + n), { wave: 0.25, at: i * 0.035, dur: 0.3, gain: 0.08, release: 0.25 }));
    this.noiseHit({ dur: 0.5, gain: 0.06, freq: 7000, type: 'highpass' });
  }

  chainLink(i) {
    const steps = [0, 2, 4, 7, 9, 12];
    const n = 79 + steps[Math.min(i, steps.length - 1)];
    this.voice(midi(n), { wave: 0.125, dur: 0.09, gain: 0.14 });
    this.voice(midi(n + 12), { wave: 0.25, at: 0.04, dur: 0.16, gain: 0.08, release: 0.12 });
  }

  chainComplete() {
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.voice(midi(72 + n), { wave: 0.25, at: i * 0.045, dur: 0.18, gain: 0.11 }));
    this.voice(midi(96), { wave: 'sine', at: 0.32, dur: 0.6, gain: 0.08, release: 0.5, vibrato: 0.01 });
    this.noiseHit({ at: 0.3, dur: 0.9, gain: 0.08, freq: 6000, type: 'highpass' });
  }

  chainBroken() {
    [7, 6, 0].forEach((n, i) => this.voice(midi(70 + n), { wave: 0.5, at: i * 0.07, dur: 0.12, gain: 0.1 }));
  }

  preySpotted() {
    this.voice(1300, { wave: 'sine', dur: 0.07, gain: 0.08, slide: 1.6 });
    this.voice(1500, { wave: 'sine', at: 0.09, dur: 0.07, gain: 0.08, slide: 1.6 });
  }

  preyCaught() {
    this.noiseHit({ dur: 0.12, gain: 0.25, freq: 700, type: 'lowpass', sweep: 0.4 });
    [0, 7, 12, 16, 19].forEach((n, i) => this.voice(midi(76 + n), { wave: 0.25, at: 0.06 + i * 0.05, dur: 0.16, gain: 0.11 }));
  }

  preyEscaped() {
    this.voice(1800, { wave: 'sine', dur: 0.25, gain: 0.07, slide: 0.35 });
    this.noiseHit({ dur: 0.25, gain: 0.08, freq: 900, sweep: 0.5 });
  }

  boost() {
    this.noiseHit({ dur: 0.4, gain: 0.22, freq: 500, sweep: 7, q: 1.4 });
    this.voice(220, { wave: 0.25, dur: 0.28, gain: 0.08, slide: 3 });
    this.voice(midi(84), { wave: 0.5, at: 0.05, dur: 0.12, gain: 0.07 });
  }

  turn() {
    this.voice(midi(96), { wave: 0.125, dur: 0.025, gain: 0.025 });
  }

  rushStart() {
    this.noiseHit({ dur: 0.45, gain: 0.2, freq: 400, sweep: 8, q: 1.2 });
    this.voice(180, { wave: 'sawtooth', dur: 0.35, gain: 0.05, slide: 3 });
  }

  levelUp() {
    [0, 4, 7, 12].forEach((n, i) => this.voice(midi(72 + n), { wave: 0.5, at: i * 0.06, dur: 0.14, gain: 0.08 }));
    this.voice(midi(88), { wave: 0.25, at: 0.24, dur: 0.4, gain: 0.07, release: 0.3, vibrato: 0.012 });
  }

  zoneUp() {
    [0, 7, 12, 16, 19, 24].forEach((n, i) => this.voice(midi(67 + n), { wave: 0.25, at: i * 0.07, dur: 0.22, gain: 0.09 }));
    this.noiseHit({ dur: 1.4, gain: 0.1, freq: 300, sweep: 20, q: 1 });
    this.noiseHit({ at: 0.45, dur: 1.2, gain: 0.09, freq: 6000, type: 'highpass' });
  }

  // Jetpack ignition: a rising roar, a climbing saw and a bright arpeggio.
  liftoff() {
    this.noiseHit({ dur: 1.8, gain: 0.22, freq: 180, sweep: 22, q: 0.9 });
    this.noiseHit({ at: 0.1, dur: 1.2, gain: 0.12, freq: 900, type: 'lowpass', sweep: 0.3 });
    this.voice(90, { wave: 'sawtooth', dur: 1.4, gain: 0.07, slide: 6 });
    [0, 4, 7, 12, 16, 19, 24, 28].forEach((n, i) => this.voice(midi(72 + n), { wave: 0.25, at: 0.5 + i * 0.06, dur: 0.24, gain: 0.07 }));
  }

  obstacleWarn() {
    this.voice(midi(57), { wave: 0.5, dur: 0.09, gain: 0.07 });
    this.voice(midi(57), { wave: 0.5, at: 0.14, dur: 0.09, gain: 0.07 });
  }

  obstacleRise() {
    this.voice(120, { wave: 'sine', dur: 0.3, gain: 0.25, slide: 0.4 });
    this.noiseHit({ dur: 0.3, gain: 0.12, freq: 300, type: 'lowpass' });
  }

  death() {
    this.voice(330, { wave: 0.5, dur: 0.7, gain: 0.12, slide: 0.2 });
    this.noiseHit({ dur: 0.7, gain: 0.32, freq: 900, sweep: 0.2, q: 0.5, type: 'lowpass' });
  }

  gameOver() {
    [7, 3, 0, -5].forEach((n, i) => this.voice(midi(69 + n), { wave: 0.25, at: 0.2 + i * 0.16, dur: i === 3 ? 0.6 : 0.16, gain: 0.08, release: 0.12 }));
  }

  countdown(go) {
    this.voice(midi(go ? 93 : 81), { wave: 0.5, dur: go ? 0.3 : 0.1, gain: 0.1, release: 0.08 });
  }

  start() {
    [0, 7, 12].forEach((n, i) => this.voice(midi(76 + n), { wave: 0.25, at: i * 0.06, dur: 0.14, gain: 0.1 }));
  }

  ui() {
    this.voice(midi(88), { wave: 0.125, dur: 0.04, gain: 0.05 });
  }
}
