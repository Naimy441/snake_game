import * as THREE from 'three';
import { CORNER } from '../render/SnakePath.js';
import { HEAD_LEAD } from '../render/SnakeView.js';

// Snakes for the epilogue's cutscene, steered by script instead of the game.
//
// A Puppet moves only its head: along a route, at a speed, or rearing up on
// the spot. The body follows the trail the head leaves behind, a cell apart
// per segment, so it slithers round corners like the real thing. It drives
// a SnakeView through a stand-in game (cells are distances back along the
// trail), the same trick the black hole's fall uses.

// How far the drawn head sits behind the game's head cell (see SnakeView).
const DRAW_LAG = CORNER - HEAD_LEAD;

// A smooth route through points ([x, z] or [x, y, z]), by distance along it.
export class Route {
  constructor(points) {
    const pts = points.map((p) => (p.length === 2 ? new THREE.Vector3(p[0], 0, p[1]) : new THREE.Vector3(p[0], p[1], p[2])));
    this.curve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal') : new THREE.LineCurve3(pts[0], pts[1]);
    this.length = this.curve.getLength();
  }

  at(d, out = new THREE.Vector3()) {
    return this.curve.getPointAt(Math.min(1, Math.max(0, d / this.length)), out);
  }
}

// The head's trail, newest point first, with distances along it.
class Trail {
  constructor() {
    this.pts = [];
    this.cum = [];
  }

  // A straight trail behind a head at p, facing dir (flat), len cells long.
  reset(p, dir, len) {
    const d = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    this.pts = [];
    for (let i = 0; i <= len + 2; i++) this.pts.push(p.clone().addScaledVector(d, -i));
    this.recount();
  }

  recount() {
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
  }

  // The head moved to p: a new point once it's gone a little way, else just
  // nudge the newest one. Trimmed to what the body needs.
  push(p, keep) {
    const pts = this.pts;
    if (pts.length > 1 && pts[0].distanceTo(pts[1]) < 0.06) pts[0].copy(p);
    else pts.unshift(p.clone());
    this.recount();
    while (pts.length > 4 && this.cum[pts.length - 2] > keep) {
      pts.pop();
      this.cum.pop();
    }
  }

  get length() {
    return this.cum[this.cum.length - 1] || 0;
  }

  // The point d back from the head (negative d: ahead of it, straight on).
  at(d, out) {
    const pts = this.pts;
    if (d <= 0 || pts.length < 2) {
      const a = pts[0];
      const b = pts[1] || a;
      const dir = this.tmp || (this.tmp = new THREE.Vector3());
      dir.subVectors(a, b);
      const l = dir.length();
      if (l > 1e-6) dir.multiplyScalar(1 / l);
      return out.copy(a).addScaledVector(dir, -d);
    }
    const cum = this.cum;
    const last = pts.length - 1;
    if (d >= cum[last]) {
      // past the end: carry on straight
      const a = pts[last];
      const b = pts[last - 1];
      const dir = this.tmp || (this.tmp = new THREE.Vector3());
      dir.subVectors(a, b).normalize();
      return out.copy(a).addScaledVector(dir, d - cum[last]);
    }
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= d) lo = m;
      else hi = m;
    }
    const f = (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    return out.lerpVectors(pts[lo], pts[hi], f);
  }
}

export class Puppet {
  // view: a SnakeView. len: body length in cells. scale: how big it's drawn
  // (the baby is small): the view's group is scaled, so points are passed in
  // its own units.
  constructor(view, { len = 5, scale = 1 } = {}) {
    this.view = view;
    this.scale = scale;
    this.len = len;
    this.trail = new Trail();
    this.head = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.route = null;
    this.travelled = 0;
    this.face = { smile: 0, brows: 0, squint: 0, open: 0 };
    this.faceTarget = { smile: 0, brows: 0, squint: 0, open: 0 };
    this.gulpT = -1; // seconds since it swallowed something (-1: nothing)
    this.lookUp = 0; // extra head pitch, radians (positive looks up)
    this.bob = 0; // hopping on the spot (see Epilogue.bobPuppet)
    this.game = { cells: [], removedTail: null, facing: { x: 0, z: -1 }, flying: false, space: false, ticks: 0 };
    this.setLength(len);
    this.tmp = new THREE.Vector3();
    this.toWorld = (x) => {
      const p = this.trail.at((x - DRAW_LAG) * this.scale, this.tmp);
      const k = 1 / this.scale;
      return { x: p.x * k, y: p.y * k, z: p.z * k };
    };
  }

  setLength(n) {
    this.len = n;
    const cells = this.game.cells;
    while (cells.length < n + 1) cells.push({ x: cells.length, z: 0, y: 0 });
    cells.length = n + 1;
  }

  // Put the head at p (world units) facing dir, body straight out behind.
  place(p, dir) {
    this.head.copy(p);
    this.dir.set(dir.x, 0, dir.z).normalize();
    this.route = null;
    this.trail.reset(this.head, this.dir, (this.len + 2) * this.scale);
    return this;
  }

  // Slither along a route of points (starting where the head is now), at
  // speed cells per second. onDone runs once at the end.
  go(points, speed = 2.5, onDone = null) {
    const pts = [[this.head.x, this.head.y, this.head.z], ...points.map((p) => (p.length === 2 ? [p[0], 0, p[1]] : p))];
    this.route = { r: new Route(pts), d: 0, speed, onDone };
    return this;
  }

  get moving() {
    return !!this.route;
  }

  update(dt) {
    const r = this.route;
    if (r) {
      const before = r.d;
      r.d = Math.min(r.r.length, r.d + r.speed * this.scale * dt);
      const p = r.r.at(r.d, this.tmp);
      const step = p.distanceTo(this.head);
      if (step > 1e-5) this.dir.subVectors(p, this.head).normalize();
      this.head.copy(p);
      this.travelled += (r.d - before) / this.scale;
      if (r.d >= r.r.length) {
        this.route = null;
        if (r.onDone) r.onDone();
      }
    }
    this.trail.push(this.head, (this.len + 3) * this.scale);
    // expressions ease in (the jaw snaps)
    const k = Math.min(1, dt * 7);
    for (const key of ['smile', 'brows', 'squint']) this.face[key] += (this.faceTarget[key] - this.face[key]) * k;
    this.face.open += (this.faceTarget.open - this.face.open) * Math.min(1, dt * 18);
    if (this.gulpT >= 0) {
      this.gulpT += dt;
      if (this.gulpT > 1.4) this.gulpT = -1;
    }
  }

  // Draw it (call after update).
  draw(time, dt, opts = {}) {
    const v = this.view;
    const f = this.dir;
    this.game.facing = { x: f.x, z: f.z };
    // a gulp: the head swells for a moment, then a lump slides down the body
    const g = this.gulpT;
    const bulge = g >= 0 ? 0.3 + g * 4.5 : 0;
    const bulgeAmt = g >= 0 ? 0.55 * Math.min(1, g * 6) * Math.max(0, 1 - g / 1.4) : 0;
    v.update(this.game, 1, time, this.toWorld, { dt, travel: this.travelled, wiggle: opts.wiggle ?? 1, rushGlow: opts.glow || 0, deathFlash: 0, bulge, bulgeAmt });
    if (g >= 0 && g < 0.3) v.head.scale.multiplyScalar(1 + 0.22 * Math.sin((g / 0.3) * Math.PI));
    v.group.position.y = this.hop || 0;
    v.setFace(this.face);
    if (this.lookUp) v.head.rotateX(-this.lookUp);
  }

  setFace(f) {
    Object.assign(this.faceTarget, { open: 0 }, f);
  }

  gulp() {
    this.gulpT = 0;
  }
}
