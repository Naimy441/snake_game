import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// A small, fused post-processing pipeline:
//   scene -> HDR target (optionally MSAA, optionally at a reduced render scale)
//   -> dual-filter bloom (a few tiny passes at 1/2..1/32 resolution)
//   -> one final pass: radial speed blur, chromatic edge, bloom, tone mapping,
//      colour grade, vignette, danger tint, white flash and speed lines.
// Everything after the scene render is a handful of full-screen triangles,
// much cheaper than the previous EffectComposer + UnrealBloom chain, and the
// scene resolution can be scaled independently of the canvas.

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOWN_FS = `
uniform sampler2D tInput; uniform vec2 texel; uniform float threshold; uniform float knee; uniform bool prefilter;
varying vec2 vUv;
vec3 pre(vec3 c){
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - threshold) / max(br, 1e-4);
  return min(c * w, vec3(30.0));
}
void main(){
  vec3 s = texture2D(tInput, vUv).rgb * 4.0;
  s += texture2D(tInput, vUv + vec2(-texel.x, -texel.y)).rgb;
  s += texture2D(tInput, vUv + vec2( texel.x, -texel.y)).rgb;
  s += texture2D(tInput, vUv + vec2(-texel.x,  texel.y)).rgb;
  s += texture2D(tInput, vUv + vec2( texel.x,  texel.y)).rgb;
  s *= 0.125;
  gl_FragColor = vec4(prefilter ? pre(s) : s, 1.0);
}`;

const UP_FS = `
uniform sampler2D tInput; uniform vec2 texel; uniform float radius;
varying vec2 vUv;
void main(){
  vec2 o = texel * radius;
  vec3 s = texture2D(tInput, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  s += texture2D(tInput, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  s += texture2D(tInput, vUv + vec2(0.0, o.y * 2.0)).rgb;
  s += texture2D(tInput, vUv + vec2(o.x, o.y)).rgb * 2.0;
  s += texture2D(tInput, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  s += texture2D(tInput, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  s += texture2D(tInput, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  s += texture2D(tInput, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0, 1.0);
}`;

const FINAL_FS = `
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float uBloom; uniform float uSpeed; uniform float uChroma; uniform float uVignette;
uniform float uDanger; uniform vec3 uDangerColor; uniform float uFlash; uniform vec3 uFlashColor;
uniform float uTime; uniform float uLines; uniform vec2 uCenter; uniform float uAspect;
uniform float uSat; uniform float uContrast; uniform vec3 uTint; uniform vec3 uLift; uniform bool uUseBloom;
varying vec2 vUv;
float hash(float n){ return fract(sin(n) * 43758.5453123); }
void main(){
  vec2 uv = vUv;
  vec2 dir = uv - uCenter;
  float r = length(dir * vec2(uAspect, 1.0));
  vec3 col;
#if TAPS > 0
  if (uSpeed > 0.002) {
    float amt = uSpeed * 0.075 * smoothstep(0.08, 0.75, r);
    col = vec3(0.0);
    for (int i = 0; i < TAPS; i++) {
      float t = float(i) / float(TAPS);
      col += texture2D(tScene, uv - dir * amt * t).rgb;
    }
    col /= float(TAPS);
  } else {
    col = texture2D(tScene, uv).rgb;
  }
#else
  col = texture2D(tScene, uv).rgb;
#endif
  if (uChroma > 0.001) {
    vec2 off = dir * uChroma * 0.012 * r;
    col.r = mix(col.r, texture2D(tScene, uv + off).r, 0.85);
    col.b = mix(col.b, texture2D(tScene, uv - off).b, 0.85);
  }
  if (uUseBloom) col += texture2D(tBloom, uv).rgb * uBloom;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  // colour grade in tone-mapped linear space
  vec3 c = gl_FragColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.18) * uContrast + 0.18;
  c = c * uTint + uLift * (1.0 - c);
  gl_FragColor.rgb = clamp(c, 0.0, 1.0);
  #include <colorspace_fragment>
  // screen-space overlays in display space
  vec3 o = gl_FragColor.rgb;
  float vig = smoothstep(0.45, 1.25, r);
  o *= 1.0 - vig * uVignette;
  o = mix(o, uDangerColor, smoothstep(0.35, 1.1, r) * uDanger);
  if (uLines > 0.001) {
    float a = atan(dir.y * 1.0, dir.x * uAspect);
    float f = a * 38.0;
    float seg = floor(f);
    float h = hash(seg * 1.37 + floor(uTime * 16.0) * 7.13);
    float on = step(1.0 - 0.45 * uLines, h);
    float w = fract(f);
    float thin = smoothstep(0.0, 0.12, w) * smoothstep(0.42, 0.18, w);
    float rad = smoothstep(0.42 + h * 0.25, 1.05, r);
    o = mix(o, vec3(1.0), on * thin * rad * min(1.0, uLines) * 0.55);
  }
  o = mix(o, uFlashColor, uFlash);
  gl_FragColor = vec4(o, 1.0);
}`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.scale = 1;
    this.levels = [];
    this.samples = 4;
    this.bloomLevels = 5;
    this.taps = 8;
    this.sceneRT = null;
    this.size = new THREE.Vector2(1, 1);

    this.downMat = new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.0 }, knee: { value: 0.5 }, prefilter: { value: false } },
      vertexShader: VS,
      fragmentShader: DOWN_FS,
      depthTest: false,
      depthWrite: false,
    });
    this.upMat = new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1.0 } },
      vertexShader: VS,
      fragmentShader: UP_FS,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    this.finalMat = this.makeFinal(8);
    this.quad = new FullScreenQuad(this.downMat);
    this.params = this.finalMat.uniforms;
  }

  makeFinal(taps) {
    return new THREE.ShaderMaterial({
      defines: { TAPS: taps },
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uUseBloom: { value: true },
        uBloom: { value: 0.35 },
        uSpeed: { value: 0 },
        uChroma: { value: 0 },
        uVignette: { value: 0.35 },
        uDanger: { value: 0 },
        uDangerColor: { value: new THREE.Color('#ff1e46') },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color('#ffffff') },
        uTime: { value: 0 },
        uLines: { value: 0 },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uSat: { value: 1.1 },
        uContrast: { value: 1.05 },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uLift: { value: new THREE.Color(0, 0, 0) },
      },
      vertexShader: VS,
      fragmentShader: FINAL_FS,
      depthTest: false,
      depthWrite: false,
    });
  }

  // samples: MSAA sample count for the scene; bloomLevels: 0 disables bloom;
  // taps: radial blur samples (0 disables).
  configure({ samples, bloomLevels, taps }) {
    const changed = samples !== this.samples || bloomLevels !== this.bloomLevels;
    this.samples = samples;
    this.bloomLevels = bloomLevels;
    if (taps !== this.taps) {
      const old = this.finalMat;
      this.finalMat = this.makeFinal(taps);
      for (const k of Object.keys(old.uniforms)) {
        const v = old.uniforms[k].value;
        if (v && v.copy && !v.isTexture) this.finalMat.uniforms[k].value.copy(v);
        else this.finalMat.uniforms[k].value = v;
      }
      old.dispose();
      this.params = this.finalMat.uniforms;
      this.taps = taps;
    }
    if (changed) this.allocate();
  }

  setScale(s) {
    if (Math.abs(s - this.scale) < 1e-3) return;
    this.scale = s;
    this.allocate();
  }

  setSize(w, h) {
    this.size.set(w, h);
    this.params.uAspect.value = w / Math.max(1, h);
    this.allocate();
  }

  allocate() {
    const w = Math.max(2, Math.round(this.size.x * this.scale));
    const h = Math.max(2, Math.round(this.size.y * this.scale));
    if (this.sceneRT) this.sceneRT.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: this.samples,
      depthBuffer: true,
    });
    for (const l of this.levels) l.dispose();
    this.levels = [];
    let lw = w;
    let lh = h;
    for (let i = 0; i < this.bloomLevels; i++) {
      lw = Math.max(1, Math.floor(lw / 2));
      lh = Math.max(1, Math.floor(lh / 2));
      this.levels.push(new THREE.WebGLRenderTarget(lw, lh, { type: THREE.HalfFloatType, depthBuffer: false }));
    }
  }

  get renderSize() {
    return { x: this.sceneRT.width, y: this.sceneRT.height };
  }

  render(scene, camera, { threshold = 1.0 } = {}) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    const useBloom = this.levels.length > 0 && this.params.uBloom.value > 0.001;
    if (useBloom) {
      const q = this.quad;
      // downsample chain
      q.material = this.downMat;
      let src = this.sceneRT;
      for (let i = 0; i < this.levels.length; i++) {
        const dst = this.levels[i];
        this.downMat.uniforms.tInput.value = src.texture;
        this.downMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
        this.downMat.uniforms.prefilter.value = i === 0;
        this.downMat.uniforms.threshold.value = threshold;
        r.setRenderTarget(dst);
        q.render(r);
        src = dst;
      }
      // upsample, adding into each larger level
      q.material = this.upMat;
      for (let i = this.levels.length - 1; i > 0; i--) {
        const s = this.levels[i];
        this.upMat.uniforms.tInput.value = s.texture;
        this.upMat.uniforms.texel.value.set(1 / s.width, 1 / s.height);
        r.setRenderTarget(this.levels[i - 1]);
        q.render(r);
      }
      this.params.tBloom.value = this.levels[0].texture;
    }
    this.params.uUseBloom.value = useBloom;
    this.params.tScene.value = this.sceneRT.texture;
    this.quad.material = this.finalMat;
    r.setRenderTarget(null);
    this.quad.render(r);
  }

  dispose() {
    this.sceneRT?.dispose();
    for (const l of this.levels) l.dispose();
    this.downMat.dispose();
    this.upMat.dispose();
    this.finalMat.dispose();
    this.quad.dispose();
  }
}
