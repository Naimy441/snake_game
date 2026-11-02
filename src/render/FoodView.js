import * as THREE from 'three';
import { PRISM_LIFETIME_MS } from '../game/SnakeGame.js';
import { makeDigitTexture } from './textures.js';

const beamVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const beamFS = `uniform vec3 color; uniform float opacity; varying vec2 vUv;
  void main(){ float a = (1.0 - vUv.y) * (1.0 - vUv.y) * opacity; gl_FragColor = vec4(color * a * 1.6, a); }`;

function makeBeam(color, height, radius = 0.16) {
  const geo = new THREE.CylinderGeometry(radius, radius * 1.8, height, 14, 1, true);
  geo.translate(0, height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0.55 } },
    vertexShader: beamVS,
    fragmentShader: beamFS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

// Flat additive glow on the floor. Replaces real point lights, which would
// change the scene's light count (and force shader recompiles) as food
// appears and disappears.
function floorGlow(tex, color, size) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 2;
  return m;
}

function glowSprite(tex, color, scale, opacity = 0.5) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(scale);
  return s;
}

// A faceted ruby apple: lathe-turned body with dimples, a stem and a
// crystal leaf. Flat shading plus the environment map makes it sparkle.
function makeCrystalApple() {
  const g = new THREE.Group();
  const prof = [
    [0.001, -0.25], [0.07, -0.275], [0.17, -0.255], [0.255, -0.18], [0.3, -0.06], [0.305, 0.06],
    [0.28, 0.16], [0.215, 0.235], [0.12, 0.265], [0.055, 0.225], [0.001, 0.2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(prof, 11),
    new THREE.MeshStandardMaterial({
      color: '#ff1c3c', emissive: '#c0001e', emissiveIntensity: 0.55, roughness: 0.06, metalness: 0.3,
      flatShading: true, envMapIntensity: 2.2,
    })
  );
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.026, 0.16, 6),
    new THREE.MeshStandardMaterial({ color: '#5a3418', roughness: 0.6 })
  );
  stem.position.set(0.01, 0.27, 0);
  stem.rotation.z = -0.25;
  const leaf = new THREE.Mesh(
    new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: '#36ff9a', emissive: '#0a9a4a', emissiveIntensity: 0.6, roughness: 0.08, metalness: 0.2, flatShading: true, envMapIntensity: 2 })
  );
  leaf.scale.set(0.13, 0.022, 0.065);
  leaf.position.set(0.1, 0.3, 0);
  leaf.rotation.z = 0.45;
  g.add(body, stem, leaf);
  g.scale.setScalar(1.15);
  return g;
}

// One collectible: orb (crystal apple) or prism.
class Pickup {
  constructor(kind, glowTex) {
    this.kind = kind;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.cell = null;
    this.appear = 0;
    this.eaten = null;
    const isOrb = kind === 'orb';
    if (isOrb) {
      this.core = makeCrystalApple();
      // faint sparkle ring that pulses around the apple
      this.ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.012, 6, 48),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb0c0').multiplyScalar(2), transparent: true, opacity: 0.0 })
      );
    } else {
      this.core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34, 0),
        new THREE.MeshStandardMaterial({ color: '#f3d9ff', emissive: '#9d4edd', emissiveIntensity: 1.4, roughness: 0.08, metalness: 0.35, flatShading: true, envMapIntensity: 1.5 })
      );
      // countdown arc, revealed segment by segment through the draw range
      this.ring = new THREE.Mesh(
        new THREE.RingGeometry(0.44, 0.52, 48, 1, Math.PI / 2, Math.PI * 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#e0aaff').multiplyScalar(1.5), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
      );
      this.ring.rotation.x = -Math.PI / 2;
    }
    this.core.traverse((o) => (o.castShadow = true));
    this.body = new THREE.Group();
    this.body.add(this.core);
    this.body.add(this.ring);
    this.group.add(this.body);
    this.glow = glowSprite(glowTex, isOrb ? '#ff4d6d' : '#d9a3ff', 1.5, 0.45);
    this.body.add(this.glow);
    this.floor = floorGlow(glowTex, isOrb ? '#ff2a4a' : '#c77dff', 1.9);
    this.group.add(this.floor);
    this.beamH = isOrb ? 7 : 10;
    this.beam = makeBeam(isOrb ? '#ff3355' : '#c77dff', this.beamH);
    this.group.add(this.beam);
  }

  place(cell, pos) {
    this.cell = cell;
    this.slide = null;
    this.group.position.set(pos.x, pos.y || 0, pos.z);
    this.group.visible = true;
    this.appear = 0;
    this.eaten = null;
  }

  hide() {
    this.cell = null;
    this.group.visible = false;
    this.eaten = null;
  }

  update(dt, time, opts) {
    if (!this.group.visible) return;
    const rm = opts.reduceMotion ? 0.35 : 1;
    this.appear = Math.min(1, this.appear + dt * 3);
    const pop = 1 - Math.pow(1 - this.appear, 3);
    let scale = pop * (1 + 0.06 * Math.sin(time * 5) * rm);
    const y = 0.48 + Math.sin(time * 2.6) * 0.08 * rm;
    if (this.eaten) {
      this.eaten.t += dt / this.eaten.duration;
      const e = Math.min(1, this.eaten.t);
      scale *= 1 - e;
      this.group.position.lerp(this.eaten.towards, Math.min(1, dt * 14));
      if (e >= 1) this.hide();
    }
    if (this.slide && !this.eaten) this.group.position.lerp(this.slide, Math.min(1, dt * 16));
    this.body.position.y = y;
    this.body.scale.setScalar(Math.max(0.001, scale));
    if (this.kind === 'orb') {
      this.core.rotation.y += dt * 2.6 * (opts.reduceMotion ? 0.4 : 1);
      this.core.rotation.z = Math.sin(time * 1.7) * 0.12 * rm;
      const ring = (time * 0.9) % 1;
      this.ring.scale.setScalar(0.6 + ring * 0.9);
      this.ring.rotation.x = Math.PI / 2;
      this.ring.material.opacity = (1 - ring) * 0.5;
    } else {
      this.core.rotation.y += dt * 1.8;
      this.core.rotation.x += dt * 0.7;
    }
    this.beam.material.uniforms.opacity.value = (opts.beam ? 0.34 : 0.14) * pop;
    this.beam.visible = scale > 0.01;
    this.floor.material.opacity = 0.75 * pop * (0.85 + 0.15 * Math.sin(time * 4));
    // In the sky the beam drops to the floor of the box instead, ending in a
    // glowing marker, so the pickup's altitude reads at a glance.
    if (opts.floorY != null) {
      const drop = Math.max(0.05, this.group.position.y + 0.3 - opts.floorY);
      this.beam.scale.y = -drop / this.beamH;
      this.beam.position.y = 0.3;
      this.floor.position.y = opts.floorY - this.group.position.y + 0.03;
      this.beam.material.uniforms.opacity.value = (opts.beam ? 0.5 : 0.36) * pop;
    } else {
      this.beam.scale.y = 1;
      this.beam.position.y = 0;
      this.floor.position.y = 0.03;
    }
  }
}

// Numbered orbs of the active chain, joined by dotted guide paths.
class ChainView {
  constructor(glowTex) {
    this.group = new THREE.Group();
    this.links = [];
    this.digits = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.22, 2),
        new THREE.MeshStandardMaterial({ color: '#b8fbff', emissive: '#18c8ff', emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.2 })
      );
      core.castShadow = true;
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.34, 1),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#38f6ff').multiplyScalar(1.4), wireframe: true, transparent: true, opacity: 0.6 })
      );
      const digit = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeDigitTexture(String(i + 1)), transparent: true, depthWrite: false, depthTest: false }));
      digit.scale.setScalar(0.62);
      digit.position.y = 0.78;
      digit.renderOrder = 10;
      const fg = floorGlow(glowTex, '#18c8ff', 1.5);
      fg.position.y = 0.03 - 0.5;
      g.add(core, shell, digit, fg);
      g.visible = false;
      g.userData = { core, shell, digit, fg, pop: 0, gone: null };
      this.group.add(g);
      this.links.push(g);
    }
    const dotGeo = new THREE.SphereGeometry(0.06, 8, 6);
    this.dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#7ff8ff').multiplyScalar(1.6), transparent: true, opacity: 0.9 }), 16);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.group.add(this.dots);
    this.chainId = null;
    this.tmpM = new THREE.Matrix4();
  }

  sync(game, toWorld) {
    const ch = game.chain;
    if (!ch) {
      for (const l of this.links) if (l.visible && !l.userData.gone) l.userData.gone = { t: 0 };
      this.dots.count = 0;
      this.chainId = null;
      return;
    }
    if (ch.id !== this.chainId) {
      this.chainId = ch.id;
      ch.links.forEach((c, i) => {
        const l = this.links[i];
        l.visible = true;
        l.userData.pop = -i * 0.12;
        l.userData.gone = null;
      });
      for (let i = ch.links.length; i < this.links.length; i++) this.links[i].visible = false;
    }
    // placed every sync: links rise with the board at lift-off
    ch.links.forEach((c, i) => {
      const l = this.links[i];
      const w = toWorld(c.x, c.z, c.y);
      l.position.x = w.x;
      l.position.z = w.z;
      l.userData.baseY = w.y || 0;
      l.userData.fg.visible = !game.flying;
    });
    for (let i = 0; i < ch.links.length; i++) {
      const l = this.links[i];
      if (i < ch.next && l.visible && !l.userData.gone) l.userData.gone = { t: 0, eaten: true };
    }
    // dots between remaining links
    let k = 0;
    for (let i = Math.max(ch.next, 0); i < ch.links.length - 1; i++) {
      const la = ch.links[i];
      const lb = ch.links[i + 1];
      const a = toWorld(la.x, la.z, la.y);
      const b = toWorld(lb.x, lb.z, lb.y);
      // dots run along the board, or straight between orbs in the sky
      const ya = game.flying ? (a.y || 0) + 0.5 : 0.12;
      const yb = game.flying ? (b.y || 0) + 0.5 : 0.12;
      for (let d = 1; d <= 3 && k < 16; d++) {
        const t = d / 4;
        this.tmpM.makeTranslation(a.x + (b.x - a.x) * t, ya + (yb - ya) * t, a.z + (b.z - a.z) * t);
        this.dots.setMatrixAt(k++, this.tmpM);
      }
    }
    this.dots.count = k;
    this.dots.instanceMatrix.needsUpdate = true;
    this.next = ch.next;
    this.remaining = (ch.expires - game.time) / 1000;
  }

  update(dt, time, rm) {
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      if (!l.visible) continue;
      const u = l.userData;
      u.pop = Math.min(1, u.pop + dt * 3);
      const pop = Math.max(0, u.pop);
      const ease = 1 - Math.pow(1 - pop, 3);
      const target = i === this.next;
      let s = ease * (target ? 1.25 + 0.12 * Math.sin(time * 8) : 0.85);
      if (u.gone) {
        u.gone.t += dt / (u.gone.eaten ? 0.18 : 0.4);
        s *= Math.max(0, 1 - u.gone.t);
        if (u.gone.t >= 1) {
          l.visible = false;
          u.gone = null;
          continue;
        }
      }
      l.scale.setScalar(Math.max(0.001, s));
      l.position.y = (u.baseY || 0) + 0.5 + Math.sin(time * 3 + i) * 0.06 * (rm ? 0.3 : 1);
      u.core.rotation.y += dt * 2;
      u.shell.rotation.y -= dt * 1.2;
      u.shell.rotation.x += dt * 0.6;
      u.digit.material.opacity = target ? 1 : 0.55;
      const blink = this.remaining < 3 ? (Math.floor(time * 8) % 2 ? 0.3 : 1) : 1;
      u.core.material.emissiveIntensity = (target ? 2.4 : 1.1) * blink;
    }
    this.dots.material.opacity = 0.55 + 0.35 * Math.sin(time * 6);
  }
}

// The golden mouse: hops cell to cell and runs from the snake.
class PreyView {
  constructor(glowTex) {
    this.group = new THREE.Group();
    this.group.visible = false;
    const fur = new THREE.MeshStandardMaterial({ color: '#f6e2b0', roughness: 0.65, emissive: '#ffb02e', emissiveIntensity: 0.35 });
    const pink = new THREE.MeshStandardMaterial({ color: '#ff9aa8', roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: '#0a0a10', roughness: 0.2 });
    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), fur);
    torso.scale.set(0.2, 0.17, 0.29);
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fur);
    head.scale.set(0.13, 0.12, 0.16);
    head.position.set(0, 0.06, 0.27);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), pink);
    nose.position.set(0, 0.06, 0.43);
    this.ears = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CircleGeometry(0.08, 14), pink);
      ear.position.set(s * 0.09, 0.19, 0.24);
      ear.rotation.y = s * 0.3;
      ear.material.side = THREE.DoubleSide;
      this.ears.push(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), dark);
      eye.position.set(s * 0.065, 0.11, 0.37);
      this.body.add(ear, eye);
    }
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -0.26),
      new THREE.Vector3(0, 0.05, -0.42),
      new THREE.Vector3(0.06, 0.16, -0.52),
      new THREE.Vector3(0.02, 0.28, -0.5),
    ]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 12, 0.018, 5, false), pink);
    this.tail = tail;
    this.body.add(torso, head, nose, tail);
    this.body.position.y = 0.18;
    this.group.add(this.body);
    this.halo = glowSprite(glowTex, '#ffd36a', 1.1, 0.35);
    this.halo.position.y = 0.25;
    this.group.add(this.halo);
    this.floor = floorGlow(glowTex, '#ffb020', 1.3);
    this.group.add(this.floor);
    this.beam = makeBeam('#ffd36a', 6, 0.1);
    this.group.add(this.beam);
    this.id = null;
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.hop = 1;
    this.hopDur = 0.18;
    this.yaw = 0;
    this.targetYaw = 0;
    this.appear = 0;
    this.leaving = null;
  }

  sync(game, toWorld) {
    const p = game.prey;
    if (!p) {
      if (this.group.visible && !this.leaving) this.leaving = { t: 0 };
      this.id = null;
      return;
    }
    const w = toWorld(p.x, p.z);
    if (p.id !== this.id) {
      this.id = p.id;
      this.group.visible = true;
      this.leaving = null;
      this.appear = 0;
      this.from.set(w.x, 0, w.z);
      this.to.copy(this.from);
      this.hop = 1;
      this.group.position.copy(this.from);
      this.cell = { x: p.x, z: p.z };
    } else if (p.x !== this.cell.x || p.z !== this.cell.z) {
      this.from.copy(this.group.position);
      this.to.set(w.x, 0, w.z);
      this.targetYaw = Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z);
      this.hop = 0;
      this.hopDur = Math.min(0.2, game.preyMoveMs() / 1000);
      this.cell = { x: p.x, z: p.z };
    }
    this.fleeing = p.fleeing;
  }

  // caught: shrink into the snake's mouth; escaped: burrow away
  update(dt, time, rm) {
    if (!this.group.visible) return;
    this.appear = Math.min(1, this.appear + dt * 3);
    let s = 1 - Math.pow(1 - this.appear, 3);
    if (this.hop < 1) {
      this.hop = Math.min(1, this.hop + dt / this.hopDur);
      this.group.position.lerpVectors(this.from, this.to, this.hop);
    }
    const arc = Math.sin(this.hop * Math.PI) * 0.22;
    let d = this.targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 18);
    this.body.rotation.y = this.yaw;
    this.body.position.y = 0.18 + arc + (this.hop >= 1 ? Math.abs(Math.sin(time * (this.fleeing ? 14 : 5))) * 0.025 : 0);
    const wig = Math.sin(time * (this.fleeing ? 30 : 8)) * (rm ? 0.1 : 0.3);
    this.ears[0].rotation.z = wig;
    this.ears[1].rotation.z = -wig;
    this.tail.rotation.y = Math.sin(time * 6) * 0.4;
    if (this.leaving) {
      this.leaving.t += dt / 0.35;
      s *= Math.max(0, 1 - this.leaving.t);
      this.body.position.y -= this.leaving.t * 0.3;
      if (this.leaving.t >= 1) {
        this.group.visible = false;
        this.leaving = null;
        return;
      }
    }
    this.group.scale.setScalar(Math.max(0.001, s));
    this.halo.material.opacity = 0.3 + 0.12 * Math.sin(time * 5);
    this.beam.material.uniforms.opacity.value = 0.22;
  }
}

export const POWER_COLORS = { shield: '#4d9bff', magnet: '#ff4fd8', chill: '#8ff3ff' };

const BUBBLE_VS = `varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const BUBBLE_FS = `uniform vec3 uColor; uniform float uAmt; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); float a = (0.06 + f * 0.9) * uAmt; gl_FragColor = vec4(uColor * a * 1.8, a); }`;

// The three power-up icons, built standing up (they spin about y).
function powerIcon(kind) {
  const g = new THREE.Group();
  const col = new THREE.Color(POWER_COLORS[kind]);
  const glow = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.22, metalness: 0.35, envMapIntensity: 1.5 });
  if (kind === 'shield') {
    // a heater shield with a bright star on its face
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.25);
    sh.lineTo(0.21, 0.18);
    sh.lineTo(0.19, -0.02);
    sh.quadraticCurveTo(0.13, -0.19, 0, -0.27);
    sh.quadraticCurveTo(-0.13, -0.19, -0.19, -0.02);
    sh.lineTo(-0.21, 0.18);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelSize: 0.022, bevelThickness: 0.022, bevelSegments: 2 });
    geo.center();
    g.add(new THREE.Mesh(geo, glow(col, 0.7)));
    for (const z of [-0.06, 0.06]) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), glow(new THREE.Color('#ffffff'), 1.3));
      star.position.z = z;
      star.scale.set(1, 1.35, 0.35);
      g.add(star);
    }
  } else if (kind === 'magnet') {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.062, 12, 28, Math.PI), glow(col, 0.65));
    arc.rotation.z = Math.PI;
    g.add(arc);
    for (const sx of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.12, 14), glow(new THREE.Color('#eef3fb'), 0.35));
      tip.position.set(sx * 0.15, 0.06, 0);
      g.add(tip);
    }
    g.position.y = -0.02;
  } else {
    // chill: a snowflake
    const mat = glow(col, 1.2);
    const armGeo = new THREE.BoxGeometry(0.032, 0.26, 0.032);
    const twig = new THREE.BoxGeometry(0.024, 0.085, 0.024);
    for (let i = 0; i < 6; i++) {
      const arm = new THREE.Group();
      const a = new THREE.Mesh(armGeo, mat);
      a.position.y = 0.13;
      arm.add(a);
      for (const sx of [-1, 1]) {
        const b = new THREE.Mesh(twig, mat);
        b.position.set(sx * 0.032, 0.18, 0);
        b.rotation.z = -sx * 0.85;
        arm.add(b);
      }
      arm.rotation.z = (i / 6) * Math.PI * 2;
      g.add(arm);
    }
  }
  g.traverse((o) => (o.castShadow = !!o.isMesh));
  return g;
}

// The power-up on the board: a spinning icon in a glowing bubble that
// blinks before it fades.
class PowerView {
  constructor(glowTex) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.body = new THREE.Group();
    this.icons = {};
    for (const k of Object.keys(POWER_COLORS)) {
      this.icons[k] = powerIcon(k);
      this.icons[k].visible = false;
      this.body.add(this.icons[k]);
    }
    this.bu = { uColor: { value: new THREE.Color() }, uAmt: { value: 1 } };
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 28, 18),
      new THREE.ShaderMaterial({ uniforms: this.bu, vertexShader: BUBBLE_VS, fragmentShader: BUBBLE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.body.add(this.bubble);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.016, 6, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.body.add(this.ring);
    this.group.add(this.body);
    this.floor = floorGlow(glowTex, '#ffffff', 1.7);
    this.group.add(this.floor);
    this.beamH = 8;
    this.beam = makeBeam('#ffffff', this.beamH, 0.13);
    this.group.add(this.beam);
    this.id = null;
    this.appear = 0;
    this.leaving = null;
    this.target = new THREE.Vector3();
  }

  sync(game, toWorld) {
    const p = game.power;
    if (!p) {
      if (this.group.visible && !this.leaving) this.leaving = { t: 0 };
      this.id = null;
      return;
    }
    const w = toWorld(p.x, p.z, p.y);
    if (p.id !== this.id) {
      this.id = p.id;
      this.kind = p.kind;
      for (const [k, ic] of Object.entries(this.icons)) ic.visible = k === p.kind;
      const c = new THREE.Color(POWER_COLORS[p.kind]);
      this.bu.uColor.value.copy(c);
      this.ring.material.color.copy(c).multiplyScalar(1.6);
      this.floor.material.color.copy(c).multiplyScalar(1.4);
      this.beam.material.uniforms.color.value.copy(c);
      this.group.visible = true;
      this.leaving = null;
      this.appear = 0;
      this.group.position.set(w.x, w.y || 0, w.z);
    }
    this.target.set(w.x, w.y || 0, w.z);
    this.left = (p.expires - game.time) / 1000;
  }

  update(dt, time, opts) {
    if (!this.group.visible) return;
    const rm = opts.reduceMotion ? 0.35 : 1;
    this.appear = Math.min(1, this.appear + dt * 2.5);
    let s = 1 - Math.pow(1 - this.appear, 3) + Math.sin(this.appear * Math.PI) * 0.3;
    if (this.leaving) {
      this.leaving.t += dt / 0.3;
      s *= Math.max(0, 1 - this.leaving.t);
      if (this.leaving.t >= 1) {
        this.group.visible = false;
        this.leaving = null;
        return;
      }
    }
    this.group.position.lerp(this.target, Math.min(1, dt * 12));
    this.body.position.y = 0.55 + Math.sin(time * 2.4) * 0.08 * rm;
    this.body.scale.setScalar(Math.max(0.001, s));
    const ic = this.icons[this.kind];
    if (ic) ic.rotation.y = time * 2.2 * (opts.reduceMotion ? 0.4 : 1);
    this.ring.rotation.set(Math.PI / 2 + Math.sin(time * 1.6) * 0.35, 0, time * 1.4);
    // blink for the last couple of seconds
    const blink = this.left < 2.5 && !this.leaving ? (Math.floor(time * 10) % 2 ? 0.25 : 1) : 1;
    this.bu.uAmt.value = blink;
    ic && (ic.visible = blink > 0.5);
    this.floor.material.opacity = 0.7 * s;
    this.floor.position.y = opts.floorY != null ? opts.floorY - this.group.position.y + 0.03 : 0.03;
    this.beam.material.uniforms.opacity.value = (opts.beam ? 0.3 : 0.12) * s;
    if (opts.floorY != null) {
      const drop = Math.max(0.05, this.group.position.y + 0.3 - opts.floorY);
      this.beam.scale.y = -drop / this.beamH;
      this.beam.position.y = 0.3;
    } else {
      this.beam.scale.y = 1;
      this.beam.position.y = 0;
    }
  }
}

export class FoodView {
  constructor(glowTex) {
    this.group = new THREE.Group();
    this.orb = new Pickup('orb', glowTex);
    this.prism = new Pickup('prism', glowTex);
    this.chain = new ChainView(glowTex);
    this.prey = new PreyView(glowTex);
    this.power = new PowerView(glowTex);
    this.group.add(this.orb.group, this.prism.group, this.chain.group, this.prey.group, this.power.group);
  }

  // Keep meshes in sync with game state. A food that was just eaten keeps its
  // mesh until the visual head reaches it (see markEaten).
  sync(game, toWorld) {
    this.syncOne(this.orb, game.food, toWorld);
    this.syncOne(this.prism, game.bonus, toWorld);
    if (this.prism.group.visible && game.bonus && !this.prism.eaten) {
      const left = Math.max(0, (game.bonus.expires - game.time) / PRISM_LIFETIME_MS);
      this.prism.ring.geometry.setDrawRange(0, Math.max(1, Math.ceil(48 * left)) * 6);
      this.prism.blink = left < 0.25;
    }
    this.chain.sync(game, toWorld);
    this.prey.sync(game, toWorld);
    this.power.sync(game, toWorld);
  }

  syncOne(p, food, toWorld) {
    if (p.eaten) return; // a new piece is placed once the old one is gone
    if (!food) {
      if (p.group.visible) p.hide();
      return;
    }
    if (!p.cell || p.cell.id !== food.id) p.place(food, toWorld(food.x, food.z, food.y));
    else if (!p.eaten) {
      // lift-off moves it up; the magnet slides it along
      const w = toWorld(food.x, food.z, food.y);
      p.slide = p.slide || new THREE.Vector3();
      p.slide.set(w.x, w.y || 0, w.z);
    }
  }

  markEaten(kind, towards, duration) {
    const p = kind === 'orb' ? this.orb : this.prism;
    if (!p.group.visible) return;
    p.eaten = { t: 0, towards: towards.clone(), duration };
  }

  hideAll() {
    this.orb.hide();
    this.prism.hide();
    for (const l of this.chain.links) l.visible = false;
    this.chain.dots.count = 0;
    this.chain.chainId = null;
    this.prey.group.visible = false;
    this.prey.id = null;
    this.prey.leaving = null;
    this.power.group.visible = false;
    this.power.id = null;
    this.power.leaving = null;
  }

  update(dt, time, opts) {
    this.orb.update(dt, time, opts);
    this.prism.update(dt, time, opts);
    if (this.prism.blink && this.prism.group.visible && !this.prism.eaten) {
      this.prism.body.visible = Math.floor(time * 10) % 2 === 0;
    } else {
      this.prism.body.visible = true;
    }
    this.chain.update(dt, time, opts.reduceMotion);
    this.prey.update(dt, time, opts.reduceMotion);
    this.power.update(dt, time, opts);
  }
}
