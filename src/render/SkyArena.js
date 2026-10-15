import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKY_H, SKY_LIFT } from '../game/SnakeGame.js';

// The flight box in Sunset Heavens: twelve laser edges and six grid faces.
// Built to make the boundaries readable at speed:
// - the floor (orange) and ceiling (violet) grids are always visible around
//   the snake, so looking up or down there's always a reference;
// - every face marks the head's position on it (a ring right under, over and
//   beside the head), and the side walls glow in a band at the head's
//   altitude (and the apple's);
// - a face turns hot pink-red as the head closes in on it;
// - lines run from the head down to the floor and up to the ceiling.

const FACE_VS = `varying vec3 vWorld; varying vec3 vN;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FACE_FS = `uniform vec3 uHead; uniform vec3 uFood; uniform float uFoodOn; uniform float uAmt; uniform float uTime;
uniform vec3 uGrid; uniform vec3 uCeil; uniform vec3 uHot; uniform vec3 uHeadCol; uniform vec3 uFoodCol;
varying vec3 vWorld; varying vec3 vN;
float gridLine(vec2 p){ vec2 w = fwidth(p) * 1.3; vec2 g = abs(fract(p) - 0.5); vec2 l = smoothstep(vec2(0.5) - w, vec2(0.5), g); return max(l.x, l.y); }
void main(){
  vec3 an = abs(vN);
  bool sideX = an.x > 0.5;
  bool horiz = an.y > 0.5;
  bool isFloor = vN.y > 0.5;
  bool isCeil = vN.y < -0.5;
  // cell boundaries: x and z at half cells, y at the layer edges
  vec3 off = vec3(0.5, 0.25, 0.5);
  vec3 q = vWorld + off;
  vec3 h = uHead + off;
  vec2 p = sideX ? q.zy : horiz ? q.xz : q.xy;
  vec2 hp = sideX ? h.zy : horiz ? h.xz : h.xy;
  float line = gridLine(p);
  float pd = length(p - hp);   // distance to the head's projection on this face
  float plane = sideX ? abs(uHead.x - vWorld.x) : horiz ? abs(uHead.y - vWorld.y) : abs(uHead.z - vWorld.z);
  float danger = smoothstep(3.5, 0.6, plane);
  float near = smoothstep(10.0, 0.0, pd);
  vec3 base = isCeil ? uCeil : uGrid;
  float always = horiz ? 0.06 + 0.14 * smoothstep(18.0, 0.0, pd) : 0.035;
  vec3 col = mix(base, uHot, danger) * line * (always + near * (0.12 + danger * 1.4));
  col += uHot * danger * danger * near * 0.14;
  // position marker: always on floor and ceiling, on walls once they're close
  float ring = smoothstep(0.08, 0.0, abs(pd - 0.55)) + smoothstep(0.55, 0.0, pd) * 0.35;
  float mark = horiz ? 1.0 : smoothstep(8.0, 2.5, plane);
  col += mix(isCeil ? uCeil : uHeadCol, uHot, danger) * ring * mark;
  if (isFloor) {
    float wave = smoothstep(0.1, 0.0, abs(pd - fract(uTime * 0.4) * 9.0)) * 0.12 * (1.0 - fract(uTime * 0.4));
    col += uHeadCol * wave;
  }
  if (!horiz) {
    float hb = exp(-abs(vWorld.y - uHead.y) * 7.0) * 0.32;
    float fb = exp(-abs(vWorld.y - uFood.y) * 7.0) * 0.22 * uFoodOn;
    col += uHeadCol * hb * (0.5 + 0.5 * line) + uFoodCol * fb * (0.5 + 0.5 * line);
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
    const y0 = -SKY_LIFT - 0.25;
    const y1 = SKY_H - 1 - SKY_LIFT + 0.75;
    this.floorY = y0;
    this.ceilY = y1;
    this.half = h;
    this.amount = 0;
    const common = {
      uHead: { value: new THREE.Vector3() }, uFood: { value: new THREE.Vector3() }, uFoodOn: { value: 0 },
      uAmt: { value: 0 }, uTime: { value: 0 },
      uGrid: { value: new THREE.Color('#ffb46a').multiplyScalar(1.1) }, uCeil: { value: new THREE.Color('#b48aff').multiplyScalar(1.4) },
      uHot: { value: new THREE.Color('#ff3a6a').multiplyScalar(2) },
      uHeadCol: { value: new THREE.Color('#5ff6ff').multiplyScalar(1.8) }, uFoodCol: { value: new THREE.Color('#ff3355').multiplyScalar(1.8) },
    };
    this.u = common;
    const faceMat = new THREE.ShaderMaterial({
      uniforms: common,
      vertexShader: FACE_VS, fragmentShader: FACE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const W = size;
    const H = y1 - y0;
    const floor = new THREE.PlaneGeometry(W, W);
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, y0, 0);
    this.floor = new THREE.Mesh(floor, faceMat);
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
    this.shell = new THREE.Mesh(mergeGeometries(parts), faceMat);
    for (const m of [this.floor, this.shell]) {
      m.frustumCulled = false;
      m.renderOrder = 6;
    }

    // laser edges
    const edges = [];
    const add = (len, rot, x, y, z) => {
      const g = new THREE.CylinderGeometry(0.12, 0.12, len, 8, 1, true);
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

    // lines from the head down to the floor marker and up to the ceiling's
    const lg = new THREE.CylinderGeometry(0.018, 0.018, 1, 6, 1, true);
    lg.translate(0, -0.5, 0);
    this.lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ff6ff').multiplyScalar(1.6), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.line = new THREE.Mesh(lg, this.lineMat);
    this.line.frustumCulled = false;
    const ug = new THREE.CylinderGeometry(0.018, 0.018, 1, 6, 1, true);
    ug.translate(0, 0.5, 0);
    this.upMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#b48aff').multiplyScalar(1.6), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.upLine = new THREE.Mesh(ug, this.upMat);
    this.upLine.frustumCulled = false;

    this.group.add(this.floor, this.shell, this.edges, this.line, this.upLine);
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
    const rise = this.ceilY - head.y - 0.4;
    this.upLine.visible = active && rise > 0.2;
    this.upLine.position.set(head.x, head.y + 0.4, head.z);
    this.upLine.scale.set(1, Math.max(0.01, rise), 1);
    this.upMat.opacity = 0.35 * a;
  }
}
