// "Golden Hour Rave": the bonus level's song, an original chiptune party
// anthem in C minor at 158 BPM (a stomping, chanted hype tempo).
//
// It's in two halves that follow the game:
//  - The build, in the dark. It starts as a lone heartbeat and every golden
//    apple adds a layer: hats, a pulsing bass, an arpeggio that opens up
//    through a filter, a backbeat, the hook played softly an octave down,
//    four-on-the-floor, snare rolls, then on apple nine a rising siren and a
//    16th-note snare roll that never resolves...
//  - The drop, on apple ten. The lights come on and the full song kicks in
//    on the spot: octave-pumping disco bass, power-chord stabs, the chanted
//    hook in a bright square lead, crowd "HEY!"s, a crash every 8 bars.
//    Every 10 apples after that it lifts a semitone, after a fill.
//
// It plugs into AudioEngine as a custom track (startMusic({ custom })), so it
// plays through the game's music bus: pause, slow motion and volume apply.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const SCALE = [0, 2, 3, 5, 7, 8, 10]; // C natural minor
export const BONUS_TEMPO = 158;
const ROOT = 72; // C5: the lead's degree 1
const BASS_ROOT = 36; // C2

// chord roots in semitones from C, and their qualities
const MAJ = [0, 4, 7];
const MIN = [0, 3, 7];
const BUILD_CHORDS = [[0, MIN], [-4, MAJ], [-2, MAJ], [-5, MAJ]]; // Cm Ab Bb G
const A_CHORDS = [[0, MIN], [-4, MAJ], [3, MAJ], [-2, MAJ]]; // Cm Ab Eb Bb
const B_CHORDS = [[-4, MAJ], [-2, MAJ], [0, MIN], [-5, MAJ]]; // Ab Bb Cm G

// Melodies: 16 tokens per bar. Numbers are scale degrees (1 = C, 8 = the C
// above), '#' raises a semitone, '-' holds, '.' rests.
const HOOK_A = [
  '8 . 8 . 8 - 7 . 8 . 10 - 8 . 7 .',
  '6 . 6 . 6 - 5 . 6 . 8 - 6 . 5 .',
  '5 . 5 . 5 - 3 . 5 . 7 - 5 . 3 .',
  '4 . 4 . 4 - 2 . 4 . 7 - 9 - 11 -',
  '8 . 8 . 8 - 7 . 8 . 10 - 12 - 10 -',
  '13 - - - 12 - 10 - 8 - - - 6 - 8 -',
  '12 - - - 10 - 9 . 10 - 12 - 14 - - -',
  '11 - - - 9 . 9 . 11 . 9 . 8 . 7 .',
];
const HOOK_B = [
  '10 . . 10 . . 8 . . . . . 6 . 8 .',
  '11 . . 11 . . 9 . . . . . 7 . 9 .',
  '12 . . 12 . . 10 . . . 12 . 15 . . .',
  '12 - - - 11 - - - 9 - - - 14# - 12 -',
  '10 . . 10 . . 8 . . . . . 6 . 8 .',
  '11 . . 11 . . 9 . . . . . 7 . 9 .',
  '12 . . 12 . . 10 . . . 12 . 15 . . .',
  '12 - 14# - 15 - - - 14# - 12 - 11 - 9 -',
];

function parse(bars) {
  const notes = [];
  bars.forEach((bar, b) => {
    const t = bar.trim().split(/\s+/);
    for (let s = 0; s < 16; s++) {
      const tok = t[s];
      if (!tok || tok === '-' || tok === '.') continue;
      let len = 1;
      while (t[s + len] === '-') len++;
      const sharp = tok.endsWith('#');
      const d = parseInt(tok, 10);
      const semis = SCALE[(d - 1) % 7] + 12 * Math.floor((d - 1) / 7) + (sharp ? 1 : 0);
      notes[b * 16 + s] = { semis, len };
    }
  });
  return notes;
}
const NOTES_A = parse(HOOK_A);
const NOTES_B = parse(HOOK_B);
// the hook's opening phrase alone, for the build
const NOTES_TEASE = parse(HOOK_A.slice(0, 4));

export class BonusMusic {
  constructor(audio) {
    this.audio = audio; // the game's AudioEngine (its context must be unlocked)
    this.tempo = BONUS_TEMPO;
    this.spb = 60 / this.tempo / 4; // seconds per 16th
    this.mode = 'build';
    this.apples = 0;
    this.key = 0;
    this.pendingKey = 0;
    this.playing = false;
    this.t0 = 0;
    this.built = false;
  }

  build() {
    if (this.built) return;
    const a = this.audio;
    const c = a.ctx;
    this.out = c.createGain();
    // the build sits behind a low-pass that opens with every apple
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.Q.value = 1.1;
    this.out.connect(this.filter).connect(a.music);
    this.bus = {};
    for (const k of ['drums', 'bass', 'arp', 'lead', 'stabs', 'fx']) {
      const g = c.createGain();
      g.connect(k === 'fx' ? a.music : this.out); // risers and hits skip the filter
      this.bus[k] = g;
    }
    this.bus.lead.connect(a.delay);
    this.bus.lead.connect(a.musicSend);
    this.built = true;
  }

  // AudioEngine calls these -------------------------------------------------
  start(at) {
    if (!this.audio.ctx) return;
    this.build();
    this.playing = true;
    this.mode = 'build';
    this.apples = 0;
    this.key = this.pendingKey = 0;
    this.step = 0;
    this.bar = 0;
    this.t0 = at;
    this.nextTime = at;
    this.fill = false;
    this.crash = false;
    this.section = 'A';
    this.loops = 0;
    this.out.gain.value = 1;
    this.applyFilter(true);
  }

  stop() {
    this.playing = false;
  }

  schedule(until) {
    if (!this.playing) return;
    while (this.nextTime < until) {
      this.playStep(this.nextTime);
      this.nextTime += this.spb;
      this.advance();
    }
  }

  // The game calls these ---------------------------------------------------
  // How many golden apples have been eaten (the build adds a layer for each).
  setApples(n) {
    this.apples = n;
    if (this.mode === 'build') this.applyFilter(false);
  }

  // Apple ten: the drop lands right now, on a fresh downbeat.
  drop() {
    if (!this.playing || !this.audio.ctx) return;
    const now = this.audio.ctx.currentTime + 0.03;
    this.mode = 'party';
    this.section = 'A';
    this.loops = 0;
    this.step = 0;
    this.bar = 0;
    this.t0 = now;
    this.nextTime = now;
    this.fill = false;
    this.crash = true;
    const f = this.filter.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(18000, now + 0.08);
    this.impact(now);
  }

  // Lift the song a semitone, on the next bar after a fill (every 10 apples).
  keyUp() {
    if (this.mode !== 'party') return;
    this.pendingKey = Math.min(this.pendingKey + 1, 5);
  }

  // Where the music is, for visuals that pulse in time with it.
  beat(now = this.audio.ctx ? this.audio.ctx.currentTime : 0) {
    if (!this.playing) return null;
    const b = (now - this.t0) / (this.spb * 4);
    return { beat: b, mode: this.mode, apples: this.apples };
  }

  // A crash ends the run: the music winds down like a record losing power.
  powerDown() {
    const a = this.audio;
    if (!a.ctx || !this.playing) return;
    const t = a.ctx.currentTime;
    a.voice(midi(this.mode === 'party' ? 60 : 48), { t, dur: 0.9, gain: 0.12, wave: 'sawtooth', slide: 0.12, dest: this.bus.fx, release: 0.5 });
    a.voice(midi(this.mode === 'party' ? 67 : 55), { t, dur: 0.8, gain: 0.06, wave: 0.25, slide: 0.12, dest: this.bus.fx, release: 0.5 });
    this.playing = false;
  }

  // -------------------------------------------------------------- internals
  applyFilter(instant) {
    if (!this.filter) return;
    const c = this.audio.ctx;
    const n = this.apples;
    const f = this.mode === 'party' ? 18000 : 700 * Math.pow(1.36, Math.min(n, 9));
    const p = this.filter.frequency;
    p.cancelScheduledValues(c.currentTime);
    if (instant) p.setValueAtTime(f, c.currentTime);
    else p.setTargetAtTime(f, c.currentTime, 0.4);
  }

  advance() {
    this.step++;
    if (this.step < 16) return;
    this.step = 0;
    this.bar++;
    if (this.mode === 'build') {
      if (this.bar >= 4) this.bar = 0;
      return;
    }
    if (this.fill) {
      this.fill = false;
      this.crash = true;
      if (this.pendingKey !== this.key) this.key = this.pendingKey;
    }
    if (this.bar >= 8) {
      this.bar = 0;
      this.crash = true;
      this.section = this.section === 'A' ? 'B' : 'A';
      if (this.section === 'A') this.loops++;
    } else if (this.bar === 7 || (this.pendingKey !== this.key && this.bar % 4 === 3)) this.fill = true;
  }

  playStep(t) {
    if (this.mode === 'build') this.playBuild(t);
    else this.playParty(t);
  }

  hey(t) {
    // a chiptune crowd shout: a vowel-ish band of noise over a falling buzz
    const a = this.audio;
    a.noiseHit({ t, dur: 0.16, gain: 0.16, freq: 1100, q: 3, dest: this.bus.fx });
    a.noiseHit({ t, dur: 0.12, gain: 0.08, freq: 2600, q: 4, dest: this.bus.fx });
    a.voice(midi(57 + this.key), { t, dur: 0.15, gain: 0.07, wave: 'sawtooth', slide: 0.7, dest: this.bus.fx, release: 0.06 });
  }

  impact(t) {
    // the drop: sub boom, a crash, and a bright chord hit
    const a = this.audio;
    const c = a.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.9);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g).connect(this.bus.fx);
    o.start(t);
    o.stop(t + 1.2);
    a.noiseHit({ t, dur: 1.6, gain: 0.2, freq: 4500, type: 'highpass', dest: this.bus.fx });
    a.noiseHit({ t, dur: 0.7, gain: 0.25, freq: 600, type: 'lowpass', sweep: 0.2, dest: this.bus.fx });
    for (const n of [0, 7, 12, 16, 19, 24]) a.voice(midi(60 + n), { t, dur: 0.9, gain: 0.04, wave: 0.25, dest: this.bus.fx, release: 0.6 });
  }

  playBuild(t) {
    const a = this.audio;
    const s = this.step;
    const n = this.apples;
    const spb = this.spb;
    const B = this.bus;
    const [cRoot, chord] = BUILD_CHORDS[this.bar % 4];
    const lastBar = this.bar % 4 === 3;

    // drums: a heartbeat that turns into a beat
    if (n < 4) {
      if (s === 0 || s === 3 || (n >= 2 && (s === 8 || s === 11))) a.kick(t, B.drums);
    } else if (n < 6) {
      if (s === 0 || s === 8 || s === 11) a.kick(t, B.drums);
    } else if (s % 4 === 0) a.kick(t, B.drums);
    if (n >= 1 && s % 2 === 0) a.hat(t, B.drums, s % 4 === 2 ? 0.06 : 0.035);
    if (n >= 5 && (s === 4 || s === 12)) a.snare(t, B.drums, 0.14);
    if (n >= 8 && lastBar && s >= 8 && s % 2 === 0) a.snare(t, B.drums, 0.05 + (s - 8) * 0.012);
    if (n >= 9) {
      // one apple to go: a 16th-note roll that keeps climbing
      const k = ((this.bar % 2) * 16 + s) / 32;
      a.snare(t, B.drums, 0.03 + k * 0.09);
      if (s === 0 && this.bar % 2 === 0) {
        a.noiseHit({ t, dur: spb * 32, gain: 0.07, freq: 500, type: 'bandpass', q: 2, sweep: 14, dest: B.fx });
        a.voice(midi(60), { t, dur: spb * 32, gain: 0.03, wave: 0.5, slide: 4, dest: B.fx, release: 0.1 });
      }
    }

    // bass: eighths on the chord root
    if (n >= 2 && s % 2 === 0) {
      const f = midi(BASS_ROOT + 12 + cRoot + (s === 6 || s === 14 ? 12 : 0));
      a.voice(f, { t, dur: spb * 1.6, gain: 0.3, wave: 'triangle', dest: B.bass, release: 0.03 });
      if (n >= 4) a.voice(f * 2, { t, dur: spb * 1.2, gain: 0.03, wave: 0.5, dest: B.bass, release: 0.03 });
    } else if (n < 2 && s === 0) {
      // the drone under the heartbeat
      a.voice(midi(BASS_ROOT + 12 + cRoot), { t, dur: spb * 15, gain: 0.22, wave: 'triangle', dest: B.bass, release: 0.4, attack: 0.3 });
    }

    // arpeggio
    if (n >= 3) {
      const order = [0, 1, 2, 1, 0, 2, 1, 2];
      const note = 72 + cRoot + chord[order[s % 8]] + (s % 8 === 5 ? 12 : 0);
      a.voice(midi(note), { t, dur: spb * 0.8, gain: 0.035 + Math.min(n, 9) * 0.002, wave: 0.125, dest: B.arp, release: 0.04 });
    }

    // stabs
    if (n >= 7 && (s === 2 || s === 10)) this.power(t, cRoot, 0.022);

    // the hook, teased: soft and low, then the full phrase
    if (n >= 5) {
      const notes = n >= 7 ? NOTES_A : NOTES_TEASE;
      const nt = notes[(this.bar % (n >= 7 ? 8 : 4)) * 16 + s];
      if (nt) {
        const dur = spb * nt.len * 0.9;
        a.voice(midi(ROOT - 12 + nt.semis), { t, dur, gain: 0.07, wave: n >= 7 ? 0.25 : 'triangle', dest: B.lead, release: Math.min(0.06, dur * 0.3) });
      }
    }
  }

  power(t, root, gain) {
    for (const k of [0, 7, 12]) this.audio.voice(midi(48 + root + this.key + k), { t, dur: this.spb * 0.9, gain, wave: 0.5, dest: this.bus.stabs, release: 0.04 });
  }

  playParty(t) {
    const a = this.audio;
    const s = this.step;
    const spb = this.spb;
    const B = this.bus;
    const key = this.key;
    const isB = this.section === 'B';
    const [cRoot, chord] = (isB ? B_CHORDS : A_CHORDS)[this.bar % 4];
    const root = cRoot + key;

    // drums: four on the floor, claps on 2 and 4, open hats on the offbeat
    if (this.crash && s === 0) {
      a.noiseHit({ t, dur: 1.3, gain: 0.15, freq: 5000, type: 'highpass', dest: B.drums });
      this.crash = false;
    }
    if (this.fill) {
      if (s < 8 && s % 4 === 0) a.kick(t, B.drums);
      if (s >= 8 || s % 2 === 0) a.snare(t, B.drums, 0.06 + (s / 16) * 0.12);
      if (s >= 8 && s % 2 === 0) a.voice(midi(52 - (s - 8)), { t, dur: 0.12, gain: 0.2, wave: 'triangle', slide: 0.5, dest: B.drums });
    } else {
      if (s % 4 === 0) a.kick(t, B.drums);
      if (s === 4 || s === 12) {
        a.snare(t, B.drums, 0.17);
        a.noiseHit({ t: t + 0.012, dur: 0.09, gain: 0.08, freq: 1300, q: 1.2, dest: B.drums }); // clap layer
      }
      if (s % 4 === 2) a.hat(t, B.drums, 0.075, true);
      else a.hat(t, B.drums, s % 2 ? 0.025 : 0.035);
    }

    // bass: the disco octave pump
    if (s % 2 === 0) {
      const up = s % 4 === 2;
      const f = midi(BASS_ROOT + root + (up ? 12 : 0));
      a.voice(f, { t, dur: spb * (up ? 1.2 : 1.7), gain: 0.32, wave: 'triangle', dest: B.bass, release: 0.03 });
      a.voice(f * 2, { t, dur: spb * 1.1, gain: 0.04, wave: 0.25, dest: B.bass, release: 0.03 });
    }

    // arpeggio, sparkling an octave up in the B section
    {
      const order = [0, 1, 2, 1, 2, 0, 2, 1];
      const note = 72 + root + chord[order[s % 8]] + (s % 4 === 3 ? 12 : 0) + (isB ? 12 : 0);
      a.voice(midi(note), { t, dur: spb * 0.7, gain: isB ? 0.026 : 0.032, wave: 0.125, dest: B.arp, release: 0.03 });
    }

    // power-chord stabs on a pushing, syncopated pattern
    if (!this.fill && (s === 0 || s === 3 || s === 6 || s === 10 || s === 12)) this.power(t, root, s === 0 ? 0.032 : 0.024);

    // crowd shouts in the chorus
    if (isB && !this.fill && s === 12 && this.bar % 2 === 1) this.hey(t);

    // the hook
    const notes = isB ? NOTES_B : NOTES_A;
    const nt = notes[this.bar * 16 + s];
    if (nt) {
      const dur = spb * nt.len * (nt.len === 1 ? 0.7 : 0.94);
      const n = ROOT + key + nt.semis;
      const rel = Math.min(0.07, dur * 0.3);
      a.voice(midi(n), { t, dur, gain: 0.085, wave: 0.5, dest: B.lead, release: rel, vibrato: nt.len >= 3 ? 0.01 : 0 });
      // the chorus (and every second time round) doubles an octave up
      if (isB || this.loops % 2 === 1) a.voice(midi(n + 12), { t, dur, gain: 0.035, wave: 0.125, dest: B.lead, release: rel });
      else a.voice(midi(n - 12), { t, dur, gain: 0.03, wave: 0.25, dest: B.lead, release: rel });
    }
  }
}
