import * as THREE from 'three';
import { mulberry32 } from './geo.js';

// Floating particles animated entirely on the GPU (no per-frame CPU work):
// pollen by day, embers at sunset, fireflies at night, data sparks in cyber.
const P_VS = `
attribute vec4 aSeed;
uniform float uTime; uniform float uSize; uniform float uRise; uniform float uTwinkle; uniform float uScale;
varying float vA;
void main(){
  float H = 16.0;
  vec3 p = vec3((aSeed.x - 0.5) * 76.0, 0.0, (aSeed.y - 0.5) * 76.0);
  float y = mod(aSeed.z * H + uTime * uRise * (0.5 + aSeed.w), H) - 1.5;
  p.y = y;
  p.x += sin(uTime * 0.45 + aSeed.w * 20.0) * 1.4;
  p.z += cos(uTime * 0.38 + aSeed.z * 20.0) * 1.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + aSeed.w * 0.9) * uScale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
  float tw = 0.5 + 0.5 * sin(uTime * (1.5 + aSeed.x * 4.0) + aSeed.y * 40.0);
  vA = mix(1.0, tw * tw, uTwinkle) * smoothstep(-1.5, 0.5, y) * smoothstep(H - 1.5, H - 4.0, y);
}`;
const P_FS = `
uniform vec3 uColor; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
  float a = smoothstep(0.25, 0.0, d) * vA; gl_FragColor = vec4(uColor * a * 2.0, a); }`;

const B_VS = `
uniform float uTime;
void main(){
  vec3 p = position;
  float flap = sin(uTime * 10.0 + float(gl_InstanceID) * 1.9);
  p.y += abs(p.x) * flap * 0.7;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`;
const B_FS = `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }`;

export class Ambient {
  constructor(max = 500) {
    this.group = new THREE.Group();
    this.max = max;
    const rng = mulberry32(77);
    const seeds = new Float32Array(max * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rng();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.uniforms = {
      uTime: { value: 0 },
      uSize: { value: 0.1 },
      uRise: { value: 0.1 },
      uTwinkle: { value: 0 },
      uScale: { value: 400 },
      uColor: { value: new THREE.Color('#ffffff') },
    };
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: P_VS,
        fragmentShader: P_FS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.points.frustumCulled = false;
    this.geo = geo;
    this.group.add(this.points);

    // birds
    const bird = new THREE.BufferGeometry();
    bird.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-0.9, 0.05, -0.1, 0, 0, 0.3, 0, 0, -0.3, 0.9, 0.05, -0.1, 0, 0, -0.3, 0, 0, 0.3], 3)
    );
    bird.computeVertexNormals();
    this.birdUniforms = { uTime: this.uniforms.uTime, uColor: { value: new THREE.Color('#1a2030') } };
    this.birds = new THREE.InstancedMesh(
      bird,
      new THREE.ShaderMaterial({ uniforms: this.birdUniforms, vertexShader: B_VS, fragmentShader: B_FS, side: THREE.DoubleSide }),
      16
    );
    this.birds.frustumCulled = false;
    this.birdData = [];
    for (let i = 0; i < 16; i++) {
      const flock = i < 9 ? 0 : 1;
      this.birdData.push({
        flock,
        r: (flock ? 44 : 34) + (rng() - 0.5) * 6,
        y: (flock ? 18 : 12) + (rng() - 0.5) * 3,
        off: rng() * 0.5,
        speed: (flock ? -0.09 : 0.11) * (0.95 + rng() * 0.1),
        phase: flock ? 2.4 : 0,
      });
    }
    this.group.add(this.birds);
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpP = new THREE.Vector3();
    this.tmpS = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.birdScale = 1;
  }

  setBudget(n) {
    this.budget = Math.min(this.max, n);
  }

  apply(p, density, birds) {
    const u = this.uniforms;
    u.uColor.value.copy(p.particle);
    u.uSize.value = p.particleSize;
    u.uRise.value = p.particleRise;
    u.uTwinkle.value = p.particleTwinkle;
    this.geo.setDrawRange(0, Math.floor((this.budget ?? this.max) * density));
    this.birdScale = birds;
    this.birds.visible = birds > 0.02;
  }

  update(dt, time, pxScale) {
    this.uniforms.uTime.value = time;
    this.uniforms.uScale.value = pxScale;
    if (!this.birds.visible) return;
    for (let i = 0; i < this.birdData.length; i++) {
      const b = this.birdData[i];
      const a = time * b.speed + b.phase + b.off;
      this.tmpP.set(Math.cos(a) * b.r, b.y + Math.sin(time * 0.7 + i) * 0.6, Math.sin(a) * b.r);
      const heading = Math.atan2(-Math.sin(a) * Math.sign(b.speed), Math.cos(a) * Math.sign(b.speed));
      this.tmpQ.setFromAxisAngle(this.up, heading);
      this.tmpS.setScalar(this.birdScale * 0.9);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.birds.setMatrixAt(i, this.tmpM);
    }
    this.birds.instanceMatrix.needsUpdate = true;
  }
}
