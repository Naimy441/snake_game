// The epilogue's music and sound effects, all original and synthesised like
// the rest of the game's audio.
//
// The music is one anthem, "Ouroboros", told across the whole epilogue: a
// single theme that comes back as a lullaby at home, a throbbing pedal while
// the sky burns, the full chip anthem for the meteor storm, a fanfare when the
// world is saved and a lament when the family is taken. It's written for the
// sound chip, on the engine's chip voices: pulse leads whose width sweeps as
// they sing, a "choir" of detuned pulses, chords flicked through on a single
// channel, triangle bass and timpani, and shift-register noise drums.
//
// It's in C# minor (with the dorian A#), the reference's key, and the
// cutscene's pitched sound effects (the resolve swell, the roar) follow it.
// Moods, for setMode():
//   home    - the theme in the major (C#), a music-box lullaby
//   doom    - a pedal-point build: a low tonic drone, the fifth hammered out
//             in eighths (trembling up a half step as it builds), timpani
//             and choir piling on bar by bar
//   battle  - the anthem in full: a four-bar opening (a hit, then the motif:
//             the fifth trembling, the snake's run), then a verse, the
//             chorus (the choir singing the theme), a half-time climax over a
//             bass falling a semitone a bar, a timpani break, and round again,
//             doubled up an octave from the second time through
//   victory - the chorus in the major, the whole band
//   lament  - the theme in the minor, slow, the music box alone with the choir
//   off     - silence
//
// AudioEngine plays it as a custom track (startMusic({ custom })), so pause,
// slow motion and the music volume all apply.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// C#4 (C# minor, the reference's key): every note below is in semitones
// above (or below) it. It was first written a step up in D (62); the
// cutscene's pitched sfx follow TONIC, so either key works.
const TONIC = 61;
const note = (o) => midi(TONIC + o);

// ---------------------------------------------------------------- the theme
// Melodies are bars of [note, length in 16ths]; a null note is a rest.
// The chorus: a snake's line, a leap up a fourth, then winding up and round.
const CHORUS = [
  [[7, 4], [12, 4], [14, 2], [15, 6]],
  [[14, 2], [12, 2], [15, 4], [20, 8]],
  [[19, 4], [17, 2], [15, 2], [17, 4], [19, 4]],
  [[17, 12], [10, 2], [12, 2]],
  [[7, 4], [12, 4], [14, 2], [15, 6]],
  [[17, 2], [15, 2], [17, 4], [21, 8]],
  [[20, 4], [19, 2], [17, 2], [22, 4], [24, 4]],
  [[24, 10], [22, 2], [19, 2], [17, 2]],
];
// the same tune in the major (its 3rd, 6th and 7th raised): home, and the victory
const sharpen = (o) => ([3, 8, 10].includes(((o % 12) + 12) % 12) ? o + 1 : o);
const CHORUS_MAJOR = CHORUS.map((bar) => bar.map(([o, len]) => [o == null ? o : sharpen(o), len]));

// the verse: low and coiled, over the pedal
const VERSE = [
  [[0, 3], [3, 3], [7, 2], [5, 2], [3, 2], [5, 4]],
  [[7, 3], [10, 3], [12, 6], [null, 4]],
  [[5, 3], [9, 3], [12, 2], [10, 2], [9, 2], [7, 4]],
  [[7, 8], [3, 4], [5, 4]],
  [[8, 3], [12, 3], [15, 2], [14, 2], [12, 2], [10, 4]],
  [[10, 3], [14, 3], [17, 6], [15, 2], [14, 2]],
  [[12, 4], [15, 4], [19, 8]],
  [[19, 4], [17, 2], [14, 2], [11, 4], [7, 4]],
];

// the climax: long notes soaring over the falling bass
const CLIMAX = [
  [[19, 8], [24, 8]],
  [[19, 12], [17, 2], [15, 2]],
  [[15, 8], [17, 4], [19, 4]],
  [[21, 12], [19, 2], [17, 2]],
  [[20, 8], [19, 4], [15, 4]],
  [[24, 8], [23, 8]],
  [[20, 8], [19, 4], [17, 4]],
  [[19, 8], [23, 4], [26, 4]],
];

// the opening motif, after the feel of the reference's first bars (not its
// notes): the fifth trembling up a half step and back over the pedal, then
// the snake's run, falling from the octave and winding back up to it
const TREMBLE = [[7, 2], [7, 1], [8, 1], [7, 2], [7, 2], [7, 1], [8, 1], [7, 2], [10, 2], [8, 2]];
const SERPENT = [[12, 2], [10, 2], [8, 2], [7, 2], [3, 2], [5, 2], [7, 4]];
// (the last run climbs to the leading note, into the verse)
const SERPENT_UP = [[12, 2], [10, 2], [8, 2], [7, 2], [8, 2], [10, 2], [11, 4]];

// ---------------------------------------------------------------- harmony
// r: the bass note (semitones from the tonic, played two octaves down);
// n: the chord, voiced round the tonic
const C = {
  i: { r: 0, n: [0, 3, 7] },
  iCs: { r: -1, n: [0, 3, 7] }, // over C#
  i7C: { r: -2, n: [-2, 3, 7] }, // over C
  IVped: { r: 0, n: [-3, 0, 5] }, // IV over the tonic pedal
  IV: { r: 5, n: [-3, 0, 5] },
  IVB: { r: -3, n: [-3, 0, 5] }, // over B
  iv7: { r: -7, n: [-4, 0, 3, 5] },
  bIII: { r: 3, n: [3, 7, 10] },
  bVI: { r: -4, n: [-4, 0, 3] },
  bVI7: { r: -4, n: [-4, 0, 3, 7] },
  bVII: { r: -2, n: [-2, 2, 5] },
  Vsus: { r: -5, n: [-5, 0, 2] },
  V: { r: -5, n: [-5, -1, 2] },
  V7: { r: -5, n: [-5, -1, 2, 5] },
  I: { r: 0, n: [0, 4, 7] },
  vi: { r: -3, n: [-3, 2, 6] },
};
// a bar holds a chord, or two (one per half bar)
const CHORUS_CHORDS = [C.i, C.bVI, C.bIII, C.bVII, C.i, C.IV, [C.bVI, C.bVII], C.i];
const VERSE_CHORDS = [C.i, C.i, C.IVped, C.i, C.bVI, C.bVII, C.i, C.V7];
// the bass falls a semitone a bar (in C#: C# B# B A# A G#), then F# and
// home on the dominant
const CLIMAX_CHORDS = [C.i, C.iCs, C.i7C, C.IVB, C.bVI7, [C.Vsus, C.V], C.iv7, C.V7];
const HOME_CHORDS = [C.I, C.vi, C.IV, C.V, C.I, C.IV, [C.vi, C.V], C.I];

// expand [note, len] bars into per-step note starts
function expand(bars) {
  return bars.map((bar) => {
    const out = new Array(16).fill(null);
    let s = 0;
    for (const [o, len] of bar) {
      if (o != null) out[s] = { o, len };
      s += len;
    }
    return out;
  });
}
const STEPS = {
  chorus: expand(CHORUS),
  major: expand(CHORUS_MAJOR),
  verse: expand(VERSE),
  climax: expand(CLIMAX),
  motif: expand([TREMBLE, SERPENT, TREMBLE, SERPENT_UP]),
};
const chordAt = (table, bar, s) => {
  const cell = table[bar % table.length];
  return Array.isArray(cell) ? cell[s < 8 ? 0 : 1] : cell;
};

// ---------------------------------------------------------------- form
// Each mood is a list of parts [name, bars]; after the last part it goes
// round again from part `loop`.
// level: each mood's loudness, set against the map songs (the storm sits a
// touch above them, the lullaby and the lament a little under)
const MODES = {
  home: { tempo: 76, level: 1.8, parts: [['home', 8]], loop: 0 },
  doom: { tempo: 148, level: 1.6, parts: [['doom', Infinity]], loop: 0 },
  battle: { tempo: 148, level: 1.3, parts: [['intro', 4], ['verse', 8], ['chorus', 8], ['climax', 8], ['brk', 4]], loop: 1 },
  victory: { tempo: 148, level: 1.3, parts: [['victory', 8]], loop: 0 },
  lament: { tempo: 66, level: 1.8, parts: [['lament', 8]], loop: 0 },
  off: { tempo: 60, level: 1, parts: [['off', Infinity]], loop: 0 },
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
    // a little EQ for small speakers: less rumble, more bite
    const low = c.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 90;
    low.gain.value = -2;
    const bite = c.createBiquadFilter();
    bite.type = 'highshelf';
    bite.frequency.value = 2500;
    bite.gain.value = 2.5;
    this.out.connect(low).connect(bite).connect(a.music);
    this.bus = {};
    for (const k of ['lead', 'choir', 'arp', 'bass', 'drums', 'box']) {
      const g = c.createGain();
      this.bus[k] = g;
    }
    // the choir sings through an "ah" formant
    const ah = c.createBiquadFilter();
    ah.type = 'peaking';
    ah.frequency.value = 1050;
    ah.Q.value = 1.1;
    ah.gain.value = 5;
    const soft = c.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 4200;
    this.bus.choir.connect(ah).connect(soft).connect(this.out);
    for (const k of ['lead', 'arp', 'bass', 'drums', 'box']) this.bus[k].connect(this.out);
    // the lead, the choir and the music box ring in the room
    // (the lead stays dry, with its own echo, so it cuts through)
    soft.connect(a.musicSend);
    this.bus.box.connect(a.musicSend);
    this.built = true;
  }

  start(at) {
    if (!this.audio.ctx) return;
    this.build();
    this.playing = true;
    this.out.gain.cancelScheduledValues(at);
    this.out.gain.setValueAtTime(MODES[this.mode].level, at);
    this.begin(this.mode, at);
  }

  stop() {
    this.playing = false;
  }

  begin(mode, at) {
    this.mode = mode;
    this.form = MODES[mode];
    if (this.out) {
      this.out.gain.cancelScheduledValues(at);
      this.out.gain.setTargetAtTime(this.form.level, at, 0.02);
    }
    this.spb = 60 / this.form.tempo / 4;
    this.step = 0;
    this.bar = 0; // bars since the mood began
    this.part = 0;
    this.partBar = 0;
    this.pass = 0; // times round the loop
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
      if (++this.step < 16) continue;
      this.step = 0;
      this.bar++;
      if (++this.partBar < this.form.parts[this.part][1]) continue;
      this.partBar = 0;
      if (++this.part >= this.form.parts.length) {
        this.part = this.form.loop;
        this.pass++;
      }
    }
  }

  // where we are, in beats (for anything that pulses in time)
  beat() {
    if (!this.playing || !this.audio.ctx) return 0;
    return (this.audio.ctx.currentTime - this.t0) / (this.spb * 4);
  }

  playStep(t) {
    const name = this.form.parts[this.part][0];
    if (name !== 'off') this[name](t, this.step, this.partBar);
  }

  // ---------------------------------------------------------------- voices
  // the lead: a pulse whose width sweeps, scooping up into long notes, and
  // an echo a dotted eighth later on a thinner pulse, off to one side
  lead(t, o, len, { gain = 0.1, echo = true, oct = 0, duty = 0.25 } = {}) {
    const a = this.audio;
    const dur = len * this.spb;
    const f = note(o + oct);
    a.pwm(f, { t, dur: dur * 0.94, gain, duty, depth: 0.13, rate: 2.2, dest: this.bus.lead, bend: len >= 4 ? 1 : 0, vibrato: len >= 6 ? 0.012 : 0, release: Math.min(0.12, dur * 0.3) });
    if (echo && len >= 3) {
      a.voice(f, { t: t + this.spb * 3, dur: Math.min(dur, this.spb * 4) * 0.9, gain: gain * 0.28, wave: 0.125, dest: this.bus.lead, pan: this.echoSide = -(this.echoSide || 0.45), release: 0.05 });
    }
  }

  // the choir: each note sung by two pulses a hair apart in pitch, their
  // widths drifting at different speeds, swelling in
  choir(t, offs, dur, gain = 0.03, { attack = 0.14 } = {}) {
    const a = this.audio;
    for (const o of offs) {
      const f = note(o);
      a.pwm(f * 1.0035, { t, dur, gain, duty: 0.3, depth: 0.16, rate: 1.3, attack, release: Math.min(0.5, dur * 0.35), vibrato: 0.006, pan: -0.3, dest: this.bus.choir });
      a.pwm(f / 1.0035, { t, dur, gain, duty: 0.36, depth: 0.12, rate: 1.75, attack, release: Math.min(0.5, dur * 0.35), vibrato: 0.007, pan: 0.3, dest: this.bus.choir });
    }
  }

  // a chord flicked through on one channel, the classic chip arpeggio
  arp(t, offs, dur, gain = 0.06, { oct = 12, pan = 0.35, wave = 0.25 } = {}) {
    const fs = offs.map((o) => note(o + oct));
    this.audio.chipChord(fs, { t, dur, gain, rate: 2 / this.spb, wave, pan, dest: this.bus.arp });
  }

  bass(t, o, len, gain = 0.24) {
    const a = this.audio;
    const dur = len * this.spb;
    // the triangle an octave above the deep register, where small speakers
    // can still play it (the kick and timpani bring the sub)
    a.voice(note(o - 12), { t, dur: dur * 0.9, gain: gain * 0.75, wave: 'triangle', dest: this.bus.bass, release: 0.03 });
    // a thin pulse an octave up so the line reads on small speakers
    a.voice(note(o), { t, dur: Math.min(dur * 0.8, this.spb * 1.5), gain: gain * 0.1, wave: 0.5, dest: this.bus.bass, release: 0.03 });
  }

  // the hammered fifth over the pedal (o: another note, for its tremble)
  pedal(t, gain, o = 7) {
    this.audio.voice(note(o), { t, dur: this.spb * 0.9, gain, wave: 0.125, dest: this.bus.arp, release: 0.03 });
  }

  kick(t, gain = 1) {
    const a = this.audio;
    a.kick(t, this.bus.drums);
    a.voice(140, { t, dur: 0.09, gain: 0.22 * gain, wave: 'triangle', slide: 0.35, dest: this.bus.drums, release: 0.04 });
  }

  snare(t, gain = 0.13) {
    const a = this.audio;
    a.chipNoise({ t, dur: 0.15, gain, rate: 0.7, hp: 500, dest: this.bus.drums });
    a.voice(230, { t, dur: 0.07, gain: gain * 1.1, wave: 'triangle', slide: 0.55, dest: this.bus.drums, release: 0.03 });
  }

  hat(t, gain = 0.03, open = false) {
    this.audio.chipNoise({ t, dur: open ? 0.16 : 0.035, gain, short: true, rate: 1.4, hp: 6500, dest: this.bus.drums });
  }

  crash(t, gain = 0.1) {
    const a = this.audio;
    a.chipNoise({ t, dur: 1.5, gain, rate: 1, hp: 3500, dest: this.bus.drums });
    a.chipNoise({ t, dur: 0.6, gain: gain * 0.4, short: true, rate: 0.9, hp: 4000, dest: this.bus.drums });
  }

  timp(t, o, gain = 0.3, dur = 1.1) {
    this.audio.timpani(note(o - 24), { t, dur, gain, dest: this.bus.drums });
  }

  // a snare triplet run across the bar's last beat, building into the downbeat
  fill(t) {
    for (let i = 0; i < 6; i++) this.snare(t + (i * this.spb * 4) / 6, 0.07 + i * 0.016);
  }

  // ---------------------------------------------------------------- parts
  // battle: the opening hit, the fanfare's two calls over the pedal
  intro(t, s, bar) {
    const spb = this.spb;
    if (s === 0 && bar === 0) {
      this.crash(t, 0.13);
      this.timp(t, 0, 0.45, 1.6);
      this.choir(t, [-12, 0, 3, 7], spb * 32, 0.028, { attack: 0.02 });
      this.bass(t, 0, 16, 0.3);
    }
    if (s === 0 && bar === 2) this.crash(t, 0.09);
    // the motif on brass: a wide pulse doubled an octave down
    const n = STEPS.motif[bar][s];
    if (n) {
      this.lead(t, n.o, n.len, { gain: 0.1, duty: 0.4, echo: false });
      this.lead(t, n.o, n.len, { gain: 0.045, oct: -12, echo: false });
    }
    // the last half bar turns to the dominant, into the verse
    const v = bar === 3 && s >= 8;
    if (s === 0 && bar % 2 === 1) this.arp(t, v ? C.V7.n : C.i.n, spb * 8, 0.05, { pan: -0.4 });
    if (s === 8 && bar === 3) this.arp(t, C.V7.n, spb * 8, 0.05, { pan: -0.4 });
    if (bar > 0) this.gallop(t, s, v ? -5 : 0);
    if (bar < 2) {
      if (s === 0 || s === 8) this.timp(t, s ? -5 : 0, 0.3);
      if (s === 0) this.kick(t);
    } else {
      this.groove(t, s, bar === 3);
    }
  }

  // the bass's gallop: root, root, octave, in a driving 3+3+2
  gallop(t, s, r, gain = 0.24) {
    if (s % 8 === 0 || s % 8 === 3) this.bass(t, r, 3, gain);
    if (s % 8 === 6) this.bass(t, r + 12, 2, gain * 0.85);
  }

  // the verse's beat: kick on the 3+3+2 with the bass, snare on 2 and 4
  groove(t, s, fill) {
    if (fill && s >= 12) {
      if (s === 12) this.fill(t);
      return;
    }
    if (s === 0 || s === 6 || s === 8) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.04 : 0.025, s === 14);
  }

  verse(t, s, bar) {
    const ch = chordAt(VERSE_CHORDS, bar, s);
    if (s === 0 && bar === 0) this.crash(t, 0.11);
    const n = STEPS.verse[bar][s];
    if (n) {
      this.lead(t, n.o, n.len, { gain: 0.1 });
      // second time round, a thin pulse doubles it an octave up
      if (this.pass > 0) this.lead(t, n.o, n.len, { gain: 0.025, oct: 12, echo: false, duty: 0.125 });
    }
    if (s % 2 === 0) this.pedal(t, s % 4 === 0 ? 0.032 : 0.022);
    if (s === 0) this.arp(t, ch.n, this.spb * 16, 0.055, { pan: -0.4 });
    this.gallop(t, s, ch.r);
    this.groove(t, s, bar === 7);
  }

  chorus(t, s, bar) {
    const spb = this.spb;
    const ch = chordAt(CHORUS_CHORDS, bar, s);
    if (s === 0 && bar % 4 === 0) this.crash(t, 0.12);
    const n = STEPS.chorus[bar][s];
    if (n) {
      this.lead(t, n.o, n.len, { gain: 0.1 });
      // the choir sings the long notes an octave down
      if (n.len >= 4) this.choir(t, [n.o - 12], n.len * spb * 0.96, 0.04, { attack: 0.05 });
      if (this.pass > 0) this.lead(t, n.o, n.len, { gain: 0.025, oct: 12, echo: false, duty: 0.125 });
    }
    // chords: the choir underneath, and a fast arpeggio up high
    if (s === 0 || (s === 8 && Array.isArray(CHORUS_CHORDS[bar]))) {
      const len = Array.isArray(CHORUS_CHORDS[bar]) ? 8 : 16;
      this.choir(t, ch.n, len * spb, 0.022);
      this.arp(t, ch.n, len * spb, 0.07, { oct: 24, pan: 0.4, wave: 0.125 });
    }
    // bass: driving eighths, the octave on every last sixteenth of a beat
    if (s % 2 === 0) this.bass(t, ch.r, 2, 0.24);
    if (s % 4 === 3) this.bass(t, ch.r + 12, 1, 0.18);
    // drums: a kick on every beat, the snare's backbeat, sixteenth hats
    if (bar === 7 && s >= 12) {
      if (s === 12) this.fill(t);
      return;
    }
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t, 0.15);
    if (s === 15) this.snare(t, 0.05);
    this.hat(t, s % 2 ? 0.018 : 0.035, s % 8 === 6);
  }

  // half time: the choir in full, the lead soaring, the bass falling
  climax(t, s, bar) {
    const spb = this.spb;
    const cell = CLIMAX_CHORDS[bar];
    const split = Array.isArray(cell);
    const ch = chordAt(CLIMAX_CHORDS, bar, s);
    if (s === 0 && bar % 4 === 0) this.crash(t, 0.13);
    const n = STEPS.climax[bar][s];
    if (n) {
      this.lead(t, n.o, n.len, { gain: 0.1, duty: 0.3 });
      this.lead(t, n.o, n.len, { gain: 0.03, oct: -12, echo: false, duty: 0.5 });
      if (this.pass > 0) this.lead(t, n.o, n.len, { gain: 0.022, oct: 12, echo: false, duty: 0.125 });
    }
    if (s === 0 || (s === 8 && split)) {
      const len = split ? 8 : 16;
      this.choir(t, ch.n, len * spb, 0.034);
      this.choir(t, [ch.n[0] + 12], len * spb, 0.022);
      this.arp(t, ch.n, len * spb, 0.055, { oct: 12, pan: -0.35 });
      this.bass(t, ch.r, len, 0.28);
    }
    if (s === 10) this.bass(t, ch.r + 12, 2, 0.16);
    if (s === 14) this.bass(t, ch.r, 2, 0.2);
    // drums in half time, timpani on the downbeats, a roll into the last bar
    if (s === 0) this.timp(t, ch.r, 0.3);
    if (s === 0 || s === 10) this.kick(t);
    if (s === 8) this.snare(t, 0.17);
    if (s % 2 === 0) this.hat(t, s % 4 === 0 ? 0.025 : 0.018);
    if (bar === 7 && s >= 4) this.timp(t, -5, 0.08 + (s - 4) * 0.018, 0.3);
  }

  // the break: the pedal alone, the theme's head called out softly, then a
  // timpani roll and snare run back into the verse
  brk(t, s, bar) {
    const spb = this.spb;
    if (s === 0 && bar === 0) {
      this.choir(t, [-12, -5, 0], spb * 48, 0.026, { attack: 0.6 });
      this.bass(t, 0, 32, 0.22);
    }
    if (s % 2 === 0) this.pedal(t, (s % 4 === 0 ? 0.04 : 0.028) * (1 + bar * 0.15));
    if (bar === 1 || bar === 2) {
      // the opening motif, called out softly up high
      const n = STEPS.motif[bar - 1][s];
      if (n) this.lead(t, n.o, n.len, { gain: 0.05, oct: 12, duty: 0.125 });
      if (s % 4 === 0) this.hat(t, 0.02);
    }
    if (bar < 3) {
      if (s === 0) this.timp(t, 0, 0.32);
      if (s === 8) this.timp(t, -5, 0.22);
      return;
    }
    // the last bar: a roll that swells, then the triplet run
    if (s === 0) this.bass(t, -5, 16, 0.24);
    if (s < 12) this.timp(t, -5, 0.07 + s * 0.022, 0.25);
    if (s >= 8 && s < 12) this.snare(t, 0.05 + (s - 8) * 0.025);
    if (s === 12) this.fill(t);
  }

  // the sky burns: the pedal builds bar by bar until the snake decides
  doom(t, s, bar) {
    const spb = this.spb;
    if (s === 0 && bar % 2 === 0) {
      this.audio.voice(note(-24), { t, dur: spb * 33, gain: 0.13, wave: 'triangle', dest: this.bus.bass, attack: 0.5, release: 0.8 });
      this.audio.pwm(note(-12), { t, dur: spb * 33, gain: 0.035, duty: 0.25, depth: 0.2, rate: 0.35, attack: 1, release: 1, dest: this.bus.choir });
    }
    if (bar >= 2 && s % 2 === 0) {
      const g = Math.min(0.034, 0.008 + (bar - 2) * 0.0025);
      // (from bar 8 it starts to tremble up the half step, like the motif)
      this.pedal(t, s % 4 === 0 ? g * 1.3 : g, bar >= 8 && s % 8 === 6 ? 8 : 7);
    }
    if (bar >= 4 && s === 0) this.timp(t, 0, Math.min(0.4, 0.15 + (bar - 4) * 0.025), 1.4);
    if (bar >= 8 && s === 8) this.timp(t, -5, Math.min(0.3, 0.12 + (bar - 8) * 0.02), 1.2);
    // the choir: the pedal's chords, swelling in two bars at a time
    if (bar >= 6 && s === 0 && bar % 2 === 0) {
      const ch = [C.i, C.bVI, C.IVped, C.i][(bar / 2) % 4];
      this.choir(t, ch.n, spb * 32, Math.min(0.034, 0.012 + (bar - 6) * 0.0025), { attack: 1.2 });
    }
    if (bar >= 10 && s % 2 === 0) this.hat(t, Math.min(0.03, 0.01 + (bar - 10) * 0.003));
    if (bar >= 12 && s === 12) this.snare(t, 0.06);
    if (bar >= 12 && bar % 4 === 3 && s >= 8) this.timp(t, 0, 0.06 + (s - 8) * 0.03, 0.25);
  }

  // home: the theme as a lullaby on a little music box
  home(t, s, bar) {
    const a = this.audio;
    const spb = this.spb;
    const ch = chordAt(HOME_CHORDS, bar, s);
    const n = STEPS.major[bar][s];
    if (n) this.box(t, n.o + 12, n.len);
    // broken chords on a soft pulse, an eighth apart
    if (s % 2 === 0) {
      const k = ch.n[(s / 2) % ch.n.length] + (s % 8 === 6 ? 12 : 0);
      a.voice(note(k), { t, dur: spb * 1.8, gain: 0.018, wave: 0.25, dest: this.bus.arp, release: 0.12 });
    }
    if (s === 0 || (s === 8 && Array.isArray(HOME_CHORDS[bar]))) this.bass(t, ch.r, Array.isArray(HOME_CHORDS[bar]) ? 8 : 12, 0.14);
    if (s === 8 && !Array.isArray(HOME_CHORDS[bar])) this.bass(t, ch.r + 7, 6, 0.08);
  }

  // a music-box note: a triangle that rings out with a glassy pulse on top
  box(t, o, len) {
    const a = this.audio;
    a.voice(note(o), { t, dur: Math.max(0.9, len * this.spb * 1.2), gain: 0.085, wave: 'triangle', dest: this.bus.box, attack: 0.002, release: 0.8 });
    a.voice(note(o + 12), { t, dur: 0.3, gain: 0.014, wave: 0.125, dest: this.bus.box, attack: 0.002, release: 0.26 });
  }

  // the world is saved: the chorus in the major, everyone in
  victory(t, s, bar) {
    const spb = this.spb;
    const ch = chordAt(HOME_CHORDS, bar, s);
    if (s === 0 && bar % 4 === 0) {
      this.crash(t, 0.14);
      this.timp(t, ch.r, 0.4, 1.4);
    }
    const n = STEPS.major[bar][s];
    if (n) {
      this.lead(t, n.o, n.len, { gain: 0.1, duty: 0.4 });
      this.lead(t, n.o, n.len, { gain: 0.025, oct: 12, echo: false, duty: 0.125 });
      if (n.len >= 4) this.choir(t, [n.o - 12], n.len * spb * 0.96, 0.04, { attack: 0.03 });
    }
    if (s === 0 || (s === 8 && Array.isArray(HOME_CHORDS[bar]))) {
      const len = Array.isArray(HOME_CHORDS[bar]) ? 8 : 16;
      this.choir(t, ch.n, len * spb, 0.026, { attack: 0.02 });
      this.arp(t, ch.n, len * spb, 0.07, { oct: 24, wave: 0.125 });
    }
    if (s % 2 === 0) this.bass(t, ch.r, 2, 0.24);
    if (s % 4 === 3) this.bass(t, ch.r + 12, 1, 0.18);
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t, 0.15);
    this.hat(t, s % 2 ? 0.018 : 0.035, s % 8 === 6);
  }

  // they took his family: the theme in the minor, slow and alone
  lament(t, s, bar) {
    const spb = this.spb;
    const ch = chordAt(CHORUS_CHORDS, bar, s);
    const n = STEPS.chorus[bar][s];
    if (n) this.box(t, n.o + 12, n.len);
    if (s === 0 || (s === 8 && Array.isArray(CHORUS_CHORDS[bar]))) {
      const len = Array.isArray(CHORUS_CHORDS[bar]) ? 8 : 16;
      this.choir(t, ch.n, len * spb, 0.018, { attack: 0.8 });
      this.bass(t, ch.r, len, 0.12);
    }
  }
}

// ---------------------------------------------------------------- sfx
// the pitched sfx that sound with the music were written in D: inKey moves
// them into the anthem's key
const inKey = (n) => midi(n + TONIC - 62);

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
    [50, 57, 62, 65].forEach((n) => a.voice(inKey(n), { dur: 2.6, gain: 0.035, wave: 'sawtooth', attack: 1.2, release: 0.5 }));
    [50, 57, 62, 66, 69].forEach((n) => a.voice(inKey(n), { at: 2.4, dur: 2.5, gain: 0.04, wave: 0.25, attack: 0.1, release: 1.5 }));
  },
  // the lid pops off and the forbidden apple rises: a shimmering choir
  forbidden(a) {
    a.noiseHit({ dur: 0.12, gain: 0.2, freq: 700, q: 1.5 });
    [60, 67, 72, 75, 79, 84].forEach((n, i) => a.voice(midi(n + TONIC - 60), { at: 0.15 + i * 0.12, dur: 3.2, gain: 0.03, wave: 'sine', attack: 0.6, release: 1.5, vibrato: 0.012 }));
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
    [62, 69, 74, 78, 81, 86].forEach((n, i) => a.voice(inKey(n), { at: 0.1 + i * 0.04, dur: 1.8, gain: 0.035, wave: 0.25, release: 1.2 }));
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
    // (in the anthem's major key, like the victory fanfare)
    [62, 66, 69, 74, 78, 81, 86].forEach((n, i) => a.voice(inKey(n), { at: 0.1 + i * 0.07, dur: 2.8, gain: 0.04, wave: 0.25, release: 2, vibrato: 0.008 }));
  },
};
