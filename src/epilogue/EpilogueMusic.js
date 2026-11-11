// The epilogue's music and sound effects, all original and synthesised like
// the rest of the game's audio.
//
// EpilogueMusic is a custom track for AudioEngine (startMusic({ custom })),
// so pause, slow motion and the music volume all apply. Its moods:
//   home    - "Home Sweet Coil": a music-box waltz in F major.
//   doom    - a low drone that swells while the sky burns.
//   battle  - "Colossus": a driving D minor theme for the meteor storm.
//   victory - the home waltz again, triumphant, with drums and brass.
//   off     - silence.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// [note, length in steps]; 0 is a rest
const HOME_MELODY = [
  [[69, 2], [72, 2], [77, 2]],
  [[76, 3], [74, 1], [72, 2]],
  [[74, 2], [77, 2], [74, 2]],
  [[72, 4], [67, 2]],
  [[69, 2], [72, 2], [81, 2]],
  [[79, 3], [77, 1], [74, 2]],
  [[74, 2], [76, 2], [79, 2]],
  [[77, 6]],
];
// chord roots (MIDI, bass octave) and chord tones, one per waltz bar
const HOME_CHORDS = [
  [41, [57, 60, 65]], [45, [57, 60, 64]], [46, [58, 62, 65]], [48, [55, 60, 64]],
  [41, [57, 60, 65]], [38, [57, 62, 65]], [46, [58, 62, 67]], [41, [57, 60, 65]],
];

const BATTLE_MELODY = [
  [[74, 4], [77, 2], [81, 4], [79, 2], [77, 2], [76, 2]],
  [[77, 6], [74, 2], [70, 4], [74, 4]],
  [[72, 4], [77, 4], [81, 6], [84, 2]],
  [[84, 4], [79, 4], [76, 8]],
  [[86, 4], [84, 2], [81, 2], [79, 4], [81, 4]],
  [[82, 6], [81, 2], [77, 4], [74, 4]],
  [[76, 4], [79, 4], [84, 4], [88, 4]],
  [[85, 8], [81, 4], [76, 4]],
];
const BATTLE_CHORDS = [
  [38, [62, 65, 69]], [34, [62, 65, 70]], [41, [60, 65, 69]], [36, [60, 64, 67]],
  [38, [62, 65, 69]], [34, [62, 65, 70]], [36, [60, 64, 67]], [33, [61, 64, 69]],
];

// expand [note, len] bars into per-step note starts
function expand(bars, steps) {
  return bars.map((bar) => {
    const out = new Array(steps).fill(null);
    let s = 0;
    for (const [n, len] of bar) {
      if (n) out[s] = { n, len };
      s += len;
    }
    return out;
  });
}
const HOME_STEPS = expand(HOME_MELODY, 6);
const BATTLE_STEPS = expand(BATTLE_MELODY, 16);

const MODES = {
  home: { tempo: 96, steps: 6, beatSteps: 2 },
  victory: { tempo: 126, steps: 6, beatSteps: 2 },
  battle: { tempo: 152, steps: 16, beatSteps: 4 },
  doom: { tempo: 60, steps: 4, beatSteps: 1 },
  off: { tempo: 60, steps: 4, beatSteps: 1 },
};

export class EpilogueMusic {
  constructor(audio) {
    this.audio = audio;
    this.mode = 'home';
    this.playing = false;
    this.built = false;
  }

  build() {
    if (this.built) return;
    const a = this.audio;
    const c = a.ctx;
    this.out = c.createGain();
    this.out.connect(a.music);
    this.bus = {};
    for (const k of ['box', 'pad', 'bass', 'drums', 'lead', 'stabs']) {
      const g = c.createGain();
      g.connect(this.out);
      this.bus[k] = g;
    }
    this.bus.lead.connect(a.delay);
    this.bus.lead.connect(a.musicSend);
    this.bus.box.connect(a.musicSend);
    this.built = true;
  }

  start(at) {
    if (!this.audio.ctx) return;
    this.build();
    this.playing = true;
    this.out.gain.cancelScheduledValues(at);
    this.out.gain.setValueAtTime(1, at);
    this.begin(this.mode, at);
  }

  stop() {
    this.playing = false;
  }

  begin(mode, at) {
    this.mode = mode;
    const m = MODES[mode];
    this.spb = 60 / m.tempo / m.beatSteps;
    this.steps = m.steps;
    this.step = 0;
    this.bar = 0;
    this.nextTime = at;
    this.t0 = at;
  }

  // Switch mood now (on the next step), from the top of its tune.
  setMode(mode) {
    if (!this.audio.ctx || mode === this.mode) return;
    this.begin(mode, Math.max(this.nextTime || 0, this.audio.ctx.currentTime + 0.04));
  }

  schedule(until) {
    if (!this.playing) return;
    while (this.nextTime < until) {
      this.playStep(this.nextTime);
      this.nextTime += this.spb;
      this.step++;
      if (this.step >= this.steps) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  // where we are, in beats (for anything that pulses in time)
  beat() {
    if (!this.playing || !this.audio.ctx) return 0;
    const m = MODES[this.mode];
    return (this.audio.ctx.currentTime - this.t0) / (this.spb * m.beatSteps);
  }

  playStep(t) {
    const a = this.audio;
    const s = this.step;
    const B = this.bus;
    const spb = this.spb;
    if (this.mode === 'home' || this.mode === 'victory') {
      const win = this.mode === 'victory';
      const i = this.bar % 8;
      const [root, chord] = HOME_CHORDS[i];
      const note = HOME_STEPS[i][s];
      if (note) {
        const dur = note.len * spb;
        if (win) {
          a.voice(midi(note.n), { t, dur: dur * 0.95, gain: 0.07, wave: 0.25, dest: B.lead, vibrato: 0.01, release: 0.12 });
          a.voice(midi(note.n - 12), { t, dur: dur * 0.9, gain: 0.04, wave: 'sawtooth', dest: B.lead, release: 0.1 });
        } else {
          // music box: a bright sine with a glassy overtone, ringing out
          a.voice(midi(note.n + 12), { t, dur: 1.1, gain: 0.09, wave: 'sine', dest: B.box, attack: 0.002, release: 1.0 });
          a.voice(midi(note.n + 24), { t, dur: 0.4, gain: 0.025, wave: 'triangle', dest: B.box, attack: 0.002, release: 0.35 });
        }
      }
      // oom-pah-pah: bass on one, chord on two and three
      if (s === 0) a.voice(midi(root + (win ? 12 : 12)), { t, dur: spb * 2, gain: win ? 0.12 : 0.07, wave: win ? 0.5 : 'sine', dest: B.bass, release: 0.2 });
      if (s === 2 || s === 4) for (const n of chord) a.voice(midi(n + (win ? 0 : 12)), { t, dur: spb * 1.4, gain: win ? 0.03 : 0.018, wave: win ? 0.125 : 'triangle', dest: B.pad, release: 0.2 });
      if (win) {
        if (s === 0) a.kick(t, B.drums);
        if (s === 2 || s === 4) a.snare(t, B.drums, 0.08);
        a.hat(t, B.drums, s % 2 ? 0.02 : 0.035);
        if (s === 0 && i % 4 === 0) a.noiseHit({ t, dur: 1.2, gain: 0.08, freq: 6000, type: 'highpass', dest: B.drums });
      } else if (s === 0) {
        // a soft pad underneath
        for (const n of chord) a.voice(midi(n), { t, dur: spb * 6.2, gain: 0.012, wave: 'sine', dest: B.pad, attack: 0.4, release: 0.6 });
      }
      return;
    }
    if (this.mode === 'doom') {
      if (s === 0 && this.bar % 2 === 0) {
        a.voice(midi(26), { t, dur: 8.2, gain: 0.16, wave: 'sawtooth', dest: B.bass, attack: 1.2, release: 2 });
        a.voice(midi(33), { t, dur: 8.2, gain: 0.06, wave: 'sawtooth', dest: B.bass, attack: 2, release: 2 });
        a.voice(midi(62), { t: t + 2, dur: 6, gain: 0.025, wave: 'sine', dest: B.pad, attack: 2.5, release: 2, vibrato: 0.01 });
      }
      return;
    }
    if (this.mode === 'battle') {
      const i = this.bar % 8;
      const [root, chord] = BATTLE_CHORDS[i];
      const lead = this.bar >= 2; // two bars of groove first, then the theme
      const note = lead ? BATTLE_STEPS[i][s] : null;
      if (note) {
        const dur = note.len * spb;
        a.voice(midi(note.n), { t, dur: dur * 0.92, gain: 0.075, wave: 0.25, dest: B.lead, vibrato: 0.012, release: 0.08 });
        a.voice(midi(note.n + 7), { t, dur: dur * 0.9, gain: 0.02, wave: 0.5, dest: B.lead, release: 0.08 });
      }
      // galloping bass: root and octave
      if (s % 2 === 0) a.voice(midi(root + (s % 8 === 6 ? 12 : 0)), { t, dur: spb * 1.6, gain: 0.13, wave: 0.5, dest: B.bass, release: 0.05 });
      // syncopated power stabs
      if (s === 0 || s === 3 || s === 6 || s === 10) for (const n of chord) a.voice(midi(n - 12), { t, dur: spb * 1.5, gain: 0.03, wave: 'sawtooth', dest: B.stabs, release: 0.06 });
      // drums
      if (s === 0 || s === 6 || s === 8) a.kick(t, B.drums);
      if (s === 4 || s === 12) a.snare(t, B.drums, 0.14);
      if (s === 14 && i % 4 === 3) a.snare(t, B.drums, 0.1);
      if (s === 15 && i % 4 === 3) a.snare(t, B.drums, 0.12);
      a.hat(t, B.drums, s % 4 === 2 ? 0.05 : 0.025, s % 8 === 6);
      if (s === 0 && i % 4 === 0) a.noiseHit({ t, dur: 1.4, gain: 0.09, freq: 6500, type: 'highpass', dest: B.drums });
    }
  }
}

// ---------------------------------------------------------------- sfx
export const sfx = {
  // happy: a little rising sparkle (the snake smiles, hearts pop)
  happy(a) {
    [72, 76, 79, 84, 88].forEach((n, i) => a.voice(midi(n), { at: i * 0.06, dur: 0.35, gain: 0.07, wave: 'sine', release: 0.3 }));
  },
  door(a, open = true) {
    // a wooden creak and a knock
    a.voice(open ? 180 : 140, { dur: 0.5, gain: 0.05, wave: 'sawtooth', slide: open ? 1.6 : 0.7, release: 0.3 });
    a.noiseHit({ at: open ? 0 : 0.35, dur: 0.08, gain: 0.18, freq: 500, q: 2 });
  },
  // the ground starts to shake: a long sub rumble with gravel on top
  rumble(a, dur = 3) {
    a.voice(38, { dur, gain: 0.35, wave: 'sine', attack: dur * 0.5, release: 0.6, vibrato: 0.08 });
    a.voice(52, { dur, gain: 0.12, wave: 'sawtooth', attack: dur * 0.6, release: 0.5 });
    a.noiseHit({ dur, gain: 0.18, freq: 160, type: 'lowpass', q: 0.5 });
    for (let i = 0; i < 8; i++) a.noiseHit({ at: Math.random() * dur, dur: 0.12, gain: 0.08, freq: 900 + Math.random() * 600, q: 1.5 });
  },
  // the door bursts open
  slam(a) {
    a.noiseHit({ dur: 0.18, gain: 0.35, freq: 420, q: 1.2 });
    a.voice(90, { dur: 0.25, gain: 0.3, wave: 'sine', slide: 0.5 });
  },
  // the giant meteor screaming down: a long falling whistle and a roar
  incoming(a, dur = 4) {
    a.voice(1800, { dur, gain: 0.04, wave: 'sine', slide: 0.18, attack: dur * 0.3, release: 0.2 });
    a.voice(900, { dur, gain: 0.03, wave: 'triangle', slide: 0.25, attack: dur * 0.4, release: 0.2 });
    a.noiseHit({ dur, gain: 0.25, freq: 300, sweep: 6, q: 0.6, type: 'bandpass' });
    a.noiseHit({ at: dur * 0.5, dur: dur * 0.5, gain: 0.2, freq: 2000, sweep: 0.2, type: 'lowpass' });
  },
  // impact: the biggest boom in the game
  impact(a) {
    a.voice(70, { dur: 5, gain: 0.8, wave: 'sine', slide: 0.3, release: 4 });
    a.voice(45, { dur: 6, gain: 0.5, wave: 'sine', release: 5 });
    a.noiseHit({ dur: 6, gain: 0.55, freq: 1800, type: 'lowpass', sweep: 0.05, q: 0.4 });
    a.noiseHit({ dur: 2.5, gain: 0.25, freq: 5000, type: 'highpass' });
    for (let i = 0; i < 14; i++) a.noiseHit({ at: 0.4 + Math.random() * 3, dur: 0.15, gain: 0.07, freq: 300 + Math.random() * 1200, q: 1 });
  },
  heartbeat(a, gain = 1) {
    // lub-dub
    a.voice(62, { dur: 0.16, gain: 0.55 * gain, wave: 'sine', slide: 0.6 });
    a.noiseHit({ dur: 0.08, gain: 0.08 * gain, freq: 120, type: 'lowpass' });
    a.voice(55, { at: 0.2, dur: 0.18, gain: 0.42 * gain, wave: 'sine', slide: 0.6 });
  },
  // resolve: a held minor chord swelling into major
  resolve(a) {
    [50, 57, 62, 65].forEach((n) => a.voice(midi(n), { dur: 2.6, gain: 0.035, wave: 'sawtooth', attack: 1.2, release: 0.5 }));
    [50, 57, 62, 66, 69].forEach((n) => a.voice(midi(n), { at: 2.4, dur: 2.5, gain: 0.04, wave: 0.25, attack: 0.1, release: 1.5 }));
  },
  // the lid pops off and the forbidden apple rises: a shimmering choir
  forbidden(a) {
    a.noiseHit({ dur: 0.12, gain: 0.2, freq: 700, q: 1.5 });
    [60, 67, 72, 75, 79, 84].forEach((n, i) => a.voice(midi(n), { at: 0.15 + i * 0.12, dur: 3.2, gain: 0.03, wave: 'sine', attack: 0.6, release: 1.5, vibrato: 0.012 }));
    for (let i = 0; i < 10; i++) a.voice(midi(96 + ((i * 5) % 12)), { at: 0.3 + i * 0.18, dur: 0.25, gain: 0.02, wave: 'sine', release: 0.2 });
  },
  gulp(a) {
    a.voice(320, { dur: 0.12, gain: 0.25, wave: 'sine', slide: 0.4 });
    a.voice(180, { at: 0.12, dur: 0.18, gain: 0.25, wave: 'sine', slide: 0.5 });
    a.noiseHit({ at: 0.05, dur: 0.1, gain: 0.08, freq: 600, q: 2 });
  },
  // the power-up: each step a rising, wobbling arpeggio up a semitone
  powerStep(a, i) {
    const base = 60 + i * 3;
    [0, 4, 7, 12].forEach((n, j) => a.voice(midi(base + n), { at: j * 0.035, dur: 0.12, gain: 0.09, wave: 0.25, release: 0.05 }));
    a.voice(midi(base - 12), { dur: 0.3, gain: 0.12, wave: 0.5, slide: 2, release: 0.2 });
  },
  // the colossal roar and the transformation's boom
  roar(a) {
    a.voice(95, { dur: 2.2, gain: 0.35, wave: 'sawtooth', slide: 0.55, attack: 0.05, release: 1.2, vibrato: 0.05 });
    a.voice(142, { dur: 2.0, gain: 0.2, wave: 'sawtooth', slide: 0.5, attack: 0.05, release: 1.1, vibrato: 0.07 });
    a.noiseHit({ dur: 2.2, gain: 0.35, freq: 700, q: 0.7, sweep: 0.4 });
    a.voice(50, { dur: 2.5, gain: 0.6, wave: 'sine', slide: 0.5, release: 2 });
    [62, 69, 74, 78, 81, 86].forEach((n, i) => a.voice(midi(n), { at: 0.1 + i * 0.04, dur: 1.8, gain: 0.035, wave: 0.25, release: 1.2 }));
  },
  // a meteor lands on the board
  land(a, pan = 0) {
    a.noiseHit({ dur: 0.5, gain: 0.25, freq: 900, type: 'lowpass', sweep: 0.2 });
    a.voice(110, { dur: 0.35, gain: 0.25, wave: 'sine', slide: 0.4, pan });
  },
  // a meteor whistling down (quiet, many at once)
  whistle(a, pan = 0) {
    a.voice(1400 + Math.random() * 500, { dur: 1.0, gain: 0.012, wave: 'sine', slide: 0.35, attack: 0.3, pan });
  },
  // the colossal snake crunches a meteor: a fiery crunch that climbs with the count
  crunch(a, n = 0, pan = 0) {
    a.noiseHit({ dur: 0.18, gain: 0.3, freq: 1800, q: 0.8, sweep: 0.4 });
    a.voice(140, { dur: 0.16, gain: 0.3, wave: 'sine', slide: 0.5, pan });
    const b = 70 + Math.min(n, 24) * 0.5;
    a.voice(midi(b), { at: 0.03, dur: 0.18, gain: 0.08, wave: 0.25, pan });
    a.voice(midi(b + 7), { at: 0.08, dur: 0.25, gain: 0.07, wave: 0.25, release: 0.2, pan });
  },
  // one shatters on the snake's scales
  clang(a, pan = 0) {
    a.voice(midi(84), { dur: 0.4, gain: 0.06, wave: 'triangle', release: 0.35, pan });
    a.voice(midi(91), { dur: 0.3, gain: 0.04, wave: 'sine', release: 0.25, pan });
    a.noiseHit({ dur: 0.25, gain: 0.15, freq: 4000, type: 'highpass' });
  },
  // the music stops dead
  scratch(a) {
    a.noiseHit({ dur: 0.35, gain: 0.25, freq: 2400, q: 2, sweep: 0.15 });
    a.voice(600, { dur: 0.3, gain: 0.06, wave: 'sawtooth', slide: 0.2 });
  },
  // the Apple Men laugh: three big, low, chesty HOHs
  laugh(a, pitch = 1) {
    for (let i = 0; i < 3; i++) {
      const at = i * 0.22;
      a.voice(120 * pitch * (1 - i * 0.06), { at, dur: 0.18, gain: 0.22, wave: 'sawtooth', slide: 0.85, release: 0.08 });
      a.noiseHit({ at, dur: 0.16, gain: 0.12, freq: 700 * pitch, q: 4 });
      a.noiseHit({ at, dur: 0.12, gain: 0.06, freq: 1300 * pitch, q: 5 });
    }
  },
  thud(a) {
    a.voice(80, { dur: 0.25, gain: 0.35, wave: 'sine', slide: 0.5 });
    a.noiseHit({ dur: 0.15, gain: 0.15, freq: 300, type: 'lowpass' });
  },
  // the storm is over
  saved(a) {
    a.voice(70, { dur: 3, gain: 0.5, wave: 'sine', slide: 0.4, release: 2.5 });
    a.noiseHit({ dur: 3, gain: 0.3, freq: 3000, type: 'lowpass', sweep: 0.1 });
    [65, 69, 72, 77, 81, 84, 89].forEach((n, i) => a.voice(midi(n), { at: 0.1 + i * 0.07, dur: 2.8, gain: 0.04, wave: 0.25, release: 2, vibrato: 0.008 }));
  },
};
