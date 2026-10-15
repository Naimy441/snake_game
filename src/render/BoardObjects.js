import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAX_OBSTACLES } from '../game/SnakeGame.js';
import { makeCheckerMaterial } from './materials.js';

const PAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PAD_FS = `uniform sampler2D uTex; uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uOn;
varying vec2 vUv;
void main(){
  float m = texture2D(uTex, vec2(vUv.x, vUv.y * 1.5 - uTime * 1.6)).r;
  vec2 c = abs(vUv - 0.5);
  float frame = smoothstep(0.43, 0.47, max(c.x, c.y)) * smoothstep(0.5, 0.48, max(c.x, c.y));
  vec3 col = mix(uA, uB, vUv.y) * m * 2.4 + uB * frame * 2.0;
  float a = max(m * 0.95, frame) * uOn;
  gl_FragColor = vec4(col * uOn, a);
}`;

// Pillars that rise at level-ups (after a warning on the floor) and boost pads.
// In the sky there are no pillars and the pads become floating boost rings.
export class BoardObjects {
  constructor({ glowTex, ringTex, chevronTex, checker }) {
    this.group = new THREE.Group();
    const col = new THREE.CylinderGeometry(0.4, 0.46, 1.15, 8);
    col.translate(0, 0.575, 0);
    const cap = new THREE.CylinderGeometry(0.47, 0.42, 0.14, 8);
    cap.translate(0, 1.22, 0);
    const base = new THREE.CylinderGeometry(0.5, 0.52, 0.12, 8);
    base.translate(0, 0.06, 0);
    // same two-tone checker as the island cliffs, so pillars match the zone
    this.pillarMat = makeCheckerMaterial(checker, { scale: new THREE.Vector2(4, 3) });
    this.pillarMat.roughness = 0.6;
    this.pillars = new THREE.InstancedMesh(mergeGeometries([col, cap, base]), this.pillarMat, MAX_OBSTACLES);
    this.pillars.castShadow = true;
    this.pillars.receiveShadow = true;
    this.pillars.count = 0;
    this.pillars.frustumCulled = false;
    const band = new THREE.TorusGeometry(0.43, 0.05, 6, 16);
    band.rotateX(Math.PI / 2);
    band.translate(0, 0.85, 0);
    this.bandMat = new THREE.MeshBasicMaterial({ color: '#38f6ff' });
    this.bands = new THREE.InstancedMesh(band, this.bandMat, MAX_OBSTACLES);
    this.bands.count = 0;
    this.bands.frustumCulled = false;
    // warning decal: pulsing ring + cross on the floor
    this.warnMat = new THREE.MeshBasicMaterial({ map: ringTex, color: new THREE.Color('#ff3355').multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const wg = new THREE.PlaneGeometry(1.25, 1.25);
    wg.rotateX(-Math.PI / 2);
    wg.translate(0, 0.035, 0);
    this.warns = new THREE.InstancedMesh(wg, this.warnMat, MAX_OBSTACLES);
    this.warns.count = 0;
    this.warns.frustumCulled = false;
    this.warns.renderOrder = 3;
    this.group.add(this.pillars, this.bands, this.warns);

    this.anim = new Map(); // id -> { rise }
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpP = new THREE.Vector3();
    this.tmpS = new THREE.Vector3();

    // boost pads
    this.pads = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.06, 0.92),
        new THREE.MeshStandardMaterial({ color: '#20242e', roughness: 0.3, metalness: 0.8 })
      );
      plate.position.y = 0.03;
      plate.receiveShadow = true;
      const u = { uTex: { value: chevronTex }, uTime: { value: 0 }, uA: { value: new THREE.Color('#ff3a1f') }, uB: { value: new THREE.Color('#ffd23f') }, uOn: { value: 1 } };
      const arrows = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.8),
        new THREE.ShaderMaterial({ uniforms: u, vertexShader: PAD_VS, fragmentShader: PAD_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      arrows.rotation.x = -Math.PI / 2;
      arrows.position.y = 0.07;
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 1.8),
        new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color('#ffb020'), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.025;
      const spin = new THREE.Group();
      spin.add(arrows);
      const ground = new THREE.Group();
      ground.add(plate, glow, spin);
      // sky version: a spinning gold gyroscope of two hoops around a core
      const air = new THREE.Group();
      const hoopMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb020').multiplyScalar(2.2), fog: false });
      const hoopGeo = new THREE.TorusGeometry(0.42, 0.04, 8, 40);
      const h1 = new THREE.Mesh(hoopGeo, hoopMat);
      const h2 = new THREE.Mesh(hoopGeo, hoopMat);
      h2.rotation.y = Math.PI / 2;
      const gyro = new THREE.Group();
      gyro.add(h1, h2);
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.13, 0),
        new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ff8a1a', emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.4 })
      );
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffb020', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(1.7);
      air.add(gyro, core, halo);
      air.position.y = 0.3;
      air.visible = false;
      g.add(ground, air);
      g.visible = false;
      g.userData = { u, spin, id: null, appear: 0, yaw: 0, ground, air, gyro, core };
      this.group.add(g);
      this.pads.push(g);
    }
  }

  applyPalette(p) {
    this.bandMat.color.copy(p.strip).multiplyScalar(2.2);
  }

  // sky: { floorY, ceilY } of the flight box when flying, else null
  sync(game, toWorld, dt, time, headingYaw, sky = null) {
    // obstacles
    let np = 0;
    let nw = 0;
    const seen = new Set();
    for (const o of game.obstacles) {
      seen.add(o.id);
      const w = toWorld(o.x, o.z);
      let a = this.anim.get(o.id);
      if (!a) {
        a = { rise: 0, warn: 0 };
        this.anim.set(o.id, a);
      }
      if (o.solid) {
        a.rise = Math.min(1, a.rise + dt * 3.2);
        const e = a.rise;
        const sY = e < 1 ? 1 - Math.pow(1 - e, 3) + Math.sin(e * Math.PI) * 0.25 : 1;
        this.tmpP.set(w.x, 0, w.z);
        this.tmpQ.identity();
        this.tmpS.set(1, Math.max(0.01, sY), 1);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.pillars.setMatrixAt(np, this.tmpM);
        this.bands.setMatrixAt(np, this.tmpM);
        np++;
      } else {
        a.warn += dt;
        const left = Math.max(0, (o.solidAt - game.time) / 1000);
        const speed = left < 0.8 ? 20 : 9;
        const s = 0.85 + 0.2 * Math.sin(a.warn * speed);
        this.tmpP.set(w.x, 0, w.z);
        this.tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a.warn * 2);
        this.tmpS.set(s, 1, s);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.warns.setMatrixAt(nw++, this.tmpM);
      }
    }
    for (const id of this.anim.keys()) if (!seen.has(id)) this.anim.delete(id);
    this.pillars.count = np;
    this.bands.count = np;
    this.warns.count = nw;
    this.pillars.instanceMatrix.needsUpdate = true;
    this.bands.instanceMatrix.needsUpdate = true;
    this.warns.instanceMatrix.needsUpdate = true;
    this.warnMat.opacity = 0.65 + 0.35 * Math.sin(time * 14);

    // pads: arrows always point along the snake's heading
    const ids = new Set(game.pads.map((p) => p.id));
    for (const g of this.pads) {
      if (g.userData.id !== null && !ids.has(g.userData.id)) {
        g.visible = false;
        g.userData.id = null;
      }
    }
    for (const p of game.pads) {
      const g = this.pads.find((x) => x.userData.id === p.id) || this.pads.find((x) => x.userData.id === null);
      if (!g) continue;
      const u = g.userData;
      if (u.id !== p.id) {
        u.id = p.id;
        u.appear = 0;
        g.visible = true;
        u.yaw = headingYaw;
      }
      const w = toWorld(p.x, p.z, p.y);
      g.position.set(w.x, w.y || 0, w.z);
      u.ground.visible = !sky;
      u.air.visible = !!sky;
      if (sky) {
        u.gyro.rotation.x = time * 1.7;
        u.gyro.rotation.y = time * 1.1;
        u.core.rotation.y = time * 3;
      }
      u.appear = Math.min(1, u.appear + dt * 3);
      g.scale.setScalar(Math.max(0.001, 1 - Math.pow(1 - u.appear, 3)));
      let d = headingYaw - u.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      u.yaw += d * Math.min(1, dt * 10);
      u.spin.rotation.y = u.yaw + Math.PI;
      u.u.uTime.value = time;
    }
  }

  clear() {
    this.anim.clear();
    this.pillars.count = 0;
    this.bands.count = 0;
    this.warns.count = 0;
    for (const g of this.pads) {
      g.visible = false;
      g.userData.id = null;
    }
  }
}
