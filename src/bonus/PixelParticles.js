import * as THREE from 'three';

export const RAINBOW = ['#ff3b5c', '#ff8a2a', '#ffd23f', '#7dff6a', '#38f6ff', '#4d7cff', '#c77dff', '#ff5dd8'];
export const GOLD = ['#ffd23f', '#ffc21a', '#fff1a8', '#ffb000'];
const MAX_PARTS = 2400;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Explosions of little coloured cubes that fly out, fall, spin, shrink as
// they die, and bounce on the board. All drawn in one instanced draw call.
export class PixelParticles {
  // half: half the board's width in world units (cubes bounce inside it)
  constructor(parent, { half = 8, max = MAX_PARTS } = {}) {
    this.half = half;
    this.max = max;
    this.parts = [];
    this.dummy = new THREE.Object3D();
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), max);
    // set a colour on every instance once, so the instanceColor buffer exists
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, white);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  // A burst of cubes from pos (a Vector3).
  //   ring: fire evenly round a circle (fireworks) instead of a random spray
  //   up: how much of the speed goes upward; gravity and size are multipliers
  burst(pos, { count = 30, colors = RAINBOW, speed = 1, size = 1, life = 1, gravity = 1, ring = false, up = 1, glow = 1.25 } = {}) {
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= this.max) this.parts.shift(); // the oldest make room
      const a = ring ? (i / count) * Math.PI * 2 : Math.random() * Math.PI * 2;
      const el = ring ? (Math.random() - 0.5) * 0.6 : Math.random() * 1.2 + 0.2;
      const v = (ring ? 1 : 0.4 + Math.random() * 0.8) * speed * 5.5;
      const L = life * (0.6 + Math.random() * 0.6);
      this.parts.push({
        p: pos.clone(),
        v: new THREE.Vector3(Math.cos(a) * Math.cos(el) * v, Math.sin(el) * v * up + (ring ? 0 : 2.5 * speed), Math.sin(a) * Math.cos(el) * v),
        life: L, max: L, s: (0.07 + Math.random() * 0.09) * size, g: 9 * gravity,
        // a touch over 1, so they catch the bloom
        c: new THREE.Color(colors[Math.floor(Math.random() * colors.length)]).multiplyScalar(glow),
        spin: Math.random() * 10,
      });
    }
  }

  // A sphere of cubes (the big party explosion): even in every direction.
  sphere(pos, { count = 300, colors = RAINBOW, speed = 1, size = 1, life = 1.6, gravity = 0.5, glow = 1.6 } = {}) {
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = (0.55 + Math.random() * 0.6) * speed * 9;
      const L = life * (0.6 + Math.random() * 0.6);
      this.parts.push({
        p: pos.clone(),
        v: new THREE.Vector3(Math.cos(a) * r * v, Math.abs(u) * v * 0.9 + 2, Math.sin(a) * r * v),
        life: L, max: L, s: (0.1 + Math.random() * 0.14) * size, g: 9 * gravity,
        c: new THREE.Color(colors[Math.floor(Math.random() * colors.length)]).multiplyScalar(glow),
        spin: Math.random() * 10,
      });
    }
  }

  clear() {
    this.parts.length = 0;
    this.mesh.count = 0;
  }

  // Call every frame.
  update(dt) {
    const lim = this.half + 1.5;
    for (const p of this.parts) {
      p.life -= dt;
      p.v.y -= p.g * dt;
      p.v.multiplyScalar(Math.exp(-dt * 0.8)); // air drag
      p.p.addScaledVector(p.v, dt);
      // pixels bounce on the board
      if (p.p.y < p.s / 2 && Math.abs(p.p.x) < lim && Math.abs(p.p.z) < lim && p.v.y < 0 && p.p.y > -0.6) {
        p.p.y = p.s / 2;
        p.v.y *= -0.4;
        p.v.x *= 0.7;
        p.v.z *= 0.7;
      }
    }
    this.parts = this.parts.filter((p) => p.life > 0 && p.p.y > -30);
    const d = this.dummy;
    const n = Math.min(this.parts.length, this.max);
    for (let i = 0; i < n; i++) {
      const p = this.parts[i];
      const k = Math.sqrt(clamp01(p.life / p.max)); // shrink as they die
      d.position.copy(p.p);
      d.rotation.set(p.spin * p.life, p.spin * p.life * 0.7, 0);
      d.scale.setScalar(p.s * k);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.mesh.setColorAt(i, p.c);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
