import * as THREE from 'three';

// Sunset Heavens backdrop: a sea of clouds far below the flight box and a
// huge striped sunset sun sinking into it. Both fade in with the zone's
// `heaven` amount, so they arrive with the lift-off wave.

const SEA_Y = -30;

const SEA_VS = `varying vec3 vWorld;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const SEA_FS = `uniform sampler2D uNoise; uniform float uTime; uniform float uAmt; uniform float uFogFar;
uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uFog; uniform vec3 uSunCol; uniform vec3 uSunDir;
varying vec3 vWorld;
void main(){
  vec2 p = vWorld.xz * 0.0055;
  float n = texture2D(uNoise, p + vec2(uTime * 0.0035, 0.0)).r * 0.6
          + texture2D(uNoise, p * 2.7 - vec2(0.0, uTime * 0.005)).r * 0.3
          + texture2D(uNoise, p * 7.3 + uTime * 0.008).r * 0.1;
  float d = smoothstep(0.3, 0.78, n);
  vec2 off = vWorld.xz - cameraPosition.xz;
  float dist = length(off);
  // brighter towards the sun: billows catch the low light on their tops
  float sunSide = max(dot(off / max(dist, 1.0), normalize(uSunDir.xz)), 0.0);
  vec3 col = mix(uShade, uLit, d * d);
  col += uSunCol * pow(sunSide, 5.0) * (0.35 + 0.65 * d) * 0.75;
  col += uSunCol * pow(sunSide, 40.0) * 0.6;
  col = mix(col, uFog, smoothstep(120.0, uFogFar * 1.3, dist) * 0.7);
  float a = uAmt * (0.82 + 0.18 * d) * (1.0 - smoothstep(700.0, 950.0, dist));
  gl_FragColor = vec4(col, a);
}`;

const SUN_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SUN_FS = `uniform float uTime; uniform float uAmt; varying vec2 vUv;
void main(){
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float y = vUv.y;
  vec3 top = vec3(1.0, 0.78, 0.22);
  vec3 bot = vec3(1.0, 0.16, 0.48);
  vec3 col = mix(bot, top, smoothstep(0.1, 0.85, y));
  // synthwave slats: gaps grow towards the bottom and drift downwards
  float band = fract(y * 11.0 + uTime * 0.12);
  float gap = mix(0.42, 0.0, smoothstep(0.05, 0.55, y));
  float cut = step(band, gap);
  float edge = smoothstep(1.0, 0.96, r);
  float a = edge * (1.0 - cut) * uAmt;
  gl_FragColor = vec4(col * 1.05 * a, a);
}`;

export class Heavens {
  constructor(noiseTex) {
    this.group = new THREE.Group();
    this.seaU = {
      uNoise: { value: noiseTex }, uTime: { value: 0 }, uAmt: { value: 0 }, uFogFar: { value: 560 },
      uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.2, -1) },
    };
    const geo = new THREE.CircleGeometry(950, 64);
    geo.rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ uniforms: this.seaU, vertexShader: SEA_VS, fragmentShader: SEA_FS, transparent: true, depthWrite: false, fog: false })
    );
    this.sea.position.y = SEA_Y;
    this.sea.renderOrder = -4;
    this.sea.frustumCulled = false;
    this.group.add(this.sea);

    this.sunU = { uTime: { value: 0 }, uAmt: { value: 0 } };
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({ uniforms: this.sunU, vertexShader: SUN_VS, fragmentShader: SUN_FS, transparent: true, depthWrite: false, fog: false })
    );
    this.sun.renderOrder = -8;
    this.sun.frustumCulled = false;
    this.group.add(this.sun);
    this.group.visible = false;
    this.amount = 0;
  }

  // p: blended palette, sunDir: its sun direction.
  apply(p, sunDir) {
    const a = p.heaven;
    this.amount = a;
    this.group.visible = a > 0.002;
    if (!this.group.visible) return;
    const u = this.seaU;
    u.uAmt.value = Math.min(1, a * 1.4);
    u.uLit.value.copy(p.cloudLit);
    u.uShade.value.copy(p.cloudShade);
    u.uFog.value.copy(p.fogColor);
    u.uSunCol.value.copy(p.sunColor);
    u.uSunDir.value.copy(sunDir);
    u.uFogFar.value = p.fogFar;
    // the sea rises from far below as the island sinks away
    this.sea.position.y = SEA_Y - (1 - a) * 140;
    this.sunU.uAmt.value = a;
    const R = 440;
    this.sun.position.copy(sunDir).multiplyScalar(R);
    this.sun.position.y -= (1 - a) * 80; // rises into place
    this.sun.scale.setScalar(150);
    this.sun.lookAt(0, this.sun.position.y, 0);
  }

  update(time) {
    this.seaU.uTime.value = time;
    this.sunU.uTime.value = time;
  }
}
