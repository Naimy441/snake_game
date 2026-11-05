import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, mulberry32, clean, xform } from './geo.js';
import { makeCheckerMaterial, makeBoardMaterial } from './materials.js';
import { makeWaterfall } from './Water.js';

// Shape of the floating island's rim.
export function islandRadius(theta) {
  return 25 + 2.4 * fbm(Math.cos(theta) * 1.4 + 3, Math.sin(theta) * 1.4, 0.5, 3);
}

export const GRASS_Y = -0.32;
const CLIFF_BOTTOM = -8;
const TIP_Y = -26;

// The board, its platform and bumpers, and the floating island it sits on.
// Colours are driven by the zone palette every frame.
export class Island {
  constructor({ size, maxAnisotropy, detailTex }) {
    this.size = size;
    this.half = size / 2;
    this.group = new THREE.Group();
    this.rng = mulberry32(2024);
    this.boardUniforms = {
      uBoardA: { value: new THREE.Color() },
      uBoardB: { value: new THREE.Color() },
      uRough: { value: 0.9 },
      uGrid: { value: 0 },
      uGridColor: { value: new THREE.Color() },
      uLines: { value: 0.15 },
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uPulseAt: { value: new THREE.Vector2() },
      uDetail: { value: 1 },
      uSize: { value: size },
    };
    this.checker = {
      uA: { value: new THREE.Color() },
      uB: { value: new THREE.Color() },
      uEdge: { value: 0 },
      uEdgeColor: { value: new THREE.Color() },
    };
    this.wallChecker = {
      uA: { value: new THREE.Color() },
      uB: { value: new THREE.Color() },
      uEdge: { value: 0 },
      uEdgeColor: { value: new THREE.Color() },
    };
    detailTex.anisotropy = Math.min(8, maxAnisotropy);
    // the play surface: a unit plane scaled to the board, so it can resize
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), makeBoardMaterial(size, detailTex, this.boardUniforms));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    this.floor = floor;
    this.makeArenaMaterials();
    this.frame = null;
    this.grow = null; // board resize animation
    this.buildArena();
    this.buildIsland();
  }

  makeArenaMaterials() {
    this.platformMat = new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.55, metalness: 0.05 });
    this.trimMat = new THREE.MeshStandardMaterial({ color: '#ffcf3f', roughness: 0.25, metalness: 0.9 });
    this.wallMat = makeCheckerMaterial(this.wallChecker, { scale: new THREE.Vector2(80, 2) });
    this.wallMat.roughness = 0.4;
    this.wallMat.metalness = 0.1;
    this.railMat = new THREE.MeshStandardMaterial({ color: '#f2f6ff', roughness: 0.12, metalness: 1 });
    this.capMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffd86b', emissiveIntensity: 2.2 });
    this.rimMats = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: '#0b1630', emissive: '#38f6ff', emissiveIntensity: 1.1, roughness: 0.3 }));
  }

  // Resize the board (17 -> 19 -> 21 as the zones change). The floor takes
  // the new size at once; the walls, rails and platform are rebuilt at the
  // new size and slide outward from where they were, uncovering the new ring
  // of cells. instant skips the slide.
  setSize(size, { instant = false } = {}) {
    if (size === this.size) return false;
    const from = this.frameScale();
    const old = this.size;
    this.size = size;
    this.half = size / 2;
    this.buildArena();
    this.grow = instant ? null : { t: 0, dur: 0.85, from: (old / size) * from };
    this.applyFrameScale();
    return true;
  }

  frameScale() {
    if (!this.grow) return 1;
    const k = Math.min(1, this.grow.t / this.grow.dur);
    const e = 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.04; // ease out with a tiny overshoot
    return this.grow.from + (1 - this.grow.from) * e;
  }

  applyFrameScale() {
    const f = this.frameScale();
    this.frame.scale.set(f, 1, f);
  }

  // 0..1 while the walls are still sliding out (World uses it for effects).
  get growing() {
    return this.grow ? 1 - Math.min(1, this.grow.t / this.grow.dur) : 0;
  }

  update(dt) {
    if (!this.grow) return;
    this.grow.t += dt;
    if (this.grow.t >= this.grow.dur) this.grow = null;
    this.applyFrameScale();
  }

  buildArena() {
    if (this.frame) {
      this.group.remove(this.frame);
      this.frame.traverse((o) => o.geometry && o.geometry.dispose());
    }
    this.frame = new THREE.Group();
    this.group.add(this.frame);
    const s = this.size;
    this.floor.scale.set(s, s, 1);
    this.boardUniforms.uSize.value = s;

    // platform slab with a bevelled trim
    const pw = s + 2.6;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.7, pw), this.platformMat);
    slab.position.y = -0.37;
    slab.receiveShadow = true;
    this.frame.add(slab);
    const trimParts = [];
    for (const [x, z, rot] of [[0, -pw / 2, 0], [0, pw / 2, 0], [-pw / 2, 0, Math.PI / 2], [pw / 2, 0, Math.PI / 2]]) {
      const t = new THREE.BoxGeometry(pw + 0.12, 0.12, 0.12);
      xform(t, { x, y: -0.06, z, ry: rot });
      trimParts.push(t);
    }

    // checkered bumpers
    const h = 0.55;
    const th = 0.4;
    const len = s + th * 2;
    const wallMat = this.wallMat;
    const sides = [
      { x: 0, z: -(this.half + th / 2), rot: 0 },
      { x: 0, z: this.half + th / 2, rot: 0 },
      { x: -(this.half + th / 2), z: 0, rot: Math.PI / 2 },
      { x: this.half + th / 2, z: 0, rot: Math.PI / 2 },
    ];
    const wallParts = [];
    const railParts = [];
    this.rims = [];
    sides.forEach((sd, i) => {
      const wg = new THREE.BoxGeometry(len, h, th);
      xform(wg, { x: sd.x, y: h / 2, z: sd.z, ry: sd.rot });
      wallParts.push(wg);
      const rimMat = this.rimMats[i];
      const rim = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, th + 0.05), rimMat);
      rim.position.set(sd.x, h + 0.035, sd.z);
      rim.rotation.y = sd.rot;
      this.frame.add(rim);
      this.rims.push({ mesh: rim, mat: rimMat, danger: 0 });
      // chrome rail along the inner top edge
      const inward = new THREE.Vector3(-sd.x, 0, -sd.z).normalize().multiplyScalar(th / 2 + 0.06);
      const rail = new THREE.CylinderGeometry(0.06, 0.06, len, 10);
      rail.rotateZ(Math.PI / 2);
      xform(rail, { x: sd.x + inward.x, y: h + 0.12, z: sd.z + inward.z, ry: sd.rot });
      railParts.push(rail);
    });
    const walls = new THREE.Mesh(mergeGeometries(wallParts), wallMat);
    walls.castShadow = true;
    walls.receiveShadow = true;
    this.frame.add(walls);
    const rails = new THREE.Mesh(mergeGeometries(railParts), this.railMat);
    this.frame.add(rails);
    const trims = new THREE.Mesh(mergeGeometries(trimParts), this.trimMat);
    this.frame.add(trims);

    // golden corner posts with glowing caps
    const postParts = [];
    const capParts = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (this.half + th / 2);
        const z = sz * (this.half + th / 2);
        postParts.push(xform(new THREE.CylinderGeometry(0.3, 0.38, 1.0, 24), { x, y: 0.5, z }));
        postParts.push(xform(new THREE.TorusGeometry(0.33, 0.06, 8, 24), { x, y: 0.95, z, rx: Math.PI / 2 }));
        capParts.push(xform(new THREE.SphereGeometry(0.22, 20, 14), { x, y: 1.16, z }));
      }
    }
    const posts = new THREE.Mesh(mergeGeometries(postParts), this.trimMat);
    posts.castShadow = true;
    this.frame.add(posts);
    this.frame.add(new THREE.Mesh(mergeGeometries(capParts), this.capMat));
  }

  buildIsland() {
    const rng = this.rng;
    const segs = 120;

    // grass top: rings from just outside the platform to the rim
    const rings = 7;
    const inner = 8.6; // inside the smallest (17) board's platform
    const pos = [];
    const col = [];
    const idx = [];
    for (let r = 0; r <= rings; r++) {
      for (let i = 0; i <= segs; i++) {
        const th = (i / segs) * Math.PI * 2;
        const R = islandRadius(th);
        const f = r / rings;
        const rad = inner + (R - inner) * f;
        const x = Math.cos(th) * rad;
        const z = Math.sin(th) * rad;
        const bump = f > 0.15 ? fbm(x * 0.15, 0, z * 0.15, 2) * 0.35 * Math.min(1, (f - 0.15) * 3) : 0;
        pos.push(x, GRASS_Y + bump, z);
        const v = 0.85 + fbm(x * 0.3, 1, z * 0.3, 2) * 0.35;
        col.push(v, v, v);
        if (r < rings && i < segs) {
          const a = r * (segs + 1) + i;
          const b = a + segs + 1;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    // overhanging lip
    const lipBase = (rings + 1) * (segs + 1);
    const lip = [
      [0.45, -0.55],
      [0.4, -1.05],
      [0.05, -1.25],
    ];
    for (let l = 0; l < lip.length; l++) {
      for (let i = 0; i <= segs; i++) {
        const th = (i / segs) * Math.PI * 2;
        const R = islandRadius(th) + lip[l][0] + Math.sin(th * 37) * 0.08;
        pos.push(Math.cos(th) * R, GRASS_Y + lip[l][1] - (l === 2 ? Math.abs(Math.sin(th * 23)) * 0.4 : 0), Math.sin(th) * R);
        const v = l === 2 ? 0.55 : 0.75;
        col.push(v, v, v);
      }
    }
    for (let l = -1; l < lip.length - 1; l++) {
      const rowA = l < 0 ? rings * (segs + 1) : lipBase + l * (segs + 1);
      const rowB = lipBase + (l + 1) * (segs + 1);
      for (let i = 0; i < segs; i++) {
        const a = rowA + i;
        const b = rowB + i;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const grassGeo = new THREE.BufferGeometry();
    grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    grassGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    grassGeo.setIndex(idx);
    grassGeo.computeVertexNormals();
    this.grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, color: '#58b13b' });
    const grass = new THREE.Mesh(grassGeo, this.grassMat);
    grass.receiveShadow = true;
    this.group.add(grass);

    // grass tufts scattered over the top
    const tufts = [];
    for (let i = 0; i < 520; i++) {
      const th = rng() * Math.PI * 2;
      const R = islandRadius(th);
      const rad = 10.4 + rng() * (R - 10.8);
      const x = Math.cos(th) * rad;
      const z = Math.sin(th) * rad;
      if (Math.abs(x) < 12 && Math.abs(z) < 12) continue; // clear of the biggest (21) platform
      const n = 3;
      for (let b = 0; b < n; b++) {
        const blade = new THREE.ConeGeometry(0.06, 0.35 + rng() * 0.35, 3, 1);
        xform(blade, { x: x + (rng() - 0.5) * 0.25, y: GRASS_Y + 0.15, z: z + (rng() - 0.5) * 0.25, rx: (rng() - 0.5) * 0.5, rz: (rng() - 0.5) * 0.5 });
        tufts.push(clean(blade, { smoothNormals: false }));
      }
    }
    const tuftGeo = mergeGeometries(tufts.map((g) => {
      const c = new Float32Array(g.attributes.position.count * 3);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = 0.6 + (p.getY(i) - GRASS_Y) * 1.4;
        c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = Math.min(1.3, v);
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.computeVertexNormals();
      return g;
    }));
    this.tufts = new THREE.Mesh(tuftGeo, this.grassMat);
    this.group.add(this.tufts);

    // checkered cliff band
    const cpos = [];
    const cuv = [];
    const cidx = [];
    const hseg = 8;
    for (let r = 0; r <= hseg; r++) {
      const f = r / hseg;
      const y = GRASS_Y - 0.9 + (CLIFF_BOTTOM - GRASS_Y + 0.9) * f;
      for (let i = 0; i <= segs; i++) {
        const th = (i / segs) * Math.PI * 2;
        const R = islandRadius(th) * (1 - f * 0.06) + fbm(Math.cos(th) * 4, y * 0.3, Math.sin(th) * 4, 2) * 0.5;
        cpos.push(Math.cos(th) * R, y, Math.sin(th) * R);
        cuv.push((th * 25.5) / 1.6, (-y) / 1.6);
        if (r < hseg && i < segs) {
          const a = r * (segs + 1) + i;
          const b = a + segs + 1;
          cidx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const cliffGeo = new THREE.BufferGeometry();
    cliffGeo.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
    cliffGeo.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
    cliffGeo.setIndex(cidx);
    cliffGeo.computeVertexNormals();
    this.cliffMat = makeCheckerMaterial(this.checker);
    this.group.add(new THREE.Mesh(cliffGeo, this.cliffMat));

    // rocky underside tapering to a tip
    const under = [];
    const ucol = [];
    const uidx = [];
    const useg = 10;
    for (let r = 0; r <= useg; r++) {
      const f = r / useg;
      const y = CLIFF_BOTTOM + (TIP_Y - CLIFF_BOTTOM) * f;
      for (let i = 0; i <= segs; i++) {
        const th = (i / segs) * Math.PI * 2;
        const taper = Math.pow(1 - f, 0.85);
        const jag = fbm(Math.cos(th) * 3 + f * 2, y * 0.2, Math.sin(th) * 3, 3);
        const R = islandRadius(th) * 0.94 * taper * (1 + jag * 0.35) + 0.2;
        under.push(Math.cos(th) * R, y + jag * 1.5 * f, Math.sin(th) * R);
        const v = (0.9 - f * 0.45) * (0.85 + jag * 0.3);
        ucol.push(v, v, v);
        if (r < useg && i < segs) {
          const a = r * (segs + 1) + i;
          const b = a + segs + 1;
          uidx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const underGeo = new THREE.BufferGeometry();
    underGeo.setAttribute('position', new THREE.Float32BufferAttribute(under, 3));
    underGeo.setAttribute('color', new THREE.Float32BufferAttribute(ucol, 3));
    underGeo.setIndex(uidx);
    underGeo.computeVertexNormals();
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: '#6d5240' });
    this.group.add(new THREE.Mesh(underGeo, this.rockMat));
  }

  // Waterfalls pouring off the rim, merged into one mesh.
  buildWaterfalls(waterfalls) {
    const geos = [];
    for (const th of [-2.2, -1.25, 2.75, 0.35]) {
      const R = islandRadius(th) - 0.4;
      const start = new THREE.Vector3(Math.cos(th) * R, GRASS_Y - 0.05, Math.sin(th) * R);
      geos.push(makeWaterfall(start, new THREE.Vector3(Math.cos(th), 0, Math.sin(th)), 2.6 + this.rng() * 1.4));
    }
    const m = new THREE.Mesh(mergeGeometries(geos), waterfalls.material);
    m.frustumCulled = false;
    this.group.add(m);
    return m;
  }

  apply(p) {
    const b = this.boardUniforms;
    b.uBoardA.value.copy(p.boardA);
    b.uBoardB.value.copy(p.boardB);
    b.uRough.value = p.boardRough;
    b.uGrid.value = p.boardGrid;
    b.uGridColor.value.copy(p.gridColor);
    b.uLines.value = p.boardLines;
    b.uDetail.value = Math.min(1, p.boardRough * 1.1);
    this.checker.uA.value.copy(p.cliffA);
    this.checker.uB.value.copy(p.cliffB);
    this.checker.uEdge.value = p.cliffEdge;
    this.checker.uEdgeColor.value.copy(p.strip);
    this.wallChecker.uA.value.copy(p.wallA);
    this.wallChecker.uB.value.copy(p.wallB);
    this.wallChecker.uEdge.value = p.cliffEdge * 0.5;
    this.wallChecker.uEdgeColor.value.copy(p.strip);
    this.grassMat.color.copy(p.grass);
    this.rockMat.color.copy(p.rock);
    this.platformMat.color.copy(p.wallA);
    this.capMat.emissive.copy(p.strip);
  }

  // Warn on the rims of walls the snake is heading into.
  updateWalls(game, dt, active, stripColor, time) {
    const h = game.head;
    const d = game.lastQueuedDir();
    const s = this.size;
    const dist = [h.z, s - 1 - h.z, h.x, s - 1 - h.x];
    const facing = [d.z < 0, d.z > 0, d.x < 0, d.x > 0];
    if (!this.warn) this.warn = new THREE.Color('#ff3355');
    for (let i = 0; i < 4; i++) {
      const rim = this.rims[i];
      const target = active && facing[i] ? Math.max(0, 1 - dist[i] / 4) : 0;
      rim.danger += (target - rim.danger) * Math.min(1, dt * 10);
      rim.mat.emissive.copy(stripColor).lerp(this.warn, rim.danger);
      rim.mat.emissiveIntensity = 1.3 + rim.danger * (2 + Math.sin(time * 20) * 1.2);
    }
  }
}
