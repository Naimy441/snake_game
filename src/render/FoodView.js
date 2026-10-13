import * as THREE from 'three';

const beamVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const beamFS = `uniform vec3 color; uniform float opacity; varying vec2 vUv;
  void main(){ float a = (1.0 - vUv.y) * (1.0 - vUv.y) * opacity; gl_FragColor = vec4(color * a, a); }`;

function makeBeam(color, height) {
  const geo = new THREE.CylinderGeometry(0.16, 0.3, height, 16, 1, true);
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

// One collectible: the mesh, its light beam and a glow sprite.
class Pickup {
  constructor(kind, glowTex) {
    this.kind = kind;
    this.group = new THREE.Group();
    this.visible = false;
    this.group.visible = false;
    this.cell = null;
    this.appear = 0;
    this.eaten = null; // { t, towards: Vector3 }
    const isOrb = kind === 'orb';
    const color = isOrb ? '#ffb020' : '#c77dff';
    this.color = new THREE.Color(isOrb ? '#ffcf4a' : '#e0aaff');

    if (isOrb) {
      this.core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.26, 3),
        new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ff9f1c', emissiveIntensity: 1.1, roughness: 0.2, metalness: 0.3 })
      );
      this.ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.035, 8, 40),
        new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffcf4a', emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.2 })
      );
    } else {
      this.core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34, 0),
        new THREE.MeshPhysicalMaterial({
          color: '#f3d9ff',
          emissive: '#9d4edd',
          emissiveIntensity: 1.3,
          roughness: 0.05,
          metalness: 0.2,
          iridescence: 1,
          iridescenceIOR: 1.6,
          clearcoat: 1,
          flatShading: true,
        })
      );
      this.ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.5, 48, 1, 0, Math.PI * 2),
        new THREE.MeshBasicMaterial({ color: '#e0aaff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
      );
      this.ring.rotation.x = -Math.PI / 2;
    }
    this.core.castShadow = true;
    this.body = new THREE.Group();
    this.body.add(this.core);
    this.body.add(this.ring);
    this.group.add(this.body);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    glow.scale.setScalar(1.6);
    this.body.add(glow);
    this.glow = glow;

    this.beam = makeBeam(color, isOrb ? 7 : 10);
    this.group.add(this.beam);

    this.light = new THREE.PointLight(color, isOrb ? 6 : 8, 4.5, 2);
    this.light.position.y = 0.6;
    this.group.add(this.light);
  }

  place(cell, pos) {
    this.cell = cell;
    this.group.position.set(pos.x, 0, pos.z);
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
    let scale = pop * (1 + 0.08 * Math.sin(time * 5) * rm);
    let y = 0.45 + Math.sin(time * 2.6) * 0.08 * rm;
    if (this.eaten) {
      this.eaten.t += dt / this.eaten.duration;
      const e = Math.min(1, this.eaten.t);
      scale *= 1 - e;
      this.group.position.lerp(this.eaten.towards, Math.min(1, dt * 14));
      if (e >= 1) this.hide();
    }
    this.body.position.y = y;
    this.body.scale.setScalar(Math.max(0.001, scale));
    this.core.rotation.y += dt * 1.8;
    this.core.rotation.x += dt * 0.7;
    if (this.kind === 'orb') {
      this.ring.rotation.x = Math.PI / 2 + Math.sin(time * 1.3) * 0.4;
      this.ring.rotation.y += dt * 2.2;
    }
    this.beam.material.uniforms.opacity.value = (opts.beam ? 0.32 : 0.16) * pop;
    this.beam.visible = scale > 0.01;
    this.light.visible = opts.lights;
    this.light.intensity = (this.kind === 'orb' ? 6 : 8) * pop;
  }
}

export class FoodView {
  constructor(glowTex) {
    this.group = new THREE.Group();
    this.orb = new Pickup('orb', glowTex);
    this.prism = new Pickup('prism', glowTex);
    this.group.add(this.orb.group, this.prism.group);
    this.pendingOrb = null;
  }

  // Keep meshes in sync with game state. A food that was just eaten keeps its
  // mesh until the visual head reaches it (see markEaten).
  sync(game, toWorld) {
    this.syncOne(this.orb, game.food, toWorld);
    this.syncOne(this.prism, game.bonus, toWorld);
    if (this.prism.group.visible && game.bonus && !this.prism.eaten) {
      const left = Math.max(0, (game.bonus.expires - game.time) / 9000);
      if (Math.abs(left - (this.prism.left ?? -1)) > 0.01) {
        this.prism.left = left;
        this.prism.ring.geometry.dispose();
        this.prism.ring.geometry = new THREE.RingGeometry(0.42, 0.5, 48, 1, Math.PI / 2, Math.PI * 2 * Math.max(0.001, left));
      }
      this.prism.blink = left < 0.25;
    }
  }

  syncOne(p, food, toWorld) {
    if (p.eaten) {
      // A new piece may already exist; it gets placed once the old one is gone.
      return;
    }
    if (!food) {
      if (p.group.visible) p.hide();
      return;
    }
    if (!p.cell || p.cell.id !== food.id) p.place(food, toWorld(food.x, food.z));
  }

  markEaten(kind, towards, duration) {
    const p = kind === 'orb' ? this.orb : this.prism;
    if (!p.group.visible) return;
    p.eaten = { t: 0, towards: towards.clone(), duration };
  }

  update(dt, time, opts) {
    this.orb.update(dt, time, opts);
    this.prism.update(dt, time, opts);
    if (this.prism.blink && this.prism.group.visible && !this.prism.eaten) {
      this.prism.body.visible = Math.floor(time * 10) % 2 === 0;
    } else {
      this.prism.body.visible = true;
    }
  }
}
