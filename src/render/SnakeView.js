import * as THREE from 'three';
import { SnakePath, CORNER } from './SnakePath.js';
import { skinById } from '../skins.js';
import { buildAccessory, disposeAccessory } from './accessories.js';

const STEP = 0.2; // ring spacing along the body, in cells
// How far ahead of the old lag the drawn head runs, in cells. The game logic
// is always up to a cell ahead of what is drawn; trimming the lag makes turns
// show sooner, while staying small enough that a turn never visibly snaps.
export const HEAD_LEAD = 0.2;
const UP = new THREE.Vector3(0, 1, 0);

const AURA_VS = `uniform float uPush; varying vec3 vN; varying vec3 vV;
void main(){ vec3 p = position + normal * uPush; vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const AURA_FS = `uniform vec3 uColor; uniform float uAmount; uniform float uTime; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float a = f * uAmount * (0.75 + 0.25 * sin(uTime * 30.0)); gl_FragColor = vec4(uColor * a * 2.2, a); }`;

const ANIM = { none: 0, rainbow: 1, pulse: 2, flow: 3 };

// Jetpack flame: white-hot at the nozzle, through gold to a pink-orange tip
// (uv.y runs from the nozzle (0) to the tip (1)), flickering and a little
// bluer when rushing.
const FLAME_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FLAME_FS = `uniform float uTime; uniform float uHot; varying vec2 vUv;
void main(){
  float y = vUv.y;
  float n = 0.75 + 0.25 * sin(vUv.x * 40.0 + uTime * 60.0 + y * 12.0);
  vec3 hot = mix(vec3(1.0, 0.97, 0.85), vec3(0.75, 0.95, 1.0), uHot);
  vec3 col = mix(hot, vec3(1.0, 0.62, 0.15), smoothstep(0.0, 0.45, y));
  col = mix(col, vec3(1.0, 0.25, 0.45), smoothstep(0.45, 1.0, y));
  float a = pow(1.0 - y, 1.6) * n;
  gl_FragColor = vec4(col * a * 2.6, a);
}`;

const GHOST_VS = `varying vec3 vN; varying vec3 vV; varying float vD;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vD = uv.x / 2.2; gl_Position = projectionMatrix * mv; }`;
const GHOST_FS = `uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform float uWait; varying vec3 vN; varying vec3 vV; varying float vD;
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.7);
  float band = 0.75 + 0.25 * sin(vD * 5.0 - uTime * 6.0);
  float pulse = mix(1.0, 0.6 + 0.4 * sin(uTime * 4.0), uWait);
  float a = clamp((0.3 + 0.55 * f) * band * pulse, 0.0, 0.9) * uOpacity;
  gl_FragColor = vec4(uColor * (0.85 + 1.4 * f), a);
}`;

// Standard material plus: a fresnel rim light, per-vertex glow (aGlow, in the
// surface colour) and skin animations (rainbow hue cycling, pulsing or
// flowing glow) driven by the distance along the body (uv.x).
function withSkin(mat, uniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow; varying float vBodyD;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow; vBodyD = uv.x / 2.2;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uRimColor; uniform float uRim; uniform float uAnim; uniform float uTime; uniform float uGlowAmt;
        varying float vGlow; varying float vBodyD;
        vec3 skinHue(float h){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return k * k * (3.0 - 2.0 * k); }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (uAnim > 0.5 && uAnim < 1.5) diffuseColor.rgb *= mix(vec3(1.0), skinHue(fract(vBodyD * 0.32 - uTime * 0.35)), 0.92);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += uRimColor * rimF * uRim;
        float gp = 1.0;
        if (uAnim > 1.5 && uAnim < 2.5) gp = 0.55 + 0.45 * sin(uTime * 3.0 - vBodyD * 1.4);
        if (uAnim > 2.5) gp = 0.3 + 0.9 * pow(0.5 + 0.5 * sin(vBodyD * 2.2 - uTime * 7.0), 3.0);
        totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlowAmt * gp;`
      );
  };
  mat.customProgramCacheKey = () => 'snake-skin';
  return mat;
}

export class SnakeView {
  constructor({ maxCells, radial = 14, scaleMap, skin = 'viper', accessory = 'none' }) {
    this.group = new THREE.Group();
    this.path = new SnakePath(maxCells + 4);
    this.radial = radial;
    this.maxRings = Math.ceil((maxCells + 2) / STEP) + 4;
    this.sample = new Float32Array(6);
    this.headPos = new THREE.Vector3();
    this.headDir = new THREE.Vector3(0, 0, -1);
    this.headUp = new THREE.Vector3(0, 1, 0);
    this.upRef = new THREE.Vector3(0, 1, 0);
    this.tmpSide = new THREE.Vector3();
    this.tmpTan = new THREE.Vector3();
    this.tmpUp = new THREE.Vector3();
    this.tmpX = new THREE.Vector3();
    this.tmpM = new THREE.Matrix4();
    this.travel = 0;
    this.wiggle = 1;

    const R = radial;
    const vCount = this.maxRings * (R + 1);
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(vCount * 3);
    this.normals = new Float32Array(vCount * 3);
    const colors = new Float32Array(vCount * 3);
    const uvs = new Float32Array(vCount * 2);
    for (let i = 0; i < this.maxRings; i++) {
      for (let j = 0; j <= R; j++) {
        const k = i * (R + 1) + j;
        uvs[k * 2] = i * STEP * 2.2;
        uvs[k * 2 + 1] = (j / R) * 4;
      }
    }
    const idx = new Uint32Array((this.maxRings - 1) * R * 6);
    let p = 0;
    for (let i = 0; i < this.maxRings - 1; i++) {
      for (let j = 0; j < R; j++) {
        const a = i * (R + 1) + j;
        const b = a + R + 1;
        idx[p++] = a;
        idx[p++] = a + 1;
        idx[p++] = b;
        idx[p++] = b;
        idx[p++] = a + 1;
        idx[p++] = b + 1;
      }
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.normAttr = new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('normal', this.normAttr);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(vCount), 1));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geo = geo;

    this.rimUniforms = {
      uRimColor: { value: new THREE.Color('#9fd0ff') },
      uRim: { value: 0.6 },
      uAnim: { value: 0 },
      uTime: { value: 0 },
      uGlowAmt: { value: 1 },
    };
    this.bodyMat = withSkin(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.34,
        metalness: 0.08,
        normalMap: scaleMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
        envMapIntensity: 1.3,
        emissive: new THREE.Color('#00ffd0'),
        emissiveIntensity: 0,
      }),
      this.rimUniforms
    );
    this.body = new THREE.Mesh(geo, this.bodyMat);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.body.frustumCulled = false;
    this.group.add(this.body);

    // Boost aura: the same tube drawn again, pushed out along its normals,
    // as an additive fresnel glow. Shares the geometry and its draw range.
    this.auraUniforms = { uPush: { value: 0.07 }, uColor: { value: new THREE.Color('#38c8ff') }, uAmount: { value: 0 }, uTime: { value: 0 } };
    this.auraMat = new THREE.ShaderMaterial({
      uniforms: this.auraUniforms,
      vertexShader: AURA_VS,
      fragmentShader: AURA_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.aura = new THREE.Mesh(geo, this.auraMat);
    this.aura.frustumCulled = false;
    this.aura.visible = false;
    this.group.add(this.aura);

    this.buildHead(scaleMap);
    this.buildJetpack();
    this.applySkin(skin);
    this.setAccessory(accessory);
  }

  // Recolour the body and head for a skin (cheap: runs once per change).
  applySkin(id) {
    const skin = skinById(id);
    this.skin = skin;
    const R = this.radial;
    const col = new THREE.Color();
    const colors = this.geo.attributes.color;
    const glow = this.geo.attributes.aGlow;
    for (let i = 0; i < this.maxRings; i++) {
      const d = i * STEP;
      for (let j = 0; j <= R; j++) {
        const theta = (j / R) * Math.PI * 2;
        const k = i * (R + 1) + j;
        skin.color(d, theta, col);
        colors.array[k * 3] = col.r;
        colors.array[k * 3 + 1] = col.g;
        colors.array[k * 3 + 2] = col.b;
        glow.array[k] = skin.glow ? skin.glow(d, theta) : 0;
      }
    }
    colors.needsUpdate = true;
    glow.needsUpdate = true;
    const m = skin.mat || {};
    for (const [mat, ns] of [[this.bodyMat, 0.6], [this.headMat, 0.35]]) {
      mat.roughness = m.roughness ?? 0.34;
      mat.metalness = m.metalness ?? 0.08;
      mat.envMapIntensity = m.env ?? 1.3;
      mat.normalScale.setScalar((m.normal ?? 1) * ns);
    }
    this.rimUniforms.uAnim.value = ANIM[skin.anim || 'none'];
    this.auraUniforms.uColor.value.set(skin.aura);
    this.trailColor = skin.trail;
    // head
    const h = skin.head;
    const top = new THREE.Color(h.top);
    const side = new THREE.Color(h.side);
    const bel = new THREE.Color(h.belly);
    const acc = new THREE.Color(h.accent);
    const hp = this.headShape;
    const hc = this.headGeo.attributes.color;
    const hg = this.headGeo.attributes.aGlow;
    const headGlow = skin.glow ? skin.glow(0, Math.PI / 2) * 0.5 : 0;
    for (let i = 0; i < hp.length / 3; i++) {
      const x = hp[i * 3];
      const y = hp[i * 3 + 1];
      const z = hp[i * 3 + 2];
      const tp = y / 0.275;
      if (tp < -0.15) col.copy(bel);
      else {
        col.copy(side).lerp(top, Math.max(0, Math.min(1, tp * 1.3)));
        if (tp > 0.55 && Math.abs(x) < 0.09 && z > -0.2 && z < 0.12) col.copy(acc);
      }
      hc.array[i * 3] = col.r;
      hc.array[i * 3 + 1] = col.g;
      hc.array[i * 3 + 2] = col.b;
      hg.array[i] = headGlow;
    }
    hc.needsUpdate = true;
    hg.needsUpdate = true;
    this.eyeMat.color.set(h.eye);
    this.eyeMat.emissive.set(h.eye);
    this.eyeMat.emissiveIntensity = h.eyeGlow ?? 0.9;
  }

  // Turn this view into the ghost bot: a translucent, glowing fresnel shell
  // with light bands flowing along the body, no shadows or accessories.
  makeGhost(color = '#a8f0ff') {
    this.isGhost = true;
    this.ghostUniforms = { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uOpacity: { value: 1 }, uWait: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.ghostUniforms,
      vertexShader: GHOST_VS,
      fragmentShader: GHOST_FS,
      transparent: true,
      depthWrite: false,
    });
    this.ghostMat = mat;
    this.body.material = mat;
    this.body.castShadow = false;
    this.body.receiveShadow = false;
    this.body.renderOrder = 4;
    this.head.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      if (o === this.headAura) return;
      o.material = mat;
      o.renderOrder = 4;
    });
    this.tongue.visible = false;
    this.setAccessory('none');
    this.aura.visible = false;
    this.group.remove(this.jetpack);
    this.jetpack = null;
  }

  // The jetpack for Sunset Heavens: twin tanks on a harness around the body,
  // with flickering additive flames that stretch when rushing.
  buildJetpack() {
    const jp = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#dfe4ee', metalness: 0.85, roughness: 0.22, envMapIntensity: 1.6 });
    const dark = new THREE.MeshStandardMaterial({ color: '#262b38', metalness: 0.6, roughness: 0.4 });
    const accent = new THREE.MeshStandardMaterial({ color: '#ff7a2a', emissive: '#ff5a1a', emissiveIntensity: 1.4, roughness: 0.3 });
    this.jetMats = [metal, dark, accent];
    const harness = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.035, 8, 28), dark);
    harness.scale.set(1, 0.84, 1);
    harness.position.y = -0.02;
    jp.add(harness);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.34), dark);
    plate.position.set(0, 0.29, -0.02);
    jp.add(plate);
    const tankGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.44, 16);
    tankGeo.rotateX(Math.PI / 2);
    const capGeo = new THREE.SphereGeometry(0.085, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeo.rotateX(Math.PI / 2);
    const ringGeo = new THREE.TorusGeometry(0.088, 0.014, 6, 18);
    const nozGeo = new THREE.CylinderGeometry(0.055, 0.08, 0.1, 14, 1, true);
    nozGeo.rotateX(Math.PI / 2);
    const flameGeo = new THREE.ConeGeometry(0.07, 1, 14, 1, true);
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.5);
    this.jetUniforms = { uTime: { value: 0 }, uHot: { value: 0 } };
    const flameMat = new THREE.ShaderMaterial({
      uniforms: this.jetUniforms,
      vertexShader: FLAME_VS,
      fragmentShader: FLAME_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.jetMats.push(flameMat);
    this.flames = [];
    this.nozzles = [];
    for (const sx of [-1, 1]) {
      const x = sx * 0.15;
      const tank = new THREE.Mesh(tankGeo, metal);
      tank.position.set(x, 0.33, 0);
      tank.castShadow = true;
      const cap = new THREE.Mesh(capGeo, metal);
      cap.position.set(x, 0.33, 0.22);
      const ring = new THREE.Mesh(ringGeo, accent);
      ring.position.set(x, 0.33, 0.08);
      const noz = new THREE.Mesh(nozGeo, dark);
      noz.position.set(x, 0.33, -0.27);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(x, 0.33, -0.31);
      flame.renderOrder = 5;
      const inner = new THREE.Mesh(flameGeo, flameMat);
      inner.scale.set(0.55, 0.55, 0.6);
      flame.add(inner);
      jp.add(tank, cap, ring, noz, flame);
      this.flames.push(flame);
      this.nozzles.push(new THREE.Vector3(x, 0.33, -0.36));
    }
    this.nozzleWorld = [new THREE.Vector3(), new THREE.Vector3()];
    this.jetBack = new THREE.Vector3(0, 0, -1);
    this.jetAmt = 0;
    jp.visible = false;
    jp.scale.setScalar(0.001);
    this.jetpack = jp;
    this.group.add(jp);
  }

  // Up for the head: world-up while level; climbing or diving straight, the
  // back faces away from (or towards) the heading the snake left.
  headUpTarget(tan, facing, flying, out) {
    if (!flying || Math.abs(tan.y) < 0.98) {
      out.copy(UP).addScaledVector(tan, -tan.y);
      if (out.lengthSq() > 1e-6) return out.normalize();
    }
    const f = facing || { x: 0, z: -1 };
    const sg = Math.sign(tan.y) || 1;
    return out.set(-f.x * sg, 0, -f.z * sg).normalize();
  }

  placeJetpack(cx, cy, cz, tan, up, side, r) {
    const jp = this.jetpack;
    jp.position.set(cx, cy, cz);
    this.tmpX.crossVectors(up, tan).normalize();
    this.tmpM.makeBasis(this.tmpX, up, tan);
    jp.quaternion.setFromRotationMatrix(this.tmpM);
    this.jetRadius = r;
  }

  updateJetpack(game, time, dt, rushGlow) {
    const target = game.flying ? 1 : 0;
    this.jetAmt += (target - this.jetAmt) * Math.min(1, dt * 4);
    const jp = this.jetpack;
    jp.visible = this.jetAmt > 0.01;
    if (!jp.visible) return;
    const a = this.jetAmt;
    jp.scale.setScalar(Math.max(0.001, a + Math.sin(Math.min(1, a) * Math.PI) * 0.25));
    this.jetUniforms.uTime.value = time;
    this.jetUniforms.uHot.value = rushGlow;
    const len = (0.42 + rushGlow * 0.55) * a;
    for (const f of this.flames) {
      const flick = 0.85 + 0.15 * Math.sin(time * 47 + f.position.x * 40) + 0.08 * Math.sin(time * 91);
      f.scale.set(1 + rushGlow * 0.4, 1 + rushGlow * 0.4, Math.max(0.01, len * flick));
    }
    jp.updateMatrixWorld();
    this.nozzles.forEach((n, i) => this.nozzleWorld[i].copy(n).applyMatrix4(jp.matrixWorld));
    this.jetBack.set(0, 0, -1).applyQuaternion(jp.quaternion);
  }

  setAccessory(id) {
    if (this.accessory) {
      this.head.remove(this.accessory);
      disposeAccessory(this.accessory);
      this.accessory = null;
    }
    const a = buildAccessory(id);
    if (a) {
      this.accessory = a;
      this.head.add(a);
    }
    this.accessoryId = id;
  }

  buildHead(scaleMap) {
    const head = new THREE.Group();
    const g = new THREE.SphereGeometry(0.5, 40, 28);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) * 0.8;
      let y = pos.getY(i) * 0.55;
      let z = pos.getZ(i) * 0.95;
      if (z > 0) {
        const f = 1 - 0.38 * Math.pow(z / 0.475, 1.6);
        x *= f;
        y *= 0.75 + 0.25 * f;
      }
      if (y < 0) y *= 0.62;
      pos.setXYZ(i, x, y, z);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
    g.computeVertexNormals();
    this.headGeo = g;
    this.headShape = Float32Array.from(pos.array);
    this.headMat = withSkin(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.3,
        metalness: 0.08,
        normalMap: scaleMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        envMapIntensity: 1.4,
        emissive: new THREE.Color('#00ffd0'),
        emissiveIntensity: 0,
      }),
      this.rimUniforms
    );
    const skull = new THREE.Mesh(g, this.headMat);
    skull.castShadow = true;
    head.add(skull);
    const headAura = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), this.auraMat);
    headAura.scale.set(0.95, 0.62, 1.15);
    this.headAura = headAura;
    headAura.visible = false;
    head.add(headAura);

    const eyeMat = (this.eyeMat = new THREE.MeshStandardMaterial({
      color: '#ffd23f',
      emissive: '#ff9f1c',
      emissiveIntensity: 1.2,
      roughness: 0.05,
      metalness: 0.1,
    }));
    const pupilMat = new THREE.MeshBasicMaterial({ color: '#05060a' });
    const eyeGeo = new THREE.SphereGeometry(0.085, 20, 14);
    const pupilGeo = new THREE.BoxGeometry(0.02, 0.11, 0.05);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(s * 0.22, 0.11, 0.12);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(s * 0.065, 0, 0.03);
      eye.add(pupil);
      head.add(eye);
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), pupilMat);
      nostril.position.set(s * 0.06, 0.07, 0.43);
      head.add(nostril);
    }

    const tongueMat = new THREE.MeshStandardMaterial({ color: '#e0245e', roughness: 0.4 });
    this.tongue = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 0.22), tongueMat);
    stem.position.z = 0.11;
    this.tongue.add(stem);
    for (const s of [-1, 1]) {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.01, 0.09), tongueMat);
      fork.position.set(s * 0.02, 0, 0.25);
      fork.rotation.y = s * 0.45;
      this.tongue.add(fork);
    }
    this.tongue.position.set(0, -0.02, 0.38);
    this.tongue.scale.z = 0.001;
    head.add(this.tongue);

    this.head = head;
    this.group.add(head);
  }

  setRadial(radial) {
    // Radial detail is fixed at construction; quality changes rebuild the view.
    return radial === this.radial;
  }

  // t: 0..1 progress through the current step. lunge: extra forward travel
  // used by the death animation.
  //
  // Each ring of the body gets a frame (forward, up, side). On the ground up
  // is always world-up. In the sky the snake climbs and dives, so the head's
  // up comes from its heading (its back faces away from where it was flying
  // when it pitched up) and is carried down the body by parallel transport,
  // which bends the frame smoothly through every corner without twisting.
  update(game, t, time, toWorld, { lunge = 0, rushGlow = 0, deathFlash = 0, dt = 1 / 60 } = {}) {
    const path = this.path;
    path.setFromCells(game.cells, game.removedTail, toWorld);
    const L = path.length;
    const n = game.cells.length;
    const sHead = CORNER + 1 - t - lunge - HEAD_LEAD;
    const sTail = Math.min(n - t, L);
    const total = Math.max(0.5, sTail - sHead);
    this.travel = game.ticks + t;

    const s = this.sample;
    const R = this.radial;
    const P = this.positions;
    const N = this.normals;
    let rings = Math.min(this.maxRings - 1, Math.floor(total / STEP) + 1);
    const tailTaper = Math.min(total * 0.55, 3.2);
    const side = this.tmpSide;
    const tan = this.tmpTan;
    const up = this.tmpUp;

    // head frame
    path.sample(sHead, s);
    tan.set(s[3], s[4], s[5]);
    this.headUpTarget(tan, game.facing, game.flying, up);
    if (game.flying) {
      // ease towards it: a change of heading reads as a quick barrel roll
      this.upRef.lerp(up, Math.min(1, dt * 12));
      this.upRef.addScaledVector(tan, -this.upRef.dot(tan));
      if (this.upRef.lengthSq() < 1e-4) this.upRef.copy(up);
      this.upRef.normalize();
    } else this.upRef.copy(UP);
    up.copy(this.upRef);

    const jetD = 0.75;
    let jetDone = !this.jetpack;
    for (let i = 0; i <= rings; i++) {
      const d = i === rings ? total : i * STEP;
      path.sample(sHead + d, s);
      tan.set(s[3], s[4], s[5]);
      // parallel transport: drop the part of up that now points along the body
      up.addScaledVector(tan, -up.dot(tan));
      if (up.lengthSq() < 1e-6) up.copy(this.upRef);
      up.normalize();
      side.crossVectors(tan, up).normalize();
      // radius profile: slim neck, full body, long taper to the tail tip
      let r = 0.34;
      if (d < 0.5) r = 0.27 + 0.07 * (d / 0.5);
      const u = (total - d) / tailTaper;
      if (u < 1) r *= 0.1 + 0.9 * Math.sqrt(Math.max(0, u));
      // gentle world-fixed slither wave, faded in behind the head
      const amp = this.wiggle * 0.07 * Math.min(1, d / 1.4) * Math.min(1, (total - d) / 1.5 + 0.3);
      const off = amp * Math.sin((this.travel - d) * 2.6);
      const rh = r * 0.82;
      const lift = rh * 0.92;
      const cx = s[0] + side.x * off + up.x * lift;
      const cy = s[1] + side.y * off + up.y * lift;
      const cz = s[2] + side.z * off + up.z * lift;
      for (let j = 0; j <= R; j++) {
        const theta = (j / R) * Math.PI * 2;
        const c = Math.cos(theta);
        const sn = Math.sin(theta);
        const k = (i * (R + 1) + j) * 3;
        const nx = side.x * c + up.x * sn;
        const ny = side.y * c + up.y * sn;
        const nz = side.z * c + up.z * sn;
        P[k] = cx + side.x * c * r + up.x * sn * rh;
        P[k + 1] = cy + side.y * c * r + up.y * sn * rh;
        P[k + 2] = cz + side.z * c * r + up.z * sn * rh;
        N[k] = nx;
        N[k + 1] = ny;
        N[k + 2] = nz;
      }
      if (i === 0) {
        this.headPos.set(s[0], s[1], s[2]);
        this.headDir.copy(tan);
        this.headUp.copy(up);
      }
      // the jetpack rides on the back, a little behind the head
      if (!jetDone && d >= jetD) {
        jetDone = true;
        this.placeJetpack(cx, cy, cz, tan, up, side, r);
      }
    }
    this.posAttr.needsUpdate = true;
    this.normAttr.needsUpdate = true;
    this.posAttr.clearUpdateRanges();
    this.posAttr.addUpdateRange(0, (rings + 1) * (R + 1) * 3);
    this.normAttr.clearUpdateRanges();
    this.normAttr.addUpdateRange(0, (rings + 1) * (R + 1) * 3);
    this.geo.setDrawRange(0, rings * R * 6);

    // head sits slightly ahead of the first ring
    const hd = this.headDir;
    const hu = this.headUp;
    this.head.position.copy(this.headPos).addScaledVector(hd, 0.1).addScaledVector(hu, 0.25);
    side.crossVectors(hu, hd).normalize();
    this.tmpM.makeBasis(side, hu, hd);
    this.head.quaternion.setFromRotationMatrix(this.tmpM);
    if (this.jetpack) this.updateJetpack(game, time, dt, rushGlow);

    // tongue flicks every couple of seconds
    const ph = (time % 2.3) / 0.32;
    this.tongue.scale.z = ph < 1 ? Math.max(0.001, Math.sin(ph * Math.PI)) : 0.001;
    this.tongue.rotation.x = ph < 1 ? Math.sin(ph * Math.PI * 4) * 0.15 : 0;

    const pulse = rushGlow * (0.55 + 0.25 * Math.sin(time * 18));
    this.bodyMat.emissive.set(deathFlash > 0 ? '#ff2a2a' : '#00ffd0');
    this.headMat.emissive.copy(this.bodyMat.emissive);
    this.bodyMat.emissiveIntensity = Math.max(pulse * 0.25, deathFlash * 0.8);
    this.headMat.emissiveIntensity = this.bodyMat.emissiveIntensity;
    this.rimUniforms.uTime.value = time;
    if (this.isGhost) {
      this.ghostUniforms.uTime.value = time;
      this.aura.visible = false;
      this.headAura.visible = false;
      return;
    }
    if (this.accessory && this.accessory.userData.bob) this.accessory.userData.bob.position.y = 0.48 + Math.sin(time * 2.4) * 0.025;
    this.auraUniforms.uAmount.value = rushGlow;
    this.auraUniforms.uTime.value = time;
    this.aura.visible = rushGlow > 0.02;
    this.headAura.visible = this.aura.visible && this.head.visible;
  }

  setRim(color, amount) {
    this.rimUniforms.uRimColor.value.copy(color);
    this.rimUniforms.uRim.value = amount;
  }

  dispose() {
    if (this.accessory) disposeAccessory(this.accessory);
    if (this.ghostMat) this.ghostMat.dispose();
    this.geo.dispose();
    this.bodyMat.dispose();
    this.headMat.dispose();
    this.auraMat.dispose();
    if (this.jetMats) this.jetMats.forEach((m) => m.dispose());
  }
}
