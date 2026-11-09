import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PixelParticles, RAINBOW, GOLD } from './PixelParticles.js';

// The bonus level's set: its own scene, swapped in for the World while the
// bonus level runs (the game's snake, apple, effects and cameras move in).
//
// It opens in total darkness: only the board's glow-in-the-dark rim, a small
// spotlight on the golden apple and the snake's own rim light.
// On the tenth apple the lights come on over a magical lake at night: a
// starry violet sky with the milky way, mountains, a castle on the far shore
// with its windows lit, a little town round the water, and hundreds of
// sky lanterns rising from the lake. The board turns into a softly glowing
// dance floor and floats up off the water, mirrored in it, with fireworks
// over the castle, all in time with the music.

const S = 17;
const H = S / 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const easeInOut = (v) => {
  const t = clamp01(v);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const rand = (() => {
  let s = 1234567;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();
const hash = (a, b, c = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const TILE_H = 0.3;
const SLAB_BOTTOM = -1.1;
const WATER0 = -0.75; // the lake's level while the board rests on it
const LIFT = 7.5; // how high the board floats in the party
const CASTLE_Z = -112;
const PHOS = new THREE.Color('#7dffc4'); // glow-in-the-dark mint
const HOT = new THREE.Color('#ff3d6e');
// the party palette: lantern gold, rose, violet, sky blue, warm white
const MAGIC = ['#ffb347', '#ff6f91', '#b98cff', '#6ad8ff', '#ffd86b'].map((c) => new THREE.Color(c));
const LANTERN = ['#ffad42', '#ff9535', '#ffc65a', '#ff8a4c'];

// ------------------------------------------------------------------ shaders
const NOISE = `
float hash12(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }`;

// The night sky: violet to indigo, a warm glow on the horizon behind the
// castle, the milky way, two layers of twinkling stars and low clouds.
const SKY_FN = `
${NOISE}
vec3 skyColor(vec3 d, float time){
  float y = d.y;
  vec3 hor = vec3(0.4, 0.16, 0.42);
  vec3 mid = vec3(0.12, 0.055, 0.3);
  vec3 zen = vec3(0.012, 0.01, 0.06);
  vec3 col = mix(hor, mid, smoothstep(-0.02, 0.22, y));
  col = mix(col, zen, smoothstep(0.16, 0.8, y));
  // warm glow behind the castle
  vec2 h = normalize(d.xz + 1e-5);
  float toward = max(0.0, -h.y);
  col += vec3(1.0, 0.42, 0.3) * pow(toward, 5.0) * exp(-max(y, 0.0) * 6.0) * 0.55;
  // the milky way
  vec3 axis = normalize(vec3(0.42, 0.3, 0.86));
  float b = dot(d, axis);
  float band = exp(-b * b / 0.035);
  float az = atan(d.z, d.x);
  vec2 q = vec2(az * 3.0, b * 14.0);
  float n = fbm(q * 1.7);
  float dust = smoothstep(0.35, 0.75, fbm(q * 3.1 + 5.0));
  vec3 mw = mix(vec3(0.45, 0.35, 0.9), vec3(0.95, 0.75, 0.9), n);
  col += mw * band * (0.18 + 0.55 * n) * (1.0 - dust * 0.6) * smoothstep(-0.02, 0.25, y);
  // stars
  float above = smoothstep(-0.01, 0.12, y);
  for (int k = 0; k < 2; k++){
    float sc = k == 0 ? 160.0 : 420.0;
    vec2 g = vec2(az * sc / 6.2831, asin(clamp(y, -1.0, 1.0)) * sc / 3.1416 * 2.0);
    vec2 id = floor(g);
    float s = hash12(id + float(k) * 31.0);
    float thr = k == 0 ? 0.975 - band * 0.03 : 0.93 - band * 0.12;
    float tw = 0.55 + 0.45 * sin(time * (1.5 + s * 5.0) + s * 60.0);
    float r = length(fract(g) - 0.5 - (vec2(hash12(id + 3.1), hash12(id + 7.7)) - 0.5) * 0.6);
    float star = step(thr, s) * smoothstep(k == 0 ? 0.22 : 0.16, 0.0, r) * tw;
    col += mix(vec3(0.85, 0.85, 1.0), vec3(1.0, 0.85, 0.7), hash12(id)) * star * (k == 0 ? 2.2 : 0.9) * above;
  }
  // low clouds catching the horizon glow
  float cl = fbm(vec2(az * 4.0 + time * 0.004, y * 9.0));
  float cm = smoothstep(0.5, 0.78, cl) * smoothstep(0.32, 0.04, y) * smoothstep(-0.03, 0.04, y);
  col = mix(col, vec3(0.32, 0.13, 0.36) + hor * 0.25 * (1.0 + toward), cm * 0.7);
  return col;
}`;
const DOME_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const DOME_FS = `uniform float uOn; uniform float uTime; varying vec3 vDir;
${SKY_FN}
void main(){ gl_FragColor = vec4(skyColor(normalize(vDir), uTime) * uOn, 1.0); }`;
const DOME_ENV_VS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Mountain silhouettes: hazier and paler with distance, a lit rim on top.
const MTN_VS = `attribute float aH; varying float vH; varying vec3 vW;
void main(){ vH = aH; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const MTN_FS = `uniform float uOn; uniform vec3 uColor; uniform vec3 uHaze; uniform float uFar;
varying float vH; varying vec3 vW;
${NOISE}
void main(){
  float n = fbm(vW.xz * 0.05 + vW.y * 0.08);
  vec3 c = mix(uColor, uHaze, uFar * 0.75 + (1.0 - vH) * 0.15);
  c *= 0.85 + 0.3 * n;
  c += uHaze * smoothstep(0.92, 1.0, vH) * 0.35;
  gl_FragColor = vec4(c * uOn, 1.0);
}`;

// The lake: a real mirror (Reflector), rippled and tinted deep violet, with
// the sky's colour where the reflection is empty.
const WATER_VS = `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FS = `uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime; uniform float uOn;
varying vec4 vUv; varying vec3 vW;
void main(){
  vec2 p = vW.xz;
  // small, fine ripples: a gentle shimmer rather than big wobbles
  vec2 w = vec2(sin(p.x * 1.7 + uTime * 1.1) * 0.5 + sin(p.y * 2.3 - uTime * 0.9) * 0.3 + sin((p.x + p.y) * 3.1 + uTime * 1.6) * 0.2,
                cos(p.y * 1.5 + uTime * 1.0) * 0.5 + sin(p.x * 2.1 + uTime * 0.8) * 0.3 + cos((p.x - p.y) * 2.9 - uTime * 1.4) * 0.2);
  float dist = length(p - cameraPosition.xz);
  vec4 uv = vUv;
  // calmer further out, and none at the screen's edges, where the mirror has
  // nothing to show past the frame and would smear its last pixels
  vec2 s = uv.xy / uv.w;
  float edge = smoothstep(0.0, 0.12, s.x) * smoothstep(0.0, 0.12, 1.0 - s.x) * smoothstep(0.0, 0.12, s.y) * smoothstep(0.0, 0.12, 1.0 - s.y);
  uv.xy += w * 0.0045 * (1.0 - 0.6 * smoothstep(10.0, 80.0, dist)) * edge * uv.w;
  vec3 refl = texture2DProj(tDiffuse, uv).rgb;
  vec3 deep = vec3(0.012, 0.008, 0.04);
  float fres = 0.55 + 0.4 * smoothstep(5.0, 70.0, dist);
  vec3 col = deep * uOn + refl * fres * 0.8 * color;
  gl_FragColor = vec4(col, 1.0);
}`;
// low quality: no mirror, just the sky's tint
const WATER_CHEAP_FS = `uniform float uOn; uniform float uTime; varying vec3 vW;
void main(){ float d = length(vW.xz); vec3 c = mix(vec3(0.05, 0.02, 0.12), vec3(0.3, 0.1, 0.3), smoothstep(20.0, 160.0, d)); gl_FragColor = vec4(c * uOn, 1.0); }`;

// Sky lanterns, near ones as paper lanterns lit from inside (one draw).
// Each launches from the lake at its own moment after the party starts and
// drifts up for ever, swaying; they fade near the camera so they never
// block the board.
const LANTERN_VS = `
attribute vec4 aSeed; attribute vec4 aSeed2;
uniform float uTime; uniform float uParty; uniform float uWater; uniform vec3 uCam;
varying float vY; varying float vFace; varying float vAlpha; varying float vFlick;
void main(){
  float launch = aSeed.z;
  float age = uParty - launch;
  float on = step(0.0, age) * smoothstep(0.0, 1.2, age);
  float ang = aSeed.x * 6.2831;
  float r = aSeed.y;
  float speed = 0.55 + aSeed.w * 0.6;
  float y = uWater + 0.5 + mod(aSeed2.x * 70.0 + max(age, 0.0) * speed, 70.0);
  vec3 c = vec3(cos(ang) * r + sin(uTime * 0.4 + aSeed2.y * 9.0) * 0.8, y, sin(ang) * r + cos(uTime * 0.33 + aSeed2.z * 9.0) * 0.8);
  float s = 0.75 + aSeed2.w * 0.6;
  float camD = distance(c, uCam);
  on *= smoothstep(6.0, 12.0, camD) * (1.0 - smoothstep(60.0, 72.0, y - uWater));
  float tilt = sin(uTime * 0.9 + aSeed2.y * 20.0) * 0.12;
  vec3 p = position * s * on;
  p.xy = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * p.xy;
  vY = position.y / 0.7 + 0.5;
  vec4 mv = modelViewMatrix * vec4(c + p, 1.0);
  vec3 n = normalize(normalMatrix * normalize(vec3(position.x, 0.0, position.z) + 1e-4));
  vFace = abs(dot(n, normalize(-mv.xyz)));
  vAlpha = on;
  vFlick = 0.85 + 0.15 * sin(uTime * 11.0 + aSeed.x * 40.0) * sin(uTime * 4.7 + aSeed.y);
  gl_Position = projectionMatrix * mv;
}`;
const LANTERN_FS = `
varying float vY; varying float vFace; varying float vAlpha; varying float vFlick;
void main(){
  if (vAlpha < 0.01) discard;
  // glowing paper: hottest low down by the flame and through the middle
  // kept under the bloom threshold: warm gold paper
  vec3 paper = mix(vec3(1.0, 0.34, 0.03), vec3(1.0, 0.58, 0.1), smoothstep(0.0, 0.7, 1.0 - vY));
  // (vFace can interpolate a hair below zero on the silhouette, and pow() of
  // a negative is NaN, which the bloom smeared into big pale blobs)
  float core = 0.36 + 0.24 * pow(max(vFace, 0.0), 1.5);
  float flame = exp(-vY * 3.5) * 0.2;
  vec3 c = paper * (core + flame) * vFlick;
  gl_FragColor = vec4(c * vAlpha, 1.0);
}`;

// Points that glow: far lanterns, town windows, fireflies, falling dust.
const POINTS_VS = `
attribute vec4 aSeed; attribute vec3 aColor;
uniform float uTime; uniform float uParty; uniform float uWater; uniform float uScale; uniform float uMode; uniform float uLift;
varying vec3 vCol; varying float vA;
void main(){
  vec3 p = position;
  float on = 1.0;
  float sz = aSeed.w;
  if (uMode < 0.5) {
    // far lanterns: rise from the water after their launch time
    float age = uParty - aSeed.z;
    on = step(0.0, age) * smoothstep(0.0, 1.5, age);
    p.y = uWater + mod(aSeed.x * 160.0 + max(age, 0.0) * (0.6 + aSeed.y * 0.7), 160.0);
    p.x += sin(uTime * 0.3 + aSeed.x * 30.0) * 1.5;
    on *= 1.0 - smoothstep(130.0, 160.0, p.y - uWater);
    on *= 0.8 + 0.2 * sin(uTime * 7.0 + aSeed.y * 50.0);
  } else if (uMode < 1.5) {
    // town windows and street lights: switch on one by one
    on = step(aSeed.z * 2.5, uParty) * (0.8 + 0.2 * sin(uTime * (1.0 + aSeed.x * 3.0) + aSeed.y * 30.0));
    p.y += uWater;
  } else if (uMode < 2.5) {
    // fireflies drifting round the board
    float t = uTime * (0.25 + aSeed.y * 0.3) + aSeed.x * 40.0;
    p += vec3(sin(t) * 1.6, sin(t * 1.3 + 2.0) * 0.8, cos(t * 0.8) * 1.6);
    on = uParty * (0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * (2.0 + aSeed.z * 3.0) + aSeed.x * 20.0), 3.0));
  } else {
    // sparkling dust falling from under the floating board
    float fall = mod(uTime * (0.6 + aSeed.y * 0.6) + aSeed.x * 9.0, 9.0);
    p.y = -1.2 - fall;
    p.xz += vec2(sin(uTime + aSeed.z * 20.0), cos(uTime * 0.8 + aSeed.x * 20.0)) * 0.3;
    on = uLift * (1.0 - fall / 9.0) * (0.5 + 0.5 * sin(uTime * 9.0 + aSeed.z * 40.0));
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float px = sz * uScale / -mv.z;
  // far lanterns: never a big soft disc, however close one drifts
  if (uMode < 0.5) px = min(px, uScale * 0.022);
  gl_PointSize = max(1.0, px) * step(0.001, on);
  vCol = aColor;
  vA = on;
  gl_Position = projectionMatrix * mv;
}`;
const POINTS_FS = `varying vec3 vCol; varying float vA;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = 0.55 * exp(-r * r * 7.0) + 0.75 * exp(-r * r * 34.0);
  gl_FragColor = vec4(vCol * a * vA, 1.0);
}`;

// Light shaft for the apple's small spotlight: soft, brightest where you look
// through the most of the cone, fading towards the floor.
const BEAM_VS = `varying float vH; varying vec3 vN; varying vec3 vV;
void main(){ vH = -position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`;
const BEAM_FS = `uniform vec3 uColor; uniform float uOpacity;
varying float vH; varying vec3 vN; varying vec3 vV;
void main(){
  float f = abs(dot(normalize(vN), normalize(vV)));
  float a = uOpacity * pow(f, 2.2) * (0.35 + 0.65 * vH) * smoothstep(1.0, 0.8, vH) * smoothstep(0.0, 0.25, vH);
  gl_FragColor = vec4(uColor, a);
}`;
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } },
    vertexShader: BEAM_VS,
    fragmentShader: BEAM_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    forceSinglePass: true,
  });
}
const CONE = new THREE.ConeGeometry(1, 1, 48, 1, true).translate(0, -0.5, 0);

// The rim: a glowing tube round the board. Mint glow-in-the-dark at first,
// then gold with colour chasing round it; hot pink near the head.
const RIM_VS = `varying vec3 vW; varying vec3 vN; varying vec3 vV;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(normalMatrix * normal); vec4 mv = viewMatrix * w; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const RIM_FS = `uniform float uOn; uniform float uWave; uniform float uParty; uniform float uTime; uniform float uPulse;
uniform vec3 uPhos; uniform vec3 uHead; uniform vec3 uHot;
varying vec3 vW; varying vec3 vN; varying vec3 vV;
vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
void main(){
  float u = atan(vW.z, vW.x) / 6.2831 + 0.5; // round the board
  float lit = clamp((uWave - fract(u + 0.25)) * 5.0, 0.0, 1.0) * uOn;
  float f = abs(dot(normalize(vN), normalize(vV)));
  float body = 0.55 + 0.45 * f;
  float breath = 0.8 + 0.2 * sin(uTime * 1.6 - u * 25.0);
  vec3 c = uPhos * 0.9 * breath * (1.0 - uParty);
  vec3 party = mix(vec3(1.0, 0.72, 0.32), hsv(fract(u * 3.0 - uTime * 0.25), 0.55, 1.0), 0.45);
  c += party * uParty * (1.1 + 0.9 * uPulse);
  float hd = length(vW.xz - uHead.xz);
  c = mix(c, uHot * 1.6, smoothstep(2.8, 0.6, hd) * 0.85);
  gl_FragColor = vec4(c * body * lit, 1.0);
}`;

// A standard material with an extra per-instance emissive colour (aGlow),
// so the tiles can glow individually and still be lit and reflective.
function glowMaterial(params, key) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec3 aGlow;\nvarying vec3 vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow;');
    sh.fragmentShader = 'varying vec3 vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vGlow;');
  };
  m.customProgramCacheKey = () => `bonus-glow-${key}`;
  return m;
}

function pointsMaterial(mode) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uParty: { value: 0 }, uWater: { value: WATER0 }, uScale: { value: 400 }, uMode: { value: mode }, uLift: { value: 0 } },
    vertexShader: POINTS_VS,
    fragmentShader: POINTS_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export class BonusStage {
  constructor({ renderer, glowTex, quality = 'high' }) {
    this.renderer = renderer;
    this.glowTex = glowTex;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#000000');
    this.scene.environmentIntensity = 0;
    this.time = 0;
    this.timers = [];
    this.tmpV = new THREE.Vector3();
    this.tmpC = new THREE.Color();
    this.tmpC2 = new THREE.Color();
    this.dummy = new THREE.Object3D();
    this.onEvent = null; // (name, data) for sounds

    // the landscape rides on this, so the lake can sink away from the board
    this.land = new THREE.Group();
    this.scene.add(this.land);
    this.buildSky();
    this.buildLake();
    this.buildMountains();
    this.buildShore();
    this.buildCastle();
    this.buildTown();
    this.buildLanterns();
    this.buildBoard();
    this.buildRim();
    this.buildLights(quality !== 'low');
    this.buildEnv();
    this.pixels = new PixelParticles(this.scene, { half: H });
    this.reset();
  }

  // ---------------------------------------------------------------- build
  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({ uniforms: { uOn: { value: 0 }, uTime: { value: 0 } }, vertexShader: DOME_VS, fragmentShader: DOME_FS, side: THREE.BackSide, depthWrite: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 64, 32), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  buildLake() {
    if (this.quality !== 'low') {
      const shader = {
        name: 'BonusLake',
        uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uTime: { value: 0 }, uOn: { value: 0 } },
        vertexShader: WATER_VS,
        fragmentShader: WATER_FS,
      };
      // the mirror is drawn at a reduced resolution; it's rippled anyway
      this.water = new Reflector(new THREE.CircleGeometry(150, 96), { shader, color: '#d8ccff', textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: 0.002 });
      this.water.rotation.x = -Math.PI / 2;
      // The mirror's camera is flipped left to right, so a sideways view
      // offset (the results card shifts the picture over) would push its
      // picture the wrong way and smear its edge into streaks. Render the
      // reflection with the horizontal offset reversed.
      const reflect = this.water.onBeforeRender;
      this.water.onBeforeRender = (renderer, scene, camera, ...rest) => {
        const e = camera.projectionMatrix.elements;
        const ox = e[8];
        if (ox === 0) return reflect(renderer, scene, camera, ...rest);
        e[8] = -ox;
        try {
          reflect(renderer, scene, camera, ...rest);
        } finally {
          e[8] = ox;
        }
      };
    } else {
      this.water = new THREE.Mesh(
        new THREE.CircleGeometry(150, 96).rotateX(-Math.PI / 2),
        new THREE.ShaderMaterial({ uniforms: { uOn: { value: 0 }, uTime: { value: 0 } }, vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }', fragmentShader: WATER_CHEAP_FS })
      );
    }
    this.land.add(this.water);
  }

  resize(w, h) {
    if (this.water && this.water.getRenderTarget) {
      const k = this.quality === 'high' ? 0.5 : 0.35;
      this.water.getRenderTarget().setSize(Math.max(64, Math.round(w * k)), Math.max(64, Math.round(h * k)));
    }
  }

  buildMountains() {
    this.mtnMats = [];
    const layers = [
      { r: 330, h: 70, color: '#2a1a4e', far: 1 },
      { r: 250, h: 52, color: '#1f1440', far: 0.6 },
      { r: 185, h: 34, color: '#150d2c', far: 0.25 },
    ];
    for (const L of layers) {
      const N = 300;
      const pos = [];
      const hs = [];
      const idx = [];
      const seed = rand() * 100;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        let h = 0;
        for (let k = 1; k <= 6; k++) h += Math.sin(a * k * 2.3 + seed * k) / k + Math.sin(a * k * 5.1 + seed * 1.7 * k) / (k * 2.5);
        h = 0.35 + 0.3 * h;
        // lower behind the castle, so it stands clear against the glow
        const back = Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)); // 0 towards -z
        h *= 1 - 0.55 * Math.exp(-(back * back) / 0.08);
        const top = Math.max(0.08, h) * L.h;
        const x = Math.cos(a) * L.r;
        const z = Math.sin(a) * L.r;
        pos.push(x, -6, z, x, top, z);
        hs.push(0, 1);
        if (i < N) {
          const j = i * 2;
          idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aH', new THREE.Float32BufferAttribute(hs, 1));
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        uniforms: { uOn: { value: 0 }, uColor: { value: new THREE.Color(L.color) }, uHaze: { value: new THREE.Color('#7a3c7c') }, uFar: { value: L.far } },
        vertexShader: MTN_VS,
        fragmentShader: MTN_FS,
        side: THREE.DoubleSide,
      });
      this.mtnMats.push(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      this.land.add(mesh);
    }
  }

  // The lake shore: low dark hills with pines all round.
  buildShore() {
    const g = new THREE.RingGeometry(118, 420, 160, 6).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z);
      p.setY(i, Math.min(1, (r - 118) / 10) * (0.6 + 2.2 * hash(Math.floor(x / 9), Math.floor(z / 9))));
    }
    g.computeVertexNormals();
    this.land.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#1a1230', roughness: 0.95, metalness: 0 })));
    // pines
    const tree = mergeGeometries([new THREE.ConeGeometry(1, 3.2, 7).translate(0, 2.6, 0), new THREE.ConeGeometry(0.75, 2.4, 7).translate(0, 4.1, 0)]);
    const NT = 340;
    const trees = new THREE.InstancedMesh(tree, new THREE.MeshStandardMaterial({ color: '#120d24', roughness: 1 }), NT);
    let n = 0;
    for (let i = 0; i < NT; i++) {
      const a = rand() * Math.PI * 2;
      const back = Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2));
      if (Math.abs(back) < 0.45) continue; // the town and castle are there
      const r = 121 + rand() * 40;
      this.dummy.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
      this.dummy.rotation.set(0, rand() * 6, 0);
      this.dummy.scale.setScalar(1.2 + rand() * 1.6);
      this.dummy.updateMatrix();
      trees.setMatrixAt(n++, this.dummy.matrix);
    }
    trees.count = n;
    this.land.add(trees);
  }

  buildCastle() {
    const stone = [];
    const roofs = [];
    const gold = [];
    const win = [];
    const tower = (x, z, r, h, roofH) => {
      stone.push(new THREE.CylinderGeometry(r, r * 1.05, h, 16).translate(x, h / 2, z));
      // a little battlement ring and a pointed roof
      stone.push(new THREE.CylinderGeometry(r * 1.18, r * 1.18, 0.9, 16).translate(x, h + 0.45, z));
      roofs.push(new THREE.ConeGeometry(r * 1.3, roofH, 16).translate(x, h + 0.9 + roofH / 2, z));
      gold.push(new THREE.SphereGeometry(r * 0.22, 8, 6).translate(x, h + 0.9 + roofH + r * 0.15, z));
      // windows facing the lake
      for (let y = 10; y < h - 2; y += 3.2 + rand() * 1.5) {
        for (const off of [-0.5, 0, 0.5]) {
          if (rand() < 0.35) continue;
          const a = Math.PI / 2 + off;
          win.push([x + Math.cos(a) * (r + 0.05), y, z + Math.sin(a) * (r + 0.05), a]);
        }
      }
    };
    // a rocky hill rising from the water
    const hill = new THREE.LatheGeometry([[0.01, 9], [8, 8.5], [16, 6], [24, 2.5], [30, -1.5]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
    const hp = hill.attributes.position;
    for (let i = 0; i < hp.count; i++) hp.setY(i, hp.getY(i) + (hash(Math.round(hp.getX(i)), Math.round(hp.getZ(i))) - 0.5) * 1.6);
    hill.computeVertexNormals();
    const base = 8.5;
    stone.push(new THREE.BoxGeometry(18, 11, 10).translate(0, base + 5.5, 0)); // the keep
    stone.push(new THREE.BoxGeometry(26, 6, 1.6).translate(0, base + 3, 8)); // front wall
    stone.push(new THREE.BoxGeometry(1.6, 6, 16).translate(-13, base + 3, 1));
    stone.push(new THREE.BoxGeometry(1.6, 6, 16).translate(13, base + 3, 1));
    roofs.push(new THREE.CylinderGeometry(0.01, 7, 6, 4, 1).rotateY(Math.PI / 4).scale(1.4, 1, 0.8).translate(0, base + 14, 0));
    tower(0, -1, 3, base + 30, 13);
    tower(-6.5, 3, 1.6, base + 20, 8);
    tower(6.5, 3, 1.6, base + 20, 8);
    tower(-13, 8, 2.2, base + 12, 7);
    tower(13, 8, 2.2, base + 12, 7);
    tower(-13, -6, 1.9, base + 15, 7);
    tower(13, -6, 1.9, base + 15, 7);
    tower(-3.5, -5, 1.1, base + 25, 7);
    tower(4, -5.5, 1.2, base + 23, 7);
    for (let i = 0; i < 9; i++) win.push([-8 + i * 2, base + 7 + (i % 2) * 2.5, 5.05, Math.PI / 2]);
    const castle = new THREE.Group();
    castle.position.set(0, 0, CASTLE_Z);
    castle.add(new THREE.Mesh(hill, new THREE.MeshStandardMaterial({ color: '#1c1430', roughness: 1 })));
    castle.add(new THREE.Mesh(mergeGeometries(stone), new THREE.MeshStandardMaterial({ color: '#544c80', roughness: 0.85, metalness: 0.05 })));
    castle.add(new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshStandardMaterial({ color: '#2f3fa8', roughness: 0.45, metalness: 0.35 })));
    this.goldMat = new THREE.MeshBasicMaterial({ color: '#000000' });
    castle.add(new THREE.Mesh(mergeGeometries(gold), this.goldMat));
    this.winMat = new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide });
    const wins = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.55, 1.1), this.winMat, win.length);
    win.forEach(([x, y, z, a], i) => {
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(0, Math.PI / 2 - a, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      wins.setMatrixAt(i, this.dummy.matrix);
    });
    castle.add(wins);
    // a warm halo round it, and its reflection does the rest
    this.castleGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ff9a6a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.castleGlow.position.set(0, 26, -4);
    this.castleGlow.scale.setScalar(90);
    castle.add(this.castleGlow);
    castle.scale.setScalar(1.15);
    this.castle = castle;
    this.land.add(castle);
  }

  // A little town round the far shore: houses with lit windows, street lamps
  // along the water.
  buildTown() {
    const NH = 150;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#4a3a5e', roughness: 0.9 }), NH);
    const roof = new THREE.InstancedMesh(new THREE.ConeGeometry(0.78, 0.7, 4).rotateY(Math.PI / 4).translate(0, 1.35, 0), new THREE.MeshStandardMaterial({ color: '#7a2f3e', roughness: 0.7 }), NH);
    const lights = [];
    const cols = [];
    const seeds = [];
    const lamp = new THREE.Color('#ffc46b');
    let n = 0;
    for (let i = 0; i < NH; i++) {
      // round the far half of the lake, thicker near the castle
      const back = (rand() - 0.5) * 2.4 * (0.4 + rand() * 0.6);
      const a = -Math.PI / 2 + back;
      const r = 119 + rand() * 18 + Math.abs(back) * 6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x, z - CASTLE_Z) < 30) continue;
      const w = 2 + rand() * 2.2;
      const h = 2 + rand() * 2.5;
      const y = 0.4 + hash(Math.floor(x / 9), Math.floor(z / 9)) * 1.5;
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(0, -a + Math.PI / 2 + (rand() - 0.5) * 0.4, 0);
      this.dummy.scale.set(w, h, w * 0.8);
      this.dummy.updateMatrix();
      body.setMatrixAt(n, this.dummy.matrix);
      roof.setMatrixAt(n, this.dummy.matrix);
      n++;
      // two or three lit windows on the side facing the lake
      const nw = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < nw; k++) {
        const f = (k - (nw - 1) / 2) * w * 0.3;
        lights.push(x - Math.cos(a) * w * 0.42 + Math.sin(a) * f, y + h * (0.35 + rand() * 0.3), z - Math.sin(a) * w * 0.42 - Math.cos(a) * f);
        const c = lamp.clone().multiplyScalar(1.3 + rand());
        cols.push(c.r, c.g, c.b);
        seeds.push(rand(), rand(), rand(), 0.55 + rand() * 0.35);
      }
    }
    body.count = roof.count = n;
    // street lamps along the shore, all the way round
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      const r = 118.5;
      lights.push(Math.cos(a) * r, 1.4, Math.sin(a) * r);
      const c = lamp.clone().multiplyScalar(2);
      cols.push(c.r, c.g, c.b);
      seeds.push(rand(), rand(), 0.2 + (i / 160) * 0.8, 0.6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 4));
    this.townMat = pointsMaterial(1);
    this.townMat.uniforms.uWater.value = 0; // (these ride on the land group)
    const pts = new THREE.Points(g, this.townMat);
    pts.frustumCulled = false;
    this.land.add(body, roof, pts);
  }

  buildLanterns() {
    // near: real paper lanterns round the board
    const prof = [[0.001, -0.35], [0.2, -0.35], [0.27, -0.1], [0.3, 0.15], [0.27, 0.32], [0.18, 0.36], [0.001, 0.38]].map(([x, y]) => new THREE.Vector2(x, y));
    const base = new THREE.LatheGeometry(prof, 14);
    const N = this.quality === 'low' ? 200 : 420;
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.attributes.position = base.attributes.position;
    g.attributes.normal = base.attributes.normal;
    g.instanceCount = N;
    const s1 = new Float32Array(N * 4);
    const s2 = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const r = 12.5 + Math.pow(rand(), 1.7) * 85;
      // most launch in the first few seconds of the party, some already up
      const launch = rand() < 0.3 ? 0 : rand() * 7;
      s1.set([rand(), r, launch, rand()], i * 4);
      s2.set([rand(), rand(), rand(), rand()], i * 4);
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s1, 4));
    g.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(s2, 4));
    this.lanternMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uParty: { value: -1 }, uWater: { value: WATER0 }, uCam: { value: new THREE.Vector3() } },
      vertexShader: LANTERN_VS,
      fragmentShader: LANTERN_FS,
    });
    this.lanterns = new THREE.Mesh(g, this.lanternMat);
    this.lanterns.frustumCulled = false;
    this.scene.add(this.lanterns);

    const c = new THREE.Color();
    const points = (n, fill, mat) => {
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const seed = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) fill(i, pos, col, seed);
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      pg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
      const pts = new THREE.Points(pg, mat);
      pts.frustumCulled = false;
      this.scene.add(pts);
      return pts;
    };
    // far: thousands of glowing points filling the sky, thickest over the castle
    this.farMat = pointsMaterial(0);
    points(this.quality === 'low' ? 1200 : 3000, (i, pos, col, seed) => {
      const a = rand() < 0.45 ? -Math.PI / 2 + (rand() - 0.5) * 1.6 : rand() * Math.PI * 2;
      const r = 40 + Math.pow(rand(), 0.7) * 260;
      pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
      c.set(LANTERN[i % LANTERN.length]).multiplyScalar(0.8 + rand() * 0.5); // gold, not white where they overlap
      col.set([c.r, c.g, c.b], i * 3);
      seed.set([rand(), rand(), rand() < 0.35 ? 0 : rand() * 9, 1.4 + rand() * 1.4], i * 4);
    }, this.farMat);
    // fireflies round the board
    this.flyMat = pointsMaterial(2);
    points(70, (i, pos, col, seed) => {
      const a = rand() * Math.PI * 2;
      const r = 10.5 + rand() * 9;
      pos.set([Math.cos(a) * r, 0.6 + rand() * 4, Math.sin(a) * r], i * 3);
      c.set(i % 4 ? '#ffd27a' : '#b8ffcf').multiplyScalar(1.6);
      col.set([c.r, c.g, c.b], i * 3);
      seed.set([rand(), rand(), rand(), 0.22 + rand() * 0.18], i * 4);
    }, this.flyMat);
    // glittering dust drifting down from under the floating board
    this.dustMat = pointsMaterial(3);
    points(220, (i, pos, col, seed) => {
      const edge = rand() < 0.6;
      const t = rand() * 2 - 1;
      const side = Math.floor(rand() * 4);
      const e = H + 0.6;
      const x = edge ? (side < 2 ? t * e : (side === 2 ? 1 : -1) * e) : (rand() - 0.5) * S;
      const z = edge ? (side < 2 ? (side === 0 ? 1 : -1) * e : t * e) : (rand() - 0.5) * S;
      pos.set([x, 0, z], i * 3);
      c.set(i % 2 ? '#ffd27a' : '#e8c8ff').multiplyScalar(2);
      col.set([c.r, c.g, c.b], i * 3);
      seed.set([rand(), rand(), rand(), 0.14 + rand() * 0.12], i * 4);
    }, this.dustMat);
  }

  buildBoard() {
    const n = S * S;
    const geo = new THREE.BoxGeometry(0.96, TILE_H, 0.96);
    this.tileGlow = new Float32Array(n * 3);
    geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(this.tileGlow, 3).setUsage(THREE.DynamicDrawUsage));
    // polished stone: dark sapphire and amethyst, mirroring the sky
    this.tileMat = glowMaterial({ roughness: 0.16, metalness: 0.2, envMapIntensity: 1 }, 'tile');
    this.tiles = new THREE.InstancedMesh(geo, this.tileMat, n);
    this.tiles.receiveShadow = true;
    const c = new THREE.Color();
    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        const i = x * S + z;
        this.dummy.position.set(x - (S - 1) / 2, -TILE_H / 2, z - (S - 1) / 2);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.tiles.setMatrixAt(i, this.dummy.matrix);
        this.tiles.setColorAt(i, c.set((x + z) % 2 ? '#3a3274' : '#272152'));
      }
    }
    this.scene.add(this.tiles);
    this.ripples = [];

    // the stone slab, with a gold band round it
    const slab = new THREE.Mesh(new THREE.BoxGeometry(S + 1.6, -SLAB_BOTTOM - 0.28, S + 1.6), new THREE.MeshStandardMaterial({ color: '#1d1838', roughness: 0.5, metalness: 0.3 }));
    slab.position.y = (SLAB_BOTTOM - 0.28) / 2;
    slab.receiveShadow = true;
    slab.castShadow = true;
    this.scene.add(slab);
    this.bandMat = new THREE.MeshStandardMaterial({ color: '#c9973a', roughness: 0.3, metalness: 1, emissive: '#ffb347', emissiveIntensity: 0 });
    const band = new THREE.Mesh(new THREE.BoxGeometry(S + 1.66, 0.14, S + 1.66), this.bandMat);
    band.position.y = -0.62;
    this.scene.add(band);
    // the glow under it once it floats
    this.underGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.glowTex, color: '#ffb36b', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.underGlow.position.y = SLAB_BOTTOM - 0.05;
    this.underGlow.scale.setScalar(30);
    this.scene.add(this.underGlow);
  }

  // The rim: a stone curb with a glowing tube on top, all the way round.
  buildRim() {
    const R = H + 0.55;
    const len = S + 1.1;
    const tubes = [];
    const curbs = [];
    for (const [x, z, rot] of [[0, -R, 0], [0, R, 0], [-R, 0, Math.PI / 2], [R, 0, Math.PI / 2]]) {
      tubes.push(new THREE.CapsuleGeometry(0.13, len, 6, 14).rotateZ(Math.PI / 2).rotateY(rot).translate(x, 0.2, z));
      curbs.push(new THREE.BoxGeometry(len + 0.5, 0.36, 0.5).rotateY(rot).translate(x, -0.06, z));
    }
    this.rimMat = new THREE.ShaderMaterial({
      uniforms: { uOn: { value: 0 }, uWave: { value: 0 }, uParty: { value: 0 }, uTime: { value: 0 }, uPulse: { value: 0 }, uPhos: { value: PHOS.clone() }, uHead: { value: new THREE.Vector3(99, 0, 99) }, uHot: { value: HOT.clone() } },
      vertexShader: RIM_VS,
      fragmentShader: RIM_FS,
    });
    this.rim = new THREE.Mesh(mergeGeometries(tubes), this.rimMat);
    this.scene.add(this.rim);
    const curb = new THREE.Mesh(mergeGeometries(curbs), new THREE.MeshStandardMaterial({ color: '#241e44', roughness: 0.35, metalness: 0.4 }));
    curb.receiveShadow = true;
    this.scene.add(curb);
  }

  buildLights(shadows) {
    // party light: cool moonlight, a violet sky above and warm lanterns below
    this.hemi = new THREE.HemisphereLight('#8a6cff', '#ff9a52', 0);
    this.moon = new THREE.DirectionalLight('#c9b8ff', 0);
    this.moon.position.set(-14, 30, 18);
    this.moon.castShadow = shadows;
    const sc = this.moon.shadow.camera;
    sc.left = sc.bottom = -12;
    sc.right = sc.top = 12;
    sc.near = 5;
    sc.far = 70;
    this.moon.shadow.mapSize.set(2048, 2048);
    this.moon.shadow.bias = -0.0005;
    this.moon.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.moon);
    // three warm lantern lights drifting round the board
    this.warm = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight('#ffae5c', 0, 26, 2);
      this.scene.add(l);
      this.warm.push(l);
    }

    // the apple's small spotlight (and its glow, which lights its neighbours)
    this.aSpot = new THREE.SpotLight('#ffd27a', 0, 20, 0.1, 0.6, 2);
    this.scene.add(this.aSpot, this.aSpot.target);
    this.aBeam = new THREE.Mesh(CONE, beamMaterial('#ffcf70'));
    this.aBeam.frustumCulled = false;
    this.scene.add(this.aBeam);
    this.aSpotPos = new THREE.Vector3(0, 8, -2);
    this.applePoint = new THREE.PointLight('#ffb93a', 0, 4.5, 2);
    this.scene.add(this.applePoint);

  }

  // Reflections for the party: the night sky with lantern glows, prefiltered.
  buildEnv() {
    const env = new THREE.Scene();
    const skyMat = new THREE.ShaderMaterial({ uniforms: { uOn: { value: 1 }, uTime: { value: 0 } }, vertexShader: DOME_ENV_VS, fragmentShader: DOME_FS, side: THREE.BackSide });
    env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), skyMat));
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffa34a').multiplyScalar(6) });
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.6 + rand() * 1.4, 8, 6), glow);
      m.position.set(Math.cos(a) * 70, 2 + rand() * 40, Math.sin(a) * 70);
      env.add(m);
    }
    // the lake's dark mirror below
    env.add(new THREE.Mesh(new THREE.CircleGeometry(95, 32).rotateX(-Math.PI / 2).translate(0, -6, 0), new THREE.MeshBasicMaterial({ color: '#0d0820' })));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(env, 0.02, 0.1, 400).texture;
    pmrem.dispose();
  }

  // ---------------------------------------------------------------- flow
  // Back to the start: pitch black.
  reset() {
    this.time = 0;
    this.timers = [];
    this.apples = 0;
    this.partyT = -1;
    this.partyAmt = 0;
    this.lift = 0;
    this.aSpotOn = 0;
    this.rimOn = 0;
    this.rimWave = 0;
    this.dead = false;
    this.deadT = 0;
    this.won = false;
    this.flicker = 0;
    this.ripples.length = 0;
    this.pixels.clear();
    this.apple = null;
    this.nextFirework = 0;
  }

  // The lights come on one by one while READY/GO shows.
  intro() {
    this.later(0.2, () => {
      this.rimOn = 1;
      this.rimWave = 0;
      this.emit('rimOn');
    });
    this.later(0.75, () => {
      this.aSpotOn = 1;
      this.flicker = 0.25;
      this.emit('lightOn', { big: false });
    });
  }

  emit(name, data) {
    if (this.onEvent) this.onEvent(name, data);
  }

  later(s, fn) {
    this.timers.push({ at: this.time + s, fn });
  }

  // Where the apple is (world position), or null.
  setApple(pos) {
    this.apple = pos ? { x: pos.x, z: pos.z } : null;
  }

  ripple(x, z, color, { speed = 9, width = 0.9, life = 1.5, strength = 1 } = {}) {
    this.ripples.push({ x, z, t: 0, color: new THREE.Color(color), speed, width, life, strength });
  }

  // A golden apple eaten (count: apples so far).
  onEat(pos, count) {
    this.apples = count;
    const p = new THREE.Vector3(pos.x, 0.45, pos.z);
    this.pixels.burst(p, { count: 56, colors: RAINBOW, speed: 1 });
    this.pixels.burst(p, { count: 20, colors: GOLD, speed: 0.7, size: 0.8 });
    const party = this.partyT >= 0;
    this.ripple(pos.x, pos.z, party ? MAGIC[count % MAGIC.length] : '#ffc860', { strength: party ? 0.9 : 0.55 });
    if (party && count % 10 === 0) this.fireworks(5, 0.15, 70, 1.1, 0.25, 1.3);
  }

  // Firework rings over the board (n of them, gap seconds apart).
  fireworks(n, gap, count, speed, gravity, life) {
    for (let i = 0; i < n; i++) {
      this.later(i * gap, () => {
        const hue = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
        const fp = new THREE.Vector3((Math.random() - 0.5) * 14, 5 + Math.random() * 4, (Math.random() - 0.5) * 12);
        this.pixels.burst(fp, { count, colors: [hue, '#ffffff', i % 2 ? '#ffd23f' : hue], speed, gravity, ring: true, life });
        this.emit('firework', { x: fp.x });
      });
    }
  }

  // Big fireworks far off over the castle.
  castleFirework() {
    const fp = new THREE.Vector3((Math.random() - 0.5) * 80, this.land.position.y + 45 + Math.random() * 30, CASTLE_Z * 1.1 + (Math.random() - 0.5) * 30);
    const c = '#' + MAGIC[Math.floor(Math.random() * MAGIC.length)].getHexString();
    this.pixels.burst(fp, { count: 90, colors: [c, '#ffffff', c, '#ffe9b0'], speed: 4.5, size: 9, gravity: 0.35, ring: Math.random() < 0.5, life: 1.8, glow: 2 });
    this.emit('firework', { x: fp.x / 60, far: true });
  }

  // Apple ten: the lights come on.
  startParty(pos) {
    if (this.partyT >= 0) return;
    this.partyT = 0;
    const p = new THREE.Vector3(pos.x, 0.6, pos.z);
    this.pixels.sphere(p, { count: 480, colors: RAINBOW, speed: 1.1, size: 1.25 });
    this.pixels.burst(p, { count: 80, colors: GOLD, speed: 1.4, size: 1.1 });
    for (let i = 0; i < 4; i++) this.pixels.burst(p, { count: 60, colors: [RAINBOW[i * 2], '#ffffff'], speed: 1.6 + i * 0.25, ring: true, gravity: 0.2, life: 1.4 });
    this.ripple(pos.x, pos.z, '#fff2d0', { speed: 14, width: 1.4, life: 1.4, strength: 1.1 });
    this.later(0.15, () => this.ripple(pos.x, pos.z, '#ff8fb8', { speed: 11, width: 1.2, life: 1.8, strength: 0.9 }));
    this.later(0.3, () => this.ripple(pos.x, pos.z, '#9fd8ff', { speed: 9, width: 1.2, life: 2, strength: 0.9 }));
    for (let k = 0; k < 3; k++) {
      this.later(0.15 + k * 0.22, () => {
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          this.pixels.burst(new THREE.Vector3(sx * (H + 0.5), 0.5, sz * (H + 0.5)), { count: 36, colors: RAINBOW, speed: 1.5, up: 2.2, gravity: 0.6, life: 1.8 });
        }
      });
    }
    for (let i = 0; i < 5; i++) this.later(1.2 + i * 0.45, () => this.castleFirework());
    this.nextFirework = 4;
  }

  // The crash: the head bursts, then each segment in turn.
  onDeath(points, colors) {
    this.dead = true;
    this.deadT = 0;
    points.forEach((pt, i) => {
      this.later(Math.min(i * 0.035, 1.6), () => {
        this.pixels.burst(new THREE.Vector3(pt.x, 0.35, pt.z), { count: i === 0 ? 50 : 9, colors: i === 0 ? ['#ff3b5c', '#ffffff', '#ff8a2a'] : colors, speed: i === 0 ? 1.3 : 0.6 });
      });
    });
  }

  onWin() {
    this.won = true;
    this.fireworks(16, 0.17, 80, 1.2, 0.3, 1.5);
  }

  // ---------------------------------------------------------------- frame
  // head: the drawn head's world position; cells: the snake's cells (to keep
  // the dance floor calm under it); beat: the music's beat (null: none);
  // camera: for the lanterns to keep clear of; pxScale: pixels per unit at
  // distance 1 (for point sizes).
  update(dt, { head, cells, beat = null, camera = null, pxScale = 400, reduceMotion = false }) {
    this.time += dt;
    const t = this.time;
    for (let i = 0; i < this.timers.length; ) {
      if (this.timers[i].at <= t) this.timers.splice(i, 1)[0].fn();
      else i++;
    }
    this.beatClock = beat ?? (this.beatClock || 0) + dt * (158 / 60);
    const b = this.beatClock;
    const pulse = Math.exp(-(b - Math.floor(b)) * 4);
    this.pulse = pulse;

    if (this.partyT >= 0) {
      this.partyT += dt;
      this.partyAmt = smooth(this.partyT / 2.2);
      this.lift = easeInOut((this.partyT - 0.5) / 4.5);
    }
    if (this.dead) this.deadT += dt;
    const P = this.partyAmt * (this.dead ? Math.max(0.45, 1 - this.deadT * 0.4) : 1);
    this.flicker = Math.max(0, this.flicker - dt);
    const flick = this.flicker > 0 && !reduceMotion ? (Math.sin(t * 80) > 0 ? 1 : 0.25) : 1;
    const dim = this.dead ? Math.max(0.3, 1 - this.deadT * 0.8) : 1;

    // the world: revealed as the lights come on; the lake sinks away
    const bob = Math.sin(t * 0.8) * 0.3 * this.lift;
    const wy = WATER0 - this.lift * LIFT + bob;
    this.land.position.y = wy;
    const reveal = smooth((this.partyT - 0.2) / 2.5);
    this.skyMat.uniforms.uOn.value = reveal * (this.dead ? 0.7 : 1);
    this.skyMat.uniforms.uTime.value = t;
    for (const m of this.mtnMats) m.uniforms.uOn.value = reveal;
    const wu = this.water.material.uniforms;
    wu.uTime.value = t;
    wu.uOn.value = reveal;
    if (wu.color && wu.color.value) wu.color.value.setRGB(0.5 + 0.35 * reveal, 0.5 + 0.35 * reveal, 0.65 + 0.35 * reveal);
    const party = this.partyT >= 0 ? this.partyT : -1;
    this.townMat.uniforms.uParty.value = party - 1;
    this.townMat.uniforms.uTime.value = t;
    this.townMat.uniforms.uScale.value = pxScale;
    this.winMat.color.set('#ffbf66').multiplyScalar(2.6 * smooth((this.partyT - 1) / 1.5));
    this.goldMat.color.set('#ffd27a').multiplyScalar(1.6 * reveal);
    this.castleGlow.material.opacity = 0.14 * reveal;
    for (const m of [this.farMat, this.flyMat, this.dustMat]) {
      m.uniforms.uTime.value = t;
      m.uniforms.uScale.value = pxScale;
      m.uniforms.uWater.value = wy;
    }
    this.farMat.uniforms.uParty.value = party - 0.8;
    this.flyMat.uniforms.uParty.value = reveal;
    this.dustMat.uniforms.uLift.value = this.lift * P;
    const lu = this.lanternMat.uniforms;
    lu.uTime.value = t;
    lu.uParty.value = party - 0.6;
    lu.uWater.value = wy;
    if (camera) lu.uCam.value.copy(camera.position);
    this.underGlow.material.opacity = 0.5 * this.lift * P;
    this.bandMat.emissiveIntensity = 0.9 * P * (0.7 + 0.3 * pulse);

    // party light
    this.hemi.intensity = P * 0.7;
    this.moon.intensity = P * 1.5;
    this.scene.environmentIntensity = P * 0.85;
    this.warm.forEach((l, i) => {
      const a = t * 0.2 + (i / 3) * Math.PI * 2;
      l.position.set(Math.cos(a) * 11, 4 + Math.sin(t * 0.7 + i) * 1.2, Math.sin(a) * 11);
      l.intensity = P * 55 * (0.9 + 0.1 * Math.sin(t * 9 + i * 3));
    });

    // the apple's spotlight
    const sh = 8;
    const ap = this.apple;
    if (ap) {
      this.aSpotPos.x += (ap.x - this.aSpotPos.x) * Math.min(1, dt * 10);
      this.aSpotPos.z += (ap.z - this.aSpotPos.z) * Math.min(1, dt * 10);
    }
    const aOn = (ap ? 1 : 0) * this.aSpotOn * flick * dim;
    this.placeSpot(this.aSpot, this.aBeam, this.aSpotPos, 0.85, sh, 110 * aOn * (1 - P * 0.5), 0.2 * aOn * (1 - P * 0.6));
    this.applePoint.intensity = ap ? (2.4 + Math.sin(t * 5) * 0.4) * this.aSpotOn * (1 - P * 0.3) : 0;
    if (ap) this.applePoint.position.set(ap.x, 0.9, ap.z);


    // the rim
    this.rimWave += dt * 1.6;
    const ru = this.rimMat.uniforms;
    ru.uOn.value = this.rimOn;
    ru.uWave.value = this.rimWave;
    ru.uParty.value = P;
    ru.uTime.value = t;
    ru.uPulse.value = this.dead ? 0 : pulse;
    if (head) ru.uHead.value.copy(head);

    this.updateTiles(dt, t, P, pulse, b, head, cells);

    // fireworks keep going off over the castle
    if (this.partyT >= 0 && !this.dead) {
      this.nextFirework -= dt;
      if (this.nextFirework <= 0) {
        this.nextFirework = 1.1 + Math.random() * 1.8;
        this.castleFirework();
      }
    }
    this.pixels.update(dt);
  }

  placeSpot(spot, beam, at, radius, height, intensity, opacity) {
    spot.position.set(at.x, height, at.z);
    spot.target.position.set(at.x, 0, at.z);
    spot.angle = Math.atan(radius / height);
    spot.intensity = intensity;
    beam.position.copy(spot.position);
    beam.scale.set(radius, height, radius);
    beam.material.uniforms.uOpacity.value = opacity;
  }

  updateTiles(dt, t, P, pulse, b, head, cells) {
    const G = this.tileGlow;
    const col = this.tmpC2;
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < r.life);
    const under = this.underSnake || (this.underSnake = new Uint8Array(S * S));
    under.fill(0);
    if (cells) for (const cl of cells) if (cl.x >= 0 && cl.z >= 0 && cl.x < S && cl.z < S) under[cl.x * S + cl.z] = 1;
    const mode = Math.floor(b / 8) % 4;
    const headX = head ? head.x : 0;
    const headZ = head ? head.z : 0;
    const fb = Math.floor(b);
    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        const i = x * S + z;
        const wx = x - (S - 1) / 2;
        const wz = z - (S - 1) / 2;
        let r = 0;
        let g = 0;
        let bl = 0;
        for (const rp of this.ripples) {
          const d = Math.hypot(wx - rp.x, wz - rp.z);
          const k = Math.exp(-Math.pow(d - rp.t * rp.speed, 2) / rp.width) * (1 - rp.t / rp.life) * rp.strength;
          if (k > 0.01) {
            r += rp.color.r * k;
            g += rp.color.g * k;
            bl += rp.color.b * k;
          }
        }
        // the dance floor: soft waves of lantern colours, pulsing on the beat
        if (P > 0.001) {
          let v;
          let lvl;
          if (mode === 0) {
            const d = Math.hypot(wx - headX, wz - headZ);
            v = d * 0.18 - b * 0.5;
            lvl = 0.5 + 0.5 * Math.cos(d * 0.8 - b * Math.PI);
          } else if (mode === 1) {
            v = (x + z) * 0.12 + b * 0.25;
            lvl = 0.5 + 0.5 * Math.sin((x - z) * 0.6 + b * Math.PI * 0.5);
          } else if (mode === 2) {
            const d = Math.max(Math.abs(x - 8), Math.abs(z - 8));
            v = d * 0.2 + b * 0.25;
            lvl = (((d - fb) % 3) + 3) % 3 === 0 ? 1 : 0.25;
          } else {
            const h = hash(x, z, Math.floor(b * 2));
            v = h * 5;
            lvl = h < 0.22 ? 1 : 0.12;
          }
          const f = (((v % 1) + 1) % 1) * MAGIC.length;
          const k0 = Math.floor(f) % MAGIC.length;
          col.copy(MAGIC[k0]).lerp(MAGIC[(k0 + 1) % MAGIC.length], f - Math.floor(f));
          const k = lvl * (0.3 + 0.7 * pulse) * P * 0.3 * (under[i] ? 0.2 : 1);
          r += col.r * k;
          g += col.g * k;
          bl += col.b * k;
        }
        G[i * 3] = r;
        G[i * 3 + 1] = g;
        G[i * 3 + 2] = bl;
      }
    }
    this.tiles.geometry.attributes.aGlow.needsUpdate = true;
  }

  // Post-processing: inky in the dark, dreamy and glowing in the party.
  postParams() {
    const P = this.partyAmt;
    const pp = this.pp || (this.pp = { tint: new THREE.Color(), lift: new THREE.Color() });
    pp.bloom = 0.85 - P * 0.12;
    pp.threshold = 0.9 + P * 0.1;
    pp.sat = 1.08 + P * 0.1;
    pp.contrast = 1.1 + P * 0.06;
    pp.tint.set('#ffffff').lerp(this.tmpC.set('#fff2fb'), P);
    pp.lift.set('#000000').lerp(this.tmpC.set('#0d0526'), P);
    pp.exposure = 1.0 - P * 0.08;
    pp.vignette = 0.45 - P * 0.05;
    return pp;
  }

  // Snake rim light colour for the current moment.
  rimColor(out) {
    if (this.partyAmt > 0.01) return out.set('#ffc98a').lerp(this.tmpC.set('#b98cff'), 0.5 + 0.5 * Math.sin(this.time * 0.8));
    return out.set('#bfe8ff');
  }
}
