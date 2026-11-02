import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, mulberry32 } from './geo.js';

// Draws each zone's map: themed walls that rise out of the floor (hedges,
// sandstone, neon towers, data blocks), holographic previews while a wall is
// still a warning, swirling portals and laser gates. Everything is a fixed
// set of instanced meshes, so maps appearing mid-game never compile shaders.

const CAP = 96; // walls per zone style
const HOLO_CAP = 128;
const GATE_CAP = 40;
const TAU = Math.PI * 2;

// Heights in cells. Kept low so the overhead camera still sees what's behind.
const STYLES = [
  { name: 'hedge', h: 0.62 },
  { name: 'rock', h: 0.86 },
  { name: 'tower', h: 1.0 },
  { name: 'data', h: 0.74 },
];

const hash2 = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// Round the edges of a box-like geometry towards an inner box (radius r).
function roundBox(g, hx, hy, hz, r) {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ix = THREE.MathUtils.clamp(v.x, -hx + r, hx - r);
    const iy = THREE.MathUtils.clamp(v.y, -hy + r, hy - r);
    const iz = THREE.MathUtils.clamp(v.z, -hz + r, hz - r);
    const dx = v.x - ix;
    const dy = v.y - iy;
    const dz = v.z - iz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-6) p.setXYZ(i, ix + (dx / len) * r, iy + (dy / len) * r, iz + (dz / len) * r);
  }
}

function prep(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

// A clipped, leafy hedge block: rounded box, bumpy foliage, a few flowers.
function hedgeGeometry() {
  const H = STYLES[0].h;
  let g = prep(new THREE.BoxGeometry(1.06, H, 1.06, 8, 5, 8));
  roundBox(g, 0.53, H / 2, 0.53, 0.13);
  g.computeVertexNormals();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const dark = new THREE.Color('#2a6e28');
  const light = new THREE.Color('#6cc64e');
  const rng = mulberry32(31);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const bottom = y < -H / 2 + 0.02;
    const d = bottom ? 0 : fbm(x * 9 + 3, y * 9, z * 9, 2) * 0.055 + 0.012;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * Math.max(d, -0.01), z + n.getZ(i) * d);
    const t = (y + H / 2) / H;
    c.copy(dark).lerp(light, Math.pow(t, 0.8) * (0.75 + d * 4));
    const r = rng();
    if (r > 0.94) c.lerp(new THREE.Color('#a8ec82'), 0.6);
    if (t > 0.55 && r > 0.986) c.set(r > 0.993 ? '#ffe14d' : '#ff86b8');
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.translate(0, H / 2, 0);
  return g;
}

// A weathered sandstone block: broad strata bands that line up from block
// to block (so a ridge reads as one rock face), a flat cap and a darker foot.
function rockGeometry() {
  const H = STYLES[1].h;
  let g = prep(new THREE.BoxGeometry(1.0, H, 1.0, 3, 6, 3));
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const t = (y + H / 2) / H;
    const taper = 1 - 0.05 * t;
    const top = y > H / 2 - 0.01;
    const d = y < -H / 2 + 0.01 ? 0 : fbm(x * 4 + 11, y * 7, z * 4, 3) * (top ? 0.02 : 0.07);
    x = x * taper + n.getX(i) * d;
    z = z * taper + n.getZ(i) * d;
    y += top ? fbm(x * 3, 5, z * 3, 2) * 0.03 : n.getY(i) * d * 0.5;
    p.setXYZ(i, x, y, z);
  }
  g = g.toNonIndexed(); // faceted
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const bands = ['#c98a58', '#dcab78', '#ecd2a6', '#c47c4c', '#e2b688'].map((h) => new THREE.Color(h));
  const foot = new THREE.Color('#8a5638');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    // colour per face from its average height, so bands stay crisp
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 + H / 2;
    const k = Math.max(0, Math.floor(y / 0.19));
    c.copy(bands[k % bands.length]);
    c.lerp(foot, Math.max(0, 1 - y / 0.3) * 0.55);
    c.multiplyScalar(0.94 + hash2(i, 3) * 0.08);
    for (let j = 0; j < 3; j++) {
      col[(i + j) * 3] = c.r;
      col[(i + j) * 3 + 1] = c.g;
      col[(i + j) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.translate(0, H / 2, 0);
  return g;
}

// Neon towers and data blocks: plain boxes; the shader adds the detail.
function boxGeometry(w, h) {
  const g = new THREE.BoxGeometry(w, h, w, 1, 1, 1);
  g.deleteAttribute('uv');
  g.translate(0, h / 2, 0);
  return g;
}

// Lit standard material plus per-style procedural detail computed from the
// block's local position: lit windows and a neon crown on the towers,
// pulsing circuit traces on the data blocks.
function wallMaterial(style, shared) {
  const opts = [
    { vertexColors: true, roughness: 0.92, metalness: 0 },
    { vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true },
    { color: '#10131f', roughness: 0.28, metalness: 0.55, envMapIntensity: 1.2 },
    { color: '#05060c', roughness: 0.14, metalness: 0.7, envMapIntensity: 1.4 },
  ][style];
  const mat = new THREE.MeshStandardMaterial(opts);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLocal; varying vec3 vLocalN; varying float vSeed; varying float vScaleY;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLocal = position; vLocalN = normal;
        #ifdef USE_INSTANCING
          vec4 org = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vScaleY = length(instanceMatrix[1].xyz);
        #else
          vec4 org = vec4(0.0); vScaleY = 1.0;
        #endif
        vSeed = fract(sin(dot(floor(org.xz + 0.5), vec2(12.9898, 78.233))) * 43758.5453);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLocal; varying vec3 vLocalN; varying float vSeed; varying float vScaleY;
        uniform float uTime; uniform float uGlow; uniform vec3 uNeonA; uniform vec3 uNeonB; uniform vec3 uNeonC;
        float wh(vec2 p){ return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453); }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${style === 2 ? TOWER_GLSL : style === 3 ? DATA_GLSL : ''}`
      );
  };
  mat.customProgramCacheKey = () => `wall-${style}`;
  return mat;
}

// Windows on the sides (in world-height units so taller towers get more
// floors), and a neon crown around the roof edge.
const TOWER_GLSL = `
  vec3 an = abs(vLocalN);
  float hgt = vLocal.y * vScaleY;
  if (an.y < 0.5) {
    vec2 fc = an.x > 0.5 ? vec2(vLocal.z, hgt) : vec2(vLocal.x, hgt);
    vec2 wc = vec2(fc.x * 3.0 + 0.5, fc.y * 5.5);
    vec2 wi = floor(wc); vec2 wf = fract(wc);
    float win = smoothstep(0.12, 0.2, wf.x) * smoothstep(0.88, 0.8, wf.x) * smoothstep(0.18, 0.28, wf.y) * smoothstep(0.82, 0.72, wf.y);
    float on = step(0.38, wh(wi + vSeed * 17.0 + vLocalN.xz * 5.0));
    vec3 wcol = mix(vec3(1.0, 0.78, 0.45), vec3(0.45, 0.85, 1.0), step(0.55, wh(wi.yx + vSeed * 3.0)));
    float flick = 0.85 + 0.15 * sin(uTime * 3.0 + wh(wi) * 40.0);
    totalEmissiveRadiance += wcol * win * on * flick * 1.15 * uGlow * step(0.1, hgt);
    float crown = smoothstep(0.9, 0.96, vLocal.y) * (1.0 - smoothstep(0.985, 1.0, vLocal.y) * 0.4);
    vec3 neon = vSeed < 0.34 ? uNeonA : vSeed < 0.67 ? uNeonB : uNeonC;
    totalEmissiveRadiance += neon * crown * 2.6 * uGlow;
  } else {
    // roof: a rooftop light and a thin neon rim on some towers
    vec2 e = abs(vLocal.xz) * 2.0 / 0.92;
    float rim = smoothstep(0.9, 0.98, max(e.x, e.y)) * step(0.45, fract(vSeed * 7.3));
    float beacon = smoothstep(0.07, 0.035, length(vLocal.xz - vec2(0.2, -0.2))) * step(fract(vSeed * 3.1), 0.35) * step(0.0, sin(uTime * 3.0 + vSeed * 20.0));
    vec3 neon = vSeed < 0.34 ? uNeonA : vSeed < 0.67 ? uNeonB : uNeonC;
    totalEmissiveRadiance += neon * rim * 1.6 * uGlow + vec3(1.0, 0.25, 0.3) * beacon * 2.5;
  }`;

// Circuit traces in a grid on every face, with pulses running along them.
const DATA_GLSL = `
  vec3 an = abs(vLocalN);
  vec2 fc = an.y > 0.5 ? vLocal.xz : (an.x > 0.5 ? vec2(vLocal.z, vLocal.y) : vec2(vLocal.x, vLocal.y));
  vec2 g = fc * 3.5 + 0.5;
  vec2 gi = floor(g); vec2 gf = fract(g);
  float hx = wh(gi + vSeed * 13.0 + vLocalN.xz * 2.0);
  float hy = wh(gi.yx + 7.3 + vSeed * 5.0 + vLocalN.zx);
  float lx = step(0.45, hx) * smoothstep(0.1, 0.05, abs(gf.y - 0.5));
  float ly = step(0.55, hy) * smoothstep(0.1, 0.05, abs(gf.x - 0.5));
  float node = step(0.7, wh(gi * 1.7 + vSeed)) * smoothstep(0.17, 0.11, length(gf - 0.5));
  float tr = max(max(lx, ly), node);
  float pulse = pow(0.5 + 0.5 * sin(uTime * 5.0 - (gi.x + gi.y) * 0.8 + vSeed * 9.0), 3.0);
  vec3 c = mix(uNeonA, uNeonB, step(0.5, wh(gi * 0.31 + vSeed)));
  vec2 e = abs(an.y > 0.5 ? vLocal.xz * 2.0 / 0.94 : vec2(0.0));
  float topRim = an.y > 0.5 ? smoothstep(0.84, 0.96, max(e.x, e.y)) : smoothstep(0.66, 0.73, vLocal.y);
  totalEmissiveRadiance += (c * tr * (0.35 + 1.6 * pulse) + uNeonA * topRim * 1.4) * uGlow;`;

const HOLO_VS = `varying vec3 vP;
void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const HOLO_FS = `uniform vec3 uColor; uniform float uTime; uniform float uAmt; varying vec3 vP;
void main(){
  vec3 q = abs(vec3(vP.x, vP.y - 0.5, vP.z)) * 2.0;
  float ex = smoothstep(0.86, 0.99, q.x); float ey = smoothstep(0.88, 0.99, q.y); float ez = smoothstep(0.86, 0.99, q.z);
  float edge = max(max(ex * ey, ex * ez), ey * ez);
  float scan = smoothstep(0.08, 0.0, abs(fract(vP.y * 2.0 - uTime * 1.2) - 0.5) - 0.42);
  float a = (edge * 0.85 + 0.05 + scan * 0.12) * uAmt * (0.72 + 0.28 * sin(uTime * 7.0));
  gl_FragColor = vec4(uColor * a * 1.7, a);
}`;

const PORTAL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// A swirling well: dark at the centre, bright spiral arms, a hot rim. uOpen
// widens it from a pinpoint (opening) to full size; uPulse flashes it.
const PORTAL_FS = `uniform vec3 uColor; uniform float uTime; uniform float uOpen; uniform float uPulse; uniform float uSpin;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float R = max(uOpen, 0.001);
  if (r > R) discard;
  float rr = r / R;
  float a = atan(p.y, p.x);
  float arms = 0.5 + 0.5 * sin(a * 3.0 + rr * 10.0 * uSpin - uTime * 7.0 * uSpin);
  arms = smoothstep(0.35, 1.0, arms) * smoothstep(0.05, 0.7, rr);
  float rim = smoothstep(0.72, 0.97, rr);
  vec3 deep = vec3(0.004, 0.0, 0.02);
  vec3 col = deep + uColor * (arms * 1.3 + rim * 2.6) + vec3(1.0) * pow(rim, 6.0) * 1.4;
  col += uColor * uPulse * 3.0 * (1.0 - rr * 0.6);
  gl_FragColor = vec4(col, 1.0);
}`;

const BEAM_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BEAM_FS = `uniform vec3 uColor; uniform float uAmt; uniform float uTime; varying vec2 vUv;
void main(){ float a = pow(1.0 - vUv.y, 2.2) * uAmt * (0.8 + 0.2 * sin(vUv.x * 30.0 + uTime * 5.0)); gl_FragColor = vec4(uColor * a * 1.6, a); }`;

const GATE_VS = `attribute float aOn; attribute float aWarn; varying vec2 vUv; varying float vOn; varying float vWarn; varying vec3 vW;
void main(){ vUv = uv; vOn = aOn; vWarn = aWarn; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// Laser sheet: four beams with a shimmering field between them; while
// warning it flickers thinly.
const GATE_FS = `uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying float vOn; varying float vWarn; varying vec3 vW;
void main(){
  float y = vUv.y;
  float beams = 0.0;
  for (int i = 0; i < 4; i++) beams += smoothstep(0.045, 0.0, abs(y - (0.12 + float(i) * 0.21)));
  float field = (0.22 + 0.18 * sin((vW.x + vW.z) * 9.0 - uTime * 14.0 + y * 6.0)) * smoothstep(1.0, 0.75, y);
  float flick = step(0.45, fract(uTime * 8.0 + vW.x * 0.37 + vW.z * 0.53));
  float a = (beams + field) * vOn + beams * vWarn * 0.5 * flick;
  a *= smoothstep(1.0, 0.92, y);
  gl_FragColor = vec4(uColor * a * 2.6, a);
}`;

// One portal: a swirling well on the floor, a glowing rim, a floating ring
// and a light column so it can be seen from anywhere.
class PortalView {
  constructor() {
    this.group = new THREE.Group();
    this.u = { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uOpen: { value: 0 }, uPulse: { value: 0 }, uSpin: { value: 1 } };
    const disk = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: PORTAL_VS, fragmentShader: PORTAL_FS }));
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = 0.022;
    disk.renderOrder = 1;
    this.rimMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 8, 48), this.rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.03;
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.018, 6, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.bu = { uColor: this.u.uColor, uAmt: { value: 0 }, uTime: this.u.uTime };
    const bg = new THREE.CylinderGeometry(0.3, 0.42, 4.5, 16, 1, true);
    bg.translate(0, 2.25, 0);
    this.beam = new THREE.Mesh(bg, new THREE.ShaderMaterial({ uniforms: this.bu, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.group.add(disk, rim, this.halo, this.beam);
    this.group.visible = false;
    this.id = null;
    this.open = 0;
    this.pulse = 0;
    this.closing = -1;
  }
}

export class MapView {
  constructor() {
    this.group = new THREE.Group();
    this.shared = {
      uTime: { value: 0 },
      uGlow: { value: 1 },
      uNeonA: { value: new THREE.Color('#38f6ff') },
      uNeonB: { value: new THREE.Color('#ff3df2') },
      uNeonC: { value: new THREE.Color('#ffb627') },
    };
    const geos = [hedgeGeometry(), rockGeometry(), boxGeometry(0.92, 1), boxGeometry(0.94, STYLES[3].h)];
    this.meshes = geos.map((g, i) => {
      const m = new THREE.InstancedMesh(g, wallMaterial(i, this.shared), CAP);
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    });

    // holographic preview of walls about to rise
    const hg = new THREE.BoxGeometry(1, 1, 1);
    hg.translate(0, 0.5, 0);
    this.holoU = { uColor: { value: new THREE.Color('#38f6ff') }, uTime: this.shared.uTime, uAmt: { value: 1 } };
    this.holo = new THREE.InstancedMesh(
      hg,
      new THREE.ShaderMaterial({ uniforms: this.holoU, vertexShader: HOLO_VS, fragmentShader: HOLO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      HOLO_CAP
    );
    this.holo.count = 0;
    this.holo.frustumCulled = false;
    this.holo.renderOrder = 3;
    this.group.add(this.holo);

    // laser gates: one sheet and one floor rail per gate cell
    const sheet = new THREE.PlaneGeometry(1, 0.78);
    sheet.translate(0, 0.39, 0);
    const sg = new THREE.InstancedBufferGeometry().copy(sheet);
    this.gateOn = new THREE.InstancedBufferAttribute(new Float32Array(GATE_CAP), 1).setUsage(THREE.DynamicDrawUsage);
    this.gateWarn = new THREE.InstancedBufferAttribute(new Float32Array(GATE_CAP), 1).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('aOn', this.gateOn);
    sg.setAttribute('aWarn', this.gateWarn);
    this.gateU = { uColor: { value: new THREE.Color('#ff3a5c') }, uTime: this.shared.uTime };
    this.sheets = new THREE.InstancedMesh(
      sg,
      new THREE.ShaderMaterial({ uniforms: this.gateU, vertexShader: GATE_VS, fragmentShader: GATE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      GATE_CAP
    );
    this.sheets.count = 0;
    this.sheets.frustumCulled = false;
    this.sheets.renderOrder = 4;
    this.rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.035, 0.14), new THREE.MeshBasicMaterial({ color: '#ffffff' }), GATE_CAP);
    this.rails.count = 0;
    this.rails.frustumCulled = false;
    this.group.add(this.sheets, this.rails);
    this.gateAmt = new Map(); // gate id -> { on, warn }

    this.portals = [];
    for (let i = 0; i < 4; i++) {
      const p = new PortalView();
      this.portals.push(p);
      this.group.add(p.group);
    }
    this.portalColors = { A: new THREE.Color('#38f6ff'), B: new THREE.Color('#ff9d2e'), C: new THREE.Color('#b8ff4a'), D: new THREE.Color('#ff4fd8') };

    this.walls = new Map(); // obstacle id -> animation state
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpP = new THREE.Vector3();
    this.tmpS = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.railColor = new THREE.Color();
    this.railHot = new THREE.Color(1.6, 1.2, 1.3);
    this.raised = []; // world positions of walls that just started rising (for dust)
  }

  // Flash both ends of a portal pair (the snake just went through).
  pulsePortal(id) {
    for (const p of this.portals) if (p.id === id) p.pulse = 1;
  }

  // All instanced parts drawn once, for shader warm-up.
  warmup(on) {
    if (on) {
      this.saved = [...this.meshes, this.holo, this.sheets, this.rails].map((m) => m.count);
      for (const m of [...this.meshes, this.holo, this.sheets, this.rails]) {
        m.count = 1;
        m.setMatrixAt(0, this.tmpM.identity());
        m.instanceMatrix.needsUpdate = true;
      }
      for (const p of this.portals) p.group.visible = true;
    } else {
      [...this.meshes, this.holo, this.sheets, this.rails].forEach((m, i) => (m.count = this.saved[i]));
      for (const p of this.portals) p.group.visible = p.id !== null;
    }
  }

  clear() {
    this.walls.clear();
    for (const m of this.meshes) m.count = 0;
    this.holo.count = 0;
    this.sheets.count = 0;
    this.rails.count = 0;
    this.gateAmt.clear();
    for (const p of this.portals) {
      p.id = null;
      p.group.visible = false;
    }
  }

  sync(game, toWorld, dt, time, palette, reduceMotion = false) {
    this.shared.uTime.value = time;
    this.holoU.uColor.value.copy(palette.strip);
    this.raised.length = 0;
    // ---- walls
    const seen = new Set();
    for (const o of game.obstacles) {
      if (o.kind !== 'wall') continue;
      seen.add(o.id);
      let a = this.walls.get(o.id);
      if (!a) {
        const r = hash2(o.x * 1.3, o.z * 0.7);
        a = { zone: o.zone, x: o.x, z: o.z, rise: 0, sink: -1, rot: Math.floor(r * 4) * (Math.PI / 2), hs: o.zone === 2 ? 0.58 + 0.42 * hash2(o.x + 3.1, o.z - 7.7) : 1, warn: 0 };
        this.walls.set(o.id, a);
      }
      a.solid = o.solid;
      if (o.solid) {
        if (a.rise === 0) {
          const w = toWorld(o.x, o.z);
          this.raised.push({ x: w.x, z: w.z, zone: o.zone });
        }
        a.rise = Math.min(1, a.rise + dt * (reduceMotion ? 6 : 2.6));
      } else a.warn = Math.min(1, a.warn + dt * 3);
    }
    for (const [id, a] of this.walls) {
      if (seen.has(id)) continue;
      if (a.rise <= 0) {
        this.walls.delete(id);
        continue;
      }
      if (a.sink < 0) a.sink = 0;
      a.sink += dt * (reduceMotion ? 3 : 1.4);
      if (a.sink >= 1) this.walls.delete(id);
    }
    const counts = [0, 0, 0, 0];
    let nh = 0;
    for (const a of this.walls.values()) {
      const st = Math.min(3, a.zone);
      const H = STYLES[st].h * a.hs;
      const w = toWorld(a.x, a.z);
      if (a.rise > 0 && counts[st] < CAP) {
        let e;
        if (a.sink >= 0) e = 1 - a.sink * a.sink;
        else {
          // ease out with a small overshoot
          const t = a.rise;
          e = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
        }
        const wob = a.sink >= 0 ? Math.sin(a.sink * 40 + a.x) * 0.02 * (1 - a.sink) : 0;
        this.tmpP.set(w.x + wob, (e - 1) * H - 0.01, w.z);
        this.tmpQ.setFromAxisAngle(this.up, a.rot);
        this.tmpS.set(1, a.hs, 1);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.meshes[st].setMatrixAt(counts[st]++, this.tmpM);
      }
      if (!a.solid && a.sink < 0 && a.rise === 0 && nh < HOLO_CAP) {
        const grow = 0.25 + 0.75 * (1 - Math.pow(1 - a.warn, 3));
        this.tmpP.set(w.x, 0, w.z);
        this.tmpQ.identity();
        this.tmpS.set(0.96, H * grow, 0.96);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.holo.setMatrixAt(nh++, this.tmpM);
      }
    }
    this.meshes.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
    });
    this.holo.count = nh;
    this.holo.instanceMatrix.needsUpdate = true;

    // ---- laser gates
    let ng = 0;
    const live = new Set();
    for (const gt of game.gates) {
      live.add(gt.id);
      let s = this.gateAmt.get(gt.id);
      if (!s) {
        s = { on: 0, warn: 0, appear: 0 };
        this.gateAmt.set(gt.id, s);
      }
      s.on += ((gt.state === 'on' ? 1 : 0) - s.on) * Math.min(1, dt * 18);
      s.warn += ((gt.state === 'warn' ? 1 : 0) - s.warn) * Math.min(1, dt * 12);
      s.appear = Math.min(1, s.appear + dt * 1.5);
      for (const c of gt.cells) {
        if (ng >= GATE_CAP) break;
        const w = toWorld(c.x, c.z);
        this.tmpP.set(w.x, 0, w.z);
        this.tmpQ.setFromAxisAngle(this.up, gt.axis === 'x' ? 0 : Math.PI / 2);
        this.tmpS.set(1, 1, 1);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.sheets.setMatrixAt(ng, this.tmpM);
        this.rails.setMatrixAt(ng, this.tmpM);
        this.gateOn.array[ng] = s.on;
        this.gateWarn.array[ng] = s.warn;
        // rails: dim red at rest, white-hot when on
        this.railColor.setRGB(0.5, 0.06, 0.12).lerp(this.gateU.uColor.value, 0.5 + 0.5 * s.warn).lerp(this.railHot, s.on).multiplyScalar(s.appear);
        this.rails.setColorAt(ng, this.railColor);
        ng++;
      }
    }
    for (const id of this.gateAmt.keys()) if (!live.has(id)) this.gateAmt.delete(id);
    this.sheets.count = ng;
    this.rails.count = ng;
    this.sheets.instanceMatrix.needsUpdate = true;
    this.rails.instanceMatrix.needsUpdate = true;
    if (this.rails.instanceColor) this.rails.instanceColor.needsUpdate = true;
    this.gateOn.needsUpdate = true;
    this.gateWarn.needsUpdate = true;

    // ---- portals (each end of each pair is one view)
    const ends = [];
    for (const p of game.portals) {
      ends.push({ id: p.id, key: p.key, cell: p.a, open: game.time >= p.activeAt, spin: 1 });
      ends.push({ id: p.id, key: p.key, cell: p.b, open: game.time >= p.activeAt, spin: -1 });
    }
    const used = new Set();
    for (const e of ends) {
      let v = this.portals.find((p) => p.id === e.id && p.spin === e.spin && !used.has(p));
      if (!v) v = this.portals.find((p) => p.id === null && !used.has(p)) || this.portals.find((p) => p.closing >= 0 && !used.has(p));
      if (!v) continue;
      used.add(v);
      if (v.id !== e.id || v.spin !== e.spin) {
        v.id = e.id;
        v.spin = e.spin;
        v.open = 0;
        v.closing = -1;
        v.u.uColor.value.copy(this.portalColors[e.key] || this.portalColors.A);
        v.rimMat.color.copy(v.u.uColor.value).multiplyScalar(2.2);
        v.halo.material.color.copy(v.u.uColor.value).multiplyScalar(1.6);
      }
      const w = toWorld(e.cell.x, e.cell.z);
      v.group.position.set(w.x, 0, w.z);
      v.group.visible = true;
      // a pinpoint while opening, then it irises open
      const target = e.open ? 1 : 0.18 + 0.08 * Math.sin(time * 9);
      v.open += (target - v.open) * Math.min(1, dt * 5);
      v.u.uSpin.value = e.spin;
    }
    for (const v of this.portals) {
      if (used.has(v) || v.id === null) continue;
      // pair gone: shrink away
      if (v.closing < 0) v.closing = 0;
      v.closing += dt * 2;
      v.open = Math.max(0, 1 - v.closing);
      if (v.closing >= 1) {
        v.id = null;
        v.group.visible = false;
      }
    }
    for (const v of this.portals) {
      if (!v.group.visible) continue;
      v.pulse = Math.max(0, v.pulse - dt * 2.5);
      v.u.uOpen.value = v.open;
      v.u.uPulse.value = v.pulse;
      v.u.uTime.value = time;
      v.bu.uAmt.value = 0.28 * v.open + v.pulse * 0.5;
      v.halo.position.y = 0.42 + Math.sin(time * 2.2 + v.spin) * 0.06;
      v.halo.rotation.set(Math.PI / 2 + Math.sin(time * 1.3) * 0.25, 0, time * 1.5 * v.spin);
      v.halo.scale.setScalar(Math.max(0.001, v.open) * (1 + v.pulse * 0.5));
      v.halo.material.opacity = 0.75 * v.open;
    }
  }
}

export { STYLES as WALL_STYLES };
