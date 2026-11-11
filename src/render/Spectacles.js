import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, xform } from './geo.js';
import { WATER_Y } from './Water.js';

// Living set pieces around (never on) the board, one set per zone: things
// that move, glow and drift so each map feels like a place rather than a
// backdrop. Almost everything is animated on the GPU: a crowd of instances
// shares one draw call, and its motion is a function of time and a per-
// instance seed in the vertex shader, so nothing is updated per frame on the
// CPU except a handful of big hero objects (balloons, whales, beams).
//
// Every spectacle fades in and out with its zone through uFade (instances
// shrink to nothing) or, for the hero objects, their scale.

const TAU = Math.PI * 2;

// ------------------------------------------------------------ shader helpers
// A MeshBasicMaterial (so fog and tone mapping come for free) whose vertices
// are placed by `vertex` GLSL, which must leave the world position in
// `transformed`. Instanced materials get aSeed (vec4, 0..1) and aTint.
function gpuMaterial(U, { key, vertex, fragment = '', decl = '', instanced = true, additive = false, transparent = false, fog = true, side = THREE.FrontSide, depthWrite }) {
  const blend = additive || transparent;
  const mat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: blend,
    depthWrite: depthWrite ?? !blend,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog,
    side,
  });
  mat.defines = { USE_UV: '' };
  const head = `uniform float uTime; uniform float uFade; uniform float uBurn; varying vec3 vTint; varying float vA;\n${decl}\n`;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uFade = U.uFade;
    sh.uniforms.uBurn = U.uBurn;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${head}${instanced ? 'attribute vec4 aSeed; attribute vec3 aTint;' : ''}`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position); vA = 1.0; vTint = ${instanced ? 'aTint' : 'vec3(1.0)'};\n${vertex}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${head}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= vTint; diffuseColor.a *= vA;\n${fragment}`);
  };
  mat.customProgramCacheKey = () => `spectacle-${key}`;
  return mat;
}

// count copies of geo as one instanced draw, each with a random seed and a
// tint picked from colors (multiplied by glow so it can bloom).
function crowd(geo, count, mat, rng, colors, glow = 1) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = geo.index;
  for (const [k, v] of Object.entries(geo.attributes)) g.setAttribute(k, v);
  const seed = new Float32Array(count * 4);
  const tint = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = rng();
    c.set(colors[Math.floor(rng() * colors.length)]).multiplyScalar(glow * (0.8 + rng() * 0.4));
    tint.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  g.instanceCount = count;
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

// A flat band, uv.x along its length and uv.y across it, bent along a curve
// given by fn(t) -> { p: Vector3, up: Vector3 }.
function band(segs, fn) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const { p, up } = fn(t);
    pos.push(p.x, p.y, p.z, p.x + up.x, p.y + up.y, p.z + up.z);
    uv.push(t, 0, t, 1);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function vertexColored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

// ------------------------------------------------------------ hero props
// A striped hot-air balloon (envelope, ropes, basket) as one vertex-coloured mesh.
function balloonGeometry(rng, palette) {
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16; // bottom (mouth) to top
    const r = t < 0.35 ? 0.55 + (t / 0.35) * 1.75 : 2.3 * Math.sin(((1 - t) / 0.65) * Math.PI * 0.5) ** 0.6;
    prof.push(new THREE.Vector2(Math.max(0.02, r), t * 4.6));
  }
  const gores = 12;
  const env = new THREE.LatheGeometry(prof, gores * 2).toNonIndexed();
  const p = env.attributes.position;
  const col = new Float32Array(p.count * 3);
  const cA = new THREE.Color(palette[0]);
  const cB = new THREE.Color(palette[1]);
  const cC = new THREE.Color(palette[2] || palette[0]);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    // colour each triangle by the gore its centre sits in, with a band near the top
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const gore = Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * gores);
    tmp.copy(gore % 2 ? cA : cB);
    if (y > 2.6 && y < 3.1) tmp.copy(cC);
    for (let k = 0; k < 3; k++) col.set([tmp.r, tmp.g, tmp.b], (i + k) * 3);
  }
  env.setAttribute('color', new THREE.BufferAttribute(col, 3));
  env.deleteAttribute('uv');
  const parts = [env];
  const basket = vertexColored(xform(new THREE.BoxGeometry(0.7, 0.5, 0.7), { y: -1.25 }), '#7a4a22');
  basket.deleteAttribute('uv');
  parts.push(basket);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const rope = new THREE.CylinderGeometry(0.025, 0.025, 1.15, 3);
    xform(rope, { x: sx * 0.42, y: -0.45, z: sz * 0.42, rz: sx * 0.12, rx: -sz * 0.12 });
    const r = vertexColored(rope, '#3a2a1a');
    r.deleteAttribute('uv');
    parts.push(r);
  }
  for (const g of parts) g.deleteAttribute('normal');
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

function balloons(rng, n, palettes, { rMin = 45, rMax = 120, yMin = 8, yMax = 40 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, emissive: '#ffb070', emissiveIntensity: 0.06 });
  const items = [];
  const group = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(balloonGeometry(rng, palettes[i % palettes.length]), mat);
    const s = 1.2 + rng() * 1.4;
    items.push({ m, s, a: (i / n) * TAU + rng() * 0.5, r: rMin + rng() * (rMax - rMin), y: yMin + rng() * (yMax - yMin), ph: rng() * TAU, w: (rng() < 0.5 ? -1 : 1) * (0.004 + rng() * 0.006) });
    group.add(m);
  }
  return {
    group,
    update(t, dt, fade) {
      for (const b of items) {
        b.a += dt * b.w;
        b.m.position.set(Math.cos(b.a) * b.r, b.y + Math.sin(t * 0.35 + b.ph) * 1.6, Math.sin(b.a) * b.r);
        b.m.rotation.y = t * 0.05 + b.ph;
        b.m.rotation.z = Math.sin(t * 0.5 + b.ph) * 0.04;
        b.m.scale.setScalar(Math.max(0.001, b.s * fade));
      }
    },
  };
}

// ------------------------------------------------------------ crowds
// Butterflies fluttering in loose loops over the island's grass.
function butterflies(U, rng, count, colors) {
  const wing = new THREE.PlaneGeometry(0.2, 0.26, 1, 1);
  wing.rotateX(-Math.PI / 2);
  const l = wing.clone().translate(-0.1, 0, 0);
  const r = wing.clone().translate(0.1, 0, 0);
  const geo = mergeGeometries([l, r]);
  const mat = gpuMaterial(U, {
    key: 'butterfly',
    side: THREE.DoubleSide,
    vertex: `
      float side = sign(position.x);
      float flap = 0.25 + sin(uTime * 15.0 + aSeed.w * 40.0) * 1.0;
      vec3 p = vec3(side * abs(position.x) * cos(flap), abs(position.x) * sin(flap), position.z);
      float a = aSeed.x * 6.2832 + uTime * (0.08 + aSeed.y * 0.12) * (aSeed.w > 0.5 ? 1.0 : -1.0);
      float r = 12.5 + aSeed.y * 12.0 + sin(uTime * 0.6 + aSeed.z * 9.0) * 1.8;
      vec3 c = vec3(cos(a) * r, 0.5 + aSeed.z * 2.6 + sin(uTime * 1.7 + aSeed.w * 12.0) * 0.45, sin(a) * r);
      float dir = aSeed.w > 0.5 ? 1.0 : -1.0;
      vec3 fwd = vec3(-sin(a), 0.0, cos(a)) * dir;
      vec3 rt = vec3(fwd.z, 0.0, -fwd.x);
      p *= uFade * (0.8 + aSeed.z * 0.6);
      // the world burning: they turn into sparks, small and fast, drifting
      // up off the grass in the heat and starting again
      p *= 1.0 - 0.55 * uBurn;
      c.y += uBurn * fract(uTime * (0.2 + aSeed.y * 0.2) + aSeed.x) * 7.0;
      c.xz += uBurn * vec2(sin(uTime * 3.1 + aSeed.w * 30.0), cos(uTime * 2.7 + aSeed.z * 30.0)) * 0.6;
      transformed = c + rt * p.x + vec3(0.0, 1.0, 0.0) * p.y + fwd * p.z;`,
    fragment: `float e = length(vUv - 0.5); diffuseColor.rgb *= 1.0 - smoothstep(0.35, 0.6, e) * 0.45;
      float fl = 0.7 + 0.3 * sin(uTime * 30.0 + vUv.x * 9.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.35), 1.0 - e * 1.6) * 2.6 * fl, uBurn);`,
  });
  return crowd(geo, count, mat, rng, colors, 1.25);
}

// Paper sky lanterns rising forever, glowing warm from the inside.
function lanterns(U, rng, count, colors, { rMin = 30, rMax = 190, base = -40, span = 150 } = {}) {
  const geo = new THREE.CylinderGeometry(0.62, 0.46, 1.25, 8, 1, false);
  const mat = gpuMaterial(U, {
    key: 'lantern',
    decl: `const float R0 = ${rMin.toFixed(1)}; const float R1 = ${rMax.toFixed(1)}; const float B = ${base.toFixed(1)}; const float S = ${span.toFixed(1)};`,
    vertex: `
      float a = aSeed.x * 6.2832 + uTime * 0.004;
      float r = R0 + aSeed.y * (R1 - R0);
      float h = mod(aSeed.z * S + uTime * (0.7 + aSeed.w * 1.1), S);
      float s = smoothstep(0.0, 10.0, h) * smoothstep(S, S - 25.0, h) * uFade * (1.0 + aSeed.w * 1.4);
      vec3 c = vec3(cos(a) * r + sin(uTime * 0.4 + aSeed.w * 30.0) * 1.2, B + h, sin(a) * r + cos(uTime * 0.33 + aSeed.x * 20.0) * 1.2);
      transformed = c + position * s;`,
    fragment: `diffuseColor.rgb *= mix(1.7, 0.75, vUv.y) * (0.9 + 0.1 * sin(uTime * 9.0 + vUv.x * 30.0));`,
  });
  return crowd(geo, count, mat, rng, colors, 1.6);
}

// Drifting blossom petals / embers tumbling slowly down around the map.
function drifters(U, rng, count, colors, { rMin = 16, rMax = 70, top = 40, span = 70, size = 0.22, glow = 1.1, key = 'petal' } = {}) {
  const geo = new THREE.PlaneGeometry(size, size * 0.7);
  const mat = gpuMaterial(U, {
    key,
    side: THREE.DoubleSide,
    decl: `const float R0 = ${rMin.toFixed(1)}; const float R1 = ${rMax.toFixed(1)}; const float T = ${top.toFixed(1)}; const float S = ${span.toFixed(1)};
      mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
      mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }`,
    vertex: `
      float h = mod(aSeed.z * S + uTime * (0.6 + aSeed.w * 0.8), S);
      float a = aSeed.x * 6.2832 + uTime * 0.03 + h * 0.02;
      float r = R0 + aSeed.y * (R1 - R0);
      vec3 c = vec3(cos(a) * r, T - h, sin(a) * r);
      c.x += sin(uTime * 0.7 + aSeed.w * 20.0) * 2.0;
      vec3 p = rotY(uTime * (1.0 + aSeed.y) + aSeed.x * 9.0) * rotX(uTime * (1.5 + aSeed.w) + aSeed.z * 7.0) * position;
      float s = smoothstep(0.0, 6.0, h) * smoothstep(S, S - 6.0, h) * uFade;
      transformed = c + p * s;`,
  });
  return crowd(geo, count, mat, rng, colors, glow);
}

// ------------------------------------------------------------ zone 0: Emerald Coast
function rainbow(U, sunAzimDeg) {
  // opposite the sun, as a real one would be
  const az = THREE.MathUtils.degToRad(sunAzimDeg) + Math.PI;
  const dir = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
  const R = 150;
  const W = 16;
  const geo = band(120, (t) => {
    const th = Math.PI * (0.02 + t * 0.96);
    const out = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
    return { p: out.clone().multiplyScalar(R), up: out.multiplyScalar(W) };
  });
  const mat = gpuMaterial(U, {
    key: 'rainbow',
    instanced: false,
    additive: true,
    fog: false,
    side: THREE.DoubleSide,
    // (a world on fire has no rainbow)
    vertex: `transformed *= max(uFade * (1.0 - uBurn), 0.001);`,
    fragment: `
      float y = vUv.y;
      vec3 rb = clamp(abs(mod(y * 5.2 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      float ends = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
      float a = sin(y * 3.1416) * ends * 0.34 * uFade * (0.85 + 0.15 * sin(uTime * 0.4));
      diffuseColor.rgb = rb * a;`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(dir.multiplyScalar(310)).setY(WATER_Y - 8);
  m.lookAt(0, m.position.y, 0);
  m.frustumCulled = false;
  return m;
}

function sailboats(rng, n) {
  const hullMat = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.5 });
  const sailMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.05 });
  const stripes = ['#ff5d5d', '#3a7dff', '#ffd23f', '#38d6a0'];
  const group = new THREE.Group();
  const items = [];
  for (let i = 0; i < n; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(xform(new THREE.CylinderGeometry(0.9, 0.5, 4.2, 8, 1), { rx: Math.PI / 2, sy: 1, sz: 0.5, sx: 1 }), hullMat);
    hull.scale.set(1, 0.45, 1);
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 5), hullMat);
    mast.position.y = 2.6;
    boat.add(mast);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, -1.7, 0, 4.9, 0.05, 0, 0.6, 0.05], 3));
    sailGeo.computeVertexNormals();
    boat.add(new THREE.Mesh(sailGeo, sailMat));
    const jib = new THREE.BufferGeometry();
    jib.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0.25, 0, 4.4, 0.15, 0, 0.6, 1.9], 3));
    jib.computeVertexNormals();
    boat.add(new THREE.Mesh(jib, new THREE.MeshStandardMaterial({ color: stripes[i % stripes.length], roughness: 0.7, side: THREE.DoubleSide })));
    group.add(boat);
    items.push({ boat, a: rng() * TAU, r: 48 + rng() * 70, w: (rng() < 0.5 ? -1 : 1) * (0.006 + rng() * 0.006), ph: rng() * TAU, s: 1 + rng() * 0.6 });
  }
  return {
    group,
    update(t, dt, fade) {
      for (const b of items) {
        b.a += dt * b.w;
        const x = Math.cos(b.a) * b.r;
        const z = Math.sin(b.a) * b.r;
        b.boat.position.set(x, WATER_Y + 0.3 + Math.sin(t * 1.3 + b.ph) * 0.18, z);
        b.boat.rotation.set(Math.sin(t * 1.1 + b.ph) * 0.05, -b.a + (b.w > 0 ? 0 : Math.PI), Math.sin(t * 0.9 + b.ph) * 0.08 + 0.1);
        b.boat.scale.setScalar(Math.max(0.001, b.s * fade));
      }
    },
  };
}

// ------------------------------------------------------------ zone 1: Golden Canyon
function dustDevils(U, rng, n) {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(4.5, 0.5, 38, 28, 16, true);
  geo.translate(0, 19, 0);
  const mat = gpuMaterial(U, {
    key: 'dustdevil',
    instanced: false,
    transparent: true,
    side: THREE.DoubleSide,
    vertex: `
      float k = position.y / 38.0;
      transformed.x += sin(position.y * 0.16 - uTime * 1.3) * 2.2 * k;
      transformed.z += cos(position.y * 0.13 - uTime * 1.1) * 2.2 * k;
      transformed *= vec3(uFade, max(uFade, 0.001), uFade);`,
    fragment: `
      float swirl = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 3.0 + vUv.y * 14.0 - uTime * 5.0);
      float a = swirl * sin(vUv.y * 3.1416) * smoothstep(0.0, 0.12, vUv.y) * 0.5 * uFade;
      diffuseColor.rgb = vec3(0.82, 0.5, 0.3);
      diffuseColor.a = a;`,
  });
  const items = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    group.add(m);
    items.push({ m, a: rng() * TAU, r: 58 + rng() * 60, w: (rng() < 0.5 ? -1 : 1) * (0.01 + rng() * 0.012), ph: rng() * TAU });
  }
  return {
    group,
    update(t, dt) {
      for (const d of items) {
        d.a += dt * d.w;
        const r = d.r + Math.sin(t * 0.2 + d.ph) * 10;
        d.m.position.set(Math.cos(d.a) * r, WATER_Y - 1, Math.sin(d.a) * r);
        d.m.rotation.y = t * 2.2;
      }
    },
  };
}

// ------------------------------------------------------------ zone 2: Neon Night
function aurora(U, rng) {
  const group = new THREE.Group();
  const mat = gpuMaterial(U, {
    key: 'aurora',
    instanced: false,
    additive: true,
    fog: false,
    side: THREE.DoubleSide,
    vertex: `
      float w = sin(position.x * 0.012 + uTime * 0.12) * 18.0 + sin(position.x * 0.031 - uTime * 0.2) * 7.0;
      transformed.z += w;
      transformed.y *= max(uFade, 0.001);`,
    fragment: `
      float y = vUv.y;
      float rays = 0.55 + 0.45 * sin(vUv.x * 90.0 + uTime * 0.7 + sin(vUv.x * 13.0 - uTime * 0.25) * 4.0);
      float flow = 0.6 + 0.4 * sin(vUv.x * 9.0 - uTime * 0.35);
      float a = smoothstep(0.0, 0.06, y) * pow(1.0 - y, 4.0) * rays * rays * flow;
      a *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * uFade;
      vec3 col = mix(vec3(0.1, 1.0, 0.45), vec3(0.5, 0.08, 0.95), smoothstep(0.2, 0.6, y));
      diffuseColor.rgb = col * a * 0.42;`,
  });
  for (let i = 0; i < 3; i++) {
    const L = 520;
    const geo = band(160, (t) => ({ p: new THREE.Vector3((t - 0.5) * L, 0, 0), up: new THREE.Vector3(0, 70 + i * 12, 0) }));
    const m = new THREE.Mesh(geo, mat);
    const a = -1.9 + i * 0.75 + rng() * 0.3;
    const d = 250 + i * 30;
    m.position.set(Math.cos(a) * d, 55 + i * 14, Math.sin(a) * d);
    m.lookAt(0, m.position.y, 0);
    m.frustumCulled = false;
    group.add(m);
  }
  return group;
}

// Flying cars streaming around the skyline on stacked circular sky lanes.
function skyTraffic(U, rng, count) {
  const geo = new THREE.BoxGeometry(0.9, 0.45, 2.6);
  const mat = gpuMaterial(U, {
    key: 'traffic',
    vertex: `
      float lane = floor(aSeed.y * 5.0);
      float r = 58.0 + lane * 22.0 + (aSeed.z - 0.5) * 3.0;
      float dir = mod(lane, 2.0) < 0.5 ? 1.0 : -1.0;
      float y = 7.0 + floor(aSeed.z * 4.0) * 9.0 + sin(uTime * 0.5 + aSeed.x * 40.0) * 0.4;
      float a = aSeed.x * 6.2832 + dir * uTime * (9.0 + aSeed.w * 6.0) / r;
      vec3 c = vec3(cos(a) * r, y, sin(a) * r);
      vec3 fwd = vec3(-sin(a), 0.0, cos(a)) * dir;
      vec3 rt = vec3(fwd.z, 0.0, -fwd.x);
      vec3 p = position * uFade;
      transformed = c + rt * p.x + vec3(0.0, p.y, 0.0) + fwd * p.z;`,
    fragment: `diffuseColor.rgb *= 0.6 + 1.2 * smoothstep(0.2, 1.0, vUv.y);`,
  });
  return crowd(geo, count, mat, rng, ['#38f6ff', '#ff3df2', '#ffb627', '#ffffff', '#ff4060'], 2.2);
}

function searchlights(U, rng, n) {
  const group = new THREE.Group();
  const geo = new THREE.ConeGeometry(9, 150, 24, 1, true);
  geo.translate(0, -75, 0); // tip at the origin, opening upward after the flip
  geo.rotateX(Math.PI);
  const mat = gpuMaterial(U, {
    key: 'searchlight',
    instanced: false,
    additive: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
    vertex: `transformed *= max(uFade, 0.001);`,
    fragment: `
      float a = (1.0 - vUv.y) * 0.0 + vUv.y;
      float along = 1.0 - vUv.y;
      float soft = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 2.0);
      diffuseColor.rgb = vec3(0.55, 0.7, 1.0) * pow(along, 1.4) * 0.12 * (0.7 + 0.3 * soft) * uFade;`,
  });
  const items = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    const a = (i / n) * TAU + rng() * 0.4;
    const r = 150 + rng() * 50;
    m.position.set(Math.cos(a) * r, WATER_Y + 30 + rng() * 30, Math.sin(a) * r);
    m.frustumCulled = false;
    group.add(m);
    items.push({ m, ph: rng() * TAU, sp: 0.25 + rng() * 0.25 });
  }
  return {
    group,
    update(t) {
      for (const s of items) {
        s.m.rotation.set(Math.sin(t * s.sp + s.ph) * 0.45, 0, Math.cos(t * s.sp * 0.8 + s.ph) * 0.45);
      }
    },
  };
}

function shootingStars(U, rng, count) {
  const geo = new THREE.PlaneGeometry(0.5, 14);
  geo.translate(0, 7, 0);
  const mat = gpuMaterial(U, {
    key: 'shootingstar',
    additive: true,
    fog: false,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertex: `
      float cyc = 7.0 + aSeed.w * 9.0;
      float k = fract(uTime / cyc + aSeed.x);
      float live = step(k, 0.09);
      float f = k / 0.09;
      float a = aSeed.y * 6.2832;
      vec3 start = vec3(cos(a) * 260.0, 140.0 + aSeed.z * 80.0, sin(a) * 260.0);
      vec3 dir = normalize(vec3(-sin(a) * 0.8 + 0.2, -0.45, cos(a) * 0.8));
      vec3 up = -dir;
      vec3 side = normalize(cross(up, normalize(start)));
      vA = live * sin(f * 3.1416) * uFade;
      transformed = start + dir * f * 150.0 + side * position.x + up * position.y * (0.4 + f);`,
    fragment: `diffuseColor.rgb *= (1.0 - vUv.y) * vA * 2.5;`,
  });
  return crowd(geo, count, mat, rng, ['#ffffff', '#bfe0ff'], 1.5);
}

// ------------------------------------------------------------ zone 3: Cyber Overdrive
function hologram(U) {
  const group = new THREE.Group();
  const knotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#38f6ff').multiplyScalar(0.8), wireframe: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(20, 4.2, 220, 14, 2, 3), knotMat);
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2bd6').multiplyScalar(0.9), wireframe: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), coreMat);
  const holder = new THREE.Group();
  holder.add(knot, core);
  holder.position.set(-150, 62, -175);
  group.add(holder);
  // a beam of light projecting the hologram from the sea
  const beamMat = gpuMaterial(U, {
    key: 'holobeam',
    instanced: false,
    additive: true,
    fog: false,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertex: `transformed *= max(uFade, 0.001);`,
    fragment: `diffuseColor.rgb = vec3(0.2, 0.9, 1.0) * (0.06 + 0.06 * sin(vUv.y * 80.0 - uTime * 6.0)) * (1.0 - vUv.y * 0.5) * uFade;`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(26, 3, 95, 32, 1, true), beamMat);
  beam.position.set(-150, WATER_Y + 47, -175);
  beam.frustumCulled = false;
  group.add(beam);
  return {
    group,
    update(t, dt, fade) {
      knot.rotation.set(t * 0.13, t * 0.21, 0);
      core.rotation.set(-t * 0.3, t * 0.17, t * 0.1);
      const pulse = 1 + Math.sin(t * 2.2) * 0.04;
      holder.scale.setScalar(Math.max(0.001, fade * pulse));
      knotMat.color.setHSL(0.5 + Math.sin(t * 0.15) * 0.06, 1, 0.5).multiplyScalar(0.8);
      knotMat.opacity = 0.36 + 0.12 * Math.sin(t * 7.0) * Math.sin(t * 1.3);
    },
  };
}

function dataRain(U, rng, count) {
  const geo = new THREE.BoxGeometry(0.09, 5, 0.09);
  const mat = gpuMaterial(U, {
    key: 'datarain',
    additive: true,
    depthWrite: false,
    vertex: `
      float a = aSeed.x * 6.2832;
      float r = 28.0 + aSeed.y * 170.0;
      float S = 130.0;
      float h = mod(aSeed.z * S + uTime * (16.0 + aSeed.w * 22.0), S);
      vec3 c = vec3(cos(a) * r, 95.0 - h, sin(a) * r);
      vA = smoothstep(0.0, 10.0, h) * smoothstep(S, S - 20.0, h);
      transformed = c + position * vec3(1.0, 0.6 + aSeed.w, 1.0) * uFade;`,
    fragment: `diffuseColor.rgb *= vA * mix(2.2, 0.0, vUv.y);`,
  });
  return crowd(geo, count, mat, rng, ['#38f6ff', '#ff2bd6', '#7dff6a'], 1.4);
}

function ringedPlanet(U) {
  const group = new THREE.Group();
  const az = THREE.MathUtils.degToRad(120);
  const pos = new THREE.Vector3(Math.sin(az) * 380, 70, Math.cos(az) * 380);
  const planetMat = gpuMaterial(U, {
    key: 'planet',
    instanced: false,
    fog: false,
    vertex: `transformed *= max(uFade, 0.001);`,
    fragment: `
      float y = vUv.y;
      float bands = 0.5 + 0.5 * sin(y * 46.0 + sin(vUv.x * 12.0 + uTime * 0.05) * 1.5);
      vec3 col = mix(vec3(0.04, 0.02, 0.16), vec3(0.1, 0.75, 0.95), bands * 0.75);
      col = mix(col, vec3(1.0, 0.85, 0.4), smoothstep(0.82, 1.0, y) * 0.7);
      diffuseColor.rgb = col;`,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(55, 48, 32), planetMat);
  planet.rotation.z = 0.35;
  const ringMat = gpuMaterial(U, {
    key: 'planetring',
    instanced: false,
    additive: true,
    fog: false,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertex: `transformed *= max(uFade, 0.001);`,
    fragment: `
      float r = vUv.y;
      float rings = 0.5 + 0.5 * sin(r * 80.0);
      float a = smoothstep(0.0, 0.1, r) * smoothstep(1.0, 0.85, r) * (0.35 + 0.65 * rings) * uFade;
      diffuseColor.rgb = mix(vec3(0.2, 0.95, 1.0), vec3(1.0, 0.4, 0.9), r) * a * 0.9;`,
  });
  const ringGeo = band(160, (t) => {
    const th = t * TAU;
    const out = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    return { p: out.clone().multiplyScalar(72), up: out.multiplyScalar(50) };
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.set(0.32, 0, 0.35);
  const holder = new THREE.Group();
  holder.add(planet, ring);
  holder.position.copy(pos);
  group.add(holder);
  for (const m of [planet, ring]) m.frustumCulled = false;
  return {
    group,
    update(t) {
      planet.rotation.y = t * 0.02;
    },
  };
}

function pulseRings(n, color) {
  const group = new THREE.Group();
  const items = [];
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 128, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = WATER_Y + 0.6;
    m.frustumCulled = false;
    group.add(m);
    items.push({ m, mat, off: i / n });
  }
  return {
    group,
    update(t, dt, fade) {
      for (const p of items) {
        const k = (t / 7 + p.off) % 1;
        p.m.scale.setScalar(30 + k * 230);
        p.mat.opacity = Math.sin(k * Math.PI) * 0.7 * fade;
      }
    },
  };
}

// ------------------------------------------------------------ zone 4: Sunset Heavens
function whaleGeometry() {
  const prof = [];
  const L = 22;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const r = Math.sin(Math.pow(t, 0.62) * Math.PI) * 3.4 * (1 - t * 0.35) + 0.08;
    prof.push(new THREE.Vector2(r, t * L));
  }
  const body = new THREE.LatheGeometry(prof, 20);
  body.rotateX(Math.PI / 2); // along +z, nose at z = L
  body.translate(0, 0, -L / 2);
  body.scale(1, 0.8, 1);
  const parts = [body];
  // tail flukes
  for (const s of [-1, 1]) {
    const f = new THREE.SphereGeometry(1, 10, 6);
    xform(f, { sx: 3.6, sy: 0.22, sz: 1.4, x: s * 2.6, z: -L / 2 - 0.6, ry: s * 0.5 });
    parts.push(f);
  }
  // pectoral fins
  for (const s of [-1, 1]) {
    const f = new THREE.SphereGeometry(1, 10, 6);
    xform(f, { sx: 3.2, sy: 0.2, sz: 1.1, x: s * 4.2, y: -1.2, z: 3.5, ry: -s * 0.6, rz: s * 0.35 });
    parts.push(f);
  }
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  g.computeVertexNormals();
  return g;
}

function skyWhales(rng, n) {
  const U = { uTime: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ color: '#6c56c4', roughness: 0.5, metalness: 0.05, emissive: '#ff7ab0', emissiveIntensity: 0.22 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float back = clamp(-position.z / 11.0, 0.0, 1.0);
        transformed.y += sin(position.z * 0.22 - uTime * 1.4) * 1.3 * back * back;
        // pale belly, darker back
        `);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>');
  };
  mat.customProgramCacheKey = () => 'spectacle-whale';
  const geo = whaleGeometry();
  const group = new THREE.Group();
  const items = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    items.push({ m, a: (i / n) * TAU + rng(), r: 55 + rng() * 45, y: -6 + rng() * 26, w: (i % 2 ? -1 : 1) * (0.022 + rng() * 0.01), s: 1.1 + rng() * 0.6, ph: rng() * TAU });
  }
  return {
    group,
    update(t, dt, fade) {
      U.uTime.value = t;
      for (const w of items) {
        w.a += dt * w.w;
        const y = w.y + Math.sin(t * 0.25 + w.ph) * 4;
        w.m.position.set(Math.cos(w.a) * w.r, y, Math.sin(w.a) * w.r);
        // swim along the circle, nose first
        const dir = Math.sign(w.w);
        w.m.rotation.set(Math.cos(t * 0.25 + w.ph) * 0.08, -w.a + (dir > 0 ? Math.PI : 0), Math.sin(t * 0.3 + w.ph) * 0.06);
        w.m.scale.setScalar(Math.max(0.001, w.s * fade));
      }
    },
  };
}

// ------------------------------------------------------------ assembly
const BUILDERS = [
  // Emerald Coast: rainbow, balloons, butterflies, sailboats
  (U, rng) => {
    const b = balloons(rng, 9, [['#ff4d4d', '#ffd23f', '#ffffff'], ['#3a7dff', '#ffffff', '#ffd23f'], ['#38d6a0', '#ffef7a', '#ff5d8f'], ['#b47cff', '#ffd6f0', '#ffffff']]);
    const s = sailboats(rng, 7);
    return { objects: [rainbow(U, 35), butterflies(U, rng, 140, ['#ffb020', '#5ab4ff', '#ffe14a', '#ff7ac0', '#ffffff']), b.group, s.group], updaters: [b, s] };
  },
  // Golden Canyon: lantern festival, warm balloons, dust devils
  (U, rng) => {
    const b = balloons(rng, 6, [['#e8562a', '#ffcf3f', '#7a2a10'], ['#ffb040', '#a0301c', '#fff0c0'], ['#d8452a', '#f2e2c0', '#ffcf3f']], { yMin: 14, yMax: 44 });
    const d = dustDevils(U, rng, 4);
    return { objects: [lanterns(U, rng, 260, ['#ffb347', '#ff9a3c', '#ffd27a']), b.group, d.group], updaters: [b, d] };
  },
  // Neon Night: aurora, flying traffic, searchlights, shooting stars
  (U, rng) => {
    const s = searchlights(U, rng, 7);
    return { objects: [aurora(U, rng), skyTraffic(U, rng, 240), s.group, shootingStars(U, rng, 10)], updaters: [s] };
  },
  // Cyber Overdrive: hologram, data rain, ringed planet, sonar pulses
  (U, rng) => {
    const h = hologram(U);
    const p = ringedPlanet(U);
    const r = pulseRings(3, '#38f6ff');
    return { objects: [h.group, dataRain(U, rng, 520), p.group, r.group], updaters: [h, p, r] };
  },
  // Sunset Heavens: sky whales, lanterns, drifting blossom petals
  (U, rng) => {
    const w = skyWhales(rng, 3);
    return {
      objects: [
        w.group,
        lanterns(U, rng, 200, ['#ffb27a', '#ff8ac0', '#ffe08a'], { rMin: 40, rMax: 200, base: -60, span: 170 }),
        drifters(U, rng, 320, ['#ffc2dc', '#ff9ac8', '#fff0f6'], { rMin: 20, rMax: 75, top: 30, span: 70, glow: 1.15 }),
      ],
      updaters: [w],
    };
  },
  // Galactic Core: its spectacle is the galaxy itself (see Space.js)
  () => ({ objects: [], updaters: [] }),
];

export function buildSpectacle(zone) {
  const U = { uTime: { value: 0 }, uFade: { value: zone === 0 ? 1 : 0 }, uBurn: { value: 0 } };
  const rng = mulberry32(900 + zone * 17);
  const { objects, updaters } = BUILDERS[zone](U, rng);
  const group = new THREE.Group();
  for (const o of objects) group.add(o);
  let fade = U.uFade.value;
  return {
    group,
    setFade(f) {
      fade = f;
      U.uFade.value = f;
    },
    // 0..1: the world on fire (the epilogue's meteor storm)
    setBurn(b) {
      U.uBurn.value = b;
    },
    update(time, dt) {
      U.uTime.value = time;
      for (const u of updaters) u.update(time, dt, fade);
    },
  };
}
