import * as THREE from 'three';
import { CORE_SIZE } from '../game/SnakeGame.js';

// The Galactic Core: deep space around a black hole at the heart of a spiral
// galaxy. The board is a slab of light tiles floating high above the black
// hole, and the black hole eats it: doomed tiles shiver and glow, then break
// off and fall in, stretching into threads of light that spiral down into
// the accretion disk. Also here: the hyperspeed tunnel that brings the snake
// in, and the finale where the galaxy erupts.

export const CORE_Y = -16; // the black hole sits this far below the board
const HORIZON_R = 5;
const DISK_IN = 5.9;
const DISK_OUT = 19;
const TILE = 0.94; // tile width (cells are 1 apart)
const TILE_H = 0.34;
const MAX_FALL = 220; // tiles falling at once
const MAX_STREAMS = 7000; // threads of light falling at once
const FALL_T = 2.7; // seconds from breaking off to crossing the horizon
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// Where something that broke off at p0 is, a fraction u of the way into the
// black hole (the same path is in FALL_PATH, for the threads of light). It
// drops and is flung outwards round the edge of the board into the
// accretion disk, then winds in faster and faster to the horizon, always
// turning the way the disk turns. jit: 0..1 per-piece variation.
export function fallPath(p0, u, jit, out) {
  const r0 = Math.hypot(p0.x, p0.z);
  const ph0 = Math.atan2(p0.z, p0.x);
  const s = u * u;
  const rMid = Math.max(r0 + 2.5, 9 + jit * 4);
  const a = smooth(clamp01(s / 0.45));
  const b = smooth(clamp01((s - 0.4) / 0.6));
  const r = r0 + (rMid - r0) * a + (HORIZON_R * 0.95 - rMid) * b;
  const y = p0.y + (CORE_Y + 0.3 - p0.y) * (1 - (1 - s) * (1 - s));
  const ph = ph0 + (0.9 + jit * 0.7) * Math.PI * 2 * Math.pow(s, 1.5);
  out.x = r * Math.cos(ph);
  out.y = y;
  out.z = r * Math.sin(ph);
  return out;
}

// ---------------------------------------------------------------- shaders
const POINT_FS = `varying vec3 vCol; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vCol, a * vA); }`;

const STAR_VS = `attribute float aSize; attribute vec3 aCol; attribute float aSeed;
uniform float uTime; uniform float uAmt; uniform float uDpr; uniform float uBoom;
varying vec3 vCol; varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.65 + 0.35 * sin(uTime * (0.8 + aSeed * 2.5) + aSeed * 60.0);
  gl_PointSize = aSize * uDpr * (1.0 + uBoom * 1.5);
  vCol = aCol * (tw + uBoom * 2.0);
  vA = uAmt;
}`;

const GALAXY_VS = `attribute float aR; attribute float aA; attribute float aY; attribute vec3 aCol; attribute float aSize; attribute float aSeed;
uniform float uTime; uniform float uAmt; uniform float uPx; uniform float uWave; uniform float uPush; uniform float uBoom; uniform float uImplode;
varying vec3 vCol; varying float vA;
void main(){
  float r = aR;
  float a = aA + uTime * 0.045 / (1.0 + r * 0.012);
  r *= 1.0 - uImplode * 0.1 * smoothstep(420.0, 0.0, r);
  float front = uWave - r;
  float passed = step(0.0, front);
  float flare = exp(-abs(front) * 0.025) * uBoom;
  float push = passed * uPush * (0.35 + aSeed * 0.9) * min(1.0, front / 160.0);
  r += push;
  vec3 p = vec3(cos(a) * r, aY + sign(aY) * push * 0.08, sin(a) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * (1.0 + flare * 2.5) * uPx / -mv.z, 1.0, 24.0);
  vCol = aCol * (1.0 + flare * 3.5 + passed * uBoom * 0.4) + vec3(flare * 0.8);
  vA = uAmt;
}`;

const DISK_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const DISK_FS = `uniform float uTime; uniform float uAmt; uniform float uHeat; uniform vec3 uCam;
varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 q = vW.xz;
  float r = length(q);
  float t = clamp((r - ${DISK_IN.toFixed(1)}) / (${DISK_OUT.toFixed(1)} - ${DISK_IN.toFixed(1)}), 0.0, 1.0);
  float ang = atan(q.y, q.x);
  // inner parts orbit faster, so the swirl winds up
  float sw = ang + uTime * 0.9 / (0.25 + t * 1.6) - log(r) * 2.2;
  float streak = n(vec2(sw * 2.6, r * 0.55)) * 0.6 + n(vec2(sw * 7.0, r * 1.7)) * 0.4;
  vec3 hot = vec3(1.0, 0.93, 0.8);
  vec3 mid = vec3(1.0, 0.52, 0.16);
  vec3 cool = vec3(0.78, 0.2, 0.62);
  vec3 col = mix(hot, mid, smoothstep(0.0, 0.32, t));
  col = mix(col, cool, smoothstep(0.35, 1.0, t));
  float bright = pow(1.0 - t, 2.6) * (0.12 + 1.7 * streak * streak) + exp(-t * 26.0) * 1.1;
  // the side turning towards the camera is brighter (Doppler beaming)
  vec2 toCam = normalize(uCam.xz + 1e-4);
  vec2 tang = vec2(-sin(ang), cos(ang));
  bright *= 0.7 + 0.55 * dot(tang, vec2(-toCam.y, toCam.x));
  float edge = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.75, t);
  vec3 c = col * bright * edge * (1.15 + uHeat * 6.0) + vec3(uHeat * edge * (1.0 - t) * 2.0);
  gl_FragColor = vec4(c * uAmt, 1.0);
}`;

const BILL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// photon ring and the lensed glow of the disk around the horizon's edge
const HALO_FS = `uniform float uTime; uniform float uAmt; uniform float uHeat; uniform float uR;
varying vec2 vUv;
void main(){
  vec2 c = (vUv - 0.5) * 2.0;
  float r = length(c);
  float ring = exp(-pow((r - uR) * 70.0, 2.0)) * 2.4;
  float glow = smoothstep(uR * 0.98, uR * 1.02, r) * exp(-(r - uR) * 5.5) * 0.9;
  float ang = atan(c.y, c.x);
  float flick = 0.85 + 0.15 * sin(ang * 6.0 + uTime * 2.0) + uHeat * 0.6 * sin(uTime * 37.0 + ang * 9.0);
  vec3 col = vec3(1.0, 0.86, 0.6) * ring * flick + vec3(1.0, 0.45, 0.2) * glow;
  col *= 1.0 + uHeat * 3.0;
  gl_FragColor = vec4(col * uAmt, 1.0);
}`;

// the fall into the black hole (see fallPath)
const FALL_PATH = `
vec3 fallPath(vec3 p0, float u, float jit){
  float r0 = length(p0.xz);
  float ph0 = atan(p0.z, p0.x);
  float s = u * u;
  float rMid = max(r0 + 2.5, 9.0 + jit * 4.0);
  float a = smoothstep(0.0, 0.45, s);
  float b = smoothstep(0.4, 1.0, s);
  float r = r0 + (rMid - r0) * a + (${(HORIZON_R * 0.95).toFixed(3)} - rMid) * b;
  float y = p0.y + (${(CORE_Y + 0.3).toFixed(2)} - p0.y) * (1.0 - (1.0 - s) * (1.0 - s));
  float ph = ph0 + (0.9 + jit * 0.7) * 6.2831853 * pow(s, 1.5);
  return vec3(r * cos(ph), y, r * sin(ph));
}`;

const NOISE = `float h2(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }`;

// The board's tiles. aState: x snake on it, y doomed (0..1 through the
// warning), z fallen; aEdge: which sides (-x, +x, -z, +z) face the void.
const TILE_VS = `attribute vec4 aState; attribute vec4 aEdge; uniform float uTime;
varying vec3 vL; varying vec3 vN; varying vec4 vS; varying vec4 vE; varying vec3 vW;
void main(){
  vL = position; vN = normal; vS = aState; vE = aEdge;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float d = aState.y;
  float seed = instanceMatrix[3].x * 7.13 + instanceMatrix[3].z * 3.71;
  // doomed: it shivers and starts to sag towards the hole
  w.x += sin(uTime * 61.0 + seed) * 0.025 * d;
  w.z += cos(uTime * 53.0 + seed * 1.7) * 0.025 * d;
  w.y -= 0.12 * d * d;
  vW = w.xyz;
  gl_Position = aState.z > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * w;
}`;
// Liquid glass: nearly clear, so the black hole shows through the board.
// The light is in the bevelled edges, a fresnel sheen at grazing angles,
// and caustics that drift slowly across it like light through water.
const TILE_FS = `uniform float uTime; uniform float uAmt; uniform float uFeed;
uniform vec3 uLine; uniform vec3 uSnake; uniform vec3 uHot; uniform vec3 uBase;
varying vec3 vL; varying vec3 vN; varying vec4 vS; varying vec4 vE; varying vec3 vW;
${NOISE}
void main(){
  if (vN.y < -0.5) discard;
  vec2 q = vL.xz / ${(TILE / 2).toFixed(3)};
  float e = max(abs(q.x), abs(q.y));
  float d = vS.y;
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - abs(dot(V, normalize(vN))), 3.0);
  float flick = 0.7 + 0.3 * sin(uTime * 9.0 + vW.x * 3.0 + vW.z * 2.0) * sin(uTime * 5.3 + vW.z);
  // the edges that face the void glow hot, as if the light is being pulled off them
  float rx = max(vE.x * smoothstep(0.3, 1.0, -q.x), vE.y * smoothstep(0.3, 1.0, q.x));
  float rz = max(vE.z * smoothstep(0.3, 1.0, -q.y), vE.w * smoothstep(0.3, 1.0, q.y));
  float rim = max(rx, rz);
  vec3 col;
  float a;
  if (vN.y > 0.5) {
    // caustics: two layers of drifting noise, folded into thin bright lines
    vec2 w = vW.xz * 0.9;
    float c1 = n2(w * 1.7 + vec2(uTime * 0.21, uTime * 0.13));
    float c2 = n2(w * 2.9 - vec2(uTime * 0.17, -uTime * 0.23) + c1 * 1.5);
    float caustic = pow(1.0 - abs(c1 + c2 - 1.0), 7.0);
    float sheen = pow(0.5 + 0.5 * sin(vW.x * 0.55 + vW.z * 0.35 - uTime * 0.7), 30.0);
    float bevel = smoothstep(0.78, 0.97, e);
    float pulse = pow(0.5 + 0.5 * sin(length(vW.xz) * 1.1 - uTime * 1.8), 10.0);
    col = uBase * 0.6 + uLine * (bevel * (0.75 + 0.4 * uFeed) + caustic * 0.55 + pulse * 0.1) + vec3(0.85, 0.95, 1.0) * (sheen * 0.35 + fres * 0.35);
    a = 0.1 + bevel * 0.55 + caustic * 0.18 + sheen * 0.15 + fres * 0.3;
    // the snake's colour glows faintly through the glass under it
    col += uSnake * vS.x * 0.35;
    a += vS.x * 0.12;
    col += uHot * rim * rim * flick * 1.6;
    a += rim * rim * flick * 0.6;
    // doomed: veins of light crack through it, and it flashes faster and faster
    float vein = smoothstep(0.07, 0.0, abs(n2(vL.xz * 5.0 + vW.xz * 2.3) - 0.5));
    float beat = 0.5 + 0.5 * sin(uTime * (8.0 + 34.0 * d));
    float crack = d * (vein * (0.8 + 3.0 * d) + beat * d * 0.7);
    col += mix(uHot, vec3(1.0), 0.45) * crack;
    a += min(1.0, crack) * 0.7 + d * 0.15;
  } else {
    float y = vL.y / ${TILE_H.toFixed(2)} + 1.0;
    float facing = (vN.x < -0.5 ? vE.x : 0.0) + (vN.x > 0.5 ? vE.y : 0.0) + (vN.z < -0.5 ? vE.z : 0.0) + (vN.z > 0.5 ? vE.w : 0.0);
    col = uBase * 0.5 + uLine * smoothstep(0.65, 1.0, y) * 0.6 + vec3(0.8, 0.95, 1.0) * fres * 0.3;
    col += uHot * facing * (0.35 + 1.1 * (1.0 - y)) * flick + uHot * d * 1.2;
    a = 0.06 + smoothstep(0.65, 1.0, y) * 0.35 + fres * 0.2 + facing * (0.25 + 0.4 * (1.0 - y)) + d * 0.3;
  }
  gl_FragColor = vec4(col, min(1.0, a) * uAmt);
}`;

// A tile that has broken off. aProg: how far it has fallen (0..1).
const FALL_VS = `attribute float aProg; varying vec3 vL; varying vec3 vN; varying float vP;
void main(){ vL = position; vN = normal; vP = aProg; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`;
// (additive: it is turning into light; its outline burns brightest)
const FALL_FS = `uniform vec3 uLine; uniform vec3 uHot; uniform vec3 uBase;
varying vec3 vL; varying vec3 vN; varying float vP;
void main(){
  float s = vP * vP;
  vec2 q = vL.xz / ${(TILE / 2).toFixed(3)};
  float e = max(abs(q.x), abs(q.y));
  float top = step(0.5, abs(vN.y));
  float outline = mix(0.5, smoothstep(0.7, 0.98, e), top);
  vec3 cold = uBase * 0.8 + uLine * outline * 0.9 + uHot * 0.12;
  vec3 hot = mix(uLine, uHot, smoothstep(0.2, 0.9, s)) * (0.6 + outline * 1.6) * (1.0 + 2.0 * s);
  vec3 col = mix(cold, hot, smoothstep(0.02, 0.5, s));
  gl_FragColor = vec4(col * (1.0 - smoothstep(0.8, 1.0, vP)), 1.0);
}`;

// Threads of light falling in: a pool of particles that each draw as a
// glowing head (points) and a trail (lines), all along FALL_PATH, computed
// on the GPU from where and when they started. aT: birth, duration, jitter,
// and 0 for the head end / 1 for the tail end.
const STREAM_VS = `attribute vec3 aP0; attribute vec4 aT; attribute vec3 aCol;
uniform float uTime; uniform float uAmt; uniform float uDpr; uniform float uPts;
varying vec3 vCol; varying float vA;
${FALL_PATH}
void main(){
  float u = (uTime - aT.x) / aT.y;
  vA = 0.0;
  vCol = vec3(0.0);
  if (u < 0.0 || u > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float tail = aT.w;
  float uu = max(0.0, u - tail * (0.01 + 0.075 * u * u));
  vec3 p = fallPath(aP0, uu, aT.z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float heat = smoothstep(0.25, 0.95, u);
  // cool light at first, heating to gold as it falls into the disk
  vCol = mix(aCol, vec3(1.0, 0.62, 0.25), heat * 0.75) * (0.9 + 1.7 * heat);
  vA = uAmt * smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.86, 1.0, u)) * (1.0 - tail * mix(0.8, 1.0, uPts));
  gl_PointSize = uPts * (1.0 - tail) * uDpr * (3.0 + 4.0 * heat);
}`;
const LINE_FS = `varying vec3 vCol; varying float vA; void main(){ gl_FragColor = vec4(vCol, vA); }`;

const STREAK_VS = `attribute float aEnd; attribute vec3 aSeed;
uniform float uTime; uniform float uSpeed; uniform float uAmt; uniform float uLen;
varying float vA; varying vec3 vCol;
void main(){
  float z = -705.0 + mod(aSeed.z + uTime * uSpeed, 700.0);
  float zz = z - aEnd * uLen * (0.6 + aSeed.y / 50.0);
  vec3 p = vec3(cos(aSeed.x) * aSeed.y, sin(aSeed.x) * aSeed.y, zz);
  vA = uAmt * smoothstep(-705.0, -420.0, z) * (1.0 - aEnd * 0.85);
  vCol = mix(vec3(0.55, 0.75, 1.0), vec3(1.0, 0.7, 1.0), fract(aSeed.x * 3.7));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const STREAK_FS = `varying float vA; varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol * 1.6, vA); }`;

const TUBE_FS = `uniform float uTime; uniform float uAmt; uniform float uSpeed; varying vec2 vUv;
void main(){
  float a = vUv.x * 6.2831853;
  float flow = vUv.y * 9.0 + uTime * uSpeed * 0.012;
  float s = pow(0.5 + 0.5 * sin(a * 23.0 + sin(flow * 1.3) * 2.0), 18.0) * (0.5 + 0.5 * sin(flow * 3.0 + a * 5.0));
  float neb = 0.5 + 0.5 * sin(a * 3.0 + flow * 0.7);
  vec3 col = mix(vec3(0.15, 0.25, 0.9), vec3(0.8, 0.2, 0.9), neb) * (0.25 + s * 1.6);
  float ends = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
  gl_FragColor = vec4(col * ends * uAmt, 1.0);
}`;

const JET_FS = `uniform float uTime; uniform float uAmt; varying vec2 vUv;
void main(){
  float y = vUv.y;
  float core = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 3.0);
  float knots = 0.7 + 0.3 * sin(y * 60.0 - uTime * 14.0);
  float rim = pow(1.0 - abs(fract(vUv.x * 2.0) - 0.5) * 2.0, 6.0);
  vec3 col = mix(vec3(0.5, 0.75, 1.0), vec3(0.85, 0.45, 1.0), y) * knots * pow(1.0 - y, 2.2) * (0.25 + rim * 0.5);
  gl_FragColor = vec4(col * uAmt * smoothstep(0.0, 0.03, y), 1.0);
}`;

const additive = (extra) => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...extra });

// A little spiral galaxy, drawn once onto a canvas.
function makeGalaxyTexture(hue) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const core = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  core.addColorStop(0, 'rgba(255,245,225,1)');
  core.addColorStop(0.12, `hsla(${hue},80%,75%,0.55)`);
  core.addColorStop(0.5, `hsla(${hue},70%,45%,0.12)`);
  core.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 900; i++) {
    const arm = i % 2;
    const t = Math.random();
    const r = 6 + t * (S * 0.45);
    const a = arm * Math.PI + Math.log(r / 6) * 2.4 + (Math.random() - 0.5) * 0.7;
    const x = S / 2 + Math.cos(a) * r;
    const y = S / 2 + Math.sin(a) * r;
    g.fillStyle = `hsla(${hue + (Math.random() - 0.5) * 60},90%,${70 + Math.random() * 25}%,${0.35 * (1 - t)})`;
    g.beginPath();
    g.arc(x, y, 1 + Math.random() * 2.5, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rng) => (rng() + rng() + rng() + rng() - 2) / 2;

export class Space {
  constructor(glowTex) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.amount = 0;
    this.time = 0;
    this.cover = 0; // 1 while the hyperspeed tunnel hides everything
    this.won = false;
    this.finaleT = null;
    this.glowTex = glowTex;
    this.buildStars();
    this.buildGalaxy();
    this.buildNebulae();
    this.buildDistant();
    this.buildCore();
    this.buildJets();
    this.buildTiles();
    this.buildFalls();
    this.buildStreams();
    this.buildShock();
    this.buildWarp();
  }

  // ---------------------------------------------------------------- build
  buildStars() {
    const n = 5200;
    const rng = mulberry(7);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const seed = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1;
      const a = rng() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * s * 900, u * 900, Math.sin(a) * s * 900], i * 3);
      c.setHSL(rng() < 0.7 ? 0.6 + rng() * 0.08 : 0.08 + rng() * 0.06, 0.5 + rng() * 0.4, 0.75 + rng() * 0.2);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = 1 + Math.pow(rng(), 6) * 3.5;
      seed[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.starU = { uTime: { value: 0 }, uAmt: { value: 0 }, uDpr: { value: 1 }, uBoom: { value: 0 } };
    this.stars = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: this.starU, vertexShader: STAR_VS, fragmentShader: POINT_FS, ...additive() }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -10;
    this.group.add(this.stars);
  }

  buildGalaxy() {
    const n = 26000;
    const rng = mulberry(11);
    const R = new Float32Array(n);
    const A = new Float32Array(n);
    const Yy = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const seed = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let r;
      let a;
      const k = rng();
      if (k < 0.18) {
        // the bulge around the core
        r = 9 + Math.pow(rng(), 1.3) * 90;
        a = rng() * Math.PI * 2;
        c.setRGB(1, 0.82 + rng() * 0.15, 0.55 + rng() * 0.25);
      } else {
        const arm = Math.floor(rng() * 3);
        r = 22 + Math.pow(rng(), 0.85) * 440;
        a = (arm * Math.PI * 2) / 3 + Math.log(r / 24) * 2.1 + gauss(rng) * (0.25 + 60 / r);
        const pick = rng();
        if (pick < 0.08) c.setRGB(1, 0.35, 0.7); // star-forming knots
        else if (pick < 0.22) c.setRGB(0.42, 0.3, 0.75); // dusty violet
        else c.setRGB(0.55 + rng() * 0.25, 0.68 + rng() * 0.2, 1);
      }
      R[i] = r;
      A[i] = a;
      Yy[i] = gauss(rng) * (2 + 10 * Math.exp(-r / 60)) ;
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = (r < 60 ? 0.11 : r < 140 ? 0.3 : 0.7) * (0.5 + Math.pow(rng(), 3) * 2.5);
      seed[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aR', new THREE.BufferAttribute(R, 1));
    geo.setAttribute('aA', new THREE.BufferAttribute(A, 1));
    geo.setAttribute('aY', new THREE.BufferAttribute(Yy, 1));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.galU = {
      uTime: { value: 0 }, uAmt: { value: 0 }, uPx: { value: 400 }, uWave: { value: -10 }, uPush: { value: 0 }, uBoom: { value: 0 }, uImplode: { value: 0 },
    };
    this.galaxy = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: this.galU, vertexShader: GALAXY_VS, fragmentShader: POINT_FS, ...additive() }));
    this.galaxy.position.y = CORE_Y - 1;
    this.galaxy.frustumCulled = false;
    this.galaxy.renderOrder = -6;
    this.group.add(this.galaxy);
  }

  buildNebulae() {
    const rng = mulberry(23);
    this.nebulae = new THREE.Group();
    const cols = ['#5a2aff', '#ff3d9a', '#2a7dff', '#b04aff', '#ff7a3a'];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.SpriteMaterial({ map: this.glowTex, color: cols[i % cols.length], ...additive({ opacity: 0.16 + rng() * 0.12 }) });
      const s = new THREE.Sprite(m);
      const a = rng() * Math.PI * 2;
      const r = 90 + rng() * 380;
      s.position.set(Math.cos(a) * r, CORE_Y - 6 + gauss(rng) * 25, Math.sin(a) * r);
      s.scale.setScalar(120 + rng() * 220);
      s.userData.base = m.opacity;
      this.nebulae.add(s);
    }
    this.nebulae.renderOrder = -8;
    this.group.add(this.nebulae);
  }

  buildDistant() {
    const rng = mulberry(31);
    this.distant = [];
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 9; i++) {
      const hue = [210, 280, 330, 30, 190][i % 5];
      const m = new THREE.MeshBasicMaterial({ map: makeGalaxyTexture(hue), side: THREE.DoubleSide, ...additive({ opacity: 0.85 }) });
      const mesh = new THREE.Mesh(geo, m);
      const a = (i / 9) * Math.PI * 2 + rng() * 0.4;
      const el = (rng() - 0.35) * 0.9;
      const R = 620 + rng() * 120;
      mesh.position.set(Math.cos(a) * Math.cos(el) * R, Math.sin(el) * R + 40, Math.sin(a) * Math.cos(el) * R);
      mesh.lookAt(0, 0, 0);
      mesh.rotateX((rng() - 0.5) * 2.2);
      mesh.rotateY((rng() - 0.5) * 1.2);
      mesh.scale.setScalar(50 + rng() * 70);
      mesh.userData = { dist: mesh.position.length(), flash: 0, base: m.opacity, scale: mesh.scale.x };
      mesh.renderOrder = -9;
      g.add(mesh);
      this.distant.push(mesh);
    }
    this.group.add(g);
  }

  buildCore() {
    this.core = new THREE.Group();
    this.core.position.y = CORE_Y;
    const horizon = new THREE.Mesh(new THREE.SphereGeometry(HORIZON_R, 48, 32), new THREE.MeshBasicMaterial({ color: '#000000', fog: false }));
    horizon.renderOrder = -2;
    this.core.add(horizon);
    this.diskU = { uTime: { value: 0 }, uAmt: { value: 0 }, uHeat: { value: 0 }, uCam: { value: new THREE.Vector3(0, 1, 1) } };
    const dgeo = new THREE.RingGeometry(DISK_IN, DISK_OUT, 160, 6);
    dgeo.rotateX(-Math.PI / 2);
    this.disk = new THREE.Mesh(dgeo, new THREE.ShaderMaterial({ uniforms: this.diskU, vertexShader: DISK_VS, fragmentShader: DISK_FS, side: THREE.DoubleSide, ...additive() }));
    this.disk.renderOrder = -1;
    this.core.add(this.disk);
    this.haloU = { uTime: { value: 0 }, uAmt: { value: 0 }, uHeat: { value: 0 }, uR: { value: 0.4 } };
    this.photon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: this.haloU, vertexShader: BILL_VS, fragmentShader: HALO_FS, ...additive() }));
    this.photon.scale.setScalar(HORIZON_R * 2 / 0.4);
    this.photon.renderOrder = 0;
    this.core.add(this.photon);
    // a warm glow the whole core sits in
    this.coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ff9a4a', ...additive({ opacity: 0.5 }) }));
    this.coreGlow.scale.setScalar(34);
    this.coreGlow.renderOrder = -3;
    this.core.add(this.coreGlow);
    this.group.add(this.core);
  }

  buildJets() {
    this.jetU = { uTime: { value: 0 }, uAmt: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.jetU, vertexShader: BILL_VS, fragmentShader: JET_FS, side: THREE.DoubleSide, ...additive() });
    this.jets = new THREE.Group();
    for (const dir of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const geo = new THREE.CylinderGeometry(0.25, 4.5, 420, 24, 1, true);
        geo.translate(0, 210, 0);
        const m = new THREE.Mesh(geo, mat);
        m.scale.set(1 - k * 0.25, 1, 1 - k * 0.25);
        m.rotation.y = k * 0.9;
        if (dir < 0) m.rotation.x = Math.PI;
        m.frustumCulled = false;
        this.jets.add(m);
      }
    }
    this.jets.position.y = CORE_Y;
    this.jets.visible = false;
    this.group.add(this.jets);
  }

  buildTiles() {
    const S = CORE_SIZE;
    const geo = new THREE.BoxGeometry(TILE, TILE_H, TILE);
    geo.translate(0, -TILE_H / 2, 0);
    this.tileState = new Float32Array(S * S * 4);
    this.tileEdge = new Float32Array(S * S * 4);
    geo.setAttribute('aState', new THREE.InstancedBufferAttribute(this.tileState, 4));
    geo.setAttribute('aEdge', new THREE.InstancedBufferAttribute(this.tileEdge, 4));
    this.tileU = {
      uTime: { value: 0 }, uAmt: { value: 0 }, uFeed: { value: 0 },
      uLine: { value: new THREE.Color('#5fd6ff') }, uSnake: { value: new THREE.Color('#38f6ff') }, uHot: { value: new THREE.Color('#ffa456') }, uBase: { value: new THREE.Color('#0a1030') },
    };
    // glass: drawn without writing depth, so whatever falls beneath shows through
    const mat = new THREE.ShaderMaterial({ uniforms: this.tileU, vertexShader: TILE_VS, fragmentShader: TILE_FS, transparent: true, depthWrite: false, fog: false });
    this.tiles = new THREE.InstancedMesh(geo, mat, S * S);
    const m = new THREE.Matrix4();
    const o = (S - 1) / 2;
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) this.tiles.setMatrixAt(x * S + z, m.makeTranslation(x - o, 0, z - o));
    this.tiles.frustumCulled = false;
    this.tiles.renderOrder = 1;
    this.tiles.visible = false;
    this.group.add(this.tiles);
    this.boardAmt = 0;
    this.prevLand = null;
    this.seenDoom = new Set();
  }

  buildFalls() {
    const geo = new THREE.BoxGeometry(TILE, TILE_H, TILE);
    this.fallProg = new Float32Array(MAX_FALL);
    geo.setAttribute('aProg', new THREE.InstancedBufferAttribute(this.fallProg, 1));
    this.fallU = { uLine: this.tileU.uLine, uHot: this.tileU.uHot, uBase: this.tileU.uBase };
    this.falls = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: this.fallU, vertexShader: FALL_VS, fragmentShader: FALL_FS, ...additive() }), MAX_FALL);
    this.falls.count = 0;
    this.falls.frustumCulled = false;
    this.falls.renderOrder = 2;
    this.group.add(this.falls);
    this.falling = []; // { p0, t0, dur, jit, spin }
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpQ2 = new THREE.Quaternion();
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.tmpS = new THREE.Vector3();
    this.tmpE = new THREE.Euler();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  buildStreams() {
    const n = MAX_STREAMS * 2;
    this.sP0 = new Float32Array(n * 3);
    this.sT = new Float32Array(n * 4).fill(-1e6);
    this.sCol = new Float32Array(n * 3);
    for (let i = 0; i < MAX_STREAMS; i++) this.sT[(i * 2 + 1) * 4 + 3] = 1;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sAttr = {
      p0: new THREE.BufferAttribute(this.sP0, 3), t: new THREE.BufferAttribute(this.sT, 4), col: new THREE.BufferAttribute(this.sCol, 3),
    };
    geo.setAttribute('aP0', this.sAttr.p0);
    geo.setAttribute('aT', this.sAttr.t);
    geo.setAttribute('aCol', this.sAttr.col);
    const base = { uTime: { value: 0 }, uAmt: { value: 0 }, uDpr: { value: 1 } };
    this.lineU = { ...base, uPts: { value: 0 } };
    this.ptsU = { ...base, uPts: { value: 1 } };
    const lines = new THREE.LineSegments(geo, new THREE.ShaderMaterial({ uniforms: this.lineU, vertexShader: STREAM_VS, fragmentShader: LINE_FS, ...additive() }));
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: this.ptsU, vertexShader: STREAM_VS, fragmentShader: POINT_FS, ...additive() }));
    this.streams = new THREE.Group();
    for (const o of [lines, pts]) {
      o.frustumCulled = false;
      o.renderOrder = 4;
      this.streams.add(o);
    }
    this.group.add(this.streams);
    this.sNext = 0;
    this.sDirty = null;
    this.streamsUntil = -1;
    this.arrivals = []; // times when light reaches the horizon (the core flares)
    this.scheduled = []; // { at, fn }: finale spawns
    this.feed = 0; // a short flare each time something falls in
    this.fed = 0; // how much of the board the black hole has eaten, 0..1
  }

  buildShock() {
    const geo = new THREE.RingGeometry(0.97, 1, 256, 1);
    geo.rotateX(-Math.PI / 2);
    this.shocks = [0, 1].map((i) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i ? '#ffb0e8' : '#ffffff', side: THREE.DoubleSide, ...additive({ opacity: 0 }) }));
      m.position.y = CORE_Y;
      if (i) m.rotation.set(0.5, 0, 0.3);
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    });
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffffff', ...additive({ opacity: 0 }) }));
    this.flashSprite.position.y = CORE_Y;
    this.flashSprite.scale.setScalar(10);
    this.flashSprite.visible = false;
    this.group.add(this.flashSprite);
  }

  buildWarp() {
    const n = 1400;
    const rng = mulberry(41);
    const seed = new Float32Array(n * 2 * 3);
    const end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const s = [rng() * Math.PI * 2, 3 + Math.pow(rng(), 0.6) * 55, rng() * 700];
      seed.set(s, i * 6);
      seed.set(s, i * 6 + 3);
      end[i * 2] = 0;
      end[i * 2 + 1] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.warpU = { uTime: { value: 0 }, uSpeed: { value: 60 }, uAmt: { value: 0 }, uLen: { value: 4 } };
    this.warp = new THREE.Group();
    const lines = new THREE.LineSegments(geo, new THREE.ShaderMaterial({ uniforms: this.warpU, vertexShader: STREAK_VS, fragmentShader: STREAK_FS, ...additive({ depthTest: false }) }));
    lines.frustumCulled = false;
    lines.renderOrder = 20;
    const tubeGeo = new THREE.CylinderGeometry(70, 70, 760, 64, 1, true);
    tubeGeo.rotateX(Math.PI / 2);
    tubeGeo.translate(0, 0, -380);
    this.tubeU = { uTime: this.warpU.uTime, uAmt: { value: 0 }, uSpeed: this.warpU.uSpeed };
    const tube = new THREE.Mesh(tubeGeo, new THREE.ShaderMaterial({ uniforms: this.tubeU, vertexShader: BILL_VS, fragmentShader: TUBE_FS, side: THREE.BackSide, ...additive({ depthTest: false }) }));
    tube.frustumCulled = false;
    tube.renderOrder = 19;
    this.warp.add(tube, lines);
    this.warp.visible = false;
    this.warpAmt = 0;
    this.warpSpeed = 0;
  }

  // ---------------------------------------------------------------- state
  // The snake's colour, used for the glow under it and when it falls in.
  setSnakeColor(hex) {
    this.snakeColor = new THREE.Color(hex || '#38f6ff');
    this.tileU.uSnake.value.copy(this.snakeColor);
  }

  // A fresh run: nothing falling, the black hole hungry again.
  reset() {
    this.finaleT = null;
    this.falling.length = 0;
    this.falls.count = 0;
    this.sT.fill(-1e6);
    for (let i = 0; i < MAX_STREAMS; i++) this.sT[(i * 2 + 1) * 4 + 3] = 1;
    this.sAttr.t.needsUpdate = true;
    this.streamsUntil = -1;
    this.arrivals.length = 0;
    this.scheduled.length = 0;
    this.feed = 0;
    this.fed = 0;
    this.prevLand = null;
    this.seenDoom.clear();
    this.applyWon();
  }

  // After the game has been won, the core keeps its jets.
  setWon(won) {
    this.won = won;
    this.applyWon();
  }

  applyWon() {
    if (this.finaleT != null) return;
    this.galU.uPush.value = 0;
    this.galU.uWave.value = -10;
    this.galU.uBoom.value = 0;
  }

  cellPos(x, z, out = this.tmpB) {
    const o = (CORE_SIZE - 1) / 2;
    return out.set(x - o, 0, z - o);
  }

  // Light threads: n of them from points around p (spread wide), starting
  // over `over` seconds from `delay` on.
  emitStreams(p, n, color, { spread = 0.45, delay = 0, over = 0.35, dur = FALL_T, y = 0.05 } = {}) {
    const T = this.time;
    const c = this.tmpS.set(0, 0, 0);
    const col = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.sNext;
      this.sNext = (this.sNext + 1) % MAX_STREAMS;
      const px = p.x + (Math.random() - 0.5) * 2 * spread;
      const py = p.y + y + Math.random() * 0.12;
      const pz = p.z + (Math.random() - 0.5) * 2 * spread;
      const birth = T + delay + Math.random() * over;
      const d = dur * (0.8 + Math.random() * 0.45);
      const jit = Math.random();
      // a touch of white, so the threads sparkle
      c.set(col.r, col.g, col.b).lerp(this.tmpA.set(1, 1, 1), Math.random() * 0.5);
      for (const e of [0, 1]) {
        const v = i * 2 + e;
        this.sP0.set([px, py, pz], v * 3);
        this.sT.set([birth, d, jit, e], v * 4);
        this.sCol.set([c.x, c.y, c.z], v * 3);
      }
      this.markStream(i);
      this.streamsUntil = Math.max(this.streamsUntil, birth + d);
      if (k === 0) this.arrivals.push(birth + d * 0.97);
    }
  }

  markStream(i) {
    const d = this.sDirty;
    this.sDirty = d ? [Math.min(d[0], i), Math.max(d[1], i)] : [i, i];
  }

  // A tile breaks off at cell (x, z) and falls in, shedding light.
  dropTile(x, z, { delay = 0, streams = 34 } = {}) {
    const p = this.cellPos(x, z, new THREE.Vector3());
    if (this.falling.length < MAX_FALL) {
      this.falling.push({ p0: p.clone().setY(-TILE_H / 2), t0: this.time + delay, dur: FALL_T * (0.9 + Math.random() * 0.2), jit: Math.random(), spin: (Math.random() - 0.5) * 6 });
    }
    this.emitStreams(p, streams, this.tileU.uLine.value, { delay, over: 0.5 });
    this.emitStreams(p, Math.ceil(streams / 3), this.tileU.uHot.value, { delay: delay + 0.1, over: 0.6 });
    this.fed = Math.min(1, this.fed + 1 / (CORE_SIZE * CORE_SIZE * 0.75));
  }

  // The board, from the game, every frame (game: null when not in the core).
  // Cells that disappeared since last frame break off and fall in.
  syncBoard(game, t) {
    const on = !!(game && game.space && game.land);
    const want = on && this.finaleT == null ? 1 : 0;
    this.boardAmt += (want - this.boardAmt) * (want ? 0.08 : 0.2);
    if (!want && this.boardAmt < 0.01) this.boardAmt = 0;
    this.tiles.visible = this.boardAmt > 0.002 && this.cover < 0.5;
    this.tileU.uAmt.value = this.boardAmt;
    if (!on) {
      this.prevLand = null;
      return;
    }
    const S = CORE_SIZE;
    const L = game.land;
    if (this.prevLand && this.prevLand.length === L.length && this.prevLand.src === L) {
      for (let i = 0; i < L.length; i++) if (this.prevLand[i] && !L[i]) this.dropTile(Math.floor(i / S), i % S);
    }
    this.prevLand = L.slice();
    this.prevLand.src = L;
    const now = game.time + t * game.currentInterval();
    const st = this.tileState;
    const ed = this.tileEdge;
    st.fill(0);
    for (let i = 0; i < S * S; i++) st[i * 4 + 2] = L[i] ? 0 : 1;
    for (const c of game.cells) if (c.x >= 0 && c.z >= 0 && c.x < S && c.z < S) st[(c.x * S + c.z) * 4] = 1;
    for (const d of game.doomed) {
      const k = d.x * S + d.z;
      st[k * 4 + 1] = Math.max(0.05, clamp01((now - d.doomAt) / (d.fallAt - d.doomAt)));
      if (!this.seenDoom.has(d.id)) {
        // as soon as it's doomed, the first wisps of light get pulled off it
        this.seenDoom.add(d.id);
        this.emitStreams(this.cellPos(d.x, d.z), 7, this.tileU.uLine.value, { over: (d.fallAt - d.doomAt) / 1000, dur: FALL_T * 1.1 });
      }
    }
    const land = (x, z) => x >= 0 && z >= 0 && x < S && z < S && L[x * S + z] === 1;
    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        const k = (x * S + z) * 4;
        ed[k] = land(x - 1, z) ? 0 : 1;
        ed[k + 1] = land(x + 1, z) ? 0 : 1;
        ed[k + 2] = land(x, z - 1) ? 0 : 1;
        ed[k + 3] = land(x, z + 1) ? 0 : 1;
      }
    }
    this.tiles.geometry.attributes.aState.needsUpdate = true;
    this.tiles.geometry.attributes.aEdge.needsUpdate = true;
  }

  // The finale: whatever is left of the board, and the snake that fills it,
  // all pour into the black hole in one great spiral of light.
  startFinale(game) {
    this.finaleT = 0;
    this.eruptAt = 3.6;
    if (!game || !game.land) return;
    const S = CORE_SIZE;
    const order = [];
    for (let i = 0; i < S * S; i++) if (game.land[i]) order.push(i);
    order.sort((a, b) => (game.spiral ? game.spiral[a] - game.spiral[b] : a - b));
    order.forEach((i, j) => {
      const at = 0.35 + (j / Math.max(1, order.length)) * 1.1;
      this.scheduled.push({ at, fn: () => this.dropTile(Math.floor(i / S), i % S, { streams: 22 }) });
    });
    const n = game.cells.length;
    game.cells.forEach((c, j) => {
      const at = 0.5 + ((n - 1 - j) / Math.max(1, n)) * 1.0;
      const p = this.cellPos(c.x, c.z, new THREE.Vector3());
      this.scheduled.push({ at, fn: () => this.emitStreams(p, 46, this.snakeColor || '#38f6ff', { y: 0.35, over: 0.25, dur: FALL_T * 0.95 }) });
    });
  }

  // amount: how much of the Galactic Core the world shows (palette blend).
  apply(amount) {
    this.amount = amount;
    this.group.visible = amount > 0.002;
  }

  update(dt, camera, { pxScale = 400, dpr = 1, reduceMotion = false } = {}) {
    this.time += dt;
    const T = this.time;
    const a = this.amount;
    const show = a * (1 - this.cover);
    this.starU.uTime.value = T;
    this.starU.uAmt.value = show;
    this.starU.uDpr.value = dpr;
    this.galU.uTime.value = T;
    this.galU.uAmt.value = show * 0.75;
    this.galU.uPx.value = pxScale;
    this.diskU.uTime.value = T * (reduceMotion ? 0.4 : 1);
    this.diskU.uAmt.value = show;
    this.diskU.uCam.value.copy(camera.position);
    this.haloU.uTime.value = T;
    this.haloU.uAmt.value = show;
    this.coreGlow.material.opacity = 0.2 * show;
    this.photon.quaternion.copy(camera.quaternion);
    this.core.visible = show > 0.002;
    this.galaxy.visible = show > 0.002;
    this.nebulae.visible = show > 0.002;
    for (const s of this.nebulae.children) s.material.opacity = s.userData.base * show;
    for (const g of this.distant) {
      const d = g.userData;
      d.flash = Math.max(0, d.flash - dt * 1.4);
      g.material.opacity = d.base * a * (1 - this.cover) + d.flash;
      g.scale.setScalar(d.scale * (1 + d.flash * 0.8));
    }
    this.jetU.uTime.value = T;
    this.tileU.uTime.value = T;
    this.updateFalls(dt, show, dpr);

    this.updateFinale(dt);
    this.updateWarp(dt, camera);
  }

  // Falling tiles (on the CPU, there are few) and the light threads (on the
  // GPU: only freshly spawned ones are uploaded). Each arrival at the
  // horizon makes the core flare; the more it has eaten, the brighter it burns.
  updateFalls(dt, show, dpr) {
    const T = this.time;
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const e = this.scheduled[i];
      if (this.finaleT == null || this.finaleT < e.at) continue;
      this.scheduled.splice(i, 1);
      e.fn();
    }
    let n = 0;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      const u = (T - f.t0) / f.dur;
      if (u > 1) {
        this.falling.splice(i, 1);
        continue;
      }
      const uu = Math.max(0, u);
      const p = fallPath(f.p0, uu, f.jit, this.tmpA);
      const q = fallPath(f.p0, Math.min(1, uu + 0.02), f.jit, this.tmpS);
      const vel = q.sub(p).normalize();
      const s = uu * uu;
      // it tumbles off flat, then lines up with its fall and stretches out
      // into a needle of light (spaghettified)
      const tumble = this.tmpQ2.setFromEuler(this.tmpE.set(uu * f.spin * 0.6, uu * f.spin, uu * f.spin * 0.4));
      if (vel.lengthSq() > 0.5) this.tmpQ.setFromUnitVectors(this.up, vel);
      else this.tmpQ.identity();
      tumble.slerp(this.tmpQ, smooth(clamp01(s / 0.35)));
      const thin = Math.max(0.05, 1 - s * 0.95);
      this.tmpB.set(thin, 1 + s * 26, thin);
      this.tmpM.compose(p, tumble, this.tmpB);
      this.falls.setMatrixAt(n, this.tmpM);
      this.fallProg[n] = uu;
      n++;
    }
    this.falls.count = n;
    this.falls.visible = n > 0 && show > 0.002;
    if (n) {
      this.falls.instanceMatrix.needsUpdate = true;
      this.falls.geometry.attributes.aProg.needsUpdate = true;
    }
    // upload only the threads that changed this frame
    if (this.sDirty) {
      const [a, b] = this.sDirty;
      for (const [attr, w] of [[this.sAttr.p0, 3], [this.sAttr.t, 4], [this.sAttr.col, 3]]) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(a * 2 * w, (b - a + 1) * 2 * w);
        attr.needsUpdate = true;
      }
      this.sDirty = null;
    }
    for (const u of [this.lineU, this.ptsU]) {
      u.uTime.value = T;
      u.uAmt.value = show;
      u.uDpr.value = dpr;
    }
    this.streams.visible = T < this.streamsUntil + 0.1 && show > 0.002;
    for (let i = this.arrivals.length - 1; i >= 0; i--) {
      if (T < this.arrivals[i]) continue;
      this.arrivals.splice(i, 1);
      this.feed = Math.min(1.6, this.feed + 0.22);
    }
    this.feed *= Math.exp(-dt * 2.2);
    this.tileU.uFeed.value = Math.min(1, this.feed);
  }

  updateFinale(dt) {
    const jetsBase = this.won ? 0.55 : 0;
    if (this.finaleT == null) {
      this.jetU.uAmt.value = jetsBase * this.amount * (1 - this.cover);
      this.jets.visible = this.jetU.uAmt.value > 0.002;
      // feeding: every fall makes the core flare, and it burns hotter the more it has eaten
      this.diskU.uHeat.value = this.feed * 0.05 + this.fed * 0.06;
      this.haloU.uHeat.value = this.feed * 0.3 + this.fed * 0.25;
      this.starU.uBoom.value = 0;
      this.galU.uImplode.value = 0;
      for (const s of this.shocks) s.visible = false;
      this.flashSprite.visible = false;
      return;
    }
    this.finaleT += dt;
    const t = this.finaleT;
    const ERUPT = this.eruptAt || 1.7;
    // the gathering: everything pours in, the core flickers, the galaxy draws in a little
    const gather = Math.max(smooth(clamp01(t / ERUPT)), Math.min(1, this.feed * 0.5));
    // (held back while things pour in, so the threads of light still read)
    this.haloU.uHeat.value = t < ERUPT ? gather * 0.8 : Math.max(0, 1 - (t - ERUPT) * 0.5);
    this.diskU.uHeat.value = t < ERUPT ? 0.04 + gather * gather * 0.16 : Math.max(0.15, 1.6 * Math.exp(-(t - ERUPT) * 0.8));
    this.galU.uImplode.value = t < ERUPT ? gather : Math.max(0, 1 - (t - ERUPT) * 3);
    if (t < ERUPT) return;
    // the eruption: a wave of light sweeps out through the whole galaxy
    const e = t - ERUPT;
    const wave = e * 230;
    this.galU.uWave.value = wave;
    this.galU.uBoom.value = Math.max(0.25, Math.exp(-e * 0.35));
    this.galU.uPush.value = 120 * smooth(clamp01(e / 6));
    this.starU.uBoom.value = Math.exp(-e * 0.7);
    this.jetU.uAmt.value = Math.min(1, e * 3) * (0.45 + 0.55 * Math.exp(-e * 0.6));
    this.jets.visible = true;
    this.jets.scale.set(1, Math.min(1, e * 1.5), 1);
    this.shocks.forEach((s, i) => {
      const r = Math.max(0.01, wave * (i ? 0.7 : 1));
      s.visible = r < 900;
      s.scale.setScalar(r);
      s.material.opacity = Math.max(0, 1 - e / 5) * (i ? 0.6 : 1);
    });
    this.flashSprite.visible = e < 3;
    this.flashSprite.scale.setScalar(20 + e * 260);
    this.flashSprite.material.opacity = Math.max(0, 1 - e / 2.5);
    // distant galaxies light up as the wave reaches them
    for (const g of this.distant) {
      if (!g.userData.lit && wave >= g.userData.dist) {
        g.userData.lit = true;
        g.userData.flash = 2.2;
      }
    }
  }

  // Hyperspeed: streaks and a tunnel that ride along with the camera.
  setWarp(amount, speed) {
    this.warpAmt = amount;
    this.warpSpeed = speed;
  }

  updateWarp(dt, camera) {
    const on = this.warpAmt > 0.002;
    this.warp.visible = on;
    if (!on) return;
    this.warp.position.copy(camera.position);
    this.warp.quaternion.copy(camera.quaternion);
    // the streak offset is integrated (not time * speed), so speeding up never jumps
    this.warpOff = ((this.warpOff || 0) + dt * this.warpSpeed) % 7000;
    this.warpU.uSpeed.value = 1;
    this.warpU.uTime.value = this.warpOff;
    this.warpU.uAmt.value = this.warpAmt;
    this.warpU.uLen.value = 2 + this.warpSpeed * 0.06;
    this.tubeU.uAmt.value = this.warpAmt * 0.8;
  }

  // Everything that might be shown, for shader warm-up.
  forCompile(fn) {
    const objs = [this.group, this.warp, this.jets, this.tiles, this.falls, this.streams, ...this.shocks, this.flashSprite];
    const vis = objs.map((o) => o.visible);
    const count = this.falls.count;
    objs.forEach((o) => (o.visible = true));
    this.falls.count = 1;
    try {
      fn();
    } finally {
      objs.forEach((o, i) => (o.visible = vis[i]));
      this.falls.count = count;
    }
  }
}
