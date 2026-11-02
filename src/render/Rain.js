import * as THREE from 'three';
import { mulberry32 } from './geo.js';

// Rain: thin streaks animated entirely on the GPU in a box that follows the
// camera (drops wrap around it, fading at its edges). Neon Night pours with
// it; Cyber Overdrive uses the same system as slow, long "data rain".
// Also the lightning bolt for thunderstorms.

const BOX = 34;

const RAIN_VS = `
attribute vec4 aSeed;
uniform float uTime; uniform vec3 uCenter; uniform float uSpeed; uniform float uLen; uniform vec3 uCam;
varying float vA; varying float vT;
void main(){
  const float B = ${BOX.toFixed(1)};
  vec3 p = aSeed.xyz * B;
  float sp = uSpeed * (0.8 + 0.4 * aSeed.w);
  vec3 dir = normalize(vec3(0.07, -1.0, 0.03));
  p += dir * uTime * sp;
  p = mod(p - uCenter + B * 0.5, B) + uCenter - B * 0.5;
  vec3 toCam = normalize(uCam - p);
  vec3 side = normalize(cross(dir, toCam));
  float w = 0.013 + 0.012 * aSeed.w;
  vec3 pos = p + side * position.x * w - dir * position.y * uLen * (0.7 + 0.6 * aSeed.w);
  vT = position.y;
  vec3 q = abs(p - uCenter) / (B * 0.5);
  vA = 1.0 - smoothstep(0.7, 1.0, max(q.x, max(q.y, q.z)));
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;

const RAIN_FS = `uniform vec3 uColor; uniform float uAmt; varying float vA; varying float vT;
void main(){ float a = vA * uAmt * (1.0 - vT) * 0.75; gl_FragColor = vec4(uColor * a, a); }`;

export class Rain {
  constructor(max = 1400) {
    this.max = max;
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    quad.setIndex([0, 1, 2, 2, 1, 3]);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    const rng = mulberry32(404);
    const seeds = new Float32Array(max * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rng();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = 0;
    this.geo = geo;
    this.u = {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() },
      uSpeed: { value: 26 }, uLen: { value: 1 }, uColor: { value: new THREE.Color('#cfe8ff') }, uAmt: { value: 0 },
    };
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: RAIN_VS, fragmentShader: RAIN_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    this.budget = max;
    this.fwd = new THREE.Vector3();
  }

  setBudget(n) {
    this.budget = Math.min(this.max, n);
  }

  apply(p) {
    const u = this.u;
    u.uAmt.value = p.rain;
    u.uColor.value.copy(p.rainColor);
    u.uSpeed.value = p.rainSpeed;
    u.uLen.value = p.rainLen;
    this.geo.instanceCount = Math.floor(this.budget * Math.min(1, p.rain * 1.2));
    this.mesh.visible = p.rain > 0.01 && this.geo.instanceCount > 0;
  }

  update(time, camera) {
    if (!this.mesh.visible) return;
    this.u.uTime.value = time;
    this.u.uCam.value.copy(camera.position);
    camera.getWorldDirection(this.fwd);
    // fill the space in front of the camera, where drops can be seen
    this.u.uCenter.value.copy(camera.position).addScaledVector(this.fwd, BOX * 0.42);
  }
}

// A jagged lightning bolt far out over the sea, rebuilt for every strike.
export class Bolt {
  constructor() {
    this.segs = 22;
    const n = (this.segs + 1) * 2;
    this.pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#dfe8ff').multiplyScalar(4), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = -6;
    this.t = 1;
  }

  strike(rng = Math.random) {
    const a = rng() * Math.PI * 2;
    const R = 170 + rng() * 90;
    const cx = Math.cos(a) * R;
    const cz = Math.sin(a) * R;
    // ribbon in the plane facing the arena
    const sx = -Math.sin(a);
    const sz = Math.cos(a);
    let x = 0;
    const top = 150 + rng() * 40;
    const bottom = -30;
    for (let i = 0; i <= this.segs; i++) {
      const t = i / this.segs;
      if (i > 0) x += (rng() - 0.5) * 18 * (1 - t * 0.3);
      const y = top + (bottom - top) * t;
      const w = 1.6 * (1 - t * 0.6);
      for (const s of [-1, 1]) {
        const k = (i * 2 + (s > 0 ? 1 : 0)) * 3;
        this.pos[k] = cx + sx * (x + s * w);
        this.pos[k + 1] = y;
        this.pos[k + 2] = cz + sz * (x + s * w);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeBoundingSphere();
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt) {
    if (!this.mesh.visible) return;
    this.t += dt;
    // a couple of flickers, then gone
    const on = this.t < 0.07 || (this.t > 0.11 && this.t < 0.2) || (this.t > 0.26 && this.t < 0.3);
    this.mat.opacity = on ? 1 : 0.08;
    if (this.t > 0.36) this.mesh.visible = false;
  }
}
