import * as THREE from 'three';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Title screen: one unbroken drone shot that tours the world. Every map gets
// the same beats (a high reveal while the new map sweeps in, a low glide
// across the arena, a slow pan out over the scenery to the horizon, a climb
// back out), while the angle around the island keeps advancing, so each map
// is seen from a new side and the shot never cuts.
//   u: fraction of the segment   r, y: camera radius and height
//   w: angular speed (rad/s)     tr, ta, ty: look-at radius, angle (relative
//   to the camera's own angle) and height   fov: field of view
//   fs: how much the look-at leans toward the snake (it plays itself here)
export const TOUR_SEGMENT = 15; // seconds per map
// The low beats stay inside the ring of palms and props (radius ~12), and the
// wider ones stay above their tops, so nothing ever brushes the lens.
const TOUR_KEYS = [
  { u: 0.0, r: 38, y: 22, w: 0.1, tr: 0, ta: 0, ty: -2, fov: 46, fs: 0 },
  { u: 0.17, r: 17, y: 14, w: 0.12, tr: 0, ta: 0, ty: -1, fov: 50, fs: 0.35 },
  { u: 0.34, r: 9.5, y: 3.2, w: 0.17, tr: 2, ta: 0, ty: 1.3, fov: 56, fs: 0.75 },
  { u: 0.49, r: 10, y: 6.5, w: 0.13, tr: 26, ta: 1.0, ty: 4, fov: 52, fs: 0 },
  { u: 0.67, r: 14, y: 11.5, w: 0.07, tr: 95, ta: 1.2, ty: 11, fov: 40, fs: 0 },
  { u: 0.85, r: 30, y: 17, w: 0.07, tr: 8, ta: 0.3, ty: -1, fov: 44, fs: 0 },
];
const TOUR_FIELDS = ['r', 'y', 'w', 'tr', 'ta', 'ty', 'fov', 'fs'];

// Catmull-Rom through the (cyclic) key table at segment fraction u.
function tourKey(u, out) {
  const K = TOUR_KEYS;
  const n = K.length;
  let i = n - 1;
  while (i > 0 && K[i].u > u) i--;
  const k1 = K[i];
  const k2 = K[(i + 1) % n];
  const u2 = i + 1 < n ? k2.u : 1;
  const s = (u - k1.u) / (u2 - k1.u);
  const k0 = K[(i - 1 + n) % n];
  const k3 = K[(i + 2) % n];
  const s2 = s * s;
  const s3 = s2 * s;
  for (const f of TOUR_FIELDS) {
    const p0 = k0[f], p1 = k1[f], p2 = k2[f], p3 = k3[f];
    out[f] = 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (-p0 + 3 * p1 - 3 * p2 + p3) * s3);
  }
  return out;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Computes the active pose every frame (orbit for menus, classic overhead,
// third-person chase and first-person) and blends from a snapshot of the
// previous view to it, so switching is seamless mid-game.
export class CameraRig {
  constructor(camera, size) {
    this.camera = camera;
    this.size = size;
    this.mode = 'orbit';
    this.blend = 1;
    this.blendDur = 0.7;
    this.from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 50 };
    this.pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 50 };
    this.overhead = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 40 };
    this.fpYaw = null;
    this.fpYawVel = 0;
    this.fpRoll = 0;
    this.tpYaw = null;
    this.tpYawVel = 0;
    this.tpRoll = 0;
    this.tpPull = 0;
    this.pitch = 0; // smoothed climb (+1) / dive (-1), for flight
    this.flying = false;
    this.shake = 0;
    this.kick = 0;
    this.orbitAngle = 0.6;
    this.tourT = 0;
    this.tourAngle = 0.5;
    this.tmpObj = new THREE.PerspectiveCamera(); // camera-style lookAt (-z forward)
    this.tmpV = new THREE.Vector3();
    this.tmpCam = camera.clone();
    this.fitOverhead(camera.aspect);
  }

  // The board grows between zones: ease the overhead framing out to fit.
  setBoardSize(size, instant = false) {
    this.sizeTarget = size;
    if (instant) {
      this.size = size;
      this.fitOverhead(this.camera.aspect);
    }
  }

  easeBoardSize(dt) {
    if (this.sizeTarget == null || this.size === this.sizeTarget) return;
    const d = this.sizeTarget - this.size;
    this.size = Math.abs(d) < 0.01 ? this.sizeTarget : this.size + d * Math.min(1, dt * 4);
    this.fitOverhead(this.camera.aspect);
  }

  setMode(mode, { instant = false, reduceMotion = false } = {}) {
    if (mode !== this.mode && (mode === 'orbit' || mode === 'showcase' || mode === 'tour')) this.cine = null;
    if (mode === this.mode && !instant) return;
    this.from.pos.copy(this.camera.position);
    this.from.quat.copy(this.camera.quaternion);
    this.from.fov = this.camera.fov;
    this.mode = mode;
    this.blend = instant ? 1 : 0;
    this.blendDur = reduceMotion ? 0.3 : mode === 'tour' ? 2.2 : 0.75;
    if (mode === 'fp') this.fpYaw = null;
    if (mode === 'tp') this.tpYaw = null;
  }

  // Lift-off cinematic: pull out to a high, narrow-angle (near isometric)
  // view, swing a full turn around the snake as it rockets up, then glide
  // back into whatever camera the player uses. Layered over the normal pose.
  startCinematic(duration = 3.6) {
    this.cine = { t: 0, dur: duration, yaw0: null, center: null };
  }

  applyCinematic(dt, snake) {
    const c = this.cine;
    c.t += dt;
    const k = c.t / c.dur;
    if (k >= 1) {
      this.cine = null;
      return;
    }
    const hp = snake.headPos;
    if (!c.center) {
      c.center = hp.clone();
      // start from behind the snake, the way the player is facing
      c.yaw0 = Math.atan2(snake.headDir.x, snake.headDir.z) + Math.PI;
      if (Math.abs(snake.headDir.y) > 0.9) c.yaw0 = Math.atan2(-this.camera.position.x + hp.x, -this.camera.position.z + hp.z) + Math.PI;
    }
    c.center.lerp(hp, Math.min(1, dt * 4));
    const w = Math.min(smoothstep(0, 0.2, k), 1 - smoothstep(0.6, 1, k));
    const a = c.yaw0 + Math.PI * 2 * ease(Math.min(1, k / 0.85));
    const elev = THREE.MathUtils.degToRad(34);
    const R = 15;
    const pos = this.tmpV.set(Math.sin(a) * Math.cos(elev) * R, Math.sin(elev) * R, Math.cos(a) * Math.cos(elev) * R).add(c.center);
    this.tmpObj.position.copy(pos);
    this.tmpObj.up.set(0, 1, 0);
    this.tmpObj.lookAt(c.center.x, c.center.y + 1.2, c.center.z);
    const cam = this.camera;
    cam.position.lerp(pos, w);
    cam.quaternion.slerp(this.tmpObj.quaternion, w);
    cam.fov += (34 - cam.fov) * w;
  }

  // Heading the player sees in the chase / first-person views.
  viewYaw() {
    if (this.mode === 'fp') return this.fpYaw;
    if (this.mode === 'tp' || this.highChase) return this.tpYaw;
    return null;
  }

  // In the sky the overhead view becomes a high chase camera: a fixed
  // overhead can't show altitude, and flight steering is always relative.
  get highChase() {
    return this.mode === 'overhead' && this.flying;
  }

  // Find the closest distance at which the whole board, walls included, fits
  // on screen for the current aspect ratio. Portrait screens get a steeper,
  // more top-down angle.
  fitOverhead(aspect) {
    const cam = this.tmpCam;
    cam.aspect = aspect;
    const portrait = aspect < 0.9;
    cam.fov = portrait ? 52 : 40;
    cam.updateProjectionMatrix();
    const elev = THREE.MathUtils.degToRad(portrait ? 78 : 62);
    const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
    const target = new THREE.Vector3(0, 0, portrait ? 0.3 : 0.9);
    const h = this.size / 2 + 0.6;
    const corners = [];
    for (const x of [-h, h]) for (const z of [-h, h]) for (const y of [0, 0.6]) corners.push(new THREE.Vector3(x, y, z));
    const fits = (dist) => {
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      const limX = 0.94;
      const limTop = portrait ? 0.7 : 0.8; // leave room for the HUD
      const limBottom = portrait ? -0.72 : -0.94;
      for (const c of corners) {
        const p = this.tmpV.copy(c).project(cam);
        if (Math.abs(p.x) > limX || p.y > limTop || p.y < limBottom || p.z > 1) return false;
      }
      return true;
    };
    let lo = 5;
    let hi = 200;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    // Recentre vertically: shift the target so the board's projected extent is balanced.
    cam.position.copy(target).addScaledVector(dir, hi);
    cam.lookAt(target);
    this.overhead.pos.copy(cam.position);
    this.overhead.quat.copy(cam.quaternion);
    this.overhead.fov = cam.fov;
  }

  // Garage: a slow orbit close around the snake's head, framed off-centre so
  // the customisation panel doesn't cover it.
  computeShowcase(dt, snake, reduceMotion, out) {
    this.showAngle = (this.showAngle ?? 0.9) + dt * (reduceMotion ? 0.1 : 0.32);
    const a = this.showAngle;
    const hp = snake.headPos;
    const r = 3.1;
    out.pos.set(hp.x + Math.sin(a) * r, hp.y + 1.45, hp.z + Math.cos(a) * r);
    const portrait = this.camera.aspect < 0.9;
    const right = this.tmpV.set(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(portrait ? 0 : 0.85);
    this.tmpObj.position.copy(out.pos);
    this.tmpObj.up.set(0, 1, 0);
    this.tmpObj.lookAt(hp.x + right.x, hp.y + (portrait ? -0.35 : 0.2), hp.z + right.z);
    out.quat.copy(this.tmpObj.quaternion);
    out.fov = portrait ? 55 : 42;
  }

  // The title-screen tour (see TOUR_KEYS). sky: 0..1, how far the world has
  // lifted into Sunset Heavens, where the flight box is wider than the board.
  computeTour(dt, reduceMotion, sky, snake, out) {
    const speed = reduceMotion ? 0.45 : 1;
    this.tourT += dt * speed;
    const k = tourKey((this.tourT / TOUR_SEGMENT) % 1, this.tourK || (this.tourK = {}));
    this.tourAngle += k.w * dt * speed;
    const a = this.tourAngle;
    const grow = 1 + 0.45 * sky;
    const r = k.r * grow;
    const t = this.tourT;
    // a drone's slow, breathing drift (never in reduce motion)
    const d = reduceMotion ? 0 : 1;
    out.pos.set(Math.sin(a) * r + Math.sin(t * 0.53) * 0.25 * d, k.y + (k.y < 6 ? sky * 2 : 0) + Math.sin(t * 0.71 + 1) * 0.18 * d, Math.cos(a) * r + Math.cos(t * 0.47) * 0.25 * d);
    const ta = a + k.ta;
    const tr = k.tr < 40 ? k.tr * grow : k.tr;
    this.tmpObj.position.copy(out.pos);
    this.tmpObj.up.set(0, 1, 0);
    // lean toward the (smoothed) snake head so the demo play stays in shot
    const hp = snake.headPos;
    const f = this.tourFocus || (this.tourFocus = hp.clone());
    f.lerp(hp, Math.min(1, dt * 1.5));
    const fs = Math.max(0, Math.min(1, k.fs));
    const lx = Math.sin(ta) * tr;
    const lz = Math.cos(ta) * tr;
    this.tmpObj.lookAt(lx + (f.x - lx) * fs, k.ty + (f.y + 0.4 - k.ty) * fs, lz + (f.z - lz) * fs);
    this.tmpObj.rotateZ(Math.sin(t * 0.31) * 0.012 * d);
    out.quat.copy(this.tmpObj.quaternion);
    out.fov = k.fov;
  }

  // Index of the map segment the tour is in (counts up forever).
  get tourSegment() {
    return Math.floor(this.tourT / TOUR_SEGMENT);
  }

  // Fraction of the way through the current map's segment.
  get tourProgress() {
    return (this.tourT / TOUR_SEGMENT) % 1;
  }

  computeOrbit(dt, reduceMotion, out) {
    this.orbitAngle += dt * (reduceMotion ? 0.03 : 0.08);
    const r = 26;
    out.pos.set(Math.sin(this.orbitAngle) * r, 13, Math.cos(this.orbitAngle) * r);
    this.tmpObj.position.copy(out.pos);
    this.tmpObj.lookAt(0, -1.5, 0);
    out.quat.copy(this.tmpObj.quaternion);
    out.fov = 50;
  }

  // Heading to face: the steering direction while playing, else the head's.
  aimYaw(snake) {
    const d = this.aim;
    return d ? Math.atan2(d.x, d.z) : Math.atan2(snake.headDir.x, snake.headDir.z);
  }

  // Damped yaw follow, substepped so long frames stay stable.
  followYaw(target, yaw, vel, k, dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const diff = wrapAngle(target - yaw);
      vel += (k * k * diff - 2 * k * vel) * h;
      yaw = wrapAngle(yaw + vel * h);
    }
    return [yaw, vel];
  }

  // Third person: behind and above the head, swinging smoothly through turns
  // and pulling back as the speed builds.
  // high: the sky's overhead view, further back and higher up.
  computeTP(dt, snake, speedFx, reduceMotion, out, high = false) {
    const targetYaw = this.aimYaw(snake);
    if (this.tpYaw === null) {
      this.tpYaw = targetYaw;
      this.tpYawVel = 0;
    }
    [this.tpYaw, this.tpYawVel] = this.followYaw(targetYaw, this.tpYaw, this.tpYawVel, high ? 9 : 15, dt);
    const fwd = this.tmpV.set(Math.sin(this.tpYaw), 0, Math.cos(this.tpYaw));
    this.tpPull += ((reduceMotion ? 0 : speedFx) - this.tpPull) * Math.min(1, dt * 2);
    const dist = high ? 8.4 + this.tpPull * 1.2 : 4.3 + this.tpPull * 1.1;
    const height = high ? 6.2 + this.tpPull * 0.5 : 2.9 + this.tpPull * 0.4;
    const hp = snake.headPos;
    // climbing: drop below and look up the climb; diving: rise and look down it
    const p = this.pitch * (high ? 0.5 : 0.75);
    const ap = Math.abs(p);
    const back = dist * (1 - 0.3 * ap);
    out.pos.set(hp.x - fwd.x * back, hp.y + height * (1 - 1.15 * p), hp.z - fwd.z * back);
    // stay inside the flight box: near the ceiling or floor, slide back instead
    if (this.flying && this.box) {
      const top = this.box.ceilY - 0.7;
      const bot = this.box.floorY + 0.5;
      const ex = out.pos.y > top ? out.pos.y - top : out.pos.y < bot ? bot - out.pos.y : 0;
      out.pos.y = Math.min(top, Math.max(bot, out.pos.y));
      out.pos.x -= fwd.x * ex * 0.4;
      out.pos.z -= fwd.z * ex * 0.4;
    }
    const rollTarget = reduceMotion ? 0 : THREE.MathUtils.clamp(-this.tpYawVel * 0.02, -0.07, 0.07);
    this.tpRoll += (rollTarget - this.tpRoll) * Math.min(1, dt * 6);
    this.tmpObj.position.copy(out.pos);
    this.tmpObj.up.set(0, 1, 0);
    const ahead = (high ? 3 : 3.3) * (1 - ap);
    this.tmpObj.lookAt(hp.x + fwd.x * ahead, hp.y + p * 4.5, hp.z + fwd.z * ahead);
    this.tmpObj.rotateZ(this.tpRoll);
    out.quat.copy(this.tmpObj.quaternion);
    out.fov = (high ? 56 : 60) + (reduceMotion ? 0 : speedFx * (high ? 6 : 12));
  }

  computeFP(dt, snake, speedFx, reduceMotion, out) {
    const targetYaw = this.aimYaw(snake);
    if (this.fpYaw === null) this.fpYaw = targetYaw;
    // Critically damped yaw: turns feel quick but never snap 90 degrees in a frame.
    // Substepped so it stays stable even when a frame takes a long time.
    const k = 26;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const diff = wrapAngle(targetYaw - this.fpYaw);
      const acc = k * k * diff - 2 * k * this.fpYawVel;
      this.fpYawVel += acc * h;
      this.fpYaw = wrapAngle(this.fpYaw + this.fpYawVel * h);
    }
    const fwd = this.tmpV.set(Math.sin(this.fpYaw), 0, Math.cos(this.fpYaw));
    const rollTarget = reduceMotion ? 0 : THREE.MathUtils.clamp(-this.fpYawVel * 0.025, -0.09, 0.09);
    this.fpRoll += (rollTarget - this.fpRoll) * Math.min(1, dt * 8);

    const hp = snake.headPos;
    // flight: tilt to look up a climb or down a dive (never quite vertical)
    const p = this.pitch * 0.8;
    const ap = Math.abs(p);
    out.pos.set(hp.x + fwd.x * 0.3 * (1 - ap), hp.y + 0.66 + p * 0.3, hp.z + fwd.z * 0.3 * (1 - ap));
    this.tmpObj.position.copy(out.pos);
    this.tmpObj.up.set(0, 1, 0);
    this.tmpObj.lookAt(out.pos.x + fwd.x * 8 * (1 - ap), out.pos.y - 0.66 * (1 - ap) + p * 8, out.pos.z + fwd.z * 8 * (1 - ap));
    this.tmpObj.rotateZ(this.fpRoll);
    out.quat.copy(this.tmpObj.quaternion);
    out.fov = 74 + (reduceMotion ? 0 : speedFx * 10);
  }

  // aim: horizontal heading to face; pitch: +1 climbing, -1 diving, 0 level.
  // box: { floorY, ceilY } of the sky's flight box (chase cameras stay inside it)
  update(dt, snake, { speedFx = 0, reduceMotion = false, aim = null, flying = false, pitch = 0, box = null, sky = 0 } = {}) {
    this.easeBoardSize(dt);
    this.aim = aim;
    this.box = box;
    if (flying !== this.flying) {
      // lift-off (or back to the ground): glide between the two framings
      this.flying = flying;
      if (this.mode === 'overhead') {
        this.from.pos.copy(this.camera.position);
        this.from.quat.copy(this.camera.quaternion);
        this.from.fov = this.camera.fov;
        this.blend = 0;
        this.blendDur = reduceMotion ? 0.4 : 1.4;
        this.tpYaw = null;
      }
    }
    this.pitch += ((flying ? pitch : 0) - this.pitch) * Math.min(1, dt * 5);
    const target = this.pose;
    if (this.mode === 'tour') this.computeTour(dt, reduceMotion, sky, snake, target);
    else if (this.mode === 'orbit') this.computeOrbit(dt, reduceMotion, target);
    else if (this.mode === 'showcase') this.computeShowcase(dt, snake, reduceMotion, target);
    else if (this.mode === 'fp') this.computeFP(dt, snake, speedFx, reduceMotion, target);
    else if (this.mode === 'tp') this.computeTP(dt, snake, speedFx, reduceMotion, target);
    else if (this.highChase) this.computeTP(dt, snake, speedFx, reduceMotion, target, true);
    else {
      target.pos.copy(this.overhead.pos);
      target.quat.copy(this.overhead.quat);
      target.fov = this.overhead.fov + (reduceMotion ? 0 : speedFx * 2);
    }
    // keep FP yaw tracking even when not displayed so switching in is smooth
    if (this.mode !== 'fp') this.fpYaw = null;
    if (this.mode !== 'tp' && !this.highChase) this.tpYaw = null;

    this.blend = Math.min(1, this.blend + dt / this.blendDur);
    const b = ease(this.blend);
    const cam = this.camera;
    cam.position.copy(this.from.pos).lerp(target.pos, b);
    cam.quaternion.copy(this.from.quat).slerp(target.quat, b);
    // Lift the camera through the middle of an overhead<->FP transition so it
    // sweeps over the board instead of cutting through the walls.
    if (b < 1 && this.mode !== 'orbit' && this.mode !== 'showcase' && this.mode !== 'tour') cam.position.y += Math.sin(b * Math.PI) * 2.5;

    this.kick *= Math.exp(-dt * 6);
    cam.fov = this.from.fov + (target.fov - this.from.fov) * b + (reduceMotion ? 0 : this.kick);
    if (this.cine) this.applyCinematic(dt, snake);

    // Small, quickly damped shake (never in first person).
    if (this.shake > 0.001 && !reduceMotion && (this.mode === 'overhead' || this.mode === 'tp')) {
      const k = this.mode === 'tp' ? 0.5 : 1;
      cam.position.x += (Math.random() - 0.5) * this.shake * k;
      cam.position.y += (Math.random() - 0.5) * this.shake * k * 0.5;
      cam.position.z += (Math.random() - 0.5) * this.shake * k;
    }
    this.shake *= Math.exp(-dt * 10);
    cam.updateProjectionMatrix();
  }
}
