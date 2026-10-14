import * as THREE from 'three';
import { SnakePath, CORNER } from './SnakePath.js';

const STEP = 0.2; // ring spacing along the body, in cells
const UP = new THREE.Vector3(0, 1, 0);

const C_DORSAL = new THREE.Color('#1386a8');
const C_SIDE = new THREE.Color('#2fe3c6');
const C_BELLY = new THREE.Color('#f3e7c4');
const C_DIAMOND = new THREE.Color('#ffb627');
const C_EDGE = new THREE.Color('#06242e');

// Body-fixed colour: d is the distance from the head in cells, theta the angle
// around the body (PI/2 = spine). Ring i always sits at d = i * STEP, so the
// pattern travels with the snake and only has to be computed once.
function bodyColor(d, theta, out) {
  const dorsal = Math.sin(theta);
  const lateral = Math.abs(Math.cos(theta));
  if (dorsal < -0.35) {
    out.copy(C_BELLY);
    const band = Math.abs(((d * 3) % 1) - 0.5) < 0.08 ? 0.9 : 1;
    return out.multiplyScalar(band);
  }
  out.copy(C_SIDE).lerp(C_DORSAL, Math.max(0, dorsal));
  const f = ((d + 0.25) / 0.9) % 1;
  const diamond = Math.abs(f - 0.5) * 2 + lateral * 1.6;
  if (diamond < 0.62) out.copy(C_DIAMOND);
  else if (diamond < 0.82) out.copy(C_EDGE);
  if (dorsal < 0) out.lerp(C_BELLY, (-dorsal / 0.35) * 0.5);
  return out;
}

const AURA_VS = `uniform float uPush; varying vec3 vN; varying vec3 vV;
void main(){ vec3 p = position + normal * uPush; vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const AURA_FS = `uniform vec3 uColor; uniform float uAmount; uniform float uTime; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float a = f * uAmount * (0.75 + 0.25 * sin(uTime * 30.0)); gl_FragColor = vec4(uColor * a * 2.2, a); }`;

// Fresnel rim light added to a standard material's emissive term.
function withRim(mat, uniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRim;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += uRimColor * rimF * uRim;`
      );
  };
  mat.customProgramCacheKey = () => 'snake-rim';
  return mat;
}

export class SnakeView {
  constructor({ maxCells, radial = 14, scaleMap }) {
    this.group = new THREE.Group();
    this.path = new SnakePath(maxCells + 4);
    this.radial = radial;
    this.maxRings = Math.ceil((maxCells + 2) / STEP) + 4;
    this.sample = new Float32Array(4);
    this.headPos = new THREE.Vector3();
    this.headDir = new THREE.Vector3(0, 0, -1);
    this.travel = 0;
    this.wiggle = 1;

    const R = radial;
    const vCount = this.maxRings * (R + 1);
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(vCount * 3);
    this.normals = new Float32Array(vCount * 3);
    const colors = new Float32Array(vCount * 3);
    const uvs = new Float32Array(vCount * 2);
    const col = new THREE.Color();
    for (let i = 0; i < this.maxRings; i++) {
      for (let j = 0; j <= R; j++) {
        const theta = (j / R) * Math.PI * 2;
        const k = i * (R + 1) + j;
        bodyColor(i * STEP, theta, col);
        colors[k * 3] = col.r;
        colors[k * 3 + 1] = col.g;
        colors[k * 3 + 2] = col.b;
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
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geo = geo;

    this.rimUniforms = { uRimColor: { value: new THREE.Color('#9fd0ff') }, uRim: { value: 0.6 } };
    this.bodyMat = withRim(
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
  }

  buildHead(scaleMap) {
    const head = new THREE.Group();
    const g = new THREE.SphereGeometry(0.5, 40, 28);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
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
      const top = y / 0.275;
      if (top < -0.15) col.copy(C_BELLY);
      else {
        col.copy(C_SIDE).lerp(C_DORSAL, Math.max(0, Math.min(1, top * 1.3)));
        // a golden crown mark between the eyes
        if (top > 0.55 && Math.abs(x) < 0.09 && z > -0.2 && z < 0.12) col.copy(C_DIAMOND);
      }
      colors.set([col.r, col.g, col.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    this.headMat = withRim(
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

    const eyeMat = new THREE.MeshStandardMaterial({
      color: '#ffd23f',
      emissive: '#ff9f1c',
      emissiveIntensity: 1.2,
      roughness: 0.05,
      metalness: 0.1,
    });
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
  update(game, t, time, toWorld, { lunge = 0, rushGlow = 0, deathFlash = 0 } = {}) {
    const path = this.path;
    path.setFromCells(game.cells, game.removedTail, toWorld);
    const L = path.length;
    const n = game.cells.length;
    const sHead = CORNER + 1 - t - lunge;
    const sTail = Math.min(n - t, L);
    const total = Math.max(0.5, sTail - sHead);
    this.travel = game.ticks + t;

    const s = this.sample;
    const R = this.radial;
    const P = this.positions;
    const N = this.normals;
    let rings = Math.min(this.maxRings - 1, Math.floor(total / STEP) + 1);
    const tailTaper = Math.min(total * 0.55, 3.2);
    const side = new THREE.Vector3();
    const tan = new THREE.Vector3();
    for (let i = 0; i <= rings; i++) {
      const d = i === rings ? total : i * STEP;
      path.sample(sHead + d, s);
      tan.set(s[2], 0, s[3]);
      side.crossVectors(tan, UP).normalize();
      // radius profile: slim neck, full body, long taper to the tail tip
      let r = 0.34;
      if (d < 0.5) r = 0.27 + 0.07 * (d / 0.5);
      const u = (total - d) / tailTaper;
      if (u < 1) r *= 0.1 + 0.9 * Math.sqrt(Math.max(0, u));
      // gentle world-fixed slither wave, faded in behind the head
      const amp = this.wiggle * 0.07 * Math.min(1, d / 1.4) * Math.min(1, (total - d) / 1.5 + 0.3);
      const off = amp * Math.sin((this.travel - d) * 2.6);
      const cx = s[0] + side.x * off;
      const cz = s[1] + side.z * off;
      const rh = r * 0.82;
      const cy = rh * 0.92;
      for (let j = 0; j <= R; j++) {
        const theta = (j / R) * Math.PI * 2;
        const c = Math.cos(theta);
        const sn = Math.sin(theta);
        const k = (i * (R + 1) + j) * 3;
        P[k] = cx + side.x * c * r;
        P[k + 1] = cy + sn * rh;
        P[k + 2] = cz + side.z * c * r;
        N[k] = side.x * c;
        N[k + 1] = sn;
        N[k + 2] = side.z * c;
      }
      if (i === 0) {
        this.headPos.set(s[0], 0, s[1]);
        this.headDir.copy(tan).normalize();
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
    this.head.position.set(this.headPos.x + this.headDir.x * 0.1, 0.25, this.headPos.z + this.headDir.z * 0.1);
    this.head.rotation.set(0, Math.atan2(this.headDir.x, this.headDir.z), 0);

    // tongue flicks every couple of seconds
    const ph = (time % 2.3) / 0.32;
    this.tongue.scale.z = ph < 1 ? Math.max(0.001, Math.sin(ph * Math.PI)) : 0.001;
    this.tongue.rotation.x = ph < 1 ? Math.sin(ph * Math.PI * 4) * 0.15 : 0;

    const pulse = rushGlow * (0.55 + 0.25 * Math.sin(time * 18));
    this.bodyMat.emissive.set(deathFlash > 0 ? '#ff2a2a' : '#00ffd0');
    this.headMat.emissive.copy(this.bodyMat.emissive);
    this.bodyMat.emissiveIntensity = Math.max(pulse * 0.25, deathFlash * 0.8);
    this.headMat.emissiveIntensity = this.bodyMat.emissiveIntensity;
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
    this.geo.dispose();
    this.bodyMat.dispose();
    this.headMat.dispose();
    this.auraMat.dispose();
  }
}
