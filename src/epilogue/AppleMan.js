import * as THREE from 'three';

// An Apple Man: a ridiculous bodybuilder with a glossy apple for a head.
// Built like a cartoon strongman: a turned V-shaped torso with pecs, a
// six-pack, obliques, lats and traps; boulder shoulders, big biceps and
// Popeye forearms with wristbands and knuckled fists; stubby legs in
// sneakers; leafy green trunks under a gold champion belt. The head wears a
// white headband, angry brows and a toothy grin. About 2.3 units tall,
// standing on the origin, facing +z.
//
// Poses: 'idle' (a smug sway), 'flex' (double biceps), 'carry' (arms
// straight up, holding something overhead), 'jump' (arms back), 'laugh'.

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.02, ...o });
const SKIN = mat('#d8222a', { roughness: 0.32 });
const SHADE = mat('#9c1119', { roughness: 0.45 });
const LEAF = mat('#2f9e44', { roughness: 0.6 });
const LEAF_LIGHT = mat('#5ccf5a', { roughness: 0.55 });
const GOLD = mat('#ffc83a', { roughness: 0.28, metalness: 0.85 });
const WHITE = mat('#f6f4ee', { roughness: 0.55 });
const STRIPE = mat('#e23a3a', { roughness: 0.5 });
const INK = new THREE.MeshBasicMaterial({ color: '#160608' });
const EYE = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const SPHERE = new THREE.SphereGeometry(1, 24, 16);

function ell(parent, m, r, [sx, sy, sz], [x, y, z], rot = null) {
  const b = new THREE.Mesh(SPHERE, m);
  b.scale.set(r * sx, r * sy, r * sz);
  b.position.set(x, y, z);
  if (rot) b.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(b);
  return b;
}

// A smooth apple, turned on a lathe: a dimpled top, fuller shoulders.
function appleGeometry() {
  const prof = [
    [0.001, -0.3], [0.1, -0.32], [0.22, -0.28], [0.32, -0.17], [0.37, -0.03], [0.37, 0.1],
    [0.33, 0.21], [0.25, 0.29], [0.15, 0.31], [0.07, 0.27], [0.001, 0.22],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(prof, 32);
  g.computeVertexNormals();
  return g;
}

export class AppleMan {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // bobs and leans
    this.group.add(this.body);
    const B = this.body;

    // ---- legs: short, thick, in sneakers
    for (const s of [-1, 1]) {
      ell(B, SKIN, 0.17, [1, 1.45, 1.05], [s * 0.18, 0.5, 0.01]); // thigh
      ell(B, SKIN, 0.1, [1, 1.1, 0.9], [s * 0.15, 0.56, 0.13]); // quad bulge
      ell(B, SKIN, 0.12, [1, 1.35, 1.05], [s * 0.2, 0.25, -0.02]); // calf
      ell(B, WHITE, 0.13, [1.05, 0.55, 1.6], [s * 0.2, 0.07, 0.06]); // sneaker
      ell(B, STRIPE, 0.13, [1.07, 0.15, 1.62], [s * 0.2, 0.09, 0.06]); // red stripe
    }

    // ---- leafy trunks and the champion belt
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.3, 28), LEAF);
    shorts.scale.z = 0.78;
    shorts.position.y = 0.74;
    B.add(shorts);
    for (let i = 0; i < 10; i++) {
      // leaf-shaped flaps round the hem
      const a = (i / 10) * Math.PI * 2;
      const leaf = ell(B, i % 2 ? LEAF_LIGHT : LEAF, 0.1, [0.75, 1.4, 0.25], [Math.sin(a) * 0.43, 0.6, Math.cos(a) * 0.34]);
      leaf.rotation.set(0.25 * Math.cos(a), a, 0);
    }
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.1, 28), GOLD);
    belt.scale.z = 0.8;
    belt.position.y = 0.91;
    B.add(belt);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 20), GOLD);
    plate.rotation.x = Math.PI / 2;
    plate.position.set(0, 0.91, 0.34);
    B.add(plate);
    ell(B, SKIN, 0.05, [1, 1, 0.5], [0, 0.91, 0.37]); // a little apple on the buckle

    // ---- torso: a V turned on a lathe, then the muscles on top
    const torsoProf = [
      [0.37, 0.88], [0.38, 0.98], [0.47, 1.14], [0.62, 1.36], [0.7, 1.5], [0.68, 1.62], [0.5, 1.74], [0.24, 1.82], [0.001, 1.84],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProf, 32), SKIN);
    torso.scale.z = 0.62;
    B.add(torso);
    for (const s of [-1, 1]) {
      ell(B, SKIN, 0.27, [1.12, 0.66, 0.55], [s * 0.21, 1.47, 0.29], [0.15, 0, s * -0.12]); // pec
      ell(B, SHADE, 0.27, [1.05, 0.2, 0.5], [s * 0.21, 1.31, 0.27]); // the shadow under it
      ell(B, SKIN, 0.15, [0.8, 1.5, 0.6], [s * 0.31, 1.1, 0.19]); // oblique
      ell(B, SKIN, 0.3, [0.62, 1.15, 0.85], [s * 0.5, 1.32, -0.06]); // lat
    }
    // six-pack: rounded blocks over a darker base (the grooves)
    ell(B, SHADE, 0.22, [0.95, 1.25, 0.32], [0, 1.1, 0.27]);
    for (let r = 0; r < 3; r++) for (const s of [-1, 1]) ell(B, SKIN, 0.082, [1.05, 0.78, 0.5], [s * 0.088, 1.22 - r * 0.125, 0.31]);
    ell(B, SKIN, 0.3, [1.55, 0.62, 0.95], [0, 1.78, -0.06]); // traps
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.18, 16), SKIN);
    neck.position.y = 1.9;
    B.add(neck);

    // ---- arms: each pivots at the shoulder, bends at the elbow
    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.78, 1.6, 0);
      B.add(pivot);
      ell(pivot, SKIN, 0.27, [1.08, 1, 1.08], [0, 0, 0]); // deltoid boulder
      const upper = new THREE.Group();
      pivot.add(upper);
      ell(upper, SKIN, 0.2, [1, 1.55, 1.05], [s * 0.07, -0.38, 0.07]); // biceps
      ell(upper, SKIN, 0.18, [1, 1.45, 1], [s * 0.1, -0.36, -0.08]); // triceps
      const elbow = new THREE.Group();
      elbow.position.set(s * 0.1, -0.72, 0);
      upper.add(elbow);
      ell(elbow, SKIN, 0.13, [1, 1, 1], [0, 0, 0]); // the elbow joint
      ell(elbow, SKIN, 0.21, [1, 1.45, 1], [0, -0.25, 0.02]); // Popeye forearm
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.045, 8, 20), WHITE);
      band.rotation.x = Math.PI / 2;
      band.position.y = -0.5;
      elbow.add(band);
      const fist = ell(elbow, SKIN, 0.16, [1.05, 1, 1.15], [0, -0.62, 0.03]);
      for (let k = 0; k < 4; k++) ell(elbow, SKIN, 0.045, [1, 1, 1], [(k - 1.5) * 0.065, -0.66, 0.2]); // knuckles
      return { pivot, upper, elbow, fist, side: s };
    });

    // ---- the head: a glossy apple in a headband, grinning
    const head = new THREE.Group();
    head.position.set(0, 2.24, 0.04);
    B.add(head);
    const apple = new THREE.Mesh(appleGeometry(), mat('#e8262c', { roughness: 0.22, metalness: 0.05 }));
    apple.scale.setScalar(1.05);
    head.add(apple);
    ell(head, mat('#ff8a8a', { roughness: 0.2 }), 0.07, [1, 1.3, 0.4], [-0.17, 0.14, 0.29], [0, -0.5, 0.3]); // shine
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.16, 8), mat('#5a3418', { roughness: 0.7 }));
    stem.position.set(0.01, 0.34, 0);
    stem.rotation.z = -0.2;
    head.add(stem);
    ell(head, LEAF_LIGHT, 0.12, [1, 0.18, 0.5], [0.12, 0.38, 0], [0, 0, 0.5]);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.385, 0.045, 10, 36), WHITE);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.13;
    head.add(band);
    for (const s of [-1, 1]) {
      const eye = ell(head, EYE, 0.07, [1, 1.15, 0.45], [s * 0.13, 0.03, 0.34]);
      ell(eye, INK, 0.5, [1, 1, 1], [s * 0.15 + 0.1, -0.1, 0.6]);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.04), INK);
      brow.position.set(s * 0.13, 0.12, 0.35);
      brow.rotation.z = s * -0.42;
      head.add(brow);
    }
    // a big, smug, toothy grin
    ell(head, INK, 0.13, [1.25, 0.55, 0.3], [0.02, -0.13, 0.33], [0, 0, -0.08]);
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.04), WHITE);
    teeth.position.set(0.02, -0.105, 0.36);
    teeth.rotation.z = -0.08;
    head.add(teeth);
    this.head = head;

    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.pose = 'idle';
    this.t = Math.random() * 10;
    this.hand = new THREE.Vector3();
  }

  setPose(p) {
    this.pose = p;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    let a = 0.25; // arms out from the sides (radians about z)
    let up = 0; // forearms raised
    let fwd = 0;
    this.body.position.y = 0;
    this.body.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    if (this.pose === 'idle') {
      a = 0.34 + Math.sin(t * 2) * 0.04;
      up = 0.2;
      this.body.rotation.z = Math.sin(t * 1.5) * 0.04;
    } else if (this.pose === 'flex') {
      // double biceps: upper arms out level, forearms up, a little bounce
      a = 1.45;
      up = 2.1 + Math.sin(t * 9) * 0.12;
      this.body.position.y = Math.abs(Math.sin(t * 4.5)) * 0.06;
      this.head.rotation.z = Math.sin(t * 4.5) * 0.06;
    } else if (this.pose === 'carry') {
      a = 2.75;
      up = 0.1;
      this.body.position.y = Math.abs(Math.sin(t * 6)) * 0.05;
    } else if (this.pose === 'jump') {
      a = 0.6;
      up = 0.4;
      fwd = -0.6;
    } else if (this.pose === 'laugh') {
      a = 0.5;
      up = 1.2;
      this.body.rotation.x = -0.18 + Math.sin(t * 16) * 0.05;
      this.head.rotation.x = -0.25;
      this.body.position.y = Math.abs(Math.sin(t * 16)) * 0.04;
    }
    for (const arm of this.arms) {
      arm.pivot.rotation.set(fwd, 0, arm.side * a);
      arm.elbow.rotation.z = -arm.side * up;
    }
  }

  // Where its right fist is, in world space (carry poses hold things there).
  handWorld(out = this.hand) {
    this.group.updateMatrixWorld(true);
    return this.arms[1].fist.getWorldPosition(out);
  }

  // Midway between its fists (for things held overhead with both hands).
  overheadWorld(out = this.hand) {
    this.group.updateMatrixWorld(true);
    const a = this.arms[0].fist.getWorldPosition(new THREE.Vector3());
    return this.arms[1].fist.getWorldPosition(out).add(a).multiplyScalar(0.5);
  }
}
