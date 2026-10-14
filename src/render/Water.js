import * as THREE from 'three';

export const WATER_Y = -32;

const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

const OCEAN_VS = `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const OCEAN_FS = `
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFog; uniform vec3 uSky;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uGlow; uniform float uGrid; uniform vec3 uGridColor;
uniform float uFogNear; uniform float uFogFar;
varying vec3 vWorld;
${NOISE}
void main(){
  vec2 p = vWorld.xz;
  float t = uTime;
  // analytic normal from a few travelling waves
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.18 + t * 0.9) * 0.18;
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 0.31 + t * 1.3) * 0.12;
  g += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 0.7 + t * 1.9) * 0.06;
  g += (vec2(vn(p * 0.35 + t * 0.3), vn(p * 0.35 - t * 0.27)) - 0.5) * 0.25;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 col = mix(uDeep, uShallow, 0.35 + 0.3 * vn(p * 0.05 + t * 0.02));
  vec3 r = reflect(-v, n);
  vec3 refl = mix(uFog, uSky, clamp(r.y * 1.6, 0.0, 1.0));
  col = mix(col, refl, 0.15 + fres * 0.75);
  vec3 hv = normalize(uSunDir + v);
  float spec = pow(max(dot(n, hv), 0.0), 380.0);
  float camD = length(vWorld - cameraPosition);
  float sparkle = step(0.72, vn(p * 2.2 + t * 1.5)) * smoothstep(160.0, 40.0, camD);
  col += uSunColor * (spec * 3.0 + spec * sparkle * 8.0);
  // neon city reflections: streaks radiating from the skyline
  if (uGlow > 0.001) {
    float ang = atan(p.y, p.x);
    float dist = length(p);
    float st = pow(vn(vec2(ang * 60.0, 0.0)), 5.0) * smoothstep(40.0, 150.0, dist) * (0.6 + 0.4 * vn(p * 0.4 + t));
    vec3 neon = mix(vec3(1.0, 0.24, 0.95), vec3(0.2, 0.9, 1.0), step(0.5, vn(vec2(ang * 13.0, 3.0))));
    col += neon * st * uGlow * 2.2;
  }
  if (uGrid > 0.001) {
    vec2 gp = p * 0.1 + vec2(0.0, t * 0.4);
    vec2 gg = abs(fract(gp) - 0.5);
    float line = smoothstep(0.46, 0.5, max(gg.x, gg.y));
    float d = length(p);
    col = mix(col, col * 0.4, uGrid);
    col += uGridColor * line * uGrid * 2.2 * smoothstep(420.0, 60.0, d);
  }
  float fd = length(vWorld - cameraPosition);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, fd));
  gl_FragColor = vec4(col, 1.0);
}`;

const FALL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FALL_FS = `
uniform float uTime; uniform vec3 uColor; uniform float uGlow;
varying vec2 vUv;
${NOISE}
void main(){
  float flow = vUv.y * 9.0 - uTime * 2.4;
  float s = vn(vec2(vUv.x * 14.0, flow)) * 0.6 + vn(vec2(vUv.x * 31.0, flow * 2.0)) * 0.4;
  float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float top = smoothstep(0.0, 0.04, vUv.y);
  float foam = smoothstep(0.88, 1.0, vUv.y);
  vec3 c = uColor * (0.55 + 0.75 * s) * (1.0 + uGlow * 1.6);
  float a = (0.55 + 0.4 * s) * edge * top * (1.0 - foam * 0.7);
  gl_FragColor = vec4(c, a);
}`;

export class Ocean {
  constructor() {
    this.uniforms = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color() },
      uShallow: { value: new THREE.Color() },
      uFog: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uGlow: { value: 0 },
      uGrid: { value: 0 },
      uGridColor: { value: new THREE.Color('#38f6ff') },
      uFogNear: { value: 120 },
      uFogFar: { value: 600 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: OCEAN_VS, fragmentShader: OCEAN_FS });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600, 1, 1), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = WATER_Y;
    this.mesh.frustumCulled = false;
  }

  apply(p, sunDir) {
    const u = this.uniforms;
    u.uDeep.value.copy(p.waterDeep);
    u.uShallow.value.copy(p.waterShallow);
    u.uFog.value.copy(p.fogColor);
    u.uSky.value.copy(p.skyTop);
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(p.sunColor);
    u.uGlow.value = p.waterGlow;
    u.uGrid.value = p.waterGrid;
    u.uGridColor.value.copy(p.strip);
  }
}

// Ribbon of falling water from (x, y, z) heading outward along `out`.
export function makeWaterfall(start, out, width, uniforms) {
  const segs = 28;
  const pos = [];
  const uv = [];
  const idx = [];
  const side = new THREE.Vector3(-out.z, 0, out.x).normalize();
  const drop = start.y - WATER_Y;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    // arcs over the lip, then falls almost straight down
    const fwd = Math.min(1, t * 6) * 1.2 + Math.sqrt(t) * 2.2;
    const y = start.y - (t < 0.08 ? t * 2 : 0.16 + (t - 0.08) / 0.92 * (drop - 0.16));
    const w = width * (1 + t * 0.6);
    for (const s of [-1, 1]) {
      pos.push(start.x + out.x * fwd + side.x * s * w * 0.5, y, start.z + out.z * fwd + side.z * s * w * 0.5);
      uv.push(s < 0 ? 0 : 1, t);
    }
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Waterfalls {
  constructor() {
    this.uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color('#d8f6ff') }, uGlow: { value: 0 } };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: FALL_VS,
      fragmentShader: FALL_FS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.group = new THREE.Group();
  }

  add(start, out, width) {
    const m = new THREE.Mesh(makeWaterfall(start, out, width, this.uniforms), this.material);
    m.frustumCulled = false;
    this.group.add(m);
    return m;
  }

  apply(p) {
    this.uniforms.uColor.value.copy(p.waterfall);
    this.uniforms.uGlow.value = p.waterfallGlow;
  }
}
