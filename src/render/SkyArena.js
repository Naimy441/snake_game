import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKY_H, SKY_MID } from '../game/SnakeGame.js';

// The flight box in Sunset Heavens: twelve laser edges, a holographic grid
// floor and force-field walls that only light up near the snake's head.
// Depth cues for flying in 3D: the walls glow in a band at the head's
// altitude (and the apple's), the floor shows a marker right under the head,
// and a thin plumb line drops from the head to the floor.

const FACE_VS = `varying vec3 vWorld; varying vec3 vN;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FACE_FS = `uniform vec3 uHead; uniform vec3 uFood; uniform float uFoodOn; uniform float uAmt; uniform float uFloor; uniform float uTime;
uniform vec3 uGrid; uniform vec3 uHot; uniform vec3 uHeadCol; uniform vec3 uFoodCol;
varying vec3 vWorld; varying vec3 vN;
float gridLine(vec2 p){ vec2 w = fwidth(p) * 1.2; vec2 g = abs(fract(p) - 0.5); vec2 l = smoothstep(vec2(0.5) - w, vec2(0.5), g); return max(l.x, l.y); }
void main(){
  vec3 an = abs(vN);
  // cell boundaries: x and z at half cells, y at the layer edges
  vec3 q = vWorld + vec3(0.5, 0.25, 0.5);
  vec2 p = an.x > 0.5 ? q.zy : an.y > 0.5 ? q.xz : q.xy;
  float line = gridLine(p);
  float d = distance(vWorld, uHead);
  float prox = smoothstep(5.5, 0.0, d);
  vec3 col;
  if (uFloor > 0.5) {
    float fd = length(vWorld.xz - uHead.xz);
    float base = 0.03 + 0.14 * smoothstep(12.0, 0.0, fd);
    float spot = smoothstep(0.55, 0.0, fd) * 0.5 + smoothstep(0.07, 0.0, abs(fd - 0.5)) * 0.9;
    float wave = smoothstep(0.1, 0.0, abs(fd - fract(uTime * 0.4) * 9.0)) * 0.12 * (1.0 - fract(uTime * 0.4));
    col = uGrid * line * (base + prox) + uHeadCol * (spot + wave);
  } else {
    // force field: grid and a faint film only near the head, hotter up close
    float film = prox * prox * 0.12;
    col = mix(uGrid, uHot, prox) * (line * (0.03 + prox * 0.9) + film);
    if (an.y < 0.5) {
      float hb = exp(-abs(vWorld.y - uHead.y) * 7.0) * 0.32;
      float fb = exp(-abs(vWorld.y - uFood.y) * 7.0) * 0.22 * uFoodOn;
      col += uHeadCol * hb * (0.5 + 0.5 * line) + uFoodCol * fb * (0.5 + 0.5 * line);
    }
  }
  gl_FragColor = vec4(col * uAmt, 1.0);
}`;

const EDGE_VS = `varying vec3 vWorld; varying float vFace;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 mv = viewMatrix * w;
  vFace = abs(dot(normalize(mat3(viewMatrix) * normal), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`;
const EDGE_FS = `uniform vec3 uColor; uniform float uTime; uniform float uAmt; varying vec3 vWorld; varying float vFace;
void main(){
  float pulse = 0.65 + 0.35 * sin((vWorld.x + vWorld.y + vWorld.z) * 0.7 - uTime * 7.0);
  float core = pow(vFace, 6.0) * 2.4 + pow(vFace, 1.5) * 0.5;
  gl_FragColor = vec4(uColor * core * pulse * uAmt, 1.0);
}`;

export class SkyArena {
  constructor(size) {
    this.group = new THREE.Group();
    const h = size / 2;
    const y0 = -SKY_MID - 0.25;
    const y1 = SKY_H - 1 - SKY_MID + 0.75;
    this.floorY = y0;
    this.ceilY = y1;
    this.half = h;
    this.amount = 0;
    const common = {
      uHead: { value: new THREE.Vector3() }, uFood: { value: new THREE.Vector3() }, uFoodOn: { value: 0 },
      uAmt: { value: 0 }, uTime: { value: 0 },
      uGrid: { value: new THREE.Color('#ffb46a').multiplyScalar(1.1) }, uHot: { value: new THREE.Color('#ff3a6a').multiplyScalar(2) },
      uHeadCol: { value: new THREE.Color('#5ff6ff').multiplyScalar(1.8) }, uFoodCol: { value: new THREE.Color('#ff3355').multiplyScalar(1.8) },
    };
    this.u = common;
    const faceMat = (floor) => new THREE.ShaderMaterial({
      uniforms: { ...common, uFloor: { value: floor ? 1 : 0 } },
      vertexShader: FACE_VS, fragmentShader: FACE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const W = size;
    const H = y1 - y0;
    const floor = new THREE.PlaneGeometry(W, W);
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, y0, 0);
    this.floor = new THREE.Mesh(floor, faceMat(true));
    // walls and ceiling share one draw
    const parts = [];
    for (const [ry, x, z] of [[0, 0, -h], [Math.PI, 0, h], [Math.PI / 2, -h, 0], [-Math.PI / 2, h, 0]]) {
      const g = new THREE.PlaneGeometry(W, H);
      g.rotateY(ry);
      g.translate(x, (y0 + y1) / 2, z);
      parts.push(g);
    }
    const ceil = new THREE.PlaneGeometry(W, W);
    ceil.rotateX(Math.PI / 2);
    ceil.translate(0, y1, 0);
    parts.push(ceil);
    this.shell = new THREE.Mesh(mergeGeometries(parts), faceMat(false));
    for (const m of [this.floor, this.shell]) {
      m.frustumCulled = false;
      m.renderOrder = 6;
    }

    // laser edges
    const edges = [];
    const add = (len, rot, x, y, z) => {
      const g = new THREE.CylinderGeometry(0.09, 0.09, len, 8, 1, true);
      if (rot === 'x') g.rotateZ(Math.PI / 2);
      if (rot === 'z') g.rotateX(Math.PI / 2);
      g.translate(x, y, z);
      edges.push(g);
    };
    for (const y of [y0, y1]) for (const z of [-h, h]) add(W, 'x', 0, y, z);
    for (const y of [y0, y1]) for (const x of [-h, h]) add(W, 'z', x, y, 0);
    for (const x of [-h, h]) for (const z of [-h, h]) add(H, 'y', x, (y0 + y1) / 2, z);
    this.edgeU = { uColor: { value: new THREE.Color('#ff4fd8') }, uTime: common.uTime, uAmt: { value: 0 } };
    this.edges = new THREE.Mesh(
      mergeGeometries(edges),
      new THREE.ShaderMaterial({ uniforms: this.edgeU, vertexShader: EDGE_VS, fragmentShader: EDGE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    );
    this.edges.frustumCulled = false;
    this.edges.renderOrder = 6;

    // plumb line from the head down to the floor marker
    const lg = new THREE.CylinderGeometry(0.018, 0.018, 1, 6, 1, true);
    lg.translate(0, -0.5, 0);
    this.lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ff6ff').multiplyScalar(1.6), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.line = new THREE.Mesh(lg, this.lineMat);
    this.line.frustumCulled = false;

    this.group.add(this.floor, this.shell, this.edges, this.line);
    this.group.visible = false;
  }

  // amount: 0..1 presence (the zone's heaven value, eased); head: world
  // position of the snake's head; food: world position of the apple or null.
  update(dt, time, amount, head, food, active) {
    this.amount = amount;
    this.group.visible = amount > 0.002;
    if (!this.group.visible) return;
    // lasers flicker on, then settle
    const flick = amount < 1 ? (Math.sin(time * 60) > -0.2 ? 1 : 0.3) : 1;
    const a = amount * flick;
    this.u.uAmt.value = a;
    this.edgeU.uAmt.value = a;
    this.u.uTime.value = time;
    this.u.uHead.value.set(head.x, head.y + 0.26, head.z);
    this.u.uFoodOn.value = food ? 1 : 0;
    if (food) this.u.uFood.value.set(food.x, food.y + 0.48, food.z);
    const drop = head.y + 0.1 - this.floorY;
    this.line.visible = active && drop > 0.2;
    this.line.position.set(head.x, head.y + 0.1, head.z);
    this.line.scale.set(1, Math.max(0.01, drop), 1);
    this.lineMat.opacity = 0.45 * a;
  }
}
