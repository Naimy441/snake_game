import * as THREE from 'three';
import { SPACE_ZONE } from './game/SnakeGame.js';
import { CORE_Y } from './render/Space.js';

// The Galactic Core's set pieces, played while the game holds still:
//   warp    - clearing Sunset Heavens: hyperspeed, then dropping out over
//             the galaxy and gliding down to the board above the black hole.
//   finale  - every cell left is snake: what remains of the board and the
//             snake itself pour into the black hole as light, the core
//             gathers itself, then the whole galaxy erupts, and the run is won
//             (the results then unlock the ending: epilogue/EpilogueDirector.js).
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);

export class GalaxyDirector {
  constructor(app) {
    this.app = app;
    this.kind = null;
    this.t = 0;
    this.glow = 0;
    this.v = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.obj = new THREE.PerspectiveCamera();
  }

  get space() {
    return this.app.world.space;
  }

  get active() {
    return this.kind != null;
  }

  // A fresh run (or back to the menu): nothing in progress.
  clear() {
    this.kind = null;
    this.t = 0;
    this.glow = 0;
    const s = this.space;
    s.cover = 0;
    s.setWarp(0, 0);
    this.app.whiteout = 0;
    this.app.cineChroma = 0;
    this.app.cineVignette = 0;
    this.pre = null;
    this.app.snake.group.visible = true;
    this.app.endTailRip();
  }

  // ---------------------------------------------------------------- warp
  startWarp() {
    const app = this.app;
    const rm = app.settings.reduceMotion;
    this.kind = 'warp';
    this.t = 0;
    this.dropped = false;
    app.state = 'cine';
    app.timers = [];
    app.t = 0;
    app.lunge = 0;
    this.jumped = false;
    // the snake's last pose in the sky: it charges up there, then jumps
    const snap = app.preWarpSnap;
    this.pre = snap ? { ...snap, flying: true, space: false } : null;
    const s = this.space;
    s.reset();
    s.setSnakeColor(app.snake.trailColor);
    s.cover = 1;
    app.audio.stopMusic({ fade: 1 });
    app.audio.warpCharge();
    app.flash(0.2, '#ffe0f0');
    app.updateCameraUI();
    $('countdown').classList.add('hidden');
    app.rig.setDirector((dt, out) => this.warpCam(dt, out), { duration: rm ? 0.3 : 0.9 });
    this.jumpAt = this.pre ? (rm ? 0.8 : 1.7) : 0;
    this.dropAt = this.jumpAt + (rm ? 2 : 4.2);
    app.later(0.15, () => app.banner('Hyperspeed', 'Next stop: the Galactic Core'));
  }

  // Charging up in the sky, before the jump.
  get charging() {
    return this.kind === 'warp' && !this.jumped && !!this.pre;
  }

  // Behind the head, low, looking ahead. While charging the camera creeps in
  // close and the view narrows (tension); at the jump it snaps wide, then
  // widens further as the tunnel speeds up.
  warpCam(dt, out) {
    const app = this.app;
    const rm = app.settings.reduceMotion;
    const hp = app.snake.headPos;
    const hd = app.snake.headDir;
    // flat heading, even if the snake was climbing or diving when it jumped
    let fx = hd.x;
    let fz = hd.z;
    const fl = Math.hypot(fx, fz);
    if (fl < 0.3 && this.pre) {
      fx = this.pre.facing.x;
      fz = this.pre.facing.z;
    } else {
      fx /= fl || 1;
      fz /= fl || 1;
    }
    const J = this.jumpAt;
    const c = J > 0 ? clamp01(this.t / J) : 1; // charge
    const k = clamp01((this.t - J) / (this.dropAt - J)); // tunnel
    const jolt = this.jumped ? Math.exp(-(this.t - J) * 5) : 0;
    const back = this.jumped ? 3.6 + jolt * 2.5 : 4.6 - 1.2 * smooth(c);
    const shake = rm ? 0 : (this.jumped ? 0.03 + k * k * 0.08 + jolt * 0.25 : c * c * 0.06);
    const r = () => (Math.random() - 0.5) * shake;
    out.pos.set(hp.x - fx * back + r(), hp.y + 1.25 + (this.jumped ? 0 : 0.35 * (1 - c)) + r(), hp.z - fz * back + r());
    this.obj.position.copy(out.pos);
    this.obj.up.set(0, 1, 0);
    this.obj.lookAt(hp.x + fx * 12, hp.y + 0.6, hp.z + fz * 12);
    this.obj.rotateZ(Math.sin(this.t * 1.3) * 0.05 * k + (rm ? 0 : Math.sin(this.t * 31) * 0.012 * c * (1 - k)));
    out.quat.copy(this.obj.quaternion);
    out.fov = rm ? 62 : this.jumped ? 62 + 34 * smooth(k) + jolt * 26 : 62 - 12 * smooth(c);
  }

  // Dropped out: a high, wide view of the galaxy that glides down to the ring.
  revealCam(dt, out) {
    const k = ease((this.t - this.dropAt) / 3.4);
    const a0 = this.revealA;
    const a = a0 + 0.55 * (1 - k);
    const R = 120 - 100 * k;
    const H = 70 - 52 * k;
    out.pos.set(Math.cos(a) * R, H, Math.sin(a) * R);
    this.obj.position.copy(out.pos);
    this.obj.up.set(0, 1, 0);
    this.obj.lookAt(0, CORE_Y * (1 - k) - 2 * k, 0);
    out.quat.copy(this.obj.quaternion);
    out.fov = 55 - 5 * k;
  }

  updateWarp(dt) {
    const app = this.app;
    const s = this.space;
    const t = this.t;
    const D = this.dropAt;
    const J = this.jumpAt;
    const rm = app.settings.reduceMotion;
    if (t < J) {
      // charging in the sunset: stars start to stretch, the picture tightens
      const c = t / J;
      s.setWarp(0.45 * c * c, 6 + 40 * c * c);
      this.glow = 1;
      app.speedFxOverride = 0.15 + 0.5 * c;
      app.cineChroma = rm ? 0 : c * c * 0.9;
      app.cineVignette = c * 0.45;
      return;
    }
    if (!this.jumped) {
      // the jump: the sunset tears away into the tunnel
      this.jumped = true;
      app.world.setZone(SPACE_ZONE, { duration: 0.8 });
      app.flash(0.9, '#ffffff');
      app.audio.warp();
      app.cineChroma = rm ? 0 : 1.6;
      app.cineVignette = 0.2;
      if (!rm) app.rig.shake += 0.3;
    }
    if (t < D) {
      const k = clamp01((t - J) / (D - J));
      s.setWarp(Math.min(1, 0.45 + (t - J) * 3), 120 + 680 * k * k);
      this.glow = 1;
      app.speedFxOverride = 0.6 + 0.6 * k;
      app.cineChroma += ((rm ? 0 : 0.25 + k * 0.5) - app.cineChroma) * Math.min(1, dt * 3);
      return;
    }
    if (!this.dropped) {
      // drop out of hyperspeed
      this.dropped = true;
      s.setWarp(0, 0);
      s.cover = 0;
      this.glow = 0;
      app.speedFxOverride = null;
      app.cineChroma = 0;
      app.cineVignette = 0;
      app.flash(1, '#ffffff');
      app.audio.dropOut();
      app.startTailRip(); // the long body hangs off the board, then is torn away
      const hp = app.snake.headPos;
      this.revealA = Math.atan2(hp.z, hp.x);
      app.rig.setDirector((d, out) => this.revealCam(d, out), { duration: 0.05 });
      // with a tail to rip off, the title card waits until it has gone in
      const ripping = app.tailLost > 1;
      app.later(0.9, () => {
        app.audio.setMusicState({ menu: false, zone: SPACE_ZONE, level: app.game.level, intensity: 0.2 });
        app.audio.startMusic({ menu: false });
      });
      app.later(ripping ? 2.7 : 0.9, () => app.titleCard(SPACE_ZONE));
      app.later(3.0, () => app.rig.setMode(app.cameraMode, { duration: 1.4 }));
      app.later(ripping ? 5.2 : 4.2, () => this.finish(app.tailLost > 1 ? { kicker: 'Your tail is gone', title: 'Fill every cell', sub: 'The black hole is eating the board', tone: 'prism', ms: 3600 } : { kicker: 'Galactic Core', title: 'Fill every cell', sub: 'The black hole is eating the board', tone: 'prism', ms: 3400 }));
    }
  }

  // ---------------------------------------------------------------- finale
  startFinale() {
    const app = this.app;
    const rm = app.settings.reduceMotion;
    const g = app.game;
    this.kind = 'finale';
    this.t = 0;
    app.state = 'cine';
    app.audio.stopMusic({ fade: 0.08 });
    app.audio.finaleGather();
    this.space.startFinale(g);
    const E = this.space.eruptAt;
    $('countdown').classList.add('hidden');
    app.banner('100%', 'Galaxy complete');
    const cam = app.camera;
    this.fin = { a: Math.atan2(cam.position.z, cam.position.x), r: Math.hypot(cam.position.x, cam.position.z), h: cam.position.y };
    app.rig.setDirector((dt, out) => this.finaleCam(dt, out), { duration: 1.6 });
    app.flash(0.3, app.snake.trailColor || '#ffffff');
    // the snake turns to light and unravels into the black hole, tail first
    app.later(0.5, () => {
      app.flash(0.45, app.snake.trailColor || '#38f6ff');
      app.snake.group.visible = false;
      app.food.hideAll();
    });
    app.later(1.2, () => $('hud').classList.add('hidden'));
    app.later(E, () => {
      app.audio.finaleBoom();
      app.flash(1, '#ffffff');
      if (!rm) app.rig.shake += 0.7;
    });
    app.later(E + 1.5, () => app.audio.victory());
    // once the galaxy has gone off: the results (the win is counted there),
    // which offer the ending as a newly unlocked storyline
    app.later(rm ? E + 4 : E + 5.5, () => {
      const first = !app.epilogueUnlocked();
      app.showGameOver('win');
      if (first) app.announceEpilogue();
    });
  }

  // Rise and swing round to look down into the black hole as everything
  // pours in, then pull far back to watch the galaxy go off.
  finaleCam(dt, out) {
    const f = this.fin;
    const t = this.t;
    const E = this.space.eruptAt || 3.6;
    const a = f.a + t * 0.07;
    const k1 = ease(t / E);
    const k2 = ease((t - E) / 8);
    let R = f.r + (22 - f.r) * k1;
    let H = f.h + (24 - f.h) * k1;
    R += (230 - R) * k2;
    H += (120 - H) * k2;
    out.pos.set(Math.cos(a) * R, H, Math.sin(a) * R);
    this.obj.position.copy(out.pos);
    this.obj.up.set(0, 1, 0);
    this.obj.lookAt(0, -3 + (CORE_Y * 0.75 + 3) * k1, 0);
    out.quat.copy(this.obj.quaternion);
    out.fov = 52 + 6 * k2;
  }

  // ---------------------------------------------------------------- shared
  // Back to play: READY / GO, then the snake moves again.
  finish(toast) {
    const app = this.app;
    this.kind = null;
    app.rig.setMode(app.cameraMode, { duration: 0.8 });
    app.state = 'countdown';
    app.updateCameraUI();
    app.countdown = app.settings.reduceMotion ? 0.9 : 1.2;
    app.saidGo = false;
    app.showCountdown('READY');
    app.audio.countdown(false);
    app.protectUntil = app.simTime + 3;
    if (toast) app.toast(toast);
  }

  update(dt) {
    if (this.kind == null && this.whiteoutOff == null) return;
    this.t += dt;
    if (this.kind === 'warp') this.updateWarp(dt);
    const app = this.app;
    if (this.whiteoutAt != null) {
      const w = clamp01((this.t - this.whiteoutAt) / 1.2);
      const off = this.whiteoutOff != null ? clamp01((this.t - this.whiteoutOff) / 1.6) : 0;
      app.whiteout = w * (1 - off);
      if (off >= 1) {
        this.whiteoutAt = null;
        this.whiteoutOff = null;
        app.whiteout = 0;
      }
    }
  }
}

function $(id) {
  return document.getElementById(id);
}
