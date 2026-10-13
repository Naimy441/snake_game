import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBoardTexture, makeCheckerTexture } from './textures.js';

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Environment moods the world blends through as the level rises:
// bright morning, golden afternoon, sunset, neon dusk.
const PALETTES = [
  { at: 0, top: '#2f7dff', horizon: '#bfe8ff', sun: '#fff1d6', sunI: 3.2, hemiSky: '#cfe8ff', hemiGround: '#5d7f3c', hemiI: 1.1, water: '#1b8fd8', strip: '#38f6ff' },
  { at: 4, top: '#3d63d8', horizon: '#ffd79e', sun: '#ffcf86', sunI: 3.0, hemiSky: '#ffe2b8', hemiGround: '#6a6a3a', hemiI: 1.0, water: '#2a7ac0', strip: '#42ffd8' },
  { at: 8, top: '#3a2a80', horizon: '#ff7d6b', sun: '#ff9862', sunI: 2.6, hemiSky: '#ffb5a0', hemiGround: '#5a3f4a', hemiI: 0.95, water: '#4a3f99', strip: '#ffd23f' },
  { at: 12, top: '#0f0a38', horizon: '#c0389e', sun: '#ff74c0', sunI: 2.0, hemiSky: '#a080ff', hemiGround: '#2a2050', hemiI: 0.9, water: '#2a1a66', strip: '#ff4fd8' },
];

function colorKey(p, key, out) {
  return out.set(p[key]);
}

export class World {
  constructor({ size, renderer }) {
    this.size = size;
    this.half = size / 2;
    this.scene = new THREE.Scene();
    this.rng = mulberry32(1337);
    this.time = 0;
    this.mood = 0; // smoothed level used for palette blending
    this.tmpA = new THREE.Color();
    this.tmpB = new THREE.Color();

    this.buildSky();
    this.buildLights();
    this.buildBoard(renderer);
    this.buildIsland();
    this.buildScenery();
    this.buildWater();
    this.applyPalette(0);
  }

  toWorld(x, z) {
    const o = (this.size - 1) / 2;
    return { x: x - o, z: z - o };
  }

  buildSky() {
    this.skyUniforms = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0.55, 0.62, 0.38).normalize() },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -1.0, 1.0);
          vec3 col = mix(horizon, top, pow(smoothstep(-0.05, 0.75, h), 0.8));
          col = mix(col, horizon * 0.85, smoothstep(0.0, -0.3, h));
          float sd = max(dot(normalize(vDir), sunDir), 0.0);
          col += sunColor * (pow(sd, 900.0) * 3.0 + pow(sd, 18.0) * 0.35 + pow(sd, 3.0) * 0.08);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#bfe8ff', 60, 260);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#5d7f3c', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 3.2);
    this.sun.position.copy(this.skyUniforms.sunDir.value).multiplyScalar(40);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -15;
    sc.right = 15;
    sc.top = 15;
    sc.bottom = -15;
    sc.near = 5;
    sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  buildBoard(renderer) {
    const s = this.size;
    const boardTex = makeBoardTexture(s, renderer.capabilities.getMaxAnisotropy());
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.88, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floor = floor;

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(s + 1.6, 0.9, s + 1.6),
      new THREE.MeshStandardMaterial({ color: '#d9cfb8', roughness: 0.9 })
    );
    base.position.y = -0.46;
    base.receiveShadow = true;
    this.scene.add(base);

    // Low checkered barrier with a glowing rim on each side. Each rim has its
    // own material so it can warn when the head is close to that wall.
    const checker = makeCheckerTexture('#f4f7ff', '#2346c8', 22);
    const wallMat = new THREE.MeshStandardMaterial({ map: checker, roughness: 0.55, metalness: 0.1 });
    const h = 0.5;
    const th = 0.36;
    const len = s + th * 2;
    this.rims = [];
    const sides = [
      { x: 0, z: -(this.half + th / 2), rot: 0 }, // north
      { x: 0, z: this.half + th / 2, rot: 0 }, // south
      { x: -(this.half + th / 2), z: 0, rot: Math.PI / 2 }, // west
      { x: this.half + th / 2, z: 0, rot: Math.PI / 2 }, // east
    ];
    for (const sd of sides) {
      const wg = new THREE.BoxGeometry(len, h, th);
      const wall = new THREE.Mesh(wg, wallMat);
      wall.position.set(sd.x, h / 2, sd.z);
      wall.rotation.y = sd.rot;
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
      const rimMat = new THREE.MeshStandardMaterial({ color: '#0b1630', emissive: '#38f6ff', emissiveIntensity: 1.1, roughness: 0.3 });
      const rim = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, th + 0.04), rimMat);
      rim.position.set(sd.x, h + 0.04, sd.z);
      rim.rotation.y = sd.rot;
      this.scene.add(rim);
      this.rims.push({ mesh: rim, mat: rimMat, danger: 0 });
    }
    const postMat = new THREE.MeshStandardMaterial({ color: '#ffcf3f', metalness: 0.7, roughness: 0.25 });
    const capMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffd86b', emissiveIntensity: 2 });
    this.capMat = capMat;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.9, 20), postMat);
        p.position.set(sx * (this.half + th / 2), 0.45, sz * (this.half + th / 2));
        p.castShadow = true;
        this.scene.add(p);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), capMat);
        cap.position.set(p.position.x, 1.0, p.position.z);
        this.scene.add(cap);
      }
    }
  }

  buildIsland() {
    const rng = this.rng;
    const top = new THREE.CylinderGeometry(21, 19, 1.2, 48, 1);
    const grass = new THREE.Mesh(top, new THREE.MeshStandardMaterial({ color: '#5cae45', roughness: 1 }));
    grass.position.y = -1.0;
    grass.receiveShadow = true;
    this.scene.add(grass);

    const rock = new THREE.ConeGeometry(19.5, 22, 28, 6, true);
    rock.rotateX(Math.PI);
    const p = rock.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < 10.9) {
        p.setX(i, p.getX(i) * (0.9 + rng() * 0.25));
        p.setZ(i, p.getZ(i) * (0.9 + rng() * 0.25));
        p.setY(i, y + (rng() - 0.5) * 1.2);
      }
    }
    rock.computeVertexNormals();
    const rockMesh = new THREE.Mesh(rock, new THREE.MeshStandardMaterial({ color: '#8a6a52', roughness: 1, flatShading: true }));
    rockMesh.position.y = -12.6;
    this.scene.add(rockMesh);
  }

  // Trees, bushes, rocks, mountains and clouds are merged into a handful of
  // vertex-coloured meshes so the whole backdrop costs only a few draw calls.
  buildScenery() {
    const rng = this.rng;
    const parts = [];
    const tinted = (geo, color) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const c = new THREE.Color(color);
      const arr = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) {
        const v = 0.92 + rng() * 0.16;
        arr[i] = c.r * v;
        arr[i + 1] = c.g * v;
        arr[i + 2] = c.b * v;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      g.deleteAttribute('uv');
      return g;
    };
    const place = (geo, x, y, z, ry = 0, s = 1) => {
      geo.scale(s, s, s);
      geo.rotateY(ry);
      geo.translate(x, y, z);
      return geo;
    };

    const tree = (x, z, s) => {
      const trunk = place(tinted(new THREE.CylinderGeometry(0.12, 0.2, 1.4, 6), '#7a4e2d'), x, -0.4 + 0.7 * s, z, 0, s);
      parts.push(trunk);
      const leafColors = ['#2f9e44', '#40c057', '#2b8a3e', '#69db7c'];
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const leaf = tinted(new THREE.IcosahedronGeometry(0.65 - i * 0.12, 0), leafColors[Math.floor(rng() * 4)]);
        place(leaf, x + (rng() - 0.5) * 0.4 * s, -0.4 + (1.45 + i * 0.45) * s, z + (rng() - 0.5) * 0.4 * s, rng() * 6, s);
        parts.push(leaf);
      }
    };
    const palm = (x, z, s) => {
      const lean = (rng() - 0.5) * 0.5;
      let px = x;
      let py = -0.4;
      for (let i = 0; i < 6; i++) {
        const seg = tinted(new THREE.CylinderGeometry(0.11, 0.14, 0.45, 6), i % 2 ? '#a07040' : '#8a5a32');
        seg.translate(0, 0.225, 0);
        seg.rotateZ(lean * (i / 6));
        seg.scale(s, s, s);
        seg.translate(px, py, z);
        parts.push(seg);
        px += -Math.sin(lean * (i / 6)) * 0.45 * s;
        py += Math.cos(lean * (i / 6)) * 0.45 * s;
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng();
        const frond = tinted(new THREE.ConeGeometry(0.22, 1.5, 4), '#37b24d');
        frond.rotateZ(-Math.PI / 2 - 0.35);
        frond.translate(0.7, -0.1, 0);
        frond.scale(s, s, s);
        frond.rotateY(a);
        frond.translate(px, py, z);
        parts.push(frond);
      }
    };
    const bush = (x, z, s) => {
      const b = tinted(new THREE.IcosahedronGeometry(0.5, 0), rng() > 0.5 ? '#4cae4f' : '#82c91e');
      b.scale(1, 0.6, 1);
      parts.push(place(b, x, -0.35, z, rng() * 6, s));
      if (rng() > 0.6) {
        const f = tinted(new THREE.IcosahedronGeometry(0.1, 0), ['#ff6b9a', '#ffd43b', '#ffffff'][Math.floor(rng() * 3)]);
        parts.push(place(f, x + 0.2 * s, -0.05, z, 0, s));
      }
    };
    const stone = (x, z, s) => {
      const r = tinted(new THREE.DodecahedronGeometry(0.5, 0), '#9aa0a8');
      r.scale(1, 0.6, 1);
      parts.push(place(r, x, -0.35, z, rng() * 6, s));
    };

    // Island ring. Tall things stay on the far side so the overhead camera
    // (south, looking north) always has a clear view of the board.
    for (let i = 0; i < 70; i++) {
      const a = rng() * Math.PI * 2;
      const r = 12.8 + rng() * 6.5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const farSide = z < 3;
      const k = rng();
      if (farSide && k < 0.45) tree(x, z, 0.9 + rng() * 0.8);
      else if (farSide && k < 0.6) palm(x, z, 1.1 + rng() * 0.6);
      else if (k < 0.85) bush(x, z, 0.7 + rng() * 0.8);
      else stone(x, z, 0.6 + rng() * 0.9);
    }
    this.sceneryLevels = parts.length;
    const merged = mergeGeometries(parts, false);
    merged.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    this.props = new THREE.Mesh(merged, mat);
    this.props.castShadow = true;
    this.props.receiveShadow = true;
    this.scene.add(this.props);

    // Distant mountains and floating islets
    const far = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng() * 0.2;
      const r = 150 + rng() * 60;
      const h = 30 + rng() * 55;
      const m = tinted(new THREE.ConeGeometry(18 + rng() * 22, h, 6), rng() > 0.5 ? '#6a7fb8' : '#7d8fc4');
      far.push(place(m, Math.cos(a) * r, h / 2 - 16, Math.sin(a) * r, rng() * 6));
      if (h > 60) {
        const snow = tinted(new THREE.ConeGeometry(7, 12, 6), '#f1f3ff');
        far.push(place(snow, Math.cos(a) * r, h - 16 - 5.5, Math.sin(a) * r, 0));
      }
    }
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2;
      const r = 45 + rng() * 45;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r - 10;
      const y = 4 + rng() * 22;
      const s = 2 + rng() * 4;
      far.push(place(tinted(new THREE.CylinderGeometry(1, 0.95, 0.3, 9), '#56b04a'), x, y, z, 0, s));
      const under = tinted(new THREE.ConeGeometry(0.95, 2.2, 9), '#8a6a52');
      under.rotateX(Math.PI);
      far.push(place(under, x, y - 1.2 * s, z, 0, s));
    }
    const farMesh = new THREE.Mesh(mergeGeometries(far, false), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    farMesh.geometry.computeVertexNormals();
    this.scene.add(farMesh);

    // Clouds
    const cl = [];
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const r = 70 + rng() * 120;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = 28 + rng() * 30;
      for (let j = 0; j < 5; j++) {
        const g = tinted(new THREE.IcosahedronGeometry(3 + rng() * 3, 1), '#ffffff');
        g.scale(1.4, 0.75, 1);
        cl.push(place(g, x + (j - 2) * 4 + rng() * 2, y + rng() * 2, z + rng() * 3, 0, 1));
      }
    }
    this.clouds = new THREE.Mesh(
      mergeGeometries(cl, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.25, flatShading: false })
    );
    this.clouds.geometry.computeVertexNormals();
    this.scene.add(this.clouds);

    // Giant floating hoops: an original landmark that hints at speed.
    const hoopTex = makeCheckerTexture('#ffffff', '#ff4f6d', 40);
    hoopTex.repeat.set(4, 1);
    this.hoops = [];
    const hoopMat = new THREE.MeshStandardMaterial({ map: hoopTex, roughness: 0.4, metalness: 0.2, emissive: '#ff4f6d', emissiveIntensity: 0.15 });
    const spots = [
      [-34, 12, -48, 9],
      [40, 18, -60, 12],
      [-62, 22, 18, 10],
    ];
    for (const [x, y, z, r] of spots) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(r, 0.9, 12, 64), hoopMat);
      h.position.set(x, y, z);
      h.rotation.y = Math.atan2(x, z);
      this.scene.add(h);
      this.hoops.push(h);
    }

    // Floating crystals around the arena
    this.crystals = [];
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: '#9ff3ff',
      emissive: '#36d6ff',
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.1,
      clearcoat: 1,
      flatShading: true,
    });
    this.crystalMat = crystalMat;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), crystalMat);
      c.scale.set(0.7, 1.4, 0.7);
      c.position.set(Math.cos(a) * 16, 3 + (i % 3), Math.sin(a) * 16 - (Math.sin(a) > 0.4 ? 0 : 0));
      c.userData.base = c.position.y;
      c.userData.phase = rng() * 6;
      if (c.position.z > 6) c.position.y += 2.5; // keep the southern ones above the overhead sightline
      c.userData.base = c.position.y;
      this.scene.add(c);
      this.crystals.push(c);
    }
  }

  buildWater() {
    this.waterUniforms = {
      time: { value: 0 },
      deep: { value: new THREE.Color('#0d4f8b') },
      shallow: { value: new THREE.Color('#1b8fd8') },
      horizon: { value: new THREE.Color('#bfe8ff') },
      sunDir: this.skyUniforms.sunDir,
      sunColor: this.skyUniforms.sunColor,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vWorld;
        void main(){
          vec2 p = vWorld.xz * 0.05;
          float w = sin(p.x * 3.0 + time * 0.8) * 0.5 + sin(p.y * 4.0 - time * 0.6) * 0.5 + sin((p.x + p.y) * 7.0 + time * 1.3) * 0.25;
          vec3 n = normalize(vec3(cos(p.x * 3.0 + time * 0.8) * 0.12, 1.0, cos(p.y * 4.0 - time * 0.6) * 0.12));
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 col = mix(deep, shallow, 0.5 + w * 0.2);
          col = mix(col, horizon, fres * 0.7);
          vec3 h = normalize(sunDir + v);
          col += sunColor * pow(max(dot(n, h), 0.0), 220.0) * 2.0;
          float d = length(vWorld.xz - cameraPosition.xz);
          col = mix(col, horizon, smoothstep(80.0, 330.0, d));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1), mat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -16;
    this.scene.add(water);
  }

  applyPalette(level) {
    let a = PALETTES[0];
    let b = PALETTES[PALETTES.length - 1];
    for (let i = 0; i < PALETTES.length - 1; i++) {
      if (level >= PALETTES[i].at && level <= PALETTES[i + 1].at) {
        a = PALETTES[i];
        b = PALETTES[i + 1];
        break;
      }
    }
    const f = b.at === a.at ? 0 : Math.min(1, Math.max(0, (level - a.at) / (b.at - a.at)));
    const mix = (key, target) => target.copy(colorKey(a, key, this.tmpA)).lerp(colorKey(b, key, this.tmpB), f);
    mix('top', this.skyUniforms.top.value);
    mix('horizon', this.skyUniforms.horizon.value);
    mix('sun', this.skyUniforms.sunColor.value);
    mix('sun', this.sun.color);
    mix('hemiSky', this.hemi.color);
    mix('hemiGround', this.hemi.groundColor);
    mix('horizon', this.scene.fog.color);
    mix('horizon', this.waterUniforms.horizon.value);
    mix('water', this.waterUniforms.shallow.value);
    this.waterUniforms.deep.value.copy(this.waterUniforms.shallow.value).multiplyScalar(0.45);
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * f;
    this.hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * f;
    this.stripColor = mix('strip', this.stripColor || new THREE.Color());
  }

  setShadowQuality(q) {
    const size = q === 'high' ? 2048 : 1024;
    this.sun.castShadow = q !== 'low';
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.props.castShadow = q === 'high';
  }

  // Warn on the rims of walls the snake is heading into.
  updateWalls(game, dt, active) {
    const h = game.head;
    const d = game.lastQueuedDir();
    const s = this.size;
    const dist = [h.z, s - 1 - h.z, h.x, s - 1 - h.x];
    const facing = [d.z < 0, d.z > 0, d.x < 0, d.x > 0];
    const warn = new THREE.Color('#ff3355');
    for (let i = 0; i < 4; i++) {
      const rim = this.rims[i];
      const target = active && facing[i] ? Math.max(0, 1 - dist[i] / 4) : 0;
      rim.danger += (target - rim.danger) * Math.min(1, dt * 10);
      rim.mat.emissive.copy(this.stripColor).lerp(warn, rim.danger);
      rim.mat.emissiveIntensity = 1.1 + rim.danger * (2 + Math.sin(this.time * 20) * 1.2);
    }
  }

  update(dt, level, reduceMotion) {
    this.time += dt;
    this.mood += (level - this.mood) * Math.min(1, dt * 0.8);
    this.applyPalette(this.mood);
    this.waterUniforms.time.value = this.time;
    const m = reduceMotion ? 0.3 : 1;
    this.clouds.rotation.y += dt * 0.004 * m;
    for (const h of this.hoops) h.rotation.z += dt * 0.15 * m;
    for (const c of this.crystals) {
      c.position.y = c.userData.base + Math.sin(this.time * 1.2 + c.userData.phase) * 0.35 * m;
      c.rotation.y += dt * 0.8 * m;
    }
  }
}
