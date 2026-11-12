import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SECTIONS, pickleBump } from '../skinShapes.js';
import { skinById } from '../skins.js';

// Skins that are their own model, not just a paint job. Each can have:
//   section(theta) -> [x, y]  the body's cross-section (see skinShapes.js)
//   bump(d, theta)            a radius multiplier over the body (warts)
//   wave(d)                   lifts the body up and down along its length
//   lift                      how high the body's middle rides, in body radii
//   parts                     { build() -> { geo, mat }, every, offset, up }:
//                             something placed along the body every few cells
//   head()                    a Group for the head (head-local: +z forward,
//                             +y up, the ground at y = -0.25)
//   keepSkull                 the head() group is added to the snake's own head
//   eyes, eyeScale, tongue    where the eyes and tongue go on that head
//   acc                       [x, y, z] nudge for accessories on that head
// Head positions: the round skull is about 0.8 wide, 0.45 tall and 0.95 long,
// with its eyes at (+-0.22, 0.11, 0.12).

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, ...extra });

function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s) m.scale.set(...s);
  m.castShadow = true;
  return m;
}

// A ruffle: a flared, scalloped collar of lace (open both ends, both sides drawn).
function ruffleGeo(r0, r1, h, waves = 14, amp = 0.12) {
  const g = new THREE.CylinderGeometry(r0, r1, h, waves * 4, 2, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = (0.5 - y / h) * amp; // more ripple at the wide edge
    const f = 1 + k * Math.sin(a * waves);
    p.setXYZ(i, x * f, y, z * f);
  }
  g.computeVertexNormals();
  return g;
}

// A head grown out of the body itself: the body's cross-section, swelling a
// little past the neck and closing into a rounded nose, painted with the
// skin's own colours. So the head is the same thing as the body (a sausage
// in a bun ends in a sausage tip in a bun), not a different object.
// liftK: how high the body's middle rides (as in the body, in body radii).
function loftHead(skinId, section, { liftK = 0.92, bump = null, swell = 1.1, nose = 0.44, flatNose = 1 } = {}) {
  const skin = skinById(skinId);
  const R = 40;
  const K = 22;
  const z0 = -0.36; // back: tucked into the neck
  const zm = 0.02; // fullest
  const z1 = nose; // the tip
  const r = 0.34;
  const rh = r * 0.82;
  const yc = rh * liftK - 0.25; // the body's middle, head-local
  const pos = new Float32Array((K + 1) * (R + 1) * 3);
  const col = new Float32Array((K + 1) * (R + 1) * 3);
  const c = new THREE.Color();
  const pts = [];
  for (let j = 0; j <= R; j++) pts.push(section((j / R) * Math.PI * 2));
  for (let k = 0; k <= K; k++) {
    const z = z0 + (z1 - z0) * (k / K);
    let sc;
    if (z < zm) {
      const u = (z - z0) / (zm - z0);
      sc = 0.86 + (swell - 0.86) * u * u * (3 - 2 * u);
    } else {
      const u = Math.min(1, (z - zm) / (z1 - zm));
      sc = swell * Math.pow(Math.max(0, 1 - u * u), 0.5 * flatNose);
    }
    const d = Math.max(0, 0.5 - z); // distance down the body, for the paint
    for (let j = 0; j <= R; j++) {
      const t = (j / R) * Math.PI * 2;
      const f = bump ? bump(d, t) : 1;
      const i = k * (R + 1) + j;
      pos[i * 3] = pts[j][0] * r * sc * f;
      pos[i * 3 + 1] = pts[j][1] * rh * sc * f + yc;
      pos[i * 3 + 2] = z;
      skin.color(d, t, c);
      col.set([c.r, c.g, c.b], i * 3);
    }
  }
  const idx = [];
  for (let k = 0; k < K; k++) {
    for (let j = 0; j < R; j++) {
      const a = k * (R + 1) + j;
      const b = a + R + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = skin.mat || {};
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: m.roughness ?? 0.4, metalness: m.metalness ?? 0.05, side: THREE.DoubleSide });
  return mesh(geo, mat);
}

// The note from the title screen's "Now playing" badge, as a sprite texture.
let noteTex = null;
function makeNoteTexture() {
  if (noteTex) return noteTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.scale(64 / 24, 64 / 24);
  g.fillStyle = g.strokeStyle = '#ffffff';
  g.lineWidth = 2.2;
  g.lineJoin = 'round';
  g.stroke(new Path2D('M9 17.2V5.6l11-2.4v11.6'));
  for (const [cx, cy] of [[6.2, 17.6], [17.2, 15.2]]) {
    g.save();
    g.translate(cx, cy);
    g.rotate((-18 * Math.PI) / 180);
    g.beginPath();
    g.ellipse(0, 0, 3.4, 2.7, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  noteTex = new THREE.CanvasTexture(cv);
  noteTex.colorSpace = THREE.SRGBColorSpace;
  return noteTex;
}

export const MODELS = {
  // ------------------------------------------------------------ hot dog
  hotdog: {
    section: SECTIONS.hotdog,
    lift: 0.9,
    head() {
      const g = new THREE.Group();
      // the sausage tip in the end of its bun, grown from the body's own shape
      g.add(loftHead('hotdog', SECTIONS.hotdog, { liftK: 0.9, swell: 1.08, nose: 0.46 }));
      return g;
    },
    eyes: [[-0.13, 0.19, 0.16], [0.13, 0.19, 0.16]],
    eyeScale: 0.75,
    tongue: [0, 0.05, 0.42],
    acc: [0, 0.02, 0],
  },

  // ------------------------------------------------------------ tape measure
  tape: {
    section: SECTIONS.tape,
    lift: 1.4,
    head() {
      const g = new THREE.Group();
      const yellow = std('#ffd21a', { roughness: 0.35 });
      const black = std('#1a1a1a', { roughness: 0.6 });
      const chrome = std('#d8dde6', { roughness: 0.15, metalness: 1, envMapIntensity: 1.6 });
      // the case: a chunky rounded box sitting on the ground
      g.add(mesh(new RoundedBoxGeometry(0.62, 0.58, 0.6, 4, 0.12), yellow, { y: 0.04, z: 0.02 }));
      // rubber grips on both sides, a chrome screw in the middle
      for (const sx of [-1, 1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 32), black, { x: sx * 0.31, y: 0.04, z: 0.02, rz: Math.PI / 2 }));
        g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), chrome, { x: sx * 0.335, y: 0.04, z: 0.02, rz: Math.PI / 2 }));
      }
      // the lock slider on top, and the belt clip on the back
      g.add(mesh(new RoundedBoxGeometry(0.12, 0.06, 0.2, 2, 0.025), black, { y: 0.35, z: 0.1 }));
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.03), chrome, { y: 0.05, z: -0.3 }));
      // the tape's slot at the bottom back, where the body comes out
      g.add(mesh(new THREE.BoxGeometry(0.48, 0.06, 0.06), black, { y: -0.22, z: -0.28 }));
      return g;
    },
    eyes: [[-0.15, 0.17, 0.33], [0.15, 0.17, 0.33]],
    eyeScale: 0.9,
    tongue: [0, -0.1, 0.33],
    acc: [0, 0.1, 0],
  },

  // ------------------------------------------------------------ pickle
  pickle: {
    section: SECTIONS.pickle,
    bump: pickleBump,
    head() {
      const g = new THREE.Group();
      // the rounded end of the pickle, warts and all, grown from the body
      g.add(loftHead('pickle', SECTIONS.pickle, { bump: pickleBump, swell: 1.12, nose: 0.42 }));
      // a little stem nub on the end
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.06, 10), std('#7a6a2a'), { y: 0.01, z: 0.44, rx: Math.PI / 2 }));
      return g;
    },
    eyes: [[-0.25, 0.16, 0.12], [0.25, 0.16, 0.12]],
    acc: [0, 0.02, 0],
  },

  // ------------------------------------------------------------ bacon
  bacon: {
    section: SECTIONS.bacon,
    wave: (d) => 0.8 * Math.sin(d * 4.2),
    lift: 1.15,
    head() {
      const g = new THREE.Group();
      // the end of the rasher, grown from the body: flat and striped
      g.add(loftHead('bacon', SECTIONS.bacon, { liftK: 1.15, swell: 1.12, nose: 0.38, flatNose: 0.35 }));
      return g;
    },
    // googly eyes popping up on top
    eyes: [[-0.13, 0.17, 0.08], [0.13, 0.17, 0.08]],
    eyeScale: 1.1,
    tongue: [0, 0.05, 0.38],
    acc: [0, -0.06, 0],
  },

  // ------------------------------------------------------------ maid
  maid: {
    // lace ruffles round the body, like the tiers of a frilly skirt
    parts: {
      build: () => ({ geo: ruffleGeo(0.35, 0.47, 0.18, 11, 0.07).rotateX(Math.PI / 2), mat: std('#ffffff', { roughness: 0.7, side: THREE.DoubleSide }) }),
      every: 1.3,
      offset: 1.0,
    },
    keepSkull: true,
    head() {
      const g = new THREE.Group();
      const white = std('#ffffff', { roughness: 0.6 });
      const black = std('#15151c', { roughness: 0.5 });
      // the headdress: a lace band of scallops on a black ribbon
      const cap = new THREE.Group();
      cap.add(mesh(new THREE.BoxGeometry(0.36, 0.035, 0.07), black, { y: 0.27 }));
      cap.add(mesh(new THREE.BoxGeometry(0.34, 0.07, 0.03), white, { y: 0.31, z: 0.01 }));
      for (let i = 0; i < 7; i++) {
        const x = (i / 6 - 0.5) * 0.32;
        cap.add(mesh(new THREE.SphereGeometry(0.032, 10, 8), white, { x, y: 0.355 - Math.abs(x) * 0.25, z: 0.01, s: [1, 1, 0.5] }));
      }
      cap.position.z = -0.06;
      cap.rotation.x = -0.25;
      g.add(cap);
      // a frilled white collar at the back of the head, with a black bow
      g.add(mesh(ruffleGeo(0.3, 0.42, 0.14, 14, 0.18), std('#ffffff', { roughness: 0.7, side: THREE.DoubleSide }), { y: -0.04, z: -0.38, rx: Math.PI / 2 }));
      for (const sx of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.07, 0.15, 10), black, { x: sx * 0.08, y: -0.04, z: -0.24, rz: sx * Math.PI / 2, s: [1, 1, 0.5] }));
      g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), black, { y: -0.04, z: -0.24 }));
      return g;
    },
    acc: [0, 0.06, 0],
  },

  // ------------------------------------------------------------ BennyBennion1
  benny: {
    section: SECTIONS.benny,
    // glowing lime armour chevrons down the back
    parts: {
      build: () => {
        const s = new THREE.Shape();
        s.moveTo(-0.22, -0.06);
        s.lineTo(0, 0.1);
        s.lineTo(0.22, -0.06);
        s.lineTo(0.22, -0.13);
        s.lineTo(0, 0.03);
        s.lineTo(-0.22, -0.13);
        s.closePath();
        const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.04, 0);
        // bright enough to bloom: they glow
        return { geo, mat: new THREE.MeshBasicMaterial({ color: new THREE.Color('#c8ff5a').multiplyScalar(2.6) }) };
      },
      every: 0.8,
      offset: 0.9,
      up: 0.98,
    },
    keepSkull: true,
    head() {
      const g = new THREE.Group();
      const black = std('#121418', { roughness: 0.35, metalness: 0.3 });
      const lime = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c8ff5a').multiplyScalar(2.4) });
      // a gaming headset: a band arching clear over the top, big ear cups
      // sitting just outside the head, with glowing lime rings
      g.add(mesh(new THREE.TorusGeometry(0.42, 0.032, 8, 40, Math.PI), black, { y: -0.02, z: -0.1 }));
      for (const sx of [-1, 1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 28), black, { x: sx * 0.44, y: -0.02, z: -0.1, rz: Math.PI / 2 }));
        g.add(mesh(new THREE.TorusGeometry(0.105, 0.016, 8, 28), lime, { x: sx * 0.485, y: -0.02, z: -0.1, ry: Math.PI / 2 }));
      }
      // the mic on its boom, round to the front of the mouth
      const pts = [new THREE.Vector3(-0.46, -0.04, -0.06), new THREE.Vector3(-0.44, -0.1, 0.12), new THREE.Vector3(-0.3, -0.13, 0.34), new THREE.Vector3(-0.12, -0.12, 0.46)];
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.014, 6, false), black));
      g.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), lime, { x: -0.11, y: -0.12, z: 0.48 }));
      // music notes floating round the headset (see update)
      const notes = new THREE.Group();
      const colors = ['#ff5d8f', '#ffd23f', '#38f6ff', '#7dffb0', '#c77dff', '#ff9a3c'];
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeNoteTexture(), color: new THREE.Color(colors[i]).multiplyScalar(1.6), transparent: true, depthWrite: false }));
        sp.scale.setScalar(0.16);
        sp.userData.phase = (i / 5) * Math.PI * 2;
        notes.add(sp);
      }
      g.add(notes);
      g.userData.notes = notes;
      return g;
    },
    // the notes circle the head, bobbing and fading in and out
    update(head, time) {
      const notes = head.userData.notes;
      if (!notes) return;
      for (const sp of notes.children) {
        const a = sp.userData.phase + time * 0.9;
        const k = (time * 0.35 + sp.userData.phase / (Math.PI * 2)) % 1;
        sp.position.set(Math.cos(a) * 0.6, 0.15 + k * 0.45, Math.sin(a) * 0.6 - 0.05);
        sp.material.opacity = Math.sin(k * Math.PI);
        sp.material.rotation = Math.sin(time * 3 + sp.userData.phase) * 0.3;
      }
    },
    acc: [0, 0.06, 0],
  },
};

export function modelFor(id) {
  return MODELS[id] || null;
}
