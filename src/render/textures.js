import * as THREE from 'three';

// All textures are generated at runtime, so the game ships with no image assets.

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function makeBoardTexture(size, maxAnisotropy) {
  const px = 48;
  const c = canvas(size * px);
  const g = c.getContext('2d');
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const even = (x + z) % 2 === 0;
      const grad = g.createLinearGradient(x * px, z * px, x * px + px, z * px + px);
      grad.addColorStop(0, even ? '#9be071' : '#79c655');
      grad.addColorStop(1, even ? '#86d062' : '#69b84a');
      g.fillStyle = grad;
      g.fillRect(x * px, z * px, px, px);
      // soft blade speckle
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(${even ? '40,90,20' : '25,70,15'},${0.05 + Math.random() * 0.08})`;
        g.fillRect(x * px + Math.random() * px, z * px + Math.random() * px, 1.5, 3);
      }
    }
  }
  // grid lines
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = 2;
  for (let i = 0; i <= size; i++) {
    g.beginPath();
    g.moveTo(i * px, 0);
    g.lineTo(i * px, size * px);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * px);
    g.lineTo(size * px, i * px);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

// Overlapping scale bumps rendered to a height field, then converted to a
// tangent-space normal map.
export function makeScaleNormalMap() {
  const w = 256;
  const c = canvas(w);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, w);
  const rows = 8;
  const cols = 8;
  const sw = w / cols;
  const sh = w / rows;
  for (let r = -1; r <= rows; r++) {
    for (let col = -1; col <= cols; col++) {
      const cx = col * sw + (r % 2 ? sw / 2 : 0);
      const cy = r * sh;
      const grad = g.createRadialGradient(cx, cy + sh * 0.15, 1, cx, cy, sw * 0.62);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.7, 'rgba(160,160,160,1)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(cx, cy, sw * 0.58, sh * 0.72, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const src = g.getImageData(0, 0, w, w).data;
  const out = g.createImageData(w, w);
  const hAt = (x, y) => src[(((y + w) % w) * w + ((x + w) % w)) * 4] / 255;
  const strength = 2.2;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * strength;
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function makeGlowTexture() {
  const c = canvas(128);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeCheckerTexture(a = '#ffffff', b = '#1d3fbf', n = 16) {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  const w = 256 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? a : b;
      g.fillRect(i * w, j * 16, w, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
