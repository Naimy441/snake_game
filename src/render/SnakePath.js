// A smooth path through grid cell centres. Corners are rounded with a
// quadratic Bezier of radius CORNER so the snake bends instead of snapping.
// Distance s is measured in cells from the first vertex (the logical head);
// negative s extrapolates past the head, which the death lunge uses.
// Points are 3D: on the ground every y is 0; in the sky the path climbs and dives.

export const CORNER = 0.3;

export class SnakePath {
  constructor(maxPoints = 1024) {
    this.v = new Float32Array(maxPoints * 3);
    this.count = 0;
  }

  setFromCells(cells, removedTail, toWorld) {
    let n = 0;
    const push = (c) => {
      const w = toWorld(c.x, c.z, c.y);
      this.v[n * 3] = w.x;
      this.v[n * 3 + 1] = w.y || 0;
      this.v[n * 3 + 2] = w.z;
      n++;
    };
    for (const c of cells) push(c);
    if (removedTail) push(removedTail);
    this.count = n;
  }

  get length() {
    return Math.max(0, this.count - 1);
  }

  isCorner(k) {
    const v = this.v;
    const a = (k - 1) * 3;
    const b = k * 3;
    const c = (k + 1) * 3;
    const ax = v[b] - v[a];
    const ay = v[b + 1] - v[a + 1];
    const az = v[b + 2] - v[a + 2];
    const bx = v[c] - v[b];
    const by = v[c + 1] - v[b + 1];
    const bz = v[c + 2] - v[b + 2];
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    return cx * cx + cy * cy + cz * cz > 1e-8;
  }

  // Writes position (x, y, z) into out[0..2] and the unit forward tangent
  // (towards the head) into out[3..5].
  sample(s, out) {
    const v = this.v;
    const L = this.length;
    if (L <= 0) {
      out[0] = v[0];
      out[1] = v[1];
      out[2] = v[2];
      out[3] = 0;
      out[4] = 0;
      out[5] = -1;
      return out;
    }
    if (s < 0) {
      const dx = v[0] - v[3];
      const dy = v[1] - v[4];
      const dz = v[2] - v[5];
      out[0] = v[0] + dx * -s;
      out[1] = v[1] + dy * -s;
      out[2] = v[2] + dz * -s;
      out[3] = dx;
      out[4] = dy;
      out[5] = dz;
      return out;
    }
    if (s > L) s = L;
    const k = Math.round(s);
    if (k > 0 && k < L && Math.abs(s - k) < CORNER && this.isCorner(k)) {
      const u = (s - (k - CORNER)) / (2 * CORNER);
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      let len = 0;
      for (let i = 0; i < 3; i++) {
        const ci = v[k * 3 + i];
        const p0 = ci + (v[(k - 1) * 3 + i] - ci) * CORNER;
        const p2 = ci + (v[(k + 1) * 3 + i] - ci) * CORNER;
        out[i] = a * p0 + b * ci + c * p2;
        // derivative points towards increasing s (the tail); negated for forward
        const t = 2 * (1 - u) * (ci - p0) + 2 * u * (p2 - ci);
        out[3 + i] = -t;
        len += t * t;
      }
      len = Math.sqrt(len) || 1;
      out[3] /= len;
      out[4] /= len;
      out[5] /= len;
      return out;
    }
    const i = Math.min(Math.floor(s), L - 1);
    const f = s - i;
    let len = 0;
    for (let j = 0; j < 3; j++) {
      const a = v[i * 3 + j];
      const b = v[(i + 1) * 3 + j];
      out[j] = a + (b - a) * f;
      out[3 + j] = a - b;
      len += (a - b) * (a - b);
    }
    len = Math.sqrt(len) || 1;
    out[3] /= len;
    out[4] /= len;
    out[5] /= len;
    return out;
  }
}
