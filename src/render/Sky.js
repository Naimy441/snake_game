import * as THREE from 'three';
import { mulberry32 } from './geo.js';

const SKY_VS = `varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;

const SKY_FS = `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunColor; uniform vec3 uSunDir;
uniform float uSunSize; uniform float uStars; uniform float uCyber; uniform float uTime;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.85, h), 0.65));
  col = mix(col, uGround, smoothstep(0.0, -0.3, h));
  col += uHorizon * exp(-abs(h) * 14.0) * 0.22;
  float sd = max(dot(d, uSunDir), 0.0);
  float disk = smoothstep(0.99965 - 0.0006 * uSunSize, 0.99985 - 0.0003 * uSunSize, sd);
  col += uSunColor * (disk * 8.0 + pow(sd, 28.0 / uSunSize) * 0.5 + pow(sd, 5.0) * 0.14);
  if (uStars > 0.001) {
    vec3 p = d * 260.0;
    vec3 cell = floor(p);
    float s = hash(cell);
    float st = step(0.982, s) * smoothstep(0.32, 0.0, length(fract(p) - 0.5));
    st *= 0.55 + 0.45 * sin(uTime * (1.5 + s * 3.0) + s * 80.0);
    col += vec3(0.85, 0.9, 1.0) * st * uStars * smoothstep(0.02, 0.3, h) * 2.5;
  }
  if (uCyber > 0.001) {
    vec2 sp = vec2(atan(d.z, d.x) * 9.549, h * 24.0 - uTime * 0.6);
    vec2 g = abs(fract(sp) - 0.5);
    float line = smoothstep(0.46, 0.5, max(g.x, g.y));
    float fade = smoothstep(0.75, 0.02, h) * smoothstep(-0.05, 0.05, h);
    col += vec3(0.2, 0.95, 1.0) * line * uCyber * fade * 0.9;
    float band = exp(-abs(h - 0.03) * 22.0);
    col += uHorizon * uCyber * band * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const CLOUD_VS = `
attribute vec3 iPos; attribute vec2 iScale; attribute float iSeed;
uniform float uTime;
varying vec2 vUv; varying float vFog; varying float vSeed;
void main(){
  vUv = uv; vSeed = iSeed;
  vec3 p = iPos;
  p.x += sin(uTime * 0.02 + iSeed * 10.0) * 4.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * iScale;
  vFog = smoothstep(120.0, 420.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const CLOUD_FS = `
uniform sampler2D uTex; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uFog; uniform float uOpacity;
varying vec2 vUv; varying float vFog; varying float vSeed;
void main(){
  vec2 uv = vUv;
  if (vSeed > 0.5) uv.x = 1.0 - uv.x;
  vec4 t = texture2D(uTex, uv);
  float a = t.a * uOpacity;
  if (a < 0.01) discard;
  vec3 c = mix(uShade, uLit, t.r);
  c = mix(c, uFog, vFog * 0.75);
  gl_FragColor = vec4(c, a * (1.0 - vFog * 0.4));
}`;

export class Sky {
  constructor(cloudTex) {
    this.group = new THREE.Group();
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunSize: { value: 1 },
      uStars: { value: 0 },
      uCyber: { value: 0 },
      uTime: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), this.material);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
    this.buildClouds(cloudTex);
  }

  buildClouds(cloudTex) {
    const rng = mulberry32(5);
    const n = 44;
    const base = new THREE.PlaneGeometry(2, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    const pos = new Float32Array(n * 3);
    const scale = new Float32Array(n * 2);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const low = i < 14;
      const a = rng() * Math.PI * 2;
      const r = low ? 70 + rng() * 120 : 110 + rng() * 210;
      // keep the sky behind the overhead view (south) uncluttered
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = low ? -34 + rng() * 10 : 26 + rng() * 60;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const s = low ? 26 + rng() * 26 : 22 + rng() * 34;
      scale[i * 2] = s;
      scale[i * 2 + 1] = s * (0.45 + rng() * 0.2);
      seed[i] = rng();
    }
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(scale, 2));
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geo.instanceCount = n;
    this.cloudUniforms = {
      uTex: { value: cloudTex },
      uLit: { value: new THREE.Color('#ffffff') },
      uShade: { value: new THREE.Color('#b9cde6') },
      uFog: { value: new THREE.Color('#a9dcff') },
      uOpacity: { value: 1 },
      uTime: this.uniforms.uTime,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.cloudUniforms,
      vertexShader: CLOUD_VS,
      fragmentShader: CLOUD_FS,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.clouds = new THREE.Mesh(geo, mat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -5;
    this.group.add(this.clouds);
  }

  apply(p, sunDir) {
    const u = this.uniforms;
    u.uTop.value.copy(p.skyTop);
    u.uHorizon.value.copy(p.skyHorizon);
    u.uGround.value.copy(p.skyGround);
    u.uSunColor.value.copy(p.sunColor);
    u.uSunDir.value.copy(sunDir);
    u.uSunSize.value = p.sunSize;
    u.uStars.value = p.stars;
    u.uCyber.value = p.cyber;
    const c = this.cloudUniforms;
    c.uLit.value.copy(p.cloudLit);
    c.uShade.value.copy(p.cloudShade);
    c.uFog.value.copy(p.fogColor);
    c.uOpacity.value = p.cloudOpacity;
    this.clouds.visible = p.cloudOpacity > 0.02;
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
    this.clouds.rotation.y += dt * 0.004;
  }
}
