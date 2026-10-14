import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PropBuilder, mulberry32, displace, ribbon, xform, clean } from './geo.js';
import { makeRevealUniforms, propMaterials, makeCheckerMaterial, addReveal } from './materials.js';
import { islandRadius, GRASS_Y } from './Island.js';
import { makeWaterfall, WATER_Y } from './Water.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// A random spot on the island's grass ring, outside the arena platform.
function islandSpot(rng, { margin = 1.4, avoidSouth = false } = {}) {
  for (let i = 0; i < 50; i++) {
    const th = rng() * TAU;
    const R = islandRadius(th);
    const r = 13 + rng() * (R - 13 - margin);
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (Math.abs(x) < 12.8 && Math.abs(z) < 12.8) continue;
    if (avoidSouth && z > 9 && Math.abs(x) < 16) continue;
    return { x, z, r, th };
  }
  return { x: 20, z: -20, r: 28, th: -0.8 };
}

// ------------------------------------------------------------------ props
function palm(b, rng, x, y, z, s = 1) {
  const H = (4.2 + rng() * 1.8) * s;
  const lean = (0.5 + rng() * 0.8) * s;
  const ld = rng() * TAU;
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(V(x + Math.cos(ld) * lean * t * t, y + t * H, z + Math.sin(ld) * lean * t * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 14, 0.2 * s, 7, false);
  const p = tube.attributes.position;
  const c = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) {
    const ring = Math.floor(k / 8);
    const t = ring / 14;
    curve.getPointAt(Math.min(1, t), c);
    const f = 1.25 - 0.55 * t;
    p.setXYZ(k, c.x + (p.getX(k) - c.x) * f, c.y + (p.getY(k) - c.y) * f, c.z + (p.getZ(k) - c.z) * f);
  }
  tube.computeVertexNormals();
  const anchor = V(x, y, z);
  b.add(tube, {
    color: '#8a5a32', top: '#b88a5a', anchor, ao: 0.6, bucket: 'smooth',
    colorFn: (col, px, py) => { if (Math.sin(py * 9) > 0.55) col.multiplyScalar(0.72); },
  });
  const top = curve.getPointAt(1);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.4;
    const L = (2.4 + rng() * 0.8) * s;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const side = V(-Math.sin(a), 0, Math.cos(a));
    const lift = 0.25 + rng() * 0.35;
    const points = [];
    const widths = [];
    const sides = [];
    for (let j = 0; j <= 10; j++) {
      const t = j / 10;
      points.push(top.clone().addScaledVector(dir, t * L).add(V(0, (Math.sin(t * Math.PI * 0.8) * lift - t * t * 1.3) * s, 0)));
      widths.push(Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI), 0.7) * 0.5 * s + 0.02);
      sides.push(side);
    }
    const fr = ribbon(points, widths, sides, { edge: (j) => (j % 2 ? 1 : 0.55) });
    b.add(fr, { color: '#2a7d34', top: '#77d062', anchor, ao: 0.9, aoHeight: 0.5, bucket: 'foliage', jitter: 0.12 });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    b.add(xform(new THREE.SphereGeometry(0.17 * s, 8, 6), { x: top.x + Math.cos(a) * 0.2 * s, y: top.y - 0.2 * s, z: top.z + Math.sin(a) * 0.2 * s }), {
      color: '#6b4220', anchor, bucket: 'smooth', ao: 1,
    });
  }
}

function sunflower(b, rng, x, y, z, s = 1) {
  const H = (1.5 + rng() * 0.7) * s;
  const anchor = V(x, y, z);
  b.add(xform(new THREE.CylinderGeometry(0.035 * s, 0.05 * s, H, 6), { x, y: y + H / 2, z }), { color: '#3f8f2c', anchor, bucket: 'foliage' });
  for (const sd of [-1, 1]) {
    const a = rng() * TAU;
    const dir = V(Math.cos(a) * sd, 0, Math.sin(a) * sd);
    const side = V(-dir.z, 0, dir.x);
    const pts = [];
    const ws = [];
    const ss = [];
    for (let j = 0; j <= 5; j++) {
      const t = j / 5;
      pts.push(V(x, y + H * 0.45, z).addScaledVector(dir, t * 0.6 * s).add(V(0, Math.sin(t * Math.PI) * 0.15 * s, 0)));
      ws.push(Math.sin(t * Math.PI) * 0.18 * s + 0.01);
      ss.push(side);
    }
    b.add(ribbon(pts, ws, ss), { color: '#3c9a32', anchor, bucket: 'foliage', ao: 1 });
  }
  const yaw = rng() * TAU;
  const tilt = 0.9 + rng() * 0.4;
  const hx = x;
  const hy = y + H;
  const head = (g) => xform(g, { rx: tilt, ry: yaw, x: hx, y: hy, z });
  b.add(head(new THREE.CylinderGeometry(0.3 * s, 0.26 * s, 0.1 * s, 18)), { color: '#5a3212', top: '#3a1e08', anchor, bucket: 'foliage', ao: 1 });
  const petals = 14;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU;
    const pg = new THREE.SphereGeometry(1, 6, 4);
    xform(pg, { sx: 0.1 * s, sy: 0.025 * s, sz: 0.26 * s, ry: -a });
    pg.translate(Math.cos(a) * 0.42 * s, 0.03 * s, Math.sin(a) * 0.42 * s);
    b.add(head(pg), { color: '#ffc21a', top: '#ffd84a', anchor, bucket: 'foliage', ao: 1, glow: 0.05 });
  }
}

function bush(b, rng, x, y, z, s = 1, colors = ['#2f8a34', '#6fcf55']) {
  const n = 2 + Math.floor(rng() * 2);
  const anchor = V(x, y, z);
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(0.6 * s, 2);
    const cg = clean(g);
    displace(cg, 0.16 * s, 1.8, rng() * 10);
    xform(cg, { sy: 0.72, x: x + (rng() - 0.5) * 0.8 * s, y: y + 0.25 * s, z: z + (rng() - 0.5) * 0.8 * s });
    b.add(cg, { color: colors[0], top: colors[1], anchor, bucket: 'foliage', ao: 0.45, aoHeight: 0.8 * s });
  }
}

function rock(b, rng, x, y, z, s = 1, color = '#8f949c', top = null) {
  const g = clean(new THREE.DodecahedronGeometry(0.6 * s, 1));
  displace(g, 0.22 * s, 1.2, rng() * 20);
  xform(g, { sy: 0.6 + rng() * 0.4, ry: rng() * TAU, x, y: y + 0.1 * s, z });
  b.add(g, { color, top: top || color, bucket: 'flat', ao: 0.55, aoHeight: 0.7 * s });
}

function flowerPatch(b, rng, x, y, z) {
  const cols = ['#ff5d8f', '#ffd43b', '#ffffff', '#b47cff'];
  const c = cols[Math.floor(rng() * cols.length)];
  for (let i = 0; i < 5; i++) {
    b.add(xform(new THREE.SphereGeometry(0.08, 6, 4), { x: x + (rng() - 0.5) * 0.7, y: y + 0.18, z: z + (rng() - 0.5) * 0.7 }), { color: c, bucket: 'foliage', glow: 0.08, ao: 1 });
  }
}

function islet(b, rng, x, y, z, r, falls, { palms = true } = {}) {
  const anchor = V(x, y - r * 0.5, z);
  b.add(xform(new THREE.CylinderGeometry(r, r * 0.97, 0.5, 30), { x, y, z }), { color: '#4fa83a', top: '#6cc54a', anchor, bucket: 'smooth', ao: 1 });
  const band = new THREE.CylinderGeometry(r * 0.97, r * 0.82, 2.6, 30, 2, true);
  const uv = band.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * TAU * r) / 1.5, (uv.getY(i) * 2.6) / 1.5);
  xform(band, { x, y: y - 1.55, z });
  b.add(band, { anchor, bucket: 'checker', keepUv: true, ao: 1 });
  const under = clean(new THREE.ConeGeometry(r * 0.82, r * 1.7, 12, 3));
  under.rotateX(Math.PI);
  displace(under, r * 0.1, 0.25, rng() * 30);
  xform(under, { x, y: y - 2.85 - r * 0.85, z });
  b.add(under, { color: '#3a2a20', top: '#6a4a34', anchor, bucket: 'smooth', ao: 0.5 });
  if (palms) {
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const d = rng() * r * 0.6;
      palm(b, rng, x + Math.cos(a) * d, y + 0.25, z + Math.sin(a) * d, 0.8 + rng() * 0.5);
    }
  }
  if (falls) {
    const a = rng() * TAU;
    falls.push(makeWaterfall(V(x + Math.cos(a) * (r - 0.3), y + 0.2, z + Math.sin(a) * (r - 0.3)), V(Math.cos(a), 0, Math.sin(a)), 1.4 + rng()));
  }
}

// Classic loop-the-loop: blue track with checkered side walls.
function loopTrack(b, rng, cx, cy, cz, R, yaw) {
  const anchor = V(cx, cy - 3, cz);
  const pts = [];
  const nrm = [];
  const lat = 3.4;
  const runs = 10;
  const toWorld = (lx, ly, lz) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return V(cx + lx * c - lz * s, cy + ly, cz + lx * s + lz * c);
  };
  const rotN = (nx, ny, nz) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return V(nx * c - nz * s, ny, nx * s + nz * c);
  };
  for (let i = 0; i <= runs; i++) {
    pts.push(toWorld(-R * 1.6 + (i / runs) * R * 1.6, 0, 0));
    nrm.push(rotN(0, 1, 0));
  }
  const loopN = 48;
  for (let i = 1; i <= loopN; i++) {
    const th = (i / loopN) * TAU;
    pts.push(toWorld(R * Math.sin(th), R * (1 - Math.cos(th)), (lat * i) / loopN));
    nrm.push(rotN(-Math.sin(th), Math.cos(th), 0));
  }
  for (let i = 1; i <= runs; i++) {
    pts.push(toWorld((i / runs) * R * 1.6, 0, lat));
    nrm.push(rotN(0, 1, 0));
  }
  const side = rotN(0, 0, 1);
  const w = 1.3;
  const floorPts = [];
  const floorW = [];
  const floorS = [];
  for (let i = 0; i < pts.length; i++) {
    floorPts.push(pts[i]);
    floorW.push(w);
    floorS.push(side);
  }
  const floor = ribbon(floorPts, floorW, floorS);
  b.add(floor, { color: '#1f4fd8', top: '#4a7dff', anchor, bucket: 'smooth', ao: 1 });
  // side walls (checker)
  for (const sd of [-1, 1]) {
    const pos = [];
    const uv = [];
    const idx = [];
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) dist += pts[i].distanceTo(pts[i - 1]);
      const base = pts[i].clone().addScaledVector(side, sd * w);
      const topP = base.clone().addScaledVector(nrm[i], 0.7);
      pos.push(base.x, base.y, base.z, topP.x, topP.y, topP.z);
      uv.push(dist / 0.7, 0, dist / 0.7, 1);
      if (i < pts.length - 1) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.add(g, { anchor, bucket: 'checker', keepUv: true, ao: 1 });
  }
  // supports down into the islet
  for (const lx of [-R * 1.2, R * 1.2]) {
    for (const lz of [0, lat]) {
      const p = toWorld(lx, -1.6, lz);
      b.add(xform(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 8), { x: p.x, y: p.y, z: p.z }), { color: '#d8dce8', anchor, bucket: 'shiny', ao: 1 });
    }
  }
}

function mountain(b, rng, x, z, rad, h, colors) {
  // a main peak with a couple of shoulders, smooth and weathered
  const peaks = [[0, 0, 1, 1], [rad * 0.55, rad * 0.2, 0.6, 0.7], [-rad * 0.5, -rad * 0.15, 0.55, 0.65]];
  const snowLine = WATER_Y + h * 0.7;
  for (const [ox, oz, sr, sh] of peaks) {
    const g = clean(new THREE.ConeGeometry(rad * sr, h * sh, 18, 10));
    displace(g, rad * sr * 0.07, 0.028, rng() * 50);
    xform(g, { x: x + ox, y: WATER_Y + (h * sh) / 2 - 2, z: z + oz, ry: rng() * TAU });
    b.add(g, {
      color: colors[0], top: colors[1], bucket: 'smooth', ao: 0.75, aoHeight: h * 0.3,
      colorFn: colors[2] ? (c, px, py) => { if (py > snowLine + Math.sin(px * 0.3) * 3) c.set(colors[2]); } : null,
    });
  }
}

function banded(bands) {
  const cols = bands.map((c) => new THREE.Color(c));
  return (c, x, y) => {
    const k = Math.floor((y + 200) / 2.6) % cols.length;
    c.copy(cols[k]);
  };
}

function mesa(b, rng, x, z, r, h, bands) {
  const g = clean(new THREE.CylinderGeometry(r * (0.75 + rng() * 0.2), r, h, 9, 8));
  displace(g, r * 0.12, 0.09, rng() * 40);
  xform(g, { x, y: WATER_Y + h / 2 - 2, z, ry: rng() * TAU });
  b.add(g, { bucket: 'flat', colorFn: banded(bands), ao: 0.6, aoHeight: h * 0.25 });
}

function arch(b, rng, x, z, R, tube, yaw, colorFn, color) {
  const g = clean(new THREE.TorusGeometry(R, tube, 7, 18, Math.PI));
  displace(g, tube * 0.25, 0.3, rng() * 9);
  xform(g, { x, y: WATER_Y - 1, z, ry: yaw });
  b.add(g, { bucket: 'flat', colorFn, color: color || '#888', ao: 0.6, aoHeight: R * 0.4 });
}

function edgesBox(b, x, y, z, w, h, d, color, glow, anchor, faceColor = '#07070f') {
  b.add(xform(new THREE.BoxGeometry(w, h, d), { x, y, z }), { color: faceColor, anchor, bucket: 'flat', ao: 1 });
  const t = Math.max(0.04, Math.min(w, h, d) * 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(xform(new THREE.BoxGeometry(t, h + t, t), { x: x + (sx * w) / 2, y, z: z + (sz * d) / 2 }), { color, glow, anchor, bucket: 'smooth', ao: 1 });
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) b.add(xform(new THREE.BoxGeometry(w + t, t, t), { x, y: y + (sy * h) / 2, z: z + (sz * d) / 2 }), { color, glow, anchor, bucket: 'smooth', ao: 1 });
    for (const sx of [-1, 1]) b.add(xform(new THREE.BoxGeometry(t, t, d + t), { x: x + (sx * w) / 2, y: y + (sy * h) / 2, z }), { color, glow, anchor, bucket: 'smooth', ao: 1 });
  }
}

// ------------------------------------------------------------------ zones
function buildCoast(b, rng, falls) {
  for (let i = 0; i < 15; i++) {
    const p = islandSpot(rng, { margin: 2.2, avoidSouth: true });
    palm(b, rng, p.x, GRASS_Y, p.z, 0.9 + rng() * 0.45);
  }
  for (let i = 0; i < 18; i++) {
    const p = islandSpot(rng);
    sunflower(b, rng, p.x, GRASS_Y, p.z, 1 + rng() * 0.6);
  }
  for (let i = 0; i < 26; i++) {
    const p = islandSpot(rng);
    bush(b, rng, p.x, GRASS_Y, p.z, 0.7 + rng() * 0.7);
  }
  for (let i = 0; i < 10; i++) {
    const p = islandSpot(rng);
    rock(b, rng, p.x, GRASS_Y, p.z, 0.6 + rng() * 0.9);
  }
  for (let i = 0; i < 30; i++) {
    const p = islandSpot(rng);
    flowerPatch(b, rng, p.x, GRASS_Y, p.z);
  }
  // floating islets, two carrying loops
  const islets = [
    [-48, 4, -62, 9, true],
    [62, 10, -54, 8, true],
    [-80, -6, 10, 7, false],
    [88, -2, 22, 6, false],
    [20, 16, -110, 10, false],
    [-30, -12, -100, 6, false],
    [-70, 22, -70, 5, false],
  ];
  for (const [x, y, z, r, loop] of islets) {
    islet(b, rng, x, y, z, r, falls, { palms: !loop });
    if (loop) loopTrack(b, rng, x, y + 3.6, z, 4.2, Math.atan2(-x, -z) + Math.PI / 2);
  }
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + rng() * 0.15;
    const r = 210 + rng() * 70;
    const h = 40 + rng() * 70;
    mountain(b, rng, Math.cos(a) * r, Math.sin(a) * r, 26 + rng() * 26, h, ['#2e6a3a', '#6f86b8', h > 85 ? '#f4f6ff' : null]);
  }
  for (let i = 0; i < 4; i++) {
    const a = rng() * TAU;
    const r = 60 + rng() * 60;
    arch(b, rng, Math.cos(a) * r, Math.sin(a) * r, 7 + rng() * 4, 2 + rng(), rng() * TAU, null, '#8a7262');
  }
}

function buildCanyon(b, rng) {
  const autumn = [['#9a3a14', '#e8792a'], ['#8a2414', '#d4462a'], ['#a8701a', '#f2b33d']];
  for (let i = 0; i < 16; i++) {
    const p = islandSpot(rng, { margin: 2, avoidSouth: true });
    const s = 0.9 + rng() * 0.6;
    const anchor = V(p.x, GRASS_Y, p.z);
    b.add(xform(new THREE.CylinderGeometry(0.12 * s, 0.22 * s, 2.2 * s, 7), { x: p.x, y: GRASS_Y + 1.1 * s, z: p.z }), { color: '#4a2c18', anchor, bucket: 'smooth' });
    const pal = autumn[Math.floor(rng() * autumn.length)];
    for (let k = 0; k < 3; k++) {
      const g = clean(new THREE.IcosahedronGeometry((0.9 - k * 0.15) * s, 2));
      displace(g, 0.2 * s, 1.4, rng() * 9);
      xform(g, { x: p.x + (rng() - 0.5) * 0.7 * s, y: GRASS_Y + (2.2 + k * 0.6) * s, z: p.z + (rng() - 0.5) * 0.7 * s });
      b.add(g, { color: pal[0], top: pal[1], anchor, bucket: 'foliage', ao: 0.5, aoHeight: 3 * s });
    }
  }
  for (let i = 0; i < 14; i++) {
    const p = islandSpot(rng);
    rock(b, rng, p.x, GRASS_Y, p.z, 0.7 + rng() * 1.3, '#b4542c', '#e08a4a');
  }
  for (let i = 0; i < 22; i++) {
    const p = islandSpot(rng);
    bush(b, rng, p.x, GRASS_Y, p.z, 0.6 + rng() * 0.6, ['#8a7a20', '#e0c24a']);
  }
  for (let i = 0; i < 6; i++) {
    const p = islandSpot(rng, { margin: 2, avoidSouth: true });
    const anchor = V(p.x, GRASS_Y, p.z);
    const h = 2.6 + rng() * 1.6;
    b.add(xform(new THREE.BoxGeometry(1.1, 0.4, 1.1), { x: p.x, y: GRASS_Y + 0.2, z: p.z }), { color: '#cdb890', anchor, bucket: 'flat' });
    b.add(xform(new THREE.CylinderGeometry(0.34, 0.4, h, 12), { x: p.x, y: GRASS_Y + 0.4 + h / 2, z: p.z }), { color: '#d9c7a8', top: '#efe2c8', anchor, bucket: 'flat', ao: 0.6 });
    b.add(xform(new THREE.BoxGeometry(0.95, 0.3, 0.95), { x: p.x, y: GRASS_Y + 0.55 + h, z: p.z }), { color: '#cdb890', anchor, bucket: 'flat' });
    b.add(xform(new THREE.TorusGeometry(0.55, 0.1, 10, 28), { x: p.x, y: GRASS_Y + 1.5 + h, z: p.z, rx: Math.PI / 2 + 0.3, ry: rng() * TAU }), { color: '#ffcc40', glow: 0.35, anchor, bucket: 'shiny', ao: 1 });
  }
  const strata = ['#b8603a', '#d89060', '#eccaa0', '#a4502e', '#dca070'];
  for (let i = 0; i < 12; i++) {
    const a = rng() * TAU;
    const r = 85 + rng() * 100;
    mesa(b, rng, Math.cos(a) * r, Math.sin(a) * r, 8 + rng() * 10, 40 + rng() * 40, strata);
  }
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU;
    const r = 60 + rng() * 130;
    const h = 40 + rng() * 45;
    const g = clean(new THREE.CylinderGeometry(1 + rng() * 2, 4 + rng() * 4, h, 7, 8));
    displace(g, 1.1, 0.12, rng() * 30);
    xform(g, { x: Math.cos(a) * r, y: WATER_Y + h / 2 - 2, z: Math.sin(a) * r });
    b.add(g, { bucket: 'flat', colorFn: banded(strata), ao: 0.6, aoHeight: h * 0.2 });
  }
  for (let i = 0; i < 3; i++) {
    const a = rng() * TAU;
    const r = 80 + rng() * 60;
    arch(b, rng, Math.cos(a) * r, Math.sin(a) * r, 14 + rng() * 8, 4 + rng() * 2, rng() * TAU, banded(strata));
  }
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * TAU;
    const r = 250 + rng() * 40;
    mesa(b, rng, Math.cos(a) * r, Math.sin(a) * r, 22 + rng() * 14, 70 + rng() * 60, ['#8a4a40', '#a45c44', '#c07a5a']);
  }
}

function buildNeon(b, rng) {
  const neon = ['#38f6ff', '#ff3df2', '#ffb627', '#7dff6a'];
  for (let i = 0; i < 12; i++) {
    const p = islandSpot(rng, { margin: 1.5 });
    const anchor = V(p.x, GRASS_Y, p.z);
    const c = neon[i % neon.length];
    b.add(xform(new THREE.CylinderGeometry(0.06, 0.09, 2.8, 8), { x: p.x, y: GRASS_Y + 1.4, z: p.z }), { color: '#1a1c2c', anchor, bucket: 'shiny' });
    b.add(xform(new THREE.SphereGeometry(0.2, 14, 10), { x: p.x, y: GRASS_Y + 2.9, z: p.z }), { color: c, glow: 4, anchor, bucket: 'smooth', ao: 1 });
    b.add(xform(new THREE.TorusGeometry(0.26, 0.03, 6, 20), { x: p.x, y: GRASS_Y + 2.9, z: p.z, rx: Math.PI / 2 }), { color: '#2a2c3c', anchor, bucket: 'shiny', ao: 1 });
  }
  for (let i = 0; i < 12; i++) {
    const p = islandSpot(rng, { margin: 1.8, avoidSouth: true });
    const anchor = V(p.x, GRASS_Y, p.z);
    const c = neon[Math.floor(rng() * 2)];
    b.add(xform(new THREE.CylinderGeometry(0.08, 0.12, 1.2, 6), { x: p.x, y: GRASS_Y + 0.6, z: p.z }), { color: '#14162a', anchor, bucket: 'flat' });
    for (let k = 0; k < 6; k++) {
      const g = new THREE.OctahedronGeometry(0.35 + rng() * 0.35, 0);
      xform(g, { sy: 1.8, x: p.x + (rng() - 0.5) * 1.1, y: GRASS_Y + 1.4 + rng() * 1.4, z: p.z + (rng() - 0.5) * 1.1, ry: rng() * 3, rz: (rng() - 0.5) * 0.6 });
      b.add(g, { color: c, glow: 0.9 + rng() * 0.6, anchor, bucket: 'flat', ao: 1 });
    }
  }
  for (let i = 0; i < 4; i++) {
    const p = islandSpot(rng, { margin: 2, avoidSouth: true });
    const yaw = Math.atan2(p.x, p.z) + Math.PI / 2;
    const anchor = V(p.x, GRASS_Y, p.z);
    b.add(xform(new THREE.TorusGeometry(1.7, 0.09, 8, 40, Math.PI), { x: p.x, y: GRASS_Y, z: p.z, ry: yaw }), { color: neon[i % 2], glow: 3, anchor, bucket: 'smooth', ao: 1 });
  }
  for (let i = 0; i < 18; i++) {
    const p = islandSpot(rng);
    bush(b, rng, p.x, GRASS_Y, p.z, 0.6 + rng() * 0.5, ['#0c2430', '#1f4a54']);
  }
  // skyline ring
  for (let i = 0; i < 110; i++) {
    const a = rng() * TAU;
    const r = 85 + rng() * 140;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 6 + rng() * 10;
    const d = 6 + rng() * 10;
    const h = 25 + rng() * 90 * (r > 150 ? 1.4 : 1);
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * Math.max(w, d)) / 6, (uv.getY(k) * h) / 10);
    xform(g, { x, y: WATER_Y + h / 2, z, ry: rng() * TAU });
    const anchor = V(x, WATER_Y, z);
    b.add(g, { anchor, bucket: 'windows', keepUv: true, color: '#ffffff', ao: 0.6, aoHeight: h * 0.3 });
    if (rng() < 0.45) {
      b.add(xform(new THREE.CylinderGeometry(0.15, 0.3, 8, 5), { x, y: WATER_Y + h + 4, z }), { color: '#22263a', anchor, bucket: 'flat' });
      b.add(xform(new THREE.SphereGeometry(0.6, 8, 6), { x, y: WATER_Y + h + 8.4, z }), { color: '#ff3040', glow: 6, anchor, bucket: 'smooth', ao: 1 });
    }
    if (rng() < 0.35) {
      const c = neon[Math.floor(rng() * neon.length)];
      b.add(xform(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), { x, y: WATER_Y + h * (0.5 + rng() * 0.45), z }), { color: c, glow: 3, anchor, bucket: 'smooth', ao: 1 });
    }
  }
  for (let i = 0; i < 3; i++) {
    const r = 64 + i * 18;
    const y = 16 + i * 9;
    const g = new THREE.TorusGeometry(r, 1.2, 4, 160);
    xform(g, { sy: 1, rx: Math.PI / 2, y });
    b.add(g, { color: '#151826', anchor: V(0, y, 0), bucket: 'flat', ao: 1 });
    for (const off of [-1.25, 1.25]) {
      const e = new THREE.TorusGeometry(r + off, 0.12, 4, 160);
      xform(e, { rx: Math.PI / 2, y: y + 0.5 });
      b.add(e, { color: off < 0 ? '#38f6ff' : '#ffb627', glow: 3, anchor: V(0, y, 0), bucket: 'smooth', ao: 1 });
    }
  }
}

function buildCyber(b, rng) {
  const c1 = '#38f6ff';
  const c2 = '#ff2bd6';
  for (let i = 0; i < 12; i++) {
    const p = islandSpot(rng, { margin: 1.5, avoidSouth: true });
    const h = 2.4 + rng() * 2.6;
    edgesBox(b, p.x, GRASS_Y + h / 2, p.z, 0.9, h, 0.9, i % 2 ? c1 : c2, 3, V(p.x, GRASS_Y, p.z));
  }
  for (let i = 0; i < 10; i++) {
    const p = islandSpot(rng, { margin: 1.5 });
    const anchor = V(p.x, GRASS_Y, p.z);
    b.add(xform(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), { x: p.x, y: GRASS_Y + 0.9, z: p.z }), { color: '#22223a', anchor, bucket: 'flat' });
    b.add(xform(new THREE.OctahedronGeometry(0.35, 0), { x: p.x, y: GRASS_Y + 2.2, z: p.z }), { color: i % 2 ? c2 : c1, glow: 3, anchor, bucket: 'flat', ao: 1 });
  }
  for (let i = 0; i < 40; i++) {
    const a = rng() * TAU;
    const r = 35 + rng() * 190;
    const s = 3 + rng() * (r / 12);
    const y = -20 + rng() * 70;
    edgesBox(b, Math.cos(a) * r, y, Math.sin(a) * r, s, s, s, rng() < 0.5 ? c1 : c2, 2.2, V(Math.cos(a) * r, y - s / 2, Math.sin(a) * r), '#0a0618');
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rng() * 0.2;
    const r = 70 + rng() * 150;
    const g = new THREE.CylinderGeometry(0.5, 0.5, 340, 6, 1, true);
    xform(g, { x: Math.cos(a) * r, y: WATER_Y + 170, z: Math.sin(a) * r });
    b.add(g, { color: i % 3 === 0 ? c2 : c1, glow: 1.4, anchor: V(Math.cos(a) * r, WATER_Y, Math.sin(a) * r), bucket: 'smooth', ao: 1 });
  }
}

// One set of props per zone; World drives their reveal waves.
export class Scenery {
  constructor({ islandChecker, windowTex, waterfallMaterial }) {
    this.zones = [];
    const builders = [buildCoast, buildCanyon, buildNeon, buildCyber];
    builders.forEach((build, i) => {
      const rng = mulberry32(100 + i * 31);
      const uniforms = makeRevealUniforms();
      const b = new PropBuilder(rng);
      const falls = [];
      build(b, rng, falls);
      const mats = propMaterials(uniforms);
      mats.checker = makeCheckerMaterial(islandChecker, { reveal: uniforms });
      mats.windows = addReveal(
        new THREE.MeshStandardMaterial({ color: '#0b0d1a', roughness: 0.5, metalness: 0.3, emissive: '#ffffff', emissiveMap: windowTex, emissiveIntensity: 1.8 }),
        uniforms,
        { glow: false }
      );
      mats.windows.customProgramCacheKey = () => 'reveal-windows';
      const group = new THREE.Group();
      for (const m of b.build(mats)) group.add(m);
      if (falls.length) {
        const fm = new THREE.Mesh(mergeGeometries(falls), waterfallMaterial);
        fm.frustumCulled = false;
        group.add(fm);
      }
      const special = [];
      if (i === 2) {
        const moon = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8eeff').multiplyScalar(2.2), fog: false }));
        moon.position.set(-170, 120, -260);
        group.add(moon);
        special.push(moon);
      }
      if (i === 3) {
        for (let k = 0; k < 3; k++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(70 + k * 22, 0.3, 6, 200),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(k % 2 ? '#ff2bd6' : '#38f6ff').multiplyScalar(1.6), fog: false })
          );
          ring.position.y = 26 + k * 10;
          ring.rotation.set(Math.PI / 2 + (k - 1) * 0.35, 0, k * 0.8);
          ring.userData.spin = (k % 2 ? -1 : 1) * (0.05 + k * 0.02);
          group.add(ring);
          special.push(ring);
        }
      }
      group.visible = i === 0;
      this.zones.push({ group, uniforms, special, state: i === 0 ? 1 : 0 });
    });
  }

  // progress 0..1 of the reveal wave; appear = true grows, false shrinks.
  setState(i, progress, appear) {
    const z = this.zones[i];
    z.uniforms.uReveal.value = progress;
    z.uniforms.uMode.value = appear ? 1 : -1;
    z.group.visible = appear ? progress > 0 : progress < 1;
    const scale = appear ? Math.min(1, progress * 3) : 1 - Math.min(1, progress * 2);
    for (const s of z.special) {
      if (s.isMesh) s.scale.setScalar(Math.max(0.001, scale));
    }
  }

  update(dt, time, reduceMotion) {
    for (const z of this.zones) {
      if (!z.group.visible) continue;
      z.uniforms.uTime.value = time;
      for (const s of z.special) if (s.userData.spin) s.rotation.z += dt * s.userData.spin * (reduceMotion ? 0.3 : 1);
    }
  }

  // Everything visible once, so the renderer compiles every program up front.
  forEachZone(fn) {
    this.zones.forEach(fn);
  }
}
