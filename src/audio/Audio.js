// Every sound is synthesised with Web Audio at runtime: no audio files.

const NOTES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.45;
    this.muted = false;
    this.musicOn = false;
    this.tempo = 128;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  // Browsers only allow audio after a user gesture; call this from one.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.sfx.gain.value = this.sfxVolume * 0.6;
    this.music.gain.value = this.musicVolume * 0.32;
  }

  setVolumes({ sfx, music, muted }) {
    if (sfx !== undefined) this.sfxVolume = sfx;
    if (music !== undefined) this.musicVolume = music;
    if (muted !== undefined) this.muted = muted;
    this.applyVolumes();
  }

  tone(freq, { type = 'sine', at = 0, dur = 0.15, gain = 0.3, slide = 0, dest = this.sfx, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noiseBurst({ at = 0, dur = 0.3, gain = 0.3, freq = 1200, q = 0.8, type = 'bandpass', sweep = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  eat(combo = 1) {
    const base = 72 + Math.min(combo - 1, 7) * 2;
    this.tone(midi(base), { type: 'triangle', dur: 0.12, gain: 0.28 });
    this.tone(midi(base + 7), { type: 'triangle', at: 0.05, dur: 0.14, gain: 0.24 });
    this.tone(midi(base + 12), { type: 'sine', at: 0.1, dur: 0.25, gain: 0.2 });
  }

  prism() {
    [0, 4, 7, 11, 14, 19].forEach((n, i) => this.tone(midi(79 + n), { type: 'sine', at: i * 0.04, dur: 0.35, gain: 0.16 }));
    this.noiseBurst({ dur: 0.5, gain: 0.08, freq: 6000, type: 'highpass' });
  }

  turn() {
    this.tone(midi(84), { type: 'sine', dur: 0.03, gain: 0.04 });
  }

  rushStart() {
    this.noiseBurst({ dur: 0.45, gain: 0.22, freq: 400, sweep: 3000, q: 1.2 });
    this.tone(180, { type: 'sawtooth', dur: 0.35, gain: 0.06, slide: 400 });
  }

  levelUp() {
    [0, 4, 7, 12].forEach((n, i) => this.tone(midi(67 + n), { type: 'square', at: i * 0.07, dur: 0.16, gain: 0.08 }));
  }

  death() {
    this.tone(330, { type: 'sawtooth', dur: 0.7, gain: 0.18, slide: -260 });
    this.noiseBurst({ dur: 0.6, gain: 0.35, freq: 900, sweep: -700, q: 0.5, type: 'lowpass' });
  }

  start() {
    [0, 7, 12].forEach((n, i) => this.tone(midi(64 + n), { type: 'triangle', at: i * 0.08, dur: 0.2, gain: 0.2 }));
  }

  ui() {
    this.tone(midi(88), { type: 'sine', dur: 0.05, gain: 0.08 });
  }

  // ---- Music: a light, upbeat loop scheduled ahead of time ----
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
  }

  setIntensity(level) {
    this.tempo = 124 + Math.min(level, 12) * 3;
  }

  schedule() {
    if (!this.ctx) return;
    const spb = 60 / this.tempo / 4; // sixteenth notes
    const prog = [0, 0, 5, 5, 3, 3, 7, 7]; // chord roots per half-bar (scale degrees in semitones)
    const roots = [45, 45, 41, 41, 43, 43, 40, 40];
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const s = this.step % 128;
      const bar = Math.floor(s / 16) % 8;
      const at = this.nextTime - this.ctx.currentTime;
      const root = roots[bar];
      const g = this.music;
      // bass on 8ths with octave bounce
      if (s % 2 === 0) this.tone(midi(root + (s % 4 === 2 ? 12 : 0)), { type: 'triangle', at, dur: spb * 1.8, gain: 0.32, dest: g });
      // kick + hat
      if (s % 4 === 0) this.tone(120, { type: 'sine', at, dur: 0.12, gain: 0.45, slide: -80, dest: g });
      if (s % 2 === 1) this.hat(at, 0.05);
      if (s % 8 === 4) this.snare(at);
      // arpeggio
      const chord = [0, 4, 7, 12, 16, 12, 7, 4];
      if (prog[bar] !== undefined) {
        const n = root + 24 + chord[s % 8] + (bar % 2 === 1 && s % 16 >= 8 ? NOTES[1] : 0);
        this.tone(midi(n), { type: 'square', at, dur: spb * 0.9, gain: 0.05, dest: g });
      }
      this.nextTime += spb;
      this.step++;
    }
  }

  hat(at, gain) {
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 8000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f).connect(g).connect(this.music);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.05);
  }

  snare(at) {
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(f).connect(g).connect(this.music);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.13);
  }
}
