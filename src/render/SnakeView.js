import * as THREE from 'three';
import { SnakePath, CORNER } from './SnakePath.js';
import { skinById } from '../skins.js';
import { buildAccessory, disposeAccessory, poseAccessory } from './accessories.js';

const STEP = 0.2; // ring spacing along the body, in cells
const BLOCK_R = 0.5; // half width of a block skin's body: a block fills its whole cell
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

// The body's skin is baked into a texture, sampled in the fragment shader:
// TEX_D cells of body along v at TEX_PER_CELL rows per cell, the angle round
// the body along u. Painting per vertex (rings 0.2 cells apart, 10-14 round)
// smeared fine detail like bands, diamonds and circuit traces into blobs.
// RGB is the colour, A the glow (scaled by GLOW_SCALE). Past TEX_D the last
// half of the texture repeats, so long tails keep their pattern.
const TEX_D = 64;
const TEX_PER_CELL = 24;
const TEX_ROUND = 48;
const GLOW_SCALE = 2.5;
const SKIN_CACHE = new Map(); // skin id -> baked texture data, shared by every view

// Bake a skin: each texel averages 2 x 2 samples so pattern edges come out
// anti-aliased instead of stair-stepped.
function bakeSkin(skin) {
  const hit = SKIN_CACHE.get(skin.id);
  if (hit) return hit;
  const rows = TEX_D * TEX_PER_CELL;
  const img = new Uint8Array(TEX_ROUND * rows * 4);
  const col = new THREE.Color();
  const sub = [0.25, 0.75];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < TEX_ROUND; j++) {
      let r = 0, g = 0, b = 0, gl = 0;
      for (const si of sub) {
        const d = (i + si) / TEX_PER_CELL;
        for (const sj of sub) {
          const theta = ((j + sj) / TEX_ROUND) * Math.PI * 2;
          skin.color(d, theta, col);
          r += col.r;
          g += col.g;
          b += col.b;
          if (skin.glow) gl += skin.glow(d, theta);
        }
      }
      col.setRGB(r / 4, g / 4, b / 4).convertLinearToSRGB();
      const k = (i * TEX_ROUND + j) * 4;
      img[k] = Math.round(Math.min(1, col.r) * 255);
      img[k + 1] = Math.round(Math.min(1, col.g) * 255);
      img[k + 2] = Math.round(Math.min(1, col.b) * 255);
      img[k + 3] = Math.round(Math.min(1, gl / 4 / GLOW_SCALE) * 255);
    }
  }
  SKIN_CACHE.set(skin.id, img);
  return img;
}

// Standard material plus: a fresnel rim light, glow (in the surface colour)
// and skin animations (rainbow hue cycling, pulsing or flowing glow) driven by
// the distance along the body (uv.x). With a skin map (the body) colour and
// glow come from the texture; without one (the head) from per-vertex colour
// and the aGlow attribute.
function withSkin(mat, uniforms, skinMap = null) {
  const tex = !!skinMap;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (tex) shader.uniforms.uSkinMap = skinMap;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow; varying float vBodyD; varying float vRound;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow; vBodyD = uv.x / 2.2; vRound = uv.y / 4.0;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uRimColor; uniform float uRim; uniform float uAnim; uniform float uTime; uniform float uGlowAmt;
        ${tex ? 'uniform sampler2D uSkinMap;' : ''}
        varying float vGlow; varying float vBodyD; varying float vRound;
        vec3 skinHue(float h){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return k * k * (3.0 - 2.0 * k); }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float skinGlow = vGlow;
        ${tex ? `float half_ = ${(TEX_D / 2).toFixed(1)};
        float bd = vBodyD < ${TEX_D.toFixed(1)} ? vBodyD : half_ + mod(vBodyD - half_, half_);
        vec4 skinTex = texture2D(uSkinMap, vec2(vRound, bd / ${TEX_D.toFixed(1)}));
        diffuseColor.rgb *= skinTex.rgb;
        skinGlow = skinTex.a * ${GLOW_SCALE.toFixed(1)};` : ''}
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
        totalEmissiveRadiance += diffuseColor.rgb * skinGlow * uGlowAmt * gp;`
      );
  };
  mat.customProgramCacheKey = () => (tex ? 'snake-skin-tex' : 'snake-skin');
  return mat;
}

// Ring layout for a square body: R + 1 vertices around a square with flat
// faces and hard edges. Each face gets its own run of vertices (from corner to
// corner), so every corner appears twice with the two faces' normals. Per
// vertex: [side, up, normal side, normal up], in -1..1 units of the half width.
// Faces go round the same way as the round tube (side -> up -> -side -> -up).
function squareRing(R) {
  const corners = [[1, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
  const normals = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const out = new Float32Array((R + 1) * 4);
  // split the R + 1 vertices into 4 runs of at least 2
  const n = R + 1;
  const runs = [0, 1, 2, 3].map((f) => Math.floor((n * (f + 1)) / 4) - Math.floor((n * f) / 4));
  let j = 0;
  runs.forEach((len, f) => {
    const [ax, ay] = corners[f];
    const [bx, by] = corners[f + 1];
    for (let q = 0; q < len; q++, j++) {
      const t = len > 1 ? q / (len - 1) : 0;
      out.set([ax + (bx - ax) * t, ay + (by - ay) * t, normals[f][0], normals[f][1]], j * 4);
    }
  });
  return out;
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
    this.blockRing = squareRing(R);
    const vCount = this.maxRings * (R + 1);
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(vCount * 3);
    this.normals = new Float32Array(vCount * 3);
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
    const texData = new Uint8Array(TEX_ROUND * TEX_D * TEX_PER_CELL * 4);
    this.skinTex = new THREE.DataTexture(texData, TEX_ROUND, TEX_D * TEX_PER_CELL, THREE.RGBAFormat);
    this.skinTex.colorSpace = THREE.SRGBColorSpace;
    this.skinTex.wrapS = THREE.RepeatWrapping;
    this.skinTex.wrapT = THREE.ClampToEdgeWrapping;
    this.skinTex.magFilter = THREE.LinearFilter;
    this.skinTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.skinTex.generateMipmaps = true;
    this.skinTex.anisotropy = 4;
    this.bodyMat = withSkin(
      new THREE.MeshStandardMaterial({
        roughness: 0.34,
        metalness: 0.08,
        normalMap: scaleMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
        envMapIntensity: 1.3,
        emissive: new THREE.Color('#00ffd0'),
        emissiveIntensity: 0,
      }),
      this.rimUniforms,
      { value: this.skinTex }
    );
    this.body = new THREE.Mesh(geo, this.bodyMat);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.body.frustumCulled = false;
    this.group.add(this.body);

    // Block skins: one cube per grid cell, so the body fills every square it
    // is on, corners included. The head cube slides into the next cell and
    // the tail cube slides out of the one it is leaving.
    this.blockMat = new THREE.MeshStandardMaterial({ color: '#2a6aff', roughness: 0.55, metalness: 0 });
    this.blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), this.blockMat, maxCells + 2);
    this.blocks.castShadow = true;
    this.blocks.receiveShadow = true;
    this.blocks.frustumCulled = false;
    this.blocks.visible = false;
    this.blocks.count = 0;
    this.group.add(this.blocks);
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.tmpBM = new THREE.Matrix4();
    this.tmpA2 = new THREE.Vector3();

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
    const col = new THREE.Color();
    this.skinTex.image.data.set(bakeSkin(skin));
    this.skinTex.needsUpdate = true;
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
    if (this.jawMat) this.jawMat.color.set(h.belly || h.side);
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
    // Block skins swap the round head for a cube with the eyes on its front.
    // blockH stacks the body that many blocks high; the face cube sits on top
    // and tilts forward by `tilt` radians, peering down at the board.
    const block = skin.shape === 'block';
    this.block = block;
    this.blockH = block ? skin.blockH || 1 : 1;
    this.skull.visible = !block;
    this.blockHead.visible = block;
    const bc = this.blockHeadGeo.attributes.color;
    col.set(h.top);
    for (let i = 0; i < bc.count; i++) bc.setXYZ(i, col.r, col.g, col.b);
    bc.needsUpdate = true;
    this.blockHeadGeo.attributes.aGlow.array.fill(headGlow);
    this.blockHeadGeo.attributes.aGlow.needsUpdate = true;
    // head-local y of the ground (the head rides 0.25 above the path)
    const ground = -0.25;
    // each block is a full cell (1 x 1 x 1); the head is a hair bigger so it
    // never z-fights with the body cube it is sliding out of
    // blockH under 1 makes a flat block (a full square base, less tall)
    const faceH = Math.min(1, this.blockH);
    const baseH = this.blockH - faceH;
    this.faceH = faceH;
    this.faceCube.scale.set(1.02, faceH + 0.02, 1.02);
    this.blockBase.visible = baseH > 0.01;
    this.blockBase.scale.set(1.02, Math.max(0.01, baseH), 1.02);
    this.blockBase.position.y = ground + baseH / 2;
    this.face.position.set(0, ground + baseH + faceH / 2, 0);
    this.body.visible = !block;
    this.blocks.visible = block;
    if (block) {
      this.blockMat.color.copy(skin.color(0, Math.PI / 2, col));
      this.blockMat.roughness = m.roughness ?? 0.55;
      this.blockMat.metalness = m.metalness ?? 0;
    }
    this.face.rotation.x = block ? skin.tilt || 0 : 0;
    const host = block ? this.face : this.head;
    for (const o of [...this.eyes, this.tongue, this.accHolder]) host.add(o);
    this.eyes.forEach((e, i) => (block ? e.position.set((i ? 1 : -1) * 0.25, faceH * 0.2, 0.5) : e.position.set((i ? 1 : -1) * 0.22, 0.11, 0.12)));
    this.eyes.forEach((e) => e.scale.setScalar(h.eyeScale || 1));
    this.eyeBase = h.eyeScale || 1;
    if (this.blockMouth) this.blockMouth.position.set(0, -faceH * 0.18, 0.52);
    this.nostrils.forEach((n) => (n.visible = !block));
    if (block) this.tongue.position.set(0, -faceH * 0.25, 0.5);
    else this.tongue.position.set(0, -0.02, 0.38);
    this.poseAccessory();
    // where the dizzy stars circle (head-local y above the top)
    this.headTop = block ? ground + baseH + faceH + 0.25 : 0.45;
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
    const target = game.flying || game.space ? 1 : 0;
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
      this.accHolder.remove(this.accessory);
      disposeAccessory(this.accessory);
      this.accessory = null;
    }
    const a = buildAccessory(id);
    if (a) {
      this.accessory = a;
      this.accHolder.add(a);
    }
    this.accessoryId = id;
    this.poseAccessory();
  }

  // Sit the accessory on whichever head this skin has (see poseAccessory).
  poseAccessory() {
    if (!this.accessory || !this.skin) return;
    const face = this.block ? { h: this.faceH, eyeY: this.faceH * 0.2, eyeFront: 0.5 + 0.085 * (this.skin.head.eyeScale || 1) } : null;
    poseAccessory(this.accessory, this.accHolder, face);
  }

  cellWorld(c, toWorld, out) {
    const w = toWorld(c.x, c.z, c.y);
    return out.set(w.x, w.y || 0, w.z);
  }

  // One cube per body cell (the head cube is part of the head). The tail
  // cube slides from the cell it just left onto the last body cell.
  updateBlocks(game, t, toWorld) {
    const cells = game.cells;
    const m = this.tmpBM;
    const H = this.blockH;
    const max = this.blocks.instanceMatrix.count;
    let k = 0;
    const put = (p, s, h) => {
      m.makeScale(s, h, s);
      m.setPosition(p.x, p.y + 0.002, p.z);
      this.blocks.setMatrixAt(k++, m);
    };
    for (let i = 1; i < cells.length && k < max - 1; i++) put(this.cellWorld(cells[i], toWorld, this.tmpA), 1, H);
    if (game.removedTail && cells.length > 1) {
      const a = this.cellWorld(game.removedTail, toWorld, this.tmpA);
      const b = this.cellWorld(cells[cells.length - 1], toWorld, this.tmpB);
      // a touch smaller, so its faces never fight with the cube it slides onto
      put(a.lerp(b, t), 0.99, H * 0.99);
    }
    this.blocks.count = k;
    this.blocks.instanceMatrix.needsUpdate = true;
  }

  // Cartoon "seeing stars" after a crash: three little stars circling above
  // the head.
  buildDizzy() {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 ? 0.065 : 0.16;
      if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }).center();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe14a').multiplyScalar(1.6), transparent: true });
    this.dizzy = new THREE.Group();
    this.dizzyStars = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(geo, mat);
      this.dizzy.add(m);
      return m;
    });
    this.dizzyMat = mat;
    this.dizzy.visible = false;
    this.group.add(this.dizzy);
  }

  updateDizzy(t) {
    const on = t >= 0 && !this.isGhost;
    this.dizzy.visible = on;
    if (!on) return;
    const grow = Math.min(1, t / 0.25);
    this.dizzy.position.copy(this.head.position).addScaledVector(this.headUp, this.headTop * grow);
    this.dizzy.quaternion.copy(this.head.quaternion);
    this.dizzyStars.forEach((m, i) => {
      const a = t * 5 + (i / 3) * Math.PI * 2;
      m.position.set(Math.cos(a) * 0.42, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.42);
      // tilted up so they read from overhead as well as from the side
      m.rotation.set(-1.0, 0, t * 6);
      m.scale.setScalar(grow);
    });
    this.dizzyMat.opacity = grow;
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
    this.skull = skull;

    // Cube head for block skins: a face cube (eyes on its front), and for
    // tall skins a base box under it. Both share a unit box, scaled.
    const bg = new THREE.BoxGeometry(1, 1, 1);
    bg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bg.attributes.position.count * 3), 3));
    bg.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(bg.attributes.position.count), 1));
    this.blockHeadGeo = bg;
    this.blockHead = new THREE.Group();
    this.blockHead.visible = false;
    head.add(this.blockHead);
    this.blockBase = new THREE.Mesh(bg, this.headMat);
    this.blockBase.castShadow = true;
    this.blockHead.add(this.blockBase);
    this.face = new THREE.Group(); // pivots at the face cube's centre
    this.blockHead.add(this.face);
    const faceCube = new THREE.Mesh(bg, this.headMat);
    faceCube.scale.set(1.02, 1.02, 1.02);
    this.faceCube = faceCube;
    faceCube.castShadow = true;
    this.face.add(faceCube);
    this.accHolder = new THREE.Group();
    head.add(this.accHolder);
    this.buildDizzy();
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
    this.eyes = [];
    this.nostrils = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      this.eyes.push(eye);
      eye.position.set(s * 0.22, 0.11, 0.12);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(s * 0.065, 0, 0.03);
      eye.add(pupil);
      head.add(eye);
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), pupilMat);
      nostril.position.set(s * 0.06, 0.07, 0.43);
      head.add(nostril);
      this.nostrils.push(nostril);
    }

    this.buildFace(head);

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

  // Expressions for the epilogue's cutscene: a grin along the snout, brows
  // over the eyes and squinting (happy) eyes. Hidden until setFace asks.
  buildFace(head) {
    const mat = new THREE.MeshBasicMaterial({ color: '#170709' });
    this.faceMat = mat;
    // the grin hugs the round head: points on the unit sphere, put through
    // the same squash as the skull (see buildHead), a hair outside it
    const onSkull = (phi, theta) => {
      let x = 0.5 * Math.cos(theta) * Math.sin(phi) * 0.8;
      let y = 0.5 * Math.sin(theta) * 0.55;
      let z = 0.5 * Math.cos(theta) * Math.cos(phi) * 0.95;
      if (z > 0) {
        const f = 1 - 0.38 * Math.pow(z / 0.475, 1.6);
        x *= f;
        y *= 0.75 + 0.25 * f;
      }
      if (y < 0) y *= 0.62;
      return new THREE.Vector3(x, y, z).multiplyScalar(1.035);
    };
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16 * 2 - 1;
      pts.push(onSkull(u * 1.05, -0.32 + 0.26 * u * u));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.017, 6, false);
    geo.translate(0, 0, -0.3);
    this.mouth = new THREE.Mesh(geo, mat);
    this.mouth.position.z = 0.3; // scales about the snout, so the grin widens from the middle
    this.mouth.visible = false;
    head.add(this.mouth);
    // block skins: a flat grin on the face cube's front
    this.blockMouth = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 6, 24, Math.PI), mat);
    this.blockMouth.rotation.z = Math.PI;
    this.blockMouth.visible = false;
    this.face.add(this.blockMouth);
    // an open mouth (for biting into things): a dark maw at the snout with
    // two little fangs hanging from the top lip
    // (in front of the snout, so it shows side on as well as head on), and a
    // lower jaw (in the belly colour) that hinges open under it
    this.maw = new THREE.Group();
    const inside = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 12), new THREE.MeshBasicMaterial({ color: '#3a0812' }));
    inside.scale.set(0.95, 0.75, 0.55);
    this.maw.add(inside);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshStandardMaterial({ color: '#e0245e', roughness: 0.5 }));
    tongue.scale.set(1, 0.35, 1.3);
    tongue.position.set(0, -0.07, 0.02);
    this.maw.add(tongue);
    const fangGeo = new THREE.ConeGeometry(0.024, 0.08, 6);
    fangGeo.rotateX(Math.PI);
    const fangMat = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.3 });
    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(fangGeo, fangMat);
      f.position.set(sx * 0.08, 0.075, 0.06);
      this.maw.add(f);
    }
    this.maw.visible = false;
    head.add(this.maw);
    this.jawMat = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.45 });
    this.jaw = new THREE.Group(); // hinged at the back of the mouth
    this.jaw.position.set(0, -0.09, 0.08);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 12), this.jawMat);
    jaw.scale.set(0.95, 0.32, 1.25);
    jaw.position.set(0, -0.01, 0.2);
    this.jaw.add(jaw);
    this.jaw.visible = false;
    head.add(this.jaw);
    const browGeo = new THREE.BoxGeometry(0.045, 0.03, 0.17);
    this.brows = this.eyes.map((eye, i) => {
      const b = new THREE.Mesh(browGeo, mat);
      b.position.set((i ? 1 : -1) * 0.02, 0.105, 0.01);
      b.visible = false;
      eye.add(b);
      return b;
    });
    this.eyeBase = 1;
  }

  // smile 0..1; brows -1 (worried) .. 1 (determined); squint 0..1;
  // open 0..1: the mouth wide open, to bite.
  setFace({ smile = 0, brows = 0, squint = 0, open = 0 } = {}) {
    const op = Math.min(1, open);
    this.maw.visible = op > 0.03 && !this.isGhost;
    this.jaw.visible = this.maw.visible && !this.block;
    if (this.maw.visible) {
      if (this.block) this.maw.position.set(0, -0.12, 0.52);
      else this.maw.position.set(0, -0.08 - 0.04 * op, 0.43);
      this.maw.scale.set(0.6 + 0.4 * op, Math.max(0.05, op), 1);
      this.jaw.rotation.x = 0.65 * op; // the jaw drops open
    }
    const on = smile > 0.02 && op < 0.3;
    this.mouth.visible = on && !this.block && !this.isGhost;
    this.blockMouth.visible = on && this.block && !this.isGhost;
    const w = 0.25 + 0.75 * Math.min(1, smile);
    this.mouth.scale.set(w, 0.6 + 0.4 * Math.min(1, smile), 1);
    this.blockMouth.scale.set(w, w, 1);
    for (const b of this.brows) {
      b.visible = Math.abs(brows) > 0.02 && !this.isGhost;
      // front end down: a determined frown; up: worried
      b.rotation.x = brows * 0.55;
      b.position.y = 0.105 - Math.max(0, brows) * 0.02;
    }
    const k = this.eyeBase;
    for (const e of this.eyes) e.scale.set(k, k * (1 - 0.6 * Math.min(1, squint)), k);
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
  // squash: 0..1 head squash from a crash. dizzy: seconds since the crash
  // (stars circle the head while it is >= 0).
  // travel: extra slither phase (hyperspeed keeps the body swimming while the
  // game holds still); wiggle: how strongly it swims (1 is normal).
  // bulge: a lump (something swallowed) this many cells down the body;
  // bulgeAmt: how much fatter it is there (0 for none).
  update(game, t, time, toWorld, { lunge = 0, rushGlow = 0, deathFlash = 0, dt = 1 / 60, squash = 0, dizzy = -1, travel = 0, wiggle = 1, bulge = 0, bulgeAmt = 0 } = {}) {
    const path = this.path;
    path.setFromCells(game.cells, game.removedTail, toWorld);
    const L = path.length;
    const n = game.cells.length;
    const sHead = CORNER + 1 - t - lunge - HEAD_LEAD;
    const sTail = Math.min(n - t, L);
    const total = Math.max(0.5, sTail - sHead);
    this.travel = game.ticks + t + travel;
    this.wiggle += (wiggle - this.wiggle) * Math.min(1, dt * 4);

    const s = this.sample;
    const R = this.radial;
    const block = this.block && !this.isGhost;
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
      let rh, lift, off;
      if (block) {
        // a straight square bar, just closed off at the very tip
        r = BLOCK_R * Math.min(1, 0.2 + (total - d) / 0.12);
        rh = r * this.blockH;
        lift = BLOCK_R * this.blockH;
        off = 0;
      } else {
        if (d < 0.5) r = 0.27 + 0.07 * (d / 0.5);
        const u = (total - d) / tailTaper;
        if (u < 1) r *= 0.1 + 0.9 * Math.sqrt(Math.max(0, u));
        // gentle world-fixed slither wave, faded in behind the head
        const amp = this.wiggle * 0.07 * Math.min(1, d / 1.4) * Math.min(1, (total - d) / 1.5 + 0.3);
        off = amp * Math.sin((this.travel - d) * 2.6);
        if (bulgeAmt > 0) {
          const q = (d - bulge) / 0.32;
          r *= 1 + bulgeAmt * Math.exp(-q * q);
        }
        rh = r * 0.82;
        lift = rh * 0.92;
      }
      const cx = s[0] + side.x * off + up.x * lift;
      const cy = s[1] + side.y * off + up.y * lift;
      const cz = s[2] + side.z * off + up.z * lift;
      if (block) {
        // four flat faces with hard edges: each face has its own vertices
        // (corners are doubled), filled in from the precomputed layout
        const B = this.blockRing;
        for (let j = 0; j <= R; j++) {
          const k = (i * (R + 1) + j) * 3;
          const a = B[j * 4];
          const b = B[j * 4 + 1];
          const nx = B[j * 4 + 2];
          const ny = B[j * 4 + 3];
          P[k] = cx + side.x * a * r + up.x * b * rh;
          P[k + 1] = cy + side.y * a * r + up.y * b * rh;
          P[k + 2] = cz + side.z * a * r + up.z * b * rh;
          N[k] = side.x * nx + up.x * ny;
          N[k + 1] = side.y * nx + up.y * ny;
          N[k + 2] = side.z * nx + up.z * ny;
        }
      } else for (let j = 0; j <= R; j++) {
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
    if (block && !this.isGhost) {
      // the head cube sits exactly on the cell it is moving into (no corner
      // rounding), and the body is drawn cell by cell
      const a = this.cellWorld(game.cells[Math.min(1, n - 1)], toWorld, this.tmpA);
      const b = this.cellWorld(game.cells[0], toWorld, this.tmpB);
      this.head.position.lerpVectors(a, b, n > 1 ? t + lunge : 1).addScaledVector(hu, 0.25);
      // face square along the grid, so the cube never turns diagonally
      const f = b.sub(a);
      if (f.lengthSq() > 1e-6) {
        f.normalize();
        side.crossVectors(hu, f);
        if (side.lengthSq() > 1e-6) {
          side.normalize();
          this.tmpUp.crossVectors(f, side);
          this.tmpM.makeBasis(side, this.tmpUp, f);
        } else this.tmpM.makeBasis(side.crossVectors(hu, hd).normalize(), hu, hd);
      } else this.tmpM.makeBasis(side.crossVectors(hu, hd).normalize(), hu, hd);
      this.updateBlocks(game, t, toWorld);
    } else {
      this.head.position.copy(this.headPos).addScaledVector(hd, 0.1).addScaledVector(hu, 0.25);
      side.crossVectors(hu, hd).normalize();
      this.tmpM.makeBasis(side, hu, hd);
    }
    this.head.quaternion.setFromRotationMatrix(this.tmpM);
    // a crash flattens the head against what it hit, then it springs back
    this.head.scale.set(1 + squash * 0.22, 1 - squash * 0.12, 1 - squash * 0.32);
    this.updateDizzy(dizzy);
    if (this.jetpack) this.updateJetpack(game, time, dt, rushGlow);

    // tongue flicks every couple of seconds
    const ph = (time % 2.3) / 0.32;
    this.tongue.scale.z = ph < 1 ? Math.max(0.001, Math.sin(ph * Math.PI)) : 0.001;
    this.tongue.rotation.x = ph < 1 ? Math.sin(ph * Math.PI * 4) * 0.15 : 0;

    const pulse = rushGlow * (0.55 + 0.25 * Math.sin(time * 18));
    this.bodyMat.emissive.set(deathFlash > 0 ? '#ff2a2a' : '#00ffd0');
    this.headMat.emissive.copy(this.bodyMat.emissive);
    this.bodyMat.emissiveIntensity = Math.max(pulse * 0.25, deathFlash * 0.8);
    this.blockMat.emissive.copy(this.bodyMat.emissive);
    this.blockMat.emissiveIntensity = this.bodyMat.emissiveIntensity;
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

  // The zone's rim light. Kept at 60%: at full strength the blue-white rim
  // washed every skin out to a milky pastel.
  setRim(color, amount) {
    this.rimUniforms.uRimColor.value.copy(color);
    this.rimUniforms.uRim.value = amount * 0.6;
  }

  dispose() {
    if (this.accessory) disposeAccessory(this.accessory);
    if (this.ghostMat) this.ghostMat.dispose();
    this.geo.dispose();
    this.bodyMat.dispose();
    this.headMat.dispose();
    this.skinTex.dispose();
    this.auraMat.dispose();
    this.blockHeadGeo.dispose();
    this.blocks.geometry.dispose();
    this.blockMat.dispose();
    this.dizzyStars[0].geometry.dispose();
    this.dizzyMat.dispose();
    if (this.jetMats) this.jetMats.forEach((m) => m.dispose());
  }
}
