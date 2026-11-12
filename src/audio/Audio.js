// Every sound is synthesised with Web Audio at runtime: no audio files.
//
// Music is an adaptive chiptune engine. Each zone has its own song (key,
// chords, a composed verse and chorus melody). Instrument layers (bass, arp,
// drums, lead, chord stabs, counter-melody, rush sparkle) fade in and out
// smoothly with the game's intensity, the drums step up through three
// grooves, sections hand over on bar lines with drum fills, and zone changes
// land on a downbeat after a fill and a crash, so nothing ever cuts abruptly.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygdom: [0, 1, 4, 5, 7, 8, 10], // phrygian dominant: the snake charmer's scale
};
const QUALITY = {
  maj: [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], 6: [0, 4, 7, 9],
  add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14], 9: [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14], m6: [0, 3, 7, 9],
};

// Melodies: 16 tokens per bar. Numbers are scale degrees (1 = key root,
// 8 = an octave up), '-' holds the previous note, '.' is a rest.
const SONGS = [
  {
    name: 'Seaside Sprint', key: 0, scale: 'major', tempo: 140, lead: 0.25,
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
    name: 'Desert Wind', key: 2, scale: 'major', tempo: 146, lead: 0.25,
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
    name: 'City Lights', key: 9, scale: 'minor', tempo: 152, lead: 0.5,
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
    name: 'Data Stream', key: 6, scale: 'minor', tempo: 160, lead: 0.5,
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
  {
    // soaring synthwave in a bright major key for the flight above the clouds
    name: 'Skyward', key: 5, scale: 'major', tempo: 150, lead: 0.5,
    A: {
      chords: [[0, 'maj7'], [7, 'maj'], [9, 'm7'], [5, 'maj7']],
      melody: [
        '5 - - 6 - - 8 - - - 9 - 8 - 6 -', '5 - - - - - 3 - 5 - - - . . . .',
        '5 - - 6 - - 8 - - - 10 - 9 - 8 -', '9 - - - 8 - - - 6 - - - . . 5 6',
        '8 - - 9 - - 10 - - - 12 - 10 - 9 -', '8 - - - - - 6 - 8 - - - 9 - 10 -',
        '12 - - 10 - - 9 - 10 - - - 8 - 9 -', '8 - - - - - - - . . 5 . 6 . 7 .',
      ],
    },
    B: {
      chords: [[2, 'm7'], [5, 'maj7'], [0, 'maj'], [7, '7']],
      melody: [
        '10 - - 9 - - 10 - 12 - - - 13 - 12 -', '12 - - 10 - - 9 - 8 - - - 9 - 10 -',
        '9 - - - 8 - 6 - 8 - - - 10 - - -', '12 - - 10 - - 12 - 14 - - - - - . .',
        '15 - - 14 - - 12 - 14 - - - 12 - 10 -', '12 - - 10 - - 9 - 10 - - - 12 - 13 -',
        '14 - - 12 - - 10 - 12 - - - 10 - 9 -', '8 - - - - - - - 12 . 13 . 14 . 15 .',
      ],
    },
  },
  {
    // the finale: a vast, slow minor-key anthem in orbit round the black hole
    name: 'Last Light', key: 2, scale: 'minor', tempo: 132, lead: 0.5,
    A: {
      chords: [[0, 'm7'], [8, 'maj7'], [3, 'maj'], [10, 'maj']],
      melody: [
        '5 - - - 8 - - - 7 - 8 - 5 - - -', '3 - - - 4 - 5 - - - - - . . . .',
        '6 - - - 5 - - - 4 - 5 - 6 - - -', '8 - - - 7 - - - 5 - - - . . 5 6',
        '8 - - 9 - - 10 - - - 9 - 8 - - -', '7 - - - 5 - - - 3 - 5 - - - . .',
        '7 - 8 - 9 - 10 - 11 - - - 10 - 9 -', '8 - - - - - - - . . . . 5 6 7 8',
      ],
    },
    B: {
      chords: [[8, 'maj7'], [10, '6'], [0, 'm'], [7, 'm7']],
      melody: [
        '10 - - - 12 - - - 11 - 10 - 8 - - -', '10 - - - 9 - 8 - 6 - - - 8 - - -',
        '9 - - - 11 - - - 12 - 11 - 9 - - -', '12 - - - 14 - - - 12 - - - . . . .',
        '15 - - - 14 - 12 - 10 - - - 12 - - -', '13 - - - 12 - - - 10 - 9 - 8 - - -',
        '9 - - 10 - - 12 - - - 14 - 12 - 10 -', '12 - - - - - - - 12 . 13 . 14 . 15 .',
      ],
    },
  },
];

// Each map's second song. One of the two is picked at random every time a
// map's music starts. They're written hook first: a short, catchy motif that
// repeats and climbs through the verse, and a bigger, higher chorus where the
// lead doubles an octave up. Optional style fields give each its own feel:
//   bass / drums: patterns per tier (as BASS and DRUMS; drums may add a
//     't' tom lane), arp: { order, every (in 16ths), len, oct },
//   stabs: a 16-step pattern, swing: delay of the off 16ths (0..0.5 of a
//   step), echo: { steps, gain } repeats held lead notes, staccato: shortens
//   short lead notes, leadOct: semitones added to the lead,
//   double: the chorus lead is doubled an octave up, pad: a sustained chord
//   pad under every bar, pump: the pad and arp duck on each kick and swell
//   back (sidechain). A section may have 4 or 8 chords (one per bar).
const ALT_SONGS = [
  {
    // sunny and anthemic: a bouncing turn-and-leap hook climbing G D Em C
    name: 'High Tide', key: 7, scale: 'major', tempo: 150, lead: 0.25, double: true,
    A: {
      chords: [[0, 'maj'], [7, 'maj'], [9, 'm'], [5, 'maj']],
      melody: [
        '8 - - 7 - - 8 - 10 - - - 9 - 8 -', '9 - - 8 - - 9 - 12 - - - - - . .',
        '10 - - 9 - - 10 - 13 - - - 12 - 10 -', '11 - - 10 - - 8 - - - . . 5 - 6 -',
        '8 - - 7 - - 8 - 10 - - - 9 - 8 -', '9 - - 8 - - 9 - 12 - - - 14 - 12 -',
        '13 - - 12 - - 10 - 12 - - - 10 - 9 -', '8 - - - - - - - . . 8 . 9 . 10 .',
      ],
    },
    B: {
      chords: [[5, 'maj'], [7, 'maj'], [9, 'm'], [0, 'maj']],
      melody: [
        '11 - - 11 - - 10 - 11 - - - 15 - - -', '12 - - 12 - - 11 - 12 - - - 14 - - -',
        '13 - - 13 - - 12 - 13 - - - 15 - 14 -', '15 - - - 12 - - - 10 - - - 12 - - -',
        '11 - - 11 - - 10 - 11 - - - 15 - - -', '12 - - 12 - - 11 - 12 - - - 16 - - -',
        '17 - - 16 - - 15 - 14 - - - 13 - 12 -', '15 - - - - - - - . . 12 . 13 . 14 .',
      ],
    },
  },
  {
    // a galloping western: repeated-note gallops that step down, then a heroic chorus
    name: 'Gold Rush', key: 9, scale: 'minor', tempo: 150, lead: 0.125, swing: 0.18, double: true,
    stabs: '..x...x...x...x.',
    bass: {
      menu: 'R - - - - - - - 5 - - - - - - -',
      1: 'R . . R R . 5 . R . . R R . 5 .',
      2: 'R . R R 5 . R . R . R R 5 . 7 .',
      3: 'R . R R 5 . O . R . R R 5 . 7 O',
    },
    drums: {
      1: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' },
      2: { k: 'x..xx...x..xx...', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', t: '..............x.' },
      3: { k: 'x..xx..xx..xx...', s: '....x.......x.x.', h: 'xxxxxxxxxxxxxxxx', t: '...........x..xx' },
    },
    A: {
      chords: [[0, 'm'], [10, 'maj'], [8, 'maj'], [7, 'm']],
      melody: [
        '5 . 5 5 8 - - - 7 . 7 7 5 - - -', '4 . 4 4 7 - - - 6 . 6 6 4 - - -',
        '3 . 3 3 6 - - - 5 . 5 5 3 - - -', '2 - - 3 - - 5 - - - . . 5 . 5 5',
        '8 . 8 8 12 - - - 10 . 10 10 8 - - -', '7 . 7 7 11 - - - 9 . 9 9 7 - - -',
        '6 . 6 6 10 - - - 9 . 8 . 6 - 5 -', '5 - - - - - - - 12 . 12 12 12 . 12 12',
      ],
    },
    B: {
      chords: [[8, 'maj'], [10, 'maj'], [3, 'maj'], [0, 'm']],
      melody: [
        '10 - - 11 - - 13 - - - 12 - 10 - - -', '11 - - 12 - - 14 - - - 13 - 11 - - -',
        '12 - - 13 - - 14 - - - 12 - 10 - - -', '8 - - - . . 5 . 8 . 8 8 10 . 12 .',
        '10 - - 11 - - 13 - - - 12 - 10 - - -', '11 - - 12 - - 14 - - - 13 - 11 - - -',
        '15 - - 14 - - 12 - 14 - - - 12 - 10 -', '8 - - - - - - - . . 5 . 5 5 5 .',
      ],
    },
  },
  {
    // disco synth-pop: an octave-popping hook (E-E'... E-E'...) stepping down
    // Em C G D, then a sing-along chorus that rings on repeated high notes
    name: 'Midnight Drive', key: 4, scale: 'minor', tempo: 128, lead: 0.5, leadOct: -12, staccato: 0.7, double: true,
    stabs: '..x...x...x...x.',
    bass: {
      menu: 'R - - - - - - - O - - - - - - -',
      1: 'R . O . R . O . R . O . R . O .',
      2: 'R . O . R . O . R . O . 5 . O .',
      3: 'R O R O R O R O R O R O 5 O 7 O',
    },
    drums: {
      1: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' },
      2: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      3: { k: 'x...x...x...x...', s: '....x.......x..x', h: 'xxxxxxxxxxxxxxxx' },
    },
    A: {
      chords: [[0, 'm'], [8, 'maj'], [3, 'maj'], [10, 'maj']],
      melody: [
        '8 15 . 8 15 . 14 . 12 - - . 10 - 12 -', '6 13 . 6 13 . 12 . 10 - - . 8 - 10 -',
        '3 10 . 3 10 . 9 . 7 - - . 5 - 7 -', '9 - - 11 - - 12 - 14 - - - 16 - - -',
        '8 15 . 8 15 . 14 . 12 - - . 10 - 12 -', '6 13 . 6 13 . 12 . 10 - - . 8 - 10 -',
        '3 10 . 3 10 . 9 . 7 - - . 5 - 7 -', '16 - 14 - 12 - 11 - 9 - - - . . . .',
      ],
    },
    B: {
      chords: [[8, 'maj'], [10, 'maj'], [0, 'm'], [0, 'm']],
      melody: [
        '15 - - 15 - - 15 - 13 - 15 - 17 - - -', '16 - - 16 - - 16 - 14 - 16 - 18 - - -',
        '19 - - 17 - - 15 - 17 - - - 19 - 22 -', '22 - - - 21 - 19 - 17 - - - . . . .',
        '15 - - 15 - - 15 - 13 - 15 - 17 - - -', '16 - - 16 - - 16 - 14 - 16 - 18 - - -',
        '15 - 19 - 15 - 17 - 19 - - - 22 - - -', '22 - - - - - - - . . 15 . 17 . 19 .',
      ],
    },
  },
  {
    // a chase theme in harmonic minor: a swooping run that lands high and
    // falls back through the leading tone, over Dm Bb Gm A; the chorus holds
    // long notes with quick pickups between them
    name: 'Firewall', key: 2, scale: 'harmonic', tempo: 158, lead: 0.5, leadOct: -12, double: true,
    bass: {
      menu: 'R - - - - - - - 5 - - - - - - -',
      1: 'R . R . O . R . R . R . O . R .',
      2: 'R . R O . R O . R . R O . R 5 .',
      3: 'R R O R R O R O R R O R 5 O 7 O',
    },
    drums: {
      1: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      2: { k: 'x.....x.x.x.....', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.' },
      3: { k: 'x..x..x.x.x..x..', s: '....x..x....x...', h: 'xxxxxxxxxxxxxxxx', t: '..............xx' },
    },
    A: {
      chords: [[0, 'm'], [8, 'maj'], [5, 'm'], [7, 'maj']],
      melody: [
        '12 - - 10 - 12 - 15 - - - 14 - 12 - 10', '13 - - 10 - 13 - 15 - - - 13 - 12 - 10',
        '11 - - 8 - 11 - 13 - - - 12 - 11 - 10', '9 - - - 12 - - - 14 - - - 16 - 14 -',
        '12 - - 10 - 12 - 15 - - - 14 - 12 - 10', '13 - - 10 - 13 - 15 - - - 13 - 12 - 10',
        '18 - 17 - 15 - 13 - 15 - 17 - 18 - 15 -', '16 - - - 14 - - - 12 - - - 9 - 7 -',
      ],
    },
    B: {
      chords: [[8, 'maj'], [5, 'm'], [7, 'maj'], [0, 'm']],
      melody: [
        '17 - - - - - - - 15 - 17 - 18 - 17 -', '18 - - - - - - - 17 - 15 - 13 - 15 -',
        '16 - - - - - - - 14 - 16 - 19 - 16 -', '15 - - - - - - - . . 12 . 15 . 17 .',
        '20 - - - - - - - 17 - 18 - 19 - 20 -', '18 - - - - - - - 17 - 18 - 20 - 22 -',
        '21 - - - 19 - - - 16 - - - 21 - - -', '22 - - - - - - - . . 19 . 20 . 21 .',
      ],
    },
  },
  {
    // dreamy but singable: a floating hook over IV V iii vi, then a chorus
    // that climbs in leaps to the top of the sky
    name: 'Golden Hour', key: 2, scale: 'major', tempo: 146, lead: 0.25, leadOct: -12, double: true, echo: { steps: 3, gain: 0.3 },
    arp: { order: [0, 1, 2, 3, 2, 1], every: 1, len: 0.9, oct: 12 },
    drums: {
      1: { k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.' },
      2: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      3: { k: 'x.....x.x.x.....', s: '....x.......x..x', h: 'x.xxx.xxx.xxx.xx' },
    },
    A: {
      chords: [[5, 'maj7'], [7, 'maj'], [4, 'm7'], [9, 'm7']],
      melody: [
        '10 - - 11 - - 12 - - - 15 - 14 - 12 -', '12 - - - 11 - 10 - 9 - - - . . 9 10',
        '10 - - 11 - - 12 - - - 15 - 14 - 12 -', '13 - - - 12 - - - 10 - - - 8 - 9 -',
        '10 - - 11 - - 12 - - - 15 - 14 - 12 -', '12 - - - 14 - - - 16 - - - 17 - 16 -',
        '17 - - 16 - - 15 - 14 - - - 12 - 10 -', '13 - - - - - - - . . 10 . 11 . 12 .',
      ],
    },
    B: {
      chords: [[5, 'maj'], [7, 'maj'], [9, 'm'], [0, 'maj']],
      melody: [
        '15 - - - 14 - - - 15 - - - 18 - - -', '16 - - - 15 - - - 16 - - - 19 - - -',
        '17 - - - 16 - - - 17 - - - 20 - - -', '22 - - - - - - - 19 - - - 17 - - -',
        '15 - - - 14 - - - 15 - - - 18 - 17 -', '16 - - - 15 - - - 16 - - - 19 - 18 -',
        '17 - - 18 - - 19 - 20 - - - 21 - 20 -', '22 - - - - - - - . . 15 . 16 . 17 .',
      ],
    },
  },
  {
    // wonder at the heart of the galaxy, in a major key: a rising arpeggio
    // that cascades back down like a shooting star (vi IV I V), and a chorus
    // whose ringing call climbs a step every bar
    name: 'Supernova', key: 9, scale: 'major', tempo: 140, lead: 0.25, leadOct: -12, double: true, echo: { steps: 3, gain: 0.25 },
    arp: { order: [0, 1, 2, 3, 2, 1], every: 1, len: 0.9, oct: 12 },
    bass: {
      menu: 'R - - - - - - - 5 - - - - - - -',
      1: 'R - - R - - 5 - R - - R - - 5 -',
      2: 'R - . R O . 5 . R - . R O . 7 .',
      3: 'R . O R . O 5 . R . O R . O 7 O',
    },
    drums: {
      1: { k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.' },
      2: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', t: '..............x.' },
      3: { k: 'x.....x.x.x.....', s: '....x.......x..x', h: 'x.xxx.xxx.xxx.xx', t: '...........x..xx' },
    },
    A: {
      chords: [[9, 'm'], [5, 'maj'], [0, 'maj'], [7, 'maj']],
      melody: [
        '13 - - 12 - - 10 - 13 - - 15 - - 17 -', '18 - - 17 - - 15 - 13 - - - - - . .',
        '12 - - 10 - - 8 - 12 - - 15 - - 17 -', '16 - - - 14 - - - 12 - - - 9 - 10 -',
        '13 - - 12 - - 10 - 13 - - 15 - - 17 -', '18 - - 17 - - 15 - 18 - - 20 - - 22 -',
        '22 - - 21 - - 19 - 17 - - - 15 - - -', '16 - - - - - - - . . 12 . 14 . 16 .',
      ],
    },
    B: {
      chords: [[5, 'maj'], [7, 'maj'], [9, 'm'], [0, 'maj']],
      melody: [
        '15 - 15 - 18 - - - 17 - 15 - 13 - - -', '16 - 16 - 19 - - - 18 - 16 - 14 - - -',
        '17 - 17 - 20 - - - 19 - 17 - 15 - - -', '22 - - - - - - - 19 - - - 17 - - -',
        '15 - 15 - 18 - - - 17 - 15 - 13 - - -', '16 - 16 - 19 - - - 18 - 16 - 14 - - -',
        '20 - - 19 - - 17 - 20 - - 22 - - 20 -', '22 - - - - - - - . . 17 . 19 . 20 .',
      ],
    },
  },
];

// "Afterglow": a hook transcribed from a sung voice memo, grown into a song
// that goes from the feels to a banger and back. Pitch-tracked frame by
// frame (10 ms YIN frames), the singing sits on three notes, E F# G, at about
// 120 BPM in one-bar phrases, and two shapes came back over and over:
//   the chant  F# F# . F# F# . F# - E - F# - G - - -   (3-3-2 syncopation)
//   the turn   F# . F# F# F# E - . F# G - - - F# . G
// It's a sequenced song, five sections played in order and looped:
//   A  the feels: at the 120 BPM it was sung, the chant floats over the
//      bittersweet VI-III-VII-i turn (Cmaj7 G D Em9) and every hook is
//      answered by a sigh back down to E. A reverb-washed pad and a ringing
//      arpeggio breathe with the kick; the drums start half-time.
//   B  its chorus: the hook an octave up over Cmaj7 D Bm7 Em9, climbing to a
//      B7 whose C aches against it.
//   R  the build: four bars, the hook chanted up an octave then hammered on
//      F# and B over B7, a noise riser and a doubling snare roll, the mix
//      dipping under a low-pass and opening up, then a beat of silence...
//   C  the drop, at 124: the hook exactly as sung, now a four-on-the-floor
//      groove over Em C G D, the bass, toms and stabs locked to its 3-3-2.
//   D  the drop's chorus: the hook lifted an octave and walked up a step a
//      bar (F#, A, C) over Em Am7 Cmaj7 B7, doubled.
// The drop plays twice (C D C D), then falls back to the feels.
const FEELS = {
  tempo: 120, level: 0.8, lead: 0.5, staccato: 0.85, double: true, echo: { steps: 3, gain: 0.35 }, pad: true, pump: true,
  arp: { order: [0, 1, 2, 3, 2, 1], every: 2, len: 1.6, oct: 12 },
  stabs: '...x..x...x.....',
  bass: {
    menu: 'R - - - - - - - 5 - - - - - - -',
    1: 'R - - - - - R - - - R - - - - -',
    2: 'R - - R - - R - - - R - O - - -',
    3: 'R - O R - O R - R - O R - O 5 -',
  },
  drums: {
    1: { k: 'x.........x.....', s: '........x.......', h: '..x...x...x...x.' },
    2: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', t: '...x..x.........' },
    3: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', t: '...x..x....x..x.' },
  },
};
const GROOVE = {
  tempo: 124, level: 1.15, lead: 0.25, staccato: 0.8, double: true, echo: { steps: 3, gain: 0.3 }, drop: true, minTier: 3,
  stabs: '...x..x...x...x.',
  bass: {
    menu: 'R - - - - - - - 5 - - - - - - -',
    1: 'R - - R - - R - R - - R - - O -',
    2: 'R . O R . O R . R . O R . O 5 .',
    3: 'R O R R O R R O R O R R O R 5 O',
  },
  drums: {
    1: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' },
    2: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', t: '...x..x.........' },
    3: { k: 'x...x...x...x..x', s: '....x.......x.x.', h: 'xxxxxxxxxxxxxxxx', t: '...x..x....x..x.' },
  },
};
const AFTERGLOW = {
  name: 'Afterglow', key: 4, scale: 'minor', tempo: 120,
  seq: ['A', 'B', 'R', 'C', 'D', 'C', 'D'],
  A: {
    ...FEELS,
    chords: [[8, 'maj7'], [3, 'add9'], [10, 'maj'], [0, 'm9'], [8, 'maj7'], [3, 'add9'], [5, 'm7'], [11, '7']],
    melody: [
      '2 2 . 2 2 . 2 - 1 - 2 - 3 - - -', '- - - - . . . . 5 - 3 - 2 - 1 -',
      '2 2 . 2 2 . 2 - 1 - 2 - 3 - 4 -', '5 - - - - - - - . . . . . . 2 3',
      '2 . 2 2 2 1 - . 2 3 - - - 2 . 3', '- - - - 5 - - - 3 - 2 - 1 - - -',
      '2 2 . 2 2 . 2 - 1 - 2 - 3 - - -', '5 - - - 4 - - - 2 - - - 4 . 5 .',
    ],
  },
  B: {
    ...FEELS, chorus: true,
    chords: [[8, 'maj7'], [10, 'maj'], [7, 'm7'], [0, 'm9'], [8, 'maj7'], [10, 'maj'], [3, 'add9'], [11, '7']],
    melody: [
      '9 9 . 9 9 . 9 - 8 - 9 - 10 - - -', '- - - - 12 - - - 11 - 10 - 9 - - -',
      '9 9 . 9 9 . 9 - 8 - 9 - 10 - 12 -', '12 - - - - - - - 10 - 9 - 8 - - -',
      '9 9 . 9 9 . 9 - 8 - 9 - 10 - - -', '- - - - 12 - - - 13 - - - 12 - 11 -',
      '12 12 . 12 12 . 12 - 11 - 12 - 14 - - -', '13 - - - 12 - - - 11 - - - 9 - - -',
    ],
  },
  R: {
    tempo: 122, level: 0.8, levelTo: 1.2, lead: 0.25, staccato: 0.7, pad: true, pump: true, riser: true,
    arp: { order: [0, 1, 2, 3], every: 1, len: 0.8, oct: 12 },
    bass: {
      menu: 'R - - - - - - - 5 - - - - - - -',
      1: 'R . R . R . R . R . R . R . R .',
      2: 'R . R . R . R . R . R . R . R .',
      3: 'R R R R R R R R R R R R R R R R',
    },
    chords: [[8, 'maj7'], [10, 'maj'], [11, '7'], [11, '7']],
    melody: [
      '2 2 . 2 2 . 2 - 1 - 2 - 3 - - -', '9 9 . 9 9 . 9 - 8 - 9 - 10 - - -',
      '9 . 9 . 9 . 9 . 9 9 9 9 9 9 9 9', '12 12 12 12 12 12 12 12 12 12 12 12 . . . .',
    ],
  },
  C: {
    ...GROOVE,
    chords: [[0, 'm'], [8, 'maj'], [3, 'maj'], [10, 'maj']],
    melody: [
      '2 2 . 2 2 . 2 - 1 - 2 - 3 - - -', '2 2 . 2 2 . 2 - 1 - 2 - 3 - 5 -',
      '2 2 . 2 2 . 2 - 1 - 2 - 3 - - -', '2 . 2 2 2 1 - . 2 3 - - - 2 . 3',
      '2 2 . 2 2 . 2 - 1 - 2 - 3 - - -', '2 2 . 2 2 . 2 - 1 - 2 - 3 - 5 -',
      '2 2 . 2 2 . 2 - 1 - 2 - 3 - 5 -', '7 - - - 5 - - - 3 . 4 . 5 . 7 .',
    ],
  },
  D: {
    ...GROOVE, chorus: true,
    chords: [[0, 'm'], [5, 'm7'], [8, 'maj7'], [11, '7']],
    melody: [
      '9 9 . 9 9 . 9 - 8 - 9 - 10 - - -', '11 11 . 11 11 . 11 - 10 - 11 - 12 - - -',
      '13 13 . 13 13 . 13 - 12 - 13 - 14 - 12 -', '12 - - - 11 - - - 9 - - - . . . .',
      '9 9 . 9 9 . 9 - 8 - 9 - 10 - 12 -', '11 11 . 11 11 . 11 - 10 - 11 - 12 - 14 -',
      '13 13 . 13 13 . 13 - 12 - 13 - 14 - - -', '12 - - - - - - - 9 . 8 9 . 8 9 .',
    ],
  },
};

// "Overclock": built from the best 26 seconds of an earlier jam on a second
// sung voice memo: a deep chant on a steady 160 pulse that lives on three
// notes, Bb C Db (the 1, 2 and b3 of Bb dorian, the funky minor):
//   the chant  1 - - - 3 - 2 - 1 - 2 - 3 - 3 -  (Bb . Db C Bb C Db Db)
// over a Bbm7 / Eb9 vamp, then thrown an octave up over Gbmaj7 Ab Bbm.
// Played as a half-time funk shuffle (backbeat on 3, ghost-note snares,
// clav chops, a bass that walks the chord), it's a tight song that gets
// to the hype fast and stays there:
//   I  intro: the slow call it grew from, just bass, drums and an airy lead
//   V  the chant, exactly as sung, and the band answers every phrase
//   P  a pre-chorus that walks the chant up a step at a time (Gbmaj7 Ab Fm7)
//   C  the chorus: the chant an octave up, doubled, over Gbmaj7 Ab6 Bbm9
//      Eb9, the band throwing licks back in the gaps
//   K  a breakdown to bass, drums and a whisper of the chant
//   R  the build: the chant hammered up an octave over Gb7, a riser, a
//      snare roll and a breath of silence...
//   L  ...and the last chorus lands a key up, in B minor
//   H  the hype keeps going: the chant tighter and climbing, licks every bar
//   L  the key-up chorus once more, ending on its turnaround
// Then it goes round again from the chant (the intro only plays once).
const FUNK = {
  tempo: 160, lead: 0.25, staccato: 0.75, swing: 0.22, echo: { steps: 3, gain: 0.2 }, minTier: 2,
  stabs: '..x...x.x.x...x.',
  bass: {
    menu: 'R - - - - - - - 5 - - - - - - -',
    1: 'R - - R - - O - R - - 5 - 7 O -',
    2: 'R - . R . . O R - . 3 . 5 . 7 O',
    3: 'R . O R . O 7 R . R 3 . 5 O 7 O',
  },
  drums: {
    1: { k: 'x.....x...x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
    2: { k: 'x.....x...x...x.', s: '........x.......', g: '...x.......x.x..', h: 'x.x.x.x.x.x.x.x.' },
    3: { k: 'x.x...x...x...x.', s: '........x.......', g: '..x..x.....x.x.x', h: 'x.xxx.x.x.xxx.x.', t: '..............x.' },
  },
};
const VAMP = [[0, 'm7'], [0, 'm7'], [5, '9'], [5, '9']];
const CHANT = [
  '1 - - - 3 - 2 - 1 - 2 - 3 - 3 -', '1 - 1 - 3 - 3 - 1 - 2 - 3 - - -',
  '3 - 2 - 3 - - - 2 - - - 3 - 2 -', '2 - - - 3 - - - 2 - - 5 4 3 2 1',
  '1 - - - 3 - 2 - 1 - 2 - 3 - 3 -', '1 - 1 - 3 - 3 - 1 - 2 - 3 - - -',
  '3 - 3 - . . . . 1 - - - 1 - - -', '3 - - - 3 - 2 - 1 - . 8 7 5 4 3',
];
const CHORUS = {
  ...FUNK, chorus: true, double: true, minTier: 3, level: 1.1,
  chords: [[8, 'maj7'], [10, '6'], [0, 'm9'], [5, '9']],
  melody: [
    '8 - - - 10 - 9 - 8 - 9 - 10 - 10 -', '8 - 8 - 10 - 10 - 8 - 9 - 10 - - -',
    '10 - 9 - 10 - - - 9 - - - 10 - 9 -', '9 - - - 10 - - - 12 - 11 - 10 - 9 -',
    '8 - - - 10 - 9 - 8 - 9 - 10 - 10 -', '8 - 8 - 10 - 10 - 12 - 11 - 10 - - -',
    '10 - 10 - . . . . 8 - - - 8 - - -', '10 - - - 10 - 9 - 8 - 7 - 5 - 6 7',
  ],
  answer: [
    '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . 15 . 13 12',
    '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
    '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . 15 . 14 15',
    '. . . . 15 14 12 11 . . . . . . . .', '. . . . . . . . . . . . . . . .',
  ],
};
const OVERCLOCK = {
  name: 'Overclock', key: 10, scale: 'dorian', tempo: 160,
  seq: ['I', 'V', 'P', 'C', 'K', 'R', 'L', 'H', 'L'],
  loopTo: 1, // round again from the chant: the intro plays once
  I: {
    ...FUNK, lead: 0.5, echo: { steps: 3, gain: 0.35 }, mute: ['stabs', 'arp'], level: 0.85,
    chords: VAMP,
    melody: [
      '2 - - - 1 - - - - - - - . . . .', '1 - - - - - - - 2 - - - . . . .',
      '2 - - - - - - - - - - - 3 - - -', '3 - - - 2 - - - 1 - - - . . 2 3',
    ],
  },
  V: {
    ...FUNK,
    chords: VAMP,
    melody: CHANT,
    answer: [
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . 12 . 11 10',
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . 15 . 14 12',
      '. . . . 12 11 10 9 . . . . . . . .', '. . . . . . . . . . . . . . . .',
    ],
  },
  P: {
    ...FUNK, level: 1.05,
    chords: [[8, 'maj7'], [10, 'maj'], [7, 'm7'], [7, 'm7']],
    melody: [
      '3 - - - 4 - 3 - 2 - 3 - 4 - 4 -', '4 - 4 - 5 - 5 - 4 - 3 - 4 - - -',
      '5 - 4 - 5 - - - 6 - - - 7 - 6 -', '5 - - - . . . . 5 . 6 . 7 . 7 .',
    ],
  },
  C: CHORUS,
  K: {
    ...FUNK, minTier: 3, mute: ['arp', 'stabs'], level: 0.9,
    chords: [[0, 'm7'], [0, 'm7'], [5, '9'], [5, '9']],
    melody: [
      '1 - - - 3 - 2 - 1 - 2 - 3 - 3 -', '. . . . . . . . . . . . . . . .',
      '1 - 1 - 3 - 3 - 1 - 2 - 3 - - -', '. . . . . . . . . . . . . . . .',
    ],
  },
  R: {
    ...FUNK, tempo: 162, riser: true, level: 0.85, levelTo: 1.2, staccato: 0.6,
    bass: {
      menu: 'R - - - - - - - 5 - - - - - - -',
      1: 'R . R . R . R . R . R . R . R .',
      2: 'R . R . R . R . R . R . R . R .',
      3: 'R R R R R R R R R R R R R R R R',
    },
    chords: [[8, 'maj7'], [10, 'maj'], [8, '7'], [8, '7']],
    melody: [
      '8 - 8 - 10 - 10 - 8 - 9 - 10 - - -', '9 - 9 - 11 - 11 - 9 - 10 - 11 - - -',
      '10 . 10 . 10 . 10 . 10 10 10 10 10 10 10 10', '15 15 15 15 15 15 15 15 15 15 15 15 . . . .',
    ],
  },
  L: { ...CHORUS, key: 11, tempo: 162, level: 1.2 },
  // the hype keeps going: still a key up, the chant tighter and climbing,
  // the band firing licks back every bar, before the last chorus comes round
  // (it runs straight into the last chorus, no drum fill: the groove keeps
  // driving and the crash marks the downbeat)
  H: {
    ...CHORUS, key: 11, tempo: 162, level: 1.2, fill: false,
    melody: [
      '8 - 8 - 10 - 9 - 8 - 9 - 10 - 10 -', '8 - 8 - 10 - 10 - 12 - 11 - 10 - - -',
      '10 - 10 - 12 - 11 - 10 - 9 - 10 - 12 -', '13 - - - 12 - - - 10 - - - . . . .',
      '8 - 8 - 10 - 9 - 8 - 9 - 10 - 10 -', '8 - 8 - 10 - 10 - 12 - 11 - 10 - - -',
      '12 - 12 - 10 - 12 - 15 - - - 14 - 12 -', '14 - - - 12 - 11 - 12 - - - 10 . 9 .',
    ],
    answer: [
      '. . . . . . . . . . . . . . 12 14', '. . . . . . . . . . . . 15 . 13 12',
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . 15 14 12 10',
      '. . . . . . . . . . . . . . 12 14', '. . . . . . . . . . . . 15 . 14 15',
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
    ],
  },
};

// "Seaglass": chiptune city-pop for the Emerald Coast, after a clip of a
// song: 120 BPM in C major, lush sevenths and ninths on the "royal road"
// (IVmaj7 V iii7 vi, then ii7 V7 I) changing every two beats, with a dreamy
// top line that leans on E and D. A bar may hold two chords here, one per
// half bar ([[5, 'maj7'], [7, '7']] is Fmaj7 then G7).
//   I  intro: pad, arpeggio and the clip's top line as a soft bell, no drums
//   V  the verse: a syncopated hook (E . E . D) stepping down the progression
//   P  pre-chorus: climbing call-and-response to a borrowed Fm6 and G7
//   C  the chorus: royal road with its E7, the hook up high and doubled
//   B  a breakdown: drums out, the top line floating over Am9 Em7 Fmaj7
//   R  the build: notes hammered up to a riser over Ab7, a breath...
//   L  ...and the last chorus lands a half step up, in Db
// Then it goes round again from the verse (the intro plays once).
// v2 adds the rest of the clip's band: a hand clap on 2 and 4, 16th shakers
// and a syncopated kick, a funk bass that walks into each chord from a half
// step below ('A'), electric-piano comping, a glockenspiel twinkling down the
// chords, and a horn-like chord hit on the chorus downbeat.
const CITY = {
  tempo: 120, lead: 0.25, staccato: 0.8, swing: 0.08, echo: { steps: 3, gain: 0.3 }, pad: true,
  arp: { order: [0, 1, 2, 3, 2, 1], every: 2, len: 1.2, oct: 12 },
  keys: '..x..x....x..x.x',
  bass: {
    menu: 'R - - - - - - - R - - - - - - -',
    1: 'R - - . . . R A R - - . . . R A',
    2: 'R . O . . R O A R . O . . R O A',
    3: 'R . O R . R O A R . O R . R 5 A',
  },
  drums: {
    1: { k: 'x.....x...x.....', s: '................', c: '....x.......x...', h: '..x...x...x...x.', sh: 'x.x.x.x.x.x.x.x.' },
    2: { k: 'x..x..x...x..x..', s: '....x.......x...', c: '....x.......x...', g: '.......x......x.', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxX' },
    3: { k: 'x.xx...x..xx...x', s: '....x.......x...', c: '....x.......x...', g: '..x....x.x....x.', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxx', t: '..............x.' },
  },
};
// the chorus goes four on the floor, the kick skipping into the last beat
const CITY_FLOOR = {
  1: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxx' },
  2: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', g: '.........x....x.', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxX' },
  3: { k: 'x...x..xx...x.x.', s: '....x.......x...', c: '....x.......x...', g: '.........x....x.', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxx', t: '...........x..xx' },
};
const SEAGLASS_CHORUS = {
  ...CITY, chorus: true, double: true, minTier: 2, level: 1.1, hit: true, drums: CITY_FLOOR,
  keys: 'L..x..x.L..x..x.',
  chords: [
    [[5, 'maj7'], [7, '7']], [[4, '7'], [9, 'm7']], [[2, 'm7'], [7, '7']], [[0, 'maj7'], [0, '7']],
    [[5, 'maj7'], [7, '7']], [[4, '7'], [9, 'm7']], [[2, 'm7'], [7, '7']], [0, 'add9'],
  ],
  melody: [
    '10 - - 12 - - 13 - - - 12 - 11 - 9 -', '10 - - 9 - - 7 - 8 - - - 10 - 12 -',
    '11 - - 10 - - 11 - 12 - - 11 - 9 - -', '10 - - - - - - - . . . . 8 - 9 -',
    '10 - - 12 - - 13 - - - 15 - 14 - 13 -', '14 - - 16 - - 17 - 15 - - - 13 - 12 -',
    '13 - - 12 - - 11 - 12 - - 14 - - 12 -', '15 - - - - - - - 12 . 10 . 9 . 10 .',
  ],
  answer: [
    '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
    '. . . . . . . . . . . . . . . .', '. . . . . . . . 15 . 12 . . . . .',
    '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
    '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
  ],
  // the glockenspiel twinkling down each chord in eighths
  bell: [
    '6 . 3 . 1 . 3 . 7 . 5 . 2 . 5 .', '7 . 3 . 2 . 3 . 6 . 3 . 1 . 3 .',
    '4 . 2 . 6 . 2 . 4 . 2 . 7 . 5 .', '3 . 1 . 5 . 1 . 3 . . . . . . .',
    '6 . 3 . 1 . 3 . 7 . 5 . 2 . 5 .', '7 . 3 . 2 . 3 . 6 . 3 . 1 . 3 .',
    '4 . 2 . 6 . 2 . 4 . 2 . 7 . 5 .', '8 . 5 . 3 . 1 . . . . . . . . .',
  ],
};
const SEAGLASS = {
  name: 'Seaglass', key: 0, scale: 'major', tempo: 120,
  seq: ['I', 'V', 'P', 'C', 'B', 'R', 'L'],
  loopTo: 1,
  I: {
    ...CITY, lead: 0.5, mute: ['drums', 'stabs'], level: 0.85,
    chords: [[[5, 'maj7'], [7, 'maj']], [[4, 'm7'], [9, 'm9']], [[2, 'm7'], [7, 'maj']], [0, 'add9']],
    melody: [
      '10 - - - - - 10 - 9 - - - - - - -', '9 - - - - - 9 - 10 - - - 8 - - -',
      '8 - - - - - 9 - 9 - - - - - . .', '10 - - - - - - - . . 5 . 6 . 7 .',
    ],
  },
  V: {
    ...CITY,
    chords: [
      [[5, 'maj7'], [7, 'maj']], [[4, 'm7'], [9, 'm7']], [[2, 'm7'], [7, '7']], [0, 'maj7'],
      [[5, 'maj7'], [7, 'maj']], [[4, 'm7'], [9, '7']], [[2, 'm7'], [7, '7']], [[0, 'maj7'], [0, '7']],
    ],
    melody: [
      '10 - . 10 - . 9 - - - 9 - 7 - - -', '9 - . 9 - . 7 - - - 8 - 6 - - -',
      '8 - . 8 - . 6 - 7 - 9 - 11 - 9 -', '10 - - - - - - - . . 8 . 9 . 10 .',
      '10 - . 10 - . 9 - - - 9 - 7 - - -', '9 - . 9 - . 7 - 6 - - - 5 - 6 -',
      '11 - . 11 - . 9 - 8 - 9 - 11 - 12 -', '10 - - - - - 8 - - - . . . . . .',
    ],
    bell: [
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . . .', '. . . . 5 . 3 . . . . . . . . .',
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . 5 . 3 . 1 . .',
    ],
  },
  P: {
    ...CITY, level: 1.05,
    chords: [[2, 'm9'], [4, 'm7'], [5, 'maj9'], [[5, 'm6'], [7, '7']]],
    melody: [
      '6 - 8 - 9 - - - 8 - 9 - 10 - - -', '7 - 9 - 10 - - - 9 - 10 - 12 - - -',
      '8 - 10 - 12 - - - 11 - 12 - 13 - 12 -', '11 - - - 9 - 8 - 7 - - - 9 - 11 -',
    ],
  },
  C: SEAGLASS_CHORUS,
  B: {
    ...CITY, mute: ['drums', 'stabs'], level: 0.85, echo: { steps: 3, gain: 0.4 },
    chords: [[9, 'm9'], [4, 'm7'], [5, 'maj7'], [[2, 'm7'], [7, '7']]],
    melody: [
      '8 - - - - - 8 - 9 - - - 10 - - -', '9 - - - - - 9 - 7 - - - 5 - - -',
      '10 - - - - - 10 - 12 - - - 14 - - -', '13 - - - - - - - 12 - - - 11 - - -',
    ],
    bell: [
      '6 . 1 . 3 . 7 . . . . . . . . .', '7 . 3 . 5 . 2 . . . . . . . . .',
      '6 . 3 . 1 . 3 . . . . . . . . .', '4 . 6 . . . . . 5 . 7 . 2 . . .',
    ],
  },
  R: {
    ...CITY, riser: true, level: 0.85, levelTo: 1.2, staccato: 0.6, tempo: 122,
    bass: {
      menu: 'R - - - - - - - R - - - - - - -',
      1: 'R . R . R . R . R . R . R . R .',
      2: 'R . R . R . R . R . R . R . R .',
      3: 'R R R R R R R R R R R R R R R R',
    },
    chords: [[[2, 'm7'], [7, '7']], [[4, 'm7'], [9, '7']], [[5, 'maj7'], [7, '7']], [8, '7']],
    melody: [
      '9 - 9 - 11 - 11 - 12 - 12 - 14 - 14 -', '10 - 10 - 12 - 12 - 13 - 13 - 14 - 14 -',
      '13 . 13 . 13 . 13 . 14 . 14 . 14 14 14 14', '15 15 15 15 15 15 15 15 15 15 15 15 . . . .',
    ],
  },
  L: { ...SEAGLASS_CHORUS, key: 1, tempo: 122, level: 1.2 },
};

// "Mirage": a sunny desert dembow for the Golden Canyon. A phrygian dominant
// (the snake charmer's scale, a flat second leaning on the root) kept bright:
// major chords throughout, climbing the triumphant bVI-bVII-I cadence (F G
// A) and the bII-I turn (Bb A), at 112 over a reggaeton-style dembow: kick
// on the beat, clap and keys on the 3-3-2, 16th shakers, a tresillo bass that
// walks into each chord. The hook coils round a note with quick turns.
// It gets to the drop fast: a four-bar call, a four-bar build, then the
// sandstorm (the chorus, four on the floor). After that it plays its verse,
// chorus and breakdown, builds again, drops again, and goes round from the
// verse.
// "Seaglass Original": Seaglass as first written, before the rest of the
// clip's band joined: the same song (melody, chords, sections, tempo), with
// three-note pulse stabs instead of the electric piano, a kick that goes four
// on the floor as the game heats up, 16th hats, a plain bass, a snare instead
// of the clap, and no shakers, glockenspiel or chorus hit. Kept to compare;
// it isn't one of the map's songs.
const CITY_ORIGINAL = {
  stabs: '..x..x....x..x..', keys: undefined, bell: undefined, hit: false,
  bass: {
    menu: 'R - - - - - - - R - - - - - - -',
    1: 'R - - . . . R - R - - . . . R -',
    2: 'R . O . . R O . R . O . . R O .',
    3: 'R . O R . R O . R . O R . R O 5',
  },
  drums: {
    1: { k: 'x.....x...x.....', s: '....x.......x...', h: '..x...x...x...x.' },
    2: { k: 'x...x...x...x...', s: '....x.......x...', g: '.......x......x.', h: '..x...x...x...x.' },
    3: { k: 'x...x...x...x...', s: '....x.......x...', g: '..x....x.x....x.', h: 'xxxxxxxxxxxxxxxx', t: '..............x.' },
  },
};
export const SEAGLASS_ORIGINAL = { ...SEAGLASS, name: 'Seaglass Original' };
for (const k of new Set(SEAGLASS.seq)) {
  // (the build keeps its own driving bass)
  SEAGLASS_ORIGINAL[k] = { ...SEAGLASS[k], ...CITY_ORIGINAL, ...(k === 'R' ? { bass: SEAGLASS.R.bass } : {}) };
}

// the same drum pattern whatever the intensity
const allTiers = (d) => ({ 1: d, 2: d, 3: d });
const DUNE = {
  tempo: 112, lead: 0.25, staccato: 0.75, echo: { steps: 3, gain: 0.3 }, clap: 0.6,
  arp: { order: [0, 2, 1, 2], every: 2, len: 0.6, oct: 12 },
  keys: '...x..x....x..x.',
  bass: {
    menu: 'R - - - - - - - R - - - - - - -',
    1: 'R - - R - - R - R - - R - - R A',
    2: 'R . . R . O R . R . . R . O R A',
    3: 'R . O R . O R O R . O R . O 5 A',
  },
  drums: {
    1: { k: 'x.......x.......', s: '................', c: '...x..x....x..x.', h: '................', sh: 'x.x.x.x.x.x.x.x.' },
    2: { k: 'x...x...x...x...', s: '................', c: '...x..x....x..x.', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxX' },
    3: { k: 'x...x...x...x...', s: '......x.......x.', c: '...x..x....x..x.', g: '.x.......x......', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxx', t: '..............xx' },
  },
};
const MIRAGE_CHORUS = {
  ...DUNE, chorus: true, double: true, hit: true, minTier: 3, level: 1.1,
  chords: [[8, 'maj'], [10, 'maj'], [0, 'maj'], [0, 'maj'], [8, 'maj'], [10, 'maj'], [1, 'maj'], [0, 'maj']],
  melody: [
    '8 - - 13 - - 15 - - - 13 - 15 - - -', '7 - - 11 - - 14 - - - 11 - 14 - - -',
    '15 - - 12 - - 10 - 12 - 15 - 17 15 12 -', '15 - - - - - - - 12 . 15 . 17 - - -',
    '15 - - 13 - - 8 - - - 13 - 15 - - -', '14 - - 11 - - 7 - - - 11 - 14 - - -',
    '13 - 14 13 11 - 9 - 11 - 13 - 16 - - -', '15 - - - - - - - 12 . 10 . 9 . 8 .',
  ],
  bell: [
    '6 . 8 . 13 . 8 . 6 . 8 . 13 . 8 .', '7 . 11 . 14 . 11 . 7 . 11 . 14 . 11 .',
    '1 . 3 . 5 . 3 . 1 . 3 . 5 . 8 .', '5 . 3 . 1 . . . . . . . . . . .',
    '6 . 8 . 13 . 8 . 6 . 8 . 13 . 8 .', '7 . 11 . 14 . 11 . 7 . 11 . 14 . 11 .',
    '2 . 4 . 6 . 4 . 2 . 4 . 6 . 9 .', '8 . 5 . 3 . 1 . . . . . . . . .',
  ],
};
const MIRAGE = {
  name: 'Mirage', key: 9, scale: 'phrygdom', tempo: 112,
  seq: ['I', 'R', 'S', 'V', 'C', 'K', 'R', 'S'],
  loopTo: 3,
  I: {
    ...DUNE, lead: 0.5, mute: ['stabs'], level: 0.85,
    drums: allTiers({ k: 'x...x...x...x...', s: '................', c: '................', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxx' }),
    chords: [[0, 'maj'], [1, 'maj'], [10, 'maj'], [0, 'maj']],
    melody: [
      '8 - - - - - - - 9 8 - - - - - -', '9 - - - - - - - 11 9 - - - - - -',
      '7 - - - - - - - 11 7 - - - - - -', '8 - - - - - - - . . 10 . 11 . 12 .',
    ],
  },
  V: {
    ...DUNE,
    chords: [[0, 'maj'], [1, 'maj'], [10, 'maj'], [0, 'maj'], [0, 'maj'], [1, 'maj'], [[8, 'maj'], [10, 'maj']], [0, 'maj']],
    melody: [
      '12 - 13 12 10 - - - 12 - 10 9 8 - - -', '13 - 14 13 11 - - - 13 - 11 10 9 - - -',
      '14 - 15 14 11 - - - 7 - 11 - 14 - - -', '15 - - - 12 - - - 10 - 12 - 10 9 8 -',
      '12 - 13 12 10 - - - 12 - 10 9 8 - - -', '13 - 14 13 11 - - - 13 - 11 10 9 - - -',
      '13 - 15 - 13 - 8 - 14 - 11 - 7 - 11 -', '8 - - - - - - - . . 10 . 11 . 12 .',
    ],
    bell: [
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . . .', '. . . . 5 . 3 . . . . . . . . .',
    ],
  },
  C: MIRAGE_CHORUS,
  K: {
    ...DUNE, mute: ['arp', 'stabs'], level: 0.9,
    drums: allTiers({ k: 'x.......x.......', s: '................', c: '...x..x....x..x.', h: '................', sh: '..x...x...x...x.' }),
    minTier: 1,
    chords: [[0, 'maj'], [1, 'maj'], [0, 'maj'], [1, 'maj']],
    melody: [
      '12 - 13 12 10 - - - . . . . . . . .', '. . . . . . . . 13 - 14 13 11 - - -',
      '12 - 13 12 10 - - - . . . . . . . .', '. . . . . . . . 13 - 14 13 16 - - -',
    ],
  },
  R: {
    ...DUNE, riser: true, level: 0.85, levelTo: 1.2, staccato: 0.6,
    bass: {
      menu: 'R - - - - - - - R - - - - - - -',
      1: 'R . R . R . R . R . R . R . R .',
      2: 'R . R . R . R . R . R . R . R .',
      3: 'R R R R R R R R R R R R R R R R',
    },
    chords: [[8, 'maj'], [10, 'maj'], [1, 'maj'], [1, 'maj']],
    melody: [
      '8 - 8 - 13 - 13 - 15 - 15 - 13 - 13 -', '11 - 11 - 14 - 14 - 18 - 18 - 14 - 14 -',
      '13 . 13 . 13 . 13 . 16 . 16 . 16 16 16 16', '18 18 18 18 18 18 18 18 18 18 18 18 . . . .',
    ],
  },
  // the sandstorm: four on the floor under the dembow clap
  S: {
    ...MIRAGE_CHORUS, tempo: 118, level: 1.2,
    drums: {
      1: { k: 'x...x...x...x...', s: '....x.......x...', c: '...x..x....x..x.', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxx' },
      2: { k: 'x...x...x...x...', s: '....x.......x...', c: '...x..x....x..x.', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxx' },
      3: { k: 'x...x...x...x..x', s: '....x.......x...', c: '...x..x....x..x.', g: '.x.......x......', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxx', t: '..............xx' },
    },
  },
};

// "Paper Planes": an upbeat neo-soul glide for the Sunset Heavens, in Eb at
// 112 with a light shuffle. Lush chords that slide by half steps (Abmaj7 G7
// Cm7 Bbm7 Eb7), a clap on 2 and 4, swung shakers and electric-piano
// chords, a bass that walks into every change, and a glockenspiel catching
// the light. The verse chats and glides; the chorus soars on Abmaj9 Bb6 Gm7
// Cm9 Fm9 Bb7, with a band answering in the gaps.
//   I  keys and bells, no drums
//   V  the verse
//   C  the chorus
//   G  the glide: drums out, floating over Abmaj7 Dbmaj7 (a borrowed chord)
//   R  a build over Fm7 Bb7 to a B7 that tips the key...
//   L  ...so the last chorus lands a half step up, in E
const GLIDE = {
  tempo: 112, lead: 0.25, leadOct: -12, staccato: 0.75, swing: 0.12, echo: { steps: 3, gain: 0.3 }, pad: true, clap: 0.6,
  arp: { order: [0, 1, 2, 3, 2, 1], every: 1, len: 0.8, oct: 12 },
  keys: '..x..x.x..x..x.x',
  bass: {
    menu: 'R - - - - - - - 5 - - - - - - -',
    1: 'R - . O . . 5 A R - . O . . 5 A',
    2: 'R . O R . O 5 A R . O R . O 5 A',
    3: 'R O . R O . 5 A R O . R O 3 5 A',
  },
  drums: {
    1: { k: 'x.....x...x.....', s: '................', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', sh: 'xxxxxxxxxxxxxxxx' },
    2: { k: 'x.....x.x.x.....', s: '....x.......x...', c: '....x.......x...', g: '.......x.....x..', h: 'x.x.x.x.x.x.x.x.', sh: 'xxxxxxxxxxxxxxxX' },
    3: { k: 'x..x..x.x.x..x..', s: '....x.......x...', c: '....x.......x...', g: '..x....x.....x.x', h: 'x.x.x.x.x.x.x.x.', sh: 'xxxxxxxxxxxxxxxx', t: '..............xx' },
  },
};
// the chorus bounces four on the floor
const GLIDE_FLOOR = {
  1: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxx' },
  2: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', g: '.......x......x.', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxX' },
  3: { k: 'x...x...x..xx...', s: '....x.......x...', c: '....x.......x...', g: '.......x......x.', h: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxx', t: '..............xx' },
};
const PLANES_CHORUS = {
  ...GLIDE, chorus: true, double: true, hit: true, minTier: 2, level: 1.1, drums: GLIDE_FLOOR,
  chords: [[5, 'maj9'], [7, '6'], [4, 'm7'], [9, 'm9'], [2, 'm9'], [7, '7'], [0, 'maj7'], [0, 'maj7']],
  melody: [
    '15 - - 13 - - 12 - - - 13 - 15 - - 17', '- - - 16 - - 14 - - - 12 - 14 - - -',
    '10 - - 12 - - 14 - - - 16 - 17 - - -', '15 - - - 14 - 13 - - - - - . . 15 16',
    '16 - - 15 - - 13 - - - 11 - 13 - - 16', '- - - 14 - - 12 - - - 11 - 9 - - -',
    '10 - - 12 - - 15 - - - 14 - 15 - 17 -', '15 - - - - - - - . . 12 . 13 . 14 .',
  ],
  answer: [
    '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
    '. . . . . . . . . . . . . . . .', '. . . . . . . . 17 15 13 . . . . .',
    '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
    '. . . . . . . . . . . . . . . .', '. . . . 17 . 15 . . . . . . . . .',
  ],
  bell: [
    '. . . . . . . . 3 . 6 . 8 . . .', '. . . . . . . . 2 . 5 . 7 . . .',
    '. . . . . . . . 3 . 5 . 7 . . .', '. . . . . . . . . . . . . . . .',
    '. . . . . . . . 4 . 6 . 8 . . .', '. . . . . . . . 2 . 4 . 5 . . .',
    '. . . . . . . . 3 . 5 . 8 . . .', '. . . . . . . . . . . . . . . .',
  ],
};
const PAPER_PLANES = {
  name: 'Paper Planes', key: 3, scale: 'major', tempo: 112,
  seq: ['I', 'V', 'C', 'G', 'R', 'L'],
  loopTo: 1,
  I: {
    ...GLIDE, mute: ['drums'], level: 0.85,
    chords: [[5, 'maj7'], [4, '7'], [9, 'm7'], [[7, 'm7'], [0, '7']]],
    melody: [
      '. . . . . . . . 10 - 11 - 13 - - -', '14 - - - 10 - - - 9 - - - 7 - - -',
      '13 - - - 12 - - - 10 - - - . . . .', '12 - - - 11 - - - 10 - - - . . . .',
    ],
    bell: [
      '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . 3 . 6 .', '. . . . . . . . . . . . 3 . 5 .',
    ],
  },
  V: {
    ...GLIDE,
    chords: [[5, 'maj7'], [4, '7'], [9, 'm7'], [[7, 'm7'], [0, '7']], [5, 'maj7'], [4, '7'], [9, 'm7'], [[2, 'm7'], [7, '7']]],
    melody: [
      '10 - 11 - 13 - - - 11 - 10 - 8 - - -', '10 - 9 - 7 - - - 9 - 10 - 14 - - -',
      '13 - 12 - 10 - - - 12 - 13 - 15 - - -', '12 - 11 - 9 - - - 8 - 10 - 12 - - -',
      '10 - 11 - 13 - - - 11 - 10 - 8 - - -', '10 - 9 - 7 - 9 - 10 - - - . . . .',
      '13 - 15 - 17 - - - 15 - 13 - 12 - - -', '11 - 9 - 13 - - - 12 - - - 14 - 12 -',
    ],
  },
  C: PLANES_CHORUS,
  G: {
    ...GLIDE, mute: ['drums'], level: 0.85, echo: { steps: 3, gain: 0.4 },
    chords: [[5, 'maj7'], [10, 'maj7'], [5, 'maj7'], [7, '7']],
    melody: [
      '13 - - - - - 11 - 10 - - - 8 - - -', '9 - - - - - 11 - 13 - - - 15 - - -',
      '17 - - - - - 15 - 13 - - - 11 - - -', '12 - - - - - - - 14 - - - 16 - - -',
    ],
    bell: [
      '6 . 8 . 10 . 11 . . . . . . . . .', '2 . 4 . 6 . 8 . . . . . . . . .',
      '10 . 8 . 6 . 4 . . . . . . . . .', '5 . 7 . 9 . 11 . . . . . . . . .',
    ],
  },
  R: {
    ...GLIDE, riser: true, swing: 0.06, level: 0.85, levelTo: 1.2, staccato: 0.6,
    bass: {
      menu: 'R - - - - - - - R - - - - - - -',
      1: 'R . R . R . R . R . R . R . R .',
      2: 'R . R . R . R . R . R . R . R .',
      3: 'R R R R R R R R R R R R R R R R',
    },
    chords: [[2, 'm7'], [7, '7'], [[2, 'm7'], [7, '7']], [8, '7']],
    melody: [
      '9 - 9 - 11 - 11 - 13 - 13 - 15 - 15 -', '12 - 12 - 14 - 14 - 16 - 16 - 18 - 18 -',
      '13 . 13 . 13 . 13 . 14 . 14 . 14 14 14 14', '15 15 15 15 15 15 15 15 15 15 15 15 . . . .',
    ],
  },
  L: { ...PLANES_CHORUS, key: 4, tempo: 116, level: 1.2 },
};

// Every map's songs: the original, its alternate, and a third (Seaglass,
// Mirage, Afterglow, Overclock, Paper Planes; the Galactic Core has two).
export const TRACKS = SONGS.map((s, i) => [s, ALT_SONGS[i]]);
TRACKS[0].push(SEAGLASS);
TRACKS[1].push(MIRAGE);
TRACKS[2].push(AFTERGLOW);
TRACKS[3].push(OVERCLOCK);
TRACKS[4].push(PAPER_PLANES);

const SONG_STARTS = [0, 3, 6, 9, 12, 14]; // first level of each zone

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

for (const s of [...SONGS, ...ALT_SONGS, SEAGLASS, SEAGLASS_ORIGINAL, MIRAGE, AFTERGLOW, OVERCLOCK, PAPER_PLANES]) {
  s.root = s.key > 5 ? 48 + s.key : 60 + s.key;
  for (const k of new Set(s.seq || ['A', 'B'])) {
    const sec = s[k];
    sec.notes = parseMelody(sec.melody);
    sec.bars = sec.melody.length;
    if (sec.answer) sec.answerNotes = parseMelody(sec.answer);
    if (sec.bell) sec.bellNotes = parseMelody(sec.bell);
    // a sequenced song's sections carry their own style over the song's key
    // (a section may change key: a lift for a last chorus)
    if (s.seq) {
      const key = sec.key ?? s.key;
      sec.style = { name: s.name, scale: s.scale, ...sec, key, root: key > 5 ? 48 + key : 60 + key };
    }
  }
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
    // (a resume outside a real gesture is refused: fine, the next one retries)
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
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
    // separate low-pass for slow-motion moments (pause/death use musicFilter)
    this.slowFilter = c.createBiquadFilter();
    this.slowFilter.type = 'lowpass';
    this.slowFilter.frequency.value = 20000;
    // per-section loudness (a sequenced song's quiet verse, its build's
    // crescendo, its drop); 1 for every other song
    this.sectionGain = c.createGain();
    this.music.connect(this.sectionGain).connect(this.musicFilter).connect(this.slowFilter).connect(this.musicFade).connect(this.master);

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
    for (const name of ['bass', 'arp', 'drums', 'lead', 'stabs', 'counter', 'sparkle', 'pad']) {
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(this.music);
      this.layers[name] = { gain: g, level: 0, target: 0 };
    }
    // sidechain pump: songs with `pump` play their pad and arp through these,
    // which dip on every kick and swell back
    this.pumps = {};
    for (const name of ['pad', 'arp']) {
      this.pumps[name] = c.createGain();
      this.pumps[name].connect(this.layers[name].gain);
    }
    this.layers.lead.gain.connect(this.delay);
    // the lead's reverb send skips the music bus, so it carries its own copy
    // of the music volume (otherwise music at 0 still leaks through the room)
    this.musicSend = c.createGain();
    this.layers.lead.gain.connect(this.musicSend).connect(this.reverb);
    this.layers.pad.gain.connect(this.musicSend);
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
    this.musicSend.gain.value = this.musicVolume;
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

  // a slow-mo tile: the same soft bwoom, with a bell
  boost() {
    this.voice(150, { wave: 'sine', dur: 0.45, gain: 0.14, slide: 0.45, attack: 0.02, release: 0.3 });
    this.voice(midi(84), { wave: 0.5, at: 0.05, dur: 0.12, gain: 0.07 });
  }

  turn() {
    this.voice(midi(96), { wave: 0.125, dur: 0.025, gain: 0.025 });
  }

  // Slow-mo kicks in: a soft, deep "bwoom" under a pair of gentle chimes, like
  // the world taking a breath.
  rushStart() {
    this.voice(150, { wave: 'sine', dur: 0.45, gain: 0.16, slide: 0.45, attack: 0.02, release: 0.3 });
    this.voice(midi(81), { wave: 'triangle', at: 0.02, dur: 0.5, gain: 0.035, attack: 0.01, release: 0.45 });
    this.voice(midi(76), { wave: 'triangle', at: 0.09, dur: 0.6, gain: 0.03, attack: 0.01, release: 0.55 });
    this.noiseHit({ dur: 0.35, gain: 0.025, freq: 900, sweep: 0.5, q: 0.7, type: 'lowpass' });
  }

  // ...and lets go: a quick, light lift back up to speed.
  rushEnd() {
    this.voice(90, { wave: 'sine', dur: 0.16, gain: 0.07, slide: 1.8, attack: 0.01, release: 0.1 });
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

  // Flying level with the apple: a soft, bright double ping.
  altLevel() {
    this.voice(midi(86), { wave: 'sine', dur: 0.08, gain: 0.06 });
    this.voice(midi(93), { wave: 'sine', at: 0.07, dur: 0.16, gain: 0.05, release: 0.12 });
  }

  // ---------------------------------------------------------------- Galactic Core
  // Charging up for hyperspeed: a whine that climbs and an engine that builds.
  warpCharge() {
    this.voice(180, { wave: 'sine', dur: 1.75, gain: 0.06, slide: 9, attack: 1.4, release: 0.05 });
    this.voice(90, { wave: 'sawtooth', dur: 1.75, gain: 0.04, slide: 3, attack: 1.2, release: 0.05, vibrato: 0.03 });
    this.voice(45, { wave: 'sine', dur: 1.75, gain: 0.25, slide: 1.6, attack: 1.5, release: 0.05 });
    this.noiseHit({ dur: 1.75, gain: 0.05, freq: 400, sweep: 10, q: 3 });
    [0, 5, 7, 12, 17, 19, 24].forEach((n, i) => this.voice(midi(62 + n), { wave: 0.125, at: 0.3 + i * 0.2, dur: 0.14, gain: 0.035 + i * 0.006 }));
  }

  // Hyperspeed: the jump's crack, then a roaring riser for the whole tunnel.
  warp() {
    this.noiseHit({ dur: 0.5, gain: 0.35, freq: 5000, sweep: 0.1, q: 0.5 });
    this.voice(110, { wave: 'sine', dur: 0.9, gain: 0.45, slide: 0.35, release: 0.7 });
    this.noiseHit({ dur: 4.7, gain: 0.2, freq: 150, sweep: 40, q: 1.1 });
    this.noiseHit({ dur: 4.7, gain: 0.05, freq: 3500, type: 'highpass', sweep: 2.5 });
    this.voice(55, { wave: 'sawtooth', dur: 4.7, gain: 0.05, slide: 16, attack: 0.6, release: 0.2 });
    this.voice(82.4, { wave: 'sawtooth', dur: 4.7, gain: 0.04, slide: 16, attack: 0.6, release: 0.2 });
    this.voice(41.2, { wave: 'sine', dur: 4.7, gain: 0.25, slide: 3, attack: 1.2, release: 0.2 });
    [0, 7, 12, 19, 24, 31, 36, 43].forEach((n, i) => this.voice(midi(50 + n), { wave: 0.25, at: 0.25 + i * 0.52, dur: 0.45, gain: 0.05 }));
  }

  // Dropping out of hyperspeed: a deep boom, then a cold, wide chord.
  dropOut() {
    this.voice(70, { wave: 'sine', dur: 2.4, gain: 0.5, slide: 0.3, release: 2 });
    this.noiseHit({ dur: 2.6, gain: 0.28, freq: 1200, type: 'lowpass', sweep: 0.06 });
    this.noiseHit({ dur: 0.3, gain: 0.25, freq: 4000, type: 'highpass' });
    [0, 7, 12, 15, 19, 26].forEach((n, i) => this.voice(midi(50 + n), { wave: 'sine', at: 0.5 + i * 0.14, dur: 3.2, gain: 0.045, attack: 0.4, release: 2.4, vibrato: 0.006 }));
  }

  // Cells are doomed: a crackle and a thin, rising whine as the black hole
  // starts to pull on them (rate-limited, apples can come quickly).
  // (kept soft and lower-pitched: it repeats all through the music)
  doomWarn(n = 3) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (now - (this.lastDoom || -9) < 0.6) return;
    this.lastDoom = now;
    for (let i = 0; i < Math.min(3, n); i++) this.noiseHit({ at: i * 0.07, dur: 0.04, gain: 0.018, freq: 2400 + i * 500, q: 2.5 });
    this.voice(midi(76), { wave: 'sine', at: 0.05, dur: 1.0, gain: 0.008, slide: 1.25, attack: 0.8, release: 0.15, vibrato: 0.03 });
  }

  // Tiles break off and fall in: a falling, filtered whoosh, and a soft deep
  // thud a moment later as the light hits the horizon.
  suckIn(n = 1) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    // (one per collapse, soft and darker, so it sits under the music)
    if (now - (this.lastSuck || -9) < 0.5) return;
    this.lastSuck = now;
    const g = Math.min(1, 0.6 + n * 0.1);
    this.noiseHit({ dur: 0.8, gain: 0.035 * g, freq: 1600, sweep: 0.15, q: 1 });
    this.voice(midi(72), { wave: 'sine', dur: 0.7, gain: 0.012 * g, slide: 0.3, release: 0.3 });
    this.voice(55, { wave: 'sine', at: 2.3, dur: 0.7, gain: 0.08 * g, slide: 0.6, attack: 0.03, release: 0.5 });
  }

  // The black hole calms down: a deep, slow boom and a soft falling chord.
  calm() {
    this.voice(48, { wave: 'sine', dur: 2.6, gain: 0.55, slide: 0.5, release: 2.2 });
    this.noiseHit({ dur: 2.2, gain: 0.22, freq: 1800, type: 'lowpass', sweep: 0.08 });
    [62, 69, 74, 77].forEach((n, i) => this.voice(midi(n), { wave: 'sine', at: 0.15 + i * 0.09, dur: 2.4, gain: 0.04, slide: 0.94, attack: 0.08, release: 1.8, vibrato: 0.006 }));
  }

  // The last cell: everything goes quiet and the core draws itself in.
  finaleGather() {
    // (about as long as everything takes to pour into the black hole)
    this.voice(32.7, { wave: 'sine', dur: 3.6, gain: 0.45, slide: 1.8, attack: 3.2, release: 0.05 });
    this.voice(65.4, { wave: 'sawtooth', dur: 3.6, gain: 0.04, slide: 2.5, attack: 3.3, release: 0.05 });
    this.noiseHit({ dur: 3.5, gain: 0.05, freq: 300, sweep: 12, q: 2 });
    this.noiseHit({ at: 0.4, dur: 2.6, gain: 0.08, freq: 4000, sweep: 0.06, q: 1 });
    [0, 12, 24].forEach((n) => this.voice(midi(86 + n), { wave: 'sine', dur: 3.5, gain: 0.02, attack: 3.3, release: 0.05, vibrato: 0.02 }));
  }

  // The eruption: a huge boom and a triumphant major chord that rings out.
  finaleBoom() {
    this.voice(90, { wave: 'sine', dur: 4.5, gain: 0.7, slide: 0.22, release: 3.5 });
    this.noiseHit({ dur: 5, gain: 0.5, freq: 2500, type: 'lowpass', sweep: 0.05, q: 0.5 });
    this.noiseHit({ dur: 3.2, gain: 0.18, freq: 6000, type: 'highpass' });
    [38, 50, 57, 62, 66, 69, 74, 78, 81].forEach((n, i) => this.voice(midi(n), { wave: i < 3 ? 'sawtooth' : 0.25, dur: 6.5, gain: i < 2 ? 0.06 : 0.04, attack: 0.02 + i * 0.03, release: 4.5, vibrato: 0.005 }));
    [0, 4, 7, 12, 16, 19, 24, 28, 31, 36].forEach((n, i) => this.voice(midi(74 + n), { wave: 0.125, at: 0.3 + i * 0.07, dur: 0.5, gain: 0.05, release: 0.4 }));
  }

  // Victory: a slow, rising chord progression that resolves to D major.
  victory() {
    const chords = [[46, 53, 58, 62, 65], [48, 55, 60, 64, 67], [45, 52, 57, 61, 64], [50, 57, 62, 66, 69, 74]];
    chords.forEach((ch, i) => {
      const at = i * 1.5;
      const last = i === chords.length - 1;
      ch.forEach((n, j) => this.voice(midi(n), { wave: j === 0 ? 'sawtooth' : 'sine', at, dur: last ? 5 : 1.7, gain: j === 0 ? 0.03 : 0.04, attack: 0.25, release: last ? 3.5 : 0.6, vibrato: 0.006 }));
    });
    [74, 78, 81, 86].forEach((n, i) => this.voice(midi(n), { wave: 0.25, at: 4.5 + i * 0.12, dur: 2.6, gain: 0.04, release: 2, vibrato: 0.01 }));
    this.noiseHit({ at: 4.4, dur: 2.5, gain: 0.07, freq: 8000, type: 'highpass' });
  }

  // ---------------------------------------------------------------- bonus level sfx
  // A big stage light switching on: a heavy clunk and a hum.
  lightOn(big = true) {
    this.noiseHit({ dur: 0.09, gain: big ? 0.32 : 0.22, freq: 900, q: 1.4 });
    this.voice(big ? 70 : 90, { dur: 0.22, gain: big ? 0.4 : 0.28, wave: 'sine', slide: 0.6 });
    this.voice(big ? 110 : 140, { at: 0.02, dur: 0.6, gain: 0.05, wave: 0.5, release: 0.5 });
  }

  // The glow-in-the-dark rim charging up.
  rimOn() {
    this.voice(midi(60), { dur: 0.6, gain: 0.06, wave: 0.125, slide: 4, release: 0.3 });
    this.noiseHit({ dur: 0.5, gain: 0.05, freq: 3000, type: 'bandpass', q: 3, sweep: 3 });
  }

  // A golden apple: a bright bell that climbs with each one in the dark.
  goldEat(n = 0, pan = 0) {
    const b = 79 + Math.min(n, 12);
    this.voice(midi(b), { wave: 0.25, dur: 0.08, gain: 0.15, pan });
    this.voice(midi(b + 7), { wave: 0.5, at: 0.05, dur: 0.25, gain: 0.13, release: 0.2, pan });
    this.voice(midi(b + 12), { wave: 'sine', at: 0.05, dur: 0.45, gain: 0.08, release: 0.4, pan });
    this.voice(midi(b + 19), { wave: 'sine', at: 0.1, dur: 0.4, gain: 0.04, release: 0.35, pan });
  }

  // A firework: a whistle, then a crackling pop.
  firework(pan = 0, far = false) {
    const g = far ? 0.5 : 1;
    this.voice(midi(84), { dur: 0.25, gain: 0.025 * g, wave: 'sine', slide: 1.8, pan });
    this.noiseHit({ at: 0.22, dur: 0.35, gain: 0.16 * g, freq: 700, type: 'lowpass', sweep: 0.4 });
    for (let i = 0; i < 5; i++) this.noiseHit({ at: 0.3 + i * 0.05 + Math.random() * 0.04, dur: 0.04, gain: 0.05 * g, freq: 5000 + Math.random() * 3000, type: 'highpass' });
  }

  // The party explosion.
  partyBoom() {
    this.noiseHit({ dur: 1.4, gain: 0.4, freq: 1200, type: 'lowpass', sweep: 0.08 });
    this.voice(90, { dur: 1.1, gain: 0.5, wave: 'sine', slide: 0.3, release: 0.8 });
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.voice(midi(72 + n), { at: 0.05 + i * 0.03, dur: 0.5, gain: 0.07, wave: 0.25, release: 0.4 }));
  }

  // ---------------------------------------------------------------- music
  // custom: a track object with its own scheduler (the bonus level's song);
  // it plays through the same music bus, so pause, slow motion, volume and
  // fades all work on it the same way.
  startMusic({ menu = false, custom = null } = {}) {
    if (!this.ctx) return;
    this.state.menu = menu;
    const was = this.custom;
    this.custom = custom;
    if (custom) {
      clearTimeout(this.stopTimer);
      const now = this.ctx.currentTime;
      this.musicFade.gain.cancelScheduledValues(now);
      this.musicFade.gain.setTargetAtTime(1, now, 0.05);
      this.musicFilter.frequency.cancelScheduledValues(now);
      this.musicFilter.frequency.setTargetAtTime(18000, now, 0.05);
      // the map song's layers go quiet; the custom track brings its own
      for (const L of Object.values(this.layers)) {
        L.target = 0;
        L.gain.gain.cancelScheduledValues(now);
        L.gain.gain.setTargetAtTime(0, now, 0.05);
      }
      this.musicOn = true;
      custom.start(now + 0.08);
      clearInterval(this.timer);
      this.timer = setInterval(() => this.schedule(), 25);
      return;
    }
    if (was) {
      // back from a custom track: the map song starts over cleanly
      was.stop();
      this.musicOn = false;
    }
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
    this.pickSong();
    this.section = this.song.seq ? this.song.seq[0] : 'A'; // a sequenced song starts on its first section
    this.seqIdx = 0;
    this.bar = 0;
    this.step = 0;
    this.tempo = menu ? 112 : this.song.tempo;
    this.fill = false;
    this.pendingZone = null;
    this.nextTime = now + 0.06;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  // Each map has two or more songs; one is picked at random whenever its music
  // starts (a new zone, a new run), unless the player chose one for that map
  // with nextSong(). forceTrack (0, 1, ...) pins one everywhere, for testing.
  pickSong() {
    const songs = TRACKS[this.zone];
    this.chosen = this.chosen || {};
    const i = this.forceTrack ?? this.chosen[this.zone] ?? Math.floor(Math.random() * songs.length);
    this.song = songs[i] || songs[0];
    if (this.onTrack) this.onTrack(this.song, this.zone);
  }

  // Skip to the map's next song, right away, from its first bar. The choice
  // sticks for that map for the rest of the visit. Returns the new song, or
  // null when there's nothing to cycle (no music yet, or the bonus level's).
  nextSong() {
    if (!this.ctx || !this.musicOn || this.custom || !this.song) return null;
    if (this.pendingZone !== null) {
      // mid zone change: land the new zone now, then step from its song
      this.zone = this.pendingZone;
      this.pendingZone = null;
    }
    const songs = TRACKS[this.zone];
    this.chosen = this.chosen || {};
    // (if the zone just landed, step on from the song it was about to play)
    let cur = songs.indexOf(this.song);
    if (cur < 0) cur = this.chosen[this.zone] ?? -1;
    const i = (cur + 1) % songs.length;
    this.chosen[this.zone] = i;
    this.forceTrack = undefined;
    this.pickSong();
    this.section = this.song.seq ? this.song.seq[0] : 'A'; // a sequenced song starts on its first section
    this.seqIdx = 0;
    this.bar = 0;
    this.step = 0;
    this.fill = false;
    this.restartAtBar = false;
    this.crash = !this.state.menu;
    this.tempo = this.state.menu ? 112 : this.song.tempo + Math.max(0, Math.min(4, this.state.level - SONG_STARTS[this.zone])) * 1.5;
    this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
    return this.song;
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
        if (this.custom) {
          this.custom.stop();
          this.custom = null;
        }
      }
    }, fade * 1000 + 100);
  }

  // Slow motion: the music sinks under water for a moment.
  setSlow(on) {
    if (!this.ctx || this.slowOn === on) return;
    this.slowOn = on;
    const now = this.ctx.currentTime;
    this.slowFilter.frequency.cancelScheduledValues(now);
    this.slowFilter.frequency.setTargetAtTime(on ? 1200 : 20000, now, on ? 0.08 : 0.35);
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
      else this.zone = zone; // (its song is picked when the music starts)
    }
  }

  // The style in play: a sequenced song's sections each carry their own
  // (tempo, lead, pad, drums...); other songs have one for the whole song.
  style() {
    return this.song[this.section].style || this.song;
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
    const st = this.song ? this.style() : {};
    const t = {
      bass: menu ? 0.55 : 1,
      arp: menu ? 0.75 : 0.55 + i * 0.45,
      drums: menu ? 0 : 1,
      lead: menu ? 0.5 : 1, // a soft melody on the title screen so each map's song is recognisable
      stabs: !menu && (i >= 0.35 || st.drop) ? 1 : 0,
      counter: !menu && i >= 0.62 ? 1 : 0,
      sparkle: !menu && s.rush ? 1 : 0,
      pad: st.pad ? (menu ? 0.7 : 1) : 0,
    };
    // a section can drop layers out (a breakdown, a sparse intro)
    for (const k of st.mute || []) t[k] = 0;
    const now = this.ctx.currentTime;
    for (const [k, v] of Object.entries(t)) {
      const L = this.layers[k];
      if (L.target !== v) {
        L.target = v;
        L.gain.gain.cancelScheduledValues(now);
        // (a pad leaving for a drop gets out of the way fast)
        L.gain.gain.setTargetAtTime(v, now, k === 'sparkle' ? 0.25 : k === 'pad' && v === 0 ? 0.15 : 1.4);
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
    if (this.custom) {
      this.custom.schedule(this.ctx.currentTime + 0.15);
      return;
    }
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
    const song = this.style();
    const target = this.state.menu ? 112 : song.tempo + Math.min(4, this.state.level - SONG_STARTS[this.zone]) * 1.5;
    this.tempo += (target - this.tempo) * 0.35;
    if (this.fill) {
      this.fill = false;
      if (this.pendingZone !== null) {
        this.zone = this.pendingZone;
        this.pendingZone = null;
        this.pickSong();
        this.section = this.song.seq ? this.song.seq[0] : 'A'; // a sequenced song starts on its first section
        this.seqIdx = 0;
        this.bar = 0;
        this.crash = true;
        return;
      }
    }
    if (this.restartAtBar) {
      this.restartAtBar = false;
      this.pickSong();
      this.section = this.song.seq ? this.song.seq[0] : 'A'; // a sequenced song starts on its first section
      this.seqIdx = 0;
      this.bar = 0;
      this.crash = !this.state.menu;
      return;
    }
    if (this.pendingZone !== null) {
      this.fill = true; // one bar of fill, then the new zone lands
      return;
    }
    const sec = this.song[this.section];
    const seq = this.song.seq;
    if (seq) {
      // a sequenced song plays its sections in order, round and round; a
      // build (riser) section brings its own roll, the rest end on a fill
      if (this.bar >= sec.bars) {
        this.bar = 0;
        const nextIdx = (this.seqIdx ?? 0) + 1;
        // at the end it goes round again (from loopTo, if the song skips its intro)
        this.seqIdx = nextIdx < seq.length ? nextIdx : this.song.loopTo ?? 0;
        this.section = seq[this.seqIdx];
        this.crash = !this.state.menu;
        this.boom = !this.state.menu && !!sec.riser;
      } else if (this.bar === sec.bars - 1 && !this.state.menu && !sec.riser && sec.fill !== false) {
        this.fill = true;
      }
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
    const sec = this.song[this.section];
    const song = sec.style || this.song;
    const s = this.step;
    const bars = sec.bars || 8;
    const barIdx = Math.min(bars - 1, this.bar);
    // a build section: everything but the lead drops out for its last beat,
    // a breath of silence before the drop
    const pos = barIdx * 16 + s;
    const hush = sec.riser && pos >= bars * 16 - 4;
    // (a bar may hold two chords, one per half bar)
    const cell = sec.chords[barIdx % sec.chords.length];
    const split = Array.isArray(cell[0]);
    const [cRoot, cQual] = split ? cell[s < 8 ? 0 : 1] : cell;
    const chord = QUALITY[cQual];
    const key = song.key;
    const spb = 60 / this.tempo / 4;
    let tier = this.tier();
    if (tier && song.minTier) tier = Math.max(tier, song.minTier);
    const L = this.layers;
    // swing: the off 16ths come a little late
    if (song.swing && s % 2) t += song.swing * spb;

    // bass: triangle with a thin pulse on top for presence
    if (this.active('bass') && !hush) {
      const bass = song.bass || BASS;
      const pat = (tier === 0 ? bass.menu : bass[tier]).split(' ');
      const tok = pat[s];
      if (tok !== '-' && tok !== '.') {
        let len = 1;
        while (pat[s + len] === '-') len++;
        const base = 36 + ((key + cRoot) % 12);
        // 'A' approaches the next chord's root from a half step below
        const off = tok === 'A' ? 36 + ((key + this.nextChordRoot(sec, barIdx, s)) % 12) - 1 - base
          : tok === 'R' ? 0 : tok === 'O' ? 12 : tok === '5' ? 7 : tok === '7' ? chord[3] ?? 10 : chord[1];
        const f = midi(base + off);
        this.voice(f, { t, dur: spb * len * 0.92, gain: 0.34, wave: 'triangle', dest: L.bass.gain, release: 0.03 });
        if (tier >= 2) this.voice(f * 2, { t, dur: spb * len * 0.7, gain: 0.035, wave: 0.5, dest: L.bass.gain, release: 0.03 });
      }
    }

    // the build: a noise riser swelling up, the whole mix dipping under a
    // low-pass and opening back up, a snare roll that keeps doubling
    if (pos === 0) {
      // each section sets the level; a build swells from it to levelTo
      const sg = this.sectionGain.gain;
      const lv = song.level ?? 1;
      sg.cancelScheduledValues(t);
      if (sec.riser && song.levelTo) {
        sg.setValueAtTime(lv, t);
        sg.linearRampToValueAtTime(song.levelTo, t + (bars * 16 - 4) * spb);
      } else sg.setTargetAtTime(lv, t, 0.03);
    }
    if (sec.riser && pos === 0 && !this.state.menu) {
      const len = (bars * 16 - 4) * spb;
      this.riser(t, len, L.drums.gain);
      if (!this.state.paused) {
        const fq = this.musicFilter.frequency;
        fq.cancelScheduledValues(t);
        fq.setValueAtTime(18000, t);
        fq.exponentialRampToValueAtTime(2600, t + 8 * spb);
        fq.exponentialRampToValueAtTime(18000, t + len);
      }
    }
    if (sec.riser && this.active('drums') && tier > 0) {
      if (this.crash && s === 0) this.crash = false;
      if (!hush) {
        if (s % 4 === 0) this.kick(t, L.drums.gain);
        const every = [4, 2, 2, 1][Math.min(3, Math.floor((barIdx / bars) * 4))];
        if (s % every === 0) this.snare(t, L.drums.gain, 0.05 + 0.12 * (pos / (bars * 16)));
        if (tier >= 2 && s % 4 === 2) this.hat(t, L.drums.gain, 0.06);
      }
    } else if (this.active('drums') && tier > 0) {
      const d = this.fill ? FILL : (song.drums || DRUMS)[tier];
      if (this.crash && s === 0) {
        this.noiseHit({ t, dur: 1.1, gain: 0.13, freq: 5000, type: 'highpass', dest: L.drums.gain });
        this.crash = false;
      }
      if (this.boom && s === 0) {
        // the drop lands: a sub boom under the crash
        this.voice(70, { t, dur: 1.2, gain: 0.45, wave: 'sine', slide: 0.45, dest: L.drums.gain, release: 0.6 });
        this.noiseHit({ t, dur: 1.6, gain: 0.1, freq: 3000, type: 'highpass', dest: L.drums.gain });
        this.boom = false;
      }
      if (d.k[s] === 'x') {
        this.kick(t, L.drums.gain);
        if (song.pump) {
          for (const p of Object.values(this.pumps)) {
            p.gain.setValueAtTime(0.3, t);
            p.gain.setTargetAtTime(1, t + 0.02, spb * 0.9);
          }
        }
      }
      if (d.s[s] === 'x') this.snare(t, L.drums.gain, this.fill ? 0.06 + (s / 16) * 0.12 : 0.16);
      else if (!this.fill && d.g && d.g[s] === 'x') this.snare(t, L.drums.gain, 0.04); // ghost notes
      if (d.h[s] === 'x') this.hat(t, L.drums.gain, s % 4 === 2 ? 0.07 : 0.045, tier === 3 && s % 8 === 6);
      if (d.c && d.c[s] === 'x' && !this.fill) this.clap(t, L.drums.gain, song.clap ?? 1);
      // shaker: 16ths, louder on the offbeat eighths ('X' accents one)
      if (d.sh && d.sh[s] !== '.') this.hat(t, L.drums.gain, d.sh[s] === 'X' ? 0.18 : s % 4 === 2 ? 0.14 : s % 2 ? 0.07 : 0.1, false, 6000);
      if (d.t && d.t[s] === 'x') this.voice(midi(45 + (s % 4 === 3 ? -5 : 0)), { t, dur: 0.14, gain: 0.2, wave: 'triangle', slide: 0.5, dest: L.drums.gain });
      if (this.fill && s >= 8 && s % 2 === 0) this.voice(midi(50 - (s - 8)), { t, dur: 0.12, gain: 0.22, wave: 'triangle', slide: 0.5, dest: L.drums.gain });
    } else if (s === 0) this.crash = this.boom = false;

    // pad: the bar's chord held under everything, two slightly detuned voices
    // per note with a slow swell, washed in the room
    if (song.pad && (s === 0 || (split && s === 8)) && this.active('pad') && !(sec.riser && barIdx === bars - 1)) {
      let base = 48 + ((key + cRoot) % 12);
      if (base < 52) base += 12;
      const dur = spb * (split ? 10 : 18); // overlaps into the next chord so chords blend
      for (const n of chord.slice(0, 4)) {
        const f = midi(base + n);
        for (const [det, wave, gain] of [[1.004, 'triangle', 0.024], [1 / 1.004, 0.5, 0.006]]) {
          this.voice(f * det, { t, dur, gain, wave, dest: song.pump ? this.pumps.pad : L.pad.gain, attack: spb * 3, release: spb * 6, pan: det > 1 ? -0.3 : 0.3 });
        }
      }
    }

    // arpeggio
    const arp = song.arp;
    const arpDest = song.pump ? this.pumps.arp : L.arp.gain;
    if (hush) {
      // (silence before the drop)
    } else if (this.active('arp') && !arp) {
      const order = [0, 1, 2, 3, 2, 1, 0, 1];
      const idx = order[s % 8] % chord.length;
      const oct = s % 8 === 3 && chord.length === 3 ? 12 : 0;
      const n = 72 + ((key + cRoot) % 12) + chord[idx] + oct;
      this.voice(midi(n), { t, dur: spb * 0.8, gain: tier === 0 ? 0.05 : 0.04, wave: 0.125, dest: arpDest, release: 0.05 });
    } else if (this.active('arp') && s % arp.every === 0) {
      const k = (s / arp.every) % arp.order.length;
      const idx = arp.order[k] % chord.length;
      // (the top of the pattern jumps an octave when the chord has no 4th note)
      const oct = arp.oct && arp.order[k] >= chord.length ? arp.oct : 0;
      const n = 72 + ((key + cRoot) % 12) + chord[idx] + oct;
      this.voice(midi(n), { t, dur: spb * arp.every * arp.len, gain: tier === 0 ? 0.05 : 0.04, wave: 0.125, dest: arpDest, release: Math.min(0.2, spb * arp.every * arp.len * 0.4) });
    }

    // a section can open on a big chord hit, like a horn stab
    if (song.hit && pos === 0 && !this.state.menu && tier >= 2) {
      for (const n of chord.slice(0, 4)) {
        for (const [o, w, g] of [[0, 0.25, 0.035], [12, 0.5, 0.018]]) this.voice(midi(60 + ((key + cRoot) % 12) + n + o), { t, dur: spb * 3, gain: g, wave: w, dest: L.lead.gain, release: 0.25, slide: 0 });
      }
    }

    // electric-piano comping: a four-note voicing ('x' short, 'L' held)
    if (song.keys) {
      const k = song.keys[s];
      if (this.active('stabs') && !hush && k !== '.') {
        const r = (key + cRoot) % 12;
        const dur = spb * (k === 'L' ? 3 : 1.2);
        for (const n of chord.slice(0, 4)) {
          const f = midi(55 + ((r + n + 5) % 12)); // voiced between G3 and F#4
          this.voice(f, { t, dur, gain: 0.03, wave: 'triangle', dest: L.stabs.gain, release: 0.12 });
          this.voice(f * 2, { t, dur: dur * 0.5, gain: 0.008, wave: 0.25, dest: L.stabs.gain, release: 0.08 });
        }
      }
    } else if (this.active('stabs') && !hush && (song.stabs ? song.stabs[s] === 'x' : s % 4 === 2)) {
      for (let k = 0; k < 3; k++) {
        const n = 60 + ((key + cRoot) % 12) + chord[k];
        this.voice(midi(n), { t, dur: spb * 0.9, gain: 0.03, wave: 0.5, dest: L.stabs.gain, release: 0.04 });
      }
    }

    // lead melody and its harmony
    const note = sec.notes[barIdx * 16 + s];
    if (note && (this.active('lead') || this.active('counter'))) {
      const root = song.root + (song.leadOct || 0);
      const semis = degreeToSemis(song.scale, note.deg);
      const dur = spb * note.len * 0.95 * (note.len === 1 ? song.staccato || 1 : 1);
      if (this.active('lead')) {
        this.voice(midi(root + semis), { t, dur, gain: 0.085, wave: song.lead, dest: L.lead.gain, release: Math.min(0.08, dur * 0.3), vibrato: note.len >= 3 ? 0.008 : 0 });
        // the chorus soars: the lead doubled an octave up (down if that's shrill)
        if (song.double && (sec.chorus ?? this.section === 'B') && tier >= 1) {
          const up = root + semis + 12 <= 88 ? 12 : -12;
          this.voice(midi(root + semis + up), { t, dur, gain: 0.04, wave: 0.125, dest: L.lead.gain, release: Math.min(0.08, dur * 0.3) });
        }
        // echo: a held note repeats softly a few steps later, like a delay pedal
        if (song.echo && note.len >= 2) this.voice(midi(root + semis), { t: t + song.echo.steps * spb, dur: Math.min(dur, spb * 4), gain: 0.085 * song.echo.gain, wave: 0.125, dest: L.lead.gain, release: Math.min(0.12, dur * 0.4) });
      }
      if (this.active('counter')) {
        const h = degreeToSemis(song.scale, note.deg - 2);
        this.voice(midi(root + h), { t, dur, gain: 0.04, wave: 0.125, dest: L.counter.gain, release: Math.min(0.08, dur * 0.3) });
      }
    }

    // the band's answer: a second line of licks replying in the lead's gaps
    const ans = sec.answerNotes && sec.answerNotes[barIdx * 16 + s];
    if (ans && this.active('lead')) {
      const dur = spb * ans.len * 0.7;
      this.voice(midi(song.root + degreeToSemis(song.scale, ans.deg)), { t, dur, gain: 0.05, wave: 0.125, dest: L.lead.gain, release: Math.min(0.06, dur * 0.3), pan: 0.35 });
    }

    // bells: a glockenspiel line two octaves above the lead, ringing out
    const bell = sec.bellNotes && sec.bellNotes[barIdx * 16 + s];
    if (bell && this.active('arp') && !hush) {
      const f = midi(song.root + 24 + degreeToSemis(song.scale, bell.deg));
      const pan = s % 4 < 2 ? -0.4 : 0.4;
      this.voice(f, { t, dur: spb * 1.6, gain: 0.03, wave: 0.125, dest: L.arp.gain, release: spb * 1.2, pan });
      this.voice(f * 2, { t, dur: spb * 0.8, gain: 0.012, wave: 'sine', dest: L.arp.gain, release: spb * 0.6, pan });
    }

    // rush sparkle: fast high arpeggio
    if (this.active('sparkle') && !hush) {
      const n = 84 + ((key + cRoot) % 12) + chord[s % chord.length] + (s % 2 ? 12 : 0);
      this.voice(midi(n), { t, dur: spb * 0.5, gain: 0.03, wave: 0.125, dest: L.sparkle.gain, release: 0.03 });
    }
  }

  // A build-up riser: looped noise through a band-pass that sweeps up while
  // it swells, cut dead at the end for the drop.
  riser(t, dur, dest) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(250, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur);
    g.gain.setValueAtTime(0, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t);
    src.stop(t + dur + 0.02);
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

  hat(t, dest, gain, open = false, freq = 8000) {
    this.noiseHit({ t, dur: open ? 0.14 : 0.035, gain, freq, type: 'highpass', q: 0.7, dest });
  }

  // a hand clap: three quick bursts and a short room tail
  // (level: a song can set its own, its 'clap' style field)
  clap(t, dest, level = 1) {
    for (let i = 0; i < 3; i++) this.noiseHit({ t: t + i * 0.011, dur: 0.025, gain: 1.3 * level, freq: 1500, q: 1.1, dest });
    this.noiseHit({ t: t + 0.033, dur: 0.2, gain: 1.0 * level, freq: 1400, q: 0.8, dest });
  }

  // the root of the chord after this one (the next half bar's, or next bar's)
  nextChordRoot(sec, barIdx, s) {
    const cell = sec.chords[barIdx % sec.chords.length];
    if (Array.isArray(cell[0]) && s < 8) return cell[1][0];
    const nc = sec.chords[(barIdx + 1) % sec.chords.length];
    return Array.isArray(nc[0]) ? nc[0][0] : nc[0];
  }
}
