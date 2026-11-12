// Snake skins and accessories. A skin colours the body per ring and angle:
// d is the distance from the head in cells, theta the angle around the body
// (PI/2 = spine, -PI/2 = belly). glow(d, theta) makes parts emissive (in their
// own colour). Some skins unlock through play; see `unlock`.

import { hotdogPart } from './skinShapes.js';

const TAU = Math.PI * 2;
const fract = (x) => x - Math.floor(x);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const dorsal = (t) => Math.sin(t);
const lateral = (t) => Math.abs(Math.cos(t));
const belly = (t) => Math.sin(t) < -0.35;
// c.lerp towards a hex colour without allocating (skins are baked in big loops)
let tmpC = null;
const mix = (c, hex, k) => c.lerp((tmpC = tmpC || c.clone()).set(hex), k);
// zigzag running along the spine, as a value of cos(theta) in [-amp, amp]
const zigzag = (d, freq, amp) => (Math.abs(fract(d * freq) - 0.5) * 4 - 1) * amp;

export const SKINS = [
  {
    id: 'viper', name: 'Viper', desc: 'The classic: teal with golden diamonds.',
    swatch: 'linear-gradient(135deg, #1386a8, #2fe3c6 55%, #ffb627)',
    color(d, t, c) {
      if (belly(t)) return c.set('#f3e7c4').multiplyScalar(Math.abs(fract(d * 3) - 0.5) < 0.08 ? 0.9 : 1);
      c.set('#2fe3c6').lerp(c.clone().set('#1386a8'), Math.max(0, dorsal(t)));
      const f = fract((d + 0.25) / 0.9);
      const dm = Math.abs(f - 0.5) * 2 + lateral(t) * 1.6;
      if (dm < 0.62) c.set('#ffb627');
      else if (dm < 0.82) c.set('#06242e');
      return c;
    },
    head: { top: '#1386a8', side: '#2fe3c6', belly: '#f3e7c4', accent: '#ffb627', eye: '#ffd23f' },
    aura: '#38c8ff', trail: '#5ff6ff',
  },
  {
    id: 'coral', name: 'Coral', desc: 'Bold red, yellow and black bands.',
    swatch: 'repeating-linear-gradient(90deg, #d81e1e 0 14px, #ffd23f 14px 18px, #151515 18px 30px, #ffd23f 30px 34px)',
    color(d, t, c) {
      const f = fract(d * 1.25);
      return c.set(f < 0.4 ? '#d81e1e' : f < 0.5 ? '#ffd23f' : f < 0.9 ? '#141414' : '#ffd23f');
    },
    head: { top: '#141414', side: '#1e1e1e', belly: '#ffd23f', accent: '#d81e1e', eye: '#ff5a3a' },
    aura: '#ff5a3a', trail: '#ffd23f',
  },
  {
    id: 'python', name: 'Python', desc: 'Earthy tan with dark blotches.',
    swatch: 'radial-gradient(circle at 30% 40%, #5a3a1a 0 18%, transparent 20%), radial-gradient(circle at 75% 65%, #5a3a1a 0 16%, transparent 18%), #c8a36a',
    color(d, t, c) {
      if (belly(t)) return c.set('#e8dcc0');
      const v = Math.sin(d * 2.3) + Math.sin(d * 1.1 + t * 2) + Math.cos(t * 3) * 0.5;
      if (v > 1.15) return c.set('#4a2e14');
      if (v > 0.95) return c.set('#2a1808');
      return c.set('#c8a36a').multiplyScalar(0.9 + hash(Math.floor(d * 4), Math.floor(t * 3)) * 0.15);
    },
    head: { top: '#8a6a3a', side: '#c8a36a', belly: '#e8dcc0', accent: '#4a2e14', eye: '#ffcc33' },
    aura: '#ffcc66', trail: '#e8c890',
  },
  {
    id: 'emerald', name: 'Emerald Boa', desc: 'Jungle green with a white zigzag spine.',
    swatch: 'linear-gradient(135deg, #0e8a36, #18b84a 60%, #eaffea)',
    color(d, t, c) {
      if (belly(t)) return c.set('#e8f070');
      c.set('#18b84a').lerp(c.clone().set('#0b6e2a'), Math.max(0, dorsal(t)) * 0.7);
      const zig = (Math.abs(fract(d * 1.4) - 0.5) * 2 - 0.5) * 0.9;
      if (dorsal(t) > 0.55 && Math.abs(Math.cos(t) - zig) < 0.12) c.set('#f2fff0');
      return c;
    },
    head: { top: '#0b6e2a', side: '#18b84a', belly: '#e8f070', accent: '#f2fff0', eye: '#ffe640' },
    aura: '#6aff9a', trail: '#b8ffcc',
  },
  {
    id: 'tiger', name: 'Tiger', desc: 'Blazing orange with black stripes.',
    swatch: 'repeating-linear-gradient(110deg, #ff8a1a 0 12px, #1a1008 12px 17px)',
    color(d, t, c) {
      if (belly(t)) return c.set('#fff1d8');
      if (Math.sin(d * 5 + Math.cos(t) * 1.6) > 0.6) return c.set('#1a1008');
      return c.set('#ff8a1a').lerp(c.clone().set('#e85a00'), Math.max(0, dorsal(t)) * 0.5);
    },
    head: { top: '#e85a00', side: '#ff8a1a', belly: '#fff1d8', accent: '#1a1008', eye: '#9aff4a' },
    aura: '#ff9a3a', trail: '#ffc070',
  },
  {
    id: 'candy', name: 'Candy Cane', desc: 'A sweet red and white spiral.',
    swatch: 'repeating-linear-gradient(45deg, #e8102a 0 9px, #ffffff 9px 18px)',
    color(d, t, c) {
      return c.set(fract(d * 1.1 + t / TAU) < 0.5 ? '#e8102a' : '#ffffff');
    },
    mat: { roughness: 0.18, metalness: 0.05 },
    head: { top: '#e8102a', side: '#ffffff', belly: '#ffffff', accent: '#2bd46a', eye: '#2bd46a' },
    aura: '#ff6a8a', trail: '#ffffff',
  },
  {
    id: 'ice', name: 'Glacier', desc: 'Frosted crystal that glows softly.',
    swatch: 'linear-gradient(135deg, #7fd8ff, #e8fbff 60%, #ffffff)',
    color(d, t, c) {
      c.set('#bfefff').lerp(c.clone().set('#62c8f0'), Math.max(0, dorsal(t)) * 0.6);
      if (hash(Math.floor(d * 9), Math.floor(t * 5)) > 0.86) c.set('#ffffff');
      return c;
    },
    glow: () => 0.22,
    mat: { roughness: 0.05, metalness: 0.15, env: 2.2 },
    head: { top: '#62c8f0', side: '#bfefff', belly: '#e8fbff', accent: '#ffffff', eye: '#2a6aff' },
    aura: '#9fefff', trail: '#e8fbff',
  },
  {
    id: 'neon', name: 'Neon Runner', desc: 'Midnight body with glowing light lines.',
    swatch: 'linear-gradient(180deg, #0a0f24 0 30%, #38f6ff 30% 38%, #0a0f24 38% 62%, #ff3df2 62% 70%, #0a0f24 70%)',
    unlock: { stat: 'maxZone', value: 1, label: 'Reach Golden Canyon' },
    color(d, t, c) {
      if (lateral(t) > 0.93) return c.set('#38f6ff');
      if (dorsal(t) > 0.965) return c.set('#ff3df2');
      return c.set(belly(t) ? '#141a30' : '#0a0f24');
    },
    glow: (d, t) => (lateral(t) > 0.93 || dorsal(t) > 0.965 ? 1.4 : 0),
    anim: 'flow',
    mat: { roughness: 0.25, metalness: 0.4 },
    head: { top: '#0a0f24', side: '#10162e', belly: '#141a30', accent: '#38f6ff', eye: '#ff3df2', eyeGlow: 3 },
    aura: '#38f6ff', trail: '#ff3df2',
  },
  {
    id: 'lava', name: 'Magma', desc: 'Cooling rock split by molten cracks.',
    swatch: 'linear-gradient(120deg, #1a1210 0 40%, #ff6a10 42% 46%, #1a1210 48% 70%, #ffb020 72% 75%, #1a1210 77%)',
    unlock: { stat: 'best', value: 1500, label: 'Score 1,500' },
    color(d, t, c) {
      const v = Math.abs(Math.sin(d * 3.1 + t * 2) * Math.sin(d * 1.7 - t * 3));
      if (v < 0.13) return c.set(v < 0.06 ? '#ffd040' : '#ff5a08');
      return c.set('#1c1412').multiplyScalar(0.8 + hash(Math.floor(d * 5), Math.floor(t * 4)) * 0.4);
    },
    glow: (d, t) => (Math.abs(Math.sin(d * 3.1 + t * 2) * Math.sin(d * 1.7 - t * 3)) < 0.13 ? 1.8 : 0),
    anim: 'pulse',
    mat: { roughness: 0.85, metalness: 0 },
    head: { top: '#1c1412', side: '#241a16', belly: '#3a2418', accent: '#ff5a08', eye: '#ffd040', eyeGlow: 3 },
    aura: '#ff6a10', trail: '#ffb020',
  },
  {
    id: 'golden', name: 'Golden King', desc: 'Solid gold, polished to a shine.',
    swatch: 'linear-gradient(135deg, #b8860b, #ffd860 45%, #fff3c0 60%, #c8961a)',
    unlock: { stat: 'mice', value: 3, label: 'Catch 3 golden mice' },
    color(d, t, c) {
      if (belly(t)) return c.set('#fff0b0');
      const f = fract((d + 0.2) / 0.7);
      return c.set(Math.abs(f - 0.5) * 2 + lateral(t) * 1.4 < 0.55 ? '#e8a820' : '#ffcc40');
    },
    mat: { roughness: 0.2, metalness: 0.95, env: 1.8 },
    head: { top: '#e8a820', side: '#ffcc40', belly: '#fff0b0', accent: '#ff3040', eye: '#ff3040' },
    aura: '#ffd860', trail: '#fff0b0',
  },
  {
    id: 'chrome', name: 'Chrome', desc: 'Liquid mirror metal.',
    swatch: 'linear-gradient(180deg, #ffffff, #8a96a8 45%, #f2f6ff 55%, #5a6478)',
    unlock: { stat: 'chains', value: 3, label: 'Complete 3 orb chains' },
    color(d, t, c) {
      return c.set(Math.abs(Math.cos(t)) > 0.96 ? '#7aa8ff' : '#eef3fa');
    },
    mat: { roughness: 0.05, metalness: 1, env: 2, normal: 0.25 },
    head: { top: '#eef3fa', side: '#dfe6f0', belly: '#ffffff', accent: '#7aa8ff', eye: '#38f6ff', eyeGlow: 2 },
    aura: '#bfe0ff', trail: '#ffffff',
  },
  {
    id: 'galaxy', name: 'Galaxy', desc: 'A night sky full of twinkling stars.',
    swatch: 'radial-gradient(circle at 25% 30%, #fff 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, #fff 0 2px, transparent 3px), linear-gradient(135deg, #1a0838, #3a1a98 60%, #c23aff)',
    unlock: { stat: 'maxZone', value: 2, label: 'Reach Neon Night' },
    color(d, t, c) {
      if (hash(Math.floor(d * 11), Math.floor(t * 7)) > 0.93) return c.set('#ffffff');
      c.set('#14062e').lerp(c.clone().set('#3a1a98'), 0.5 + 0.5 * Math.sin(d * 0.7 + t));
      if (Math.sin(d * 1.3 + t * 2) > 0.85) c.lerp(c.clone().set('#c23aff'), 0.6);
      return c;
    },
    glow: (d, t) => (hash(Math.floor(d * 11), Math.floor(t * 7)) > 0.93 ? 2.2 : Math.sin(d * 1.3 + t * 2) > 0.85 ? 0.35 : 0),
    mat: { roughness: 0.3, metalness: 0.2 },
    head: { top: '#14062e', side: '#2a1270', belly: '#3a1a98', accent: '#ffffff', eye: '#c23aff', eyeGlow: 3 },
    aura: '#c23aff', trail: '#ffffff',
  },
  {
    id: 'rainbow', name: 'Prism', desc: 'Every colour at once, always moving.',
    swatch: 'linear-gradient(90deg, #ff3a3a, #ffb020, #ffe640, #3aff6a, #38c8ff, #8a4aff, #ff3df2)',
    unlock: { stat: 'apples', value: 60, label: 'Eat 60 apples in total' },
    color(d, t, c) {
      return c.set(belly(t) ? '#e0e0e0' : '#ffffff');
    },
    glow: () => 0.18,
    anim: 'rainbow',
    mat: { roughness: 0.2, metalness: 0.1 },
    head: { top: '#ffffff', side: '#ffffff', belly: '#e0e0e0', accent: '#ffffff', eye: '#ffffff', eyeGlow: 2 },
    aura: '#ffffff', trail: '#ffe640',
  },
  {
    id: 'dragon', name: 'Dragon', desc: 'Crimson scales and a golden spine ridge.',
    swatch: 'linear-gradient(180deg, #7a0810, #b0101a 45%, #ffc02a 50%, #b0101a 55%, #ffcc66)',
    unlock: { stat: 'best', value: 4000, label: 'Score 4,000' },
    color(d, t, c) {
      if (belly(t)) return c.set(fract(d * 2.2) < 0.15 ? '#c89040' : '#ffcc66');
      if (dorsal(t) > 0.93) return c.set('#ffc02a');
      return c.set('#b0101a').lerp(c.clone().set('#5a040a'), Math.max(0, dorsal(t)) * 0.7);
    },
    glow: (d, t) => (dorsal(t) > 0.93 ? 0.35 : 0),
    mat: { roughness: 0.4, metalness: 0.25 },
    head: { top: '#5a040a', side: '#b0101a', belly: '#ffcc66', accent: '#ffc02a', eye: '#ffe640', eyeGlow: 2 },
    aura: '#ff4a2a', trail: '#ffc02a',
  },
  {
    id: 'circuit', name: 'Circuit', desc: 'Black glass traced with live circuitry.',
    swatch: 'linear-gradient(90deg, transparent 0 45%, #38f6ff 45% 52%, transparent 52%), linear-gradient(0deg, transparent 0 60%, #38f6ff 60% 66%, transparent 66%), #06080f',
    unlock: { stat: 'maxZone', value: 3, label: 'Reach Cyber Overdrive' },
    color(d, t, c) {
      return c.set(circuit(d, t) ? '#38f6ff' : belly(t) ? '#0c1018' : '#06080f');
    },
    glow: (d, t) => (circuit(d, t) ? 1.6 : 0),
    anim: 'flow',
    mat: { roughness: 0.12, metalness: 0.5 },
    head: { top: '#06080f', side: '#0c1018', belly: '#0c1018', accent: '#38f6ff', eye: '#38f6ff', eyeGlow: 3 },
    aura: '#38f6ff', trail: '#38f6ff',
  },
  {
    id: 'phoenix', name: 'Phoenix', desc: 'Sunset feathers: gold at the head, burning pink to the tail.',
    swatch: 'linear-gradient(90deg, #ffe08a, #ff9a3a 35%, #ff4f8a 70%, #7a2aa8)',
    unlock: { stat: 'maxZone', value: 4, label: 'Reach Sunset Heavens' },
    color(d, t, c) {
      if (belly(t)) return c.set('#ffe2b0');
      const k = Math.min(1, d / 14);
      c.set('#ffd25a').lerp(c.clone().set('#ff5a8a'), Math.min(1, k * 1.6));
      if (k > 0.6) c.lerp(c.clone().set('#7a2aa8'), (k - 0.6) * 2);
      // feather chevrons along the back
      if (fract(d * 1.6 - Math.abs(Math.cos(t)) * 0.5) < 0.18 && dorsal(t) > 0) c.lerp(c.clone().set('#fff2c0'), 0.7);
      return c;
    },
    glow: (d, t) => (fract(d * 1.6 - Math.abs(Math.cos(t)) * 0.5) < 0.18 && dorsal(t) > 0 ? 0.9 : 0.12),
    anim: 'pulse',
    mat: { roughness: 0.3, metalness: 0.2 },
    head: { top: '#ffb43a', side: '#ffd25a', belly: '#ffe2b0', accent: '#fff2c0', eye: '#ff3d8a', eyeGlow: 2.4 },
    aura: '#ff8a3a', trail: '#ff6aa8',
  },
  {
    id: 'horizon', name: 'Event Horizon', desc: 'Black as the core, wrapped in a burning accretion disk. Only for those who finished the galaxy.',
    swatch: 'radial-gradient(circle at 50% 50%, #000 0 30%, #fff0c8 34%, #ff9a3a 44%, #b02a8a 60%, #05030c 75%)',
    unlock: { stat: 'wins', value: 1, label: 'Finish the galaxy (100%)' },
    color(d, t, c) {
      if (belly(t)) return c.set('#0a0612');
      // a hot band of light spirals down the body
      const band = Math.abs(fract(d * 0.42 + t / TAU) - 0.5) * 2;
      if (band < 0.18) return c.set('#fff0c8').lerp(c.clone().set('#ff9a3a'), band / 0.18);
      if (band < 0.32) return c.set('#ff9a3a').lerp(c.clone().set('#b02a8a'), (band - 0.18) / 0.14);
      return c.set('#05030c');
    },
    glow: (d, t) => {
      const band = Math.abs(fract(d * 0.42 + t / TAU) - 0.5) * 2;
      return belly(t) ? 0 : band < 0.18 ? 2.2 : band < 0.32 ? 1 : 0;
    },
    anim: 'flow',
    mat: { roughness: 0.15, metalness: 0.6 },
    head: { top: '#05030c', side: '#0a0612', belly: '#0a0612', accent: '#ffb347', eye: '#fff0c8', eyeGlow: 3.2 },
    aura: '#ff9a3a', trail: '#ffb347',
  },
  {
    id: 'ghost', name: 'Phantom', desc: 'A pale spirit with an eerie glow.',
    swatch: 'radial-gradient(circle at 50% 40%, #ffffff, #cfe6ff 50%, #7a9ac8)',
    unlock: { stat: 'games', value: 10, label: 'Play 10 runs' },
    color(d, t, c) {
      return c.set('#e8f4ff').lerp(c.clone().set('#9ab8e8'), 0.5 + 0.5 * Math.sin(d * 1.5));
    },
    glow: () => 0.45,
    anim: 'pulse',
    mat: { roughness: 0.15, metalness: 0 },
    head: { top: '#cfe0ff', side: '#e8f4ff', belly: '#ffffff', accent: '#9ab8e8', eye: '#2a2a5a' },
    aura: '#cfe6ff', trail: '#ffffff',
  },
  {
    id: 'block', name: 'Blue Block', desc: 'Solid blue blocks, a full square wide and two thirds tall.',
    swatch: '#2a6aff',
    // shape 'block': one cube per cell and a cube head; blockH is the height
    // in cells (a full square base, 2/3 of a square tall)
    shape: 'block', blockH: 2 / 3,
    color(d, t, c) {
      return c.set('#2a6aff');
    },
    mat: { roughness: 0.55, metalness: 0, normal: 0, env: 0.8 },
    head: { top: '#2a6aff', side: '#2a6aff', belly: '#2a6aff', accent: '#2a6aff', eye: '#ffffff', eyeGlow: 0.3 },
    aura: '#5a9aff', trail: '#8ab8ff',
  },
  {
    id: 'cursed', name: 'Cursed Tower', desc: 'Three blocks tall. Leans over and stares down at the world. Nobody asked for this.',
    swatch: 'linear-gradient(180deg, #8a6ad8 0 33%, #5a3a9a 33% 34%, #7a5ac8 34% 66%, #5a3a9a 66% 67%, #6a4ab8 67%)',
    // a block snake stacked blockH blocks high, its face tilted down by tilt radians
    shape: 'block', blockH: 3, tilt: 0.6,
    color(d, t, c) {
      return c.set('#7a5ac8');
    },
    mat: { roughness: 0.6, metalness: 0, normal: 0, env: 0.7 },
    head: { top: '#8a6ad8', side: '#8a6ad8', belly: '#8a6ad8', accent: '#8a6ad8', eye: '#ff2a3a', eyeGlow: 2.6, eyeScale: 1.7 },
    aura: '#b08aff', trail: '#ff4a6a',
  },
  // ------------------------------------------------------------ silly skins
  {
    id: 'hotdog', name: 'Hot Dog', desc: 'A grilled sausage in a toasty bun, mustard on top.',
    swatch: 'linear-gradient(180deg, #e8a85a 0 22%, #b0402a 22% 44%, #ffd21a 44% 54%, #b0402a 54% 76%, #e8a85a 76%)',
    color(d, t, c) {
      const up = Math.sin(t);
      if (hotdogPart(t) === 'bun') {
        // the bun: soft crumb on the inside of the split, toasted crust outside
        if (up > 0.3) return c.set('#fbe0a6');
        c.set('#ee9a3c');
        mix(c, '#b8742e', Math.min(1, -up * 0.9));
        return c.multiplyScalar(0.94 + hash(Math.floor(d * 6), Math.floor(t * 6)) * 0.08);
      }
      // the sausage, with diagonal grill marks and a mustard zigzag
      c.set('#c04a2e');
      mix(c, '#8a2a18', Math.max(0, up - 0.4));
      if (fract(d * 1.4 + Math.cos(t) * 0.6) < 0.12) c.set('#3a140c');
      if (up > 0.5 && Math.abs(Math.cos(t) - zigzag(d, 1.1, 0.45)) < 0.13) c.set('#ffd21a');
      return c;
    },
    mat: { roughness: 0.55, metalness: 0, normal: 0 },
    head: { top: '#a8382a', side: '#c04a2e', belly: '#e8a85a', accent: '#ffd21a', eye: '#ffffff', eyeGlow: 0.4 },
    aura: '#ffb020', trail: '#ffd21a',
  },
  {
    id: 'gummy', name: 'Gummy Worm', desc: 'Sugar-dusted, see-through and very chewy.',
    swatch: 'linear-gradient(90deg, #ff2e63, #ff8a1a 33%, #ffe640 50%, #3ae06a 70%, #2e9bff)',
    color(d, t, c) {
      const stops = ['#ff2e63', '#ff8a1a', '#ffe640', '#3ae06a', '#2e9bff'];
      const u = fract(d / 12) * stops.length;
      const i = Math.floor(u);
      c.set(stops[i]);
      mix(c, stops[(i + 1) % stops.length], Math.max(0, Math.min(1, (fract(u) - 0.6) / 0.4)));
      if (sugar(d, t)) c.set('#ffffff');
      return c;
    },
    glow: (d, t) => (sugar(d, t) ? 0.1 : 0.45),
    mat: { roughness: 0.12, metalness: 0, normal: 0.15, env: 1.6 },
    head: { top: '#ff2e63', side: '#ff5a80', belly: '#ff8aa2', accent: '#ffffff', eye: '#ffffff', eyeGlow: 0.5 },
    aura: '#ff6a9a', trail: '#ffe640',
  },
  {
    id: 'tape', name: 'Tape Measure', desc: 'Always knows exactly how long you are.',
    swatch: 'repeating-linear-gradient(90deg, #ffd21a 0 6px, #1a1a1a 6px 7px), #ffd21a',
    color(d, t, c) {
      if (belly(t)) return c.set('#d8b010');
      const w = Math.abs(Math.cos(t)); // 0 on the spine, 1 at the sides
      // a red line every cell, long black ticks every half cell, short every quarter
      if (fract(d) < 0.08 && w < 0.9) return c.set('#e8102a');
      if (fract(d * 4) < 0.24 && w < (fract(d * 2) < 0.12 ? 0.75 : 0.4)) return c.set('#141414');
      return c.set('#ffd21a');
    },
    mat: { roughness: 0.3, metalness: 0.15, normal: 0 },
    head: { top: '#b8bec8', side: '#d8dde6', belly: '#8a909a', accent: '#141414', eye: '#141414', eyeGlow: 0 },
    aura: '#ffe640', trail: '#ffd21a',
  },
  {
    id: 'toothpaste', name: 'Toothpaste', desc: 'Minty fresh, with stripes.',
    swatch: 'repeating-linear-gradient(0deg, #ffffff 0 8px, #e8102a 8px 12px, #ffffff 12px 20px, #18c8c0 20px 24px)',
    color(d, t, c) {
      const f = fract((t / TAU) * 3 + d * 0.06);
      return c.set(f < 0.18 ? '#e8102a' : f > 0.5 && f < 0.68 ? '#18c8c0' : '#f8fbff');
    },
    mat: { roughness: 0.25, metalness: 0, normal: 0.05 },
    head: { top: '#f8fbff', side: '#f8fbff', belly: '#f8fbff', accent: '#18c8c0', eye: '#18c8c0', eyeGlow: 0.6 },
    aura: '#9ffff0', trail: '#ffffff',
  },
  {
    id: 'pickle', name: 'Pickle', desc: 'Bumpy, briny and proud of it.',
    swatch: 'radial-gradient(circle at 30% 35%, #b8d860 0 10%, transparent 12%), radial-gradient(circle at 70% 70%, #b8d860 0 9%, transparent 11%), #5a8a22',
    color(d, t, c) {
      c.set('#5a8a22');
      mix(c, '#3a6014', 0.5 + 0.5 * Math.cos(t * 10 + Math.sin(d * 0.8)));
      if (belly(t)) mix(c, '#8aaa3a', 0.4);
      const bump = hash(Math.floor(d * 3), Math.floor(t * 2.5));
      const bu = fract(d * 3) - 0.5;
      const bv = fract(t * 2.5) - 0.5;
      if (bump > 0.6 && bu * bu + bv * bv < 0.06) c.set('#b8d860');
      return c;
    },
    mat: { roughness: 0.4, metalness: 0, normal: 0 },
    head: { top: '#3a6014', side: '#5a8a22', belly: '#8aaa3a', accent: '#b8d860', eye: '#ffffff', eyeGlow: 0.4 },
    aura: '#b8ff6a', trail: '#d8ff9a',
  },
  {
    id: 'bacon', name: 'Crispy Bacon', desc: 'Sizzling streaks of meat and fat.',
    swatch: 'linear-gradient(170deg, #b8302a 0 22%, #f8d0b0 22% 34%, #d8483a 34% 58%, #f8d0b0 58% 68%, #8a2018 68%)',
    unlock: { stat: 'mice', value: 1, label: 'Catch a golden mouse' },
    color(d, t, c) {
      // streaks of fat and meat running along the rasher, across its width
      const f = fract(Math.cos(t) * 1.9 + Math.sin(d * 2.1) * 0.08 + Math.sin(d * 0.7) * 0.05 + 0.1);
      if (f < 0.3) c.set('#f8d0b0');
      else c.set('#c8382a');
      mix(c, '#6a1a10', Math.max(0, hash(Math.floor(d * 5), Math.floor(t * 4)) - 0.7) * 2); // crispy bits
      return c;
    },
    mat: { roughness: 0.45, metalness: 0.05, normal: 0 },
    head: { top: '#a8281e', side: '#c8382a', belly: '#f8d0b0', accent: '#f8d0b0', eye: '#ffe640', eyeGlow: 0.6 },
    aura: '#ff7a3a', trail: '#ffb080',
  },
  {
    id: 'maid', name: 'Maid', desc: 'A black dress, a frilly white apron, lace ruffles and a headdress.',
    swatch: 'linear-gradient(180deg, #16161e 0 38%, #ffffff 38% 46%, #16161e 46% 60%, #f6f6fa 60% 100%)',
    color(d, t, c) {
      const up = Math.sin(t);
      const ring = fract(d * 0.42);
      // lace cuffs every couple of cells: white, with a scalloped edge
      if (ring < 0.09) {
        const lace = Math.abs(Math.sin(t * 9)) > 0.25 || ring > 0.025;
        return c.set(lace ? '#ffffff' : '#c8c8d6');
      }
      // the apron: crisp white underneath, frilled where it meets the dress
      if (up < -0.2) {
        if (up > -0.36) return c.set(fract(d * 7) < 0.5 ? '#ffffff' : '#e2e2ec');
        return c.set('#f6f6fa').multiplyScalar(0.96 + hash(Math.floor(d * 5), 1) * 0.04);
      }
      // the dress: soft black with a faint satin sheen down the sides
      c.set('#16161e');
      return mix(c, '#2c2c3c', lateral(t) * 0.35);
    },
    mat: { roughness: 0.42, metalness: 0.05, normal: 0 },
    head: { top: '#16161e', side: '#202030', belly: '#ffffff', accent: '#16161e', eye: '#ffffff', eyeGlow: 0.5 },
    aura: '#ffb8de', trail: '#ffffff',
  },
  {
    id: 'benny', name: 'BennyBennion1', desc: 'A tribute skin for BennyBennion1: electric blue, a lime lightning streak down the back and a white stripe every few cells. Built for speed (and slow-mo).',
    swatch: 'linear-gradient(135deg, #0b2a8a, #1f6bff 45%, #b6ff3a 50%, #1f6bff 55%, #0b2a8a)',
    color(d, t, c) {
      if (belly(t)) return c.set('#e8f0ff');
      // a white stripe round the body every few cells
      if (fract(d * 0.34) < 0.06) return c.set('#ffffff');
      // the lightning streak along the spine
      if (dorsal(t) > 0.4 && Math.abs(Math.cos(t) - zigzag(d, 0.9, 0.5)) < 0.12) return c.set('#b6ff3a');
      c.set('#1f6bff');
      return mix(c, '#0b2a8a', Math.max(0, dorsal(t)) * 0.6);
    },
    glow: (d, t) => (dorsal(t) > 0.4 && Math.abs(Math.cos(t) - zigzag(d, 0.9, 0.5)) < 0.12 ? 1.5 : 0),
    anim: 'flow',
    mat: { roughness: 0.25, metalness: 0.25 },
    head: { top: '#0b2a8a', side: '#1f6bff', belly: '#e8f0ff', accent: '#b6ff3a', eye: '#ffffff', eyeGlow: 1.2 },
    aura: '#5fa0ff', trail: '#b6ff3a',
  },
];

// sugar crystals dusted over the gummy worm
function sugar(d, t) {
  const u = d * 10;
  const v = t * 6;
  const du = fract(u) - 0.5;
  const dv = fract(v) - 0.5;
  return hash(Math.floor(u), Math.floor(v)) > 0.8 && du * du + dv * dv < 0.07;
}

function circuit(d, t) {
  const u = d * 3;
  const v = (t / TAU) * 6;
  const cu = Math.floor(u);
  const cv = Math.floor(v);
  const on = hash(cu, cv) > 0.45;
  const lineU = Math.abs(fract(v) - 0.5) < 0.09 && on;
  const lineV = Math.abs(fract(u) - 0.5) < 0.09 && hash(cv, cu) > 0.6;
  const node = Math.abs(fract(u) - 0.5) < 0.16 && Math.abs(fract(v) - 0.5) < 0.16 && hash(cu + 7, cv) > 0.75;
  return lineU || lineV || node;
}

export const ACCESSORIES = [
  { id: 'none', name: 'None', icon: '∅' },
  { id: 'shades', name: 'Shades', icon: '🕶' },
  { id: 'tophat', name: 'Top hat', icon: '🎩' },
  { id: 'party', name: 'Party hat', icon: '🎉' },
  { id: 'horns', name: 'Horns', icon: '🦌' },
  { id: 'bow', name: 'Bow', icon: '🎀' },
  { id: 'flower', name: 'Flower', icon: '🌼' },
  { id: 'crown', name: 'Crown', icon: '👑', unlock: { stat: 'best', value: 2500, label: 'Score 2,500' } },
  { id: 'halo', name: 'Halo', icon: '😇', unlock: { stat: 'chains', value: 5, label: 'Complete 5 orb chains' } },
];

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

export function accessoryById(id) {
  return ACCESSORIES.find((a) => a.id === id) || ACCESSORIES[0];
}

export function isUnlocked(item, stats) {
  return !item.unlock || (stats[item.unlock.stat] || 0) >= item.unlock.value;
}

// Progress text for a locked item, e.g. "1 / 3".
export function unlockProgress(item, stats) {
  if (!item.unlock) return '';
  const have = Math.min(stats[item.unlock.stat] || 0, item.unlock.value);
  return item.unlock.stat === 'maxZone' ? '' : `${have.toLocaleString()} / ${item.unlock.value.toLocaleString()}`;
}
