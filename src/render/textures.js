import * as THREE from 'three';
import { mulberry32 } from './geo.js';

// All textures are generated at runtime, so the game ships with no image assets.

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Grey detail tile for the board: soft mottling plus little blade strokes.
// The board shader multiplies it over the cell colours.
export function makeGrassDetail(maxAnisotropy = 4) {
  const w = 256;
  const c = canvas(w);
  const g = c.getContext('2d');
  const rng = mulberry32(7);
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, w, w);
  for (let i = 0; i < 90; i++) {
    const x = rng() * w;
    const y = rng() * w;
    const r = 10 + rng() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const v = rng() > 0.5 ? 255 : 0;
    grad.addColorStop(0, `rgba(${v},${v},${v},0.08)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    for (const ox of [-w, 0, w]) for (const oy of [-w, 0, w]) {
      g.save();
      g.translate(ox, oy);
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.restore();
    }
  }
  g.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = rng() * w;
    const y = rng() * w;
    const len = 3 + rng() * 6;
    const a = -Math.PI / 2 + (rng() - 0.5) * 0.9;
    const v = rng() > 0.45 ? 200 + rng() * 55 : 40 + rng() * 60;
    g.strokeStyle = `rgba(${v},${v},${v},${0.25 + rng() * 0.3})`;
    g.lineWidth = 0.8 + rng() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  const t = tex(c, { repeat: true });
  t.anisotropy = Math.min(8, maxAnisotropy);
  return t;
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
  return tex(c, { srgb: false, repeat: true });
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
  return tex(c);
}

// Soft ring, used for floor glows and warnings.
export function makeRingTexture() {
  const c = canvas(128);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.82, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

// Puffy cumulus: clustered soft blobs, lit from above. Red channel = light,
// alpha = density. The cloud shader tints light/shade per zone.
export function makeCloudTexture() {
  const w = 256;
  const c = canvas(w, w / 2);
  const g = c.getContext('2d');
  const rng = mulberry32(42);
  const blobs = [];
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const x = 30 + t * (w - 60) + (rng() - 0.5) * 20;
    const hump = Math.sin(t * Math.PI);
    const y = 92 - hump * 38 - rng() * 14;
    const r = 18 + hump * 24 + rng() * 10;
    blobs.push({ x, y, r });
  }
  // density
  for (const b of blobs) {
    const grad = g.createRadialGradient(b.x, b.y, b.r * 0.2, b.x, b.y, b.r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    g.fill();
  }
  // flatten the base
  const fade = g.createLinearGradient(0, 96, 0, 128);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = fade;
  g.fillRect(0, 96, w, 32);
  g.globalCompositeOperation = 'source-over';
  // lighting: shade in red channel (top bright, bottom dark)
  const img = g.getImageData(0, 0, w, w / 2);
  const d = img.data;
  for (let y = 0; y < w / 2; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let lit = 1 - y / (w / 2);
      for (const b of blobs) {
        const dx = (x - b.x) / b.r;
        const dy = (y - b.y) / b.r;
        const dd = dx * dx + dy * dy;
        if (dd < 1) lit = Math.max(lit, 0.35 + 0.65 * Math.max(0, -dy) * (1 - dd * 0.5));
      }
      const v = Math.min(255, lit * 255);
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

// Lit windows for night-city towers.
export function makeWindowTexture() {
  const w = 128;
  const h = 256;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const rng = mulberry32(99);
  g.fillStyle = '#05060c';
  g.fillRect(0, 0, w, h);
  const cols = 8;
  const rows = 24;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = rng();
      if (on < 0.45) continue;
      const warm = rng() > 0.4;
      const b = 0.5 + rng() * 0.5;
      g.fillStyle = warm ? `rgba(255,${200 + rng() * 40},${120 + rng() * 60},${b})` : `rgba(${120 + rng() * 60},${200 + rng() * 55},255,${b})`;
      g.fillRect(x * (w / cols) + 3, y * (h / rows) + 2, w / cols - 6, h / rows - 5);
    }
  }
  const t = tex(c, { repeat: true });
  return t;
}

// Chevrons for boost pads. Red channel = arrow mask.
export function makeChevronTexture() {
  const c = canvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#fff';
  for (let i = 0; i < 2; i++) {
    const y = i * 128 + 28;
    g.beginPath();
    g.moveTo(64, y);
    g.lineTo(118, y + 52);
    g.lineTo(118, y + 86);
    g.lineTo(64, y + 34);
    g.lineTo(10, y + 86);
    g.lineTo(10, y + 52);
    g.closePath();
    g.fill();
  }
  const t = tex(c, { srgb: false, repeat: true });
  return t;
}

// Number badge for chain orbs.
export function makeDigitTexture(text, color = '#38f6ff') {
  const c = canvas(128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.font = '900 italic 92px "Exo 2", "Avenir Next", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 12;
  g.strokeStyle = 'rgba(0,10,30,0.85)';
  g.strokeText(text, 64, 68);
  g.fillStyle = '#ffffff';
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillText(text, 64, 68);
  return tex(c);
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
  return tex(c, { repeat: true });
}

// Tileable fractal value noise (grey), for the sea of clouds.
export function makeNoiseTexture(size = 256) {
  const rng = mulberry32(77);
  const c = canvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const acc = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  for (let cells = 4; cells <= 64; cells *= 2) {
    const lat = new Float32Array(cells * cells).map(() => rng());
    const L = (x, y) => lat[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells;
      const y0 = Math.floor(fy);
      let ty = fy - y0;
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const x0 = Math.floor(fx);
        let tx = fx - x0;
        tx = tx * tx * (3 - 2 * tx);
        const a = L(x0, y0) + (L(x0 + 1, y0) - L(x0, y0)) * tx;
        const b = L(x0, y0 + 1) + (L(x0 + 1, y0 + 1) - L(x0, y0 + 1)) * tx;
        acc[y * size + x] += (a + (b - a) * ty) * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((acc[i] / norm) * 255);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, { srgb: false, repeat: true });
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
