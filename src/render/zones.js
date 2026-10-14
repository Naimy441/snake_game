// Visual definition of each zone. Every numeric or colour field is blended
// while the world transforms from one zone to the next, so nothing ever snaps.
// Colours are hex strings, angles are degrees.

export const ZONES = [
  {
    name: 'Emerald Coast',
    skyTop: '#0c4ae0', skyHorizon: '#8ad2ff', skyGround: '#3f94d0',
    sunColor: '#fff0d6', sunIntensity: 3.8, sunElev: 50, sunAzim: 35, sunSize: 1.0,
    rimColor: '#9fd0ff', rimIntensity: 0.9,
    stars: 0, cyber: 0,
    hemiSky: '#bfe0ff', hemiGround: '#3f6a2a', hemiIntensity: 0.8,
    fogColor: '#9ad4ff', fogNear: 130, fogFar: 560,
    waterDeep: '#06407e', waterShallow: '#12a9d6', waterGlow: 0, waterGrid: 0,
    boardA: '#74d43f', boardB: '#4fb02c', boardRough: 0.88, boardGrid: 0.0, gridColor: '#ffffff', boardLines: 0.18,
    strip: '#38f6ff', wallA: '#f6f8ff', wallB: '#1f4fd8',
    grass: '#4fae2e', grassDark: '#3a8a2a', cliffA: '#c8702a', cliffB: '#7a3e16', cliffEdge: 0,
    rock: '#6d5240', waterfall: '#d8f6ff', waterfallGlow: 0,
    cloudLit: '#ffffff', cloudShade: '#b9cde6', cloudOpacity: 1,
    particle: '#fff6c0', particleSize: 0.09, particleRise: -0.15, particleTwinkle: 0.2,
    bloom: 0.32, threshold: 1.05, sat: 1.3, contrast: 1.14, tint: '#ffffff', lift: '#000000', exposure: 0.92, vignette: 0.3,
    envIntensity: 0.8,
  },
  {
    name: 'Golden Canyon',
    skyTop: '#28307e', skyHorizon: '#ffae5e', skyGround: '#e07a4a',
    sunColor: '#ffb874', sunIntensity: 3.4, sunElev: 21, sunAzim: 200, sunSize: 1.8,
    rimColor: '#ff8a5c', rimIntensity: 1.2,
    stars: 0, cyber: 0,
    hemiSky: '#ffd2a0', hemiGround: '#6a3a22', hemiIntensity: 1.1,
    fogColor: '#ffb98a', fogNear: 110, fogFar: 480,
    waterDeep: '#1c2a6e', waterShallow: '#3f74b8', waterGlow: 0, waterGrid: 0,
    boardA: '#c8e45a', boardB: '#a0c83e', boardRough: 0.85, boardGrid: 0.0, gridColor: '#ffe0a0', boardLines: 0.2,
    strip: '#ffd23f', wallA: '#fff4e2', wallB: '#d8452a',
    grass: '#a3a838', grassDark: '#6f7426', cliffA: '#d0582a', cliffB: '#8c2f18', cliffEdge: 0,
    rock: '#9c4a2c', waterfall: '#ffe7c8', waterfallGlow: 0,
    cloudLit: '#ffd2a0', cloudShade: '#a0628a', cloudOpacity: 1,
    particle: '#ffd38a', particleSize: 0.08, particleRise: 0.12, particleTwinkle: 0.4,
    bloom: 0.45, threshold: 1.0, sat: 1.22, contrast: 1.12, tint: '#fff1e0', lift: '#140600', exposure: 1.0, vignette: 0.34,
    envIntensity: 1.0,
  },
  {
    name: 'Neon Night',
    skyTop: '#03050f', skyHorizon: '#3a1a72', skyGround: '#12082a',
    sunColor: '#9db4ff', sunIntensity: 1.25, sunElev: 42, sunAzim: 120, sunSize: 0.6,
    rimColor: '#ff3df2', rimIntensity: 1.4,
    stars: 1, cyber: 0,
    hemiSky: '#4a4fb0', hemiGround: '#140c2a', hemiIntensity: 0.75,
    fogColor: '#1c0f3c', fogNear: 80, fogFar: 340,
    waterDeep: '#02030c', waterShallow: '#0d1236', waterGlow: 1, waterGrid: 0,
    boardA: '#1c4656', boardB: '#14323f', boardRough: 0.32, boardGrid: 0.9, gridColor: '#ff3df2', boardLines: 0.0,
    strip: '#ff3df2', wallA: '#1a1636', wallB: '#7a2cff',
    grass: '#1f5a5a', grassDark: '#0e2c34', cliffA: '#3a2a6a', cliffB: '#1a1238', cliffEdge: 1,
    rock: '#2a2448', waterfall: '#6fd8ff', waterfallGlow: 1,
    cloudLit: '#5a3c9a', cloudShade: '#1a1238', cloudOpacity: 0.7,
    particle: '#b6ff6a', particleSize: 0.1, particleRise: 0.05, particleTwinkle: 1,
    bloom: 0.8, threshold: 0.85, sat: 1.25, contrast: 1.1, tint: '#e8e8ff', lift: '#06001a', exposure: 1.05, vignette: 0.42,
    envIntensity: 0.8,
  },
  {
    name: 'Cyber Overdrive',
    skyTop: '#0a0020', skyHorizon: '#c01ea8', skyGround: '#20004a',
    sunColor: '#ff9df0', sunIntensity: 1.6, sunElev: 60, sunAzim: 300, sunSize: 0.8,
    rimColor: '#38f6ff', rimIntensity: 1.6,
    stars: 0.5, cyber: 1,
    hemiSky: '#7a40ff', hemiGround: '#10002a', hemiIntensity: 0.8,
    fogColor: '#2a0050', fogNear: 70, fogFar: 320,
    waterDeep: '#05001a', waterShallow: '#12003a', waterGlow: 0.4, waterGrid: 1,
    boardA: '#0c0c1e', boardB: '#141430', boardRough: 0.22, boardGrid: 1.4, gridColor: '#38f6ff', boardLines: 0.0,
    strip: '#38f6ff', wallA: '#0a0a1a', wallB: '#ff2bd6',
    grass: '#140a34', grassDark: '#08041a', cliffA: '#12082e', cliffB: '#060214', cliffEdge: 1.6,
    rock: '#16102e', waterfall: '#38f6ff', waterfallGlow: 1.5,
    cloudLit: '#ff4fd8', cloudShade: '#2a0050', cloudOpacity: 0.25,
    particle: '#38f6ff', particleSize: 0.11, particleRise: 0.6, particleTwinkle: 0.6,
    bloom: 1.0, threshold: 0.8, sat: 1.2, contrast: 1.12, tint: '#f0e8ff', lift: '#0a0018', exposure: 1.05, vignette: 0.45,
    envIntensity: 0.7,
  },
];

const isColor = (v) => typeof v === 'string' && v[0] === '#';

// Convert once to numbers / THREE.Color-like triples so blending is cheap.
export function compileZones(THREE) {
  return ZONES.map((z) => {
    const out = {};
    for (const [k, v] of Object.entries(z)) out[k] = isColor(v) ? new THREE.Color(v) : v;
    return out;
  });
}

// Blend zone a -> b by f into `out` (same shape, reused every frame).
export function blendZones(a, b, f, out) {
  for (const k of Object.keys(a)) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number') out[k] = va + (vb - va) * f;
    else if (va && va.isColor) {
      if (!out[k]) out[k] = va.clone();
      out[k].copy(va).lerp(vb, f);
    } else out[k] = f < 0.5 ? va : vb;
  }
  return out;
}
