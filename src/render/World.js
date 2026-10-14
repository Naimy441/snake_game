import * as THREE from 'three';
import { compileZones, blendZones } from './zones.js';
import { Sky } from './Sky.js';
import { Ocean, Waterfalls } from './Water.js';
import { Island, GRASS_Y } from './Island.js';
import { Scenery } from './Scenery.js';
import { Ambient } from './Ambient.js';
import { makeGrassDetail, makeCloudTexture, makeWindowTexture } from './textures.js';
import { ZONE_STARTS, MAX_LEVEL } from '../game/SnakeGame.js';

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// The whole environment: sky, sea, the floating island arena and one set of
// scenery per zone. When the zone changes, a glowing wave sweeps out from the
// arena: the old zone's props shrink away behind it, the new ones grow in,
// and the palette, lighting, fog and reflections blend across.
export class World {
  constructor({ size, renderer }) {
    this.size = size;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.time = 0;
    this.zones = compileZones(THREE);
    this.p = blendZones(this.zones[0], this.zones[0], 0, {});
    this.zone = 0;
    this.trans = null;
    this.levelMood = 0;
    this.pulseT = 1;
    this.sunDir = new THREE.Vector3();

    this.sky = new Sky(makeCloudTexture());
    this.scene.add(this.sky.group);
    this.ocean = new Ocean();
    this.scene.add(this.ocean.mesh);
    this.waterfalls = new Waterfalls();
    this.island = new Island({ size, maxAnisotropy: renderer.capabilities.getMaxAnisotropy(), detailTex: makeGrassDetail() });
    this.island.buildWaterfalls(this.waterfalls);
    this.scene.add(this.island.group);
    this.scenery = new Scenery({ islandChecker: this.island.checker, windowTex: makeWindowTexture(), waterfallMaterial: this.waterfalls.material });
    for (const z of this.scenery.zones) this.scene.add(z.group);
    this.ambient = new Ambient(520);
    this.scene.add(this.ambient.group);

    this.buildLights();
    this.buildWave();
    this.scene.fog = new THREE.Fog('#a9dcff', 70, 330);
    this.buildEnvMaps();
    this.applyPalette();
  }

  toWorld(x, z) {
    const o = (this.size - 1) / 2;
    return { x: x - o, z: z - o };
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#5d7f3c', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 3.2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    // a cool back light that gives everything a crisp rim, never casts shadows
    this.rim = new THREE.DirectionalLight('#9fd0ff', 0.9);
    this.scene.add(this.rim);
  }

  buildWave() {
    this.waveMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 160, 1), this.waveMat);
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.position.y = GRASS_Y + 0.4;
    this.wave.visible = false;
    this.wave.frustumCulled = false;
    this.scene.add(this.wave);
  }

  // One prefiltered reflection map per zone, rendered from its sky.
  buildEnvMaps() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const sky = new Sky(null);
    sky.clouds.visible = false;
    envScene.add(sky.group);
    const blobs = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(40, 18, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      const a = (i / 8) * Math.PI * 2;
      m.position.set(Math.cos(a) * 300, 20, Math.sin(a) * 300);
      m.lookAt(0, 20, 0);
      blobs.add(m);
    }
    envScene.add(blobs);
    const dir = new THREE.Vector3();
    this.envMaps = this.zones.map((z) => {
      this.sunFromPalette(z, dir);
      sky.apply(z, dir);
      sky.uniforms.uStars.value = 0;
      blobs.visible = z.cyber > 0 || z.stars > 0;
      blobs.children.forEach((m, i) => m.material.color.copy(i % 2 ? z.strip : z.rimColor).multiplyScalar(2));
      return pmrem.fromScene(envScene, 0.02, 0.1, 1000).texture;
    });
    pmrem.dispose();
    this.scene.environment = this.envMaps[0];
  }

  sunFromPalette(p, out) {
    const el = THREE.MathUtils.degToRad(p.sunElev);
    const az = THREE.MathUtils.degToRad(p.sunAzim);
    return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  }

  setShadowQuality(q) {
    const size = q === 'high' ? 2048 : 1024;
    this.sun.castShadow = q !== 'low';
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  setParticleBudget(n) {
    this.ambient.setBudget(n);
  }

  // Jump or sweep to a zone.
  setZone(z, { instant = false, duration = 3.4 } = {}) {
    if (this.trans) this.finishTransition();
    if (z === this.zone) return false;
    if (instant) {
      this.scenery.setState(this.zone, 1, false);
      this.scenery.setState(z, 1, true);
      this.zone = z;
      this.scene.environment = this.envMaps[z];
      return true;
    }
    this.trans = { from: this.zone, to: z, t: 0, dur: duration, envSwapped: false };
    return true;
  }

  finishTransition() {
    const tr = this.trans;
    this.scenery.setState(tr.from, 1, false);
    this.scenery.setState(tr.to, 1, true);
    this.zone = tr.to;
    this.scene.environment = this.envMaps[tr.to];
    this.wave.visible = false;
    this.trans = null;
  }

  get transitioning() {
    return !!this.trans;
  }

  // A glowing ring that rolls across the board from (x, z), used for level-ups.
  pulse(x, z) {
    this.pulseT = 0;
    this.island.boardUniforms.uPulseAt.value.set(x, z);
  }

  applyPalette() {
    const p = this.p;
    const lf = this.levelMood; // 0..1 intensity within the current zone
    const sun = this.sunFromPalette(p, this.sunDir);
    this.sky.apply(p, sun);
    this.ocean.apply(p, sun);
    this.waterfalls.apply(p);
    this.island.apply(p);
    this.sun.color.copy(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.sun.position.copy(sun).multiplyScalar(60);
    this.rim.color.copy(p.rimColor);
    this.rim.intensity = p.rimIntensity;
    this.rim.position.set(-sun.x * 60, 25, -sun.z * 60);
    this.hemi.color.copy(p.hemiSky);
    this.hemi.groundColor.copy(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.scene.fog.color.copy(p.fogColor);
    this.scene.fog.near = p.fogNear;
    this.scene.fog.far = p.fogFar;
    this.scene.environmentIntensity = p.envIntensity;
    this.ocean.uniforms.uFogNear.value = p.fogNear * 1.6;
    this.ocean.uniforms.uFogFar.value = p.fogFar * 1.9;
    for (const z of this.scenery.zones) z.uniforms.uGlowBoost.value = 1 + lf * 0.6;
    const birds = clamp01(1 - p.stars * 1.5 - p.cyber);
    this.ambient.apply(p, 0.45 + lf * 0.55, birds);
  }

  // Post-processing look for the current blend.
  postParams() {
    const p = this.p;
    const lf = this.levelMood;
    return {
      bloom: p.bloom + lf * 0.12,
      threshold: p.threshold,
      sat: p.sat + lf * 0.05,
      contrast: p.contrast,
      tint: p.tint,
      lift: p.lift,
      exposure: p.exposure,
      vignette: p.vignette,
    };
  }

  update(dt, { level = 0, reduceMotion = false, pxScale = 400 } = {}) {
    this.time += dt;
    const zoneStart = ZONE_STARTS[this.trans ? this.trans.to : this.zone];
    const zoneEnd = ZONE_STARTS[(this.trans ? this.trans.to : this.zone) + 1] ?? MAX_LEVEL + 1;
    const lfTarget = clamp01((level - zoneStart) / Math.max(1, zoneEnd - zoneStart - 1));
    this.levelMood += (lfTarget - this.levelMood) * Math.min(1, dt * 1.2);

    if (this.trans) {
      const tr = this.trans;
      tr.t = Math.min(1, tr.t + dt / tr.dur);
      const f = smooth(clamp01((tr.t - 0.08) / 0.7));
      blendZones(this.zones[tr.from], this.zones[tr.to], f, this.p);
      this.scenery.setState(tr.from, clamp01(tr.t * 1.3), false);
      const inT = clamp01((tr.t - 0.12) / 0.88);
      this.scenery.setState(tr.to, inT, true);
      if (!tr.envSwapped && tr.t > 0.45) {
        this.scene.environment = this.envMaps[tr.to];
        tr.envSwapped = true;
      }
      // the visible wave front rides just ahead of the props growing in
      const R = inT * 290 + 6;
      this.wave.visible = inT < 1;
      this.wave.scale.setScalar(R);
      this.waveMat.color.copy(this.zones[tr.to].strip).multiplyScalar(2.5);
      this.waveMat.opacity = Math.sin(Math.min(1, tr.t * 1.1) * Math.PI) * 0.9;
      if (tr.t >= 1) this.finishTransition();
    } else {
      blendZones(this.zones[this.zone], this.zones[this.zone], 0, this.p);
    }
    this.applyPalette();

    if (this.pulseT < 1) {
      this.pulseT = Math.min(1, this.pulseT + dt / 1.1);
      this.island.boardUniforms.uPulse.value = this.pulseT >= 1 ? 0 : this.pulseT;
    }
    this.island.boardUniforms.uTime.value = this.time;
    this.sky.update(dt * (reduceMotion ? 0.3 : 1), this.time);
    this.ocean.uniforms.uTime.value = this.time;
    this.waterfalls.uniforms.uTime.value = this.time;
    this.scenery.update(dt, this.time, reduceMotion);
    this.ambient.update(dt, this.time, pxScale);
  }

  updateWalls(game, dt, active) {
    this.island.updateWalls(game, dt, active, this.p.strip, this.time);
  }

  // Compile every shader once with all zones visible, so nothing compiles
  // (and stutters) the first time a zone appears mid-game.
  precompile(camera) {
    const vis = this.scenery.zones.map((z) => z.group.visible);
    for (const z of this.scenery.zones) z.group.visible = true;
    this.wave.visible = true;
    this.renderer.compile(this.scene, camera);
    this.scenery.zones.forEach((z, i) => (z.group.visible = vis[i]));
    this.wave.visible = false;
  }
}
