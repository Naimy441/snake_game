import * as THREE from 'three';
import { cone } from './geo.js';

// Head accessories, built in the head's local frame (+z forward, +y up; the
// top of the head is around y = 0.25).
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1, ...extra });

function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s) m.scale.set(...s);
  m.castShadow = true;
  return m;
}

// A point on the round head's skull (the same shape SnakeView builds):
// phi round from straight ahead (+ to the snake's right), theta up from the
// middle, pushed out along the surface by off.
function skullPoint(phi, theta, off = 0) {
  const shape = (ph, th) => {
    let x = 0.5 * Math.cos(th) * Math.sin(ph) * 0.8;
    let y = 0.5 * Math.sin(th) * 0.55;
    let z = 0.5 * Math.cos(th) * Math.cos(ph) * 0.95;
    if (z > 0) {
      const f = 1 - 0.38 * Math.pow(z / 0.475, 1.6);
      x *= f;
      y *= 0.75 + 0.25 * f;
    }
    if (y < 0) y *= 0.62;
    return new THREE.Vector3(x, y, z);
  };
  const p = shape(phi, theta);
  if (!off) return p;
  // outward normal from neighbouring points
  const e = 0.01;
  const a = shape(phi + e, theta).sub(shape(phi - e, theta));
  const b = shape(phi, theta + e).sub(shape(phi, theta - e));
  const n = new THREE.Vector3().crossVectors(a, b).normalize();
  if (n.dot(p) < 0) n.negate();
  return p.addScaledVector(n, off);
}

const BUILDERS = {
  // Pixel shades: one flat, glossy black plate, stepped like 8-bit art, with
  // a few white pixels glinting on each lens. They sit level across the
  // front of the head, over both eyes, leaning back with the brow.
  shades() {
    const g = new THREE.Group();
    const black = std('#08080a', { roughness: 0.18, metalness: 0.35, envMapIntensity: 1.6 });
    const shine = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.3) });
    const px = 0.033; // one pixel
    const depth = 0.03;
    // # black, o a white glint (on the black)
    const ROWS = [
      '######################',
      '#o#o######..#o#o######',
      ' ##o#o####..##o#o#### ',
      '  ##o#o###..###o#o##  ',
      '   ######....######   ',
    ];
    const W = ROWS[0].length;
    const plate = new THREE.Group();
    ROWS.forEach((row, r) => {
      const y = ((ROWS.length - 1) / 2 - r) * px;
      // black runs, one box each
      for (let c = 0; c < W; ) {
        if (row[c] === ' ' || row[c] === '.') { c++; continue; }
        let e = c;
        while (e < W && row[e] !== ' ' && row[e] !== '.') e++;
        const w = (e - c) * px;
        plate.add(mesh(new THREE.BoxGeometry(w, px, depth), black, { x: (c + (e - c) / 2 - W / 2) * px, y }));
        c = e;
      }
      for (let c = 0; c < W; c++) {
        if (row[c] !== 'o') continue;
        plate.add(mesh(new THREE.PlaneGeometry(px * 0.82, px * 0.82), shine, { x: (c + 0.5 - W / 2) * px, y, z: depth / 2 + 0.002 }));
      }
    });
    // short arms back to the sides of the head
    for (const sx of [-1, 1]) {
      plate.add(mesh(new THREE.BoxGeometry(0.018, 0.022, 0.26), black, { x: sx * (W / 2 - 0.3) * px, y: 2 * px, z: -0.13 }));
    }
    plate.traverse((o) => (o.castShadow = false));
    g.add(plate);
    g.userData.plate = plate;
    g.position.set(0, 0.17, 0.3);
    g.rotation.x = -0.5;
    return g;
  },
  tophat() {
    const g = new THREE.Group();
    const black = std('#15151c', { roughness: 0.6 });
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 28), black, { y: 0.25 }));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.25, 28), black, { y: 0.38 }));
    g.add(mesh(new THREE.CylinderGeometry(0.133, 0.133, 0.045, 28), std('#d81e3a'), { y: 0.285 }));
    g.rotation.set(-0.18, 0, 0.12);
    g.position.set(0, 0.045, -0.04); // brim clear of the skull, even tilted
    return g;
  },
  party() {
    const g = new THREE.Group();
    g.add(mesh(cone(0.1, 0.3, 18), std('#ff3df2', { roughness: 0.35 }), { y: 0.41 }));
    for (let i = 0; i < 3; i++) {
      const r = 0.085 - i * 0.025;
      g.add(mesh(new THREE.TorusGeometry(r, 0.012, 6, 20), std(['#ffe640', '#38f6ff', '#7dff6a'][i]), { y: 0.31 + i * 0.075, rx: Math.PI / 2 }));
    }
    g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), std('#ffe640', { emissive: '#ffb020', emissiveIntensity: 0.5 }), { y: 0.57 }));
    g.rotation.set(-0.1, 0, 0.28);
    g.position.y = 0.035;
    return g;
  },
  horns() {
    const g = new THREE.Group();
    const ivory = std('#f2e6c8', { roughness: 0.5 });
    for (const sx of [-1, 1]) {
      const h = new THREE.Group();
      h.add(mesh(cone(0.05, 0.22, 12), ivory, { y: 0.11 }));
      h.add(mesh(cone(0.032, 0.14, 10), ivory, { y: 0.25, rx: -0.5, z: -0.03 }));
      h.position.set(sx * 0.13, 0.225, -0.1);
      h.rotation.set(-0.9, 0, -sx * 0.45);
      g.add(h);
    }
    return g;
  },
  bow() {
    const g = new THREE.Group();
    const pink = std('#ff5aa8', { roughness: 0.35 });
    for (const sx of [-1, 1]) g.add(mesh(cone(0.07, 0.13, 12), pink, { x: sx * 0.07, rz: sx * Math.PI / 2, s: [1, 1, 0.45] }));
    g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), pink));
    // sitting on the head like the flower (mirrored), resting on the skull
    g.position.copy(skullPoint(0.75, 0.95, 0.025));
    g.rotation.set(0.15, 0.3, -0.6);
    return g;
  },
  flower() {
    const g = new THREE.Group();
    const petal = std('#ffffff', { roughness: 0.5 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(1, 10, 6), petal, { x: Math.cos(a) * 0.065, z: Math.sin(a) * 0.065, ry: -a, s: [0.055, 0.014, 0.03] }));
    }
    g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), std('#ffc21a', { emissive: '#ff9f1c', emissiveIntensity: 0.3 }), { y: 0.01 }));
    g.position.set(-0.19, 0.28, -0.02);
    g.rotation.set(0.2, 0, 0.55);
    return g;
  },
  // A gold band whose top edge rises into five flat points (one sheet,
  // both sides drawn), with a ball on each point and rubies round the band.
  crown() {
    const g = new THREE.Group();
    const gold = std('#ffcc40', { roughness: 0.25, metalness: 0.85, envMapIntensity: 1.6, side: THREE.DoubleSide });
    const ruby = std('#ff2040', { emissive: '#a00018', emissiveIntensity: 0.8, roughness: 0.05 });
    const R = 0.14;
    const N = 100;
    const pos = [];
    const idx = [];
    const tip = (a) => {
      const u = ((a / (Math.PI * 2)) * 5) % 1; // 0..1 across one point
      return 1 - Math.abs(u - 0.5) * 2; // a triangle wave: 1 at each tip
    };
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const h = 0.06 + 0.1 * tip(a);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      pos.push(c * R, 0, sn * R, c * R * 1.06, h, sn * R * 1.06);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const band = mesh(geo, gold, { y: 0.285 });
    g.add(band);
    g.add(mesh(new THREE.TorusGeometry(R, 0.013, 8, 40), gold, { y: 0.29, rx: Math.PI / 2 }));
    g.add(mesh(new THREE.CircleGeometry(R * 0.98, 32), std('#8a1020', { roughness: 0.8, side: THREE.DoubleSide }), { y: 0.3, rx: -Math.PI / 2 }));
    for (let i = 0; i < 5; i++) {
      const a = ((i + 0.5) / 5) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(0.017, 10, 8), gold, { x: Math.cos(a) * R * 1.06, y: 0.285 + 0.17, z: Math.sin(a) * R * 1.06 }));
      const b = (i / 5) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(0.019, 8, 6), ruby, { x: Math.cos(b) * R * 1.03, y: 0.32, z: Math.sin(b) * R * 1.03 }));
    }
    g.position.set(0, 0, -0.06);
    g.rotation.x = -0.1;
    return g;
  },
  halo() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 10, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe9a0').multiplyScalar(2.2) }));
    m.rotation.x = Math.PI / 2;
    m.position.y = 0.48;
    g.add(m);
    g.userData.bob = m;
    return g;
  },
};

export function buildAccessory(id) {
  const b = BUILDERS[id];
  if (!b) return null;
  const g = b();
  g.userData.id = id;
  g.userData.round = { pos: g.position.clone(), rot: g.rotation.clone() };
  return g;
}

// Block heads are a flat-topped cube, bigger than the round head: each
// accessory is scaled up and set down on the cube's top (or, for shades, on
// its front over the eyes) instead. [x, y, z] and [rx, ry, rz] replace the
// round-head pose; y is measured from the top of the head (0.25).
const BLOCK_SCALE = 1.5;
const BLOCK_POSE = {
  tophat: { pos: [0, 0.015, -0.02], rot: [-0.05, 0, 0.06] },
  party: { pos: [0, 0.03, 0], rot: [-0.05, 0, 0.18] },
  horns: { pos: [0, 0.04, 0], rot: [0, 0, 0] },
  bow: { pos: [0.22, 0.31, -0.12], rot: [0, 0.4, 0.15] },
  flower: { pos: [-0.22, 0.262, -0.1], rot: [0, 0, 0] },
  crown: { pos: [0, 0, -0.03], rot: [0, 0, 0] },
  halo: { pos: [0, 0.05, 0], rot: [0, 0, 0] },
};

// Place an accessory (and the holder it hangs from) on the head. face: the
// block head's face cube, { h: its height, eyeY: its eyes' height, eyeFront:
// how far forward the eyes reach }, or null for the round head.
export function poseAccessory(g, holder, face) {
  const r = g.userData.round;
  g.position.copy(r.pos);
  g.rotation.copy(r.rot);
  holder.rotation.set(0, 0, 0);
  if (!face) {
    holder.position.set(0, 0, 0);
    holder.scale.setScalar(1);
    return;
  }
  const top = (face.h + 0.02) / 2; // the cube's top, from its centre
  if (g.userData.id === 'shades') {
    // upright across the front of the cube, just clear of the eyes
    const S = 1.4;
    holder.scale.setScalar(S);
    holder.position.set(0, face.eyeY, face.eyeFront + 0.03);
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, 0);
    return;
  }
  const S = BLOCK_SCALE;
  holder.scale.setScalar(S);
  holder.position.set(0, top - 0.25 * S, 0);
  const p = BLOCK_POSE[g.userData.id];
  if (p) {
    g.position.set(...p.pos);
    g.rotation.set(...p.rot);
  }
}

export function disposeAccessory(g) {
  g.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
}
