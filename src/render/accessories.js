import * as THREE from 'three';
import { cone } from './geo.js';

// Head accessories, built in the head's local frame (+z forward, +y up; the
// top of the head is around y = 0.25).
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1, ...extra });

function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s) m.scale.set(...s);
  m.castShadow = true;
  return m;
}

const BUILDERS = {
  shades() {
    const g = new THREE.Group();
    const lens = std('#0a0c14', { roughness: 0.05, metalness: 1, envMapIntensity: 2 });
    const frame = std('#141418', { roughness: 0.3 });
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.16, 0.085, 0.025), lens, { x: sx * 0.105, y: 0.2, z: 0.2, rx: -0.55 }));
    g.add(mesh(new THREE.BoxGeometry(0.42, 0.02, 0.03), frame, { y: 0.235, z: 0.185, rx: -0.55 }));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.02, 0.02, 0.22), frame, { x: sx * 0.205, y: 0.21, z: 0.08 }));
    return g;
  },
  tophat() {
    const g = new THREE.Group();
    const black = std('#15151c', { roughness: 0.6 });
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 28), black, { y: 0.25 }));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.25, 28), black, { y: 0.38 }));
    g.add(mesh(new THREE.CylinderGeometry(0.133, 0.133, 0.045, 28), std('#d81e3a'), { y: 0.285 }));
    g.rotation.set(-0.18, 0, 0.12);
    g.position.z = -0.04;
    return g;
  },
  party() {
    const g = new THREE.Group();
    g.add(mesh(cone(0.1, 0.3, 18), std('#ff3df2', { roughness: 0.35 }), { y: 0.41 }));
    for (let i = 0; i < 3; i++) {
      const r = 0.085 - i * 0.025;
      g.add(mesh(new THREE.TorusGeometry(r, 0.012, 6, 20), std(['#ffe640', '#38f6ff', '#7dff6a'][i]), { y: 0.31 + i * 0.075, rx: Math.PI / 2 }));
    }
    g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), std('#ffe640', { emissive: '#ffb020', emissiveIntensity: 0.5 }), { y: 0.57 }));
    g.rotation.set(-0.1, 0, 0.28);
    return g;
  },
  horns() {
    const g = new THREE.Group();
    const ivory = std('#f2e6c8', { roughness: 0.5 });
    for (const sx of [-1, 1]) {
      const h = new THREE.Group();
      h.add(mesh(cone(0.05, 0.22, 12), ivory, { y: 0.11 }));
      h.add(mesh(cone(0.032, 0.14, 10), ivory, { y: 0.25, rx: -0.5, z: -0.03 }));
      h.position.set(sx * 0.13, 0.2, -0.1);
      h.rotation.set(-0.9, 0, -sx * 0.45);
      g.add(h);
    }
    return g;
  },
  bow() {
    const g = new THREE.Group();
    const pink = std('#ff5aa8', { roughness: 0.35 });
    for (const sx of [-1, 1]) g.add(mesh(cone(0.07, 0.13, 12), pink, { x: sx * 0.07, rz: sx * Math.PI / 2, s: [1, 1, 0.45] }));
    g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), pink));
    g.position.set(0.15, 0.24, -0.06);
    g.rotation.set(0, 0.4, 0.5);
    return g;
  },
  flower() {
    const g = new THREE.Group();
    const petal = std('#ffffff', { roughness: 0.5 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(1, 10, 6), petal, { x: Math.cos(a) * 0.065, z: Math.sin(a) * 0.065, ry: -a, s: [0.055, 0.014, 0.03] }));
    }
    g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), std('#ffc21a', { emissive: '#ff9f1c', emissiveIntensity: 0.3 }), { y: 0.01 }));
    g.position.set(-0.17, 0.23, -0.02);
    g.rotation.set(0.2, 0, 0.55);
    return g;
  },
  crown() {
    const g = new THREE.Group();
    const gold = std('#ffcc40', { roughness: 0.18, metalness: 1, envMapIntensity: 1.8 });
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.08, 20, 1, true), gold, { y: 0.3 }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mesh(cone(0.032, 0.09, 8), gold, { x: Math.cos(a) * 0.13, y: 0.38, z: Math.sin(a) * 0.13 }));
      g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), std('#ff2040', { emissive: '#a00018', emissiveIntensity: 0.8, roughness: 0.05 }), { x: Math.cos(a + 0.63) * 0.14, y: 0.3, z: Math.sin(a + 0.63) * 0.14 }));
    }
    g.position.z = -0.03;
    return g;
  },
  halo() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 10, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe9a0').multiplyScalar(2.2) }));
    m.rotation.x = Math.PI / 2;
    m.position.y = 0.48;
    g.add(m);
    g.userData.bob = m;
    return g;
  },
};

export function buildAccessory(id) {
  const b = BUILDERS[id];
  if (!b) return null;
  const g = b();
  g.userData.id = id;
  return g;
}

export function disposeAccessory(g) {
  g.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
}
