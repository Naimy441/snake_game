// Snake skins and accessories. A skin colours the body per ring and angle:
// d is the distance from the head in cells, theta the angle around the body
// (PI/2 = spine, -PI/2 = belly). glow(d, theta) makes parts emissive (in their
// own colour). Some skins unlock through play; see `unlock`.

const TAU = Math.PI * 2;
const fract = (x) => x - Math.floor(x);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const dorsal = (t) => Math.sin(t);
const lateral = (t) => Math.abs(Math.cos(t));
const belly = (t) => Math.sin(t) < -0.35;

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
];

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
