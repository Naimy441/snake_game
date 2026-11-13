// "Rattlesnake": a fast, dark chip track grown out of the first six seconds
// of Ouroboros (the Homecoming storm's opening). Not tied to any level.
//
// It's built on rhythm, not tune: a lead that flicks up a half step and back
// in a long-short-short cell (G#, G# A, G#: 2+1+1 sixteenths), a bass
// galloping 3+3+2, hits that stop dead on the 3+3+2 and leave holes, a
// snake's rattle (metallic chip noise in 32nds), and the tremble speeding up
// into 32nds to throw the band back in. It never leaves C# minor's shadow:
// no bright key changes, no singalong.
//   intro  - the opening, as Ouroboros plays it
//   hunt   - stop-time stabs on the 3+3+2 over the rattle, the flick
//            growling in the bass in the holes
//   coil   - one bar: the tremble in 32nds climbing an octave over a roll
//   strike - the opening's groove, the 16th-note engine joining halfway
//   rise   - the stabs multiplying (3, then 6, then 8, then every 16th), a
//            siren climbing, the coil, and a hole with only the flick in it
//   drop   - a chip wobble bass (a pulse whose width sweeps in time) barking
//            the 3+3+2, kicks that pump the chords, the flick screaming two
//            octaves up, in half time
//   lift   - one bar: V stabs every eighth, 32nd flicks, a siren, a hole
//   mega   - the last drop, no let-up: the opening's brass riff back over a
//            faster wobble, the flick screaming over it, kick on every
//            3+3+2, zaps; then harder (timpani on the gallop), a cut to three
//            stabs and the flick alone, and four bars of the serpent's run
//            at 16ths with the kick on every eighth
//   end    - three last stabs, the flick alone, a final hit
//
// C# minor, 160 BPM, about 1:15. Plays once.
// A custom track like the epilogue's: audio.startMusic({ custom: new Rattlesnake(audio) }).

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const TONIC = 61; // C#4: notes are semitones from it
const note = (o) => midi(TONIC + o);

// r: bass note (semitones from the tonic); n: the chord, voiced round it
const C = {
  i: { r: 0, n: [0, 3, 7] },
  bVI: { r: -4, n: [-4, 0, 3] },
  V: { r: -5, n: [-5, -1, 2] },
  V7: { r: -5, n: [-5, -1, 2, 5] },
};

// ---------------------------------------------------------------- lines
// bars of [note, length in 16ths]
const TREMBLE = [[7, 2], [7, 1], [8, 1], [7, 2], [7, 2], [7, 1], [8, 1], [7, 2], [10, 2], [8, 2]];
const SERPENT = [[12, 2], [10, 2], [8, 2], [7, 2], [3, 2], [5, 2], [7, 4]];
const SERPENT_UP = [[12, 2], [10, 2], [8, 2], [7, 2], [8, 2], [10, 2], [11, 4]];
const REST = [];


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

const TREMBLE_STEPS = expand([TREMBLE])[0];

// the drop's bass: [step, length, wobble speed (16ths per sweep), octave]
// barking the 3+3+2 one bar, answering it the next
const WOB = [
  [[0, 3, 1, 0], [3, 3, 2, 0], [6, 2, 0, 12], [8, 6, 3, 0], [14, 2, 0, 12]],
  [[0, 6, 1, 0], [6, 2, 0, 12], [8, 3, 2, 0], [11, 3, 1, 0], [14, 2, 0, 12]],
];
// the last drop's: busier, the octave popping more, the sweeps quicker
const MEGA_WOB = [
  [[0, 2, 1, 0], [2, 1, 0, 12], [3, 3, 1, 0], [6, 2, 0, 12], [8, 3, 1, 0], [11, 3, 2, 0], [14, 2, 0, 12]],
  [[0, 3, 1, 0], [3, 3, 1, 0], [6, 2, 0, 12], [8, 2, 1, 0], [10, 2, 0, 12], [12, 2, 1, 0], [14, 2, 0, 12]],
];
// the serpent's run at 16ths, eight steps
const RUN = [12, 10, 8, 7, 3, 5, 7, 8];

// ---------------------------------------------------------------- form
const SECTIONS = {
  intro: { chords: [C.i, C.i, C.i, [C.i, C.V7]], lead: expand([TREMBLE, SERPENT, TREMBLE, SERPENT_UP]) },
  // (hunt: the stabs land on the even bars, the flick growls in the odd ones)
  hunt: { chords: [C.i, C.i, C.i, C.i, C.i, C.i, C.i, C.V], lead: expand([REST, TREMBLE, REST, TREMBLE, REST, TREMBLE, REST, TREMBLE]) },
  coil: { chords: [C.V] },
  strike: { chords: [C.i, C.i, C.i, C.i, C.i, C.i, C.bVI, C.V], lead: expand([TREMBLE, SERPENT, TREMBLE, SERPENT, TREMBLE, SERPENT, TREMBLE, SERPENT_UP]) },
  rise: { chords: [C.i, C.i, C.i, C.V] },
  // the drops: C# minor all the way, sinking to A and G# to turn round
  drop: { chords: [C.i, C.i, C.i, C.i, C.bVI, C.V] },
  lift: { chords: [C.V] },
  mega: {
    chords: [C.i, C.i, C.i, C.i, C.i, C.i, C.bVI, C.V, C.i, C.i, C.i, C.i, C.i, C.i, C.bVI, C.V],
    lead: expand([TREMBLE, SERPENT, TREMBLE, SERPENT, TREMBLE, SERPENT, TREMBLE, SERPENT_UP, TREMBLE, SERPENT, TREMBLE, REST]),
  },
  end: { chords: [C.i, C.i] },
};
const FORM = ['intro', 'hunt', 'coil', 'strike', 'rise', 'drop', 'lift', 'mega', 'end'];
const STABS = [0, 3, 6]; // 3+3+2: the stabs, then the hole
const GALLOP = [0, 3, 6, 8, 11, 14];
// each section's level
const LEVEL = { intro: 1, hunt: 0.95, coil: 1, strike: 1.05, rise: 0.88, drop: 1.38, lift: 1.2, mega: 1.45, end: 1.3 };

const chordAt = (sec, bar, s) => {
  const cell = sec.chords[bar % sec.chords.length];
  return Array.isArray(cell) ? cell[s < 8 ? 0 : 1] : cell;
};

export class Rattlesnake {
  constructor(audio) {
    this.audio = audio;
    this.playing = false;
    this.built = false;
  }

  build() {
    if (this.built) return;
    const a = this.audio;
    const c = a.ctx;
    this.out = c.createGain();
    this.out.gain.value = 1.3;
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
    for (const k of ['lead', 'choir', 'arp', 'bass', 'drums']) this.bus[k] = c.createGain();
    // the choir and arpeggio pump: they duck on the drop's kicks (see pump)
    this.duck = c.createGain();
    this.duck.connect(this.out);
    const ah = c.createBiquadFilter();
    ah.type = 'peaking';
    ah.frequency.value = 1050;
    ah.Q.value = 1.1;
    ah.gain.value = 5;
    const soft = c.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 4200;
    this.bus.choir.connect(ah).connect(soft).connect(this.duck);
    soft.connect(a.musicSend);
    this.bus.arp.connect(this.duck);
    for (const k of ['lead', 'bass', 'drums']) this.bus[k].connect(this.out);
    this.built = true;
  }

  start(at) {
    if (!this.audio.ctx) return;
    this.build();
    this.playing = true;
    this.spb = 60 / 160 / 4;
    this.part = 0;
    this.bar = 0;
    this.step = 0;
    this.seen = {}; // times each section has played
    this.nextTime = at;
    this.t0 = at;
  }

  stop() {
    this.playing = false;
  }

  beat() {
    if (!this.playing || !this.audio.ctx) return 0;
    return (this.audio.ctx.currentTime - this.t0) / (this.spb * 4);
  }

  schedule(until) {
    while (this.playing && this.nextTime < until) {
      const name = FORM[this.part];
      const sec = SECTIONS[name];
      const bars = sec.chords.length;
      const pass = this.seen[name] || 0;
      if (this.step === 0 && this.bar === 0) this.out.gain.setTargetAtTime(1.3 * LEVEL[name], this.nextTime - 0.01, 0.015);
      this[sec.play || name](this.nextTime, this.step, this.bar, sec, pass);
      this.nextTime += this.spb;
      if (++this.step < 16) continue;
      this.step = 0;
      if (++this.bar < bars) continue;
      this.bar = 0;
      this.seen[name] = pass + 1;
      if (++this.part >= FORM.length) this.playing = false;
    }
  }

  // ---------------------------------------------------------------- voices
  lead(t, o, len, { gain = 0.1, oct = 0, duty = 0.25, pan = 0, bend = true } = {}) {
    const dur = len * this.spb;
    this.audio.pwm(note(o + oct), { t, dur: dur * 0.94, gain, duty, depth: 0.13, rate: 2.2, pan, dest: this.bus.lead, bend: bend && len >= 4 ? 1 : 0, vibrato: len >= 6 ? 0.012 : 0, release: Math.min(0.12, dur * 0.3) });
  }

  // the brass: a wide pulse with its octave below
  brass(t, n, gain = 1) {
    this.lead(t, n.o, n.len, { gain: 0.1 * gain, duty: 0.4 });
    this.lead(t, n.o, n.len, { gain: 0.045 * gain, oct: -12 });
  }

  choir(t, offs, dur, gain = 0.03, attack = 0.14) {
    const a = this.audio;
    for (const o of offs) {
      const f = note(o);
      a.pwm(f * 1.0035, { t, dur, gain, duty: 0.3, depth: 0.16, rate: 1.3, attack, release: Math.min(0.5, dur * 0.35), vibrato: 0.006, pan: -0.3, dest: this.bus.choir });
      a.pwm(f / 1.0035, { t, dur, gain, duty: 0.36, depth: 0.12, rate: 1.75, attack, release: Math.min(0.5, dur * 0.35), vibrato: 0.007, pan: 0.3, dest: this.bus.choir });
    }
  }

  arp(t, offs, dur, gain = 0.05, { oct = 12, pan = -0.4, wave = 0.25 } = {}) {
    this.audio.chipChord(offs.map((o) => note(o + oct)), { t, dur, gain, rate: 2 / this.spb, wave, pan, dest: this.bus.arp });
  }

  bass(t, o, len, gain = 0.24) {
    const a = this.audio;
    const dur = len * this.spb;
    a.voice(note(o - 12), { t, dur: dur * 0.9, gain: gain * 0.75, wave: 'triangle', dest: this.bus.bass, release: 0.03 });
    a.voice(note(o), { t, dur: Math.min(dur * 0.8, this.spb * 1.5), gain: gain * 0.1, wave: 0.5, dest: this.bus.bass, release: 0.03 });
  }

  // the engine: a short low pulse with the triangle under it
  chug(t, r, gain = 1) {
    const a = this.audio;
    a.voice(note(r - 12), { t, dur: this.spb * 0.7, gain: 0.07 * gain, wave: 0.125, dest: this.bus.bass, release: 0.03 });
    a.voice(note(r - 12), { t, dur: this.spb * 0.9, gain: 0.15 * gain, wave: 'triangle', dest: this.bus.bass, release: 0.03 });
  }

  // the wobble: a low pulse whose width sweeps once every `every` 16ths
  // (0: no sweep, a plain bark), over a triangle sub
  wob(t, o, len, every) {
    const a = this.audio;
    const dur = len * this.spb * 0.95;
    const f = note(o - 24);
    a.pwm(f, { t, dur, gain: 0.13, duty: every ? 0.26 : 0.4, depth: every ? 0.22 : 0, rate: every ? 1 / (every * this.spb) : 1, attack: 0.004, release: 0.04, dest: this.bus.bass });
    a.pwm(f * 2, { t, dur, gain: 0.07, duty: 0.2, depth: every ? 0.15 : 0, rate: every ? 2 / (every * this.spb) : 1, attack: 0.004, release: 0.04, pan: 0.2, dest: this.bus.bass });
    a.voice(f, { t, dur, gain: 0.11, wave: 'triangle', dest: this.bus.bass, release: 0.04 });
  }

  // sidechain: the choir and arpeggio duck on a kick and swell back
  pump(t) {
    const g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.15, t);
    g.linearRampToValueAtTime(1, t + this.spb * 3.2);
  }

  kick(t, gain = 1) {
    const a = this.audio;
    a.kick(t, this.bus.drums);
    a.voice(140, { t, dur: 0.09, gain: 0.22 * gain, wave: 'triangle', slide: 0.35, dest: this.bus.drums, release: 0.04 });
  }

  snare(t, gain = 0.14) {
    const a = this.audio;
    a.chipNoise({ t, dur: 0.15, gain, rate: 0.7, hp: 500, dest: this.bus.drums });
    a.voice(230, { t, dur: 0.07, gain: gain * 1.1, wave: 'triangle', slide: 0.55, dest: this.bus.drums, release: 0.03 });
  }

  hat(t, gain = 0.03, open = false) {
    this.audio.chipNoise({ t, dur: open ? 0.16 : 0.035, gain, short: true, rate: 1.4, hp: 6500, dest: this.bus.drums });
  }

  crash(t, gain = 0.12) {
    const a = this.audio;
    a.chipNoise({ t, dur: 1.5, gain, rate: 1, hp: 3500, dest: this.bus.drums });
    a.chipNoise({ t, dur: 0.6, gain: gain * 0.4, short: true, rate: 0.9, hp: 4000, dest: this.bus.drums });
  }

  timp(t, o, gain = 0.3, dur = 1.1) {
    this.audio.timpani(note(o - 24), { t, dur, gain, dest: this.bus.drums });
  }

  // the snake's rattle: metallic chip noise in 32nds
  rattle(t, gain) {
    const a = this.audio;
    for (let i = 0; i < 2; i++) a.chipNoise({ t: t + (i * this.spb) / 2, dur: 0.028, gain: gain * (i ? 0.55 : 1), short: true, rate: 2.2, hp: 4500, dest: this.bus.drums });
  }

  // a stop-time stab: the whole band on one chord, cut short
  stab(t, ch, big = 1) {
    this.choir(t, ch.n, this.spb * 1.6, 0.04 * big, 0.005);
    this.arp(t, ch.n, this.spb * 1.6, 0.06 * big, { oct: 12, pan: 0 });
    this.bass(t, ch.r, 2, 0.3 * big);
    this.timp(t, ch.r, 0.35 * big, 0.6);
    this.kick(t);
  }

  fill(t) {
    for (let i = 0; i < 6; i++) this.snare(t + (i * this.spb * 4) / 6, 0.07 + i * 0.016);
  }

  // ---------------------------------------------------------------- sections
  // the opening, as Ouroboros plays it
  intro(t, s, bar, sec) {
    const spb = this.spb;
    if (s === 0 && bar === 0) {
      this.crash(t, 0.13);
      this.timp(t, 0, 0.45, 1.6);
      this.choir(t, [-12, 0, 3, 7], spb * 32, 0.028, 0.02);
      this.bass(t, 0, 16, 0.3);
    }
    if (s === 0 && bar === 2) this.crash(t, 0.09);
    const n = sec.lead[bar][s];
    if (n) this.brass(t, n);
    const v = bar === 3 && s >= 8;
    if (s === 0 && bar % 2 === 1) this.arp(t, C.i.n, spb * 8);
    if (s === 8 && bar === 3) this.arp(t, C.V7.n, spb * 8);
    if (bar > 0) {
      if (s % 8 === 0 || s % 8 === 3) this.bass(t, v ? -5 : 0, 3);
      if (s % 8 === 6) this.bass(t, (v ? -5 : 0) + 12, 2, 0.2);
    }
    if (bar < 2) {
      if (s === 0 || s === 8) this.timp(t, s ? -5 : 0, 0.3);
      if (s === 0) this.kick(t);
    } else if (bar === 3 && s >= 12) {
      if (s === 12) this.fill(t);
    } else {
      if (s === 0 || s === 6 || s === 8) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.04 : 0.025, s === 14);
    }
  }

  // the hunt: stabs on the 3+3+2 then a hole, the rattle never stopping, the
  // flick growling in the bass between
  hunt(t, s, bar, sec) {
    const ch = chordAt(sec, bar, s);
    const bars = sec.chords.length;
    const lastBar = bar === bars - 1;
    const even = bar % 2 === 0;
    this.rattle(t, (GALLOP.includes(s) ? 0.045 : 0.022) * (1 + bar * 0.06));
    if ((even || lastBar) && STABS.includes(s)) this.stab(t, ch, lastBar ? 1.2 : 1);
    const n = sec.lead[bar][s];
    if (n && !lastBar) {
      this.bass(t, n.o - 7, n.len, 0.3);
      // the second half, the flick called out high and thin as well
      if (bar >= 4) this.lead(t, n.o, n.len, { gain: 0.045, oct: 12, duty: 0.125 });
    }
    if (!even && s === 8) this.snare(t, 0.12);
    if (lastBar && s === 12) this.snare(t, 0.1);
  }

  // the coil: the tremble in 32nds climbing an octave over a snare roll
  coil(t, s) {
    const spb = this.spb;
    for (let i = 0; i < 2; i++) {
      const k = s * 2 + i;
      const o = (k % 4 === 2 ? 8 : 7) + (s >= 8 ? 12 : 0);
      this.lead(t + (i * spb) / 2, o, 0.5, { gain: 0.05 + s * 0.004, duty: 0.25, bend: false });
    }
    if (s === 0) {
      this.choir(t, C.V.n, spb * 16, 0.02, 1.2);
      this.bass(t, -5, 16, 0.24);
    }
    this.snare(t, 0.04 + s * 0.008);
    if (s >= 8) this.snare(t + spb / 2, 0.04 + s * 0.008);
    this.rattle(t, 0.02 + s * 0.004);
  }

  // the strike: the opening's groove, all in C# minor; the 16th-note engine
  // and the rattle join halfway and the choir swells into the rise
  strike(t, s, bar, sec) {
    const ch = chordAt(sec, bar, s);
    if (s === 0 && bar % 4 === 0) {
      this.crash(t, 0.13);
      this.timp(t, ch.r, 0.4, 1.2);
    }
    const n = sec.lead[bar][s];
    if (n) this.brass(t, n);
    if (s === 0) this.arp(t, ch.n, this.spb * 16, 0.04);
    if (s === 0 && bar >= 4) this.choir(t, ch.n, this.spb * 16, 0.016 + (bar - 4) * 0.004, 0.2);
    if (s % 8 === 0 || s % 8 === 3) this.bass(t, ch.r, 3);
    if (s % 8 === 6) this.bass(t, ch.r + 12, 2, 0.2);
    if (bar >= 4) {
      this.chug(t, ch.r, GALLOP.includes(s) ? 0.7 : 0.35);
      this.rattle(t, s % 2 ? 0.012 : 0.022);
    }
    if (bar === 7 && s >= 12) {
      if (s === 12) this.fill(t);
      return;
    }
    if (s === 0 || s === 6 || s === 8) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.04 : 0.025, s === 14);
  }

  // the rise: the stabs multiply bar by bar (the 3+3+2, then twice, then
  // every eighth, then every 16th), a siren climbs two octaves, the rattle
  // swells, the coil's 32nds, then a hole: nothing but the flick
  rise(t, s, bar) {
    const spb = this.spb;
    const ch = bar === 3 ? C.V : C.i;
    if (bar === 3 && s >= 12) {
      // the hole, and the flick alone in it
      if (s === 13) this.lead(t, 7, 1, { gain: 0.1, duty: 0.4 });
      if (s === 14) this.lead(t, 8, 1, { gain: 0.1, duty: 0.4 });
      if (s === 15) this.lead(t, 7, 1, { gain: 0.1, duty: 0.4 });
      return;
    }
    const hit = bar === 0 ? STABS.includes(s) : bar === 1 ? GALLOP.includes(s) : bar === 2 ? s % 2 === 0 : bar === 3 && s < 8;
    if (hit) this.stab(t, ch, 0.7 + bar * 0.12 + s * 0.008);
    this.rattle(t, 0.02 + (bar * 16 + s) * 0.0006);
    if (s === 0 && bar === 1) {
      // the siren: a pulse sliding up two octaves over the last three bars
      this.audio.voice(note(-12), { t, dur: spb * 44, gain: 0.04, wave: 0.25, slide: 4, attack: 0.5, release: 0.02, dest: this.bus.lead });
    }
    if (bar >= 2) this.snare(t, 0.04 + (bar - 2) * 0.03 + s * 0.004);
    if (bar === 3) {
      this.snare(t + spb / 2, 0.06 + s * 0.006);
      for (let i = 0; i < 2; i++) this.lead(t + (i * spb) / 2, ((s * 2 + i) % 4 === 2 ? 8 : 7) + (s >= 4 ? 12 : 0), 0.5, { gain: 0.06 + s * 0.005, bend: false });
    }
  }

  // the drop: the wobble barking the 3+3+2, kicks that pump the chords, the
  // flick screaming two octaves up, in half time (snare on 3)
  drop(t, s, bar, sec) {
    const spb = this.spb;
    const ch = chordAt(sec, bar, s);
    if (s === 0 && bar % 4 === 0) {
      this.crash(t, 0.15);
      if (bar === 0) this.timp(t, 0, 0.5, 1.4);
    }
    for (const [st, len, every, oct] of WOB[bar % 2]) if (st === s) this.wob(t, ch.r + oct, len, every);
    if (s === 0) {
      this.choir(t, ch.n, spb * 14, 0.03, 0.01);
      this.arp(t, ch.n, spb * 16, 0.05, { oct: 24, pan: 0.4, wave: 0.125 });
    }
    // the flick two octaves up on even bars; on odd bars a burst of 32nd
    // flicks answers the bass, climbing
    if (bar % 2 === 0) {
      const n = TREMBLE_STEPS[s];
      if (n) {
        this.lead(t, n.o, n.len, { gain: 0.06, oct: 12, duty: 0.125 });
        this.lead(t, n.o, n.len, { gain: 0.045, oct: 24, duty: 0.25 });
      }
    } else if (s >= 12) this.burst(t, s, 0.045);
    if (s === 0 || s === 10 || (s === 3 && bar % 2 === 0)) {
      this.kick(t);
      this.pump(t);
    }
    if (s === 8) this.snare(t, 0.2);
    if (s % 2 === 0) this.rattle(t, s % 4 === 2 ? 0.03 : 0.018);
  }

  // a burst of 32nd flicks two octaves up, climbing a semitone a step
  burst(t, s, gain, from = 12) {
    for (let i = 0; i < 2; i++) this.lead(t + (i * this.spb) / 2, ((s * 2 + i) % 2 ? 8 : 7) + 24 + (s - from), 0.5, { gain, duty: 0.25, bend: false });
  }

  // the lift, one bar into the last drop: the V stabs every eighth, the
  // flicks in 32nds climbing over a snare going 16ths to 32nds, a siren,
  // then a hole with only the flick in it
  lift(t, s) {
    const spb = this.spb;
    if (s === 0) this.audio.voice(note(-12), { t, dur: spb * 12, gain: 0.05, wave: 0.25, slide: 4, attack: 0.2, release: 0.02, dest: this.bus.lead });
    if (s >= 12) {
      if (s === 12) this.lead(t, 7, 1, { gain: 0.11, duty: 0.4 });
      if (s === 13) this.lead(t, 8, 1, { gain: 0.11, duty: 0.4 });
      if (s === 14) this.lead(t, 7, 2, { gain: 0.11, duty: 0.4 });
      return;
    }
    if (s % 2 === 0) this.stab(t, C.V, 0.9 + s * 0.03);
    this.snare(t, 0.07 + s * 0.012);
    if (s >= 6) this.snare(t + spb / 2, 0.07 + s * 0.012);
    for (let i = 0; i < 2; i++) this.lead(t + (i * spb) / 2, ((s * 2 + i) % 4 === 2 ? 8 : 7) + (s >= 6 ? 12 : 0), 0.5, { gain: 0.06 + s * 0.005, bend: false });
    this.rattle(t, 0.03 + s * 0.004);
  }

  // the last drop, going for broke. The opening's brass riff comes back
  // over the wobble with the flick screaming on top of it, the kick on
  // every 3+3+2 pumping the chords, timpani, zaps. Halfway it goes harder
  // (the riff an octave up as well, timpani on every gallop), cuts to three
  // stabs and the flick alone, then slams into four bars of the serpent's
  // run at 16ths, the kick on every eighth, before the end.
  mega(t, s, bar, sec) {
    const spb = this.spb;
    const ch = chordAt(sec, bar, s);
    const hard = bar >= 8;
    const run = bar >= 12;
    const b = bar % 8;
    if (s === 0 && bar === 8) this.out.gain.setTargetAtTime(1.3 * LEVEL.mega * 1.08, t, 0.02);
    // the cut: bar 11's second half is three stabs and the flick, alone
    if (bar === 11 && s >= 8) {
      if (s === 8 || s === 11) this.stab(t, C.i, 1.3);
      if (s === 13) this.lead(t, 7, 1, { gain: 0.11, duty: 0.4 });
      if (s === 14) this.lead(t, 8, 1, { gain: 0.11, duty: 0.4 });
      if (s === 15) this.lead(t, 7, 1, { gain: 0.11, duty: 0.4 });
      return;
    }
    if (s === 0 && (b % 2 === 0 || bar === 12)) {
      this.crash(t, bar === 0 || bar === 12 ? 0.17 : 0.13);
      if (bar === 0 || bar === 12) {
        this.timp(t, 0, 0.55, 1.6);
        this.choir(t, [-12, 0, 3, 7], spb * 8, 0.04, 0.005);
      }
    }
    // the bass: the wobble, faster than the first drop's
    for (const [st, len, every, oct] of MEGA_WOB[bar % 2]) if (st === s) this.wob(t, ch.r + oct, len, every);
    // the chords pump twice a bar, the arpeggio in 32nds up top
    if (s === 0 || s === 8) {
      this.choir(t, ch.n, spb * 7, 0.032, 0.005);
      this.arp(t, ch.n, spb * 8, 0.055, { oct: 24, pan: s ? -0.4 : 0.4, wave: 0.125 });
    }
    // the riff (or, the last four bars, the run) on brass, and the scream
    if (run) {
      const o = RUN[s % 8];
      this.lead(t, o, 1, { gain: 0.1, duty: 0.4, bend: false });
      this.lead(t, o, 1, { gain: 0.05, oct: 12, duty: 0.125, bend: false });
      this.lead(t, o, 1, { gain: 0.04, oct: -12, bend: false });
      if (s % 4 === 3 && bar === 15) this.burst(t, s, 0.04);
    } else {
      const n = sec.lead[bar][s];
      if (n) {
        this.brass(t, n, 1.15);
        if (hard) this.lead(t, n.o, n.len, { gain: 0.04, oct: 12, duty: 0.125 });
      }
      // the scream: the flick two octaves up over the riff's run bars, a
      // climbing burst under its tremble bars
      if (bar % 2 === 1) {
        const f = TREMBLE_STEPS[s];
        if (f) this.lead(t, f.o, f.len, { gain: hard ? 0.05 : 0.04, oct: 24, duty: 0.25 });
      } else if (s >= 12) this.burst(t, s, 0.035);
    }
    // the zaps: a pulse diving off the offbeat
    if (s === 7 || s === 15) this.audio.voice(note(31), { t, dur: 0.12, gain: 0.035, wave: 0.125, slide: 0.18, dest: this.bus.arp });
    // the drums
    if (bar === 15 && s >= 12) {
      if (s === 12) this.fill(t);
      return;
    }
    const kick = run ? s % 2 === 0 : GALLOP.includes(s);
    if (kick) {
      this.kick(t, s % 4 ? 0.8 : 1);
      if (s % 4 === 0 || !run) this.pump(t);
    }
    if (s === 4 || s === 12) this.snare(t, 0.18);
    if (hard && s === 15) this.snare(t, 0.08);
    this.rattle(t, s % 2 ? 0.018 : 0.032);
    if (s % 4 === 2) this.hat(t, 0.035, true);
    if (hard && GALLOP.includes(s)) this.timp(t, s === 8 ? -5 : 0, 0.18, 0.4);
  }

  // the end: three last stabs, the flick alone in the hole, a final hit
  end(t, s, bar) {
    if (bar === 0) {
      if (s === 0) this.crash(t, 0.14);
      if (STABS.includes(s)) this.stab(t, C.i, 1.25);
      if (s === 10) this.lead(t, 7, 1, { gain: 0.09, duty: 0.4 });
      if (s === 11) this.lead(t, 8, 1, { gain: 0.09, duty: 0.4 });
      if (s === 12) this.lead(t, 7, 2, { gain: 0.09, duty: 0.4 });
      if (s >= 8) this.rattle(t, 0.02 + (s - 8) * 0.006);
      return;
    }
    if (s !== 0) return;
    this.crash(t, 0.15);
    this.timp(t, 0, 0.5, 2.4);
    this.kick(t);
    this.choir(t, [-12, 0, 7], 2.4, 0.035, 0.005);
    this.wob(t, 0, 16, 4);
    this.lead(t, 0, 12, { gain: 0.08, duty: 0.4, bend: false });
  }
}

// ---------------------------------------------------------------- 8-bit kit
// The same song on a plain console kit, after the sound of an 8-bit remix the
// song's opening came from (its instruments, not its tunes): a 50% square
// lead with a wide, slow vibrato that waits a beat before it starts, an echo
// channel repeating it, thinner 25% and 12.5% pulses under it, a square and
// triangle bass, a long hissy noise snare and a short triangle kick, chords
// as fast single-channel arpeggios instead of a choir, the wobble done by
// switching the pulse's duty step by step, and all of it mono and dry.
export class Rattlesnake8bit extends Rattlesnake {
  build() {
    if (this.built) return;
    const a = this.audio;
    const c = a.ctx;
    this.out = c.createGain();
    this.out.gain.value = 1.3;
    const low = c.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 90;
    low.gain.value = -2;
    this.out.connect(low).connect(a.music);
    this.bus = {};
    for (const k of ['lead', 'choir', 'arp', 'bass', 'drums']) this.bus[k] = c.createGain();
    this.duck = c.createGain();
    this.duck.connect(this.out);
    this.bus.choir.connect(this.duck);
    this.bus.arp.connect(this.duck);
    for (const k of ['lead', 'bass', 'drums']) this.bus[k].connect(this.out);
    this.built = true;
  }

  // the square lead: a fixed duty (no sweep), the late wide vibrato, and an
  // echo a dotted eighth behind on a thinner pulse
  lead(t, o, len, { gain = 0.1, oct = 0, duty = 0.25 } = {}) {
    const a = this.audio;
    const dur = len * this.spb;
    const wave = duty >= 0.35 ? 0.5 : duty >= 0.2 ? 0.25 : 0.125;
    const f = note(o + oct);
    const vib = { vibrato: len >= 4 ? 0.028 : 0, vibRate: 4, vibDelay: 0.2 };
    a.voice(f, { t, dur: dur * 0.92, gain: gain * 1.5, wave, release: Math.min(0.05, dur * 0.25), dest: this.bus.lead, ...vib });
    if (oct === 0 && len >= 3 && gain >= 0.06) a.voice(f, { t: t + this.spb * 3, dur: Math.min(dur, this.spb * 4) * 0.9, gain: gain * 0.45, wave: 0.25, release: 0.04, dest: this.bus.lead, ...vib });
  }

  // no choir on a console: a held note is a pulse, a chord an arpeggio
  choir(t, offs, dur, gain = 0.03) {
    const a = this.audio;
    if (offs.length === 1) {
      a.voice(note(offs[0]), { t, dur, gain: gain * 1.8, wave: 0.25, release: 0.08, vibrato: dur > 0.5 ? 0.02 : 0, vibRate: 4, vibDelay: 0.2, dest: this.bus.choir });
      return;
    }
    a.chipChord(offs.map(note), { t, dur, gain: gain * 2.2, rate: 20, wave: 0.25, release: 0.05, dest: this.bus.choir });
  }

  arp(t, offs, dur, gain = 0.05, { oct = 12, wave = 0.25 } = {}) {
    this.audio.chipChord(offs.map((o) => note(o + oct)), { t, dur, gain: gain * 1.4, rate: 2 / this.spb, wave, dest: this.bus.arp });
  }

  bass(t, o, len, gain = 0.24) {
    const a = this.audio;
    const dur = len * this.spb;
    a.voice(note(o - 12), { t, dur: dur * 0.9, gain: gain * 0.55, wave: 'triangle', dest: this.bus.bass, release: 0.03 });
    a.voice(note(o - 12), { t, dur: dur * 0.85, gain: gain * 0.16, wave: 0.5, dest: this.bus.bass, release: 0.03 });
  }

  // the wobble, console style: the pulse's duty switched every few 32nds
  // (thin, thinner, square, thinner...), over the triangle
  wob(t, o, len, every) {
    const a = this.audio;
    const dur = len * this.spb * 0.95;
    const f = note(o - 24);
    a.voice(f, { t, dur, gain: 0.12, wave: 'triangle', dest: this.bus.bass, release: 0.04 });
    if (!every) {
      a.voice(f * 2, { t, dur, gain: 0.1, wave: 0.5, dest: this.bus.bass, release: 0.04 });
      return;
    }
    const duties = [0.125, 0.25, 0.5, 0.25];
    const seg = (every * this.spb) / 4;
    for (let k = 0; k * seg < dur - 0.005; k++) {
      a.voice(f * 2, { t: t + k * seg, dur: Math.min(seg, dur - k * seg) + 0.003, gain: 0.1, wave: duties[k % 4], attack: 0.002, release: 0.002, dest: this.bus.bass });
    }
  }

  // a triangle kick: a quick drop, with a click of noise
  kick(t, gain = 1) {
    const a = this.audio;
    a.voice(180, { t, dur: 0.11, gain: 0.4 * gain, wave: 'triangle', slide: 0.25, attack: 0.001, release: 0.05, dest: this.bus.drums });
    a.chipNoise({ t, dur: 0.025, gain: 0.12 * gain, rate: 0.5, lp: 2500, dest: this.bus.drums });
  }

  // the long, hissy noise snare
  snare(t, gain = 0.14) {
    const a = this.audio;
    a.chipNoise({ t, dur: 0.34, gain: gain * 0.85, rate: 1, hp: 300, dest: this.bus.drums });
    a.voice(210, { t, dur: 0.08, gain: gain * 0.9, wave: 'triangle', slide: 0.5, dest: this.bus.drums, release: 0.03 });
  }
}
