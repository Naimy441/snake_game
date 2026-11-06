import * as THREE from 'three';

import { GhostBot } from './game/GhostBot.js';
import { SnakeGame, BOARD_SIZES, DIRS, COMBO_WINDOW_MS, ZONE_NAMES, ZONE_STARTS, MAX_LEVEL, LEVEL_SPEEDS, LEVEL_AT, SKY_H, SPACE_ZONE, zoneForLevel } from './game/SnakeGame.js';
import { GalaxyDirector } from './GalaxyDirector.js';
import { fallPath, CORE_Y, HORIZON_R } from './render/Space.js';
import { SKINS, ACCESSORIES, skinById, accessoryById, isUnlocked, unlockProgress } from './skins.js';
import { World } from './render/World.js';
import { SnakeView } from './render/SnakeView.js';
import { FoodView } from './render/FoodView.js';
import { BoardObjects } from './render/BoardObjects.js';
import { Effects } from './render/Effects.js';
import { CameraRig } from './render/CameraRig.js';
import { PostFX } from './render/Post.js';
import { CORNER } from './render/SnakePath.js';
import { HEAD_LEAD } from './render/SnakeView.js';
import { makeGlowTexture, makeScaleNormalMap, makeRingTexture, makeChevronTexture } from './render/textures.js';
import { AudioEngine } from './audio/Audio.js';
import { Input } from './Input.js';
import { loadSettings, saveSettings, loadBest, saveBest, loadStats, saveStats, QUALITY } from './settings.js';

const $ = (id) => document.getElementById(id);
const BOARD = 19;
const CRASH_HIT = 0.09; // seconds from a crash to the head striking // the biggest board (it starts at BOARD_SIZES[0] and grows)
// Longest snake the renderer draws: apples grow it more on every map, and the
// sky box holds far more cells than the board.
const MAX_SNAKE = 1600;
const CAMERA_NAMES = { overhead: 'Overhead', tp: 'Chase', fp: 'First-person' };
const CAMERA_ORDER = ['tp', 'fp', 'overhead'];
// Picking the overhead camera earns a (friendly) roast.
const OVERHEAD_ROASTS = [
  'Ah, the bird\'s-eye view. The snake respects your fear of commitment.',
  'Your snake wanted a co-pilot. It got air traffic control.',
  'Watching from up there? The snake says come down and fight.',
  'Overhead: same snake, zero adrenaline. Grandma approves.',
  'Ah yes, the view from the safety of the clouds.',
];
// the jetpack and Galactic Core briefings, shown at lift-off and on restart
const FLY_TOAST = { kicker: 'Jetpack on', title: 'Take flight', keys: [['↑', 'climb'], ['↓', 'dive'], ['← →', 'turn']], tone: 'sky', ms: 3400 };
const CORE_TOAST = { kicker: 'Galactic Core', title: 'Fill every cell', sub: 'The black hole is eating the board', tone: 'prism', ms: 3400 };
const mod = (a, n) => ((a % n) + n) % n;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth01 = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
// Fraction of a step after a tick during which a new turn redoes that step.
// Together with the drawn head's lead this ends just past the turning cell's
// centre, so a redo never visibly snaps the head by more than ~1/4 cell.
const GRACE = 0.25;
// Real-time pace while rushing, relative to not rushing (see frame()).
const RUSH_FEEL = 0.95;

class App {
  constructor() {
    this.settings = loadSettings();
    this.stats = loadStats();
    // Playtesting from a link: ?level=12&length=127 starts every run at that
    // level (0-based, unlocked or not) with the snake that long. &bot=1 lets
    // the autoplay drive the whole way; &cam=tp|fp|overhead picks the camera.
    const qs = new URLSearchParams(location.search);
    this.playtest = qs.has('level') ? { level: Math.max(0, Math.min(MAX_LEVEL, Math.floor(+qs.get('level') || 0))), length: Math.floor(+qs.get('length') || 0), bot: qs.get('bot') === '1' } : null;
    this.camOverride = CAMERA_ORDER.includes(qs.get('cam')) ? qs.get('cam') : null; // this visit only, not saved
    this.canvas = $('scene');
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
      if (!this.renderer.capabilities.isWebGL2) throw new Error('WebGL 2 required');
    } catch (err) {
      console.error(err);
      $('webgl-error').classList.remove('hidden');
      $('screen-start').classList.add('hidden');
      return;
    }
    const r = this.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;

    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('touch-device');

    this.post = new PostFX(r);
    this.game = new SnakeGame({ sizes: BOARD_SIZES, best: loadBest() });
    this.world = new World({ size: BOARD_SIZES[0], renderer: r });
    this.scene = this.world.scene;
    // y: the cell's altitude layer in the sky (undefined on the ground); in
    // the Galactic Core the grid is bent into a ring around the black hole
    this.toWorld = (x, z, y) => this.world.toWorld(x, z, y, this.game.yMid, this.game.size);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 1500);
    this.rig = new CameraRig(this.camera, BOARD_SIZES[0]);

    this.glowTex = makeGlowTexture();
    this.scaleMap = makeScaleNormalMap();
    this.effects = new Effects(600);
    this.scene.add(this.effects.group);
    this.food = new FoodView(this.glowTex);
    this.scene.add(this.food.group);
    this.board = new BoardObjects({ glowTex: this.glowTex, ringTex: makeRingTexture(), chevronTex: makeChevronTexture(), checker: this.world.island.checker });
    this.scene.add(this.board.group);

    this.audio = new AudioEngine();
    this.audio.setVolumes({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted });

    this.state = 'menu';
    this.t = 0;
    this.simTime = 0;
    this.timers = [];
    this.lunge = 0;
    this.deathFlash = 0;
    this.crash = null;
    this.speedFx = 0;
    this.rushGlow = 0;
    this.flashAmt = 0;
    this.flashColor = new THREE.Color('#ffffff');
    this.cameraMode = this.camOverride || (CAMERA_ORDER.includes(this.settings.camera) ? this.settings.camera : 'tp');
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.lastHud = {};
    this.dyn = { scale: 1, samples: [], timer: 0, grace: 2, good: 0, backoff: 1, lastUp: -99, slowAtMin: 0, stable: 0 };

    this.activeQuality = this.settings.quality === 'auto' ? (this.isTouch ? 'medium' : 'high') : this.settings.quality;
    this.applyQuality();

    this.input = new Input(this.canvas, {
      direction: (d, src) => this.onDirection(d, src),
      turn: (s) => this.onTurn(s),
      pitch: (up) => this.onPitch(up),
      tap: (side) => this.onTap(side),
      rush: (on) => (this.game.wantRush = on),
      confirm: (k) => this.onConfirm(k),
      camera: () => this.cycleCamera(),
      ghost: () => this.toggleGhost(),
      timer: () => this.toggleTimer(),
      pause: (k) => this.onPause(k),
      restart: () => this.onRestart(),
      mute: () => this.toggleMute(),
    });
    this.input.bindTouchButtons($('t-left'), $('t-right'), $('t-rush'), $('t-up'), $('t-down'));

    this.bindUI();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.state === 'playing' || this.state === 'countdown')) this.pause();
      this.dyn.grace = 2;
    });
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });

    this.ghost = new GhostBot(this.game);
    this.ghostView = new SnakeView({ maxCells: MAX_SNAKE, radial: 10, scaleMap: this.scaleMap });
    this.ghostView.makeGhost();
    this.ghostView.group.visible = false;
    this.scene.add(this.ghostView.group);
    singlePassGlows(this.scene);
    this.ghostFade = 0;
    this.ghostWait = 0;
    // attract mode: on the title screen the real snake plays itself, steered
    // by the same perfect-play brain as the ghost
    this.demoBot = new GhostBot(this.game);
    this.demoZone = null;
    this.galaxy = new GalaxyDirector(this);
    // speedrun timer: real time for the run (pauses don't count)
    this.run = { t: 0, running: false, done: false, full: false, record: false };
    this.whiteout = 0;
    this.speedFxOverride = null;
    this.world.space.setWon(this.stats.wins > 0);
    this.world.space.setSnakeColor(this.snake.trailColor);
    this.updateWinBadge();
    // each map has two songs, picked at random: say which one starts playing
    this.audio.onTrack = (song) => {
      if (this.state === 'playing' || this.state === 'countdown') this.toast({ kicker: 'Now playing', title: song.name, tone: 'music', ms: 2600 });
      // and on the title screen, under the map the tour is showing
      const el = $('ns-track');
      if ($('ns-track-name').textContent !== song.name || el.classList.contains('hidden')) {
        $('ns-track-name').textContent = song.name;
        el.classList.remove('hidden', 'swap');
        void el.offsetWidth;
        el.classList.add('swap');
      }
    };
    this.startNoteFountain();

    // the title screen tours the maps in order, starting from the chosen one
    this.tourOffset = zoneForLevel(this.startLevel());
    this.world.setZone(this.tourOffset, { instant: true });
    this.rig.setMode('tour', { instant: true });
    this.updateCameraUI();
    this.syncFood();
    this.precompile();
    this.last = performance.now();
    this.awake = 3;
    const wakeRender = () => (this.awake = 3);
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'input', 'change', 'resize', 'wheel']) window.addEventListener(ev, wakeRender, { passive: true });
    this.renderer.setAnimationLoop((now) => this.frame(now));
    this.THREE = THREE;
    window.__coil = this; // handy for debugging and automated tests
  }

  // Warm up before the first frame: with every zone, pickup and pillar
  // visible, compile all shaders and draw one real frame (offscreen, behind
  // the loading screen). That uploads every mesh and texture to the GPU and
  // compiles the shadow shaders too, so nothing stalls mid-game the first
  // time a zone, chain, prism or pillar appears.
  precompile() {
    const show = [this.food.orb.group, this.food.prism.group, this.food.prey.group, ...this.food.chain.links, ...this.board.pads, this.snake.aura, this.snake.headAura, ...this.effects.rings];
    show.push(...this.board.pads.map((p) => p.userData.air));
    if (this.snake.jetpack) show.push(this.snake.jetpack);
    if (this.ghostView) show.push(this.ghostView.group);
    const prev = show.map((o) => o.visible);
    show.forEach((o) => (o.visible = true));
    const instanced = [this.board.pillars, this.board.bands, this.board.warns, this.food.chain.dots];
    const counts = instanced.map((m) => m.count);
    const ident = new THREE.Matrix4();
    for (const m of instanced) {
      m.count = 1;
      m.setMatrixAt(0, ident);
      m.instanceMatrix.needsUpdate = true;
    }
    const culled = [];
    this.scene.traverse((o) => {
      if (o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
    });
    this.world.withAllZones(() => {
      this.renderer.setRenderTarget(this.post.sceneRT);
      this.renderer.compile(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.post.render(this.scene, this.camera);
    });
    for (const o of culled) o.frustumCulled = true;
    instanced.forEach((m, i) => (m.count = counts[i]));
    show.forEach((o, i) => (o.visible = prev[i]));
  }

  // ---------------------------------------------------------------- quality
  applyQuality() {
    const q = QUALITY[this.activeQuality];
    this.q = q;
    this.world.setShadowQuality(q.shadows);
    this.world.setParticleBudget(q.ambient);
    this.effects.setParticleBudget(q.particles);
    this.post.configure({ samples: q.samples, bloomLevels: q.bloomLevels, taps: q.taps });
    if (!this.snake || this.snake.radial !== q.radial) {
      const old = this.snake;
      this.snake = new SnakeView({ maxCells: MAX_SNAKE, radial: q.radial, scaleMap: this.scaleMap, skin: this.equippedSkin(), accessory: this.equippedAccessory() });
      if (old) {
        this.snake.headPos.copy(old.headPos);
        this.snake.headDir.copy(old.headDir);
        this.snake.wiggle = old.wiggle;
        this.scene.remove(old.group);
        old.dispose();
      }
      this.scene.add(this.snake.group);
      singlePassGlows(this.snake.group);
    }
    this.dyn.scale = 1;
    this.dyn.grace = 2;
    this.dyn.good = 0;
    this.dyn.slowAtMin = 0;
    this.resize();
    const note = $('quality-note');
    if (note) note.textContent = this.settings.quality === 'auto' ? `Auto is currently using ${this.activeQuality} quality.` : '';
  }

  // ---------------------------------------------------------------- level select
  // Highest level the player has reached in any run (older saves only
  // recorded the furthest zone, so that counts too).
  unlockedLevel() {
    return Math.min(MAX_LEVEL, Math.max(this.stats.maxLevel || 0, ZONE_STARTS[this.stats.maxZone || 0] || 0));
  }

  startLevel() {
    if (this.playtest) return this.playtest.level;
    return Math.max(0, Math.min(this.unlockedLevel(), this.settings.startLevel || 0));
  }

  stepStartLevel(delta) {
    this.setStartLevel(this.startLevel() + delta);
  }

  setStartLevel(L) {
    const next = Math.max(0, Math.min(this.unlockedLevel(), L));
    if (next === this.startLevel()) return;
    const zoneBefore = zoneForLevel(this.startLevel());
    this.settings.startLevel = next;
    saveSettings(this.settings);
    this.audio.ui();
    this.renderLevelSelect();
    // picking another map brings it into the tour right away
    const zone = zoneForLevel(next);
    if (zone !== zoneBefore && this.state === 'menu') this.showZoneInTour(zone);
  }

  // Map tiles: start at the first level of that map (or keep the level if
  // it's already on it).
  pickMap(zone) {
    if (ZONE_STARTS[zone] > this.unlockedLevel()) {
      this.toast({ kicker: `${ZONE_NAMES[zone]} is locked`, title: `Reach level ${ZONE_STARTS[zone] + 1}`, tone: 'danger' });
      return;
    }
    if (zoneForLevel(this.startLevel()) === zone) {
      this.showZoneInTour(zone);
      return;
    }
    this.setStartLevel(ZONE_STARTS[zone]);
  }

  renderLevelSelect() {
    const L = this.startLevel();
    const max = this.unlockedLevel();
    const zone = zoneForLevel(L);
    $('lvl-sel-name').textContent = `Level ${L + 1}`;
    $('lvl-sel-zone').textContent = ZONE_NAMES[zone];
    $('lvl-sel-speed').textContent = `${(1000 / LEVEL_SPEEDS[L]).toFixed(1)} moves/s`;
    $('lvl-prev').disabled = L <= 0;
    $('lvl-next').disabled = L >= max;
    $('ms-tiles').innerHTML = ZONE_NAMES.map((name, z) => {
      const locked = ZONE_STARTS[z] > max;
      const on = z === zone;
      // a locked map keeps its look and name secret until it's reached
      if (locked) return `<button class="ms-tile locked" data-zone="${z}" role="radio" aria-checked="false" aria-label="Locked map" title="Locked · reach level ${ZONE_STARTS[z] + 1}"><b>${z + 1}</b></button>`;
      return `<button class="ms-tile zg${z}${on ? ' active' : ''}" data-zone="${z}" role="radio" aria-checked="${on}" aria-label="${name}" title="${name}"><b>${z + 1}</b></button>`;
    }).join('');
    const from = ZONE_STARTS[zone];
    const to = (ZONE_STARTS[zone + 1] ?? MAX_LEVEL + 1) - 1;
    let pips = '';
    for (let l = from; l <= to; l++) pips += `<i class="${l === L ? 'on' : l <= max ? 'open' : ''}"></i>`;
    $('ms-pips').innerHTML = pips;
    $('lvl-sel-hint').textContent = max === 0 ? 'Reach new levels to start from them here.' : max >= MAX_LEVEL ? 'Every level unlocked.' : `Unlocked up to level ${max + 1}.`;
    this.markShowing();
  }

  // ---------------------------------------------------------------- title tour
  // The map the tour is showing (or sweeping in).
  tourZone() {
    return this.world.trans ? this.world.trans.to : this.world.zone;
  }

  // How many maps the tour may show: only the ones the player has reached
  // (maps unlock in order), so it never spoils one that's still locked.
  tourCount() {
    return Math.max(1, ZONE_STARTS.filter((s) => s <= this.unlockedLevel()).length);
  }

  // Make the tour's current segment show this map (it moves on in order).
  showZoneInTour(zone) {
    this.tourOffset = mod(zone - this.rig.tourSegment, this.tourCount());
  }

  updateTour() {
    if (this.state !== 'menu' || this.garageOpen || this.rig.mode !== 'tour') return;
    const n = this.tourCount();
    const want = mod(this.rig.tourSegment + this.tourOffset, n);
    if (want !== this.tourZone() && !this.world.transitioning) {
      // rising into (or sinking back out of) the heavens takes a little longer
      const sky = want >= SPACE_ZONE - 1 || this.world.zone >= SPACE_ZONE - 1;
      this.world.setZone(want, { duration: sky ? 4.4 : 3.4 });
    }
    const z = this.tourZone();
    if (`${z}:${n}` !== this.nsKey) {
      this.nsKey = `${z}:${n}`;
      const name = $('ns-name');
      name.textContent = ZONE_NAMES[z];
      name.classList.remove('swap');
      void name.offsetWidth;
      name.classList.add('swap');
      $('ns-num').textContent = `Map ${z + 1}`;
      $('ns-dots').innerHTML = n < 2 ? '' : ZONE_NAMES.slice(0, n).map((_, i) => `<i class="${i < z ? 'past' : ''}">${i === z ? '<b id="ns-fill"></b>' : ''}</i>`).join('');
      this.markShowing();
    }
    const fill = $('ns-fill');
    if (fill) fill.style.setProperty('--p', this.rig.tourProgress.toFixed(3));
  }

  // ---------------------------------------------------------------- attract mode
  // A fresh demo run on the map the tour is showing (it restarts whenever
  // the tour moves on, while the camera is high and the new map sweeps in).
  resetDemo(zone) {
    const g = this.game;
    const old = this.demoZone != null && this.snake.headPos.clone();
    g.reset();
    g.startAtLevel(ZONE_STARTS[zone]);
    this.demoZone = zone;
    this.demoDeadAt = null;
    this.t = 0;
    this.timers = [];
    this.food.hideAll();
    this.board.clear();
    this.syncFood();
    if (old && !this.settings.reduceMotion) this.effects.emit(old.x, old.y + 0.4, old.z, { count: 30, color: '#ffffff', speed: 2, up: 2, size: 0.2, life: 0.6 });
  }

  updateDemo(dt) {
    const g = this.game;
    if (this.garageOpen) return; // hold still for the showcase camera
    const zone = this.tourZone();
    if (zone !== this.demoZone) return this.resetDemo(zone);
    if (!g.alive) {
      // (very rare) a crash: hold the wreck a moment, then start over
      if (this.simTime - this.demoDeadAt > 1.2) this.resetDemo(zone);
      return;
    }
    // the demo never changes map by itself: leveling into the next map
    // starts this one over
    if (g.zone !== zone) return this.resetDemo(zone);
    g.clockScale = 1;
    this.t += (dt * 1000) / g.currentInterval();
    let guard = 0;
    while (this.t >= 1 && g.alive && guard++ < 4) {
      this.t -= 1;
      this.demoStep();
    }
    this.t = Math.min(this.t, 1);
  }

  demoStep() {
    const g = this.game;
    const bot = this.demoBot;
    // Keep the demo on its map: hold the apple count short of the next map's
    // first level (eating still grows the snake), so it never levels out of
    // the map and has to start over. It plays on at the map's top speed.
    const nextStart = ZONE_STARTS[g.zone + 1];
    if (nextStart != null) g.foodEaten = Math.min(g.foodEaten, LEVEL_AT[nextStart] - 2);
    g.queue.length = 0;
    if (g.space) {
      // the Galactic Core's board collapses as it goes: its own autoplay
      const d = g.corePlan();
      if (d) g.queueDirection(d);
      g.wantRush = false;
    } else {
      // mirror the real snake into the bot and ask it for the perfect move
      bot.reset(true);
      bot.pendingGrowth = g.pendingGrowth;
      bot.rush = g.rush;
      bot.time = g.time;
      const plan = bot.decide();
      if (plan.dir) g.queueDirection(plan.dir);
      g.wantRush = !!plan.rush;
    }
    const ev = g.step();
    const at = (c) => this.toWorld(c.x, c.z, c.y);
    const delay = this.visualDelay();
    const rm = this.settings.reduceMotion;
    if (ev.ate) {
      const w = at(ev.ate);
      const prism = ev.ate.type === 'prism';
      this.food.markEaten(ev.ate.type, new THREE.Vector3(w.x, w.y, w.z), delay);
      this.later(delay, () => {
        this.effects.emit(w.x, w.y + 0.45, w.z, { count: prism ? 60 : 28, color: prism ? '#e0aaff' : '#ff4d6d', speed: prism ? 4 : 3, up: 2.4, size: prism ? 0.3 : 0.22 });
        this.effects.shockwave(w.x, w.z, prism ? '#c77dff' : '#ff5a7a', { y: w.y, max: prism ? 4 : 2.4 });
      });
    }
    if (ev.chainLink) {
      const w = at(ev.chainLink);
      this.later(delay, () => {
        this.effects.emit(w.x, w.y + 0.5, w.z, { count: 22, color: '#38f6ff', speed: 3, up: 2.2, size: 0.22 });
        this.effects.shockwave(w.x, w.z, '#38f6ff', { y: w.y, max: 2.2, dur: 0.4 });
      });
    }
    if (ev.chainComplete) {
      const w = at(ev.chainComplete);
      this.later(delay + 0.05, () => this.effects.emit(w.x, w.y + 0.6, w.z, { count: 70, color: '#7ff8ff', speed: 5, up: 3, size: 0.3 }));
    }
    if (ev.caught) {
      const w = at(ev.caught);
      this.later(delay, () => this.effects.emit(w.x, w.y + 0.4, w.z, { count: 50, color: '#ffd36a', speed: 4, up: 3, size: 0.26 }));
    }
    if (ev.levelUp && !rm) {
      const hp = this.snake.headPos;
      this.later(delay, () => this.world.pulse(hp.x, hp.z));
    }
    if (ev.died) {
      this.demoDeadAt = this.simTime;
      const hp = this.snake.headPos;
      this.effects.emit(hp.x, hp.y + 0.4, hp.z, { count: 40, color: '#ffffff', speed: 3, up: 2.5, size: 0.24 });
    }
    this.syncFood();
  }

  // Lens shift: on the title screen the picture's centre moves into the space
  // the menu leaves free (right of the column, or above the bottom sheet), so
  // the tour frames the world there instead of behind the menu.
  measureLens() {
    const col = document.querySelector('.title-col');
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (!col || !col.offsetWidth) return;
    const portrait = W <= 720 || W / H < 0.9;
    this.lensTarget = portrait ? { x: 0, y: Math.min(H * 0.3, col.offsetHeight * 0.45) } : { x: Math.min(W * 0.25, col.offsetWidth * 0.5), y: 0 };
  }

  // After a Galactic Core death the black hole is framed in the space the
  // results card leaves free (right of it, or above it on a phone).
  overLens() {
    const card = document.querySelector('#screen-over .card');
    if (!card || !card.offsetWidth) return null;
    const r = card.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (r.right < W * 0.75) return { x: r.right / 2, y: 0 };
    return { x: 0, y: Math.max(0, (H - r.top) / 2) };
  }

  updateLens(dt) {
    const on = this.state === 'menu' && !this.garageOpen;
    if (on && !this.lensTarget) this.measureLens(); // first frame after the loader
    const over = (this.state === 'over' || this.state === 'dying') && this.deathOrbit && this.rig.mode === 'director' ? this.overLens() : null;
    const t = over || (on && this.lensTarget ? this.lensTarget : { x: 0, y: 0 });
    const l = this.lens || (this.lens = { x: 0, y: 0 });
    const k = Math.min(1, dt * 2.5);
    l.x += (t.x - l.x) * k;
    l.y += (t.y - l.y) * k;
    const cam = this.camera;
    if (Math.abs(l.x) < 0.5 && Math.abs(l.y) < 0.5) {
      if (cam.view && cam.view.enabled) cam.clearViewOffset();
      return;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    cam.setViewOffset(W, H, -l.x, l.y, W, H);
  }

  markShowing() {
    const z = this.tourZone();
    document.querySelectorAll('.ms-tile').forEach((t) => t.classList.toggle('showing', Number(t.dataset.zone) === z));
  }

  // ---------------------------------------------------------------- speedrun timer
  toggleTimer() {
    this.settings.timer = !this.settings.timer;
    saveSettings(this.settings);
    const box = $('set-timer');
    if (box) box.checked = this.settings.timer;
    this.audio.ui();
    this.toast({ kicker: 'Speedrun timer', title: this.settings.timer ? 'On' : 'Off' });
  }

  // m:ss.cc (h:mm:ss.cc past an hour)
  formatRunTime(sec) {
    const cs = Math.floor(sec * 100);
    const h = Math.floor(cs / 360000);
    const m = Math.floor(cs / 6000) % 60;
    const ss = String(Math.floor(cs / 100) % 60).padStart(2, '0');
    const c = String(cs % 100).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}.${c}` : `${m}:${ss}.${c}`;
  }

  updateTimer(dt) {
    const r = this.run;
    if (r.running && ['playing', 'countdown', 'cine'].includes(this.state)) r.t += dt;
    const show = this.settings.timer && this.state !== 'menu';
    this.setClass($('speedrun'), 'hidden', !show);
    if (!show) return;
    this.setText('sr-time', this.formatRunTime(r.t));
    this.setClass($('speedrun'), 'stopped', r.done && !r.record);
    this.setClass($('speedrun'), 'record', r.record);
    const pb = this.stats.bestWinTime;
    this.setClass($('sr-pb'), 'hidden', !pb);
    if (pb) this.setText('sr-pb', `${r.record ? 'New ' : ''}100% best ${this.formatRunTime(pb)}`);
  }

  // The run is over: stop the clock. A full run (from level 1) that wins
  // the game can set a new best 100% time.
  stopTimer(won) {
    const r = this.run;
    if (r.done) return;
    r.running = false;
    r.done = true;
    if (won && r.full && (!this.stats.bestWinTime || r.t < this.stats.bestWinTime)) {
      this.stats.bestWinTime = r.t;
      saveStats(this.stats);
      r.record = true;
    }
  }

  // ---------------------------------------------------------------- ghost
  toggleGhost() {
    this.setGhost(!this.settings.ghost);
    this.toast(this.settings.ghost ? { kicker: 'Ghost guide', title: 'On', sub: 'Race the perfect snake', tone: 'sky' } : { kicker: 'Ghost guide', title: 'Off' });
  }

  setGhost(on) {
    this.settings.ghost = on;
    saveSettings(this.settings);
    // joining mid-run: the ghost starts from the player's current snake
    if (on && ['playing', 'paused', 'countdown'].includes(this.state)) this.ghost.reset(this.state !== 'countdown');
    this.ghostFade = 0;
    const box = $('set-ghost');
    if (box) box.checked = on;
    this.updateGhostUI();
    this.audio.ui();
  }

  updateGhostUI() {
    const on = !!this.settings.ghost;
    $('btn-ghost').classList.toggle('on', on);
    $('btn-ghost-state').textContent = on ? 'On' : 'Off';
    $('hud-ghost-row').classList.toggle('hidden', !on);
  }

  // Runs the ghost bot alongside the player (only while actually playing).
  updateGhost(dt) {
    const v = this.ghostView;
    const inRun = ['playing', 'paused', 'countdown', 'dying', 'over'].includes(this.state);
    // the Galactic Core is a puzzle of its own: no ghost there
    const show = this.settings.ghost && inRun && !this.game.space;
    if (!show) {
      v.group.visible = false;
      return;
    }
    if (this.state === 'playing') {
      for (const ev of this.ghost.update(dt * 1000)) {
        if (ev.respawned) this.ghostFade = 0;
        if (ev.ate) {
          const gh = this.ghost.head;
          const w = this.toWorld(gh.x, gh.z, gh.y);
          this.effects.emit(w.x, w.y + 0.45, w.z, { count: ev.chainComplete ? 30 : 12, color: '#a8f0ff', speed: 1.8, up: 1.6, size: 0.16, life: 0.5 });
        }
      }
    }
    const target = this.state === 'dying' || this.state === 'over' ? 0 : 1;
    this.ghostFade += (target - this.ghostFade) * Math.min(1, dt * 3);
    this.ghostWait += ((this.ghost.paused && this.state === 'playing' ? 1 : 0) - this.ghostWait) * Math.min(1, dt * 4);
    v.group.visible = this.ghostFade > 0.02;
    v.ghostUniforms.uOpacity.value = this.ghostFade;
    v.ghostUniforms.uWait.value = this.ghostWait;
    v.update(this.ghost, clamp01(this.ghost.t), this.simTime, this.toWorld, { dt });
  }

  // ---------------------------------------------------------------- garage
  unlockStats() {
    return { ...this.stats, best: Math.max(this.game ? this.game.best : 0, loadBest()) };
  }

  equippedSkin() {
    const s = skinById(this.settings.skin);
    return isUnlocked(s, this.unlockStats()) ? s.id : 'viper';
  }

  equippedAccessory() {
    const a = accessoryById(this.settings.accessory);
    return isUnlocked(a, this.unlockStats()) ? a.id : 'none';
  }

  openGarage() {
    if (this.state !== 'menu') this.toMenu();
    this.garageOpen = true;
    this.showScreen(null);
    $('garage').classList.remove('hidden');
    this.rig.setMode('showcase', { reduceMotion: this.settings.reduceMotion });
    this.preview = { skin: this.equippedSkin(), accessory: this.equippedAccessory() };
    this.garageFocus = null;
    this.renderGarage();
    this.audio.ui();
  }

  closeGarage() {
    if (!this.garageOpen) return;
    this.garageOpen = false;
    $('garage').classList.add('hidden');
    // anything previewed but locked goes back to what is equipped
    if (this.snake.skin.id !== this.equippedSkin()) this.snake.applySkin(this.equippedSkin());
    if (this.snake.accessoryId !== this.equippedAccessory()) this.snake.setAccessory(this.equippedAccessory());
    this.showScreen('screen-start');
    this.rig.setMode('tour', { reduceMotion: this.settings.reduceMotion });
    $('btn-garage').focus({ preventScroll: true });
  }

  renderGarage() {
    const st = this.unlockStats();
    const item = (it, kind) => {
      const unlocked = isUnlocked(it, st);
      const equipped = kind === 'skin' ? this.equippedSkin() === it.id : this.equippedAccessory() === it.id;
      const previewing = this.preview[kind === 'skin' ? 'skin' : 'accessory'] === it.id;
      const vis = kind === 'skin' ? `<span class="sw" style="background:${it.swatch}"></span>` : `<span class="ic">${it.icon}</span>`;
      return `<button class="gar-item${unlocked ? '' : ' locked'}${equipped ? ' selected' : ''}${previewing && !equipped ? ' previewing' : ''}" data-kind="${kind}" data-id="${it.id}" role="radio" aria-checked="${equipped}" title="${it.name}">${vis}<span>${it.name}</span></button>`;
    };
    $('gar-skins').innerHTML = SKINS.map((it) => item(it, 'skin')).join('');
    $('gar-acc').innerHTML = ACCESSORIES.map((it) => item(it, 'acc')).join('');
    const focus = this.garageFocus || { kind: 'skin', id: this.preview.skin };
    const it = focus.kind === 'skin' ? skinById(focus.id) : accessoryById(focus.id);
    $('gar-name').textContent = it.name;
    $('gar-desc').textContent = it.desc || (it.id === 'none' ? 'No accessory.' : 'A little something for your snake.');
    const locked = !isUnlocked(it, st);
    $('gar-lock').classList.toggle('hidden', !locked);
    if (locked) {
      const prog = unlockProgress(it, st);
      $('gar-lock').textContent = `Locked: ${it.unlock.label}${prog ? ` (${prog})` : ''}`;
    }
  }

  pickGarage(kind, id) {
    const st = this.unlockStats();
    this.garageFocus = { kind, id };
    if (kind === 'skin') {
      this.preview.skin = id;
      this.snake.applySkin(id);
      this.world.space.setSnakeColor(this.snake.trailColor);
      if (isUnlocked(skinById(id), st)) this.settings.skin = id;
    } else {
      this.preview.accessory = id;
      this.snake.setAccessory(id);
      if (isUnlocked(accessoryById(id), st)) this.settings.accessory = id;
    }
    saveSettings(this.settings);
    this.audio.ui();
    this.renderGarage();
  }

  // Lifetime stats after a run; returns names of anything newly unlocked.
  recordRun() {
    const g = this.game;
    const before = this.unlockStats();
    const st = this.stats;
    st.games += 1;
    st.apples += g.foodEaten;
    st.mice += g.stats.prey;
    st.chains += g.stats.chains;
    st.pads += g.stats.pads;
    st.maxZone = Math.max(st.maxZone, g.zone);
    st.maxLevel = Math.max(st.maxLevel || 0, g.level);
    if (g.won && g.space) st.wins = (st.wins || 0) + 1;
    saveStats(st);
    const after = this.unlockStats();
    return [...SKINS, ...ACCESSORIES].filter((it) => it.unlock && !isUnlocked(it, before) && isUnlocked(it, after)).map((it) => it.name);
  }

  // A ring of sparks runs along the new walls as the board widens.
  onBoardResized(size) {
    if (this.state === 'menu' || this.settings.reduceMotion) return;
    const h = size / 2 + 0.2;
    const col = '#' + this.world.p.strip.getHexString();
    for (let i = 0; i < 28; i++) {
      const t = (i / 28) * 4;
      const side = Math.floor(t);
      const u = (t - side) * 2 - 1;
      const x = side === 0 ? u * h : side === 1 ? h : side === 2 ? -u * h : -h;
      const z = side === 0 ? -h : side === 1 ? u * h : side === 2 ? h : -u * h;
      this.effects.emit(x, 0.6, z, { count: 3, color: col, speed: 1.4, up: 2.4, size: 0.2, life: 0.7 });
    }
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.maxPR);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.rig.fitOverhead(w / h);
    this.measureLens();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post.scale = this.dyn.scale;
    this.post.setSize(size.x, size.y);
  }

  // ---------------------------------------------------------------- input
  // Chase / first-person steer relative to the snake; so does all flight.
  get relativeSteer() {
    return this.cameraMode === 'fp' || this.cameraMode === 'tp' || this.game.flying;
  }

  onDirection(dir, src) {
    if (this.state === 'menu' && !this.openPanel && !this.garageOpen && (dir === 'left' || dir === 'right')) {
      this.stepStartLevel(dir === 'left' ? -1 : 1);
      return;
    }
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.preAim();
    if (this.game.flying) {
      // Flight: left/right turn, up/down climb and dive (or level out).
      if (dir === 'left' || dir === 'right') this.steer(this.game.turnDir(dir === 'left' ? -1 : 1));
      else this.steer(this.game.pitchDir(dir === 'up'));
    } else if (this.relativeSteer) {
      // In chase / first person, left/right steer relative to the snake.
      if (dir === 'left' || dir === 'right') this.steer(this.game.turnDir(dir === 'left' ? -1 : 1));
      else if (src !== 'swipe') this.flashHint();
    } else {
      this.steer(DIRS[dir]);
    }
  }

  onTurn(side) {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.preAim();
    this.steer(this.game.turnDir(side));
  }

  onPitch(up) {
    if ((this.state !== 'playing' && this.state !== 'countdown') || !this.game.flying) return;
    this.preAim();
    this.steer(this.game.pitchDir(up));
  }

  // During the READY/GO countdown only one turn is kept (the latest press,
  // relative to the starting heading), so mashing keys can't stack up moves
  // that all fire the moment the run starts.
  preAim() {
    if (this.state === 'countdown') this.game.queue.length = 0;
  }

  // Apply a direction as early as possible: within the grace window right
  // after a straight step, redo that step in the new direction; otherwise
  // queue it for the next step.
  steer(d) {
    const g = this.game;
    if (!d) return;
    if (this.state === 'playing' && this.t < GRACE && g.canRegrace()) {
      const wasRushing = g.rushing;
      const ev = g.regrace(d);
      if (ev) {
        this.audio.turn();
        this.handleStep(ev, wasRushing);
        return;
      }
    }
    if (g.queueDirection(d)) this.audio.turn();
  }



  onTap(side) {
    if (this.relativeSteer) this.onTurn(side === 'left' ? -1 : 1);
  }

  onConfirm(kind) {
    this.unlockAudio();
    if (this.garageOpen) {
      if (kind !== 'space') this.closeGarage();
      return true;
    }
    if (this.openPanel) return kind !== 'space' ? (this.closePanel(), true) : false;
    if (this.state === 'menu' || this.state === 'over') {
      // the card comes up fast: a key still held from the crash (rush, a
      // turn's Enter) mustn't restart the run before it's even seen
      if (this.state === 'over' && performance.now() - (this.overAt || 0) < 300) return true;
      this.startGame();
      return true;
    }
    if (this.state === 'paused' && kind !== 'space') {
      this.resume();
      return true;
    }
    return false;
  }

  onPause() {
    if (this.garageOpen) {
      this.closeGarage();
      return;
    }
    if (this.openPanel) {
      this.closePanel();
      return;
    }
    if (this.state === 'playing' || this.state === 'countdown') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  onRestart() {
    if (this.openPanel || this.garageOpen) return;
    if (['playing', 'paused', 'over', 'dying', 'countdown', 'cine'].includes(this.state)) this.startGame();
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.audio.setVolumes({ muted: this.settings.muted });
    saveSettings(this.settings);
    this.toast({ kicker: 'Sound', title: this.settings.muted ? 'Muted' : 'On' });
  }

  unlockAudio() {
    this.audio.unlock();
    // (the title music starts with the first gesture that unlocks sound, and
    // again if something stopped it while the menu was up)
    if (this.audio.ctx && this.state === 'menu' && !this.audio.musicOn) this.audio.startMusic({ menu: true });
  }

  cycleCamera() {
    if (this.garageOpen) return;
    const i = CAMERA_ORDER.indexOf(this.cameraMode);
    this.setCamera(CAMERA_ORDER[(i + 1) % CAMERA_ORDER.length]);
  }

  setCamera(mode) {
    const roast = mode === 'overhead' && this.cameraMode !== 'overhead';
    this.cameraMode = mode;
    if (roast) {
      // a new line each time, never the same one twice in a row
      let i = Math.floor(Math.random() * (OVERHEAD_ROASTS.length - 1));
      if (i >= (this.roastIndex ?? -1)) i++;
      this.roastIndex = i % OVERHEAD_ROASTS.length;
      if (this.state !== 'menu') this.toast({ kicker: 'Overhead view', title: OVERHEAD_ROASTS[this.roastIndex], tone: 'quip', ms: 3200 });
    }
    this.settings.camera = mode;
    saveSettings(this.settings);
    if (['playing', 'paused', 'countdown'].includes(this.state)) {
      this.rig.setMode(mode, { reduceMotion: this.settings.reduceMotion });
      if (this.relativeSteer) this.flashHint();
    }
    this.updateCameraUI();
    this.audio.ui();
  }

  flashHint() {
    const el = $('fp-hint');
    el.textContent = this.game.flying ? '↑ climb  ·  ↓ dive  ·  ← → turn' : '← → turn';
    el.classList.add('hidden');
    void el.offsetWidth;
    if (this.state === 'playing' || this.state === 'countdown') el.classList.remove('hidden');
  }

  // ---------------------------------------------------------------- flow
  startGame() {
    if (this.garageOpen) {
      this.garageOpen = false;
      $('garage').classList.add('hidden');
    }
    this.unlockAudio();
    this.audio.start();
    this.timers = [];
    this.galaxy.clear();
    this.world.space.setWon(false);
    this.world.space.reset();
    this.world.space.setSnakeColor(this.snake.trailColor);
    this.voidFall = null;
    this.deathOrbit = false;
    this.snake.group.visible = true;
    this.game.reset();
    this.game.wantRush = this.input.rushKeys.size > 0;
    this.t = 0;
    this.lunge = 0;
    this.deathFlash = 0;
    this.crash = null;
    this.food.hideAll();
    this.board.clear();
    this.syncFood();
    const startLevel = this.startLevel();
    this.game.startAtLevel(startLevel);
    if (this.playtest && this.playtest.length > this.game.cells.length) this.game.coilTo(this.playtest.length);
    this.run = { t: 0, running: false, done: false, full: startLevel === 0 && !this.playtest, record: false };
    this.ghost.reset(true);
    this.ghostFade = 0;
    const zone = this.game.zone;
    if (this.world.zone !== zone || this.world.transitioning) this.world.setZone(zone, { duration: 1.4 });
    this.audio.setMusicState({ menu: false, zone, level: startLevel, intensity: 0.1 });
    this.audio.startMusic({ menu: false });
    this.showScreen(null);
    $('hud').classList.remove('hidden');
    this.rig.cine = null;
    this.rig.setMode(this.cameraMode, { reduceMotion: this.settings.reduceMotion });
    this.state = 'countdown';
    this.updateCameraUI();
    this.protectUntil = this.simTime + 4;
    this.countdown = this.settings.reduceMotion ? 0.9 : 1.2;
    this.showCountdown('READY');
    this.audio.countdown(false);
    this.saidGo = false;
    if (this.relativeSteer) this.flashHint();
    if (this.game.flying) this.toast(FLY_TOAST);
    if (this.game.space) this.toast(CORE_TOAST);
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.prevState = this.state;
    this.state = 'paused';
    this.showScreen('screen-pause');
    this.audio.setPaused(true);
    $('countdown').classList.add('hidden');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.unlockAudio();
    this.audio.setPaused(false);
    this.showScreen(null);
    this.state = 'countdown';
    this.countdown = 0.6;
    this.saidGo = false;
    this.showCountdown('GO');
  }

  toMenu() {
    this.state = 'menu';
    this.galaxy.clear();
    this.world.space.reset();
    this.world.space.setWon(this.stats.wins > 0);
    this.updateWinBadge();
    this.audio.setPaused(false);
    this.audio.setMusicState({ menu: true, intensity: 0 }); // the tour's map picks the song each frame
    this.audio.startMusic({ menu: true });
    this.timers = [];
    this.game.reset();
    this.t = 0;
    this.lunge = 0;
    this.deathFlash = 0;
    this.crash = null;
    this.food.hideAll();
    this.board.clear();
    this.syncFood();
    // the tour carries on from the map the run ended on
    this.showZoneInTour(this.tourZone());
    this.demoZone = null;
    $('hud').classList.add('hidden');
    // the play aids live outside #hud and updateHud doesn't run on the title
    // screen, so leaving from the pause menu would strand them on it
    this.setClass($('app'), 'view-aids', false);
    for (const id of ['compass', 'minimap', 'alt', 'touch', 'fp-hint']) this.setClass($(id), 'hidden', true);
    this.rig.setMode('tour', { reduceMotion: this.settings.reduceMotion });
    this.showScreen('screen-start');
    this.updateCameraUI();
    this.renderLevelSelect();
  }

  showCountdown(text) {
    const el = $('countdown');
    el.innerHTML = `<span>${text}</span>`;
    el.classList.remove('hidden');
  }

  later(seconds, fn) {
    this.timers.push({ at: this.simTime + seconds, fn });
  }

  // Delay from a logical event to the drawn head reaching that cell.
  visualDelay() {
    return (0.55 * this.game.currentInterval()) / 1000;
  }

  // ---------------------------------------------------------------- game events
  tick() {
    const g = this.game;
    const wasRushing = g.rushing;
    // remember the sky pose: hyperspeed charges up there before the jump
    if (g.flying) this.preWarpSnap = { cells: g.cells.slice(), removedTail: g.removedTail, yMid: g.yMid, size: g.size, facing: { ...g.facing }, ticks: g.ticks };
    if (this.playtest && this.playtest.bot) {
      // playtest: the autoplay drives (the Galactic Core has its own)
      g.queue.length = 0;
      if (g.space) {
        const d = g.corePlan();
        if (d) g.queueDirection(d);
      } else {
        const bot = this.playBot || (this.playBot = new GhostBot(g));
        bot.reset(true);
        bot.pendingGrowth = g.pendingGrowth;
        bot.rush = g.rush;
        bot.time = g.time;
        const plan = bot.decide();
        if (plan.dir) g.queueDirection(plan.dir);
        g.wantRush = !!plan.rush;
      }
    }
    this.handleStep(g.step(), wasRushing);
  }


  handleStep(ev, wasRushing) {
    const g = this.game;
    const delay = this.visualDelay();
    const rm = this.settings.reduceMotion;
    const at = (c) => this.toWorld(c.x, c.z, c.y);

    if (ev.levelUp && ev.levelUp.warp) {
      // the last Sunset apple: straight into hyperspeed
      this.onLevelUp(ev.levelUp);
      this.galaxy.startWarp();
      this.syncFood();
      return;
    }
    if (ev.ate) this.onEat(ev.ate, ev.levelUp);
    if (ev.doomed) {
      this.audio.doomWarn(ev.doomed.length);
      if (!this.collapseTold) {
        this.collapseTold = true;
        this.later(0.3, () => this.toast({ title: 'The edge is crumbling', sub: 'Glowing cells fall in next', tone: 'danger' }));
      }
    }
    if (ev.fell) this.audio.suckIn(ev.fell.length);
    if (ev.calm) {
      // the last stretch: a shockwave from the black hole, and it slows down
      this.world.space.pulse();
      this.audio.calm();
      this.banner('Slow down', 'Last stretch');
      this.slowMo(1.4, 0.45);
      if (!this.settings.reduceMotion) {
        this.flash(0.4, '#bfe6ff');
        this.rig.shake += 0.25;
        this.rig.kick -= 6;
      }
    }
    if (ev.appleMoved) {
      // an apple no one could safely reach: the black hole pulls it in as light
      const f = ev.appleMoved.from;
      const sp = this.world.space;
      sp.emitStreams(sp.cellPos(f.x, f.z, new THREE.Vector3()), 40, '#ff4d6d', { spread: 0.3, over: 0.25 });
      this.audio.suckIn(2);
      if (!this.appleMovedTold) {
        this.appleMovedTold = true;
        this.later(0.2, () => this.toast({ title: 'Apple swallowed', sub: 'It was out of reach, so a new one spawned', tone: 'danger' }));
      }
    }
    if (ev.bonusSpawned) this.toast({ kicker: '+50 · 9 seconds', title: 'Prism!', tone: 'prism' });
    if (ev.bonusExpired) {
      const w = at(ev.bonusExpired);
      this.effects.emit(w.x, w.y + 0.5, w.z, { count: 20, color: '#c77dff', speed: 1.5, up: 1, life: 0.6 });
    }
    if (ev.chainSpawned) {
      this.toast({ kicker: 'Eat them 1, 2, 3…', title: 'Orb chain!', tone: 'chain' });
      this.audio.chainLink(0);
      for (const l of ev.chainSpawned.links) {
        const w = at(l);
        this.effects.emit(w.x, w.y + 0.4, w.z, { count: 10, color: '#38f6ff', speed: 1.2, up: 2, size: 0.18, life: 0.6 });
      }
    }
    if (ev.chainLink) {
      const c = ev.chainLink;
      this.later(delay, () => {
        const w = at(c);
        this.effects.emit(w.x, w.y + 0.5, w.z, { count: 26, color: '#38f6ff', speed: 3, up: 2.2, size: 0.22 });
        this.effects.shockwave(w.x, w.z, '#38f6ff', { y: w.y, max: 2.2, dur: 0.4 });
        this.popup(new THREE.Vector3(w.x, w.y, w.z), `+${c.points}`, 'chain', `${c.index + 1}/${c.of}`);
        this.audio.chainLink(c.index + 1);
      });
    }
    if (ev.chainComplete) {
      const c = ev.chainComplete;
      this.later(delay + 0.05, () => {
        const w = at(c);
        this.popup(new THREE.Vector3(w.x, w.y + 0.6, w.z), `+${c.bonus}`, 'chain big', 'chain');
        this.effects.emit(w.x, w.y + 0.6, w.z, { count: 80, color: '#7ff8ff', speed: 5, up: 3, size: 0.3 });
        this.effects.shockwave(w.x, w.z, '#38f6ff', { y: w.y, max: 6, dur: 0.7 });
        this.audio.chainComplete();
        this.banner('Chain complete', 'Rush full');
        if (!rm) {
          this.flash(0.22, '#9ff8ff');
          this.rig.kick += 6;
        }
      });
    }
    if (ev.chainBroken) {
      this.toast({ title: 'Chain broken', sub: 'Wrong order', tone: 'danger' });
      this.audio.chainBroken();
    }
    if (ev.chainExpired) this.toast({ title: 'Chain faded', tone: 'chain' });
    if (ev.preySpawned) {
      this.toast({ kicker: 'Corner it · +100', title: 'Golden mouse!', tone: 'gold' });
      this.audio.preySpotted();
      const w = at(ev.preySpawned);
      this.effects.emit(w.x, w.y + 0.2, w.z, { count: 24, color: '#d8c49a', speed: 1.6, up: 1.5, size: 0.2, life: 0.7 });
    }
    if (ev.caught) {
      const c = ev.caught;
      this.later(delay, () => {
        const w = at(c);
        this.popup(new THREE.Vector3(w.x, w.y, w.z), `+${c.points}`, 'prey', c.combo > 1 ? `×${c.combo}` : '');
        this.effects.emit(w.x, w.y + 0.4, w.z, { count: 60, color: '#ffd36a', speed: 4, up: 3, size: 0.28 });
        this.effects.shockwave(w.x, w.z, '#ffd36a', { y: w.y, max: 4, dur: 0.55 });
        this.audio.preyCaught();
        if (!rm) {
          this.flash(0.15, '#fff2b0');
          this.rig.kick += 4;
        }
      });
    }
    if (ev.preyEscaped) {
      this.toast({ title: 'It got away', tone: 'gold' });
      this.audio.preyEscaped();
      const w = at(ev.preyEscaped);
      this.effects.emit(w.x, w.y + 0.15, w.z, { count: 30, color: '#b8a888', speed: 2, up: 1.2, size: 0.22, life: 0.6 });
    }
    if (ev.boost) {
      this.later(delay * 0.8, () => {
        const w = at(ev.boost);
        this.audio.boost();
        this.popup(new THREE.Vector3(w.x, w.y, w.z), 'Boost!', 'boost');
        this.effects.emit(w.x, w.y + 0.2, w.z, { count: 40, color: '#ffb020', speed: 3.5, up: 1.2, size: 0.24, life: 0.5 });
        if (!rm) this.rig.kick += 8;
      });
    }
    if (ev.obstaclesWarned) {
      this.audio.obstacleWarn();
      this.toast({ title: 'Pillars incoming', sub: 'Steer clear of the red rings', tone: 'danger' });
    }
    if (ev.obstaclesRaised) {
      this.audio.obstacleRise();
      for (const o of ev.obstaclesRaised) {
        const w = at(o);
        this.effects.emit(w.x, w.y + 0.1, w.z, { count: 26, color: '#c8b8a0', speed: 2.4, up: 1.6, size: 0.24, life: 0.6 });
        this.effects.shockwave(w.x, w.z, '#ff8a5c', { y: w.y, max: 1.6, dur: 0.35 });
      }
      if (!rm) this.rig.shake += 0.08;
    }
    if (ev.padsSpawned) {
      for (const p of ev.padsSpawned) {
        const w = at(p);
        this.effects.emit(w.x, w.y + 0.1, w.z, { count: 14, color: '#ffd23f', speed: 1.2, up: 1.4, size: 0.18, life: 0.5 });
      }
    }
    if (ev.died) {
      this.onDeath(ev);
      return;
    }
    if (g.rushing && !wasRushing) {
      this.audio.rushStart();
      this.rig.kick += 6;
    }
    this.syncFood();
  }

  syncFood() {
    this.food.sync(this.game, this.toWorld);
  }

  onEat(ate, levelUp) {
    const g = this.game;
    const w = this.toWorld(ate.x, ate.z, ate.y);
    const pos = new THREE.Vector3(w.x, w.y, w.z);
    const delay = this.visualDelay();
    this.food.markEaten(ate.type, pos, delay);
    const prism = ate.type === 'prism';
    this.later(delay, () => {
      const rm = this.settings.reduceMotion;
      this.effects.emit(w.x, w.y + 0.45, w.z, {
        count: prism ? 70 : 34,
        color: prism ? '#e0aaff' : '#ff4d6d',
        speed: prism ? 4.5 : 3.2,
        up: 2.4,
        size: prism ? 0.32 : 0.24,
      });
      this.effects.emit(w.x, w.y + 0.45, w.z, { count: 14, color: '#ffffff', speed: 1.5, up: 3.5, size: 0.14, life: 0.5 });
      this.effects.shockwave(w.x, w.z, prism ? '#c77dff' : '#ff5a7a', { y: w.y, max: prism ? 4.5 : 2.6 });
      this.popup(pos, `+${ate.points}`, prism ? 'prism' : '', ate.combo > 1 ? `×${ate.combo}` : '');
      const v = pos.clone().project(this.camera);
      if (prism) {
        this.audio.prism();
        if (!rm) this.flash(0.22, '#f0d8ff');
      } else this.audio.eat(ate.combo, THREE.MathUtils.clamp(v.x, -0.8, 0.8));
      if (!rm) this.rig.kick += prism ? 5 : 2.5;
      if (this.cameraMode !== 'fp') this.rig.shake += prism ? 0.08 : 0.03;
    });
    if (ate.combo > 1) {
      const el = $('hud-combo');
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
    if (levelUp) {
      this.later(delay, () => this.onLevelUp(levelUp));
    }
  }

  onLevelUp(lu) {
    // unlock the level for the level select right away (zone-based garage
    // unlocks are still tallied at the end of the run, where they're announced)
    if (lu.level > (this.stats.maxLevel || 0)) {
      this.stats.maxLevel = lu.level;
      saveStats(this.stats);
    }
    if (lu.warp) return; // the hyperspeed cinematic takes it from here
    const lv = $('hud-lvl');
    lv.classList.remove('bump');
    void lv.offsetWidth;
    lv.classList.add('bump');
    const hp = this.snake.headPos;
    this.world.pulse(hp.x, hp.z);
    this.protectUntil = this.simTime + (lu.zoneUp ? 5 : 1.5);
    if (lu.liftoff) {
      // Sunset Heavens: jetpack on, the island falls away into the clouds
      this.world.setZone(lu.zone, { duration: 4 });
      this.audio.zoneUp();
      this.audio.liftoff();
      this.titleCard(lu.zone);
      // the snake flips up and rockets a few layers by itself while the
      // camera pulls out and circles it, then control comes back
      this.slowMo(3.4, 0.3);
      this.protectUntil = this.simTime + 6;
      if (!this.settings.reduceMotion) this.rig.startCinematic(3.8);
      this.later(1.6, () => {
        this.toast(FLY_TOAST);
        this.flashHint();
      });
      const s = this.snake;
      for (const p of s.nozzleWorld) this.effects.emit(p.x, p.y, p.z, { count: 40, color: '#ffb347', speed: 3, up: 1, size: 0.26, life: 0.7, gravity: 1 });
      if (!this.settings.reduceMotion) {
        this.flash(0.45, '#ffd0a0');
        this.rig.kick += 12;
        this.rig.shake += 0.15;
      }
    } else if (lu.zoneUp) {
      this.world.setZone(lu.zone);
      this.audio.zoneUp();
      this.titleCard(lu.zone);
      this.slowMo(2.5, 0.28);
      if (!this.settings.reduceMotion) {
        this.flash(0.35, '#ffffff');
        this.rig.kick += 10;
      }
    } else {
      this.audio.levelUp();
      this.banner(lu.level >= MAX_LEVEL ? 'Top speed' : 'Speed up', `Level ${lu.level + 1}`);
      this.slowMo(1.1, 0.6);
      if (!this.settings.reduceMotion) this.rig.kick += 4;
    }
  }

  onDeath(ev) {
    const g = this.game;
    if (ev.cause === 'win' && g.space) {
      // every cell left is snake: it all goes into the black hole, and the galaxy goes off
      this.stopTimer(true);
      saveBest(g.best);
      this.galaxy.startFinale();
      return;
    }
    this.state = 'dying';
    this.stopTimer(false);
    this.t = 1; // the failed move never happened: hold the last pose
    this.dyingTime = 0;
    this.audio.death();
    this.audio.stopMusic({ fade: 1.0 });
    saveBest(g.best);
    const hp = this.snake.headPos;
    const won = ev.cause === 'win';
    // A crash: the head lunges into what it hit, bounces off and sees stars,
    // and the cell it hit is marked so you can see what happened.
    // (off the edge of the Galactic Core there's nothing to bump into: it falls)
    this.crash = ev.hit && !won && ev.cause !== 'void' ? { hit: ev.hit, cause: ev.cause } : null;
    if (this.crash) {
      const w = this.toWorld(ev.hit.x, ev.hit.z, ev.hit.y);
      const hy = (w.y || 0) + 0.3;
      this.later(CRASH_HIT, () => {
        const hd = this.snake.headDir;
        const front = this.snake.headPos.clone().addScaledVector(hd, 0.55);
        this.effects.emit(front.x, front.y + 0.4, front.z, { count: 26, color: '#ffffff', speed: 3.2, up: 1.5, size: 0.16, life: 0.4, gravity: 2 });
        this.popup(front, 'Bonk!', 'bonk');
        if (ev.cause !== 'wall' && ev.cause !== 'laser') this.effects.shockwave(w.x, w.z, '#ffd23f', { max: 1.4, dur: 0.45, y: hy });
      });
      // once the camera has pulled back, point at the crash again
      this.later(0.9, () => this.effects.shockwave(w.x, w.z, '#ff3b5c', { max: 2.2, dur: 0.7, y: hy }));
    }
    if (ev.cause === 'void') {
      // over the edge: the snake slides off and the black hole pulls it
      // down, spiralling, shedding light as it goes
      this.startVoidFall(ev.hit);
      this.audio.suckIn(3);
    }
    this.later(this.crash ? 0.16 : 0.08, () => {
      if (ev.cause === 'void') {
        // no impact to show: just a cold flash as it goes over
        if (!this.settings.reduceMotion) this.flash(0.2, '#9fd0ff');
        return;
      }
      const hd = this.snake.headDir;
      this.effects.emit(hp.x + hd.x * 0.4, hp.y + hd.y * 0.4 + 0.4, hp.z + hd.z * 0.4, {
        count: 60,
        color: won ? '#7dffb0' : '#ff5470',
        speed: 4,
        up: 3,
        size: 0.28,
      });
      this.effects.shockwave(hp.x, hp.z, won ? '#7dffb0' : '#ff3b5c', { max: 5, dur: 0.6, y: hp.y });
      this.deathFlash = 1;
      if (!this.settings.reduceMotion) {
        this.flash(0.25, won ? '#ffffff' : '#ff8090');
        this.rig.shake += 0.25;
      }
    });
    // Pull back and circle the board so the player can see what happened. In
    // the Galactic Core the camera rises and circles the black hole instead,
    // watching the snake go in.
    // Off the edge, it first rides the snake down until the head goes in.
    if (ev.cause === 'void') this.later(0.1, () => this.startDeathFollow());
    else if (g.space) this.later(0.55, () => this.startDeathOrbit());
    else this.later(0.55, () => this.startDeathCircle());
    // the card (and Play again) comes up straight away; the camera carries
    // on behind it
    this.later(0.45, () => this.showGameOver(ev.cause));
  }

  // Death lunge for a crash, in cells past the last pose: a fast shove into
  // the obstacle, then a bounce back that settles a little short of it.
  crashLunge(t) {
    // block skins already fill their cell, so they only nudge in before bouncing
    const into = this.snake.block ? 0.12 : this.crash.cause === 'wall' || this.crash.cause === 'laser' ? 0.16 : 0.32;
    if (t < CRASH_HIT) return into * Math.pow(t / CRASH_HIT, 2);
    const k = t - CRASH_HIT;
    return 0.04 + (into - 0.04) * Math.exp(-k * 9) * Math.cos(k * 14);
  }

  rank(score) {
    return score >= 6000 ? 'S' : score >= 3000 ? 'A' : score >= 1400 ? 'B' : score >= 500 ? 'C' : 'D';
  }

  showGameOver(cause) {
    const g = this.game;
    this.state = 'over';
    this.overAt = performance.now();
    const unlocked = this.recordRun();
    $('over-unlocks').classList.toggle('hidden', !unlocked.length);
    if (unlocked.length) {
      $('over-unlocks').textContent = `Unlocked in the Garage: ${unlocked.join(', ')}!`;
      this.audio.chainComplete();
    }
    this.audio.gameOver();
    const galaxyWon = cause === 'win' && g.space;
    $('over-title').textContent = galaxyWon ? 'Galaxy complete!' : cause === 'win' ? 'Perfect board!' : 'Wipeout!';
    $('over-cause').textContent = galaxyWon
      ? 'You filled every cell the black hole left, then it swallowed you whole, and the whole galaxy went supernova. You beat Snake Rush: 100%.'
      : {
        wall: 'You crashed into the wall.',
        void: 'You slid off the edge and fell into the black hole.',
        body: 'You ran into your own body.',
        obstacle: 'You smashed into a pillar.',
        laser: 'You flew into the laser fence.',
        win: 'You filled the entire board!',
      }[cause];
    if (galaxyWon) {
      const r = this.run;
      const time = this.formatRunTime(r.t);
      $('over-cause').textContent += r.full ? ` Run time ${time}${r.record ? ': a new 100% record!' : '.'}` : ` Run time ${time} (from level ${this.startLevel() + 1}; start at level 1 to set a 100% record).`;
    }
    $('screen-over').classList.toggle('won', galaxyWon);
    $('over-stamp').classList.toggle('hidden', !galaxyWon);
    if (galaxyWon) this.updateWinBadge();
    // beating the game outranks any score
    const rank = galaxyWon ? 'S' : this.rank(g.score);
    const rk = $('over-rank');
    rk.textContent = galaxyWon ? '★' : rank;
    rk.className = `rank ${rank}`;
    $('over-score').textContent = g.score.toLocaleString();
    $('over-best').textContent = g.best.toLocaleString();
    $('over-length').textContent = g.cells.length;
    $('over-combo').textContent = `x${g.maxCombo}`;
    $('over-time').textContent = this.formatTime(g.time);
    $('over-zone').textContent = g.space ? `${g.zone + 1} · ${Math.floor(g.fill * 100)}%` : String(g.zone + 1);
    $('over-chains').textContent = String(g.stats.chains);
    $('over-prey').textContent = String(g.stats.prey);
    $('over-pads').textContent = String(g.stats.pads);
    $('over-newbest').classList.toggle('hidden', !(g.newBest && g.score > 0));
    $('start-best').textContent = g.best.toLocaleString();
    this.showScreen('screen-over');
    $('btn-again').focus({ preventScroll: true });
  }

  formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------- UI
  bindUI() {
    $('btn-play').addEventListener('click', () => this.startGame());
    $('btn-again').addEventListener('click', () => this.startGame());
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-restart-p').addEventListener('click', () => this.startGame());
    $('btn-menu-p').addEventListener('click', () => this.toMenu());
    $('btn-menu-o').addEventListener('click', () => this.toMenu());
    $('btn-pause').addEventListener('click', () => this.onPause());
    $('btn-cam').addEventListener('click', () => this.cycleCamera());
    $('btn-garage').addEventListener('click', () => this.openGarage());
    $('btn-garage-o').addEventListener('click', () => this.openGarage());
    $('gar-done').addEventListener('click', () => this.closeGarage());
    for (const id of ['gar-skins', 'gar-acc']) {
      $(id).addEventListener('click', (e) => {
        const b = e.target.closest('.gar-item');
        if (b) this.pickGarage(b.dataset.kind, b.dataset.id);
      });
    }
    document.querySelectorAll('.cam-select .seg').forEach((b) => b.addEventListener('click', () => this.setCamera(b.dataset.cam)));
    document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => this.openPanelById(`panel-${b.dataset.open}`)));
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closePanel()));
    $('start-best').textContent = this.game.best.toLocaleString();

    const s = this.settings;
    const qBtns = document.querySelectorAll('#set-quality .seg');
    const markQ = () => qBtns.forEach((b) => b.classList.toggle('active', b.dataset.v === s.quality));
    qBtns.forEach((b) =>
      b.addEventListener('click', () => {
        s.quality = b.dataset.v;
        this.activeQuality = s.quality === 'auto' ? (this.isTouch ? 'medium' : 'high') : s.quality;
        saveSettings(s);
        markQ();
        this.applyQuality();
      })
    );
    markQ();
    const bindCheck = (id, key, after) => {
      const el = $(id);
      el.checked = !!s[key];
      el.addEventListener('change', () => {
        s[key] = el.checked;
        saveSettings(s);
        after && after();
      });
    };
    bindCheck('set-motion', 'reduceMotion', () => this.applyMotion());
    bindCheck('set-guide', 'guide');
    bindCheck('set-minimap', 'minimap');
    bindCheck('set-fps', 'showFps', () => $('fps').classList.toggle('hidden', !s.showFps));
    bindCheck('set-timer', 'timer');
    $('set-ghost').checked = !!s.ghost;
    $('set-ghost').addEventListener('change', () => this.setGhost($('set-ghost').checked));
    $('btn-ghost').addEventListener('click', () => this.toggleGhost());
    $('lvl-prev').addEventListener('click', () => this.stepStartLevel(-1));
    $('lvl-next').addEventListener('click', () => this.stepStartLevel(1));
    $('ms-tiles').addEventListener('click', (e) => {
      const t = e.target.closest('.ms-tile');
      if (t) this.pickMap(Number(t.dataset.zone));
    });
    this.renderLevelSelect();
    this.updateGhostUI();
    const bindRange = (id, key) => {
      const el = $(id);
      el.value = s[key];
      el.addEventListener('input', () => {
        s[key] = Number(el.value);
        this.audio.setVolumes({ sfx: s.sfx, music: s.music });
        saveSettings(s);
      });
      el.addEventListener('change', () => {
        this.unlockAudio();
        if (key === 'sfx') this.audio.eat(1);
      });
    };
    bindRange('set-sfx', 'sfx');
    bindRange('set-music', 'music');
    $('fps').classList.toggle('hidden', !s.showFps);
    this.applyMotion();

    // Interaction anywhere unlocks audio (and starts the menu music). Not
    // just the first one: browsers ignore some gestures (Esc, a modifier key
    // still held from a reload) and can suspend sound later (an audio device
    // change, Safari interruptions), so every gesture checks it's running.
    const unlock = () => this.unlockAudio();
    for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend']) window.addEventListener(ev, unlock, true);
  }

  applyMotion() {
    document.body.classList.toggle('reduce-motion', this.settings.reduceMotion);
    this.snake.wiggle = this.settings.reduceMotion ? 0.4 : 1;
  }

  openPanelById(id) {
    this.openPanel = id;
    $(id).classList.remove('hidden');
    $(id).querySelector('button')?.focus({ preventScroll: true });
    this.audio.ui();
  }

  closePanel() {
    if (!this.openPanel) return;
    $(this.openPanel).classList.add('hidden');
    this.openPanel = null;
  }

  showScreen(id) {
    for (const s of ['screen-start', 'screen-pause', 'screen-over']) $(s).classList.toggle('hidden', s !== id);
    this.closePanel();
    if (id === 'screen-start') this.measureLens();
  }

  updateCameraUI() {
    $('hud-cam').textContent = CAMERA_NAMES[this.cameraMode];
    const roast = $('cam-roast');
    const overhead = this.cameraMode === 'overhead';
    roast.classList.toggle('hidden', !overhead);
    if (overhead) {
      if (this.roastIndex == null) this.roastIndex = Math.floor(Math.random() * OVERHEAD_ROASTS.length);
      if (roast.textContent !== OVERHEAD_ROASTS[this.roastIndex]) {
        roast.textContent = OVERHEAD_ROASTS[this.roastIndex];
        roast.classList.remove('pop');
        void roast.offsetWidth;
        roast.classList.add('pop');
      }
    }
    document.querySelectorAll('.cam-select .seg').forEach((b) => {
      const on = b.dataset.cam === this.cameraMode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on);
    });
  }

  // A gold "100%" next to Best once the galaxy has been finished.
  // On the title screen the little note next to the song name bops to the
  // beat and throws off colourful notes.
  startNoteFountain() {
    const NOTE_COLORS = ['#ff5d8f', '#ffd23f', '#38f6ff', '#7dffb0', '#c77dff', '#ff9a3c'];
    const GLYPHS = [
      '<svg viewBox="0 0 16 20"><path d="M7 2v11.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M7 2c2 3 6 3 6 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="4.6" cy="14.6" rx="3.6" ry="2.8" transform="rotate(-20 4.6 14.6)" fill="currentColor"/></svg>',
      '<svg viewBox="0 0 22 20"><path d="M7 14V3.6l12-2.2V12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><ellipse cx="4.4" cy="14.6" rx="3.4" ry="2.6" transform="rotate(-20 4.4 14.6)" fill="currentColor"/><ellipse cx="16.4" cy="12.6" rx="3.4" ry="2.6" transform="rotate(-20 16.4 12.6)" fill="currentColor"/></svg>',
    ];
    let n = 0;
    setInterval(() => {
      if (document.hidden || this.settings.reduceMotion || this.settings.muted || this.audio.ctx?.state !== 'running') return;
      const toast = $('toast');
      let host = null;
      if (toast.classList.contains('show') && toast.classList.contains('tone-music')) host = $('t-note');
      else if (this.state === 'menu' && !$('ns-track').classList.contains('hidden')) host = $('ns-note');
      if (!host) return;
      const el = document.createElement('i');
      el.className = 'ns-pop';
      el.innerHTML = GLYPHS[n % 2];
      const ang = -Math.PI / 2 + (Math.random() - 0.62) * 1.6; // up, leaning left, away from the screen edge
      const dist = 34 + Math.random() * 26;
      el.style.setProperty('--dx', `${(Math.cos(ang) * dist).toFixed(1)}px`);
      el.style.setProperty('--dy', `${(Math.sin(ang) * dist).toFixed(1)}px`);
      el.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 70)}deg`);
      el.style.setProperty('--s', (0.8 + Math.random() * 0.5).toFixed(2));
      el.style.color = NOTE_COLORS[n++ % NOTE_COLORS.length];
      el.addEventListener('animationend', () => el.remove());
      host.appendChild(el);
    }, 360);
  }

  updateWinBadge() {
    const el = $('win-badge');
    if (!el) return;
    const n = this.stats.wins || 0;
    el.classList.toggle('hidden', n < 1);
    el.title = n > 1 ? `Galaxy finished ${n} times` : 'You finished the galaxy';
  }

  // Callouts: a short headline, with an optional kicker above it and a line
  // below, tinted by tone (info, music, prism, chain, gold, danger, sky, quip).
  // Pass a string for a plain headline.
  toast(msg) {
    const m = typeof msg === 'string' ? { title: msg } : msg;
    const el = $('toast');
    el.querySelector('.t-kicker').textContent = m.kicker || '';
    el.querySelector('.t-title').textContent = m.title || '';
    const sub = el.querySelector('.t-sub');
    sub.textContent = '';
    if (m.keys) {
      // control hints: key caps with a word each
      for (const [k, word] of m.keys) {
        const kb = document.createElement('kbd');
        kb.textContent = k;
        sub.append(kb, ` ${word}`);
      }
    } else sub.textContent = m.sub || '';
    el.className = `tone-${m.tone || 'info'}`;
    el.classList.toggle('no-kicker', !m.kicker);
    el.classList.toggle('no-sub', !m.sub && !m.keys);
    this.placeToast(el);
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), m.ms || (m.sub || m.keys ? 2600 : 1900));
  }

  // While a menu card is up, put the toast in free space next to it (below,
  // above, then beside) so it never covers the card; otherwise use the CSS spot.
  placeToast(el) {
    el.style.top = el.style.left = el.style.right = '';
    const holder = this.openPanel ? $(this.openPanel) : document.querySelector('.screen:not(.hidden):not(.panel)');
    const card = holder?.querySelector('.card');
    if (!card) return;
    const c = card.getBoundingClientRect();
    const app = $('app').getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 12;
    const W = app.width;
    const H = app.height;
    let top;
    let left = W / 2 - w / 2;
    if (H - c.bottom >= h + gap * 2) top = c.bottom + (H - c.bottom - h) / 2;
    else if (c.top >= h + gap * 2) top = (c.top - h) / 2;
    else if (W - c.right >= w + gap * 2) {
      top = c.top + gap;
      left = c.right + (W - c.right - w) / 2;
    } else top = H - h - gap;
    el.style.top = `${Math.round(top)}px`;
    el.style.left = `${Math.round(Math.max(gap, left))}px`;
    el.style.right = 'auto';
  }

  banner(text, sub = '') {
    const el = $('banner');
    $('banner-text').textContent = text;
    $('banner-sub').textContent = sub;
    this.setClass($('banner-sub'), 'hidden', !sub);
    el.classList.add('hidden');
    void el.offsetWidth;
    el.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => el.classList.add('hidden'), 1550);
  }

  titleCard(zone) {
    const el = $('titlecard');
    $('tc-zone').textContent = `Zone ${zone + 1}`;
    $('tc-name').textContent = ZONE_NAMES[zone];
    el.classList.add('hidden');
    void el.offsetWidth;
    el.classList.remove('hidden');
    clearTimeout(this.tcTimer);
    this.tcTimer = setTimeout(() => el.classList.add('hidden'), 2850);
  }

  flash(amount, color = '#ffffff') {
    this.flashAmt = Math.max(this.flashAmt, amount);
    this.flashColor.set(color);
  }

  // floating score text over a world position; `tag` is a smaller suffix
  // such as a combo multiplier or a chain count
  popup(pos, text, cls, tag = '') {
    const v = pos.clone().setY(pos.y + 0.9).project(this.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return;
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    if (tag) {
      const t = document.createElement('small');
      t.textContent = tag;
      el.append(t);
    }
    el.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
    $('popups').appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  setText(id, value) {
    if (this.lastHud[id] === value) return;
    this.lastHud[id] = value;
    $(id).textContent = value;
  }

  setClass(el, cls, on) {
    const k = `${el.id || el.className}:${cls}`;
    if (this.lastHud[k] === on) return;
    this.lastHud[k] = on;
    el.classList.toggle(cls, on);
  }

  setStyle(id, prop, value) {
    const k = `${id}.${prop}`;
    if (this.lastHud[k] === value) return;
    this.lastHud[k] = value;
    $(id).style[prop] = value;
  }

  updateHud() {
    const g = this.game;
    const scoreText = g.score.toLocaleString();
    if (this.lastHud['hud-score'] !== scoreText && g.score > 0 && this.state === 'playing') {
      const el = $('hud-score');
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
    this.setText('hud-score', scoreText);
    this.setText('hud-best', g.best.toLocaleString());
    // through hyperspeed it's still the full snake; then it counts down as
    // the torn-off tail goes into the black hole
    let shownLen = g.cells.length;
    const pre = this.galaxy.pre;
    if (this.galaxy.kind === 'warp' && !this.galaxy.dropped && pre) shownLen = pre.cells.length;
    else if (this.rip) shownLen += Math.round(this.rip.lost * (1 - this.rip.k));
    this.setText('hud-length', String(shownLen));
    this.setText('hud-time', this.formatTime(g.time));
    if (this.settings.ghost) this.setText('hud-ghost', this.ghost.score.toLocaleString());
    this.setText('hud-level', String(g.level + 1));
    this.setText('hud-zone', ZONE_NAMES[g.zone]);
    // progress to the next speed level and zone
    const lvl = g.level;
    const prog = g.levelProgress();
    const maxed = prog.max;
    const left = prog.need - prog.into;
    // in the Galactic Core the bar is the board filling up, in tenths
    const segs = prog.core ? 10 : prog.need;
    this.setText('hud-lvl-next', prog.core ? `${Math.floor((prog.into / prog.need) * 100)}% filled` : maxed ? 'Top speed' : `${left} apple${left === 1 ? '' : 's'} to go`);
    this.setStyle('hud-lvl-fill', 'transform', `scaleX(${(prog.into / prog.need).toFixed(3)})`);
    if (this.lastHud.segs !== segs) {
      this.lastHud.segs = segs;
      $('hud-lvl-bar').style.setProperty('--segs', String(segs));
    }
    this.setClass($('hud-lvl'), 'max', maxed);
    this.setClass($('hud-lvl'), 'orbit', !!prog.core);
    const nz = ZONE_STARTS.findIndex((z) => z > lvl);
    this.setText('hud-zone-next', g.space ? `${Math.max(0, g.coreFree())} cells left to fill` : nz < 0 ? 'Final zone' : `Next: ${ZONE_NAMES[nz]} at Lv ${ZONE_STARTS[nz] + 1}`);
    this.setStyle('hud-rush', 'transform', `scaleX(${(g.rush / 100).toFixed(3)})`);
    const rushEl = $('hud-rush-wrap');
    this.setClass(rushEl, 'active', g.rushing);
    this.setClass(rushEl, 'full', g.rush >= 99.9);
    this.setClass($('hud-boost'), 'hidden', !g.boosting);
    const comboLeft = 1 - (g.clock - g.lastEatTime) / COMBO_WINDOW_MS;
    const showCombo = g.combo > 1 && comboLeft > 0 && this.state !== 'over';
    this.setClass($('hud-combo'), 'hidden', !showCombo);
    if (showCombo) {
      this.setText('hud-combo-x', `×${g.combo}`);
      this.setStyle('hud-combo-bar', 'transform', `scaleX(${Math.max(0, comboLeft).toFixed(2)})`);
    }
    // chain tracker
    const ch = g.chain;
    this.setClass($('hud-chain'), 'hidden', !ch);
    if (ch) {
      const key = `${ch.id}:${ch.next}`;
      if (this.lastChainKey !== key) {
        this.lastChainKey = key;
        $('hud-chain-dots').innerHTML = ch.links.map((_, i) => `<i class="${i < ch.next ? 'done' : i === ch.next ? 'next' : ''}"></i>`).join('');
      }
      const left = Math.max(0, (ch.expires - g.time) / 1000);
      this.setText('hud-chain-time', `${left.toFixed(1)}s`);
      this.setClass($('hud-chain'), 'urgent', left < 3);
    }

    const view = this.relativeSteer && (this.rig.mode === 'fp' || this.rig.mode === 'tp' || this.rig.highChase) && (this.state === 'playing' || this.state === 'countdown' || this.state === 'paused');
    this.setClass($('app'), 'view-aids', view && this.settings.minimap);
    const aids = view && this.settings.minimap;
    this.setClass($('compass'), 'hidden', !aids);
    this.setClass($('minimap'), 'hidden', !aids);
    if (aids) {
      this.updateCompass();
      this.drawMinimap();
    }
    const showTouch = this.isTouch && (this.state === 'playing' || this.state === 'countdown');
    this.setClass($('touch'), 'hidden', !showTouch);
    this.setClass($('touch'), 'overhead', !this.relativeSteer);
    this.setClass($('touch'), 'sky', g.flying);
    // altitude gauge while flying: head (cyan) and apple (red) on a 9-layer scale
    const flyingHud = g.flying && this.state !== 'menu';
    this.setClass($('alt'), 'hidden', !flyingHud);
    if (flyingHud) {
      const pct = (y) => `${((1 - (y + 0.5) / SKY_H) * 100).toFixed(1)}%`;
      this.setStyle('alt-head', 'top', pct(g.head.y));
      this.setClass($('alt-food'), 'hidden', !g.food);
      if (g.food) this.setStyle('alt-food', 'top', pct(g.food.y));
      this.setText('alt-text', String(g.head.y + 1));
      // layers to climb (+) or dive (-) to reach the apple; a check once level
      const dy = g.food ? g.food.y - g.head.y : null;
      const key = dy == null ? 'none' : dy > 0 ? 'up' : dy < 0 ? 'down' : 'level';
      this.setText('alt-delta-n', dy == null ? '–' : dy === 0 ? '✓' : dy > 0 ? `+${dy}` : `−${-dy}`);
      this.setText('alt-delta-l', dy == null ? 'no apple' : dy > 0 ? `climb ▲` : dy < 0 ? `dive ▼` : 'apple level');
      const el = $('alt-delta');
      for (const c of ['up', 'down', 'level']) this.setClass(el, c, key === c);
      this.setClass($('alt'), 'level', key === 'level');
      if (key !== this.lastAltKey) {
        if (key === 'level' && this.lastAltKey && this.state === 'playing') this.audio.altLevel();
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
        this.lastAltKey = key;
      }
      // the gauge's end lights up when the ceiling or the floor is close
      this.setClass($('alt'), 'near-top', g.head.y >= SKY_H - 2);
      this.setClass($('alt'), 'near-bottom', g.head.y <= 1);
    }
    if (this.state !== 'playing' && this.state !== 'countdown') this.setClass($('fp-hint'), 'hidden', true);
    else this.lastHud['fp-hint:hidden'] = undefined;
  }

  viewForward() {
    const yaw = this.rig.viewYaw() ?? Math.atan2(this.snake.headDir.x, this.snake.headDir.z);
    return { x: Math.sin(yaw), z: Math.cos(yaw) };
  }

  // Pickup pointers: while a pickup is out of view, a dart sits on the
  // screen's edge pointing the way to go (the apple's carries its distance).
  // Once it's on screen the dart fades away.
  updateCompass() {
    const g = this.game;
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.poiT || now)) / 1000);
    this.poiT = now;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const small = W < 720;
    // keep clear of the HUD corners and the rush bar
    const m = { l: small ? 28 : 44, r: small ? 28 : 44, t: small ? 150 : 110, b: small ? 150 : 90 };
    const cx = (m.l + W - m.r) / 2;
    const cy = (m.t + H - m.b) / 2;
    const hw = (W - m.l - m.r) / 2;
    const hh = (H - m.t - m.b) / 2;
    const cam = this.camera;
    const v = this.poiV || (this.poiV = new THREE.Vector3());
    const point = (target, key, withDist) => {
      const el = $(`poi-${key}`);
      if (!target) {
        this.setClass(el, 'hidden', true);
        if (this.poiState?.[key]) this.poiState[key].snap = true; // a new one starts where it is
        return;
      }
      this.setClass(el, 'hidden', false);
      const w = this.toWorld(target.x, target.z, target.y);
      const d = Math.abs(target.x - g.head.x) + Math.abs(target.z - g.head.z) + Math.abs((target.y || 0) - (g.head.y || 0));
      v.set(w.x, w.y + 0.6, w.z).applyMatrix4(cam.matrixWorldInverse);
      const front = v.z < 0;
      const camX = v.x;
      const camY = v.y;
      v.applyMatrix4(cam.projectionMatrix);
      const sx = ((v.x + 1) / 2) * W;
      const sy = ((1 - v.y) / 2) * H;
      let x;
      let y;
      let a;
      const over = front && Math.abs(sx - cx) <= hw && Math.abs(sy - cy) <= hh;
      if (over) {
        x = sx;
        y = sy - 34;
        a = Math.PI / 2;
      } else {
        let dx = front ? sx - cx : camX;
        let dy = front ? sy - cy : -camY;
        if (!front) dy = Math.max(dy, 0.2 * Math.hypot(dx, dy)); // behind: lean towards the bottom edge
        if (Math.abs(dx) + Math.abs(dy) < 1e-6) dy = 1;
        const k = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
        x = cx + dx * k;
        y = cy + dy * k;
        a = Math.atan2(dy, dx);
      }
      // glide between spots rather than jumping
      const s = this.poiState || (this.poiState = {});
      const p = s[key];
      if (!p || p.snap) s[key] = { x, y, a, snap: false };
      else {
        const f = Math.min(1, dt * 14);
        p.x += (x - p.x) * f;
        p.y += (y - p.y) * f;
        let da = a - p.a;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        p.a += da * f;
      }
      const q = s[key];
      el.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
      el.firstElementChild.style.transform = `rotate(${q.a.toFixed(3)}rad)`;
      this.setClass(el, 'over', over);
      this.setClass(el, 'near', over); // on screen: no pointer needed
      if (withDist) {
        const b = $(`poi-${key}-d`);
        b.textContent = String(d);
        b.style.transform = `translate(calc(-50% + ${(-Math.cos(q.a) * 30).toFixed(1)}px), calc(-50% + ${(-Math.sin(q.a) * 26).toFixed(1)}px))`;
      }
    };
    point(g.food, 'orb', true);
    point(g.bonus, 'prism', false);
    point(g.prey, 'prey', false);
  }

  // Pixel-art map, a few canvas pixels per cell and scaled up crisp by CSS.
  // It turns in quarter steps so the way the camera faces is up and the
  // pixels never smear.
  drawMinimap() {
    const cv = $('minimap');
    const g = this.game;
    const N = g.size;
    const P = 5; // canvas pixels per cell
    const B = 2; // border pixels
    const S = N * P + B * 2;
    if (cv.width !== S) cv.width = cv.height = S;
    const c = this.mmCtx || (this.mmCtx = cv.getContext('2d'));
    c.imageSmoothingEnabled = false;
    const t = this.simTime;
    const blink = Math.floor(t * 4) % 2 === 0;
    const f = this.viewForward();
    const q = (((Math.round(Math.atan2(f.x, -f.z) / (Math.PI / 2))) % 4) + 4) % 4;
    const M = N - 1;
    // grid cell -> map cell, a quarter turn at a time
    const T = (x, z) => {
      for (let i = 0; i < q; i++) [x, z] = [z, M - x];
      return [x, z];
    };
    const px = (x, z, color, inset = 0) => {
      const [u, v] = T(x, z);
      c.fillStyle = color;
      c.fillRect(B + u * P + inset, B + v * P + inset, P - inset * 2, P - inset * 2);
    };
    // frame and floor
    c.fillStyle = '#070d26';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#5a78d8';
    c.fillRect(0, 0, S, B);
    c.fillRect(0, S - B, S, B);
    c.fillRect(0, 0, B, S);
    c.fillRect(S - B, 0, B, S);
    for (let x = 0; x < N; x++) {
      for (let z = 0; z < N; z++) {
        if (g.space && g.land) {
          if (!g.land[x * N + z]) continue;
          if (g.doomAt(x, z)) {
            px(x, z, blink ? '#ff9a3c' : '#7a3a20');
            continue;
          }
        }
        px(x, z, (x + z) & 1 ? '#172a63' : '#1f3678');
      }
    }
    for (const ob of g.obstacles) {
      if (ob.solid) px(ob.x, ob.z, '#e8dcc0');
      else if (blink) px(ob.x, ob.z, '#ff3b5c', 1);
    }
    for (const p of g.pads) px(p.x, p.z, '#ff9a3c', 1);
    if (g.chain) {
      for (let i = g.chain.next; i < g.chain.links.length; i++) {
        const l = g.chain.links[i];
        if (i === g.chain.next) px(l.x, l.z, blink ? '#ffffff' : '#38f6ff');
        else px(l.x, l.z, '#38f6ff', 1);
      }
    }
    if (this.settings.ghost) for (const gc of this.ghost.cells) px(gc.x, gc.z, 'rgba(168, 240, 255, 0.45)', 1);
    // snake: body in its colour with a darker belly stripe, white head
    const body = this.snake.trailColor || '#38f6ff';
    for (let i = g.cells.length - 1; i >= 1; i--) {
      px(g.cells[i].x, g.cells[i].z, body);
      if (i % 2) px(g.cells[i].x, g.cells[i].z, 'rgba(0, 0, 0, 0.22)', 2);
    }
    px(g.head.x, g.head.z, '#ffffff');
    // little pixel sprites, always drawn upright
    const sprite = (x, z, rows, colors) => {
      const [u, v] = T(x, z);
      const o = (rows.length - P) >> 1; // bigger sprites spill over their cell evenly
      for (let r = 0; r < rows.length; r++) {
        for (let k = 0; k < rows[r].length; k++) {
          const ch = rows[r][k];
          if (ch === '.') continue;
          c.fillStyle = colors[ch];
          c.fillRect(B + u * P + k - o, B + v * P + r - o, 1, 1);
        }
      }
    };
    if (g.prey) sprite(g.prey.x, g.prey.z, ['.y.y.', 'yyyyy', 'ykyky', 'yyyyy', '.yyy.'], { y: '#ffd36a', k: '#3a2400' });
    if (g.bonus) sprite(g.bonus.x, g.bonus.z, ['..v..', '.vwv.', 'vvvvv', '.vvv.', '..v..'], { v: '#c77dff', w: '#ffffff' });
    if (g.food) {
      // a pixel apple; it flashes white now and then so it's easy to spot
      const flash = (t * 1.5) % 1 < 0.12;
      sprite(g.food.x, g.food.z, ['...gg..', '..g....', '.rr.rr.', 'rwrrrrr', 'rwrrrrr', 'rrrrrrr', '.rrrrr.'], { g: '#5be36a', r: flash ? '#ffffff' : '#ff3355', w: '#ffd0d8' });
    }
  }

  // Galactic Core deaths: the camera lets go of the board, drifts up and
  // circles the black hole for as long as the game-over card is up.
  startDeathOrbit() {
    const cam = this.camera.position;
    const rm = this.settings.reduceMotion;
    const a0 = Math.atan2(cam.x, cam.z);
    const r0 = Math.hypot(cam.x, cam.z);
    const y0 = cam.y;
    const rT = 30;
    const yT = 6;
    const obj = this.rig.tmpObj;
    let t = 0;
    let a = a0;
    const l0 = this.rig.tmpV.clone(); // where the camera was looking
    this.camera.getWorldDirection(l0).multiplyScalar(8).add(cam);
    this.deathOrbit = true;
    this.rig.setDirector((dt, out) => {
      t += dt;
      const k = smooth01(t / 3.2);
      // the turn picks up gently, then keeps going
      a += dt * (rm ? 0.04 : 0.16) * smooth01(t / 2.5);
      const r = r0 + (rT - r0) * k;
      out.pos.set(Math.sin(a) * r, y0 + (yT - y0) * k, Math.cos(a) * r);
      obj.position.copy(out.pos);
      obj.up.set(0, 1, 0);
      // the eye settles on the black hole
      obj.lookAt(l0.x * (1 - k), l0.y + (CORE_Y + 1.5 - l0.y) * k, l0.z * (1 - k));
      out.quat.copy(obj.quaternion);
      out.fov = 50;
    }, { duration: rm ? 0.4 : 1.1 });
  }

  // Every other map: the camera pulls up and back from wherever it was and
  // slowly circles the board, eyes on the crash, for as long as the
  // game-over card is up.
  startDeathCircle() {
    const g = this.game;
    const rm = this.settings.reduceMotion;
    const cam = this.camera.position;
    const hp = this.snake.headPos.clone();
    const half = (g.size / 2) * Math.SQRT2; // board centre to a corner
    // look between the crash and the board's middle, so both stay in frame
    const lookT = new THREE.Vector3(hp.x * 0.35, hp.y - (g.flying ? 0 : 0.5), hp.z * 0.35);
    const rT = half * 1.15 + 9;
    const yT = hp.y + half * 0.9 + 5;
    const r0 = Math.max(2, Math.hypot(cam.x, cam.z));
    const y0 = cam.y;
    let a = Math.atan2(cam.x, cam.z);
    const l0 = new THREE.Vector3(); // where the camera was looking
    this.camera.getWorldDirection(l0).multiplyScalar(8).add(cam);
    const look = new THREE.Vector3();
    const obj = this.rig.tmpObj;
    let t = 0;
    this.deathOrbit = true;
    this.rig.setDirector((dt, out) => {
      t += dt;
      const k = smooth01(t / 2.6);
      // the turn picks up gently, then keeps going
      a += dt * (rm ? 0.04 : 0.15) * smooth01(t / 2.2);
      const r = r0 + (rT - r0) * k;
      out.pos.set(Math.sin(a) * r, y0 + (yT - y0) * k, Math.cos(a) * r);
      obj.position.copy(out.pos);
      obj.up.set(0, 1, 0);
      look.copy(l0).lerp(lookT, k);
      obj.lookAt(look);
      out.quat.copy(obj.quaternion);
      out.fov = 50;
    }, { duration: rm ? 0.4 : 1.1 });
  }

  // Falling off the Galactic Core: the camera rides down behind the snake's
  // head, all the way to the black hole (voidFallPose then zooms it out).
  startDeathFollow() {
    const hp = this.snake.headPos;
    const pos = this.camera.position.clone();
    const look = new THREE.Vector3();
    const want = new THREE.Vector3();
    const obj = this.rig.tmpObj;
    this.deathOrbit = true; // framed beside the results card (see updateLens)
    this.rig.setDirector((dt, out) => {
      const hd = this.snake.headDir;
      // behind and above the head, more above it the steeper it dives
      want.copy(hp).addScaledVector(hd, -4.2);
      want.y += 2.4;
      pos.lerp(want, Math.min(1, dt * 5));
      look.copy(hp).addScaledVector(hd, 2);
      out.pos.copy(pos);
      obj.position.copy(pos);
      obj.up.set(0, 1, 0);
      obj.lookAt(look);
      out.quat.copy(obj.quaternion);
      out.fov = 62;
    }, { duration: this.settings.reduceMotion ? 0.3 : 0.6 });
  }

  // Sliding off the Galactic Core's board: the snake keeps going, its body
  // following its head over the edge, down into the void and round the
  // spiral into the black hole. The path: the body's cells, then a drop off
  // the edge, then the fall path (from where the drop ends) to the horizon.
  // Distance e along it is 0 at the head's cell, + ahead of it, - behind.
  startVoidFall(hit) {
    const g = this.game;
    const body = g.cells.map((c) => {
      const w = this.toWorld(c.x, c.z, 0);
      return new THREE.Vector3(w.x, w.y || 0, w.z);
    });
    const hw = this.toWorld(hit.x, hit.z, 0);
    const h0 = body[0];
    const fwd = new THREE.Vector3(hw.x - h0.x, 0, hw.z - h0.z).normalize();
    // off the edge (half a cell out), it drops away under gravity
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const h = (i / 60) * 3.4;
      const d = Math.max(0, h - 0.5);
      pts.push(new THREE.Vector3(h0.x + fwd.x * h, h0.y - 0.5 * d * d, h0.z + fwd.z * h));
    }
    const p1 = pts[pts.length - 1].clone();
    const P = new THREE.Vector3();
    for (let i = 1; i <= 700; i++) pts.push(fallPath(p1, i / 700, 0.4, P).clone());
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const len = cum[cum.length - 1];
    const out = { x: 0, y: 0, z: 0 };
    const at = (e) => {
      if (e <= 0) {
        // back along the body, a cell per unit
        const k = Math.min(body.length - 1, -e);
        const i = Math.min(body.length - 2, Math.floor(k));
        if (i < 0) return Object.assign(out, { x: h0.x, y: h0.y, z: h0.z });
        const f = k - i;
        const A = body[i];
        const B = body[i + 1];
        return Object.assign(out, { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, z: A.z + (B.z - A.z) * f });
      }
      e = Math.min(len, e);
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (cum[m] <= e) lo = m;
        else hi = m;
      }
      const f = (e - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
      const A = pts[lo];
      const B = pts[hi];
      return Object.assign(out, { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, z: A.z + (B.z - A.z) * f });
    };
    const n = body.length;
    const rm = this.settings.reduceMotion;
    // it leaves at the speed it was moving and is reeled in faster and
    // faster, the whole snake gone in about T seconds whatever its length
    const v0 = 1000 / Math.max(60, g.currentInterval(false));
    const T = rm ? 1.8 : 2.8;
    const acc = Math.max(5, (2 * (len + n - v0 * T)) / (T * T));
    this.voidFall = {
      at, len, n, v0, acc, adv: 0, gone: 0, emitted: 0,
      game: { cells: [], removedTail: null, facing: g.facing, flying: false, space: true, ticks: g.ticks },
    };
  }

  // This frame's pose for the falling snake (a stand-in game whose cells are
  // distances along the fall), or null when it isn't falling.
  voidFallPose() {
    const f = this.voidFall;
    if (!f) return null;
    if (this.state !== 'dying' && this.state !== 'over') {
      this.voidFall = null;
      this.snake.group.visible = true;
      return null;
    }
    const tau = this.dyingTime || 0;
    const adv = f.v0 * tau + 0.5 * f.acc * tau * tau;
    f.adv = adv;
    // cells that have reached the horizon are gone, from the head back
    const gone = Math.min(f.n, Math.max(0, Math.ceil(adv - (f.len - 0.6))));
    const sp = this.world.space;
    const color = this.snake.trailColor || '#38f6ff';
    if (gone > f.gone) {
      // the head is in: pull out to circle the black hole
      if (f.gone === 0) this.startDeathOrbit();
      const end = f.at(f.len);
      sp.emitStreams(new THREE.Vector3(end.x, end.y, end.z), Math.min(60, (gone - f.gone) * 4), color, { spread: 0.6, over: 0.1, dur: 0.8 });
      sp.feed = Math.min(1.6, sp.feed + (gone - f.gone) * 0.05);
      if (f.gone === 0) this.audio.suckIn(4);
      f.gone = gone;
    }
    // the head sheds light as it falls
    const e = Math.min(adv, f.len);
    if (adv > 1 && f.emitted < 6 && e / f.len >= f.emitted / 6) {
      f.emitted++;
      const p = f.at(e);
      sp.emitStreams(new THREE.Vector3(p.x, p.y, p.z), 16, color, { spread: 0.3, y: 0, over: 0.15, dur: 1.4 });
    }
    const left = f.n - gone;
    this.snake.group.visible = left >= 2;
    if (left < 2) return null;
    const cells = f.game.cells;
    while (cells.length < left) cells.push({ x: 0, z: 0, y: 0 });
    cells.length = left;
    for (let i = 0; i < left; i++) cells[i].x = gone + i;
    f.headGone = gone > 0;
    return { game: f.game, toWorld: (x) => f.at(adv - x) };
  }

  // Hyperspeed drops the snake onto the Galactic Core's board as four
  // segments. The rest of its body hangs off the back of the board and down
  // the black hole's spiral; a moment later it tears off and is reeled down
  // into the horizon, pouring in as light. (Drawn by a second, headless
  // snake whose cells are spaced a cell apart along the fall path.)
  startTailRip() {
    const g = this.game;
    const pre = this.galaxy.pre;
    const lost = pre ? pre.cells.length - g.cells.length : 0;
    this.tailLost = Math.max(0, lost);
    if (lost < 2) return;
    const n = g.cells.length;
    const t = g.cells[n - 1];
    const b = g.cells[n - 2];
    const w = this.toWorld(t.x + (t.x - b.x), t.z + (t.z - b.z), 0);
    const p0 = new THREE.Vector3(w.x, w.y || 0, w.z);
    // the fall path, by distance along it
    const pts = [];
    const cum = [];
    let len = 0;
    const P = new THREE.Vector3();
    for (let i = 0; i <= 900; i++) {
      fallPath(p0, i / 900, 0.35, P);
      if (i) len += P.distanceTo(pts[i - 1]);
      pts.push(P.clone());
      cum.push(len);
    }
    const at = (d) => {
      d = Math.max(0, Math.min(len, d));
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (cum[m] <= d) lo = m;
        else hi = m;
      }
      const f = (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
      return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * f, y: pts[lo].y + (pts[hi].y - pts[lo].y) * f, z: pts[lo].z + (pts[hi].z - pts[lo].z) * f };
    };
    if (!this.ripView) {
      this.ripView = new SnakeView({ maxCells: MAX_SNAKE, radial: this.q.radial, scaleMap: this.scaleMap, skin: this.snake.skin.id, accessory: 'none' });
      this.ripView.head.visible = false;
      this.scene.add(this.ripView.group);
      singlePassGlows(this.ripView.group);
    }
    const v = this.ripView;
    if (v.skin.id !== this.snake.skin.id) v.applySkin(this.snake.skin.id);
    v.group.visible = true;
    const count = Math.min(lost, Math.floor(len) - 1);
    const rm = this.settings.reduceMotion;
    this.rip = {
      t: 0, at, len, p0, count, lost, extra: lost - count, shown: count, ripped: false,
      delay: rm ? 0.7 : 1.0, dur: rm ? 1.3 : 2.0, k: 0,
      game: { cells: [], removedTail: null, facing: { x: 0, z: -1 }, flying: false, space: false, ticks: 0 },
    };
  }

  endTailRip() {
    this.rip = null;
    if (this.ripView) this.ripView.group.visible = false;
  }

  updateTailRip(dt) {
    const r = this.rip;
    if (!r) return;
    r.t += dt;
    const sp = this.world.space;
    const color = this.snake.trailColor || '#38f6ff';
    const k = clamp01((r.t - r.delay) / r.dur);
    r.k = k;
    if (!r.ripped && r.t >= r.delay) {
      // it tears off at the back of the board
      r.ripped = true;
      if (!this.settings.reduceMotion) this.flash(0.35, color);
      this.effects.emit(r.p0.x, r.p0.y + 0.3, r.p0.z, { count: 50, color, speed: 2.4, up: 1.2, size: 0.22, life: 0.7, gravity: 0, spread: 0.6 });
      sp.emitStreams(r.p0, 40, color, { spread: 0.4, over: 0.2 });
      this.audio.suckIn(5);
      if (!this.settings.reduceMotion) this.rig.shake += 0.25;
    }
    // reeled in, faster and faster: its front slides down the spiral
    const off = r.len * k * k;
    const g = r.game;
    let n = 0;
    while (n < r.count && n + off <= r.len - 0.5) n++;
    if (n < r.shown) {
      // what goes over the horizon flares the core
      const gone = r.shown - n;
      const end = r.at(r.len);
      sp.emitStreams(new THREE.Vector3(end.x, end.y, end.z), Math.min(60, gone * 4), color, { spread: 0.6, over: 0.1, dur: 0.8 });
      sp.feed = Math.min(1.6, sp.feed + gone * 0.05);
      r.shown = n;
    }
    // the part too long to draw pours in as light all the way down
    if (r.ripped && r.extra > 0 && k < 1) {
      const p = r.at(off);
      sp.emitStreams(new THREE.Vector3(p.x, p.y, p.z), Math.min(8, 1 + Math.ceil(r.extra / 40)), color, { spread: 0.5, over: 0.05 });
    }
    if (n < 2 || k >= 1) {
      this.endTailRip();
      return;
    }
    while (g.cells.length < n) g.cells.push({ x: 0, z: 0, y: 0 });
    g.cells.length = n;
    for (let i = 0; i < n; i++) g.cells[i].x = i;
    const at = r.at;
    this.ripView.update(g, 1, this.simTime, (x) => at(x + off), { dt, wiggle: 0 });
  }

  // Jetpack flames shed sparks behind the snake while it flies.
  jetExhaust(g) {
    const s = this.snake;
    if (!s.jetpack || !s.jetpack.visible || this.state === 'menu') return;
    const back = s.jetBack;
    const hot = this.rushGlow;
    // in hyperspeed the exhaust tears past the camera, so the snake reads as racing ahead
    const warp = this.galaxy.kind === 'warp' && !this.galaxy.dropped;
    const n = warp ? 1 : this.state === 'playing' ? (Math.random() < 0.6 + hot * 0.4 ? 1 : 0) : 0;
    const v = warp ? 11 : 2.5 + hot * 2;
    for (let i = 0; i < n; i++) {
      for (const p of s.nozzleWorld) {
        this.effects.emit(p.x, p.y, p.z, {
          count: 1, color: Math.random() < 0.5 ? '#ffb347' : warp ? '#9fd0ff' : '#ff6aa8', speed: warp ? 0.8 : 0.5, up: 0.2, size: warp ? 0.08 : 0.13 + hot * 0.06,
          life: warp ? 0.2 : 0.35, gravity: warp ? 0 : 0.6, spread: warp ? 0.15 : 0.06, vel: { x: back.x * v, y: back.y * v, z: back.z * v },
        });
      }
    }
  }

  // ---------------------------------------------------------------- loop
  // Slow motion while a level-up card covers the screen, so nobody dies
  // behind it. Eases in and out; gameplay slows, camera and world don't.
  slowMo(seconds, scale) {
    this.slowUntil = Math.max(this.slowUntil || 0, performance.now() / 1000 + seconds);
    this.slowScale = Math.min(this.slowScale ?? 1, scale);
  }

  frame(now) {
    // Paused, the picture behind the pause card holds still and the canvas
    // keeps showing the last frame drawn, so stop redrawing the whole 3D
    // scene every frame. Any input, settings change or resize wakes it for a
    // few frames (see wakeRender).
    if (this.state === 'paused' && this.awake <= 0) {
      this.last = now;
      this.input.pollGamepad();
      return;
    }
    if (this.state === 'paused') this.awake--;
    else this.awake = 3;
    const rawDt = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.1, rawDt);
    const slowing = this.state === 'playing' && now / 1000 < (this.slowUntil || 0);
    if (!slowing) this.slowScale = 1;
    // Rush bullet time: the snake really is faster in game time, but the world
    // slows so that in real time it moves at RUSH_FEEL of its unrushed pace.
    const rushScale = this.state === 'playing' && this.game.rushing
      ? (RUSH_FEEL * this.game.currentInterval()) / this.game.currentInterval(false) : 1;
    const tsTarget = Math.min(slowing ? this.slowScale : 1, rushScale);
    // level-up slow motion eases back gently; Rush snaps in and out so the
    // pace you react to barely changes
    if (slowing) this.easeBack = 3;
    else if (rushScale < 1) this.easeBack = 10;
    const ease = slowing ? 7 : rushScale < 1 ? 10 : this.easeBack || 3;
    this.timeScale = (this.timeScale ?? 1) + (tsTarget - (this.timeScale ?? 1)) * Math.min(1, dt * ease);
    // gameplay time: snake, game clock, ghost, pickups and particles
    const gdt = dt * this.timeScale;
    this.audio.setSlow(slowing && this.timeScale < 0.8); // level-up slow-mo only, not Rush bullet time
    this.last = now;
    this.renderer.info.reset();
    this.input.pollGamepad();
    const g = this.game;
    const rm = this.settings.reduceMotion;

    if (this.state !== 'paused') {
      this.simTime += gdt;
      for (let i = 0; i < this.timers.length; ) {
        if (this.timers[i].at <= this.simTime) {
          const t = this.timers.splice(i, 1)[0];
          t.fn();
        } else i++;
      }
    }

    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0.45 && !this.saidGo) {
        this.saidGo = true;
        this.showCountdown('GO!');
        this.audio.countdown(true);
      }
      if (this.countdown <= 0) {
        this.state = 'playing';
        if (!this.run.done) this.run.running = true;
        setTimeout(() => {
          if (this.state === 'playing') $('countdown').classList.add('hidden');
        }, 350);
      }
    }

    if (this.state === 'playing') {
      g.clockScale = this.timeScale;
      this.t += (gdt * 1000) / g.currentInterval();
      let guard = 0;
      while (this.t >= 1 && this.state === 'playing' && guard++ < 4) {
        this.t -= 1;
        this.tick();
      }
      if (this.state === 'playing') this.t = Math.min(this.t, 1);
    }

    if (this.state === 'menu') this.updateDemo(gdt);

    if (this.state === 'dying' || this.state === 'over') {
      this.dyingTime = (this.dyingTime || 0) + dt;
      this.lunge = this.crash ? this.crashLunge(this.dyingTime) : Math.min(CORNER + 0.05 - HEAD_LEAD, this.dyingTime * 4);
    }
    this.deathFlash = Math.max(0, this.deathFlash - dt * 1.2);

    const fast = g.rushing || g.boosting;
    this.galaxy.update(dt);
    const targetFx = this.speedFxOverride ?? (this.state === 'playing' ? g.intensity() : 0);
    this.speedFx += (targetFx - this.speedFx) * Math.min(1, dt * 3);
    const glowOn = (fast && this.state === 'playing') || this.galaxy.glow > 0;
    this.rushGlow += ((glowOn ? 1 : 0) - this.rushGlow) * Math.min(1, dt * 8);

    // hyperspeed: the game holds still, but the snake swims flat out
    const warping = this.galaxy.kind === 'warp' && !this.galaxy.dropped;
    if (warping) this.warpTravel = (this.warpTravel || 0) + dt * (5 + 6 * Math.min(1, this.galaxy.t / this.galaxy.dropAt));
    else this.warpTravel = 0;
    // the next apple waits in the Galactic Core; keep it out of the tunnel
    this.food.group.visible = !warping;
    const ct = this.crash && this.dyingTime >= CRASH_HIT ? this.dyingTime - CRASH_HIT : -1;
    // through hyperspeed the snake is still the one from the sky, full length,
    // jetpack and all; it only becomes the short one on the board at the drop
    const pre = this.galaxy.kind === 'warp' && !this.galaxy.dropped ? this.galaxy.pre : null;
    const snakeGame = pre || g;
    const snakeWorld = pre ? (x, z, y) => this.world.toWorld(x, z, y, pre.yMid, pre.size) : this.toWorld;
    const fall = this.voidFallPose();
    this.snake.update(fall ? fall.game : snakeGame, pre || fall ? 1 : clamp01(this.t), this.simTime, fall ? fall.toWorld : snakeWorld, {
      lunge: fall ? 0 : this.lunge,
      rushGlow: this.rushGlow,
      deathFlash: this.deathFlash,
      dt,
      // the head squashes on impact and springs back; then it sees stars
      squash: ct >= 0 ? Math.exp(-ct * 7) * Math.cos(ct * 22) : 0,
      dizzy: ct >= 0.12 ? ct - 0.12 : -1,
      travel: this.warpTravel,
      wiggle: warping && !rm ? 2.6 : 1,
    });
    this.updateTailRip(dt);
    this.jetExhaust(g);
    this.snake.setRim(this.world.p.rimColor, 0.35 + this.world.p.rimIntensity * 0.25);
    this.updateGhost(gdt);
    if (fast && this.state === 'playing' && Math.random() < 0.8) {
      const hp = this.snake.headPos;
      const hd = this.snake.headDir;
      this.effects.emit(hp.x - hd.x * 0.5, hp.y - hd.y * 0.5 + 0.3, hp.z - hd.z * 0.5, {
        count: 2, color: g.boosting ? '#ffb020' : this.snake.trailColor || '#5ff6ff', speed: 0.6, up: 0.6, size: 0.18, life: 0.45, gravity: 0, spread: 0.5,
      });
    }

    const view = this.rig.mode === 'fp' || this.rig.mode === 'tp' || this.rig.highChase;
    const arena = this.world.skyArena;
    const sky = g.flying ? { floorY: arena.floorY, ceilY: arena.ceilY } : null;
    this.effects.floorY = g.flying || g.space ? -1e9 : 0.03;
    this.food.update(gdt, this.simTime, { reduceMotion: rm, beam: view, floorY: sky ? sky.floorY : null });
    this.syncFood();
    const f = g.lastFacing();
    const headingYaw = Math.atan2(f.x, f.z);
    this.board.applyPalette(this.world.p);
    this.board.sync(g, this.toWorld, gdt, this.simTime, headingYaw, sky);
    const playing = this.state === 'playing' || this.state === 'countdown' || this.state === 'paused';
    this.effects.updateGuide(g, this.toWorld, playing && this.settings.guide && view);
    this.effects.update(gdt);
    const rs = this.post.renderSize;
    const pxScale = rs.y / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    // the arena grows with the zones; under the sky box it stays the full board
    const ground = g.flying || g.space ? g.boardSize : g.size;
    if (this.world.setBoardSize(ground, { instant: rm })) this.onBoardResized(ground);
    this.rig.setBoardSize(g.space ? g.size : ground, rm);
    this.world.update(dt, { level: this.state === 'menu' ? 0 : g.level, reduceMotion: rm, pxScale });
    this.world.updateWalls(g, dt, this.state === 'playing');
    const food = g.food ? this.toWorld(g.food.x, g.food.z, g.food.y) : null;
    arena.update(dt, this.simTime, this.world.skyAmount, this.snake.headPos, food, g.flying && this.state !== 'menu');
    // Chase / first-person cameras aim along the snake's next move (a queued
    // turn if there is one), so they start turning the moment a key is
    // pressed, at most one move ahead of the snake.
    const steering = this.state === 'playing' || this.state === 'countdown';
    // flight: yaw follows the horizontal facing, pitch the next climb or dive
    const next = g.queue[0] || g.dir;
    const aim = g.flying ? (next.y ? g.facing : next) : next;
    // tall block skins lift the chase and first-person cameras over the body
    this.rig.bodyLift = this.snake.block ? Math.max(0, this.snake.blockH - 1) : 0;
    this.rig.update(dt, this.snake, {
      speedFx: this.speedFx, reduceMotion: rm, aim: steering || g.flying ? aim : null,
      flying: g.flying && this.state !== 'menu', pitch: steering ? next.y || 0 : 0, box: sky, sky: this.world.skyAmount, space: this.world.spaceAmount,
    });
    // The first-person camera sits inside the head; hide it once we're there.
    this.snake.head.visible = !(this.rig.mode === 'fp' && this.rig.blend > 0.85) && !(this.voidFall && this.voidFall.headGone);
    this.effects.uniforms.scale.value = pxScale;
    this.world.space.syncBoard(g.space ? g : null, clamp01(this.t));
    this.world.updateSpace(dt, this.camera, { pxScale, dpr: this.renderer.getPixelRatio() * this.post.scale, reduceMotion: rm });

    this.updateLens(dt);

    // music follows the action; on the title screen it plays the song of the map the tour is showing
    const inGame = this.state === 'playing' || this.state === 'countdown' || this.state === 'paused';
    const intensity = clamp01(0.12 + (g.level / MAX_LEVEL) * 0.6 + ((g.combo - 1) / 7) * 0.2 + (fast ? 0.15 : 0));
    this.audio.setMusicState({ menu: !inGame && this.state !== 'dying' && this.state !== 'over', intensity, rush: fast && this.state === 'playing', zone: this.state === 'menu' ? this.tourZone() : g.zone, level: g.level });

    this.renderFrame(dt, view, rm);
    if (this.state !== 'menu') this.updateHud();
    else this.updateTour();
    this.updateTimer(Math.min(rawDt, 1));
    this.measure(rawDt);
  }

  renderFrame(dt, view, rm) {
    const P = this.post.params;
    const pp = this.world.postParams();
    this.flashAmt = Math.max(0, this.flashAmt - dt * 2.6);
    let danger = 0;
    const g = this.game;
    if ((view || g.space) && this.state === 'playing') {
      const look = g.lookAhead(3);
      if (look.blocked && look.free === 0) danger = 0.42 + 0.2 * Math.sin(this.simTime * 18);
      else if (look.blocked && look.free === 1) danger = 0.16;
      else if (look.blocked && look.free === 2 && g.flying) danger = 0.07;
    }
    const speed = rm ? 0 : Math.max(0, this.speedFx - 0.25) * (view ? 1.3 : 0.45) + this.rushGlow * (view ? 0.5 : 0.15);
    const trans = this.world.transitioning ? 0.5 : 0;
    const slow = 1 - (this.timeScale ?? 1);
    P.uBloom.value = pp.bloom + this.rushGlow * 0.18 + this.flashAmt * 0.5;
    P.uSat.value = pp.sat * (1 - slow * 0.3);
    P.uContrast.value = pp.contrast;
    P.uTint.value.copy(pp.tint);
    P.uLift.value.copy(pp.lift);
    P.uVignette.value = pp.vignette + this.rushGlow * 0.1 + slow * 0.35 + (this.cineVignette || 0);
    P.uSpeed.value = speed;
    P.uLines.value = rm ? 0 : Math.max(0, this.speedFx - 0.2) * (view ? 1.2 : 0.5) + this.rushGlow * 0.6;
    P.uChroma.value = rm ? 0 : this.rushGlow * 0.7 + trans + slow * 0.6 + (this.cineChroma || 0);
    P.uDanger.value = danger;
    P.uFlash.value = Math.max(Math.min(0.6, this.flashAmt), this.whiteout || 0);
    P.uFlashColor.value.copy(this.flashColor);
    P.uTime.value = this.simTime;
    P.uCenter.value.set(0.5, view ? 0.56 : 0.5);
    this.holeOnScreen(P.uHole.value);
    this.renderer.toneMappingExposure = pp.exposure;
    this.post.render(this.scene, this.camera, { threshold: pp.threshold });
  }

  // Where the Galactic Core's black hole is on screen, for the bloom mask:
  // uv centre and radius (in screen heights), or a zero radius.
  holeOnScreen(out) {
    out.z = 0;
    if (!(this.world.spaceAmount > 0)) return;
    const cam = this.camera;
    const c = this.tmpHole || (this.tmpHole = new THREE.Vector3());
    c.set(0, CORE_Y, 0);
    const d = c.distanceTo(cam.position);
    if (d <= HORIZON_R * 1.05) return;
    c.project(cam);
    if (c.z > 1 || c.z < -1) return;
    // the sphere's outline, as a fraction of the screen's height
    const ang = Math.asin(HORIZON_R / d);
    const r = Math.tan(ang) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / 2;
    out.set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5, r);
  }

  // Frame-time driven resolution scaling, then quality stepping (Auto only).
  measure(dt) {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      if (this.settings.showFps) {
        const i = this.renderer.info.render;
        $('fps').textContent = `${Math.round(this.fps)} fps · ${this.activeQuality} · ${Math.round(this.post.scale * 100)}% · ${i.calls} draws`;
      }
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    if (this.settings.fixedResolution) return;
    const d = this.dyn;
    if (d.grace > 0) {
      d.grace -= dt;
      d.samples.length = 0;
      return;
    }
    d.samples.push(dt * 1000);
    d.timer += dt;
    if (d.timer < 0.5) return;
    d.timer = 0;
    const s = d.samples.sort((a, b) => a - b);
    const p80 = s[Math.floor(s.length * 0.8)];
    d.samples.length = 0;
    const q = this.q;
    const nowT = this.simTime;
    // Heavy moments (zone transitions, level-ups, run start) may borrow some
    // resolution for a moment, but never trigger a quality-tier change: that
    // recompiles shaders and would itself cause the stutter we're avoiding.
    const busy = this.world.transitioning || nowT < (this.protectUntil || 0);
    if (p80 > 19.5) {
      d.good = 0;
      if (nowT - d.lastUp < 2) d.backoff = Math.min(8, d.backoff * 2);
      if (d.scale > q.minScale + 1e-3) {
        // resolution changes are free (no reallocation), so step gently and often
        d.scale = Math.max(q.minScale, d.scale * 0.9);
        this.post.setScale(d.scale);
      } else if (!busy && this.settings.quality === 'auto' && this.activeQuality !== 'low' && ++d.slowAtMin >= 6) {
        this.activeQuality = this.activeQuality === 'high' ? 'medium' : 'low';
        this.applyQuality();
        if (this.state === 'playing') this.toast({ kicker: 'Graphics', title: this.activeQuality === 'low' ? 'Low' : 'Medium', sub: 'Lowered to keep it smooth' });
      }
    } else if (p80 < 17.8) {
      d.slowAtMin = 0;
      if (++d.stable % 20 === 0) d.backoff = Math.max(1, d.backoff / 2);
      if (d.scale < 1 && ++d.good >= 2 * d.backoff) {
        d.good = 0;
        d.scale = Math.min(1, d.scale * 1.06);
        d.lastUp = nowT;
        this.post.setScale(d.scale);
      }
    }
  }
}

// three.js draws every transparent double-sided material twice a frame (back
// faces, then front), flipping its side in between, which also makes it
// re-check which shader to use, both times. For additive glows the order
// makes no difference to the picture, so draw them in one pass.
function singlePassGlows(root) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.transparent && m.side === THREE.DoubleSide && m.blending === THREE.AdditiveBlending) m.forceSinglePass = true;
    }
  });
}

// Boot after the loading screen has painted; if anything fails, say so on
// screen instead of leaving a blank page.
function showBootError(err) {
  console.error(err);
  document.body.classList.add('boot-failed');
  const el = document.getElementById('loader-msg');
  if (el) el.textContent = `Snake Rush couldn't start: ${err && err.message ? err.message : err}. Try reloading; if you're running it locally, run "npm install" first.`;
}

requestAnimationFrame(() =>
  setTimeout(() => {
    try {
      new App();
      document.body.classList.remove('loading');
    } catch (err) {
      showBootError(err);
    }
  }, 0)
);
