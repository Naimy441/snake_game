import * as THREE from 'three';
import { makeCrystalApple } from '../render/FoodView.js';

// The snake's home in the middle of Emerald Coast: a cozy timber-framed
// cottage with a red roof, a door that swings open, warm windows, a chimney
// puffing smoke, flower boxes and a stepping-stone path. Beside it, a wooden
// crate stencilled DO NOT EAT, and inside that, the forbidden apple.
//
// It stands centred on the origin, door facing +z (towards the start of the
// board). Everything is built from boxes in code like the rest of the game.

const WALL_H = 1.6;
const HX = 1.6; // half width (x)
const HZ = 1.3; // half depth (z)
const DOOR_W = 1.0;
const DOOR_H = 1.28;
export const DOOR = { x: 0, z: HZ }; // the doorway, on the board
export const CRATE = { x: 2.45, z: 2.2 };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Stencilled crate label: DO NOT EAT between hazard stripes.
function crateLabel() {
  return canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#e8c35a';
    g.fillRect(0, 0, w, h);
    const stripe = (y0, hh) => {
      g.save();
      g.beginPath();
      g.rect(0, y0, w, hh);
      g.clip();
      g.fillStyle = '#16120c';
      g.fillRect(0, y0, w, hh);
      g.fillStyle = '#ffcf1f';
      for (let x = -hh; x < w + hh; x += 56) {
        g.beginPath();
        g.moveTo(x, y0 + hh);
        g.lineTo(x + 28, y0 + hh);
        g.lineTo(x + 28 + hh, y0);
        g.lineTo(x + hh, y0);
        g.fill();
      }
      g.restore();
    };
    stripe(0, 54);
    stripe(h - 54, 54);
    g.fillStyle = '#c4161c';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 104px Impact, "Arial Black", sans-serif';
    g.fillText('DO NOT', w / 2, h / 2 - 52);
    g.font = '900 132px Impact, "Arial Black", sans-serif';
    g.fillText('EAT', w / 2, h / 2 + 62);
    // a little worn, like a real stencil
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i++) {
      g.globalAlpha = Math.random() * 0.35;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 3);
    }
  });
}

// The paper tag tied to the forbidden apple's stem.
function appleTag() {
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#fff6dc';
    g.beginPath();
    g.moveTo(34, 0);
    g.lineTo(w, 0);
    g.lineTo(w, h);
    g.lineTo(34, h);
    g.lineTo(0, h / 2);
    g.closePath();
    g.fill();
    g.fillStyle = '#d8c79a';
    g.beginPath();
    g.arc(30, h / 2, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b3121a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'italic 900 44px "Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif';
    g.fillText('DO NOT', 148, 52);
    g.fillText('EAT!!', 148, 110);
  });
}

function heartTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(64, 112);
    g.bezierCurveTo(10, 72, 6, 30, 36, 22);
    g.bezierCurveTo(52, 18, 62, 30, 64, 40);
    g.bezierCurveTo(66, 30, 76, 18, 92, 22);
    g.bezierCurveTo(122, 30, 118, 72, 64, 112);
    g.fill();
  });
}

export class Homestead {
  constructor(glowTex) {
    this.group = new THREE.Group();
    this.glowTex = glowTex;
    this.house = new THREE.Group();
    this.group.add(this.house);
    this.time = 0;
    this.doorOpen = 0;
    this.doorTarget = 0;
    this.jolt = 0;
    this.lights = 1;
    this.buildHouse();
    this.buildCrate();
    this.buildApple();
    this.buildSmoke();
    this.buildHearts();
    this.group.traverse((o) => {
      if (o.isMesh && !o.material.transparent) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  buildHouse() {
    const H = this.house;
    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });
    const plaster = mat('#f6ead0', { roughness: 0.9 });
    const timber = mat('#7a4424', { roughness: 0.7 });
    const stone = mat('#9a948a', { roughness: 0.95 });
    const roof = mat('#d0462c', { roughness: 0.6 });
    const roofDark = mat('#9a2e1c', { roughness: 0.6 });
    const box = (w, h, d, m, x, y, z, parent = H) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      parent.add(b);
      return b;
    };
    const T = 0.12;
    // a low stone footing, flush with the board at the doorway
    box(HX * 2 + 0.24, 0.12, HZ * 2 + 0.24, stone, 0, -0.04, 0);
    // inside it's dark: from the doorway you see only shadow (the snakes
    // slip in and are gone)
    const dark = new THREE.Mesh(new THREE.BoxGeometry(HX * 2 - 0.26, WALL_H + 0.1, HZ * 2 - 0.26), new THREE.MeshBasicMaterial({ color: '#070302', side: THREE.BackSide }));
    dark.position.y = (WALL_H + 0.1) / 2 + 0.02;
    H.add(dark);
    box(HX * 2 - 0.1, 0.02, HZ * 2 - 0.1, new THREE.MeshBasicMaterial({ color: '#070302' }), 0, 0.03, 0);
    // walls: back, sides, and the front around the door
    box(HX * 2, WALL_H, T, plaster, 0, WALL_H / 2, -HZ + T / 2);
    box(T, WALL_H, HZ * 2, plaster, -HX + T / 2, WALL_H / 2, 0);
    box(T, WALL_H, HZ * 2, plaster, HX - T / 2, WALL_H / 2, 0);
    const sideW = HX - DOOR_W / 2;
    box(sideW, WALL_H, T, plaster, -(DOOR_W / 2 + sideW / 2), WALL_H / 2, HZ - T / 2);
    box(sideW, WALL_H, T, plaster, DOOR_W / 2 + sideW / 2, WALL_H / 2, HZ - T / 2);
    box(DOOR_W, WALL_H - DOOR_H, T, plaster, 0, DOOR_H + (WALL_H - DOOR_H) / 2, HZ - T / 2);
    // timber frame: corner posts, a sill beam and a top beam all round
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.16, WALL_H + 0.02, 0.16, timber, sx * (HX - 0.02), WALL_H / 2, sz * (HZ - 0.02));
    for (const sz of [-1, 1]) box(HX * 2 + 0.06, 0.13, 0.15, timber, 0, WALL_H - 0.05, sz * (HZ - 0.01));
    for (const sx of [-1, 1]) box(0.15, 0.13, HZ * 2 + 0.06, timber, sx * (HX - 0.01), WALL_H - 0.05, 0);
    // door frame
    for (const sx of [-1, 1]) box(0.1, DOOR_H + 0.05, 0.18, timber, sx * (DOOR_W / 2 + 0.03), DOOR_H / 2, HZ - 0.04);
    box(DOOR_W + 0.16, 0.12, 0.18, timber, 0, DOOR_H + 0.04, HZ - 0.04);
    // diagonal braces on the front, either side of the door
    for (const sx of [-1, 1]) {
      const b = box(0.08, 1.15, 0.05, timber, sx * 1.33, 0.75, HZ + 0.005);
      b.rotation.z = sx * 0.42;
    }

    // windows: warm light inside a frame with a cross
    this.windowMat = new THREE.MeshStandardMaterial({ color: '#2a1a08', emissive: '#ffbf5a', emissiveIntensity: 1.6, roughness: 0.3 });
    const windowAt = (x, y, z, ry) => {
      const w = new THREE.Group();
      w.position.set(x, y, z);
      w.rotation.y = ry;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.48), this.windowMat);
      glass.position.z = 0.005;
      w.add(glass);
      const frameM = mat('#fffaf0', { roughness: 0.5 });
      box(0.6, 0.07, 0.06, frameM, 0, 0.27, 0.03, w);
      box(0.6, 0.07, 0.06, frameM, 0, -0.27, 0.03, w);
      box(0.07, 0.6, 0.06, frameM, 0.28, 0, 0.03, w);
      box(0.07, 0.6, 0.06, frameM, -0.28, 0, 0.03, w);
      box(0.04, 0.5, 0.04, frameM, 0, 0, 0.03, w);
      box(0.5, 0.04, 0.04, frameM, 0, 0, 0.03, w);
      // shutters
      const sh = mat('#3f8f5a', { roughness: 0.6 });
      box(0.2, 0.56, 0.04, sh, -0.42, 0, 0.03, w);
      box(0.2, 0.56, 0.04, sh, 0.42, 0, 0.03, w);
      H.add(w);
      return w;
    };
    windowAt(-1.02, 0.88, HZ + 0.001, 0);
    windowAt(1.02, 0.88, HZ + 0.001, 0);
    windowAt(-HX - 0.001, 0.88, 0, -Math.PI / 2);
    windowAt(HX + 0.001, 0.88, 0, Math.PI / 2);
    windowAt(0, 0.88, -HZ - 0.001, Math.PI);
    // flower boxes under the front windows
    const flowerCols = ['#ff4f7a', '#ffd23f', '#ffffff', '#ff8a3a', '#c86bff'];
    for (const sx of [-1, 1]) {
      box(0.66, 0.14, 0.16, timber, sx * 1.02, 0.55, HZ + 0.1);
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mat(flowerCols[(i + (sx > 0 ? 2 : 0)) % flowerCols.length], { roughness: 0.5 }));
        f.position.set(sx * 1.02 - 0.26 + i * 0.105, 0.66 + (i % 2) * 0.03, HZ + 0.1 + ((i * 7) % 3 - 1) * 0.03);
        H.add(f);
      }
      const leaves = box(0.6, 0.06, 0.12, mat('#3fae3a'), sx * 1.02, 0.63, HZ + 0.1);
      leaves.scale.y = 1;
    }

    // the door: hinged on its left edge, swings out towards the yard
    this.door = new THREE.Group();
    this.door.position.set(-DOOR_W / 2, 0, HZ - 0.02);
    const doorM = mat('#9a5426', { roughness: 0.6 });
    const panel = box(DOOR_W - 0.02, DOOR_H - 0.03, 0.07, doorM, DOOR_W / 2, DOOR_H / 2, 0, this.door);
    panel.userData.door = true;
    for (let i = 0; i < 3; i++) box(0.02, DOOR_H - 0.1, 0.075, mat('#6a3416'), 0.25 + i * 0.25, DOOR_H / 2, 0.002, this.door);
    box(DOOR_W - 0.12, 0.08, 0.08, mat('#6a3416'), DOOR_W / 2, DOOR_H * 0.28, 0.01, this.door);
    box(DOOR_W - 0.12, 0.08, 0.08, mat('#6a3416'), DOOR_W / 2, DOOR_H * 0.75, 0.01, this.door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), mat('#ffcf3f', { metalness: 0.9, roughness: 0.25 }));
    knob.position.set(DOOR_W - 0.13, DOOR_H * 0.5, 0.06);
    this.door.add(knob);
    H.add(this.door);
    // little round window over the door
    const round = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), this.windowMat);
    round.position.set(0, WALL_H + 0.42, HZ + 0.07);
    H.add(round);

    // roof: two slopes and the gable ends
    const over = 0.32;
    const rise = 1.15;
    const half = HZ + over;
    const slope = Math.hypot(half, rise);
    const ang = Math.atan2(rise, half);
    for (const sz of [-1, 1]) {
      const r = box(HX * 2 + 0.5, 0.14, slope + 0.06, roof, 0, WALL_H + rise / 2, (sz * half) / 2);
      r.rotation.x = sz * ang;
      // shingle rows
      for (let i = 1; i < 5; i++) {
        const s = box(HX * 2 + 0.52, 0.05, 0.05, roofDark, 0, 0, 0, r);
        s.position.set(0, 0.08, (i / 5 - 0.5) * slope * sz * -1);
      }
    }
    box(HX * 2 + 0.6, 0.14, 0.18, roofDark, 0, WALL_H + rise + 0.03, 0);
    const tri = new THREE.Shape();
    tri.moveTo(-HZ, 0);
    tri.lineTo(HZ, 0);
    tri.lineTo(0, rise - 0.05);
    tri.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false });
    for (const sx of [-1, 1]) {
      const g = new THREE.Mesh(gableGeo, plaster);
      g.rotation.y = Math.PI / 2;
      g.position.set(sx > 0 ? HX - T : -HX, WALL_H, 0);
      H.add(g);
    }
    // chimney
    box(0.38, 1.1, 0.38, mat('#b0603a', { roughness: 0.9 }), 1.0, WALL_H + 0.95, -0.55);
    box(0.46, 0.1, 0.46, stone, 1.0, WALL_H + 1.52, -0.55);
    this.chimneyTop = new THREE.Vector3(1.0, WALL_H + 1.6, -0.55);

    // stepping stones out to the yard, and a doormat
    const stoneM = mat('#c8c0b0', { roughness: 0.95 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.26 - (i % 2) * 0.03, 0.28, 0.04, 10), stoneM);
      s.position.set(((i * 37) % 3 - 1) * 0.08, 0.015, HZ + 0.75 + i * 0.75);
      H.add(s);
    }
    box(0.8, 0.02, 0.4, mat('#c84a3a', { roughness: 1 }), 0, 0.012, HZ + 0.3);
    // a tiny mailbox by the path
    box(0.06, 0.6, 0.06, timber, -1.15, 0.3, HZ + 1.9);
    const mb = box(0.24, 0.18, 0.34, mat('#3a6ad8', { roughness: 0.4, metalness: 0.3 }), -1.15, 0.68, HZ + 1.9);
    mb.userData.mailbox = true;
    const flag = box(0.02, 0.14, 0.05, mat('#ff3a3a'), -1.03, 0.78, HZ + 1.82);
    flag.rotation.z = -0.2;
  }

  buildCrate() {
    const c = new THREE.Group();
    c.position.set(CRATE.x, 0, CRATE.z);
    c.rotation.y = -0.35;
    const wood = new THREE.MeshStandardMaterial({ color: '#b07a3e', roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: '#6e4420', roughness: 0.85 });
    const S = 0.78;
    const body = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), wood);
    body.position.y = S / 2;
    c.add(body);
    // edge battens
    const bat = (w, h, d, x, y, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), dark);
      b.position.set(x, y, z);
      c.add(b);
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bat(0.08, S + 0.02, 0.08, (sx * S) / 2, S / 2, (sz * S) / 2);
    for (const sz of [-1, 1]) bat(S + 0.06, 0.08, 0.08, 0, 0.04, (sz * S) / 2);
    // the label, on the front
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.5), new THREE.MeshStandardMaterial({ map: crateLabel(), roughness: 0.8 }));
    label.position.set(0, S / 2 + 0.02, S / 2 + 0.006);
    c.add(label);
    const side = label.clone();
    side.position.set(S / 2 + 0.006, S / 2 + 0.02, 0);
    side.rotation.y = Math.PI / 2;
    c.add(side);
    // the lid (pops off)
    this.lid = new THREE.Group();
    this.lid.position.set(0, S, 0);
    const lidM = new THREE.Mesh(new THREE.BoxGeometry(S + 0.08, 0.09, S + 0.08), wood);
    lidM.position.y = 0.045;
    this.lid.add(lidM);
    for (let i = -1; i <= 1; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(S + 0.1, 0.03, 0.06), dark);
      p.position.set(0, 0.1, i * 0.26);
      this.lid.add(p);
    }
    // padlock
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: '#c9b14a', metalness: 0.9, roughness: 0.3 }));
    lock.position.set(0, -0.05, S / 2 + 0.06);
    this.lid.add(lock);
    c.add(this.lid);
    this.crate = c;
    this.crateSize = S;
    this.group.add(c);
    this.lidFly = null;
  }

  buildApple() {
    // the forbidden apple: the crystal apple, but black-violet with a slow
    // rainbow shimmer, a halo, and a paper tag on a string
    const a = new THREE.Group();
    const apple = makeCrystalApple();
    const body = apple.children[0];
    body.material = body.material.clone();
    body.material.color.set('#3a1050');
    body.material.emissive.set('#a020ff');
    body.material.emissiveIntensity = 0.45;
    this.appleBody = body.material;
    a.add(apple);
    apple.scale.setScalar(1.55);
    this.appleGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#c060ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.appleGlow.scale.setScalar(1.3);
    a.add(this.appleGlow);
    // god rays: a few thin additive blades turning slowly behind it
    this.rays = new THREE.Group();
    const rayMat = new THREE.MeshBasicMaterial({ color: '#ffd8ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.rayMat = rayMat;
    for (let i = 0; i < 10; i++) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 2.6), rayMat);
      r.geometry.translate(0, 1.3, 0);
      r.rotation.z = (i / 10) * Math.PI * 2;
      this.rays.add(r);
    }
    this.rays.visible = false;
    this.group.add(this.rays);
    a.visible = false;
    this.apple = a;
    this.applePos = new THREE.Vector3(CRATE.x, 0.45, CRATE.z);
    a.position.copy(this.applePos);
    this.appleRise = 0;
    this.appleState = 'hidden'; // hidden, rising, eaten
    this.group.add(a);
  }

  buildSmoke() {
    this.smoke = [];
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#e8e8ee', transparent: true, opacity: 0, depthWrite: false }));
      s.userData.t = i / 10;
      this.smoke.push(s);
      this.group.add(s);
    }
  }

  buildHearts() {
    this.heartTex = heartTexture();
    this.hearts = [];
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.heartTex, color: '#ff4f86', transparent: true, opacity: 0, depthWrite: false }));
      s.userData.life = 0;
      s.visible = false;
      this.hearts.push(s);
      this.group.add(s);
    }
  }

  // A few hearts float up from p.
  burstHearts(p, n = 6) {
    let k = 0;
    for (const s of this.hearts) {
      if (s.userData.life > 0) continue;
      s.visible = true;
      s.userData.life = 1;
      s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6);
      s.position.set(p.x + (Math.random() - 0.5) * 0.4, p.y + 0.4 + Math.random() * 0.2, p.z + (Math.random() - 0.5) * 0.4);
      s.material.color.set(Math.random() < 0.3 ? '#ff8ab0' : '#ff3a6e');
      s.userData.size = 0.22 + Math.random() * 0.16;
      if (++k >= n) break;
    }
  }

  openDoor(open = true) {
    this.doorTarget = open ? 1 : 0;
  }

  // Wobble the house (the ground shaking).
  shake(amount) {
    this.jolt = Math.max(this.jolt, amount);
  }

  popLid() {
    this.lidFly = { t: 0, v: new THREE.Vector3(-0.6, 3.2, 1.2), spin: new THREE.Vector3(3.2, 1.2, 2.4) };
    this.apple.visible = true;
    this.appleState = 'rising';
    this.appleRise = 0;
  }

  // Blown apart from below: every piece of the house flies off, spinning,
  // and tumbles down onto the ground.
  explode() {
    this.debris = [];
    for (const o of this.house.children) {
      if (!o.userData.home) o.userData.home = { p: o.position.clone(), r: o.rotation.clone() };
      const out = new THREE.Vector3(o.position.x, 0, o.position.z);
      if (out.lengthSq() < 0.01) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      // (thrown back and to the sides, away from the yard where the cameras are)
      out.z = -Math.abs(out.z) - 0.6;
      out.normalize().multiplyScalar(2.5 + Math.random() * 4);
      out.y = 4 + Math.random() * 6 + o.position.y * 1.5;
      this.debris.push({ o, v: out, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14) });
    }
    this.debrisT = 0;
  }

  // The apple floats out of the crate to `to` (in front of a hungry mouth).
  offerApple(to) {
    this.appleState = 'offer';
    this.offerTo = to.clone();
  }

  // Bitten: it's sucked into the mouth at mouth() (a function giving the
  // world position of the open mouth, which may move) and is gone.
  eatApple(mouth) {
    this.appleState = 'eaten';
    this.eatT = 0;
    this.mouth = mouth;
    this.eatFrom = this.apple.scale.x;
  }

  // Back to how it was at the start of the cutscene.
  reset() {
    this.doorOpen = this.doorTarget = 0;
    this.jolt = 0;
    this.lights = 1;
    this.lidFly = null;
    this.lid.position.set(0, this.crateSize, 0);
    this.lid.rotation.set(0, 0, 0);
    this.apple.visible = false;
    this.appleState = 'hidden';
    this.apple.position.copy(this.applePos);
    this.apple.scale.setScalar(1);
    this.rayMat.opacity = 0;
    this.rays.visible = false;
    this.appleGlow.material.opacity = 0;
    this.house.position.set(0, 0, 0);
    this.house.rotation.set(0, 0, 0);
    this.house.visible = true;
    this.debris = null;
    for (const o of this.house.children) {
      const h = o.userData.home;
      if (!h) continue;
      o.position.copy(h.p);
      o.rotation.copy(h.r);
      o.visible = true;
    }
    this.crate.visible = true;
    for (const s of this.hearts) {
      s.userData.life = 0;
      s.visible = false;
    }
  }

  update(dt, time, { panic = 0 } = {}) {
    this.time = time;
    // door swings with a little overshoot
    const k = Math.min(1, dt * 6);
    this.doorOpen += (this.doorTarget - this.doorOpen) * k;
    // (open, it swings well back towards the wall, out of the doorway)
    this.door.rotation.y = -2.2 * this.doorOpen;
    // shaking: the house rattles on its footing
    this.jolt *= Math.exp(-dt * 2.5);
    const j = this.jolt;
    this.house.position.set((Math.random() - 0.5) * 0.08 * j, Math.abs(Math.sin(time * 37)) * 0.04 * j, (Math.random() - 0.5) * 0.08 * j);
    this.house.rotation.z = Math.sin(time * 29) * 0.02 * j;
    this.crate.position.y = Math.abs(Math.sin(time * 31 + 1)) * 0.05 * j;
    // windows: a warm flicker, darker when the sky burns
    this.windowMat.emissiveIntensity = (1.4 + Math.sin(time * 7) * 0.08 + Math.sin(time * 13.1) * 0.05) * this.lights * (1 - panic * 0.5);
    // chimney smoke drifts up and fades
    for (const s of this.smoke) {
      const u = (s.userData.t + time * 0.12) % 1;
      s.position.set(this.chimneyTop.x + Math.sin(u * 5 + s.userData.t * 9) * 0.25 * u + u * 0.5, this.chimneyTop.y + u * 2.6, this.chimneyTop.z - u * 0.3);
      s.scale.setScalar(0.35 + u * 1.3);
      s.material.opacity = Math.sin(u * Math.PI) * 0.35 * (1 - panic);
      s.material.color.set(panic > 0.5 ? '#5a4a48' : '#e8e8ee');
    }
    // the house in pieces, flying and falling
    if (this.debris) {
      this.debrisT += dt;
      for (const d of this.debris) {
        d.v.y -= 14 * dt;
        d.o.position.addScaledVector(d.v, dt);
        d.o.rotation.x += d.spin.x * dt;
        d.o.rotation.y += d.spin.y * dt;
        d.o.rotation.z += d.spin.z * dt;
        if (d.o.position.y < 0.05) {
          d.o.position.y = 0.05;
          d.v.multiplyScalar(0.4);
          d.v.y = Math.abs(d.v.y) * 0.3;
          d.spin.multiplyScalar(0.5);
        }
        // (pieces that fly off the plateau sink into the lava)
        if (Math.hypot(d.o.position.x, d.o.position.z) > 9) d.o.visible = false;
      }
    }
    // the lid flies off
    if (this.lidFly) {
      const f = this.lidFly;
      f.t += dt;
      f.v.y -= 9 * dt;
      this.lid.position.addScaledVector(f.v, dt);
      this.lid.rotation.x += f.spin.x * dt;
      this.lid.rotation.z += f.spin.z * dt;
      if (this.lid.position.y < 0.05 && f.t > 0.3) {
        this.lid.position.y = 0.05;
        f.v.set(0, 0, 0);
        f.spin.set(0, 0, 0);
      }
    }
    // the forbidden apple rises out of the crate and hovers, shimmering
    const A = this.apple;
    if (A.visible) {
      const hue = (time * 0.35) % 1;
      this.appleBody.emissive.setHSL(hue, 1, 0.5);
      this.appleGlow.material.color.setHSL(hue, 1, 0.6);
      if (this.appleState === 'rising' || this.appleState === 'offer') {
        this.appleRise = Math.min(1, this.appleRise + dt / 1.6);
        const e = 1 - Math.pow(1 - this.appleRise, 3);
        if (this.appleState === 'rising') A.position.set(this.applePos.x, this.applePos.y + e * 0.95 + Math.sin(time * 2.2) * 0.05 * e, this.applePos.z);
        // (offered: it drifts down and out to him, at mouth height, shrinking
        // to bite size)
        else {
          A.position.lerp(this.offerTo, Math.min(1, dt * 4));
          A.scale.setScalar(A.scale.x + (0.58 - A.scale.x) * Math.min(1, dt * 4));
        }
        A.rotation.y = time * 0.9;
        this.appleGlow.material.opacity = 0.45 * e;
        this.rayMat.opacity = 0.16 * e;
        // (the blades face the camera, turning slowly)
        this.rays.visible = true;
        this.rays.position.copy(A.position);
        if (this.cameraQuat) this.rays.quaternion.copy(this.cameraQuat);
        this.rays.rotateZ(time * 0.3);
      } else if (this.appleState === 'eaten') {
        this.eatT += dt;
        const k = Math.min(1, this.eatT / 0.16);
        if (this.mouth) A.position.lerp(this.mouth(), Math.min(1, dt * 22 + k * 0.3));
        const s = Math.max(0, 1 - k * k);
        A.scale.setScalar(Math.max(0.001, this.eatFrom * (0.2 + 0.8 * s)));
        if (k >= 1) A.scale.setScalar(0.001);
        this.rayMat.opacity *= Math.exp(-dt * 10);
        if (s <= 0) {
          A.visible = false;
          this.rays.visible = false;
        }
      }
    }
    // hearts drift up and fade
    for (const s of this.hearts) {
      const u = s.userData;
      if (u.life <= 0) continue;
      u.life -= dt / 1.8;
      s.position.addScaledVector(u.v, dt);
      u.v.multiplyScalar(Math.exp(-dt * 0.8));
      const pop = Math.min(1, (1 - u.life) * 6);
      s.scale.setScalar(u.size * pop * (1 + Math.sin(time * 12 + s.id) * 0.08));
      s.material.opacity = Math.min(1, u.life * 2.5);
      if (u.life <= 0) s.visible = false;
    }
  }
}
