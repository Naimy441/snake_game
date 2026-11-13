// "Charmer": an 8-bit swag track. Not tied to any level.
//
// 99 BPM, D# minor with a dorian lift (the IV chord is G# with no third, F
// and F# rubbing inside it), every off-16th swung late. It's built the way
// the 8-bit swag beats are: a chip lead over a hip-hop mix, not a chip song.
//   - the whole mix runs through a filter that's played like an instrument:
//     the intro is muffled like a radio in the next room and opens on the
//     drop; the break sinks back under it, the outro fades into it
//   - the lead is a saw and a square through a drive: gritty, loud, on
//     top. It scoops into notes, flicks off grace notes, chops one note
//     with ghosts between, and dives an octave off its ends
//   - under it a warm tremolo e-piano panning side to side, a big saturated
//     808 that glides, a 3-osc bass, swung shakers and a jumbled chip-perc
//     groove, a flammed clap, and a glue compressor squashing it together
//   - the drums hit like a Neptunes beat: a four-layer clap that lands in
//     pairs (two and the eighth after it, four and the eighth after it),
//     tongue clicks (a snake's tongue), a rattle, a hiss for an open hat
//   - a bell answers the lead in its gaps (call and response); later a
//     snake charmer does, a nasal reed with grace flicks and a shake, in
//     D# phrygian dominant (the E a half step above the root)
//   intro  - the e-piano and the flick, muffled; a muffled stutter, a dead
//            hole with a click and a rattle in it, and the drop slams open
//   hook   - the flick: a pickup springing up, grace flicks off the top, B
//            rubbing A#; the bell answering
//   verse  - the chop: one note chopped on the 3+3+2, ghosts, dives; the bass
//            gone sparse
//   charm  - the snake charmer: D# major and E over a drone, the charmer's
//            line, then the saw lead doubling it an octave down
//   flow   - the lead in triplets, a rap flow; then call and response, the
//            lead low and the charmer high
//   break  - no kick: the filter swallows the band, the bell plays the old
//            hook over the e-piano and the 808; it claws its way back open
//   final  - the old hook, then the flick with the charmer answering
//   outro  - the chop while the filter closes on it, a tape stop, a last hit
//
// D# minor, 99 BPM, about 2:06. Plays once.
// A custom track like the epilogue's: audio.startMusic({ custom: new Charmer(audio) }).

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const TONIC = 63; // D#4: notes are semitones from it
const note = (o) => midi(TONIC + o);

// r: bass root; n: the chip chord round D#4-F5; ep: the e-piano voicing,
// rootless, lower; pl: the offbeat pluck; ar: the sparkle arpeggio
const C = {
  i: { r: 0, n: [0, 3, 7, 14], ep: [-9, -5, -2, 2], pl: 7, ar: [12, 15, 19, 26] }, // D#m9
  IV: { r: 5, n: [2, 3, 7, 10], ep: [-7, -2, 2, 3], pl: 8, ar: [14, 15, 19, 22] }, // G#13sus
  bVI: { r: -4, n: [-1, 0, 3, 7], ep: [-4, 0, 3, 7], pl: 7, ar: [11, 15, 19, 22] }, // Bmaj7
  v: { r: -5, n: [-2, 2, 5, 7], ep: [-5, -2, 2, 5], pl: 5, ar: [10, 14, 17, 19] }, // A#m7
  // the charmer's two: D# major and E, a half step apart
  I: { r: 0, n: [0, 4, 7, 12], ep: [-8, -5, 0, 4], pl: 7, ar: [12, 16, 19, 24] },
  II: { r: 1, n: [1, 5, 8, 13], ep: [-7, -4, 1, 5], pl: 8, ar: [13, 17, 20, 25] },
};
const PROG = [C.i, C.i, C.IV, [C.bVI, C.v]];
const CHARM = [C.I, C.II, C.I, [C.II, C.I]];

// ---------------------------------------------------------------- lines
// [step (may be fractional), note, length in 16ths, options, gain].
// Options: f2 scoop up from 2 below, g2 a grace note 2 below struck first,
// d dive an octave off the end, v vibrato, x a ghost, b played on the bell
const trip = (start, notes, len = 1.2) => notes.map((o, i) => [start + (i * 4) / 3, o, len]);

// the flick: a pickup springing up a fourth and a sixth, grace flicks off
// the top, the B rubbing the A#, long notes landing on the one; the bell
// answering in the gaps
const FLICK = [
  [[4, -2, 1], [5, 3, 1], [7, 10, 2, 'g2'], [10, 8, 1], [11, 7, 1], [12, 8, 1.5, 'g1'], [14, 3, 2]],
  [[0, 12, 3, 'f2'], [3, 10, 1], [4, 7, 6, 'v'], [10, 19, 1, 'b'], [11, 17, 1, 'b'], [12, 15, 1, 'b'], [13, -2, 1], [14, 3, 1], [15, 5, 1]],
  [[0, 8, 2, 'g1'], [2, 10, 1], [3, 8, 1], [5, 5, 1], [6, 8, 1.5, 'g2'], [8, 14, 2, 'f2'], [10, 12, 1], [11, 10, 1], [12, 8, 2], [14, 10, 1], [15, 12, 1]],
  [[0, 5, 3], [3, 3, 1], [4, 0, 6, 'd'], [10, 12, 1, 'b'], [11, 15, 1, 'b'], [12, 19, 2, 'b'], [14, 17, 2, 'b']],
];
const FLICK_B = [
  FLICK[0],
  FLICK[1],
  [[4, -2, 1], [5, 3, 1], [7, 12, 2, 'g2'], [10, 14, 1], [11, 12, 1], [12, 10, 1], [13, 8, 1], [14, 7, 2, 'g2']],
  [[0, 8, 2], [2, 7, 2], [4, 5, 8, 'v'], [12, 3, 1], [13, 0, 3, 'd'], [12, 19, 1, 'b'], [13, 22, 1, 'b'], [14, 24, 2, 'b']],
];
// the chop: one note on the 3+3+2 with ghosts between, dives at the ends
const CHOP = [
  [[0, 12, 1], [1, 12, 0, 'x'], [3, 12, 1], [4, 12, 0, 'x'], [6, 12, 2], [8, 12, 1], [9, 12, 0, 'x'], [11, 12, 1], [12, 12, 0, 'x'], [14, 10, 2, 'd']],
  [[0, 7, 1], [1, 7, 0, 'x'], [3, 7, 1], [4, 7, 0, 'x'], [6, 7, 2], [8, 8, 1], [10, 7, 1], [12, 5, 4, 'd']],
  [[0, 10, 1], [1, 10, 0, 'x'], [3, 10, 1], [4, 10, 0, 'x'], [6, 10, 2], [8, 10, 1], [9, 10, 0, 'x'], [11, 12, 1], [12, 14, 0, 'x'], [13, 15, 3, 'f2']],
  [[0, 14, 2], [2, 12, 2], [4, 10, 1], [5, 10, 0, 'x'], [6, 12, 2, 'd'], [11, 7, 1], [12, 10, 1], [13, 12, 3, 'd']],
];
const CHOP_B = [CHOP[0], CHOP[1], CHOP[2], [[0, 12, 1], [1, 12, 0, 'x'], [2, 12, 1], [3, 12, 0, 'x'], [4, 12, 1], [6, 15, 2, 'f3'], [8, 12, 8, 'dv']]];
// the flow: triplet eighths across the beat, then straight 16ths
const TRIP = [
  [...trip(0, [7, 7, 5, 3, 5, 3]), [10, 0, 1], [12, 3, 2], [14, 5, 2]],
  [...trip(0, [7, 10, 7, 5, 7, 5]), ...trip(8, [3, 3, 0]), [12, 0, 4, 'd']],
  [...trip(0, [10, 10, 8, 7, 8, 7]), ...trip(8, [5, 7, 8]), [12, 10, 4, 'f2']],
  [...trip(0, [12, 10, 7, 10, 7, 5]), [8, 3, 2], [10, 0, 6, 'd']],
];
// call and response: the lead says it low, the bell says it back high
const CALL = [
  [[0, 0, 1], [1, 3, 1], [2, 5, 2, 'f2'], [4, 3, 1], [5, 0, 2], [8, 12, 1, 'b'], [9, 15, 1, 'b'], [10, 17, 2, 'b'], [12, 15, 1, 'b'], [13, 12, 2, 'b']],
  [[0, 7, 2, 'g2'], [2, 5, 1], [3, 3, 1], [4, 5, 3], [8, 19, 2, 'b'], [10, 17, 1, 'b'], [11, 15, 1, 'b'], [12, 17, 3, 'b']],
  [[0, 5, 1], [1, 8, 1], [2, 10, 2, 'f2'], [4, 8, 1], [5, 7, 2], [8, 17, 1, 'b'], [9, 20, 1, 'b'], [10, 22, 2, 'b'], [12, 20, 1, 'b'], [13, 19, 2, 'b']],
  [[0, 12, 2, 'g2'], [2, 10, 2], [4, 7, 2], [6, 5, 2], [8, 3, 6, 'dv']],
];
// the charmer: D# phrygian dominant (D# E G G# A# B C#), grace flicks,
// shakes, dives
const CHARMER = [
  [[0, 24, 2, 'g1'], [2, 25, 1], [3, 24, 1], [4, 20, 2], [6, 19, 1], [7, 20, 1], [8, 19, 4, 'v'], [12, 16, 1], [13, 17, 1], [14, 19, 2]],
  [[0, 20, 1], [1, 19, 1], [2, 17, 1], [3, 16, 1], [4, 17, 6, 'v'], [10, 16, 0, 'x'], [11, 13, 1], [12, 12, 4, 'd']],
  [[0, 16, 2, 'g1'], [2, 17, 1], [3, 19, 1], [4, 20, 3, 'f1'], [7, 19, 1], [8, 17, 2], [10, 16, 2], [12, 17, 2], [14, 13, 2]],
  [[0, 12, 6, 'v'], [8, 25, 1], [9, 24, 1], [10, 20, 1], [11, 19, 1], [12, 16, 1], [13, 13, 1], [14, 12, 2, 'd']],
];
// the old hook (the track's first version's)
const HOOK = [
  [[2, 3, 1], [3, 5, 2, 'f2'], [6, 7, 1], [7, 10, 2, 'f2'], [10, 7, 1], [11, 5, 1], [12, 7, 4, 'f2v']],
  [[0, 3, 3], [4, 0, 2], [6, 3, 0, 'x'], [8, 5, 6, 'd']],
  [[2, 10, 1], [3, 12, 3, 'f2'], [6, 10, 1], [7, 7, 2], [10, 8, 2], [12, 7, 1], [13, 5, 3]],
  [[0, 3, 2], [2, 5, 1], [3, 3, 1], [4, 0, 4, 'v'], [10, -2, 1], [11, 0, 5, 'd']],
];
const bellOnly = (lines) => lines.map((bar) => bar.filter((n) => !(n[3] || '').includes('x')).map(([s, o, l]) => [s, o + 12, l, 'b']));

// the bass: [step, note, length, ghost]: sliding down B, A#, A into the IV,
// and sparse
const BASS = [
  [[0, 0, 6], [7, 0, 1, 1], [8, 12, 2], [11, 0, 2], [14, -2, 2]],
  [[0, 0, 3], [3, 0, 1, 1], [4, 12, 1], [6, 0, 4], [10, 8, 2], [12, 7, 2], [14, 6, 2]],
  [[0, 5, 3], [3, 5, 1, 1], [4, 17, 1], [6, 5, 3], [10, 3, 2], [12, 0, 2], [14, -2, 2]],
  [[0, -4, 6], [6, 8, 2], [8, -5, 6], [14, 7, 2]],
];
const BASS_SPARSE = [
  [[0, 0, 2], [3, 12, 1], [10, 0, 2]],
  [[0, 0, 2], [6, 0, 1], [10, 3, 2]],
  [[0, 5, 2], [3, 17, 1], [10, 5, 2]],
  [[0, -4, 2], [6, 8, 1], [8, -5, 2], [14, 7, 1]],
];
const KICKS = [
  [0, 6, 10],
  [0, 3, 10, 14],
];
// the jumbled perc: [step, pitch] blips, a different jumble each bar
const JUMBLE = [
  [[2, 1400], [5, 900], [7, 1400], [11, 700], [14, 1100]],
  [[1, 900], [4, 1500], [8, 700], [10, 1400], [13, 900], [15, 1700]],
];

// each section: bars and level
const FORM = [
  ['intro', 4, 0.72],
  ['hook', 8, 1.06],
  ['verse', 8, 1],
  ['charm', 8, 1.04],
  ['flow', 8, 1.02],
  ['brk', 4, 0.95],
  ['final', 8, 1.08],
  ['outro', 4, 1.02],
];

export class Charmer {
  constructor(audio) {
    this.audio = audio;
    this.playing = false;
    this.built = false;
  }

  build() {
    if (this.built) return;
    const a = this.audio;
    const c = a.ctx;
    const shaper = (drive) => {
      const ws = c.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
      }
      ws.curve = curve;
      return ws;
    };
    // the master: glue compressor, a soft clip, the filter
    this.out = c.createGain();
    this.out.gain.value = 1;
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.knee.value = 6;
    glue.ratio.value = 4;
    glue.attack.value = 0.004;
    glue.release.value = 0.12;
    this.makeup = c.createGain();
    this.makeup.gain.value = 1.15;
    this.lp = c.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 18000;
    this.lp.Q.value = 0.8;
    this.out.connect(glue).connect(this.makeup).connect(shaper(1.4)).connect(this.lp).connect(a.music);

    // (the mix: the lead and the 808 on top, the mids kept clear)
    const MIX = { lead: 1.7, keys: 1.8, ep: 1.5, bass: 1.4, sub: 0.38, drums: 1.7, perc: 2.2, bell: 2.8, charm: 2.2 };
    this.bus = {};
    for (const [k, v] of Object.entries(MIX)) {
      this.bus[k] = c.createGain();
      this.bus[k].gain.value = v;
    }
    // the lead: driven, into the echo too
    const leadDrive = shaper(2);
    this.bus.lead.connect(leadDrive).connect(this.out);
    const send = c.createGain();
    send.gain.value = 0.35;
    leadDrive.connect(send).connect(a.delay);
    // the charmer: dry and up front, a little echo
    this.bus.charm.connect(this.out);
    this.bus.charm.connect(send);
    // the chip keys: thin, high-passed out of the e-piano's way, ducking
    const keysHp = c.createBiquadFilter();
    keysHp.type = 'highpass';
    keysHp.frequency.value = 450;
    this.duck = c.createGain();
    this.bus.keys.connect(keysHp).connect(this.duck).connect(this.out);
    // the e-piano: a tremolo that pans it left and right, eighth triplets
    const trem = c.createOscillator();
    trem.frequency.value = (99 / 60) * 3;
    const depth = c.createGain();
    depth.gain.value = 0.45;
    const inv = c.createGain();
    inv.gain.value = -1;
    const epL = c.createGain();
    const epR = c.createGain();
    epL.gain.value = 0.55;
    epR.gain.value = 0.55;
    trem.connect(depth);
    depth.connect(epL.gain);
    depth.connect(inv).connect(epR.gain);
    trem.start();
    this.trem = trem;
    const panL = c.createStereoPanner();
    panL.pan.value = -0.55;
    const panR = c.createStereoPanner();
    panR.pan.value = 0.55;
    const epLp = c.createBiquadFilter();
    epLp.type = 'lowpass';
    epLp.frequency.value = 3200;
    this.epDuck = c.createGain();
    this.bus.ep.connect(epLp).connect(this.epDuck);
    this.epDuck.connect(epL).connect(panL).connect(this.out);
    this.epDuck.connect(epR).connect(panR).connect(this.out);
    this.epDuck.connect(a.musicSend);
    // the 808, saturated so small speakers hear it
    this.bus.sub.connect(shaper(2.5)).connect(this.out);
    this.bus.bell.connect(a.musicSend);
    for (const k of ['bass', 'drums', 'perc', 'bell']) this.bus[k].connect(this.out);
    this.built = true;
  }

  start(at) {
    if (!this.audio.ctx) return;
    this.build();
    this.playing = true;
    this.spb = 60 / 99 / 4;
    this.swing = this.spb * 0.24;
    this.part = 0;
    this.bar = 0;
    this.step = 0;
    this.nextTime = at;
    this.t0 = at;
    this.open(at);
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
      const [name, bars, level] = FORM[this.part];
      if (this.step === 0 && this.bar === 0) this.out.gain.setTargetAtTime(level, this.nextTime - 0.01, 0.015);
      // every off-16th lands late: the swing
      const t = this.nextTime + (this.step % 2 ? this.swing : 0);
      this.prog = name === 'charm' ? CHARM : PROG;
      this[name](t, this.step, this.bar, bars);
      this.nextTime += this.spb;
      if (++this.step < 16) continue;
      this.step = 0;
      if (++this.bar < bars) continue;
      this.bar = 0;
      if (++this.part >= FORM.length) this.playing = false;
    }
  }

  // the chord at bar/step in the current section's progression
  chordAt(bar, s) {
    const cell = this.prog[bar % 4];
    return Array.isArray(cell) ? cell[s < 8 ? 0 : 1] : cell;
  }

  // the master filter: wide open from t
  open(t) {
    const f = this.lp.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(18000, t);
  }

  // a filter sweep from one cutoff to another (holding `from` until t)
  sweep(t, from, to, end) {
    const f = this.lp.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(from, t);
    f.exponentialRampToValueAtTime(to, end);
  }

  // ---------------------------------------------------------------- voices
  // one lead note: scoop in from below, dive an octave off its end, shake,
  // or be a ghost (a blip between the real notes)
  tone(t, o, len, opt = '', { gain = 0.09, oct = 0, wave = 0.5, det = 1, pan = 0, vib = 0, gate = 0.9, dest = this.bus.lead } = {}) {
    const a = this.audio;
    const c = a.ctx;
    const ghost = opt.includes('x');
    const dur = ghost ? 0.05 : Math.max(0.07, len * this.spb * gate);
    const g0 = ghost ? gain * 0.5 : gain;
    const f = note(o + oct) * det;
    const osc = c.createOscillator();
    if (wave === 'saw') osc.type = 'sawtooth';
    else osc.setPeriodicWave(a.waves[wave]);
    const fm = opt.match(/f(\d)/);
    const scoop = Math.min(0.05, dur * 0.4);
    if (fm) {
      osc.frequency.setValueAtTime(f * Math.pow(2, -fm[1] / 12), t);
      osc.frequency.exponentialRampToValueAtTime(f, t + scoop);
    } else osc.frequency.setValueAtTime(f, t);
    if (opt.includes('d')) {
      const d0 = Math.max(t + dur * 0.45, t + scoop + 0.01);
      osc.frequency.setValueAtTime(f, d0);
      osc.frequency.exponentialRampToValueAtTime(f / 2, t + dur);
    }
    const nodes = [osc];
    if ((opt.includes('v') && dur > 0.35) || vib) {
      // vib: a shake from the start (the charmer); v: one that comes in late
      const lfo = c.createOscillator();
      lfo.frequency.value = vib ? 6.4 : 5.5;
      const lg = c.createGain();
      const depth = f * (opt.includes('v') ? 0.03 : vib);
      lg.gain.setValueAtTime(vib ? f * vib : 0, t);
      lg.gain.setValueAtTime(vib ? f * vib : 0, t + 0.16);
      lg.gain.linearRampToValueAtTime(depth, t + Math.min(dur, 0.4));
      lfo.connect(lg).connect(osc.frequency);
      nodes.push(lfo);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(g0, t + 0.003);
    g.gain.setValueAtTime(g0, t + Math.max(0.005, dur - 0.03));
    g.gain.linearRampToValueAtTime(0, t + dur);
    let node = osc.connect(g);
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(dest);
    for (const n of nodes) {
      n.start(t);
      n.stop(t + dur + 0.03);
    }
  }

  // the lead: a saw and a square a hair apart, its octave on a thin pulse
  lead(t, o, len, opt, gain = 1, layer = 0) {
    this.tone(t, o, len, opt, { gain: 0.06 * gain, wave: 'saw', pan: -0.1 });
    this.tone(t, o, len, opt, { gain: 0.05 * gain, wave: 0.5, det: 1.005, pan: 0.1 });
    if (layer) this.tone(t, o, len, opt, { gain: 0.035 * gain * layer, oct: 12, wave: 0.125, pan: 0.25 });
  }

  // play bar `bar` of a line at step s; grace notes struck just before
  // their note, bell notes on the bell
  play(lines, bar, s, { gain = 1, layer = 0, bell = true, answer = 'bell', voice = null } = {}) {
    const base = this.nextTime; // the straight 16th
    for (const [st, o, len, opt = '', g = 1] of lines[bar % lines.length]) {
      if (Math.floor(st) !== s) continue;
      const t = base + (st - s) * this.spb + (Number.isInteger(st) && st % 2 ? this.swing : 0);
      if (opt.includes('b')) {
        if (bell && answer === 'charm') this.charmer(t, o, len + 0.5, '', 0.9);
        else if (bell) this.bell(t, o, 1, Math.max(0.35, len * this.spb * 2));
        continue;
      }
      const play = voice || ((tt, oo, ll, op) => this.lead(tt, oo, ll, op, gain * g, layer));
      const gr = opt.match(/g(\d)/);
      if (gr) {
        play(t, o - Number(gr[1]), 0.4, '');
        play(t + 0.045, o, len - 0.35, opt.replace(/g\d/, ''));
      } else play(t, o, len, opt);
    }
  }

  // the e-piano: a sine with a bark and a tine on top, decaying, held
  ep(t, offs, dur, gain = 1) {
    const c = this.audio.ctx;
    offs.forEach((o, i) => {
      const tt = t + i * 0.012;
      const f = note(o);
      for (const [mul, type, g0, decay] of [[1, 'sine', 0.05, 2.4], [1, 'triangle', 0.014, 0.6], [2, 'sine', 0.012, 0.4], [7, 'sine', 0.006, 0.08]]) {
        const osc = c.createOscillator();
        osc.type = type;
        osc.frequency.value = f * mul;
        const g = c.createGain();
        const peak = g0 * gain;
        const end = Math.max(0.03, dur - 0.1);
        g.gain.setValueAtTime(0, tt);
        g.gain.linearRampToValueAtTime(peak, tt + 0.006);
        g.gain.setTargetAtTime(0, tt + 0.01, decay);
        g.gain.setValueAtTime(peak * Math.exp(-(end - 0.01) / decay), tt + end);
        g.gain.linearRampToValueAtTime(0, tt + dur);
        osc.connect(g).connect(this.bus.ep);
        osc.start(tt);
        osc.stop(tt + dur + 0.02);
      }
    });
  }

  // the e-piano's part: the chord on one, held; bar four split
  keys(t, s, bar, gain = 1) {
    const b = bar % 4;
    if (b === 3) {
      if (s === 0 || s === 8) this.ep(t, this.chordAt(bar, s).ep, this.spb * 8, gain);
    } else if (s === 0) this.ep(t, this.chordAt(bar, s).ep, this.spb * 16, gain);
  }

  // the chip chords: on one, a stab on the "a" of three, late on the next
  // bar's two, strummed
  chord(t, ch, len, { gain = 0.03, strum = 0 } = {}) {
    const a = this.audio;
    const dur = len * this.spb;
    ch.n.forEach((o, i) => {
      const tt = t + i * (strum || 0.004);
      a.voice(note(o), { t: tt, dur, gain, wave: 0.25, attack: 0.006, release: Math.min(0.12, dur * 0.4), pan: -0.35 + i * 0.22, dest: this.bus.keys });
    });
  }

  comp(t, s, bar, gain = 1) {
    const b = bar % 4;
    const ch = this.chordAt(bar, s);
    if (b === 3) {
      if (s === 0) this.chord(t, ch, 3, { gain: 0.03 * gain });
      if (s === 8) this.chord(t, ch, 3, { gain: 0.03 * gain, strum: 0.02 });
      return;
    }
    if (b % 2 === 0) {
      if (s === 0) this.chord(t, ch, 3, { gain: 0.03 * gain });
      if (s === 14) this.chord(t, ch, 2, { gain: 0.026 * gain });
    } else if (s === 4) this.chord(t, ch, 4, { gain: 0.03 * gain, strum: 0.02 });
  }

  // the offbeat pluck, a half step off the chord on the IV
  pluck(t, s, bar, gain = 1) {
    if (s !== 2 && s !== 10) return;
    const ch = this.chordAt(bar, s);
    this.audio.voice(note(ch.pl + 12), { t, dur: 0.11, gain: 0.05 * gain * (s === 2 ? 1 : 0.7), wave: 0.125, attack: 0.002, release: 0.09, pan: s === 2 ? 0.25 : -0.25, dest: this.bus.keys });
  }

  // the sparkle: a 16th arpeggio two octaves up, bouncing between the ears
  sparkle(t, s, bar, gain = 1) {
    const ch = this.chordAt(bar, s);
    const o = ch.ar[[0, 1, 2, 3, 2, 1][s % 6]];
    this.audio.voice(note(o), { t, dur: 0.08, gain: 0.022 * gain, wave: 0.125, attack: 0.002, release: 0.06, pan: s % 2 ? 0.5 : -0.5, dest: this.bus.keys });
  }

  // the 3-osc bass: triangle, thin pulse and sine, two octaves down
  bass(t, o, len, gain = 1) {
    const a = this.audio;
    const dur = len * this.spb * 0.92;
    const f = note(o - 24);
    a.voice(f, { t, dur, gain: 0.2 * gain, wave: 'triangle', release: 0.03, dest: this.bus.bass });
    a.voice(f, { t, dur, gain: 0.05 * gain, wave: 0.125, release: 0.03, dest: this.bus.bass });
  }

  bassline(t, s, bar, line = BASS, gain = 1) {
    for (const [st, o, len, ghost] of line[bar % 4]) if (st === s) this.bass(t, o, len, ghost ? gain * 0.55 : gain);
  }

  // the 808: a sine thumping in from above and ringing; glide: the ratio it
  // slides to over its back half
  sub(t, o, dur, gain = 1, glide = 0) {
    const c = this.audio.ctx;
    const f = note(o - 36);
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * 2, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    if (glide) {
      osc.frequency.setValueAtTime(f, t + dur * 0.55);
      osc.frequency.exponentialRampToValueAtTime(f * glide, t + dur * 0.9);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.42 * gain, t + 0.004);
    g.gain.setTargetAtTime(0.12 * gain, t + 0.05, 0.35);
    g.gain.setValueAtTime(0.12 * gain + 0.3 * gain * Math.exp(-Math.max(0.01, dur - 0.09) / 0.35), t + Math.max(0.06, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g).connect(this.bus.sub);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // the kick, the 808 and the ducks on the kick pattern; the last 808 of
  // each four bars glides up home
  kicks(t, s, bar, { gain = 1, sub = true } = {}) {
    const pat = KICKS[bar % 2];
    const i = pat.indexOf(s);
    if (i < 0) return;
    this.kick(t, s ? 0.85 * gain : gain);
    if (sub) {
      const next = pat[i + 1] ?? 16;
      const r = this.chordAt(bar, s).r;
      const glide = bar % 4 === 3 && next === 16 ? note(0) / note(r) : 0;
      this.sub(t, r, (next - s) * this.spb * 0.97, gain, glide);
    }
  }

  kick(t, gain = 1) {
    const a = this.audio;
    a.kick(t, this.bus.drums);
    a.voice(150, { t, dur: 0.09, gain: 0.22 * gain, wave: 'triangle', slide: 0.3, release: 0.04, dest: this.bus.drums });
    a.chipNoise({ t, dur: 0.012, gain: 0.09 * gain, rate: 0.6, lp: 3000, dest: this.bus.drums });
    for (const g of [this.duck.gain, this.epDuck.gain]) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.4, t);
      g.linearRampToValueAtTime(1, t + this.spb * 2.5);
    }
  }

  // the clap, four layers, clipped short and pitched up: a flam of bright
  // bursts, a short snap of tail, a rim click, a body
  clap(t, gain = 1) {
    const a = this.audio;
    for (let i = 0; i < 3; i++) a.chipNoise({ t: t + i * 0.009, dur: 0.018, gain: 0.14 * gain, rate: 1.2, hp: 1300, lp: 7000, dest: this.bus.drums });
    a.noiseHit({ t: t + 0.027, dur: 0.11, gain: 0.19 * gain, freq: 2100, q: 0.9, dest: this.bus.drums });
    a.voice(1700, { t, dur: 0.012, gain: 0.07 * gain, wave: 'triangle', attack: 0.001, release: 0.008, dest: this.bus.drums });
    a.voice(240, { t, dur: 0.06, gain: 0.13 * gain, wave: 'triangle', slide: 0.6, release: 0.03, dest: this.bus.drums });
  }

  // the claps in pairs: two and the eighth after it, four and the eighth
  // after it (pairs: false for a plain backbeat)
  claps(t, s, gain = 1, pairs = true) {
    if (s === 4 || s === 12) this.clap(t, gain);
    if (pairs && (s === 6 || s === 14)) this.clap(t, gain * 0.55);
  }

  // a tongue click: a pop of narrow noise and a blip that drops (the
  // Neptunes' mouth percussion; a snake's tongue)
  click(t, low = false, gain = 1) {
    const a = this.audio;
    a.noiseHit({ t, dur: 0.018, gain: 0.3 * gain, freq: low ? 1300 : 2300, q: 6, dest: this.bus.perc });
    a.voice(low ? 900 : 1500, { t, dur: 0.02, gain: 0.06 * gain, wave: 'sine', slide: 0.5, attack: 0.0005, release: 0.012, dest: this.bus.perc });
  }

  // the snake's rattle: short chip noise in 32nds, swelling
  rattle(t, n = 6, gain = 1) {
    for (let i = 0; i < n; i++) this.audio.chipNoise({ t: t + (i * this.spb) / 2, dur: 0.025, gain: (0.012 + i * 0.004) * gain, short: true, rate: 2.2, hp: 4500, dest: this.bus.perc });
  }

  // a hiss: a long breath of noise, the open hat
  hiss(t, gain = 1) {
    this.audio.noiseHit({ t, dur: 0.35, gain: 0.05 * gain, freq: 6500, q: 0.7, type: 'highpass', dest: this.bus.perc });
  }

  // the snake in the kit: clicks round the beat, a rattle into every other
  // bar, a hiss
  snake(t, s, bar, gain = 1) {
    if (s === 3 || s === 11) this.click(t, false, gain);
    if (s === 9) this.click(t, true, gain * 0.8);
    if (bar % 2 === 1 && s === 13) this.rattle(t, 5, gain);
    if (bar % 4 === 1 && s === 14) this.hiss(t, gain);
  }

  // the charmer: a nasal pulse with a hair of saw for the reed, shaking
  charmer(t, o, len, opt = '', gain = 1) {
    this.tone(t, o, len, opt, { gain: 0.06 * gain, wave: 0.125, vib: 0.012, gate: 0.95, dest: this.bus.charm });
    this.tone(t, o, len, opt, { gain: 0.025 * gain, wave: 'saw', det: 1.003, vib: 0.012, gate: 0.95, dest: this.bus.charm });
  }

  // the charmer's drone: root and fifth, low and reedy, a bar long
  drone(t, ch) {
    for (const o of [ch.r - 12, ch.r - 5]) this.audio.voice(note(o), { t, dur: this.spb * 16, gain: 0.02, wave: 0.125, attack: 0.08, release: 0.1, dest: this.bus.bass });
  }

  // the stutter: the whole band (kick, clap, stab, 808) on 3, 3-and and 4
  stutter(t, s, ch, gain = 1) {
    if (s !== 8 && s !== 10 && s !== 12) return;
    this.kick(t, gain);
    this.clap(t, 0.9 * gain);
    this.chord(t, ch, 1.2, { gain: 0.04 * gain });
    this.sub(t, ch.r, this.spb * 1.6, gain);
  }

  // the impact on a drop: a crash, a kick, an 808 boom diving from above,
  // a clap, the chord stabbed, a wash of noise falling away
  impact(t, ch) {
    this.crash(t, 0.16);
    this.kick(t, 1.25);
    this.clap(t, 1.1);
    this.chord(t, ch, 2, { gain: 0.045 });
    const c = this.audio.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(note(ch.r - 12), t);
    o.frequency.exponentialRampToValueAtTime(note(ch.r - 36), t + 0.35);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.setTargetAtTime(0, t + 0.2, 0.25);
    o.connect(g).connect(this.bus.sub);
    o.start(t);
    o.stop(t + 1.4);
    const src = c.createBufferSource();
    src.buffer = this.audio.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1;
    f.frequency.setValueAtTime(7000, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 1.2);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.06, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    src.connect(f).connect(ng).connect(this.bus.drums);
    src.start(t);
    src.stop(t + 1.25);
  }

  hat(t, gain = 0.03, open = false) {
    this.audio.chipNoise({ t, dur: open ? 0.22 : 0.03, gain, short: true, rate: 1.4, hp: 7000, dest: this.bus.drums });
  }

  // swung eighths, accented off the beat; roll: the last beat as 32nds
  // (1) or triplets (2)
  hats(t, s, gain = 1, roll = 0, open = false) {
    if (roll && s >= 12) {
      if (s !== 12) return;
      const n = roll === 1 ? 8 : 6;
      for (let i = 0; i < n; i++) this.hat(t + (i * this.spb * 4) / n, (0.018 + i * 0.004) * gain);
      return;
    }
    if (s % 2 === 0) this.hat(t, (s % 4 === 2 ? 0.034 : 0.024) * gain);
    if (open && s === 14) this.hat(t, 0.03 * gain, true);
  }

  // the shaker: every swung 16th, leaning on the offbeats
  shaker(t, s, gain = 1) {
    const acc = [0.45, 0.25, 1, 0.35][s % 4];
    this.audio.chipNoise({ t, dur: 0.045, gain: 0.03 * acc * gain, rate: 1.6, hp: 6000, dest: this.bus.perc });
  }

  // the jumbled perc: pitched chip blips (woodblocks, rims) tumbling round
  // the beat
  jumble(t, s, bar, gain = 1) {
    for (const [st, hz] of JUMBLE[bar % 2]) {
      if (st !== s) continue;
      this.audio.voice(hz, { t, dur: 0.05, gain: 0.05 * gain, wave: 'triangle', slide: 0.75, attack: 0.001, release: 0.03, pan: hz > 1100 ? 0.4 : -0.4, dest: this.bus.perc });
      this.audio.chipNoise({ t, dur: 0.008, gain: 0.04 * gain, short: true, rate: 1.2, hp: 2500, dest: this.bus.perc });
    }
  }

  crash(t, gain = 0.1) {
    const a = this.audio;
    a.chipNoise({ t, dur: 1.6, gain, rate: 1, hp: 4000, dest: this.bus.drums });
    a.chipNoise({ t, dur: 0.5, gain: gain * 0.4, short: true, rate: 0.9, hp: 4500, dest: this.bus.drums });
  }

  // a rising wash of noise into a section
  riser(t, dur, gain = 0.05) {
    const c = this.audio.ctx;
    const src = c.createBufferSource();
    src.buffer = this.audio.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.95);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f).connect(g).connect(this.bus.drums);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // the bell: a triangle and its overtones, struck and ringing out
  bell(t, o, gain = 1, ring = 0.8) {
    const c = this.audio.ctx;
    for (const [mul, wave, g0] of [[1, 'triangle', 0.07], [2, 'sine', 0.035], [3.01, 'sine', 0.012]]) {
      const osc = c.createOscillator();
      osc.type = wave;
      osc.frequency.value = note(o) * mul;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(g0 * gain, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ring / mul);
      osc.connect(g).connect(this.bus.bell);
      osc.start(t);
      osc.stop(t + ring + 0.02);
    }
  }

  // the full beat
  beatFull(t, s, bar, { bass = BASS, roll = bar % 4 === 3 ? 1 : 0, perc = 1, snake = 1 } = {}) {
    this.bassline(t, s, bar, bass);
    this.kicks(t, s, bar);
    this.claps(t, s);
    if (snake) this.snake(t, s, bar, snake);
    this.hats(t, s, 1, roll, bar % 2 === 1);
    this.shaker(t, s, perc);
    this.jumble(t, s, bar, perc);
    this.keys(t, s, bar);
  }

  // ---------------------------------------------------------------- sections
  // the e-piano and the flick, muffled like a radio next door, the clicks
  // creeping in; the last bar stutters, muffled, then a dead hole with only
  // a click and the rattle in it, and the drop slams the filter open
  intro(t, s, bar) {
    const spb = this.spb;
    if (s === 0 && bar === 0) this.sweep(t, 750, 750, t + 0.01);
    if (s === 0 && bar === 3) this.sweep(t, 750, 1300, t + spb * 12);
    if (bar === 3 && s >= 8) {
      this.stutter(t, s, this.chordAt(bar, s), 0.7);
      // the hole: the filter thrown open so the click and the rattle cut
      if (s === 13) {
        this.open(t);
        this.click(t, false, 1.3);
      }
      if (s === 14) this.rattle(t, 4, 3);
      return;
    }
    if (bar >= 1) this.snake(t, s, bar, 0.5 + bar * 0.15);
    this.keys(t, s, bar, 1.2);
    this.shaker(t, s, 0.7 + bar * 0.1);
    if (bar >= 2) this.play(FLICK, bar - 2, s, { bell: false });
    if (bar >= 1) this.hats(t, s, 0.6);
    if (bar === 3 && s === 0) this.riser(t, spb * 12, 0.07);
    if (bar === 1 && s === 0) this.sub(t, 0, spb * 16, 0.6);
  }

  // the flick, the bell answering, the whole beat
  hook(t, s, bar) {
    if (s === 0 && bar === 0) {
      this.open(t);
      this.impact(t, C.i);
    }
    this.play(bar < 4 ? FLICK : FLICK_B, bar, s, { layer: bar < 4 ? 0.5 : 0.9 });
    this.beatFull(t, s, bar);
    this.pluck(t, s, bar, 0.7);
    if (bar === 7 && s === 8) this.riser(t, this.spb * 8, 0.04);
  }

  // the chop: the bass gone sparse, triplet rolls, the chip chords stabbing
  verse(t, s, bar) {
    if (s === 0 && bar === 0) this.crash(t, 0.1);
    this.play(bar < 4 ? CHOP : CHOP_B, bar, s, { layer: bar < 4 ? 0 : 0.7 });
    this.beatFull(t, s, bar, { bass: BASS_SPARSE, roll: bar % 2 === 1 ? 2 : 0 });
    this.comp(t, s, bar, 0.9);
    if (bar === 7 && s === 0) this.sweep(t, 18000, 2500, t + this.spb * 15);
  }

  // the charmer: D# major and E over a drone, the charmer's line with the
  // beat under it; the second time the saw lead doubles it an octave down
  // and the sparkle comes in. It stutters out into the flow.
  charm(t, s, bar) {
    const ch = this.chordAt(bar, s);
    if (s === 0 && bar === 0) {
      this.open(t);
      this.impact(t, C.I);
    }
    if (bar === 7 && s >= 8) {
      this.stutter(t, s, ch);
      if (s === 13) this.click(t, false, 1.2);
      if (s === 14) this.rattle(t, 4, 1.2);
      return;
    }
    if (s === 0) this.drone(t, ch);
    this.play(CHARMER, bar, s, { voice: (tt, o, l, op) => this.charmer(tt, o, l, op) });
    if (bar >= 4) this.play(CHARMER, bar, s, { gain: 0.6, layer: 0.5, voice: (tt, o, l, op) => this.lead(tt, o - 12, l, op, 0.55) });
    this.beatFull(t, s, bar, { bass: BASS_SPARSE, snake: 1.2 });
    if (s === 3 || s === 10) this.chord(t, ch, 1, { gain: 0.03 });
    if (bar >= 4) this.sparkle(t, s, bar, 0.7);
  }

  // the flow in triplets, then call and response with the charmer
  flow(t, s, bar) {
    if (s === 0 && bar === 0) {
      this.open(t);
      this.impact(t, C.i);
    }
    if (bar < 4) this.play(TRIP, bar, s, { layer: 0.5 });
    else this.play(CALL, bar, s, { layer: 0.6, answer: 'charm' });
    this.beatFull(t, s, bar);
    this.pluck(t, s, bar, 0.6);
    if (bar >= 4) this.sparkle(t, s, bar, 0.7);
  }

  // the break: no kick. The filter swallows the band, the bell plays the
  // old hook over the e-piano and the 808; a clap build claws it back open
  brk(t, s, bar) {
    const spb = this.spb;
    if (s === 0 && bar === 0) {
      this.sweep(t, 18000, 1100, t + spb * 12);
      this.crash(t, 0.08);
    }
    if (s === 0 && bar === 3) this.sweep(t, 1100, 18000, t + spb * 14);
    if (bar === 3 && s >= 14) return; // the hole
    this.play(bellOnly(HOOK), bar, s);
    this.keys(t, s, bar, 1.15);
    if (s === 0 && bar < 3) this.sub(t, this.chordAt(bar, 0).r, spb * 16, 0.75);
    this.shaker(t, s, 0.8);
    if (bar < 3) this.hats(t, s, 0.8, bar === 2 ? 2 : 0);
    else {
      const k = s < 4 ? s % 4 === 0 : s < 8 ? s % 2 === 0 : true;
      if (k) this.clap(t, 0.35 + s * 0.04);
      if (s >= 10) this.clap(t + spb / 2, 0.35 + s * 0.04);
      if (s === 0) this.riser(t, spb * 14, 0.06);
    }
  }

  // the old hook, then the flick, everything in
  final(t, s, bar) {
    if (s === 0 && bar === 0) {
      this.open(t);
      this.impact(t, C.i);
    }
    if (s === 0 && bar === 4) this.crash(t, 0.12);
    if (bar < 4) this.play(HOOK, bar, s, { gain: 1.05, layer: 0.9 });
    else this.play(FLICK_B, bar, s, { gain: 1.05, layer: 1, answer: 'charm' });
    this.beatFull(t, s, bar, { roll: bar % 2 === 1 ? (bar % 4 === 1 ? 2 : 1) : 0 });
    this.comp(t, s, bar, 0.8);
    this.pluck(t, s, bar, 0.7);
    this.sparkle(t, s, bar, 0.9);
  }

  // the outro: the chop while the filter closes on the band, a tape stop on the
  // IV, a last hit
  outro(t, s, bar) {
    const spb = this.spb;
    if (bar < 2) {
      if (s === 0 && bar === 0) {
        this.crash(t, 0.1);
        this.sweep(t, 18000, 900, t + spb * 32);
      }
      this.play(CHOP, bar, s, { layer: 0.6 });
      this.beatFull(t, s, bar, { roll: bar === 1 ? 1 : 0 });
      return;
    }
    if (bar === 2) {
      if (s !== 0) return;
      // the tape stop: the IV, its bass, the 808 and the lead sinking to a halt
      const a = this.audio;
      const dur = spb * 12;
      for (const o of C.IV.n) a.voice(note(o), { t, dur, gain: 0.032, wave: 0.25, slide: 0.3, release: 0.2, dest: this.bus.keys });
      a.voice(note(C.IV.r - 24), { t, dur, gain: 0.22, wave: 'triangle', slide: 0.3, release: 0.2, dest: this.bus.bass });
      this.sub(t, C.IV.r, dur, 1, 0.3);
      this.kick(t);
      this.crash(t, 0.08);
      const c = a.ctx;
      for (const [type, g0] of [['sawtooth', 0.05], ['square', 0.03]]) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(note(12), t);
        o.frequency.exponentialRampToValueAtTime(note(12) * 0.3, t + dur);
        const g = c.createGain();
        g.gain.setValueAtTime(g0, t);
        g.gain.setValueAtTime(g0, t + dur * 0.7);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g).connect(this.bus.lead);
        o.start(t);
        o.stop(t + dur + 0.02);
      }
      return;
    }
    // the last hit, clean
    if (s !== 0) return;
    this.open(t);
    this.crash(t, 0.12);
    this.kick(t, 1.1);
    this.sub(t, 0, spb * 14, 1.1, 0.5);
    this.ep(t, C.i.ep, spb * 16, 1.3);
    this.bass(t, 0, 14, 0.9);
    this.tone(t, 12, 10, 'f2d', { gain: 0.07, wave: 'saw' });
    this.tone(t, 12, 10, 'f2d', { gain: 0.03, oct: 12, wave: 0.125 });
    this.bell(t, 24, 0.9, 1.6);
    this.clap(t + spb * 4, 0.6);
  }
}
