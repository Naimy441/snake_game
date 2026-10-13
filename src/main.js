import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SnakeGame, DIRS, COMBO_WINDOW_MS } from './game/SnakeGame.js';
import { World } from './render/World.js';
import { SnakeView } from './render/SnakeView.js';
import { FoodView } from './render/FoodView.js';
import { Effects } from './render/Effects.js';
import { CameraRig } from './render/CameraRig.js';
import { CORNER } from './render/SnakePath.js';
import { makeGlowTexture, makeScaleNormalMap } from './render/textures.js';
import { AudioEngine } from './audio/Audio.js';
import { Input } from './Input.js';
import { loadSettings, saveSettings, loadBest, saveBest, QUALITY } from './settings.js';

const $ = (id) => document.getElementById(id);
const BOARD = 21;
const CAMERA_NAMES = { overhead: 'Overhead', fp: 'First-person' };

class App {
  constructor() {
    this.settings = loadSettings();
    this.canvas = $('scene');
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
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
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('touch-device');

    this.game = new SnakeGame({ size: BOARD, best: loadBest() });
    this.world = new World({ size: BOARD, renderer: r });
    this.scene = this.world.scene;
    this.toWorld = (x, z) => this.world.toWorld(x, z);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 1200);
    this.rig = new CameraRig(this.camera, BOARD);

    this.glowTex = makeGlowTexture();
    this.scaleMap = makeScaleNormalMap();
    this.effects = new Effects(600);
    this.scene.add(this.effects.group);
    this.food = new FoodView(this.glowTex);
    this.scene.add(this.food.group);

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
    this.cameraMode = this.settings.camera === 'fp' ? 'fp' : 'overhead';
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.perfWindow = { time: 0, frames: 0, grace: 2 };
    this.lastHud = {};
    this.runStart = 0;

    this.activeQuality = this.settings.quality === 'auto' ? (this.isTouch ? 'medium' : 'high') : this.settings.quality;
    this.applyQuality();

    this.input = new Input(this.canvas, {
      direction: (d, src) => this.onDirection(d, src),
      turn: (s) => this.onTurn(s),
      tap: (side) => this.onTap(side),
      rush: (on) => (this.game.wantRush = on),
      confirm: (k) => this.onConfirm(k),
      camera: () => this.toggleCamera(),
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
    });
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });

    this.rig.setMode('orbit', { instant: true });
    this.updateCameraUI();
    this.syncFood();
    this.last = performance.now();
    this.renderer.setAnimationLoop((now) => this.frame(now));
    window.__coil = this; // handy for debugging and automated tests
  }

  // ---------------------------------------------------------------- quality
  applyQuality() {
    const q = QUALITY[this.activeQuality];
    this.q = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.world.setShadowQuality(q.shadows);
    this.effects.setParticleBudget(q.particles);
    if (!this.snake || this.snake.radial !== q.radial) {
      const old = this.snake;
      this.snake = new SnakeView({ maxCells: BOARD * BOARD, radial: q.radial, scaleMap: this.scaleMap });
      if (old) {
        this.snake.headPos.copy(old.headPos);
        this.snake.headDir.copy(old.headDir);
        this.snake.wiggle = old.wiggle;
        this.scene.remove(old.group);
        old.dispose();
      }
      this.scene.add(this.snake.group);
    }
    if (q.bloom && !this.composer) this.buildComposer();
    this.resize();
    this.perfWindow = { time: 0, frames: 0, grace: 2 };
    const note = $('quality-note');
    if (note) note.textContent = this.settings.quality === 'auto' ? `Auto is currently using ${this.activeQuality} quality.` : '';
  }

  buildComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.4, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.rig.fitOverhead(w / h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    const sl = $('speedlines');
    sl.width = w;
    sl.height = h;
    this.slCtx = sl.getContext('2d');
    this.slClear = false;
  }

  // ---------------------------------------------------------------- input
  onDirection(dir, src) {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    let ok;
    if (this.cameraMode === 'fp') {
      // In first person, left/right steer relative to the snake; up/down do nothing.
      if (dir === 'left') ok = this.game.turn(-1);
      else if (dir === 'right') ok = this.game.turn(1);
      else if (src !== 'swipe') this.flashHint();
    } else {
      ok = this.game.queueDirection(DIRS[dir]);
    }
    if (ok) this.audio.turn();
  }

  onTurn(side) {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    if (this.game.turn(side)) this.audio.turn();
  }

  onTap(side) {
    if (this.cameraMode === 'fp') this.onTurn(side === 'left' ? -1 : 1);
  }

  onConfirm(kind) {
    if (this.openPanel) return kind !== 'space' ? (this.closePanel(), true) : false;
    if (this.state === 'menu') {
      this.startGame();
      return true;
    }
    if (this.state === 'over') {
      this.startGame();
      return true;
    }
    if (this.state === 'paused' && kind !== 'space') {
      this.resume();
      return true;
    }
    return false;
  }

  onPause(key) {
    if (this.openPanel) {
      this.closePanel();
      return;
    }
    if (this.state === 'playing' || this.state === 'countdown') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  onRestart() {
    if (this.openPanel) return;
    if (['playing', 'paused', 'over', 'dying', 'countdown'].includes(this.state)) this.startGame();
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.audio.setVolumes({ muted: this.settings.muted });
    saveSettings(this.settings);
    this.toast(this.settings.muted ? 'Sound off' : 'Sound on');
  }

  toggleCamera() {
    this.setCamera(this.cameraMode === 'fp' ? 'overhead' : 'fp');
  }

  setCamera(mode) {
    this.cameraMode = mode;
    this.settings.camera = mode;
    saveSettings(this.settings);
    if (['playing', 'paused', 'countdown'].includes(this.state)) {
      this.rig.setMode(mode, { reduceMotion: this.settings.reduceMotion });
      if (mode === 'fp') this.flashHint();
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
    this.audio.unlock();
    this.audio.start();
    this.audio.startMusic();
    this.timers = [];
    this.game.reset();
    this.game.wantRush = this.input.rushKeys.size > 0;
    this.t = 0;
    this.lunge = 0;
    this.deathFlash = 0;
    this.food.orb.hide();
    this.food.prism.hide();
    this.syncFood();
    this.showScreen(null);
    $('hud').classList.remove('hidden');
    this.rig.setMode(this.cameraMode, { reduceMotion: this.settings.reduceMotion });
    this.updateCameraUI();
    this.state = 'countdown';
    this.countdown = this.settings.reduceMotion ? 0.8 : 1.1;
    this.showCountdown('READY');
    this.runStart = this.simTime;
    if (this.cameraMode === 'fp') this.flashHint();
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.prevState = this.state;
    this.state = 'paused';
    this.showScreen('screen-pause');
    this.audio.stopMusic();
    $('countdown').classList.add('hidden');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.audio.unlock();
    this.audio.startMusic();
    this.showScreen(null);
    this.state = 'countdown';
    this.countdown = 0.6;
    this.showCountdown('GO');
  }

  toMenu() {
    this.state = 'menu';
    this.audio.stopMusic();
    this.timers = [];
    this.game.reset();
    this.t = 0;
    this.lunge = 0;
    this.deathFlash = 0;
    this.food.orb.hide();
    this.food.prism.hide();
    this.syncFood();
    $('hud').classList.add('hidden');
    this.rig.setMode('orbit', { reduceMotion: this.settings.reduceMotion });
    this.showScreen('screen-start');
    this.updateCameraUI();
  }

  showCountdown(text) {
    const el = $('countdown');
    el.innerHTML = `<span>${text}</span>`;
    el.classList.remove('hidden');
  }

  later(seconds, fn) {
    this.timers.push({ at: this.simTime + seconds, fn });
  }

  // ---------------------------------------------------------------- game events
  tick() {
    const g = this.game;
    const wasRushing = g.rushing;
    const ev = g.step();
    if (ev.ate) this.onEat(ev.ate);
    if (ev.bonusSpawned) {
      this.toast('A prism appeared! Grab it fast');
    }
    if (ev.bonusExpired) {
      const w = this.toWorld(ev.bonusExpired.x, ev.bonusExpired.z);
      this.effects.emit(w.x, 0.5, w.z, { count: 20, color: '#c77dff', speed: 1.5, up: 1, life: 0.6 });
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

  onEat(ate) {
    const g = this.game;
    const w = this.toWorld(ate.x, ate.z);
    const pos = new THREE.Vector3(w.x, 0, w.z);
    // The logical head is a step ahead of the drawn head; play the pickup
    // effects when the drawn head actually reaches the food.
    const delay = (0.75 * g.currentInterval()) / 1000;
    this.food.markEaten(ate.type, pos, delay);
    const prism = ate.type === 'prism';
    this.later(delay, () => {
      const rm = this.settings.reduceMotion;
      this.effects.emit(w.x, 0.45, w.z, {
        count: prism ? 70 : 36,
        color: prism ? '#e0aaff' : '#ffd060',
        speed: prism ? 4.5 : 3.2,
        up: 2.4,
        size: prism ? 0.32 : 0.24,
      });
      this.effects.emit(w.x, 0.45, w.z, { count: 14, color: '#ffffff', speed: 1.5, up: 3.5, size: 0.14, life: 0.5 });
      this.effects.shockwave(w.x, w.z, prism ? '#c77dff' : '#ffcf4a', { max: prism ? 4.5 : 2.6 });
      this.popup(pos, `+${ate.points}${ate.combo > 1 ? ` x${ate.combo}` : ''}`, prism ? 'prism' : '');
      if (prism) {
        this.audio.prism();
        if (!rm) this.flash(0.25);
      } else this.audio.eat(ate.combo);
      if (!rm) this.rig.kick += prism ? 5 : 2.5;
      if (this.cameraMode === 'overhead') this.rig.shake += prism ? 0.08 : 0.03;
    });
    if (ate.combo > 1) {
      const el = $('hud-combo');
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
    if (ate.levelUp) {
      this.later(delay, () => {
        this.audio.levelUp();
        this.toast(`Speed level ${g.level + 1}!`);
      });
      this.audio.setIntensity(g.level);
    }
  }

  onDeath(ev) {
    const g = this.game;
    this.state = 'dying';
    this.t = 1; // the failed move never happened: hold the last pose
    this.dyingTime = 0;
    this.audio.death();
    this.audio.stopMusic();
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
        this.flash(0.18);
        this.rig.shake += 0.25;
      }
    });
    // Pull back to the overhead view so the player can see what happened.
    if (this.cameraMode === 'fp') this.later(0.55, () => this.rig.setMode('overhead', { reduceMotion: this.settings.reduceMotion }));
    this.later(1.25, () => this.showGameOver(ev.cause));
  }

  showGameOver(cause) {
    const g = this.game;
    this.state = 'over';
    $('over-title').textContent = cause === 'win' ? 'Perfect board!' : 'Wipeout!';
    $('over-cause').textContent =
      cause === 'wall' ? 'You crashed into the wall.' : cause === 'body' ? 'You ran into your own body.' : 'You filled the entire board!';
    $('over-score').textContent = g.score.toLocaleString();
    $('over-best').textContent = g.best.toLocaleString();
    $('over-length').textContent = g.cells.length;
    $('over-combo').textContent = `x${g.maxCombo}`;
    $('over-time').textContent = `${Math.round(g.time / 1000)}s`;
    $('over-newbest').classList.toggle('hidden', !(g.newBest && g.score > 0));
    $('start-best').textContent = g.best.toLocaleString();
    this.showScreen('screen-over');
    $('btn-again').focus({ preventScroll: true });
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
    $('btn-cam').addEventListener('click', () => this.toggleCamera());
    document.querySelectorAll('.cam-select .seg').forEach((b) => b.addEventListener('click', () => this.setCamera(b.dataset.cam)));
    document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => this.openPanelById(`panel-${b.dataset.open}`)));
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closePanel()));
    $('start-best').textContent = this.game.best.toLocaleString();

    // settings
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
    const bindRange = (id, key) => {
      const el = $(id);
      el.value = s[key];
      el.addEventListener('input', () => {
        s[key] = Number(el.value);
        this.audio.setVolumes({ sfx: s.sfx, music: s.music });
        saveSettings(s);
      });
      el.addEventListener('change', () => {
        this.audio.unlock();
        if (key === 'sfx') this.audio.eat(1);
      });
    };
    bindRange('set-sfx', 'sfx');
    bindRange('set-music', 'music');
    $('fps').classList.toggle('hidden', !s.showFps);
    this.applyMotion();

    // first click anywhere unlocks audio
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
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
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  flash(amount) {
    const el = $('flash');
    el.style.transition = 'none';
    el.style.opacity = amount;
    void el.offsetWidth;
    el.style.transition = 'opacity 0.35s ease-out';
    el.style.opacity = 0;
  }

  popup(pos, text, cls) {
    const v = pos.clone().setY(0.9).project(this.camera);
    if (v.z > 1) return;
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

  updateHud() {
    const g = this.game;
    this.setText('hud-score', g.score.toLocaleString());
    this.setText('hud-best', g.best.toLocaleString());
    this.setText('hud-length', String(g.cells.length));
    this.setText('hud-level', String(g.level + 1));
    $('hud-rush').style.width = `${g.rush}%`;
    document.querySelector('.rush').classList.toggle('active', g.rushing);
    const comboLeft = 1 - (g.time - g.lastEatTime) / COMBO_WINDOW_MS;
    const showCombo = g.combo > 1 && comboLeft > 0 && this.state !== 'over';
    $('hud-combo').classList.toggle('hidden', !showCombo);
    if (showCombo) {
      this.setText('hud-combo-x', `x${g.combo}`);
      $('hud-combo-bar').style.width = `${Math.max(0, comboLeft) * 100}%`;
    }
    const fp = this.cameraMode === 'fp' && this.rig.mode === 'fp' && (this.state === 'playing' || this.state === 'countdown' || this.state === 'paused');
    document.getElementById('app').classList.toggle('fp-active', fp);
    const aids = fp && this.settings.minimap;
    $('compass').classList.toggle('hidden', !aids);
    $('minimap').classList.toggle('hidden', !aids);
    if (aids) {
      this.updateCompass();
      this.drawMinimap();
    }
    const showTouch = this.isTouch && (this.state === 'playing' || this.state === 'countdown');
    $('touch').classList.toggle('hidden', !showTouch);
    $('touch').classList.toggle('overhead', this.cameraMode !== 'fp');
    if (this.state !== 'playing' && this.state !== 'countdown') $('fp-hint').classList.add('hidden');

    // danger vignette in first person when the next cell ahead is fatal
    let danger = 0;
    if (fp && this.state === 'playing') {
      const look = g.lookAhead(3);
      if (look.blocked && look.free === 0) danger = 0.55 + 0.25 * Math.sin(this.simTime * 18);
      else if (look.blocked && look.free === 1) danger = 0.22;
    }
    $('vignette').style.opacity = danger;
  }

  fpForward() {
    const yaw = this.rig.fpYaw ?? Math.atan2(this.snake.headDir.x, this.snake.headDir.z);
    return { x: Math.sin(yaw), z: Math.cos(yaw) };
  }

  updateCompass() {
    const g = this.game;
    const f = this.fpForward();
    const hp = this.snake.headPos;
    const aim = (food, needle) => {
      if (!food) {
        needle.classList.add('hidden');
        return null;
      }
      needle.classList.remove('hidden');
      const w = this.toWorld(food.x, food.z);
      const vx = w.x - hp.x;
      const vz = w.z - hp.z;
      const rel = Math.atan2(f.x * vz - f.z * vx, f.x * vx + f.z * vz);
      needle.style.transform = `rotate(${rel}rad)`;
      return Math.abs(food.x - g.head.x) + Math.abs(food.z - g.head.z);
    };
    const d = aim(g.food, $('needle-orb'));
    aim(g.bonus, $('needle-prism'));
    this.setText('compass-text', d == null ? '' : String(d));
  }

  drawMinimap() {
    const c = $('minimap').getContext('2d');
    const W = c.canvas.width;
    const g = this.game;
    c.clearRect(0, 0, W, W);
    const f = this.fpForward();
    const a = Math.atan2(f.x, -f.z);
    const cell = W / (BOARD * 1.45);
    const o = (BOARD - 1) / 2;
    c.save();
    c.translate(W / 2, W / 2);
    c.rotate(-a);
    c.fillStyle = 'rgba(120, 210, 120, 0.25)';
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
    if (g.food) dot(g.food.x, g.food.z, '#ffcf4a', 0.75);
    if (g.bonus) dot(g.bonus.x, g.bonus.z, '#d9a3ff', 0.8);
    for (let i = g.cells.length - 1; i >= 1; i--) dot(g.cells[i].x, g.cells[i].z, '#17c3b2', 0.48);
    dot(g.head.x, g.head.z, '#ffffff', 0.62);
    c.restore();
    // heading marker
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.beginPath();
    c.moveTo(W / 2, 6);
    c.lineTo(W / 2 - 5, 14);
    c.lineTo(W / 2 + 5, 14);
    c.fill();
  }

  drawSpeedLines(intensity) {
    const ctx = this.slCtx;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    if (intensity < 0.04) {
      if (!this.slClear) {
        ctx.clearRect(0, 0, w, h);
        this.slClear = true;
      }
      return;
    }
    this.slClear = false;
    ctx.clearRect(0, 0, w, h);
    const fp = this.rig.mode === 'fp';
    const cx = w / 2;
    const cy = fp ? h * 0.46 : h / 2;
    const maxR = Math.hypot(w, h) / 2;
    const n = Math.floor((fp ? 46 : 26) * intensity);
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r0 = (0.55 + Math.random() * 0.4) * maxR;
      const len = (0.08 + Math.random() * 0.22) * maxR * intensity;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.55, (0.2 + Math.random() * 0.4) * intensity)})`;
      ctx.lineWidth = 1 + Math.random() * 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + c * r0, cy + s * r0);
      ctx.lineTo(cx + c * (r0 + len), cy + s * (r0 + len));
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- loop
  frame(now) {
    const rawDt = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.1, rawDt);
    this.last = now;
    this.input.pollGamepad();
    const g = this.game;
    const rm = this.settings.reduceMotion;

    if (this.state !== 'paused') {
      this.simTime += dt;
      for (let i = 0; i < this.timers.length; ) {
        if (this.timers[i].at <= this.simTime) {
          const t = this.timers.splice(i, 1)[0];
          t.fn();
        } else i++;
      }
    }

    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0.45 && $('countdown').textContent !== 'GO!') this.showCountdown('GO!');
      if (this.countdown <= 0) {
        this.state = 'playing';
        setTimeout(() => {
          if (this.state === 'playing') $('countdown').classList.add('hidden');
        }, 350);
      }
    }

    if (this.state === 'playing') {
      this.t += (dt * 1000) / g.currentInterval();
      let guard = 0;
      while (this.t >= 1 && this.state === 'playing' && guard++ < 4) {
        this.t -= 1;
        this.tick();
      }
      if (this.state === 'playing') this.t = Math.min(this.t, 1);
    }

    if (this.state === 'dying' || this.state === 'over') {
      this.dyingTime = (this.dyingTime || 0) + dt;
      this.lunge = Math.min(CORNER + 0.05, this.dyingTime * 4);
    }
    this.deathFlash = Math.max(0, this.deathFlash - dt * 1.2);

    const targetFx = this.state === 'playing' ? g.intensity() : 0;
    this.speedFx += (targetFx - this.speedFx) * Math.min(1, dt * 3);
    this.rushGlow += ((g.rushing && this.state === 'playing' ? 1 : 0) - this.rushGlow) * Math.min(1, dt * 8);

    this.snake.update(g, Math.min(1, Math.max(0, this.t)), this.simTime, this.toWorld, {
      lunge: this.lunge,
      rushGlow: this.rushGlow,
      deathFlash: this.deathFlash,
    });
    if (g.rushing && this.state === 'playing' && Math.random() < 0.7) {
      const hp = this.snake.headPos;
      this.effects.emit(hp.x - this.snake.headDir.x * 0.5, 0.35, hp.z - this.snake.headDir.z * 0.5, {
        count: 2, color: '#5ff6ff', speed: 0.6, up: 0.6, size: 0.18, life: 0.45, gravity: 0, spread: 0.5,
      });
    }

    this.food.update(dt, this.simTime, { reduceMotion: rm, lights: this.q.foodLights, beam: this.cameraMode === 'fp' });
    this.syncFood();
    const playing = this.state === 'playing' || this.state === 'countdown' || this.state === 'paused';
    this.effects.updateGuide(g, this.toWorld, playing && this.settings.guide && this.rig.mode === 'fp');
    this.effects.update(dt);
    this.world.update(dt, g.level, rm);
    this.world.updateWalls(g, dt, this.state === 'playing');
    this.rig.update(dt, this.snake, { speedFx: this.speedFx, reduceMotion: rm });
    // The first-person camera sits inside the head; hide it once we're there.
    this.snake.head.visible = !(this.rig.mode === 'fp' && this.rig.blend > 0.85);

    // particle size in pixels
    const px = this.renderer.getDrawingBufferSize(this.tmpV2 || (this.tmpV2 = new THREE.Vector2())).y;
    this.effects.uniforms.scale.value = px / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));

    if (this.bloom) this.bloom.strength = 0.38 + this.rushGlow * 0.2;
    if (this.q.bloom && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    this.drawSpeedLines(rm ? 0 : Math.max(0, this.speedFx - 0.15) * 1.2);
    if (this.state !== 'menu') this.updateHud();
    this.measure(rawDt);
  }

  measure(dt) {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      if (this.settings.showFps) $('fps').textContent = `${Math.round(this.fps)} fps · ${this.activeQuality}`;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    // Auto quality: step down if the game can't hold a smooth frame rate.
    if (this.settings.quality !== 'auto' || this.state !== 'playing') return;
    const p = this.perfWindow;
    if (p.grace > 0) {
      p.grace -= dt;
      return;
    }
    p.time += dt;
    p.frames++;
    if (p.time >= 3) {
      const fps = p.frames / p.time;
      p.time = 0;
      p.frames = 0;
      if (fps < 45 && this.activeQuality !== 'low') {
        this.activeQuality = this.activeQuality === 'high' ? 'medium' : 'low';
        this.applyQuality();
        this.toast(`Graphics set to ${this.activeQuality} for smoother play`);
      }
    }
  }
}

new App();
