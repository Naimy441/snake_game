// Every sound is synthesised with Web Audio at runtime: no audio files.
//
// Music is an adaptive chiptune engine. Each zone has its own song (key,
// chords, a composed verse and chorus melody). Instrument layers (bass, arp,
// drums, lead, chord stabs, counter-melody, rush sparkle) fade in and out
// smoothly with the game's intensity, the drums step up through three
// grooves, sections hand over on bar lines with drum fills, and zone changes
// land on a downbeat after a fill and a crash, so nothing ever cuts abruptly.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const QUALITY = { maj: [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], 6: [0, 4, 7, 9] };

// Melodies: 16 tokens per bar. Numbers are scale degrees (1 = key root,
// 8 = an octave up), '-' holds the previous note, '.' is a rest.
const SONGS = [
  {
    name: 'Emerald Coast', key: 0, scale: 'major', tempo: 140, lead: 0.25,
    A: {
      chords: [[5, 'maj7'], [7, '6'], [4, 'm7'], [9, 'm7']],
      melody: [
        '8 - - 7 - - 6 - 5 - - - 3 - 5 -', '6 - - 5 - - 4 - 5 - - - - - . .',
        '7 - - 6 - - 5 - 3 - - - 2 - 3 -', '6 - - - - - . . 5 - 6 - 8 - 9 -',
        '10 - - 9 - - 8 - 6 - - - 8 - 9 -', '9 - - 8 - - 7 - 5 - - - 7 - 8 -',
        '7 - 5 - 7 - 9 - 8 - 7 - 5 - 3 -', '6 - - - - - - - . . . . 5 6 7 8',
      ],
    },
    B: {
      chords: [[2, 'm7'], [7, '7'], [0, 'maj7'], [9, 'm7']],
      melody: [
        '11 - - 10 - - 9 - 10 - - - 8 - 9 -', '9 - - 7 - - 5 - 7 - - - 9 - 11 -',
        '10 - - - - - 12 - - - 10 - 8 - - -', '6 - 8 - 10 - - - 9 - 8 - 7 - - -',
        '11 - - 10 - - 9 - 10 - - - 12 - 11 -', '11 - - 9 - - 7 - 9 - - - 11 - 12 -',
        '14 - - - - - 12 - - - 10 - 12 - - -', '13 - - - 12 - - - 10 - - - 8 - 9 -',
      ],
    },
  },
  {
    name: 'Golden Canyon', key: 2, scale: 'major', tempo: 146, lead: 0.25,
    A: {
      chords: [[9, 'm7'], [5, 'maj7'], [0, 'maj'], [7, 'maj']],
      melody: [
        '6 - - 5 - - 3 - 5 - - - 6 - 8 -', '7 - - 8 - - 7 - 5 - - - 3 - - -',
        '5 - - 3 - - 2 - 3 - 5 - 8 - - -', '7 - - - 6 - 5 - 6 - - - . . . .',
        '10 - - 9 - - 8 - 9 - - - 10 - 12 -', '11 - - 10 - - 9 - 7 - - - 5 - 7 -',
        '8 - 7 - 8 - 10 - 12 - - - 10 - 8 -', '9 - - - - - - - 7 . 8 . 9 . 10 .',
      ],
    },
    B: {
      chords: [[2, 'm7'], [7, '7'], [4, 'm7'], [9, 'm7']],
      melody: [
        '9 - - 8 - - 9 - 11 - - - 12 - - -', '12 - - 11 - - 9 - 7 - - - 9 - 11 -',
        '10 - - - 12 - - - 14 - - - 12 - 10 -', '13 - - 12 - - 10 - 12 - - - - - . .',
        '9 - - 8 - - 9 - 11 - - - 12 - 13 -', '14 - - 13 - - 12 - 11 - - - 9 - 11 -',
        '12 - - 10 - - 12 - 14 - - - 15 - - -', '13 - - - - - 12 - 10 - 9 - 8 - - -',
      ],
    },
  },
  {
    name: 'Neon Night', key: 9, scale: 'minor', tempo: 152, lead: 0.5,
    A: {
      chords: [[0, 'm7'], [8, 'maj7'], [10, 'maj'], [7, 'm7']],
      melody: [
        '8 - . 8 - . 7 - 8 - - - 10 - 8 -', '6 - - 5 - - 3 - 5 - - - 6 - - -',
        '7 - . 7 - . 6 - 7 - - - 9 - 7 -', '5 - - - - - . . 3 - 4 - 5 - 7 -',
        '8 - . 8 - . 10 - 12 - - - 10 - 8 -', '10 - - 9 - - 8 - 6 - - - 8 - - -',
        '9 - - 8 - - 7 - 9 - 11 - 12 - - -', '12 - - - 11 - - - 9 - - - 7 - - -',
      ],
    },
    B: {
      chords: [[5, 'm7'], [7, 'm7'], [8, 'maj7'], [10, '6']],
      melody: [
        '11 - - 10 - - 11 - 12 - - - 13 - 12 -', '12 - - 11 - - 9 - 7 - - - 9 - - -',
        '10 - - - 12 - - - 13 - - - 12 - 10 -', '11 - - - - - 12 - 14 - - - - - . .',
        '11 - - 10 - - 11 - 12 - - - 13 - 15 -', '14 - - 12 - - 11 - 12 - - - 9 - - -',
        '10 - 12 - 13 - 12 - 10 - 9 - 8 - - -', '7 - - - 9 - - - 11 - 12 - 14 - 15 -',
      ],
    },
  },
  {
    name: 'Cyber Overdrive', key: 6, scale: 'minor', tempo: 160, lead: 0.5,
    A: {
      chords: [[0, 'm'], [8, 'maj'], [10, 'maj'], [7, 'm']],
      melody: [
        '8 - 8 - 10 - 8 - 12 - - - 10 - 8 -', '6 - 6 - 8 - 6 - 10 - - - 8 - 6 -',
        '7 - 7 - 9 - 7 - 11 - - - 12 - 11 -', '12 - - - 10 - - - 9 - - - 8 - - -',
        '15 - - 12 - - 10 - 12 - - - 15 - 14 -', '13 - - 10 - - 8 - 10 - - - 13 - 12 -',
        '11 - - 12 - - 14 - 12 - 11 - 9 - 11 -', '12 - - - - - - - 12 . 14 . 15 . 16 .',
      ],
    },
    B: {
      chords: [[5, 'm'], [8, 'maj'], [10, 'maj'], [0, 'm']],
      melody: [
        '11 - - 12 - - 13 - 12 - 11 - 10 - 11 -', '13 - - 12 - - 10 - 8 - - - 10 - 12 -',
        '14 - - - 12 - - - 11 - - - 12 - 14 -', '15 - - - - - 12 - 10 - - - 8 - - -',
        '11 - - 12 - - 13 - 15 - - - 13 - 12 -', '13 - - 15 - - 17 - 15 - - - 13 - 12 -',
        '14 - 12 - 14 - 16 - 14 - 12 - 11 - 9 -', '8 - - - - - - - 15 - - - - - - -',
      ],
    },
  },
];

const BASS = {
  menu: 'R - - - - - - - 5 - - - - - - -',
  1: 'R - - - - - . R - - . . 5 - . .',
  2: 'R - . R O . R - . R - . 5 . 7 .',
  3: 'R . O R . O R . R O . R 5 . 7 O',
};
const DRUMS = {
  1: { k: 'x.......x.x.....', s: '....x.......x...', h: '..x...x...x...x.' },
  2: { k: 'x.....x...x.....', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.' },
  3: { k: 'x..x..x...x..x..', s: '....x..x....x.x.', h: 'xxxxxxxxxxxxxxxx' },
};
const FILL = { k: 'x.....x.x.......', s: '....x...xxxxxxxx', h: 'x.x.x.x.........' };

function parseMelody(lines) {
  const toks = lines.join(' ').split(/\s+/);
  const notes = new Array(toks.length).fill(null);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === '-' || t === '.') continue;
    let len = 1;
    while (toks[i + len] === '-') len++;
    notes[i] = { deg: Number(t), len };
  }
  return notes;
}

for (const s of SONGS) {
  s.A.notes = parseMelody(s.A.melody);
  s.B.notes = parseMelody(s.B.melody);
  s.root = s.key > 5 ? 48 + s.key : 60 + s.key;
}

function degreeToSemis(scale, deg) {
  const d = deg - 1;
  const oct = Math.floor(d / 7);
  return SCALES[scale][((d % 7) + 7) % 7] + oct * 12;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.45;
    this.muted = false;
    this.musicOn = false;
    this.timer = null;
    this.state = { menu: true, intensity: 0, rush: false, zone: 0, level: 0, paused: false };
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
    this.music = c.createGain();
    this.musicFilter = c.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicFilter.Q.value = 0.7;
    this.musicFade = c.createGain();
    this.music.connect(this.musicFilter).connect(this.musicFade).connect(this.master);

    // echo + small room for the lead and sfx
    this.delay = c.createDelay(1);
    this.delayFb = c.createGain();
    this.delayFb.gain.value = 0.32;
    const dl = c.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 3200;
    this.delay.connect(dl).connect(this.delayFb).connect(this.delay);
    this.delayOut = c.createGain();
    this.delayOut.gain.value = 0.28;
    dl.connect(this.delayOut).connect(this.music);
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

    // one gain per music layer, faded smoothly with intensity
    this.layers = {};
    for (const name of ['bass', 'arp', 'drums', 'lead', 'stabs', 'counter', 'sparkle']) {
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(this.music);
      this.layers[name] = { gain: g, level: 0, target: 0 };
    }
    this.layers.lead.gain.connect(this.delay);
    this.layers.lead.gain.connect(this.reverb);
    this.layers.counter.gain.connect(this.delay);
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
    this.music.gain.value = this.musicVolume * 0.42;
  }

  setVolumes({ sfx, music, muted }) {
    if (sfx !== undefined) this.sfxVolume = sfx;
    if (music !== undefined) this.musicVolume = music;
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

  // ---------------------------------------------------------------- music
  startMusic({ menu = false } = {}) {
    if (!this.ctx) return;
    this.state.menu = menu;
    clearTimeout(this.stopTimer);
    const now = this.ctx.currentTime;
    this.musicFade.gain.cancelScheduledValues(now);
    this.musicFade.gain.setTargetAtTime(1, now, 0.15);
    this.musicFilter.frequency.cancelScheduledValues(now);
    this.musicFilter.frequency.setTargetAtTime(18000, now, 0.2);
    if (this.musicOn) {
      // already playing (e.g. menu -> game): restart the song on the next bar
      this.restartAtBar = true;
      return;
    }
    this.musicOn = true;
    this.zone = this.state.zone;
    this.section = 'A';
    this.bar = 0;
    this.step = 0;
    this.tempo = menu ? 112 : SONGS[this.zone].tempo;
    this.fill = false;
    this.pendingZone = null;
    this.nextTime = now + 0.06;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  // Fade out instead of cutting (death, back to silence).
  stopMusic({ fade = 1.2 } = {}) {
    if (!this.ctx || !this.musicOn) return;
    const now = this.ctx.currentTime;
    this.musicFade.gain.cancelScheduledValues(now);
    this.musicFade.gain.setTargetAtTime(0, now, fade / 4);
    this.musicFilter.frequency.cancelScheduledValues(now);
    this.musicFilter.frequency.setTargetAtTime(400, now, fade / 4);
    clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => {
      if (this.musicFade.gain.value < 0.05) {
        this.musicOn = false;
        clearInterval(this.timer);
      }
    }, fade * 1000 + 100);
  }

  // Muffled and quieter while paused, so the music keeps flowing.
  setPaused(paused) {
    if (!this.ctx) return;
    this.state.paused = paused;
    const now = this.ctx.currentTime;
    this.musicFilter.frequency.cancelScheduledValues(now);
    this.musicFilter.frequency.setTargetAtTime(paused ? 900 : 18000, now, 0.12);
    this.musicFade.gain.cancelScheduledValues(now);
    this.musicFade.gain.setTargetAtTime(paused ? 0.45 : 1, now, 0.12);
  }

  // Called every frame by the game.
  setMusicState({ menu, intensity, rush, zone, level }) {
    const s = this.state;
    if (menu !== undefined) s.menu = menu;
    if (intensity !== undefined) s.intensity = intensity;
    if (rush !== undefined) s.rush = rush;
    if (level !== undefined) s.level = level;
    if (zone !== undefined && zone !== s.zone) {
      s.zone = zone;
      if (this.musicOn) this.pendingZone = zone;
      else this.zone = zone;
    }
  }

  tier() {
    if (this.state.menu) return 0;
    const i = this.state.intensity;
    return i < 0.3 ? 1 : i < 0.65 ? 2 : 3;
  }

  updateLayers() {
    const s = this.state;
    const i = s.intensity;
    const menu = s.menu;
    const t = {
      bass: menu ? 0.55 : 1,
      arp: menu ? 0.75 : 0.55 + i * 0.45,
      drums: menu ? 0 : 1,
      lead: menu ? 0 : 1,
      stabs: !menu && i >= 0.35 ? 1 : 0,
      counter: !menu && i >= 0.62 ? 1 : 0,
      sparkle: !menu && s.rush ? 1 : 0,
    };
    const now = this.ctx.currentTime;
    for (const [k, v] of Object.entries(t)) {
      const L = this.layers[k];
      if (L.target !== v) {
        L.target = v;
        L.gain.gain.cancelScheduledValues(now);
        L.gain.gain.setTargetAtTime(v, now, k === 'sparkle' ? 0.25 : 1.4);
      }
      L.level = L.gain.gain.value;
    }
  }

  active(name) {
    const L = this.layers[name];
    return L.target > 0 || L.level > 0.01;
  }

  schedule() {
    if (!this.ctx || !this.musicOn) return;
    this.updateLayers();
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.nextTime);
      this.nextTime += 60 / this.tempo / 4;
      this.advance();
    }
  }

  advance() {
    this.step++;
    if (this.step < 16) return;
    this.step = 0;
    this.bar++;
    const song = SONGS[this.zone];
    const target = this.state.menu ? 112 : song.tempo + Math.min(4, this.state.level - [0, 3, 6, 9][this.zone]) * 1.5;
    this.tempo += (target - this.tempo) * 0.35;
    if (this.fill) {
      this.fill = false;
      if (this.pendingZone !== null) {
        this.zone = this.pendingZone;
        this.pendingZone = null;
        this.section = 'A';
        this.bar = 0;
        this.crash = true;
        return;
      }
    }
    if (this.restartAtBar) {
      this.restartAtBar = false;
      this.section = 'A';
      this.bar = 0;
      this.crash = !this.state.menu;
      return;
    }
    if (this.pendingZone !== null) {
      this.fill = true; // one bar of fill, then the new zone lands
      return;
    }
    if (this.bar >= 8) {
      this.bar = 0;
      const wantB = !this.state.menu && this.state.intensity >= 0.3;
      this.section = this.section === 'A' && wantB ? 'B' : 'A';
      this.crash = !this.state.menu;
    } else if (this.bar === 7 && !this.state.menu) {
      const wantB = this.state.intensity >= 0.3;
      if (this.section === 'B' || wantB) this.fill = true;
    }
  }

  playStep(t) {
    const song = SONGS[this.zone];
    const sec = song[this.section];
    const s = this.step;
    const barIdx = Math.min(7, this.bar);
    const [cRoot, cQual] = sec.chords[barIdx % 4];
    const chord = QUALITY[cQual];
    const key = song.key;
    const spb = 60 / this.tempo / 4;
    const tier = this.tier();
    const L = this.layers;

    // bass: triangle with a thin pulse on top for presence
    if (this.active('bass')) {
      const pat = (tier === 0 ? BASS.menu : BASS[tier]).split(' ');
      const tok = pat[s];
      if (tok !== '-' && tok !== '.') {
        let len = 1;
        while (pat[s + len] === '-') len++;
        const base = 36 + ((key + cRoot) % 12);
        const off = tok === 'R' ? 0 : tok === 'O' ? 12 : tok === '5' ? 7 : tok === '7' ? chord[3] ?? 10 : chord[1];
        const f = midi(base + off);
        this.voice(f, { t, dur: spb * len * 0.92, gain: 0.34, wave: 'triangle', dest: L.bass.gain, release: 0.03 });
        if (tier >= 2) this.voice(f * 2, { t, dur: spb * len * 0.7, gain: 0.035, wave: 0.5, dest: L.bass.gain, release: 0.03 });
      }
    }

    // drums
    if (this.active('drums') && tier > 0) {
      const d = this.fill ? FILL : DRUMS[tier];
      if (this.crash && s === 0) {
        this.noiseHit({ t, dur: 1.1, gain: 0.13, freq: 5000, type: 'highpass', dest: L.drums.gain });
        this.crash = false;
      }
      if (d.k[s] === 'x') this.kick(t, L.drums.gain);
      if (d.s[s] === 'x') this.snare(t, L.drums.gain, this.fill ? 0.06 + (s / 16) * 0.12 : 0.16);
      if (d.h[s] === 'x') this.hat(t, L.drums.gain, s % 4 === 2 ? 0.07 : 0.045, tier === 3 && s % 8 === 6);
      if (this.fill && s >= 8 && s % 2 === 0) this.voice(midi(50 - (s - 8)), { t, dur: 0.12, gain: 0.22, wave: 'triangle', slide: 0.5, dest: L.drums.gain });
    } else if (this.crash && s === 0) this.crash = false;

    // arpeggio
    if (this.active('arp')) {
      const order = [0, 1, 2, 3, 2, 1, 0, 1];
      const idx = order[s % 8] % chord.length;
      const oct = s % 8 === 3 && chord.length === 3 ? 12 : 0;
      const n = 72 + ((key + cRoot) % 12) + chord[idx] + oct;
      this.voice(midi(n), { t, dur: spb * 0.8, gain: tier === 0 ? 0.05 : 0.04, wave: 0.125, dest: L.arp.gain, release: 0.05 });
    }

    // offbeat chord stabs
    if (this.active('stabs') && s % 4 === 2) {
      for (let k = 0; k < 3; k++) {
        const n = 60 + ((key + cRoot) % 12) + chord[k];
        this.voice(midi(n), { t, dur: spb * 0.9, gain: 0.03, wave: 0.5, dest: L.stabs.gain, release: 0.04 });
      }
    }

    // lead melody and its harmony
    const note = sec.notes[barIdx * 16 + s];
    if (note && (this.active('lead') || this.active('counter'))) {
      const semis = degreeToSemis(song.scale, note.deg);
      const dur = spb * note.len * 0.95;
      if (this.active('lead')) this.voice(midi(song.root + semis), { t, dur, gain: 0.085, wave: song.lead, dest: L.lead.gain, release: Math.min(0.08, dur * 0.3), vibrato: note.len >= 3 ? 0.008 : 0 });
      if (this.active('counter')) {
        const h = degreeToSemis(song.scale, note.deg - 2);
        this.voice(midi(song.root + h), { t, dur, gain: 0.04, wave: 0.125, dest: L.counter.gain, release: Math.min(0.08, dur * 0.3) });
      }
    }

    // rush sparkle: fast high arpeggio
    if (this.active('sparkle')) {
      const n = 84 + ((key + cRoot) % 12) + chord[s % chord.length] + (s % 2 ? 12 : 0);
      this.voice(midi(n), { t, dur: spb * 0.5, gain: 0.03, wave: 0.125, dest: L.sparkle.gain, release: 0.03 });
    }
  }

  kick(t, dest) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.18);
  }

  snare(t, dest, gain = 0.16) {
    this.noiseHit({ t, dur: 0.12, gain, freq: 1900, q: 0.9, dest });
    this.voice(190, { t, dur: 0.06, gain: gain * 0.9, wave: 'triangle', slide: 0.6, dest });
  }

  hat(t, dest, gain, open = false) {
    this.noiseHit({ t, dur: open ? 0.14 : 0.035, gain, freq: 8000, type: 'highpass', q: 0.7, dest });
  }
}
