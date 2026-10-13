import * as THREE from 'three';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Computes three poses every frame (orbit for menus, classic overhead and
// first-person) and blends from a snapshot of the previous view to whichever
// one is active, so switching is seamless mid-game.
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
    this.shake = 0;
    this.kick = 0;
    this.orbitAngle = 0.6;
    this.tmpObj = new THREE.PerspectiveCamera(); // camera-style lookAt (-z forward)
    this.tmpV = new THREE.Vector3();
    this.tmpCam = camera.clone();
    this.fitOverhead(camera.aspect);
  }

  setMode(mode, { instant = false, reduceMotion = false } = {}) {
    if (mode === this.mode && !instant) return;
    this.from.pos.copy(this.camera.position);
    this.from.quat.copy(this.camera.quaternion);
    this.from.fov = this.camera.fov;
    this.mode = mode;
    this.blend = instant ? 1 : 0;
    this.blendDur = reduceMotion ? 0.3 : 0.75;
    if (mode === 'fp') this.fpYaw = null;
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

  computeOrbit(dt, reduceMotion, out) {
    this.orbitAngle += dt * (reduceMotion ? 0.03 : 0.08);
    const r = 26;
    out.pos.set(Math.sin(this.orbitAngle) * r, 13, Math.cos(this.orbitAngle) * r);
    this.tmpObj.position.copy(out.pos);
    this.tmpObj.lookAt(0, -1.5, 0);
    out.quat.copy(this.tmpObj.quaternion);
    out.fov = 50;
  }

  computeFP(dt, snake, speedFx, reduceMotion, out) {
    const targetYaw = Math.atan2(snake.headDir.x, snake.headDir.z);
    if (this.fpYaw === null) this.fpYaw = targetYaw;
    // Critically damped yaw: turns feel quick but never snap 90 degrees in a frame.
    // Substepped so it stays stable even when a frame takes a long time.
    const k = 16;
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
    out.pos.set(hp.x + fwd.x * 0.3, 0.66, hp.z + fwd.z * 0.3);
    this.tmpObj.position.copy(out.pos);
    this.tmpObj.up.set(0, 1, 0);
    this.tmpObj.lookAt(hp.x + fwd.x * 8, 0.0, hp.z + fwd.z * 8);
    this.tmpObj.rotateZ(this.fpRoll);
    out.quat.copy(this.tmpObj.quaternion);
    out.fov = 74 + (reduceMotion ? 0 : speedFx * 10);
  }

  update(dt, snake, { speedFx = 0, reduceMotion = false } = {}) {
    const target = this.pose;
    if (this.mode === 'orbit') this.computeOrbit(dt, reduceMotion, target);
    else if (this.mode === 'fp') this.computeFP(dt, snake, speedFx, reduceMotion, target);
    else {
      target.pos.copy(this.overhead.pos);
      target.quat.copy(this.overhead.quat);
      target.fov = this.overhead.fov + (reduceMotion ? 0 : speedFx * 2);
    }
    // keep FP yaw tracking even when not displayed so switching in is smooth
    if (this.mode !== 'fp') this.fpYaw = null;

    this.blend = Math.min(1, this.blend + dt / this.blendDur);
    const b = ease(this.blend);
    const cam = this.camera;
    cam.position.copy(this.from.pos).lerp(target.pos, b);
    cam.quaternion.copy(this.from.quat).slerp(target.quat, b);
    // Lift the camera through the middle of an overhead<->FP transition so it
    // sweeps over the board instead of cutting through the walls.
    if (b < 1 && this.mode !== 'orbit') cam.position.y += Math.sin(b * Math.PI) * 2.5;

    this.kick *= Math.exp(-dt * 6);
    cam.fov = this.from.fov + (target.fov - this.from.fov) * b + (reduceMotion ? 0 : this.kick);

    // Small, quickly damped shake (overhead only; never in first person).
    if (this.shake > 0.001 && !reduceMotion && this.mode === 'overhead') {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.z += (Math.random() - 0.5) * this.shake;
    }
    this.shake *= Math.exp(-dt * 10);
    cam.updateProjectionMatrix();
  }
}
