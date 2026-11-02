import * as THREE from 'three';

// Shared atmosphere uniforms: drifting cloud shadows (day zones), rain
// wetness and the lightning flash. Lit materials opt in with withAtmos(),
// which chains onto whatever shader hooks the material already has.
export const ATMOS = {
  uCloudTex: { value: null },
  uCloudAmt: { value: 0 },
  uCloudOff: { value: new THREE.Vector2() },
  uFlashLight: { value: 0 }, // lightning: extra cold light on everything
};

const VERT = `
  vec4 atw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    atw = instanceMatrix * atw;
  #endif
  vAtW = (modelMatrix * atw).xyz;`;

const FRAG_HEAD = `
  varying vec3 vAtW;
  uniform sampler2D uCloudTex; uniform float uCloudAmt; uniform vec2 uCloudOff; uniform float uFlashLight;
  float atmosCloud(vec3 p){
    if (uCloudAmt < 0.001) return 1.0;
    vec2 uv = p.xz * 0.0105 + uCloudOff;
    float n = texture2D(uCloudTex, uv).r * 0.62 + texture2D(uCloudTex, uv * 2.6 + 0.37).r * 0.38;
    return 1.0 - smoothstep(0.47, 0.64, n) * uCloudAmt;
  }`;

const FRAG_LIGHT = `
  float atCs = atmosCloud(vAtW);
  reflectedLight.directDiffuse *= atCs;
  reflectedLight.directSpecular *= atCs;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.55, 0.65, 1.0) * uFlashLight;`;

export function withAtmos(mat) {
  const prev = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey.call(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, ATMOS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAtW;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAG_LIGHT}`);
  };
  mat.customProgramCacheKey = () => `${key}|atmos`;
  mat.needsUpdate = true;
  return mat;
}

// Every lit material under `root` (meshes only), once each.
export function atmosAll(root) {
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || done.has(m) || m.userData.atmos || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) continue;
      done.add(m);
      m.userData.atmos = true;
      withAtmos(m);
    }
  });
}
