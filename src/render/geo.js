import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Geometry helpers for the procedural world. Every prop is built from
// primitives, displaced with noise, vertex-coloured (with a baked ambient
// occlusion gradient) and merged into one mesh per zone and material, so a
// whole landscape costs a couple of draw calls.

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 3D value noise, deterministic.
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);
export function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf
  );
}
export function fbm(x, y, z, oct = 3) {
  let a = 0.5;
  let f = 1;
  let s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * (noise3(x * f, y * f, z * f) * 2 - 1);
    a *= 0.5;
    f *= 2.03;
  }
  return s;
}

// Make a geometry indexed with only position + normal (welds duplicate
// vertices so noise displacement keeps surfaces closed).
export function clean(geo, { smoothNormals = true } = {}) {
  let g = geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4);
  if (smoothNormals) g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
export function xform(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sx = 1, sy = 1, sz = 1 } = {}) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(s * sx, s * sy, s * sz);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

export function displace(geo, amp, freq, seed = 0) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const d = fbm(x * freq + seed, y * freq, z * freq - seed, 3) * amp;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

// Strip of quads following `points`, `widths[i]` wide along `sides[i]`.
// `edgeFn(i, side)` can offset alternate edge vertices (leaflets).
export function ribbon(points, widths, sides, { edge = null } = {}) {
  const n = points.length;
  const pos = new Float32Array(n * 3 * 3);
  const idx = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const s = sides[i];
    const w = widths[i];
    const e = edge ? edge(i) : 1;
    for (let k = 0; k < 3; k++) {
      const f = (k - 1) * w * (k === 1 ? 0 : e);
      const j = (i * 3 + k) * 3;
      pos[j] = p.x + s.x * f;
      pos[j + 1] = p.y + s.y * f - (k === 1 ? 0 : Math.abs(f) * 0.25);
      pos[j + 2] = p.z + s.z * f;
    }
    if (i < n - 1) {
      for (let k = 0; k < 2; k++) {
        const a = i * 3 + k;
        const b = a + 3;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Collects world-space parts and merges them per material bucket. Each part
// carries its anchor (pivot) so the zone-reveal shader can grow it from there,
// a glow factor for emissive bits, and baked vertex colours.
export class PropBuilder {
  constructor(rng) {
    this.rng = rng;
    this.buckets = {};
  }

  add(geo, { color = '#ffffff', top = null, glow = 0, anchor = null, ao = 0.5, aoHeight = 1.5, jitter = 0.08, bucket = 'smooth', colorFn = null, keepUv = false } = {}) {
    let g = geo.index || keepUv ? geo : clean(geo);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUv && k === 'uv')) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position;
    const n = p.count;
    if (!anchor) {
      g.computeBoundingBox();
      const b = g.boundingBox;
      anchor = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
    }
    const c0 = new THREE.Color(color);
    const c1 = top ? new THREE.Color(top) : c0;
    const col = new Float32Array(n * 3);
    const anc = new Float32Array(n * 3);
    const gl = new Float32Array(n);
    const v = 1 - jitter + this.rng() * jitter * 2;
    const tmp = new THREE.Color();
    g.computeBoundingBox();
    const h = Math.max(1e-3, g.boundingBox.max.y - anchor.y);
    for (let i = 0; i < n; i++) {
      const y = p.getY(i);
      const t = Math.min(1, Math.max(0, (y - anchor.y) / h));
      const occ = ao + (1 - ao) * Math.min(1, Math.max(0, (y - anchor.y) / aoHeight));
      tmp.copy(c0).lerp(c1, t);
      if (colorFn) colorFn(tmp, p.getX(i), y, p.getZ(i), t);
      col[i * 3] = tmp.r * v * occ;
      col[i * 3 + 1] = tmp.g * v * occ;
      col[i * 3 + 2] = tmp.b * v * occ;
      anc[i * 3] = anchor.x;
      anc[i * 3 + 1] = anchor.y;
      anc[i * 3 + 2] = anchor.z;
      gl[i] = glow;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aAnchor', new THREE.BufferAttribute(anc, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
    (this.buckets[bucket] || (this.buckets[bucket] = [])).push(g);
    return g;
  }

  build(materials) {
    const meshes = [];
    for (const [name, parts] of Object.entries(this.buckets)) {
      if (!parts.length) continue;
      const merged = mergeGeometries(parts, false);
      for (const p of parts) p.dispose();
      const mesh = new THREE.Mesh(merged, materials[name]);
      mesh.frustumCulled = false;
      meshes.push(mesh);
    }
    this.buckets = {};
    return meshes;
  }
}

// three r169's ConeGeometry drops half of each row's triangles when
// heightSegments > 1 (fixed upstream in r170). A cylinder with a vanishing
// top radius generates every face; clean() then welds the tip into one vertex.
export function cone(radius, height, radial = 8, heightSegs = 1) {
  return new THREE.CylinderGeometry(radius * 1e-6, radius, height, radial, heightSegs);
}
