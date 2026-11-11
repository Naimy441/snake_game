import * as THREE from 'three';
import { makeCrystalApple } from '../render/FoodView.js';

// The epilogue's meteor apples, and the fire and fury around them.
//   HeroMeteor  - the giant one that ends the world in the cutscene.
//   MeteorField - the ones the colossal snake eats: a warning ring where
//                 each will land, the fall, then a burning apple on the board.
//   Fireballs   - expanding glows for explosions.
//   SkyStreaks  - meteors streaking across the burning sky, far off.
//   Strikes     - the cutscene's big meteors that crash into the yard.

const FIRE_VS = `
uniform float uTime; uniform vec3 uDir; uniform float uStretch; uniform float uWobble;
varying vec3 vN; varying vec3 vV; varying float vBack; varying vec3 vP;
void main(){
  vec3 n = normalize(normal);
  float back = max(0.0, dot(n, -uDir));
  vec3 p = position;
  float w = sin(position.x * 9.0 + uTime * 17.0) * sin(position.y * 7.0 - uTime * 13.0) * sin(position.z * 8.0 + uTime * 11.0);
  p += n * w * uWobble;
  p += -uDir * pow(back, 2.2) * uStretch * (0.8 + 0.2 * sin(uTime * 23.0 + position.x * 5.0 + position.z * 3.0));
  vBack = back;
  vP = position;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * n);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FIRE_FS = `
uniform float uTime; uniform float uAlpha; uniform float uHeat;
varying vec3 vN; varying vec3 vV; varying float vBack; varying vec3 vP;
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float flick = 0.7 + 0.3 * sin(vP.y * 18.0 - uTime * 31.0 + vP.x * 13.0) * sin(vP.z * 15.0 + uTime * 19.0);
  vec3 hot = vec3(1.0, 0.95, 0.72);
  vec3 mid = vec3(1.0, 0.5, 0.08);
  vec3 cool = vec3(0.85, 0.1, 0.03);
  vec3 col = mix(hot, mid, smoothstep(0.0, 0.45, vBack + f * 0.3));
  col = mix(col, cool, smoothstep(0.45, 1.0, vBack));
  float a = (0.25 + 0.75 * pow(f, 1.2)) * flick * uAlpha * (1.0 - 0.55 * vBack * vBack);
  gl_FragColor = vec4(col * a * uHeat, a);
}`;

export function fireMaterial({ dir = new THREE.Vector3(0, -1, 0), stretch = 1, wobble = 0.04, heat = 2 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uDir: { value: dir.clone().normalize() }, uStretch: { value: stretch }, uWobble: { value: wobble },
      uAlpha: { value: 1 }, uHeat: { value: heat },
    },
    vertexShader: FIRE_VS,
    fragmentShader: FIRE_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// A burning apple: the crystal apple, charred and glowing, inside a shell of fire.
export function burningApple(glowTex, { size = 1, stretch = 0.5, heat = 2 } = {}) {
  const g = new THREE.Group();
  const apple = makeCrystalApple();
  const body = apple.children[0];
  body.material = body.material.clone();
  body.material.color.set('#ff3a1a');
  body.material.emissive.set('#ff2a00');
  body.material.emissiveIntensity = 1.1;
  apple.scale.multiplyScalar(size);
  g.add(apple);
  const fire = new THREE.Mesh(new THREE.SphereGeometry(0.42 * size, 24, 16), fireMaterial({ stretch: stretch * size, wobble: 0.04 * size, heat }));
  g.add(fire);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff7a2a', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(2.0 * size);
  glow.material.opacity = 0.5;
  g.add(glow);
  return { group: g, apple, fire, glow, body: body.material };
}

// ---------------------------------------------------------------- hero meteor
export class HeroMeteor {
  constructor(glowTex) {
    const b = burningApple(glowTex, { size: 9, stretch: 2.6, heat: 2.4 });
    this.group = b.group;
    this.parts = b;
    // seen from far off: never fogged out
    this.group.traverse((o) => {
      if (o.material) o.material.fog = false;
    });
    b.glow.scale.setScalar(70);
    b.glow.material.opacity = 0.9;
    this.group.visible = false;
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.t = 0;
    this.dur = 1;
    this.done = true;
  }

  // Fall from `from` to `to` over dur seconds (faster and faster).
  launch(from, to, dur) {
    this.from.copy(from);
    this.to.copy(to);
    this.dur = dur;
    this.t = 0;
    this.done = false;
    this.group.visible = true;
    const dir = this.to.clone().sub(this.from).normalize();
    this.parts.fire.material.uniforms.uDir.value.copy(dir);
    this.dir = dir;
  }

  // 0..1 along its fall
  get k() {
    return Math.min(1, this.t / this.dur);
  }

  update(dt, time) {
    this.parts.fire.material.uniforms.uTime.value = time;
    if (this.done) return false;
    this.t += dt;
    const k = this.k;
    const e = k * k * (0.6 + 0.4 * k);
    this.group.position.lerpVectors(this.from, this.to, e);
    this.parts.apple.rotation.x += dt * 0.6;
    this.parts.apple.rotation.y += dt * 0.9;
    if (k >= 1) {
      this.done = true;
      this.group.visible = false;
      return true; // impact
    }
    return false;
  }
}

// ---------------------------------------------------------------- fireballs
// A thick, lumpy ball (dense core, cauliflower edge) for fire and smoke.
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.6, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  blob(64, 64, 44, 1);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    blob(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30, 22 + (i % 3) * 5, 0.9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Fireballs {
  constructor(glowTex, n = 14) {
    this.glowTex = glowTex;
    this.puffTex = puffTexture();
    this.group = new THREE.Group();
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.visible = false;
      s.userData = { t: 1 };
      this.pool.push(s);
      this.group.add(s);
    }
  }

  // A fireball at p that swells to size and fades over dur, drifting by vel.
  // solid: a thick ball of fire or smoke (normal blending, reads against a
  // bright sky) instead of a glow.
  spawn(p, { size = 4, dur = 1.2, color = '#ff8a2a', vel = null, delay = 0, solid = false } = {}) {
    const s = this.pool.find((x) => x.userData.t >= 1) || this.pool[0];
    s.position.copy(p);
    s.material.color.set(color);
    s.material.blending = solid ? THREE.NormalBlending : THREE.AdditiveBlending;
    s.material.map = solid ? this.puffTex : this.glowTex;
    s.material.rotation = Math.random() * Math.PI * 2;
    s.renderOrder = solid ? 3 : 0;
    s.userData = { t: -delay / dur, dur, size, vel: vel ? vel.clone() : null };
    s.visible = delay <= 0;
  }

  update(dt) {
    for (const s of this.pool) {
      const u = s.userData;
      if (u.t >= 1) continue;
      u.t += dt / u.dur;
      if (u.t < 0) continue;
      s.visible = u.t < 1;
      const k = Math.min(1, u.t);
      if (u.vel) s.position.addScaledVector(u.vel, dt);
      s.scale.setScalar(u.size * (0.25 + 0.75 * (1 - Math.pow(1 - k, 3))));
      s.material.opacity = Math.pow(1 - k, 1.6) * Math.min(1, k * 12);
    }
  }
}

// ---------------------------------------------------------------- sky streaks
export class SkyStreaks {
  constructor(glowTex, n = 8) {
    this.group = new THREE.Group();
    this.on = false;
    this.streaks = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0.5, 0, 0);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ float x = vUv.x; float y = abs(vUv.y - 0.5) * 2.0; float a = pow(x, 2.5) * (1.0 - y * y) * uA; vec3 c = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.95, 0.75), pow(x, 6.0)); gl_FragColor = vec4(c * a * 2.0, a); }',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.userData = { t: 1, wait: Math.random() * 2 };
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffc070', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      head.position.x = 1;
      m.add(head);
      this.streaks.push(m);
      this.group.add(m);
    }
  }

  update(dt, camera) {
    for (const m of this.streaks) {
      const u = m.userData;
      if (u.t >= 1) {
        u.wait -= dt;
        m.visible = false;
        if (!this.on || u.wait > 0) continue;
        // a new one: high in the sky, angled down, somewhere in front-ish
        const a = Math.random() * Math.PI * 2;
        const R = 140 + Math.random() * 120;
        u.from = new THREE.Vector3(Math.cos(a) * R, 70 + Math.random() * 60, Math.sin(a) * R);
        u.dir = new THREE.Vector3(Math.random() - 0.5, -0.45 - Math.random() * 0.3, Math.random() - 0.5).normalize();
        u.speed = 70 + Math.random() * 60;
        u.len = 18 + Math.random() * 22;
        u.t = 0;
        u.dur = 1.4 + Math.random() * 1.2;
        u.wait = 0.2 + Math.random() * 1.1;
      }
      u.t += dt / u.dur;
      m.visible = u.t < 1;
      const p = u.from.clone().addScaledVector(u.dir, u.speed * u.t * u.dur);
      m.position.copy(p).addScaledVector(u.dir, -u.len);
      // a ribbon from the tail to the head, turned to face the camera
      const side = new THREE.Vector3().subVectors(camera.position, m.position).cross(u.dir).normalize();
      const up = new THREE.Vector3().crossVectors(u.dir, side);
      const mtx = new THREE.Matrix4().makeBasis(u.dir, side, up);
      m.quaternion.setFromRotationMatrix(mtx);
      m.scale.set(u.len, 1.6, 1);
      m.children[0].scale.set(4 / u.len, 4 / 1.6, 1);
      m.material.uniforms.uA.value = Math.sin(Math.min(1, u.t) * Math.PI);
    }
  }
}

// ---------------------------------------------------------------- the field
const FALL_MS = 1100; // how long the fall takes, before it lands
export class MeteorField {
  constructor(glowTex, ringTex) {
    this.group = new THREE.Group();
    this.glowTex = glowTex;
    this.views = new Map();
    this.free = [];
    this.markerMat = new THREE.MeshBasicMaterial({ map: ringTex, color: new THREE.Color('#ff3a1a').multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.crossGeo = new THREE.PlaneGeometry(0.9, 0.09);
    this.crossMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a2a').multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.floorMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color('#ff5a1a').multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.ringGeo = new THREE.PlaneGeometry(1.4, 1.4);
    for (let i = 0; i < 40; i++) this.free.push(this.make());
  }

  make() {
    const b = burningApple(this.glowTex, { size: 1.05, stretch: 0.5, heat: 2 });
    const v = { ...b, marker: new THREE.Group(), floor: new THREE.Mesh(this.ringGeo, this.floorMat) };
    const ring = new THREE.Mesh(this.ringGeo, this.markerMat);
    ring.rotation.x = -Math.PI / 2;
    v.marker.add(ring);
    for (const r of [Math.PI / 4, -Math.PI / 4]) {
      const c = new THREE.Mesh(this.crossGeo, this.crossMat);
      c.rotation.set(-Math.PI / 2, 0, r);
      c.position.y = 0.01;
      v.marker.add(c);
    }
    v.ring = ring;
    v.floor.rotation.x = -Math.PI / 2;
    v.floor.scale.setScalar(1.3);
    v.group.add(v.floor);
    v.group.visible = false;
    v.marker.visible = false;
    v.fire.castShadow = false;
    v.apple.traverse((o) => (o.castShadow = true));
    this.group.add(v.group, v.marker);
    return v;
  }

  clear() {
    for (const [id, v] of this.views) {
      v.group.visible = false;
      v.marker.visible = false;
      this.free.push(v);
      this.views.delete(id);
    }
  }

  // Sync with the game's meteors. now: game time (ms), smoothed between moves.
  // Returns the falling ones' positions (for trails).
  sync(game, toWorld, now, time, dt) {
    const seen = new Set();
    for (const m of game.meteors) {
      seen.add(m.id);
      let v = this.views.get(m.id);
      if (!v) {
        v = this.free.pop() || this.make();
        this.views.set(m.id, v);
        v.born = time;
        v.fromOff = new THREE.Vector3(-5 - Math.random() * 4, 16 + Math.random() * 6, -8 - Math.random() * 6);
      }
      const w = toWorld(m.x, m.z);
      const left = m.landed ? 0 : m.landAt - now;
      // the warning ring tightens as it comes
      v.marker.visible = !m.landed;
      if (v.marker.visible) {
        const k = Math.max(0, Math.min(1, left / 1700));
        v.marker.position.set(w.x, 0.04, w.z);
        v.marker.scale.setScalar(0.7 + k * 0.9);
        v.ring.material.opacity = 0.6 + 0.4 * Math.sin(time * 14);
        v.marker.rotation.y = time * 2;
      }
      const falling = !m.landed && left < FALL_MS;
      v.group.visible = m.landed || falling;
      const u = v.fire.material.uniforms;
      u.uTime.value = time + m.id;
      if (falling) {
        const k = 1 - Math.max(0, left) / FALL_MS;
        const e = k * k;
        v.group.position.set(w.x + v.fromOff.x * (1 - e), 0.35 + v.fromOff.y * (1 - e), w.z + v.fromOff.z * (1 - e));
        u.uDir.value.copy(v.fromOff).multiplyScalar(-1).normalize();
        u.uStretch.value = 1.6;
        v.floor.visible = false;
        v.glow.scale.setScalar(2.4);
      } else if (m.landed) {
        // burning where it fell: flames lick upward, the apple bobs a little
        v.group.position.set(w.x, 0.34 + Math.sin(time * 3 + m.id) * 0.03, w.z);
        u.uDir.value.set(0, -1, 0);
        u.uStretch.value = 0.55 + Math.sin(time * 9 + m.id) * 0.08;
        v.floor.visible = true;
        v.floor.position.y = -0.31;
        v.glow.scale.setScalar(1.6 + Math.sin(time * 7 + m.id) * 0.15);
      }
      v.apple.rotation.y += dt * 0.8;
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      v.group.visible = false;
      v.marker.visible = false;
      this.views.delete(id);
      this.free.push(v);
    }
  }

  // Where the meteors still falling are right now (for sparks).
  *falling() {
    for (const v of this.views.values()) if (v.group.visible && !v.floor.visible) yield v.group.position;
  }
}

// ---------------------------------------------------------------- strikes
// The cutscene's big meteor apples: each screams down onto a spot and then
// sits there burning (in a group, so they shrink with the world).
export class Strikes {
  constructor(glowTex, n = 6) {
    this.group = new THREE.Group();
    this.list = [];
    for (let i = 0; i < n; i++) {
      const b = burningApple(glowTex, { size: 2.3, stretch: 1.6, heat: 2.2 });
      b.group.visible = false;
      b.group.traverse((o) => o.material && (o.material.fog = false));
      this.group.add(b.group);
      this.list.push({ b, state: 'idle' });
    }
  }

  clear() {
    for (const s of this.list) {
      s.state = 'idle';
      s.b.group.visible = false;
    }
  }

  // Drop one on `to` (in the group's own units) over dur seconds; onLand(to) when it hits.
  drop(to, dur = 0.9, onLand = null) {
    const s = this.list.find((x) => x.state === 'idle');
    if (!s) return;
    s.state = 'fall';
    s.t = 0;
    s.dur = dur;
    s.to = to.clone();
    s.from = to.clone().add(new THREE.Vector3(-6, 24, -12));
    s.onLand = onLand;
    s.b.group.visible = true;
    s.b.fire.material.uniforms.uDir.value.copy(s.to).sub(s.from).normalize();
    s.b.fire.material.uniforms.uStretch.value = 1.6 * 2.3;
  }

  update(dt, time) {
    for (const s of this.list) {
      if (s.state === 'idle') continue;
      const u = s.b.fire.material.uniforms;
      u.uTime.value = time + s.to.x;
      s.b.apple.rotation.y += dt;
      if (s.state === 'fall') {
        s.t += dt;
        const k = Math.min(1, s.t / s.dur);
        s.b.group.position.lerpVectors(s.from, s.to, k * k);
        if (k >= 1) {
          s.state = 'burn';
          s.b.group.position.set(s.to.x, 0.55, s.to.z);
          u.uDir.value.set(0, -1, 0);
          u.uStretch.value = 0.7 * 2.3;
          s.b.glow.scale.setScalar(3.4);
          if (s.onLand) s.onLand(s.to);
        }
      } else {
        u.uStretch.value = (0.65 + Math.sin(time * 8 + s.to.z) * 0.08) * 2.3;
      }
    }
  }
}
