import * as THREE from 'three';
import { SnakeView } from '../render/SnakeView.js';
import { makeRingTexture } from '../render/textures.js';
import { METEOR_ZONE } from '../render/zones.js';
import { METEOR_TOTAL } from '../game/SnakeGame.js';
import { Homestead, DOOR, CRATE } from './Homestead.js';
import { Puppet } from './Puppet.js';
import { HeroMeteor, MeteorField, Fireballs, SkyStreaks, Strikes } from './Meteors.js';
import { EpilogueMusic, sfx } from './EpilogueMusic.js';
import { AppleMan } from './AppleMan.js';

// The epilogue, after the galaxy goes supernova:
//
//   Homecoming (a cutscene, ~37 s, skippable). The snake comes back to
//   Emerald Coast, where its family waits at a cozy little house in the
//   middle of the board. Hearts, smiles, everyone goes inside... and the
//   ground starts to shake. A giant meteor apple falls out of the sky and
//   the world burns. The snake's moment: heartbeat, slow motion, its family
//   peeking out of the door. It decides. It opens the crate it kept hidden,
//   the one stencilled DO NOT EAT ("This'll take the edge off."), and eats
//   the apple inside. The screen goes wild and he powers up in steps.
//
//   Meteor storm (playable, see SnakeGame.enterMeteorLevel), on Emerald
//   Coast's own board under a burning sky, home in the middle: eat every
//   meteor apple, with 3 lives and 2 minutes. When time runs out, one last
//   giant meteor finishes everything off.
//
//   World saved...? The family cheers, until one last meteor comes down
//   with three Apple Men riding it. It flattens the house, they jump off,
//   flex, grab the partner and the baby, and ride it back into the sky.
//   TO BE CONTINUED.
//
// While the cutscene runs the app is in state 'cine' and this draws the
// snake (a Puppet); the camera is a director on the CameraRig.

// The kidnapping was first staged around a house 0.38 times its size: its
// positions are scaled up by this.
const HS = 1 / 0.38;
const S = (x, y, z) => new THREE.Vector3(x * HS, y * HS, z * HS);
const EAT = 39.8; // the forbidden apple goes down
const GROW = 3.7; // the power-up, then the world shrinking under him
const BITE = 0.35; // from the bite to the apple kicking in
const CUT = EAT + BITE + GROW; // when the cutscene hands over to the storm
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Epilogue {
  constructor(app) {
    this.app = app;
    this.phase = null; // 'cine', 'fight', 'victory' or null
    this.t = 0;
    this.cues = [];
    this.built = false;
    this.obj = new THREE.PerspectiveCamera();
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.grade = { sat: 1, tint: new THREE.Color(1, 1, 1), tintAmt: 0, vig: 0, chroma: 0, lines: 0, speed: 0, exposure: 1, fade: 0, fadeColor: new THREE.Color('#ffffff'), danger: 0 };
    this.power = null;
    this.seaFrom = null;
  }

  get active() {
    return this.phase != null;
  }

  // the cutscene draws the snake itself (the game isn't running)
  get drawsSnake() {
    return this.phase === 'cine' && !this.swapped;
  }

  ensure() {
    if (this.built) return;
    this.built = true;
    const app = this.app;
    const scene = app.world.scene;
    this.home = new Homestead(app.glowTex);
    scene.add(this.home.group);
    this.hero = new HeroMeteor(app.glowTex);
    scene.add(this.hero.group);
    this.fireballs = new Fireballs(app.glowTex, 16);
    scene.add(this.fireballs.group);
    this.streaks = new SkyStreaks(app.glowTex, 9);
    scene.add(this.streaks.group);
    this.field = new MeteorField(app.glowTex, makeRingTexture());
    scene.add(this.field.group);
    // (sound is locked until the first click or key: start the music then)
    const wake = () => {
      if (!this.phase) return;
      const was = !!(app.audio.ctx && app.audio.ctx.state === 'running');
      app.audio.unlock();
      if (!was && app.audio.ctx) app.audio.startMusic({ custom: this.music });
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    this.strikes = new Strikes(app.glowTex);
    scene.add(this.strikes.group);
    this.music = new EpilogueMusic(app.audio);
    // the last meteor, and the Apple Men riding it
    this.raid = new HeroMeteor(app.glowTex);
    this.raid.group.scale.setScalar(0.22 * HS);
    scene.add(this.raid.group);
    this.riders = [0, 1, 2].map((i) => {
      const man = new AppleMan();
      man.group.scale.setScalar((i === 2 ? 0.34 : 0.3) * HS);
      man.group.visible = false;
      scene.add(man.group);
      return { man, mode: 'off' };
    });
    // the family: a partner (in another skin, with a flower) and a baby in
    // the player's own skin, wearing a bow
    const mine = app.snake.skin.id;
    const partner = mine === 'coral' ? 'emerald' : 'coral';
    this.partnerView = new SnakeView({ maxCells: 24, radial: 10, scaleMap: app.scaleMap, skin: partner, accessory: 'flower' });
    this.babyView = new SnakeView({ maxCells: 24, radial: 10, scaleMap: app.scaleMap, skin: mine, accessory: 'bow' });
    for (const v of [this.partnerView, this.babyView]) {
      v.group.visible = false;
      scene.add(v.group);
    }
    this.partner = new Puppet(this.partnerView, { len: 5 });
    this.baby = new Puppet(this.babyView, { len: 4, scale: 0.6 });
    this.babyView.group.scale.setScalar(0.6);
    this.me = new Puppet(app.snake, { len: 6 });
    this.setVisible(false);
  }

  setVisible(on) {
    this.home.group.visible = on;
    this.partnerView.group.visible = on;
    this.babyView.group.visible = on;
    this.fireballs.group.visible = on;
    this.streaks.group.visible = on;
    this.field.group.visible = on;
    this.hero.group.visible = false;
    if (this.raid) {
      this.raid.group.visible = false;
      this.raid.done = true;
      for (const r of this.riders) {
        r.man.group.visible = false;
        r.mode = 'off';
      }
    }
    this.carry = null;
  }

  // Everything back to normal (back to the menu, or into another mode).
  clear() {
    if (!this.built) return;
    const app = this.app;
    this.phase = null;
    this.cues = [];
    this.swapped = false;
    this.setVisible(false);
    this.field.clear();
    this.streaks.on = false;
    this.home.group.scale.setScalar(1);
    app.world.shrink = 1;
    app.world.seaLevel = null;
    app.world.island.frame.visible = true;
    this.partnerView.group.visible = false;
    this.babyView.group.visible = false;
    this.strikes.clear();
    this.strikes.group.scale.setScalar(1);
    this.forceSfx(false);
    app.snake.group.scale.setScalar(1);
    app.snake.group.position.set(0, 0, 0);
    app.snake.setFace({});
    this.resetGrade();
    this.caption(null);
    this.letterbox(false);
    document.getElementById('cine-skip').classList.add('hidden');
    document.getElementById('hud-meteors').classList.add('hidden');
    if (app.world.zone === METEOR_ZONE) app.world.setZone(0, { instant: true });
    const props = app.world.scenery.zones[app.world.propsOf(app.world.zone)];
    if (props) props.group.visible = true;
  }

  // Cutscenes are meant to be heard: sound effects come up to at least 80%
  // while one plays (even if they're turned down), and go back after.
  forceSfx(on) {
    const a = this.app;
    a.audio.setVolumes({ sfx: on ? Math.max(a.settings.sfx ?? 0.8, 0.8) : a.settings.sfx });
  }

  resetGrade() {
    const g = this.grade;
    g.sat = 1;
    g.tint.setRGB(1, 1, 1);
    g.tintAmt = 0;
    g.vig = g.chroma = g.lines = g.speed = g.danger = 0;
    g.exposure = 1;
    g.fade = 0;
  }

  // ------------------------------------------------------------------ start
  // full: the whole cutscene first; otherwise straight into the storm (Play
  // again after it, and ?epilogue=fight).
  start({ full = true, fromFinale = false } = {}) {
    const app = this.app;
    this.ensure();
    app.mode = 'epilogue';
    app.timers = [];
    app.galaxy.clear();
    app.exitBonusScene();
    app.world.space.reset();
    app.voidFall = null;
    app.deathOrbit = false;
    app.crash = null;
    app.lunge = 0;
    app.deathFlash = 0;
    app.t = 0;
    app.food.hideAll();
    app.board.clear();
    app.ghostView.group.visible = false;
    this.clear();
    this.setVisible(true);
    this.fromFinale = fromFinale;
    // the family keeps the player's skin up to date
    if (this.babyView.skin.id !== app.snake.skin.id) this.babyView.applySkin(app.snake.skin.id);
    app.audio.unlock();
    if (full) this.beginCine();
    else this.beginFight({ intro: true });
  }

  // ------------------------------------------------------------------ cutscene
  beginCine() {
    const app = this.app;
    const g = app.game;
    g.reset();
    g.food = null;
    app.syncFood();
    app.state = 'cine';
    this.phase = 'cine';
    this.swapped = false;
    this.t = 0;
    app.world.setZone(0, { instant: true });
    app.world.setBoardSize(g.size, { instant: true });
    app.world.island.frame.visible = true;
    this.home.reset();
    this.home.group.scale.setScalar(1);
    this.partnerView.group.visible = false;
    this.babyView.group.visible = false;
    this.strikes.clear();
    this.strikes.group.scale.setScalar(1);
    this.forceSfx(true);
    // the snake walks in from the front left; the family waits inside
    this.me.view = app.snake;
    this.me.setLength(6);
    // (already inside the walls, body lying along the yard)
    this.me.place(V(-0.7, 0, 6.6), V(1, 0, 0));
    this.me.face = { smile: 0, brows: 0, squint: 0, open: 0 };
    this.me.setFace({ smile: 0, brows: 0, squint: 0 });
    this.me.lookUp = 0;
    this.partner.scale = 1;
    this.baby.scale = 0.6;
    this.partnerView.group.scale.setScalar(1);
    this.babyView.group.scale.setScalar(0.6);
    this.partner.setLength(5);
    this.baby.setLength(4);
    this.piggyback = false;
    this.partner.place(V(-0.08, -2.6, -5), V(0, 0, 1));
    this.baby.place(V(0.2, -2.6, -5), V(0, 0, 1));
    for (const p of [this.partner, this.baby]) {
      p.setFace({ smile: 0, brows: 0, squint: 0 });
      p.lookUp = 0;
      p.bob = 0;
    }
    app.snake.group.visible = true;
    app.snake.group.scale.setScalar(1);
    app.snake.group.position.set(0, 0, 0);
    this.power = null;
    document.getElementById('hud').classList.add('hidden');
    app.showScreen(null);
    this.letterbox(true);
    document.getElementById('cine-skip').classList.remove('hidden');
    this.music.mode = 'home';
    app.audio.startMusic({ custom: this.music });
    // from the supernova's whiteout, or from black
    this.grade.fade = 1;
    this.grade.fadeColor.set(this.fromFinale ? '#ffffff' : '#000000');
    this.fadeTo(0, 2.2);
    this.shot(this.shotEstablish, { cut: true });
    this.cues = this.cineCues();
  }

  // The cutscene's beats, in seconds.
  cineCues() {
    const app = this.app;
    const rm = app.settings.reduceMotion;
    const h = this.home;
    const me = this.me;
    const cues = [
      [0.6, () => me.go([[0.2, 6.3], [0.6, 5.2], [0.2, 4.4], [0, 3.95]], 1.7)],
      [1.2, () => this.caption('Back where it all began.', 3)],
      [4.0, () => {
        h.openDoor(true);
        sfx.door(app.audio, true);
        // the family comes up out of the house to meet him
        this.partnerView.group.visible = true;
        this.partner.go([...this.cellar(-0.08), [-0.4, 0, 2.15], [-0.6, 0, 3.0]], 2.6);
      }],
      [4.4, () => this.shot(this.shotYard, { blend: 1.6 })],
      [4.4, () => {
        this.babyView.group.visible = true;
        this.baby.go([...this.cellar(0.2), [0.45, 0, 2.1], [0.55, 0, 3.05]], 4.6);
      }],
      [6.4, () => {
        // home: everyone smiles
        for (const p of [me, this.partner, this.baby]) p.setFace({ smile: 1, squint: 0.8 });
        me.lookUp = 0.18;
        this.baby.bob = 1;
        h.burstHearts(me.head, 5);
        h.burstHearts(this.partner.head, 4);
        h.burstHearts(this.baby.head, 4);
        sfx.happy(app.audio);
        this.shot(this.shotReunion, { cut: true });
      }],
      [7.6, () => h.burstHearts(V(0, 0.2, 3.4), 6)],
      // in they go, one at a time, each turning round in a loop so nobody
      // crosses anyone (and the door waits for the last tail)
      [8.9, () => {
        this.baby.bob = 0;
        me.lookUp = 0;
        this.shot(this.shotHouse, { cut: true });
        // (round in front of the open door, never through it)
        this.partner.go([[-1.2, 0, 3.35], [-1.65, 0, 2.95], [-1.1, 0, 2.62], [-0.4, 0, 2.55], [-0.08, 0, 2.0], ...this.inside(-0.08)], 2.6);
      }],
      [9.6, () => this.caption('Finally... home.', 2.6)],
      [11.6, () => this.baby.go([[1.0, 0, 3.5], [1.4, 0, 2.9], [1.15, 0, 2.1], [0.5, 0, 1.75], ...this.inside(0.15)], 4.3)],
      [13.6, () => me.go([[0, 0, 2.6], ...this.inside(0)], 3)],
      [16.7, () => {
        h.openDoor(false);
        sfx.door(app.audio, false);
      }],
      [16.8, () => app.audio.stopMusic({ fade: 1.2 })],
      [17.4, () => {
        // ... the ground starts to shake
        sfx.rumble(app.audio, 3.6);
        this.shot(this.shotRumble, { cut: true });
        this.rumble = { t: 0 };
        for (const p of [this.partner, this.baby]) p.setFace({ smile: 0, brows: -0.8 });
      }],
      [18.2, () => {
        this.music.setMode('doom');
        app.audio.startMusic({ custom: this.music });
      }],
      [19.6, () => {
        h.openDoor(true);
        sfx.slam(app.audio);
        if (!rm) app.rig.shake += 0.3;
        me.setFace({ smile: 0, squint: 0, brows: -0.6 });
        me.place(V(0, -2.6, -5), V(0, 0, 1));
        // up from the cellar, out, round to the right and well clear of the
        // doorway, facing back
        me.go([...this.cellar(0), [0.2, 0, 2.2], [1.2, 0, 3.4], [2.2, 0, 4.4], [3.0, 0, 5.4], [2.6, 0, 6.2], [2.0, 0, 5.6]], 4.8);
        this.shot(this.shotBurst, { cut: true });
      }],
      [21.0, () => {
        me.lookUp = 0.55;
        this.shot(this.shotLookUp, { cut: true });
        this.hero.launch(V(70, 170, -300), V(-11, 0, -27), 4.0);
        sfx.incoming(app.audio, 4.0);
      }],
      [25.0, () => this.impact()],
      [25.15, () => this.shot(this.shotBlast, { cut: true })],
      [27.2, () => {
        // ... and more keep coming, right into the yard
        this.shot(this.shotStrikes, { cut: true });
        this.caption('Meteor apples on fire, huh?', 2.4);
      }],
      [27.4, () => this.strike(V(-3.6, 0, 1.6))],
      [28.0, () => this.strike(V(3.9, 0, -0.8))],
      [28.5, () => this.strike(V(-2.6, 0, 6.0))],
      [29.6, () => {
        // the moment
        this.moment = { t: 0 };
        this.shot(this.shotFace, { cut: true });
        me.lookUp = 0.1;
        me.setFace({ smile: 0, squint: 0.15, brows: -1 });
        this.caption('The world was ending...', 2.2);
      }],
      [29.7, () => sfx.heartbeat(app.audio, 0.7)],
      [30.6, () => sfx.heartbeat(app.audio, 0.85)],
      [30.8, () => {
        // the family peeks out of the door
        // (one doorway, two snakes: the baby rides on the partner's back)
        this.partner.place(V(0, -2.6, -5), V(0, 0, 1));
        this.baby.place(V(0, -2.25, -5), V(0, 0, 1));
        this.partner.go([...this.cellar(0), [0, 0, 1.6]], 3.4);
        this.baby.route = null;
        this.piggyback = true;
        this.partner.setFace({ brows: -1, squint: 0 });
        this.baby.setFace({ brows: -1, squint: 0 });
      }],
      [31.5, () => {
        sfx.heartbeat(app.audio, 1);
        this.shot(this.shotFamily, { cut: true });
        this.caption('...and his family was inside.', 2.4);
      }],
      [32.3, () => this.strike(V(-2.3, 0, 2.9))],
      [32.4, () => sfx.heartbeat(app.audio, 1.1)],
      [33.7, () => {
        sfx.heartbeat(app.audio, 1.2);
        this.shot(this.shotDecide, { cut: true });
      }],
      [34.3, () => {
        me.setFace({ smile: 0, squint: 0.35, brows: 1 });
        sfx.resolve(app.audio);
        this.caption('He knew what he had to do.', 2.2);
        if (!rm) app.rig.kick -= 5;
      }],
      [35.9, () => {
        // (the family has ducked back inside and shut the door)
        this.partnerView.group.visible = false;
        this.babyView.group.visible = false;
        this.piggyback = false;
        h.doorOpen = h.doorTarget = 0;
        me.lookUp = 0;
        this.shot(this.shotCrate, { blend: 0.9 });
        // round to the front of the crate, facing it
        const f = this.crateFront();
        me.go([[f.x - f.dx * 0.6, f.z - f.dz * 0.6], [f.x, f.z]], 1.6);
      }],
      [37.6, () => {
        h.popLid();
        sfx.forbidden(app.audio);
        app.flash(0.35, '#d8a0ff');
      }],
      [38.0, () => this.shot(this.shotApple, { blend: 0.8 })],
      [38.5, () => this.caption("This'll take the edge off.", 2.0)],
      [EAT - 0.9, () => {
        // the apple drifts down out of the crate towards him, at mouth height
        const f = this.crateFront();
        this.biteAt = V(CRATE.x + f.fx * 0.72, 0.48, CRATE.z + f.fz * 0.72);
        this.biteDir = V(f.dx, 0, f.dz);
        h.offerApple(this.biteAt);
        me.lookUp = 0;
      }],
      [EAT - 0.5, () => {
        // jaws wide open (side on, so they read)
        me.setFace({ open: 1, brows: 1, squint: 0.2 });
        this.shot(this.shotBite, { cut: true });
      }],
      [EAT - 0.22, () => {
        // ... and he lunges, level, right up to it
        const b = this.biteAt;
        const d = this.biteDir;
        me.go([[b.x - d.x * 0.5, 0.1, b.z - d.z * 0.5]], 3.6);
      }],
      [EAT, () => {
        // CHOMP: it's sucked in, the jaws snap shut, and down it goes
        const v = me.view;
        h.eatApple(() => (this.tmpMouth || (this.tmpMouth = new THREE.Vector3())).copy(v.head.position).addScaledVector(v.headDir, 0.38));
        sfx.gulp(app.audio);
        if (!rm) app.rig.kick += 4;
        app.effects.emit(h.apple.position.x, h.apple.position.y, h.apple.position.z, { count: 26, color: '#e0a0ff', speed: 2.5, up: 1.5, size: 0.16, life: 0.5 });
      }],
      [EAT + 0.12, () => {
        me.setFace({ smile: 0.6, squint: 0.3, brows: 1 });
        me.gulp();
      }],
      [EAT + BITE, () => {
        app.flash(0.5, '#ffffff');
        this.shot(this.shotGrow, { cut: true });
        this.startPower();
      }],
      [CUT, () => this.swapToStorm()],
    ];
    return cues.sort((a, b) => a[0] - b[0]);
  }

  // From the yard in through the door, then down under the floor (a
  // cellar: the whole body slides out of sight, however long it is).
  // In through the door and down the cellar stairs (a gentle slope under
  // the floor, so the whole body slides out of sight without twisting).
  inside(x) {
    return [[x, 0, 1.3], [x, -0.15, 0.75], [x, -0.9, -0.1], [x, -2.3, -1.4], [x, -3.4, -6]];
  }

  // Up the cellar stairs and out of the door (from a place under the house).
  cellar(x) {
    return [[x, -1.7, -1.4], [x, -0.6, 0.1], [x, 0, 0.9], [x, 0, 1.3]];
  }

  // A big meteor apple crashes into the yard (cutscene).
  strike(to) {
    const app = this.app;
    sfx.whistle(app.audio, 0);
    this.strikes.drop(to, 0.85, (p) => {
      sfx.land(app.audio, THREE.MathUtils.clamp(p.x / 6, -0.8, 0.8));
      sfx.impact(app.audio);
      app.flash(0.35, '#ffd0a0');
      if (!app.settings.reduceMotion) app.rig.shake += 0.45;
      this.home.shake(0.6);
      app.effects.emit(p.x, 0.5, p.z, { count: 70, color: '#ff7a2a', speed: 5, up: 5, size: 0.35, life: 1 });
      app.effects.emit(p.x, 0.3, p.z, { count: 30, color: '#4a3020', speed: 3, up: 4, size: 0.5, life: 1.4 });
      app.effects.shockwave(p.x, p.z, '#ffb060', { max: 5, dur: 0.6 });
      this.fireballs.spawn(V(p.x, 1.2, p.z), { size: 5, dur: 1.2, color: '#ff9a3a', solid: true, vel: V(0, 1, 0) });
      this.fireballs.spawn(V(p.x, 2.2, p.z), { size: 4, dur: 2.2, color: '#3a2420', solid: true, vel: V(0, 1.5, 0), delay: 0.2 });
      for (const q of [this.partner, this.baby]) q.setFace({ smile: 0, brows: -1, squint: 0.5 });
    });
  }

  // where the snake stands to face the crate's front
  crateFront() {
    const ry = this.home.crate.rotation.y;
    const fx = Math.sin(ry);
    const fz = Math.cos(ry);
    return { x: CRATE.x + fx * 1.7, z: CRATE.z + fz * 1.7, dx: -fx, dz: -fz, fx, fz };
  }

  impact() {
    const app = this.app;
    const rm = app.settings.reduceMotion;
    const p = this.hero.to;
    sfx.impact(app.audio);
    app.flash(1, '#fff2d8');
    if (!rm) app.rig.shake += 1.4;
    this.home.shake(1.2);
    // the fireball: layers of glow swelling and rising
    const up = V(0, 4, 0);
    const F = (o, size, dur, color, delay = 0, solid = true, v = up) => this.fireballs.spawn(p.clone().add(o), { size, dur, color, vel: v, delay, solid });
    F(V(0, 2, 0), 70, 1.4, '#fff4d0', 0, false, null);
    F(V(0, 5, 0), 30, 3.2, '#ffb030', 0.05);
    F(V(3, 9, 1), 26, 3.8, '#ff6a14', 0.15);
    F(V(-3, 12, 0), 24, 4.2, '#ff4a10', 0.3);
    F(V(0, 17, 0), 28, 5.0, '#c03008', 0.5, true, up.clone().multiplyScalar(1.4));
    F(V(2, 24, -1), 32, 6.0, '#3a2420', 0.9, true, up.clone().multiplyScalar(1.6));
    F(V(-3, 28, 1), 30, 6.5, '#2a1a18', 1.2, true, up.clone().multiplyScalar(1.6));
    app.effects.shockwave(p.x, p.z, '#ffb060', { max: 70, dur: 1.8, y: p.y + 0.5 });
    // rocks and burning debris thrown everywhere
    for (let i = 0; i < 4; i++) app.effects.emit(p.x, p.y + 2, p.z, { count: 60, color: i % 2 ? '#ff7a2a' : '#4a2a1a', speed: 14, up: 12, size: 0.9, life: 2.2, gravity: 9 });
    // the world burns: the sky turns red and smoky as the wave sweeps out
    app.world.setZone(METEOR_ZONE, { duration: 2.6 });
    this.craterAt = p.clone();
    this.streaks.on = true;
    this.home.lights = 0.55;
  }

  // ------------------------------------------------------------------ power-up
  startPower() {
    const rm = this.app.settings.reduceMotion;
    const h = this.me.head;
    this.power = { t: 0, step: -1, pivot: V(h.x, 0, h.z), scale: 1, from: 1, to: 1, k: 1, reduce: rm };
  }

  // The forbidden apple kicks in: he grows, shrinks back a bit, grows more,
  // in steps, each with a chord, a flash and a colour, the screen going
  // wild; then a roar, and he settles back to his own size, fired up.
  updatePower(dt) {
    const P = this.power;
    if (!P) return;
    const app = this.app;
    P.t += dt;
    const STEPS = [1.3, 1.05, 1.5, 1.2, 1.7, 1.4, 1.8];
    const at = (i) => 0.1 + i * 0.14;
    while (P.step + 1 < STEPS.length && P.t >= at(P.step + 1)) {
      P.step++;
      P.from = P.scale;
      P.to = STEPS[P.step];
      P.k = 0;
      sfx.powerStep(app.audio, P.step);
      const hue = (P.step / STEPS.length + 0.05) % 1;
      app.flash(P.reduce ? 0.2 : 0.5, new THREE.Color().setHSL(hue, 1, 0.65).getStyle());
      if (!P.reduce) {
        app.rig.kick += P.step % 2 ? -6 : 8;
        app.rig.shake += 0.12;
      }
      const hp = app.snake.headPos;
      app.effects.emit(hp.x, hp.y + 0.4, hp.z, { count: 30, color: new THREE.Color().setHSL(hue, 1, 0.6).getStyle(), speed: 4, up: 3, size: 0.3, life: 0.7 });
    }
    P.k = Math.min(1, P.k + dt / 0.06);
    let k = P.from + (P.to - P.from) * P.k;
    const G0 = 1.05;
    if (P.t > G0 && !P.roared) {
      P.roared = true;
      sfx.roar(app.audio);
      app.flash(0.6, '#ffffff');
      if (!P.reduce) app.rig.shake += 0.6;
    }
    // after the roar he eases back down to his own size, with a bounce
    if (P.t > G0) {
      const g = clamp01((P.t - G0) / 1.2);
      k = 1 + 0.8 * Math.exp(-g * 4) * Math.cos(g * 9);
    }
    P.scale = k;
    if (P.t > GROW - 0.3 && !P.faded) {
      P.faded = true;
      this.fadeTo(1, 0.25, '#ffffff');
    }
    // he grows about the spot under his head (so he stays on the ground)
    const sg = app.snake.group;
    sg.scale.setScalar(k);
    sg.position.copy(P.pivot).multiplyScalar(1 - k);
  }

  // Behind the whiteout: on the board, the first meteors have already landed.
  swapToStorm() {
    const app = this.app;
    this.power = null;
    this.strikes.clear();
    app.snake.group.scale.setScalar(1);
    app.snake.group.position.set(0, 0, 0);
    this.beginFight({ intro: true, fromCine: true });
  }

  // ------------------------------------------------------------------ the storm
  beginFight({ intro = true, fromCine = false } = {}) {
    const app = this.app;
    const rm = app.settings.reduceMotion;
    const g = app.game;
    this.phase = 'cine';
    this.swapped = true;
    this.t = CUT;
    this.cues = [];
    app.state = 'cine';
    app.timers = [];
    g.enterMeteorLevel();
    app.syncFood();
    app.world.setZone(METEOR_ZONE, { instant: true });
    app.world.shrink = 1;
    app.world.seaLevel = null;
    app.world.setBoardSize(g.size, { instant: true });
    app.world.island.frame.visible = true;
    this.strikes.clear();
    this.forceSfx(true);
    this.home.reset();
    this.home.lights = 0.6;
    this.home.openDoor(true);
    this.home.crate.visible = false;
    this.home.group.scale.setScalar(1);
    app.world.scenery.zones[0].group.visible = true;
    this.streaks.on = true;
    this.field.clear();
    // the family peeks out of the doorway (the baby on the partner's back),
    // cheering him on
    this.partner.scale = 1;
    this.baby.scale = 0.6;
    this.partnerView.group.scale.setScalar(1);
    this.babyView.group.scale.setScalar(0.6);
    this.partner.setLength(5);
    this.baby.setLength(3);
    this.partnerView.group.visible = true;
    this.babyView.group.visible = true;
    this.partner.place(V(0, -2.6, -5), V(0, 0, 1));
    this.baby.place(V(0, -2.25, -5), V(0, 0, 1));
    this.partner.go([...this.cellar(0)], 30);
    this.piggyback = true;
    this.partner.setFace({ smile: 0, brows: -1, squint: 0 });
    this.baby.setFace({ smile: 0, brows: -1, squint: 0 });
    // he means business
    app.snake.setFace({ brows: 1, squint: 0.2 });
    app.snake.group.visible = true;
    this.resetGrade();
    this.grade.fade = rm ? 0.6 : 1;
    this.grade.fadeColor.set('#ffffff');
    this.fadeTo(0, 0.7);
    this.caption(null);
    this.letterbox(true);
    // (Enter skips the intro, every time)
    document.getElementById('cine-skip').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    app.showScreen(null);
    this.music.mode = 'battle';
    app.audio.startMusic({ custom: this.music });
    app.run = { t: 0, running: false, done: false, full: false, record: false };
    this.shot(this.shotColossal, { cut: true });
    const T = (s) => CUT + s;
    this.cues = [
      [T(0.25), () => {
        app.banner('METEOR STORM', `Eat all ${METEOR_TOTAL} before time runs out`);
      }],
      [T(intro ? 3.0 : 1.2), () => this.handToPlayer()],
    ];
  }

  handToPlayer() {
    const app = this.app;
    this.phase = 'fight';
    this.letterbox(false);
    this.forceSfx(false);
    document.getElementById('cine-skip').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('hud-meteors').classList.remove('hidden');
    app.rig.setMode(app.cameraMode, { reduceMotion: app.settings.reduceMotion, duration: 1.2 });
    app.state = 'countdown';
    app.updateCameraUI();
    app.protectUntil = app.simTime + 4;
    app.countdown = app.settings.reduceMotion ? 1.0 : 1.4;
    app.saidGo = false;
    app.showCountdown('READY');
    app.audio.countdown(false);
    if (app.relativeSteer) app.flashHint();
    app.toast({ kicker: 'Meteor storm', title: 'Save the world', sub: `${METEOR_TOTAL} meteors, 3 lives, 2 minutes. Don't crush your home!`, tone: 'danger', ms: 3800 });
  }

  // ------------------------------------------------------------------ fight events
  // handleStep: meteors landing, waves, ones shattering on the snake.
  onStep(ev) {
    const app = this.app;
    const at = (c) => app.toWorld(c.x, c.z);
    if (ev.meteorWave) {
      const w = ev.meteorWave;
      if (w.n === 1) app.toast({ kicker: 'Look up!', title: 'Here they come', sub: 'Red rings show where they land', tone: 'danger' });
      else app.toast({ kicker: `Wave ${w.n + 1}`, title: `${w.meteors.length} more incoming!`, tone: 'danger' });
      w.meteors.forEach((m, i) => setTimeout(() => sfx.whistle(app.audio, THREE.MathUtils.clamp(at(m).x / 12, -0.8, 0.8)), 300 + i * 120));
    }
    if (ev.meteorsLanded) {
      for (const m of ev.meteorsLanded) {
        const w = at(m);
        this.landFx(w.x, w.z, 1);
        sfx.land(app.audio, THREE.MathUtils.clamp(w.x / 12, -0.8, 0.8));
      }
      if (!app.settings.reduceMotion) app.rig.shake += 0.05 * Math.min(3, ev.meteorsLanded.length);
      for (const p of [this.partner, this.baby]) p.setFace({ smile: 0, brows: -1 });
    }
    if (ev.meteorsSmashed) {
      for (const m of ev.meteorsSmashed) {
        const w = at(m);
        this.landFx(w.x, w.z, 0.6);
        app.effects.emit(w.x, 0.8, w.z, { count: 40, color: '#ffe0a0', speed: 5, up: 3, size: 0.22, life: 0.6 });
        app.popup(V(w.x, 0.6, w.z), 'Clang!', 'bonk', '-1 ♥');
        sfx.clang(app.audio);
        app.flash(0.35, '#ff5a5a');
        if (!app.settings.reduceMotion) app.rig.shake += 0.3;
        if (m.lives === 1) app.toast({ kicker: 'Watch your head', title: 'Last life!', tone: 'danger' });
      }
      this.updateCounter(true);
    }
  }

  landFx(x, z, k) {
    const app = this.app;
    app.effects.emit(x, 0.4, z, { count: Math.round(50 * k), color: '#ff7a2a', speed: 4 * k, up: 4, size: 0.3, life: 0.8 });
    app.effects.emit(x, 0.4, z, { count: Math.round(20 * k), color: '#ffe08a', speed: 2.5, up: 5, size: 0.2, life: 0.6 });
    app.effects.emit(x, 0.2, z, { count: Math.round(14 * k), color: '#3a2a2a', speed: 1.5, up: 2.5, size: 0.4, life: 1.2, gravity: -0.5 });
    app.effects.shockwave(x, z, '#ff7a2a', { max: 3 * k, dur: 0.5 });
    this.fireballs.spawn(V(x, 0.6, z), { size: 3.2 * k, dur: 0.7, color: '#ff9a3a' });
  }

  onEat(ate) {
    const app = this.app;
    const rm = app.settings.reduceMotion;
    const w = app.toWorld(ate.x, ate.z);
    const pos = V(w.x, w.y, w.z);
    const n = METEOR_TOTAL - ate.left;
    app.later(app.visualDelay(), () => {
      app.effects.emit(w.x, 0.5, w.z, { count: 50, color: '#ff8a2a', speed: 4, up: 3, size: 0.3 });
      app.effects.emit(w.x, 0.5, w.z, { count: 20, color: '#fff2b0', speed: 2, up: 4, size: 0.18, life: 0.5 });
      app.effects.shockwave(w.x, w.z, '#ffb060', { max: 3, dur: 0.45 });
      app.popup(pos, `+${ate.points}`, 'gold', ate.combo > 1 ? `×${ate.combo}` : '');
      const v = pos.clone().project(app.camera);
      sfx.crunch(app.audio, n, THREE.MathUtils.clamp(v.x, -0.8, 0.8));
      if (!rm) app.rig.kick += 3;
      if (app.cameraMode !== 'fp') app.rig.shake += 0.05;
      // the family cheers
      this.cheer = 1.2;
      for (const p of [this.partner, this.baby]) p.setFace({ smile: 1, squint: 0.7, brows: 0 });
      if (ate.left === 5) app.banner('5 left!', 'Almost there');
      else if (ate.left > 0 && n % 10 === 0) app.banner(`${n} eaten!`, `${ate.left} to go`);
      this.updateCounter(true);
    });
  }

  // The storm's clock and lives, top centre.
  updateCounter(bump = false) {
    const g = this.app.game;
    const s = Math.ceil(g.timeLeft / 1000);
    const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const lives = '♥'.repeat(g.lives) + '♡'.repeat(Math.max(0, 3 - g.lives));
    const t = document.getElementById('hud-meteors-time');
    const l = document.getElementById('hud-meteors-lives');
    if (t.textContent !== time) t.textContent = time;
    if (l.textContent !== lives) l.textContent = lives;
    document.getElementById('hud-meteors').classList.toggle('urgent', s <= 20);
    if (bump) {
      const b = document.getElementById('hud-meteors');
      b.classList.remove('bump');
      void b.offsetWidth;
      b.classList.add('bump');
    }
  }

  // The nearest burning meteor to the head (for the compass).
  nearestMeteor() {
    const g = this.app.game;
    let best = null;
    let bd = Infinity;
    for (const m of g.meteors) {
      if (!m.landed) continue;
      const d = Math.abs(m.x - g.head.x) + Math.abs(m.z - g.head.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ victory
  victory() {
    const app = this.app;
    const rm = app.settings.reduceMotion;
    this.phase = 'victory';
    app.state = 'cine';
    app.stopTimer(true);
    this.forceSfx(true);
    this.t = 0;
    this.field.clear();
    this.streaks.on = false;
    sfx.saved(app.audio);
    app.flash(1, '#ffffff');
    if (!rm) app.rig.shake += 0.5;
    app.banner('WORLD SAVED!', 'Every last meteor');
    document.getElementById('toast').classList.remove('show');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('hud-meteors').classList.add('hidden');
    this.letterbox(true);
    this.music.setMode('victory');
    app.snake.setFace({ smile: 1, squint: 0.8 });
    for (const p of [this.partner, this.baby]) p.setFace({ smile: 1, squint: 0.8, brows: 0 });
    this.cheer = 2.4;
    const hp = app.snake.headPos.clone();
    this.vic = { a: Math.atan2(app.camera.position.x - hp.x, app.camera.position.z - hp.z), center: V(hp.x * 0.5, 0, hp.z * 0.5) };
    this.shot(this.shotVictory, { blend: 1.2 });
    const R = this.riders;
    const land = S(0, 0.5, 0); // the last meteor comes down right on the house
    // where they jump to: behind the partner, behind the baby, and the boss out front
    const spots = [S(-0.62, 0, 0.3), S(0.62, 0, 0.35), S(0, 0, 0.95)];
    this.cues = [
      [1.2, () => this.home.burstHearts(V(0, 0.2, 0.5), 6)],
      [2.6, () => {
        // ... wait
        this.music.setMode('off');
        sfx.scratch(app.audio);
        this.caption('...wait. What is that?', 2.2);
        for (const p of [this.partner, this.baby]) p.setFace({ smile: 0, brows: -1, squint: 0 });
        app.snake.setFace({ smile: 0, brows: -0.8 });
        this.cheer = 0;
      }],
      [3.0, () => {
        this.raid.launch(V(16, 42, -22), land, 3.2);
        sfx.incoming(app.audio, 3.2);
        for (const r of R) {
          r.man.group.visible = true;
          r.mode = 'ride';
          r.man.setPose('flex');
        }
        this.shot(this.shotRaidSky, { cut: true });
        this.music.setMode('doom');
      }],
      [4.4, () => this.shot(this.shotRaidRiders, { cut: true })],
      [5.5, () => this.shot(this.shotHomeWide, { cut: true })],
      [6.2, () => {
        // it flattens the house
        sfx.impact(app.audio);
        app.flash(0.9, '#fff0d0');
        if (!rm) app.rig.shake += 0.9;
        this.home.explode();
        this.raid.done = true;
        this.raid.group.visible = true;
        this.raid.group.position.copy(land);
        const F = (o, size, dur, color, delay = 0) => this.fireballs.spawn(land.clone().add(o), { size, dur, color, vel: V(0, 0.8, 0), delay, solid: true });
        this.fireballs.spawn(land.clone().add(S(0, 0.4, 0)), { size: 7 * HS, dur: 0.8, color: '#fff2c0' });
        F(S(0, 0.8, 0), 2.6 * HS, 1.8, '#ff8a2a');
        F(S(0.5, 1.4, 0), 2.2 * HS, 2.4, '#ff4a12', 0.15);
        F(S(-0.4, 2.0, 0), 2.6 * HS, 3.2, '#3a2420', 0.4);
        app.effects.shockwave(0, 0, '#ffb060', { max: 6 * HS, dur: 0.8 });
        app.effects.emit(0, 0.6, 0, { count: 80, color: '#ff8a2a', speed: 5, up: 4, size: 0.3, life: 1 });
        // the family is thrown clear
        this.partner.setLength(3);
        this.baby.setLength(3);
        this.piggyback = false;
        this.partner.place(S(-0.62, 0, 0.75), V(-0.3, 0, 1));
        this.baby.place(S(0.62, 0, 0.8), V(0.3, 0, 1));
      }],
      [7.0, () => {
        // the Apple Men jump off
        R.forEach((r, i) => this.jump(r, spots[i], 0.75, i * 0.12));
      }],
      [7.9, () => {
        sfx.thud(app.audio);
        R.forEach((r) => r.man.setPose('flex'));
        sfx.laugh(app.audio, 1);
        this.shot(this.shotFlex, { cut: true });
        this.caption('The Apple Men.', 2.2);
      }],
      [9.3, () => sfx.laugh(app.audio, 0.85)],
      [9.8, () => {
        // they grab the partner and the baby and hold them overhead
        R[0].man.setPose('carry');
        R[1].man.setPose('carry');
        R[2].man.setPose('laugh');
        this.carry = [[this.partner, R[0].man], [this.baby, R[1].man]];
        for (const p of [this.partner, this.baby]) {
          p.route = null;
          p.bob = 0;
          p.setFace({ brows: -1, smile: 0, squint: 0 });
        }
        this.shot(this.shotGrab, { cut: true });
        sfx.happy(app.audio); // (a mocking little sparkle)
      }],
      [11.2, () => {
        this.shot(this.shotSnakeFace, { cut: true });
        app.snake.setFace({ smile: 0, brows: -1, squint: 0 });
        sfx.heartbeat(app.audio, 1);
      }],
      [12.0, () => {
        app.snake.setFace({ smile: 0, brows: 1, squint: 0.35 });
        sfx.heartbeat(app.audio, 1.2);
        if (!rm) app.rig.kick -= 6;
      }],
      [12.6, () => {
        // back onto the meteor
        R.forEach((r, i) => this.jump(r, null, 0.6, i * 0.1));
        this.shot(this.shotTakeoff, { cut: true });
      }],
      [13.4, () => {
        this.raid.launch(this.raid.group.position.clone(), V(-34, 70, -90), 3.2);
        sfx.incoming(app.audio, 2);
        sfx.laugh(app.audio, 1.1);
        R.forEach((r) => (r.mode = 'ride'));
      }],
      [16.0, () => this.caption('They took his family.', 2.8)],
      [16.4, () => {
        R.forEach((r) => (r.man.group.visible = false));
        this.carry = null;
        for (const p of [this.partner, this.baby]) p.view.group.visible = false;
        this.shot(this.shotSnakeFace, { blend: 1.2 });
      }],
      [18.6, () => {
        this.caption('TO BE CONTINUED...', 3.6, true);
        this.music.setMode('home');
      }],
      [22.4, () => {
        this.letterbox(false);
        this.caption(null);
        this.forceSfx(false);
        app.showGameOver('win');
      }],
    ];
  }

  // An Apple Man leaps from where it is to `to` (on the ground), or, with no
  // `to`, back up onto the last meteor.
  jump(r, to, dur, delay = 0) {
    const from = r.man.group.position.clone();
    r.mode = 'jump';
    r.jump = { from, to: to ? to.clone() : null, t: -delay, dur };
    r.man.setPose('jump');
  }

  // Where each rider stands on top of the last meteor.
  rideSpot(i, out) {
    const m = this.raid.group.position;
    const o = [[-0.3, 0, -0.05], [0.32, 0, 0.05], [0, 0, 0.32]][i];
    return out.set(m.x + o[0] * HS, m.y + 0.62 * HS, m.z + o[2] * HS);
  }

  updateRaid(dt, time) {
    if (!this.raid) return;
    const raid = this.raid;
    raid.update(dt, time);
    if (raid.group.visible && !raid.done && Math.random() < 0.8) {
      const p = raid.group.position;
      this.app.effects.emit(p.x, p.y + 0.3, p.z, { count: 2, color: Math.random() < 0.5 ? '#ffb040' : '#ff5a1a', speed: 0.8, up: 0.6, size: 0.6, life: 0.6, gravity: 0, spread: 0.5 });
    }
    const tmp = this.tmpRide || (this.tmpRide = new THREE.Vector3());
    this.riders.forEach((r, i) => {
      const g = r.man.group;
      if (r.mode === 'ride') {
        this.rideSpot(i, g.position);
        g.rotation.y = i === 2 ? 0 : (i ? -0.5 : 0.5);
      } else if (r.mode === 'jump') {
        const J = r.jump;
        J.t += dt;
        const k = clamp01(J.t / J.dur);
        const to = J.to || this.rideSpot(i, tmp);
        g.position.lerpVectors(J.from, to, smooth(k));
        g.position.y += Math.sin(k * Math.PI) * 0.9 * HS;
        if (k >= 1) {
          r.mode = J.to ? 'ground' : 'ride';
          r.man.setPose(J.to ? 'flex' : 'carry');
          if (!J.to && i === 2) r.man.setPose('flex');
        }
      }
      if (g.visible) r.man.update(dt);
    });
    // the partner and the baby, held up overhead, wriggling
    if (this.carry) {
      for (const [p, man] of this.carry) {
        man.overheadWorld(p.head);
        p.head.y += 0.1;
        p.head.x += Math.sin(time * 9 + man.t) * 0.08;
      }
    }
  }

  // Time's up: one last giant meteor comes down on the house and takes
  // everything with it.
  doom() {
    const app = this.app;
    const rm = app.settings.reduceMotion;
    this.phase = 'doom';
    app.state = 'cine';
    app.stopTimer(false);
    this.forceSfx(true);
    this.t = 0;
    this.music.setMode('doom');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('hud-meteors').classList.add('hidden');
    document.getElementById('toast').classList.remove('show');
    this.letterbox(true);
    this.caption("Time's up!", 2.2);
    for (const p of [this.partner, this.baby]) p.setFace({ smile: 0, brows: -1, squint: 0 });
    app.snake.setFace({ smile: 0, brows: -1, squint: 0 });
    this.hero.launch(V(80, 190, -260), V(0, 0.5, 0), 2.8);
    sfx.incoming(app.audio, 2.8);
    this.shot(this.shotDoom, { blend: 1.0 });
    this.cues = [
      [2.8, () => {
        sfx.impact(app.audio);
        app.flash(1, '#fff2d8');
        if (!rm) app.rig.shake += 1.6;
        this.home.explode();
        this.field.clear();
        this.partnerView.group.visible = false;
        this.babyView.group.visible = false;
        const up = V(0, 4, 0);
        const F = (o, size, dur, color, delay = 0) => this.fireballs.spawn(o, { size, dur, color, vel: up, delay, solid: true });
        this.fireballs.spawn(V(0, 2, 0), { size: 60, dur: 1.4, color: '#fff4d0' });
        F(V(0, 4, 0), 28, 3, '#ffb030', 0.05);
        F(V(3, 8, 1), 24, 3.6, '#ff6a14', 0.2);
        F(V(-3, 11, 0), 22, 4, '#ff4a10', 0.35);
        F(V(0, 16, 0), 26, 5, '#3a2420', 0.7);
        app.effects.shockwave(0, 0, '#ffb060', { max: 40, dur: 1.4 });
        for (let i = 0; i < 4; i++) app.effects.emit(0, 1, 0, { count: 60, color: i % 2 ? '#ff7a2a' : '#4a2a1a', speed: 12, up: 10, size: 0.6, life: 2, gravity: 9 });
        // and him with it
        const hp = app.snake.headPos;
        app.effects.emit(hp.x, hp.y + 0.4, hp.z, { count: 60, color: app.snake.trailColor || '#38f6ff', speed: 6, up: 6, size: 0.35, life: 1.4 });
        app.snake.group.visible = false;
      }],
      [3.4, () => this.caption('The meteors won.', 2.6)],
      [4.2, () => this.fadeTo(0.85, 1.4, '#1a0602')],
      [6.0, () => {
        this.letterbox(false);
        this.caption(null);
        this.forceSfx(false);
        this.fadeTo(0, 0.6);
        app.showGameOver('doom');
      }],
    ];
  }

  shotDoom(t, pos, look) {
    const k = ease(t / 6);
    const a = 0.6 + t * 0.08;
    const R = 11 + 9 * k;
    pos.set(Math.sin(a) * R, 5 + 6 * k, Math.cos(a) * R);
    look.set(0, 1.5 + 3 * k, 0);
    return { fov: 52 };
  }

  // A death in the storm: the usual crash, then the card. (Play again
  // restarts the storm.)
  onDeath() {
    this.forceSfx(false);
    this.music.setMode('off');
    document.getElementById('hud-meteors').classList.add('hidden');
    this.streaks.on = false;
  }

  // ------------------------------------------------------------------ skip
  skip() {
    if (this.phase === 'cine' && this.swapped) {
      // the storm's intro: straight to READY
      this.cues = [];
      this.fadeAnim = null;
      this.grade.fade = 0;
      this.handToPlayer();
      return true;
    }
    if (this.phase !== 'cine' || this.swapped || this.t >= CUT - 0.5) return false;
    const app = this.app;
    app.audio.stopMusic({ fade: 0.2 });
    // quick fade to white, then straight to the storm
    this.cues = [[this.t + 0.3, () => this.swapToStorm()]];
    this.fadeTo(1, 0.25, '#ffffff');
    this.app.audio.ui();
    return true;
  }

  // ------------------------------------------------------------------ camera
  shot(fn, { cut = false, blend = 0.8 } = {}) {
    this.cur = { fn: fn.bind(this), at: this.t };
    this.app.rig.setDirector((dt, out) => this.camera(dt, out), cut ? { instant: true } : { duration: blend });
  }

  camera(dt, out) {
    const s = this.cur;
    if (!s) return;
    const r = s.fn(this.t - s.at, this.pos, this.look) || {};
    out.pos.copy(this.pos);
    this.obj.position.copy(this.pos);
    this.obj.up.set(0, 1, 0);
    this.obj.lookAt(this.look);
    if (r.roll) this.obj.rotateZ(r.roll);
    out.quat.copy(this.obj.quaternion);
    out.fov = r.fov ?? 50;
  }

  // high and wide, gliding down towards the house
  shotEstablish(t, pos, look) {
    const k = ease(t / 4.6);
    const a = 0.95 - 0.55 * k;
    const R = 26 - 13 * k;
    pos.set(Math.sin(a) * R, 15 - 10 * k, Math.cos(a) * R);
    look.set(-1.5 * (1 - k), 0.8, 2 * k);
    return { fov: 46 };
  }

  shotYard(t, pos, look) {
    const k = ease(t / 3);
    pos.set(4.6 - 0.8 * k, 1.7, 6.6 - 0.6 * k);
    look.set(-0.3, 0.7, 2.6);
    return { fov: 44 };
  }

  // the whole family together: the partner and baby facing the camera,
  // him from over his shoulder, hearts everywhere
  shotReunion(t, pos, look) {
    const k = ease(t / 2.4);
    pos.set(2.5 - 0.4 * k, 1.75 - 0.25 * k, 6.1 - 0.5 * k);
    look.set(-0.1, 0.4, 3.35);
    return { fov: 36 };
  }

  // in front of the snake, looking back at his happy face, family in view
  shotSmile(t, pos, look) {
    const h = this.me.head;
    const k = ease(t / 2.4);
    pos.set(h.x + 1.1 - 0.3 * k, h.y + 0.85, h.z - 2.1 + 0.5 * k);
    look.set(h.x - 0.3, h.y + 0.35, h.z + 0.1);
    return { fov: 40 - 4 * k };
  }

  shotHouse(t, pos, look) {
    const k = ease(t / 7);
    pos.set(2.4 - 0.6 * k, 1.9 - 0.2 * k, 7.6 - 1.2 * k);
    look.set(-0.2, 0.8, 1.6);
    return { fov: 44 };
  }

  // high over the yard as more meteors smash into it
  shotStrikes(t, pos, look) {
    const k = ease(t / 2.4);
    pos.set(6.5 - k, 5.5 - k, 9.5 - k);
    look.set(-0.5, 0.3, 2.0);
    return { fov: 52 };
  }

  // low by the house as the ground shakes; the camera rattles
  shotRumble(t, pos, look) {
    const j = Math.min(1, t / 2) * (this.app.settings.reduceMotion ? 0.2 : 1);
    pos.set(-3.2 + Math.sin(t * 31) * 0.05 * j, 0.6 + Math.sin(t * 43) * 0.04 * j, 5.2);
    look.set(0.2, 1.6, 0);
    return { fov: 48, roll: Math.sin(t * 17) * 0.015 * j };
  }

  shotBurst(t, pos, look) {
    pos.set(1.6, 0.55, 6.6);
    look.set(0, 0.5, 2.4);
    return { fov: 46 };
  }

  // behind the snake, low, looking up at the sky as the meteor comes
  shotLookUp(t, pos, look) {
    const h = this.me.head;
    const k = ease(t / 4);
    // low, over his shoulder, looking up past the roof at the sky
    // (kept inside the walls)
    pos.set(h.x + 0.8, 0.45 + 0.1 * k, Math.min(6.4, h.z + 1.5 - 0.3 * k));
    const m = this.hero.group.position;
    const tgt = this.tmpTgt || (this.tmpTgt = new THREE.Vector3());
    tgt.set(-4, 14, -40);
    if (this.hero.group.visible) tgt.lerp(m, 0.55);
    look.copy(tgt);
    return { fov: 58 - 8 * k };
  }

  // the blast, from high behind the yard: the house small in front of a
  // fireball as the world burns
  shotBlast(t, pos, look) {
    const k = ease(t / 3.2);
    pos.set(5 + 2 * k, 4.5 + 1.5 * k, 12 + 3 * k);
    look.set(-7, 5 + 6 * k, -24);
    return { fov: 54 };
  }

  // close on his face: a dolly zoom (the camera backs off as the lens
  // narrows, so the face stays put and the world behind swells)
  shotFace(t, pos, look) {
    const k = ease(t / 1.9);
    const d = this.app.settings.reduceMotion ? 1.6 : 1.1 + 1.6 * k;
    // tan(fov / 2) * d stays the same: the face holds its size
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(0.513 / d));
    // from his side: nothing (not even the house) between us and his face
    const p = this.me.view.head.position;
    const f = this.me.dir;
    pos.set(p.x + f.z * d + f.x * 0.35 * d, p.y + 0.22 + 0.06 * d, p.z - f.x * d + f.z * 0.35 * d);
    look.set(p.x, p.y + 0.05, p.z);
    return { fov };
  }

  // In front of the snake's face: d ahead of the head, off to one side by
  // side (times d), up by h; looking back at the face.
  faceCam(pos, look, d, side, h) {
    const v = this.me.view;
    const p = v.head.position;
    const f = this.me.dir;
    pos.set(p.x + f.x * d - f.z * side * d, p.y + h, p.z + f.z * d + f.x * side * d);
    look.set(p.x, p.y + 0.05, p.z);
  }

  shotFamily(t, pos, look) {
    const k = ease(t / 2.2);
    // straight on, so the open door (swung out to the left) is out of the way
    pos.set(0.05, 0.8, 4.3 - 0.3 * k);
    look.set(0, 0.45, 1.55);
    return { fov: 44 };
  }

  shotDecide(t, pos, look) {
    const k = ease(t / 2.4);
    this.faceCam(pos, look, 1.5 - 0.3 * k, -0.5, 0.1);
    return { fov: 36 - 6 * k, roll: -0.04 * k };
  }

  shotCrate(t, pos, look) {
    const k = ease(t / 2);
    pos.set(CRATE.x - 2.1 + 0.3 * k, 1.5 - 0.2 * k, CRATE.z + 1.7 - 0.2 * k);
    look.set(CRATE.x, 0.55, CRATE.z);
    return { fov: 46 };
  }

  shotApple(t, pos, look) {
    const a = this.home.apple.position;
    const k = ease(t / 1.8);
    pos.set(CRATE.x + 2.7 - 0.3 * k, 1.75, CRATE.z + 2.1 - 0.2 * k);
    look.set(CRATE.x - 0.2, Math.max(0.9, a.y - 0.1), CRATE.z + 0.2);
    return { fov: 40 - 6 * k };
  }

  // side on to the bite: the apple in the middle, his open mouth coming in
  shotBite(t, pos, look) {
    const a = this.biteAt;
    const d = this.biteDir;
    const ay = a.y;
    const k = ease(t / 0.9);
    // midway between his head and the apple, from the side and a little
    // ahead, so we look into his face as he bites
    const mx = a.x - d.x * 0.6;
    const mz = a.z - d.z * 0.6;
    const r = 2.2 - 0.2 * k;
    pos.set(mx - d.z * r - d.x * 0.15, ay + 0.12, mz + d.x * r - d.z * 0.15);
    look.set(mx, ay - 0.05, mz);
    return { fov: 40 };
  }

  // the power-up and the growth: the camera backs off as he grows, away
  // from the house, so the world visibly shrinks around him
  shotGrow(t, pos, look) {
    const P = this.power;
    const pv = P ? P.pivot : this.me.head;
    const k = P ? P.scale : 1;
    const l = Math.hypot(pv.x, pv.z) || 1;
    const ux = pv.x / l;
    const uz = pv.z / l;
    const d = 4.4 * Math.max(1, k * 0.8);
    pos.set(pv.x + ux * d * 0.8 - uz * d * 0.75, 1.3 + 1.0 * k, pv.z + uz * d * 0.8 + ux * d * 0.75);
    look.set(pv.x * 0.6, 0.45 * k, pv.z * 0.6);
    return { fov: 50, roll: this.app.settings.reduceMotion ? 0 : Math.sin(t * 9) * 0.02 * Math.max(0, 1 - t) };
  }

  // wide, from the side: the power-up
  shotPower(t, pos, look) {
    const h = this.power ? this.power.pivot : this.me.head;
    const k = ease(t / 1.1);
    pos.set(h.x + 4.5 + 2 * k, 1.6 + 1.4 * k, h.z + 4.5 + 2 * k);
    look.set(h.x - 0.4, 0.9 + 0.8 * k, h.z - 0.6);
    return { fov: 46 + 6 * k, roll: this.app.settings.reduceMotion ? 0 : Math.sin(t * 9) * 0.03 };
  }

  // the colossal snake on Emerald Coast, the world tiny around it
  shotColossal(t, pos, look) {
    const h = this.app.snake.headPos;
    const k = ease(t / 3);
    const a = -0.9 + 0.6 * k;
    const R = 9 - 2.5 * k;
    pos.set(h.x + Math.sin(a) * R, 1.0 + 3.2 * k, h.z + Math.cos(a) * R);
    look.set(h.x * (1 - k * 0.5), 0.8 - 0.6 * k, h.z * (1 - k * 0.5) - 1.5 * k);
    return { fov: 52 };
  }

  // low by the house, looking up at the last meteor coming down
  shotRaidSky(t, pos, look) {
    const m = this.raid.group.position;
    pos.set(1.7 * HS, 0.3 * HS, 2.4 * HS);
    look.set(0, HS, 0).lerp(m, 0.7);
    return { fov: 62 };
  }

  // flying alongside it: three Apple Men flexing on a burning apple
  shotRaidRiders(t, pos, look) {
    const m = this.raid.group.position;
    pos.set(m.x + 2.1 * HS, m.y + 1.1 * HS, m.z + 2.5 * HS);
    look.set(m.x, m.y + 0.8 * HS, m.z);
    return { fov: 46 };
  }

  shotHomeWide(t, pos, look) {
    const k = ease(t / 2.4);
    pos.set((2.3 - 0.3 * k) * HS, (1.5 - 0.2 * k) * HS, (3.4 - 0.4 * k) * HS);
    look.set(0, 0.45 * HS, 0.2 * HS);
    return { fov: 50 };
  }

  // low and heroic: the boss flexing, the other two behind
  shotFlex(t, pos, look) {
    const k = ease(t / 1.8);
    pos.set((0.4 - 0.1 * k) * HS, 0.2 * HS, (3.0 - 0.25 * k) * HS);
    look.set(0, 0.48 * HS, 0.5 * HS);
    return { fov: 42 };
  }

  shotGrab(t, pos, look) {
    pos.set(-1.4 * HS, 0.75 * HS, 2.6 * HS);
    look.set(0, 0.55 * HS, 0.3 * HS);
    return { fov: 44 };
  }

  // the colossal snake's face, from in front
  shotSnakeFace(t, pos, look) {
    const s = this.app.snake;
    const p = s.head.position;
    const f = s.headDir;
    const k = ease(t / 1.4);
    const d = 1.8 - 0.4 * k;
    pos.set(p.x + f.x * d - f.z * 0.5, p.y + 0.35, p.z + f.z * d + f.x * 0.5);
    look.set(p.x, p.y + 0.05, p.z);
    return { fov: 40 };
  }

  shotTakeoff(t, pos, look) {
    const m = this.raid.group.position;
    pos.set(1.6 * HS, 0.35 * HS, 2.6 * HS);
    look.set(0, 0.8 * HS, 0).lerp(m, 0.75);
    return { fov: 58 };
  }

  shotVictory(t, pos, look) {
    const v = this.vic;
    const a = v.a + t * 0.12;
    const k = ease(t / 6);
    const R = 9 + 6 * k;
    pos.set(v.center.x + Math.sin(a) * R, 3.5 + 5 * k, v.center.z + Math.cos(a) * R);
    look.set(v.center.x * (1 - k), 0.4, v.center.z * (1 - k));
    return { fov: 48 };
  }

  // ------------------------------------------------------------------ overlays
  letterbox(on) {
    document.getElementById('cine').classList.toggle('on', on);
  }

  caption(text, secs = 2.5, big = false) {
    const el = document.getElementById('cine-cap');
    clearTimeout(this.capTimer);
    if (!text) {
      el.classList.remove('show');
      return;
    }
    el.textContent = text;
    el.classList.toggle('big', big);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.capTimer = setTimeout(() => el.classList.remove('show'), secs * 1000);
  }

  fadeTo(v, secs, color) {
    if (color) this.grade.fadeColor.set(color);
    this.fadeAnim = { from: this.grade.fade, to: v, t: 0, dur: Math.max(0.01, secs) };
  }

  // ------------------------------------------------------------------ frame
  update(dt, gdt) {
    if (!this.phase) return;
    const app = this.app;
    const rm = app.settings.reduceMotion;
    const time = app.simTime;
    this.t += dt;
    // cues
    while (this.cues.length && this.cues[0][0] <= this.t) this.cues.shift()[1]();
    // fades
    const f = this.fadeAnim;
    if (f) {
      f.t += dt;
      const k = smooth(clamp01(f.t / f.dur));
      this.grade.fade = f.from + (f.to - f.from) * k;
      if (k >= 1) this.fadeAnim = null;
    }
    // the ground shaking before the meteor
    if (this.rumble) {
      this.rumble.t += dt;
      const r = this.rumble.t;
      const j = Math.min(1, r / 2.2);
      this.home.shake(0.7 * j);
      if (!rm && r < 7) app.rig.shake = Math.max(app.rig.shake, 0.06 * j);
      if (r < 3.5 && Math.random() < dt * 14) {
        const x = (Math.random() - 0.5) * 5;
        const z = (Math.random() - 0.3) * 5;
        app.effects.emit(x, 0.1, z, { count: 3, color: '#cbb89a', speed: 0.6, up: 1.2, size: 0.18, life: 0.7, gravity: 3 });
      }
      if (r > 8) this.rumble = null;
    }
    // the giant meteor
    if (this.hero.update(dt, time)) {
      /* impact handled by its cue */
    }
    if (this.hero.group.visible && Math.random() < 0.9) {
      const p = this.hero.group.position;
      const d = this.hero.dir;
      app.effects.emit(p.x - d.x * 20, p.y - d.y * 20, p.z - d.z * 20, { count: 3, color: Math.random() < 0.5 ? '#ffb040' : '#ff5010', speed: 6, up: 0, size: 4, life: 1.2, gravity: 0, spread: 6 });
    }
    this.fireballs.update(dt);
    this.strikes.update(dt, time);
    this.updateRaid(dt, time);
    this.streaks.update(dt, app.camera);
    this.updatePower(dt);
    // the moment: everything slows, drains to red and pulses with the heart
    let mood = 0;
    if (this.moment) {
      this.moment.t += dt;
      const m = this.moment.t;
      mood = clamp01(m / 0.6) * (1 - clamp01((m - 6.0) / 0.8));
      if (m > 7) this.moment = null;
    }
    this.updateGrade(dt, mood);
    // cast
    this.home.cameraQuat = app.camera.quaternion;
    const panic = app.world.zone === METEOR_ZONE ? 1 : this.rumble ? 0.4 : 0;
    this.home.update(dt, time, { panic });
    if (this.cheer > 0) {
      this.cheer -= dt;
      this.partner.bob = this.baby.bob = 1;
      if (this.cheer <= 0) {
        this.partner.bob = this.baby.bob = 0;
        for (const p of [this.partner, this.baby]) p.setFace({ smile: 0.4, squint: 0, brows: 0 });
      }
    }
    if (this.piggyback) {
      const ph = this.partner.head;
      this.baby.dir.copy(this.partner.dir);
      this.baby.head.set(ph.x, ph.y + 0.34, ph.z).addScaledVector(this.partner.dir, -0.12);
    }
    for (const p of [this.partner, this.baby]) {
      p.update(dt);
      this.bobPuppet(p, time);
      p.draw(time, dt);
    }
    if (this.drawsSnake) {
      this.me.view = app.snake;
      this.me.update(dt);
      this.me.draw(time, dt, { glow: this.power ? 1 : 0 });
    }
    // the storm
    if (this.swapped) {
      const g = app.game;
      const now = g.time + clamp01(app.t) * g.currentInterval();
      this.field.sync(g, app.toWorld, now, time, gdt);
      for (const p of this.field.falling()) {
        if (Math.random() < 0.7) app.effects.emit(p.x, p.y, p.z, { count: 2, color: Math.random() < 0.5 ? '#ffb040' : '#ff5a1a', speed: 0.5, up: 0.5, size: 0.35, life: 0.45, gravity: 0, spread: 0.3 });
      }
      if (this.phase === 'fight') {
        this.updateCounter(false);
      }
      if (this.fireworks && this.phase === 'victory') {
        this.fireworks.next -= dt;
        if (this.fireworks.next <= 0) {
          this.fireworks.next = 0.35 + Math.random() * 0.5;
          const p = V((Math.random() - 0.5) * 30, 10 + Math.random() * 8, -12 - Math.random() * 18);
          const col = new THREE.Color().setHSL(Math.random(), 1, 0.6).getStyle();
          this.fireballs.spawn(p, { size: 7, dur: 1.1, color: col });
          app.effects.emit(p.x, p.y, p.z, { count: 50, color: col, speed: 7, up: 1, size: 0.5, life: 1.3, gravity: 2 });
          app.audio.firework(THREE.MathUtils.clamp(p.x / 20, -0.8, 0.8), true);
        }
      }
    }
  }

  // a happy (or scared) little hop, on the spot
  // (the whole snake bounces: moving its head up and down would crumple
  // the trail its body follows)
  bobPuppet(p, time) {
    const on = p.bob && !p.moving && !(this.piggyback && p === this.baby) && !(this.carry && this.carry.some(([c]) => c === p));
    const target = on ? Math.abs(Math.sin(time * 7 + (p === this.baby ? 1 : 0))) * 0.3 * p.scale : 0;
    p.hop = on ? target : (p.hop || 0) * 0.8;
  }

  updateGrade(dt, mood) {
    const g = this.grade;
    const app = this.app;
    const rm = app.settings.reduceMotion;
    const burning = app.world.zone === METEOR_ZONE || (app.world.trans && app.world.trans.to === METEOR_ZONE);
    // before the impact the light drains as the meteor comes
    const dread = this.hero.group.visible ? this.hero.k : 0;
    const P = this.power;
    let sat = 1 - mood * 0.55 - dread * 0.2;
    let tintAmt = mood * 0.5 + dread * 0.35;
    let vig = mood * 0.55 + dread * 0.25;
    let chroma = mood * 0.4;
    let lines = 0;
    let speed = 0;
    g.tint.set(burning || dread ? '#ff8a6a' : '#ffffff');
    if (mood) {
      // a red pulse with every heartbeat
      const beat = (this.t - 25.4) % 0.9;
      chroma += Math.exp(-beat * 9) * 0.8;
      vig += Math.exp(-beat * 9) * 0.2;
      g.tint.set('#ff5a4a');
    }
    if (P) {
      // the screen goes wild: the colour spins, everything shimmers
      // wild through the power-up, calmer as the world shrinks (so you see it)
      const k = clamp01(P.t / 0.4) * (1 - 0.7 * clamp01((P.t - 1.2) / 0.7));
      const hue = (P.t * 2.6) % 1;
      g.tint.setHSL(hue, 1, 0.72);
      tintAmt = (rm ? 0.25 : 0.65) * k;
      sat = 1 + 0.9 * k;
      chroma = (rm ? 0.2 : 2.2) * k;
      lines = rm ? 0 : 1.2 * k;
      speed = rm ? 0 : 1.4 * k;
      vig = 0.2;
    }
    g.sat = sat;
    g.tintAmt = tintAmt;
    g.vig = vig;
    g.chroma = rm ? Math.min(chroma, 0.3) : chroma;
    g.lines = lines;
    g.speed = speed;
  }

  // Applied on top of the world's own look (see App.renderFrame).
  applyGrade(P) {
    const g = this.grade;
    P.uSat.value *= g.sat;
    if (g.tintAmt > 0) P.uTint.value.lerp(g.tint, g.tintAmt);
    P.uVignette.value += g.vig;
    P.uChroma.value += g.chroma;
    P.uLines.value += g.lines;
    P.uSpeed.value += g.speed;
    if (g.fade > 0.001 && g.fade >= P.uFlash.value) {
      P.uFlash.value = g.fade;
      P.uFlashColor.value.copy(g.fadeColor);
    }
  }
}
