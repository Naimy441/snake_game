import * as THREE from 'three';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

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
    this.tmpObj = new THREE.PerspectiveCamera(); // camera-style lookAt (-z forward)
    this.tmpV = new THREE.Vector3();
    this.tmpCam = camera.clone();
    this.fitOverhead(camera.aspect);
  }

  setMode(mode, { instant = false, reduceMotion = false } = {}) {
    if (mode !== this.mode && (mode === 'orbit' || mode === 'showcase')) this.cine = null;
    if (mode === this.mode && !instant) return;
    this.from.pos.copy(this.camera.position);
    this.from.quat.copy(this.camera.quaternion);
    this.from.fov = this.camera.fov;
    this.mode = mode;
    this.blend = instant ? 1 : 0;
    this.blendDur = reduceMotion ? 0.3 : 0.75;
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
  update(dt, snake, { speedFx = 0, reduceMotion = false, aim = null, flying = false, pitch = 0, box = null } = {}) {
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
    if (this.mode === 'orbit') this.computeOrbit(dt, reduceMotion, target);
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
    if (b < 1 && this.mode !== 'orbit' && this.mode !== 'showcase') cam.position.y += Math.sin(b * Math.PI) * 2.5;

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
