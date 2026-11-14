import * as THREE from 'three';

// Air resistance at the head during emergency slow-mo: the snake is still
// pushing forward through air that has gone thick, so bow waves pile up at
// its nose and peel back past it. Each wave is a ring around the head (a
// short flared band, wider at the back, like the front of a shock cone):
// born just ahead of the nose, it widens and slides back over the head,
// fading. Always wider than the head, so it never cuts into the snake.
// Streaks of compressed air ripple round each ring.
// The save is short (a fraction of a second), so it has to read at once: the
// rings come on at full strength, tumble back fast, and linger a moment
// after it ends; when it fires, one big shock ring blasts out from the nose
// (burst()). Bright and nearly opaque at the wave front, so they read on
// bright maps and dark. They run on real time: the world has nearly stopped,
// the air hasn't.
const WAVES = 6;
const PERIOD = 0.34; // seconds for one wave to be born and peel away
const R0 = 0.65; // ring radius at birth (the head is ~0.35-0.5 across the middle)
const R1 = 1.7; // and by the time it has gone past
const LINGER = 0.45; // seconds the rings take to fade once the save ends
const BURST = 0.42; // seconds the shock ring takes to blast out
const BURST_R = 3.4; // and how wide it gets

const vert = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// v runs along the band from its wide back edge (0) to its front edge (1):
// the front is the wave front, a bright line; the band fades out behind it
const frag = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uSeed;
varying vec2 vUv;
void main(){
  float v = vUv.y;
  float front = exp(-pow((v - 0.84) / 0.11, 2.0));
  float band = smoothstep(0.0, 0.65, v) * (1.0 - smoothstep(0.84, 1.0, v));
  float streak = 0.5 + 0.5 * sin(vUv.x * 6.2831 * 10.0 + uSeed * 5.0 + v * 4.0 - uTime * 9.0);
  streak *= 0.7 + 0.3 * sin(vUv.x * 6.2831 * 27.0 + uTime * 13.0 + uSeed);
  float a = clamp((front * (0.85 + 0.15 * streak) + band * 0.55 * streak) * uAlpha, 0.0, 1.0);
  if (a < 0.003) discard;
  // the wave front burns white, the band behind it the tint
  gl_FragColor = vec4(mix(uColor, vec3(1.0), front * 0.6), a);
}`;

function ringMaterial(seed, color) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uAlpha: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: seed },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export class AirWaves {
  constructor() {
    this.group = new THREE.Group();
    this.group.renderOrder = 5;
    // a unit ring band, front edge (narrower) towards +z, back edge flared
    const geo = new THREE.CylinderGeometry(1, 1.25, 0.4, 64, 1, true);
    geo.rotateX(Math.PI / 2);
    this.waves = [];
    for (let i = 0; i < WAVES; i++) {
      const m = new THREE.Mesh(geo, ringMaterial(i * 1.7, '#7fe9ff'));
      m.frustumCulled = false;
      m.visible = false;
      this.group.add(m);
      this.waves.push({ mesh: m, phase: i / WAVES });
    }
    // the shock ring a save fires with
    this.shock = new THREE.Mesh(geo, ringMaterial(3.1, '#bff6ff'));
    this.shock.frustumCulled = false;
    this.shock.visible = false;
    this.group.add(this.shock);
    this.shockT = 1; // 0..1 through the blast (1: done)
    this.shockSize = 1; // 0..1, how big this blast is
    this.amt = 0; // 0..1 how strong the rings are now
    this.time = 0;
    this.tmpQ = new THREE.Quaternion();
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.dir = new THREE.Vector3();
  }

  // A save has just fired: blast a shock ring out from the nose, and start
  // the rings off spread along the head so they're all there at once.
  // size 0..1: how much slow-mo it fired with (a full meter: the full blast)
  burst(size = 1) {
    this.shockT = 0;
    this.shockSize = Math.max(0, Math.min(1, size));
    this.waves.forEach((w, i) => (w.phase = i / WAVES));
  }

  // on: braking; strength 0..1 (how thick the air is); dt real seconds;
  // headPos/headDir/headUp: the drawn head; lift: how far its middle sits
  // above headPos (tall skins sit higher)
  update(dt, on, headPos, headDir, headUp, strength = 1, lift = 0) {
    // on at once (the save is short); off with a fade, so it reads afterwards
    if (on) this.amt = Math.max(this.amt, strength);
    else this.amt = Math.max(0, this.amt - dt / LINGER);
    const shocking = this.shockT < 1;
    if (this.amt <= 0 && !shocking) {
      for (const w of this.waves) w.mesh.visible = false;
      this.shock.visible = false;
      return;
    }
    this.time += dt;
    this.dir.copy(headDir);
    if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 0, -1);
    this.dir.normalize();
    this.tmpQ.setFromUnitVectors(this.fwd, this.dir);
    const fade = this.amt * this.amt * (3 - 2 * this.amt); // smooth tail-off
    for (const w of this.waves) {
      w.phase = (w.phase + dt / PERIOD) % 1;
      const p = w.phase;
      const m = w.mesh;
      m.visible = fade > 0;
      // born at the nose, widening and sliding back over the head
      const ahead = 0.5 - p * 1.6;
      const r = R0 + (R1 - R0) * p;
      m.position.copy(headPos).addScaledVector(this.dir, ahead).addScaledVector(headUp, lift);
      m.quaternion.copy(this.tmpQ);
      m.scale.set(r, r, 1 + p * 1.2);
      const u = m.material.uniforms;
      // in hard at the nose, out as it goes past
      u.uAlpha.value = Math.min(1, p * 8) * (1 - p) ** 1.1 * fade;
      u.uTime.value = this.time;
    }
    // the shock ring: out fast, slowing, thinning as it goes
    const s = this.shock;
    if (shocking) {
      this.shockT = Math.min(1, this.shockT + dt / BURST);
      const k = 1 - (1 - this.shockT) ** 3; // fast out, easing off
      const r = R0 + (BURST_R - R0) * this.shockSize * k;
      s.visible = true;
      s.position.copy(headPos).addScaledVector(this.dir, 0.4 - k * 0.6).addScaledVector(headUp, lift);
      s.quaternion.copy(this.tmpQ);
      s.scale.set(r, r, 1.6 - k * 0.9);
      s.material.uniforms.uAlpha.value = (1 - this.shockT) ** 1.4 * (0.6 + 0.6 * this.shockSize);
      s.material.uniforms.uTime.value = this.time;
    } else s.visible = false;
  }
}
