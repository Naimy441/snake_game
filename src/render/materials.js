import * as THREE from 'three';

// Material helpers. All lit materials stay MeshStandardMaterial (no clearcoat
// or transmission) and the scene keeps a fixed light set, so shaders are
// compiled once up front and never recompile mid-game.

// Zone reveal: props grow out of their anchor as a ring-shaped wave sweeps
// outwards from the arena (uMode 1), or shrink away behind it (uMode -1).
// aGlow adds emissive light proportional to the vertex colour.
export function makeRevealUniforms() {
  return { uReveal: { value: 1 }, uMode: { value: 1 }, uMaxD: { value: 260 }, uGlowBoost: { value: 1 }, uTime: { value: 0 } };
}

export function addReveal(material, uniforms, { glow = true, sway = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aAnchor; attribute float aGlow; varying float vGlow;
        uniform float uReveal; uniform float uMode; uniform float uMaxD; uniform float uTime;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGlow = aGlow;
        float dR = length(aAnchor.xz);
        float kR = clamp((uReveal * (uMaxD + 30.0) - dR) / 30.0, 0.0, 1.0);
        kR = uMode > 0.0 ? kR : 1.0 - kR;
        float pop = kR + sin(kR * 3.14159) * 0.22;
        ${sway ? 'float sw = (transformed.y - aAnchor.y); transformed.x += sin(uTime * 1.3 + aAnchor.x * 0.3) * 0.006 * sw * sw; transformed.z += cos(uTime * 1.1 + aAnchor.z * 0.3) * 0.006 * sw * sw;' : ''}
        transformed = aAnchor + (transformed - aAnchor) * pop;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vGlow; uniform float uGlowBoost;`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${glow ? 'totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlowBoost;' : ''}`
      );
  };
  material.customProgramCacheKey = () => `reveal-${glow}-${sway}`;
  return material;
}

export function propMaterials(uniforms) {
  return {
    foliage: addReveal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }), uniforms, { sway: true }),
    smooth: addReveal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }), uniforms),
    flat: addReveal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true }), uniforms),
    shiny: addReveal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.6 }), uniforms),
  };
}

// Two-tone checker from UVs (cliff faces). Colours are uniforms so they can
// blend between zones; uEdge adds a glowing seam for the night zones.
export function makeCheckerMaterial(shared, { scale = new THREE.Vector2(1, 1), reveal = null } = {}) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uA = shared.uA;
    shader.uniforms.uB = shared.uB;
    shader.uniforms.uEdge = shared.uEdge;
    shader.uniforms.uEdgeColor = shared.uEdgeColor;
    shader.uniforms.uScale = { value: scale };
    if (reveal) Object.assign(shader.uniforms, reveal);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vCUv;${reveal ? '\nattribute vec3 aAnchor; uniform float uReveal; uniform float uMode; uniform float uMaxD;' : ''}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvCUv = uv;${
          reveal
            ? `\nfloat dR = length(aAnchor.xz); float kR = clamp((uReveal * (uMaxD + 30.0) - dR) / 30.0, 0.0, 1.0); kR = uMode > 0.0 ? kR : 1.0 - kR; transformed = aAnchor + (transformed - aAnchor) * (kR + sin(kR * 3.14159) * 0.22);`
            : ''
        }`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vCUv; uniform vec3 uA; uniform vec3 uB; uniform float uEdge; uniform vec3 uEdgeColor; uniform vec2 uScale;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 cc = vCUv * uScale;
        float ck = mod(floor(cc.x) + floor(cc.y), 2.0);
        vec2 fc = abs(fract(cc) - 0.5);
        float bevel = smoothstep(0.5, 0.44, max(fc.x, fc.y));
        diffuseColor.rgb = mix(uA, uB, ck) * (0.82 + 0.18 * bevel);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec2 ec = abs(fract(vCUv * uScale) - 0.5);
        float seam = smoothstep(0.47, 0.5, max(ec.x, ec.y));
        totalEmissiveRadiance += uEdgeColor * seam * uEdge;`
      );
  };
  mat.customProgramCacheKey = () => `checker-${!!reveal}`;
  return mat;
}

// The play surface: two-tone cells whose colours, roughness and glowing grid
// all come from uniforms, so it can turn from a sunny lawn into neon glass.
export function makeBoardMaterial(size, detailTex, uniforms) {
  const mat = new THREE.MeshStandardMaterial({ map: detailTex, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uSize = { value: size };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBUv; varying vec3 vBW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBUv = uv; vBW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vBUv; varying vec3 vBW;
        uniform vec3 uBoardA; uniform vec3 uBoardB; uniform float uRough; uniform float uGrid; uniform vec3 uGridColor;
        uniform float uLines; uniform float uSize; uniform float uTime; uniform float uPulse; uniform vec2 uPulseAt; uniform float uDetail;`
      )
      .replace(
        '#include <map_fragment>',
        `vec2 cell = vBUv * uSize;
        float ck = mod(floor(cell.x) + floor(cell.y), 2.0);
        vec3 base = mix(uBoardA, uBoardB, ck);
        vec4 det = texture2D(map, cell * 0.5);
        base *= mix(vec3(1.0), det.rgb * 1.6, uDetail);
        vec2 fc = abs(fract(cell) - 0.5);
        float edge = max(fc.x, fc.y);
        base *= 1.0 - smoothstep(0.43, 0.5, edge) * 0.12;
        base = mix(base, vec3(1.0), smoothstep(0.47, 0.5, edge) * uLines);
        diffuseColor.rgb *= base;`
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = uRough;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float line = smoothstep(0.455, 0.5, edge);
        float dist = length(vBW.xz - uPulseAt);
        float wave = exp(-pow((dist - uPulse * 30.0) * 0.5, 2.0)) * step(0.001, uPulse) * (1.0 - uPulse);
        float scan = 0.65 + 0.35 * sin(dist * 0.6 - uTime * 3.0);
        totalEmissiveRadiance += uGridColor * (line * uGrid * scan + wave * (0.35 + line * 2.5));`
      );
  };
  mat.customProgramCacheKey = () => 'board';
  return mat;
}
