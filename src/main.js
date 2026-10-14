import * as THREE from 'three';

import { GhostBot } from './game/GhostBot.js';
import { SnakeGame, DIRS, COMBO_WINDOW_MS, ZONE_NAMES, ZONE_STARTS, MAX_LEVEL, LEVEL_SPEEDS, zoneForLevel } from './game/SnakeGame.js';
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
const BOARD = 21;
const CAMERA_NAMES = { overhead: 'Overhead', tp: 'Chase', fp: 'First-person' };
const CAMERA_ORDER = ['overhead', 'tp', 'fp'];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// Fraction of a step after a tick during which a new turn redoes that step.
// Together with the drawn head's lead this ends just past the turning cell's
// centre, so a redo never visibly snaps the head by more than ~1/4 cell.
const GRACE = 0.25;

class App {
  constructor() {
    this.settings = loadSettings();
    this.stats = loadStats();
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
    this.game = new SnakeGame({ size: BOARD, best: loadBest() });
    this.world = new World({ size: BOARD, renderer: r });
    this.scene = this.world.scene;
    this.toWorld = (x, z) => this.world.toWorld(x, z);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 1500);
    this.rig = new CameraRig(this.camera, BOARD);

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
    this.speedFx = 0;
    this.rushGlow = 0;
    this.flashAmt = 0;
    this.flashColor = new THREE.Color('#ffffff');
    this.cameraMode = CAMERA_ORDER.includes(this.settings.camera) ? this.settings.camera : 'overhead';
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.lastHud = {};
    this.dyn = { scale: 1, samples: [], timer: 0, grace: 2, good: 0, backoff: 1, lastUp: -99, slowAtMin: 0, stable: 0 };

    this.activeQuality = this.settings.quality === 'auto' ? (this.isTouch ? 'medium' : 'high') : this.settings.quality;
    this.applyQuality();

    this.input = new Input(this.canvas, {
      direction: (d, src) => this.onDirection(d, src),
      turn: (s) => this.onTurn(s),
      tap: (side) => this.onTap(side),
      rush: (on) => (this.game.wantRush = on),
      confirm: (k) => this.onConfirm(k),
      camera: () => this.cycleCamera(),
      ghost: () => this.toggleGhost(),
      pause: (k) => this.onPause(k),
      restart: () => this.onRestart(),
      mute: () => this.toggleMute(),
    });
    this.input.bindTouchButtons($('t-left'), $('t-right'), $('t-rush'));

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
    this.ghostView = new SnakeView({ maxCells: BOARD * BOARD, radial: 10, scaleMap: this.scaleMap });
    this.ghostView.makeGhost();
    this.ghostView.group.visible = false;
    this.scene.add(this.ghostView.group);
    this.ghostFade = 0;
    this.ghostWait = 0;

    this.rig.setMode('orbit', { instant: true });
    this.updateCameraUI();
    this.syncFood();
    this.precompile();
    this.last = performance.now();
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
    if (this.ghostView) show.push(this.ghostView.group);
    const prev = show.map((o) => o.visible);
    show.forEach((o) => (o.visible = true));
    const counts = [this.board.pillars, this.board.bands, this.board.warns, this.food.chain.dots].map((m) => m.count);
    const ident = new THREE.Matrix4();
    for (const m of [this.board.pillars, this.board.bands, this.board.warns, this.food.chain.dots]) {
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
    [this.board.pillars, this.board.bands, this.board.warns, this.food.chain.dots].forEach((m, i) => (m.count = counts[i]));
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
      this.snake = new SnakeView({ maxCells: BOARD * BOARD, radial: q.radial, scaleMap: this.scaleMap, skin: this.equippedSkin(), accessory: this.equippedAccessory() });
      if (old) {
        this.snake.headPos.copy(old.headPos);
        this.snake.headDir.copy(old.headDir);
        this.snake.wiggle = old.wiggle;
        this.scene.remove(old.group);
        old.dispose();
      }
      this.scene.add(this.snake.group);
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
    return Math.max(0, Math.min(this.unlockedLevel(), this.settings.startLevel || 0));
  }

  stepStartLevel(delta) {
    const next = Math.max(0, Math.min(this.unlockedLevel(), this.startLevel() + delta));
    if (next === this.startLevel()) return;
    this.settings.startLevel = next;
    saveSettings(this.settings);
    this.audio.ui();
    this.renderLevelSelect();
  }

  renderLevelSelect() {
    const L = this.startLevel();
    const max = this.unlockedLevel();
    const zone = zoneForLevel(L);
    const speed = (1000 / LEVEL_SPEEDS[L]).toFixed(1);
    $('lvl-sel-name').textContent = `Level ${L + 1}`;
    $('lvl-sel-zone').textContent = `${ZONE_NAMES[zone]} · ${speed} moves/s`;
    $('lvl-prev').disabled = L <= 0;
    $('lvl-next').disabled = L >= max;
    const box = $('lvl-select');
    box.className = `lvl-select z${zone}`;
    $('lvl-sel-hint').textContent = max === 0 ? 'Reach new levels to start from them here.' : max >= MAX_LEVEL ? 'Every level unlocked.' : `Unlocked up to level ${max + 1}. Reach further to unlock more.`;
  }

  // ---------------------------------------------------------------- ghost
  toggleGhost() {
    this.setGhost(!this.settings.ghost);
    this.toast(this.settings.ghost ? 'Ghost guide on: race the perfect snake' : 'Ghost guide off');
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
    const show = this.settings.ghost && inRun;
    if (!show) {
      v.group.visible = false;
      return;
    }
    if (this.state === 'playing') {
      for (const ev of this.ghost.update(dt * 1000)) {
        if (ev.respawned) this.ghostFade = 0;
        if (ev.ate) {
          const w = this.toWorld(this.ghost.head.x, this.ghost.head.z);
          this.effects.emit(w.x, 0.45, w.z, { count: ev.chainComplete ? 30 : 12, color: '#a8f0ff', speed: 1.8, up: 1.6, size: 0.16, life: 0.5 });
        }
      }
    }
    const target = this.state === 'dying' || this.state === 'over' ? 0 : 1;
    this.ghostFade += (target - this.ghostFade) * Math.min(1, dt * 3);
    this.ghostWait += ((this.ghost.paused && this.state === 'playing' ? 1 : 0) - this.ghostWait) * Math.min(1, dt * 4);
    v.group.visible = this.ghostFade > 0.02;
    v.ghostUniforms.uOpacity.value = this.ghostFade;
    v.ghostUniforms.uWait.value = this.ghostWait;
    v.update(this.ghost, clamp01(this.ghost.t), this.simTime, this.toWorld, {});
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
    this.rig.setMode('orbit', { reduceMotion: this.settings.reduceMotion });
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
    saveStats(st);
    const after = this.unlockStats();
    return [...SKINS, ...ACCESSORIES].filter((it) => it.unlock && !isUnlocked(it, before) && isUnlocked(it, after)).map((it) => it.name);
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
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post.scale = this.dyn.scale;
    this.post.setSize(size.x, size.y);
  }

  // ---------------------------------------------------------------- input
  get relativeSteer() {
    return this.cameraMode === 'fp' || this.cameraMode === 'tp';
  }

  onDirection(dir, src) {
    if (this.state === 'menu' && !this.openPanel && !this.garageOpen && (dir === 'left' || dir === 'right')) {
      this.stepStartLevel(dir === 'left' ? -1 : 1);
      return;
    }
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.preAim();
    if (this.relativeSteer) {
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
    if (['playing', 'paused', 'over', 'dying', 'countdown'].includes(this.state)) this.startGame();
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.audio.setVolumes({ muted: this.settings.muted });
    saveSettings(this.settings);
    this.toast(this.settings.muted ? 'Sound off' : 'Sound on');
  }

  unlockAudio() {
    const first = !this.audio.ctx;
    this.audio.unlock();
    if (first && this.audio.ctx && this.state === 'menu') this.audio.startMusic({ menu: true });
  }

  cycleCamera() {
    if (this.garageOpen) return;
    const i = CAMERA_ORDER.indexOf(this.cameraMode);
    this.setCamera(CAMERA_ORDER[(i + 1) % CAMERA_ORDER.length]);
  }

  setCamera(mode) {
    this.cameraMode = mode;
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
    this.game.reset();
    this.game.wantRush = this.input.rushKeys.size > 0;
    this.t = 0;
    this.lunge = 0;
    this.deathFlash = 0;
    this.food.hideAll();
    this.board.clear();
    this.syncFood();
    const startLevel = this.startLevel();
    this.game.startAtLevel(startLevel);
    this.ghost.reset(true);
    this.ghostFade = 0;
    const zone = this.game.zone;
    if (this.world.zone !== zone || this.world.transitioning) this.world.setZone(zone, { duration: 1.4 });
    this.audio.setMusicState({ menu: false, zone, level: startLevel, intensity: 0.1 });
    this.audio.startMusic({ menu: false });
    this.showScreen(null);
    $('hud').classList.remove('hidden');
    this.rig.setMode(this.cameraMode, { reduceMotion: this.settings.reduceMotion });
    this.updateCameraUI();
    this.state = 'countdown';
    this.protectUntil = this.simTime + 4;
    this.countdown = this.settings.reduceMotion ? 0.9 : 1.2;
    this.showCountdown('READY');
    this.audio.countdown(false);
    this.saidGo = false;
    if (this.relativeSteer) this.flashHint();
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
    this.audio.setPaused(false);
    this.audio.setMusicState({ menu: true, zone: 0, intensity: 0 });
    this.audio.startMusic({ menu: true });
    this.timers = [];
    this.game.reset();
    this.t = 0;
    this.lunge = 0;
    this.deathFlash = 0;
    this.food.hideAll();
    this.board.clear();
    this.syncFood();
    if (this.world.zone !== 0 || this.world.transitioning) this.world.setZone(0, { duration: 1.4 });
    $('hud').classList.add('hidden');
    this.rig.setMode('orbit', { reduceMotion: this.settings.reduceMotion });
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
    const wasRushing = this.game.rushing;
    this.handleStep(this.game.step(), wasRushing);
  }

  handleStep(ev, wasRushing) {
    const g = this.game;
    const delay = this.visualDelay();
    const rm = this.settings.reduceMotion;
    const at = (c) => this.toWorld(c.x, c.z);

    if (ev.ate) this.onEat(ev.ate, ev.levelUp);
    if (ev.bonusSpawned) this.toast('A prism appeared! Grab it fast');
    if (ev.bonusExpired) {
      const w = at(ev.bonusExpired);
      this.effects.emit(w.x, 0.5, w.z, { count: 20, color: '#c77dff', speed: 1.5, up: 1, life: 0.6 });
    }
    if (ev.chainSpawned) {
      this.toast('Orb chain! Eat them in order');
      this.audio.chainLink(0);
      for (const l of ev.chainSpawned.links) {
        const w = at(l);
        this.effects.emit(w.x, 0.4, w.z, { count: 10, color: '#38f6ff', speed: 1.2, up: 2, size: 0.18, life: 0.6 });
      }
    }
    if (ev.chainLink) {
      const c = ev.chainLink;
      this.later(delay, () => {
        const w = at(c);
        this.effects.emit(w.x, 0.5, w.z, { count: 26, color: '#38f6ff', speed: 3, up: 2.2, size: 0.22 });
        this.effects.shockwave(w.x, w.z, '#38f6ff', { max: 2.2, dur: 0.4 });
        this.popup(new THREE.Vector3(w.x, 0, w.z), `+${c.points}  ${c.index + 1}/${c.of}`, 'chain');
        this.audio.chainLink(c.index + 1);
      });
    }
    if (ev.chainComplete) {
      const c = ev.chainComplete;
      this.later(delay + 0.05, () => {
        const w = at(c);
        this.popup(new THREE.Vector3(w.x, 0.6, w.z), `CHAIN! +${c.bonus}`, 'chain big');
        this.effects.emit(w.x, 0.6, w.z, { count: 80, color: '#7ff8ff', speed: 5, up: 3, size: 0.3 });
        this.effects.shockwave(w.x, w.z, '#38f6ff', { max: 6, dur: 0.7 });
        this.audio.chainComplete();
        this.banner('Rush full!');
        if (!rm) {
          this.flash(0.22, '#9ff8ff');
          this.rig.kick += 6;
        }
      });
    }
    if (ev.chainBroken) {
      this.toast('Chain broken: wrong order');
      this.audio.chainBroken();
    }
    if (ev.chainExpired) this.toast('The orb chain faded');
    if (ev.preySpawned) {
      this.toast('A golden mouse! Catch it');
      this.audio.preySpotted();
      const w = at(ev.preySpawned);
      this.effects.emit(w.x, 0.2, w.z, { count: 24, color: '#d8c49a', speed: 1.6, up: 1.5, size: 0.2, life: 0.7 });
    }
    if (ev.caught) {
      const c = ev.caught;
      this.later(delay, () => {
        const w = at(c);
        this.popup(new THREE.Vector3(w.x, 0, w.z), `+${c.points}${c.combo > 1 ? ` x${c.combo}` : ''}`, 'prey');
        this.effects.emit(w.x, 0.4, w.z, { count: 60, color: '#ffd36a', speed: 4, up: 3, size: 0.28 });
        this.effects.shockwave(w.x, w.z, '#ffd36a', { max: 4, dur: 0.55 });
        this.audio.preyCaught();
        if (!rm) {
          this.flash(0.15, '#fff2b0');
          this.rig.kick += 4;
        }
      });
    }
    if (ev.preyEscaped) {
      this.toast('The mouse got away');
      this.audio.preyEscaped();
      const w = at(ev.preyEscaped);
      this.effects.emit(w.x, 0.15, w.z, { count: 30, color: '#b8a888', speed: 2, up: 1.2, size: 0.22, life: 0.6 });
    }
    if (ev.boost) {
      this.later(delay * 0.8, () => {
        const w = at(ev.boost);
        this.audio.boost();
        this.popup(new THREE.Vector3(w.x, 0, w.z), 'BOOST!', 'boost');
        this.effects.emit(w.x, 0.2, w.z, { count: 40, color: '#ffb020', speed: 3.5, up: 1.2, size: 0.24, life: 0.5 });
        if (!rm) this.rig.kick += 8;
      });
    }
    if (ev.obstaclesWarned) {
      this.audio.obstacleWarn();
      this.toast('Pillars rising! Watch the red warning rings');
    }
    if (ev.obstaclesRaised) {
      this.audio.obstacleRise();
      for (const o of ev.obstaclesRaised) {
        const w = at(o);
        this.effects.emit(w.x, 0.1, w.z, { count: 26, color: '#c8b8a0', speed: 2.4, up: 1.6, size: 0.24, life: 0.6 });
        this.effects.shockwave(w.x, w.z, '#ff8a5c', { max: 1.6, dur: 0.35 });
      }
      if (!rm) this.rig.shake += 0.08;
    }
    if (ev.padsSpawned) {
      for (const p of ev.padsSpawned) {
        const w = at(p);
        this.effects.emit(w.x, 0.1, w.z, { count: 14, color: '#ffd23f', speed: 1.2, up: 1.4, size: 0.18, life: 0.5 });
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
    const w = this.toWorld(ate.x, ate.z);
    const pos = new THREE.Vector3(w.x, 0, w.z);
    const delay = this.visualDelay();
    this.food.markEaten(ate.type, pos, delay);
    const prism = ate.type === 'prism';
    this.later(delay, () => {
      const rm = this.settings.reduceMotion;
      this.effects.emit(w.x, 0.45, w.z, {
        count: prism ? 70 : 34,
        color: prism ? '#e0aaff' : '#ff4d6d',
        speed: prism ? 4.5 : 3.2,
        up: 2.4,
        size: prism ? 0.32 : 0.24,
      });
      this.effects.emit(w.x, 0.45, w.z, { count: 14, color: '#ffffff', speed: 1.5, up: 3.5, size: 0.14, life: 0.5 });
      this.effects.shockwave(w.x, w.z, prism ? '#c77dff' : '#ff5a7a', { max: prism ? 4.5 : 2.6 });
      this.popup(pos, `+${ate.points}${ate.combo > 1 ? ` x${ate.combo}` : ''}`, prism ? 'prism' : '');
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
    const lv = $('hud-lvl');
    lv.classList.remove('bump');
    void lv.offsetWidth;
    lv.classList.add('bump');
    const hp = this.snake.headPos;
    this.world.pulse(hp.x, hp.z);
    this.protectUntil = this.simTime + (lu.zoneUp ? 5 : 1.5);
    if (lu.zoneUp) {
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
      this.banner(lu.level >= MAX_LEVEL ? 'Max speed!' : 'Speed up!');
      this.slowMo(1.1, 0.6);
      if (!this.settings.reduceMotion) this.rig.kick += 4;
    }
  }

  onDeath(ev) {
    const g = this.game;
    this.state = 'dying';
    this.t = 1; // the failed move never happened: hold the last pose
    this.dyingTime = 0;
    this.audio.death();
    this.audio.stopMusic({ fade: 1.0 });
    saveBest(g.best);
    const hp = this.snake.headPos;
    const won = ev.cause === 'win';
    this.later(0.08, () => {
      this.effects.emit(hp.x + this.snake.headDir.x * 0.4, 0.4, hp.z + this.snake.headDir.z * 0.4, {
        count: 60,
        color: won ? '#7dffb0' : '#ff5470',
        speed: 4,
        up: 3,
        size: 0.28,
      });
      this.effects.shockwave(hp.x, hp.z, won ? '#7dffb0' : '#ff3b5c', { max: 5, dur: 0.6 });
      this.deathFlash = 1;
      if (!this.settings.reduceMotion) {
        this.flash(0.25, won ? '#ffffff' : '#ff8090');
        this.rig.shake += 0.25;
      }
    });
    // Pull back to the overhead view so the player can see what happened.
    if (this.cameraMode !== 'overhead') this.later(0.55, () => this.rig.setMode('overhead', { reduceMotion: this.settings.reduceMotion }));
    this.later(1.25, () => this.showGameOver(ev.cause));
  }

  rank(score) {
    return score >= 6000 ? 'S' : score >= 3000 ? 'A' : score >= 1400 ? 'B' : score >= 500 ? 'C' : 'D';
  }

  showGameOver(cause) {
    const g = this.game;
    this.state = 'over';
    const unlocked = this.recordRun();
    $('over-unlocks').classList.toggle('hidden', !unlocked.length);
    if (unlocked.length) {
      $('over-unlocks').textContent = `Unlocked in the Garage: ${unlocked.join(', ')}!`;
      this.audio.chainComplete();
    }
    this.audio.gameOver();
    $('over-title').textContent = cause === 'win' ? 'Perfect board!' : 'Wipeout!';
    $('over-cause').textContent = {
      wall: 'You crashed into the wall.',
      body: 'You ran into your own body.',
      obstacle: 'You smashed into a pillar.',
      win: 'You filled the entire board!',
    }[cause];
    const rank = this.rank(g.score);
    const rk = $('over-rank');
    rk.textContent = rank;
    rk.className = `rank ${rank}`;
    $('over-score').textContent = g.score.toLocaleString();
    $('over-best').textContent = g.best.toLocaleString();
    $('over-length').textContent = g.cells.length;
    $('over-combo').textContent = `x${g.maxCombo}`;
    $('over-time').textContent = this.formatTime(g.time);
    $('over-zone').textContent = String(g.zone + 1);
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
    $('set-ghost').checked = !!s.ghost;
    $('set-ghost').addEventListener('change', () => this.setGhost($('set-ghost').checked));
    $('btn-ghost').addEventListener('click', () => this.toggleGhost());
    $('lvl-prev').addEventListener('click', () => this.stepStartLevel(-1));
    $('lvl-next').addEventListener('click', () => this.stepStartLevel(1));
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

    // first interaction anywhere unlocks audio (and starts the menu music)
    const unlock = () => this.unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
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
  }

  updateCameraUI() {
    $('hud-cam').textContent = CAMERA_NAMES[this.cameraMode];
    document.querySelectorAll('.cam-select .seg').forEach((b) => {
      const on = b.dataset.cam === this.cameraMode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on);
    });
  }

  toast(text) {
    const el = $('toast');
    el.textContent = text;
    this.placeToast(el);
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
  }

  // While a menu card is up, put the toast in free space next to it (below,
  // above, then beside) so it never covers the card; otherwise use the CSS spot.
  placeToast(el) {
    el.style.top = el.style.left = el.style.transform = '';
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
    el.style.transform = 'none';
  }

  banner(text) {
    const el = $('banner');
    $('banner-text').textContent = text;
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

  popup(pos, text, cls) {
    const v = pos.clone().setY(0.9).project(this.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return;
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
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
    this.setText('hud-score', g.score.toLocaleString());
    this.setText('hud-best', g.best.toLocaleString());
    this.setText('hud-length', String(g.cells.length));
    this.setText('hud-time', this.formatTime(g.time));
    if (this.settings.ghost) this.setText('hud-ghost', this.ghost.score.toLocaleString());
    this.setText('hud-level', String(g.level + 1));
    this.setText('hud-zone', ZONE_NAMES[g.zone]);
    // progress to the next speed level and zone
    const lvl = g.level;
    const prog = g.levelProgress();
    const maxed = prog.max;
    const left = prog.need - prog.into;
    this.setText('hud-lvl-next', maxed ? 'Max speed!' : `${left} apple${left === 1 ? '' : 's'} to Lv ${lvl + 2}`);
    this.setStyle('hud-lvl-fill', 'transform', `scaleX(${(prog.into / prog.need).toFixed(2)})`);
    if (this.lastHud.segs !== prog.need) {
      this.lastHud.segs = prog.need;
      $('hud-lvl-bar').style.setProperty('--segs', String(prog.need));
    }
    this.setClass($('hud-lvl'), 'max', maxed);
    const nz = ZONE_STARTS.findIndex((z) => z > lvl);
    this.setText('hud-zone-next', nz < 0 ? 'Final zone' : `Next zone: ${ZONE_NAMES[nz]} at Lv ${ZONE_STARTS[nz] + 1}`);
    this.setStyle('hud-rush', 'transform', `scaleX(${(g.rush / 100).toFixed(3)})`);
    const rushEl = $('hud-rush-wrap');
    this.setClass(rushEl, 'active', g.rushing);
    this.setClass(rushEl, 'full', g.rush >= 99.9);
    this.setClass($('hud-boost'), 'hidden', !g.boosting);
    const comboLeft = 1 - (g.time - g.lastEatTime) / COMBO_WINDOW_MS;
    const showCombo = g.combo > 1 && comboLeft > 0 && this.state !== 'over';
    this.setClass($('hud-combo'), 'hidden', !showCombo);
    if (showCombo) {
      this.setText('hud-combo-x', `x${g.combo}`);
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

    const view = this.relativeSteer && (this.rig.mode === 'fp' || this.rig.mode === 'tp') && (this.state === 'playing' || this.state === 'countdown' || this.state === 'paused');
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
    if (this.state !== 'playing' && this.state !== 'countdown') this.setClass($('fp-hint'), 'hidden', true);
    else this.lastHud['fp-hint:hidden'] = undefined;
  }

  viewForward() {
    const yaw = this.rig.viewYaw() ?? Math.atan2(this.snake.headDir.x, this.snake.headDir.z);
    return { x: Math.sin(yaw), z: Math.cos(yaw) };
  }

  updateCompass() {
    const g = this.game;
    const f = this.viewForward();
    const hp = this.snake.headPos;
    const aim = (target, needle) => {
      if (!target) {
        this.setClass(needle, 'hidden', true);
        return null;
      }
      this.setClass(needle, 'hidden', false);
      const w = this.toWorld(target.x, target.z);
      const vx = w.x - hp.x;
      const vz = w.z - hp.z;
      const rel = Math.atan2(f.x * vz - f.z * vx, f.x * vx + f.z * vz);
      needle.style.transform = `rotate(${rel.toFixed(3)}rad)`;
      return Math.abs(target.x - g.head.x) + Math.abs(target.z - g.head.z);
    };
    const d = aim(g.food, $('needle-orb'));
    aim(g.bonus, $('needle-prism'));
    aim(g.prey, $('needle-prey'));
    this.setText('compass-text', d == null ? '' : String(d));
  }

  drawMinimap() {
    const c = this.mmCtx || (this.mmCtx = $('minimap').getContext('2d'));
    const W = c.canvas.width;
    const g = this.game;
    c.clearRect(0, 0, W, W);
    const f = this.viewForward();
    const a = Math.atan2(f.x, -f.z);
    const cell = W / (BOARD * 1.45);
    const o = (BOARD - 1) / 2;
    c.save();
    c.translate(W / 2, W / 2);
    c.rotate(-a);
    c.fillStyle = 'rgba(120, 210, 120, 0.22)';
    c.strokeStyle = 'rgba(56, 246, 255, 0.9)';
    c.lineWidth = 2;
    c.fillRect((-BOARD / 2) * cell, (-BOARD / 2) * cell, BOARD * cell, BOARD * cell);
    c.strokeRect((-BOARD / 2) * cell, (-BOARD / 2) * cell, BOARD * cell, BOARD * cell);
    const dot = (x, z, color, r = 0.5) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc((x - o) * cell, (z - o) * cell, cell * r, 0, Math.PI * 2);
      c.fill();
    };
    const sq = (x, z, color) => {
      c.fillStyle = color;
      c.fillRect((x - o - 0.45) * cell, (z - o - 0.45) * cell, cell * 0.9, cell * 0.9);
    };
    for (const ob of g.obstacles) sq(ob.x, ob.z, ob.solid ? '#d8d0c0' : 'rgba(255, 60, 90, 0.7)');
    for (const p of g.pads) dot(p.x, p.z, '#ff8a2a', 0.6);
    if (g.chain) for (let i = g.chain.next; i < g.chain.links.length; i++) dot(g.chain.links[i].x, g.chain.links[i].z, '#38f6ff', i === g.chain.next ? 0.75 : 0.5);
    if (g.food) dot(g.food.x, g.food.z, '#ff4d6d', 0.75);
    if (g.bonus) dot(g.bonus.x, g.bonus.z, '#d9a3ff', 0.8);
    if (g.prey) dot(g.prey.x, g.prey.z, '#fff2b0', 0.7);
    if (this.settings.ghost) for (const c of this.ghost.cells) dot(c.x, c.z, 'rgba(168, 240, 255, 0.55)', 0.32);
    for (let i = g.cells.length - 1; i >= 1; i--) dot(g.cells[i].x, g.cells[i].z, '#17c3b2', 0.48);
    dot(g.head.x, g.head.z, '#ffffff', 0.62);
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath();
    c.moveTo(W / 2, 6);
    c.lineTo(W / 2 - 5, 14);
    c.lineTo(W / 2 + 5, 14);
    c.fill();
  }

  // ---------------------------------------------------------------- loop
  // Slow motion while a level-up card covers the screen, so nobody dies
  // behind it. Eases in and out; gameplay slows, camera and world don't.
  slowMo(seconds, scale) {
    this.slowUntil = Math.max(this.slowUntil || 0, performance.now() / 1000 + seconds);
    this.slowScale = Math.min(this.slowScale ?? 1, scale);
  }

  frame(now) {
    const rawDt = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.1, rawDt);
    const slowing = this.state === 'playing' && now / 1000 < (this.slowUntil || 0);
    if (!slowing) this.slowScale = 1;
    const tsTarget = slowing ? this.slowScale : 1;
    this.timeScale = (this.timeScale ?? 1) + (tsTarget - (this.timeScale ?? 1)) * Math.min(1, dt * (slowing ? 7 : 3));
    // gameplay time: snake, game clock, ghost, pickups and particles
    const gdt = dt * this.timeScale;
    this.audio.setSlow(this.timeScale < 0.8);
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
        setTimeout(() => {
          if (this.state === 'playing') $('countdown').classList.add('hidden');
        }, 350);
      }
    }

    if (this.state === 'playing') {
      this.t += (gdt * 1000) / g.currentInterval();
      let guard = 0;
      while (this.t >= 1 && this.state === 'playing' && guard++ < 4) {
        this.t -= 1;
        this.tick();
      }
      if (this.state === 'playing') this.t = Math.min(this.t, 1);
    }

    if (this.state === 'dying' || this.state === 'over') {
      this.dyingTime = (this.dyingTime || 0) + dt;
      this.lunge = Math.min(CORNER + 0.05 - HEAD_LEAD, this.dyingTime * 4);
    }
    this.deathFlash = Math.max(0, this.deathFlash - dt * 1.2);

    const fast = g.rushing || g.boosting;
    const targetFx = this.state === 'playing' ? g.intensity() : 0;
    this.speedFx += (targetFx - this.speedFx) * Math.min(1, dt * 3);
    this.rushGlow += ((fast && this.state === 'playing' ? 1 : 0) - this.rushGlow) * Math.min(1, dt * 8);

    this.snake.update(g, clamp01(this.t), this.simTime, this.toWorld, {
      lunge: this.lunge,
      rushGlow: this.rushGlow,
      deathFlash: this.deathFlash,
    });
    this.snake.setRim(this.world.p.rimColor, 0.35 + this.world.p.rimIntensity * 0.25);
    this.updateGhost(gdt);
    if (fast && this.state === 'playing' && Math.random() < 0.8) {
      const hp = this.snake.headPos;
      const hd = this.snake.headDir;
      this.effects.emit(hp.x - hd.x * 0.5, 0.3, hp.z - hd.z * 0.5, {
        count: 2, color: g.boosting ? '#ffb020' : this.snake.trailColor || '#5ff6ff', speed: 0.6, up: 0.6, size: 0.18, life: 0.45, gravity: 0, spread: 0.5,
      });
    }

    const view = this.rig.mode === 'fp' || this.rig.mode === 'tp';
    this.food.update(gdt, this.simTime, { reduceMotion: rm, beam: view });
    this.syncFood();
    const headingYaw = Math.atan2(this.snake.headDir.x, this.snake.headDir.z);
    this.board.applyPalette(this.world.p);
    this.board.sync(g, this.toWorld, gdt, this.simTime, headingYaw);
    const playing = this.state === 'playing' || this.state === 'countdown' || this.state === 'paused';
    this.effects.updateGuide(g, this.toWorld, playing && this.settings.guide && view);
    this.effects.update(gdt);
    const rs = this.post.renderSize;
    const pxScale = rs.y / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.world.update(dt, { level: this.state === 'menu' ? 0 : g.level, reduceMotion: rm, pxScale });
    this.world.updateWalls(g, dt, this.state === 'playing');
    // Chase / first-person cameras aim along the snake's next move (a queued
    // turn if there is one), so they start turning the moment a key is
    // pressed, at most one move ahead of the snake.
    const steering = this.state === 'playing' || this.state === 'countdown';
    this.rig.update(dt, this.snake, { speedFx: this.speedFx, reduceMotion: rm, aim: steering ? g.queue[0] || g.dir : null });
    // The first-person camera sits inside the head; hide it once we're there.
    this.snake.head.visible = !(this.rig.mode === 'fp' && this.rig.blend > 0.85);
    this.effects.uniforms.scale.value = pxScale;

    // music follows the action
    const inGame = this.state === 'playing' || this.state === 'countdown' || this.state === 'paused';
    const intensity = clamp01(0.12 + (g.level / MAX_LEVEL) * 0.6 + ((g.combo - 1) / 7) * 0.2 + (fast ? 0.15 : 0));
    this.audio.setMusicState({ menu: !inGame && this.state !== 'dying' && this.state !== 'over', intensity, rush: fast && this.state === 'playing', zone: this.state === 'menu' ? 0 : g.zone, level: g.level });

    this.renderFrame(dt, view, rm);
    if (this.state !== 'menu') this.updateHud();
    this.measure(rawDt);
  }

  renderFrame(dt, view, rm) {
    const P = this.post.params;
    const pp = this.world.postParams();
    this.flashAmt = Math.max(0, this.flashAmt - dt * 2.6);
    let danger = 0;
    const g = this.game;
    if (view && this.state === 'playing') {
      const look = g.lookAhead(3);
      if (look.blocked && look.free === 0) danger = 0.42 + 0.2 * Math.sin(this.simTime * 18);
      else if (look.blocked && look.free === 1) danger = 0.16;
    }
    const speed = rm ? 0 : Math.max(0, this.speedFx - 0.25) * (view ? 1.3 : 0.45) + this.rushGlow * (view ? 0.5 : 0.15);
    const trans = this.world.transitioning ? 0.5 : 0;
    const slow = 1 - (this.timeScale ?? 1);
    P.uBloom.value = pp.bloom + this.rushGlow * 0.18 + this.flashAmt * 0.5;
    P.uSat.value = pp.sat * (1 - slow * 0.3);
    P.uContrast.value = pp.contrast;
    P.uTint.value.copy(pp.tint);
    P.uLift.value.copy(pp.lift);
    P.uVignette.value = pp.vignette + this.rushGlow * 0.1 + slow * 0.35;
    P.uSpeed.value = speed;
    P.uLines.value = rm ? 0 : Math.max(0, this.speedFx - 0.2) * (view ? 1.2 : 0.5) + this.rushGlow * 0.6;
    P.uChroma.value = rm ? 0 : this.rushGlow * 0.7 + trans + slow * 0.6;
    P.uDanger.value = danger;
    P.uFlash.value = Math.min(0.6, this.flashAmt);
    P.uFlashColor.value.copy(this.flashColor);
    P.uTime.value = this.simTime;
    P.uCenter.value.set(0.5, view ? 0.56 : 0.5);
    this.renderer.toneMappingExposure = pp.exposure;
    this.post.render(this.scene, this.camera, { threshold: pp.threshold });
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
        if (this.state === 'playing') this.toast(`Graphics set to ${this.activeQuality} for smoother play`);
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
