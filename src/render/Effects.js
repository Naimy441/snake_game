import * as THREE from 'three';

// Pooled additive particles, shockwave rings and the first-person path guide.
export class Effects {
  constructor(maxParticles = 600) {
    this.group = new THREE.Group();
    this.max = maxParticles;
    this.limit = maxParticles;
    this.alive = 0;
    this.pos = new Float32Array(maxParticles * 3);
    this.vel = new Float32Array(maxParticles * 3);
    this.col = new Float32Array(maxParticles * 3);
    this.size = new Float32Array(maxParticles);
    this.life = new Float32Array(maxParticles);
    this.maxLife = new Float32Array(maxParticles);
    this.alpha = new Float32Array(maxParticles);
    this.gravity = new Float32Array(maxParticles);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setAttribute('size', this.sizeAttr);
    geo.setAttribute('alpha', this.alphaAttr);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.uniforms = { scale: { value: 400 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vCol; varying float vA; uniform float scale;
        void main(){ vCol = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vCol; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); if (d > 0.25) discard; float a = smoothstep(0.25, 0.0, d) * vA; gl_FragColor = vec4(vCol * a, a); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.geo = geo;
    this.group.add(this.points);

    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 1, 48),
        new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.userData = { t: 1, dur: 0.5, max: 3 };
      this.group.add(m);
      this.rings.push(m);
    }

    // Path guide: glowing chevrons on the cells straight ahead.
    const chevron = new THREE.Shape();
    chevron.moveTo(-0.28, -0.12);
    chevron.lineTo(0, 0.14);
    chevron.lineTo(0.28, -0.12);
    chevron.lineTo(0.28, -0.24);
    chevron.lineTo(0, -0.02);
    chevron.lineTo(-0.28, -0.24);
    const cg = new THREE.ShapeGeometry(chevron);
    cg.rotateX(-Math.PI / 2);
    this.guideMat = new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    this.guide = new THREE.InstancedMesh(cg, this.guideMat, 24);
    this.guide.count = 0;
    this.guide.frustumCulled = false;
    this.group.add(this.guide);
    this.guideColors = { free: new THREE.Color('#7dffb0'), danger: new THREE.Color('#ff4466') };
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpS = new THREE.Vector3();
    this.tmpP = new THREE.Vector3();
  }

  setParticleBudget(n) {
    this.limit = Math.min(this.max, n);
  }

  emit(x, y, z, { count = 30, color = '#ffd060', speed = 3, up = 2, size = 0.25, life = 0.8, gravity = 5, spread = 0.1 } = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.alive >= this.limit) return;
      const k = this.alive++;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.pos[k * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[k * 3 + 1] = y + (Math.random() - 0.5) * spread;
      this.pos[k * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[k * 3] = Math.cos(a) * v;
      this.vel[k * 3 + 1] = up * (0.5 + Math.random());
      this.vel[k * 3 + 2] = Math.sin(a) * v;
      const tint = 0.8 + Math.random() * 0.4;
      this.col[k * 3] = c.r * tint;
      this.col[k * 3 + 1] = c.g * tint;
      this.col[k * 3 + 2] = c.b * tint;
      this.size[k] = size * (0.6 + Math.random() * 0.8);
      this.maxLife[k] = this.life[k] = life * (0.6 + Math.random() * 0.6);
      this.gravity[k] = gravity;
    }
  }

  shockwave(x, z, color, { max = 3, dur = 0.5 } = {}) {
    const r = this.rings.find((m) => m.userData.t >= 1) || this.rings[0];
    r.position.set(x, 0.05, z);
    r.material.color.set(color);
    r.userData = { t: 0, dur, max };
    r.visible = true;
  }

  updateGuide(game, toWorld, enabled) {
    if (!enabled || !game.alive) {
      this.guide.count = 0;
      return;
    }
    const look = game.lookAhead(24);
    const d = game.lastQueuedDir();
    const n = Math.min(24, look.free);
    const yaw = Math.atan2(d.x, d.z);
    this.tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI);
    for (let i = 0; i < n; i++) {
      const w = toWorld(game.head.x + d.x * (i + 1), game.head.z + d.z * (i + 1));
      this.tmpP.set(w.x, 0.03, w.z);
      const s = 1 - (i / 24) * 0.4;
      this.tmpS.set(s, s, s);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.guide.setMatrixAt(i, this.tmpM);
    }
    this.guide.count = n;
    this.guide.instanceMatrix.needsUpdate = true;
    const danger = look.blocked && look.free <= 2;
    this.guideMat.color.copy(danger ? this.guideColors.danger : this.guideColors.free);
  }

  update(dt) {
    let i = 0;
    while (i < this.alive) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove with the last live particle
        const last = --this.alive;
        if (i !== last) {
          for (let a = 0; a < 3; a++) {
            this.pos[i * 3 + a] = this.pos[last * 3 + a];
            this.vel[i * 3 + a] = this.vel[last * 3 + a];
            this.col[i * 3 + a] = this.col[last * 3 + a];
          }
          this.size[i] = this.size[last];
          this.life[i] = this.life[last];
          this.maxLife[i] = this.maxLife[last];
          this.gravity[i] = this.gravity[last];
        }
        continue;
      }
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      const drag = Math.exp(-dt * 2.2);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.03, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const l = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, l * 2);
      i++;
    }
    this.geo.setDrawRange(0, this.alive);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;

    for (const r of this.rings) {
      const u = r.userData;
      if (u.t >= 1) {
        r.visible = false;
        continue;
      }
      u.t = Math.min(1, u.t + dt / u.dur);
      const e = 1 - Math.pow(1 - u.t, 3);
      r.scale.setScalar(0.2 + e * u.max);
      r.material.opacity = (1 - u.t) * 0.9;
    }
  }
}
