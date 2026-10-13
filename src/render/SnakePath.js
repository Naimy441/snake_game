// A smooth path through grid cell centres. Corners are rounded with a
// quadratic Bezier of radius CORNER so the snake bends instead of snapping.
// Distance s is measured in cells from the first vertex (the logical head);
// negative s extrapolates past the head, which the death lunge uses.

export const CORNER = 0.3;

export class SnakePath {
  constructor(maxPoints = 1024) {
    this.v = new Float32Array(maxPoints * 2);
    this.count = 0;
  }

  setFromCells(cells, removedTail, toWorld) {
    let n = 0;
    const push = (c) => {
      const w = toWorld(c.x, c.z);
      this.v[n * 2] = w.x;
      this.v[n * 2 + 1] = w.z;
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
    const ax = v[k * 2] - v[(k - 1) * 2];
    const az = v[k * 2 + 1] - v[(k - 1) * 2 + 1];
    const bx = v[(k + 1) * 2] - v[k * 2];
    const bz = v[(k + 1) * 2 + 1] - v[k * 2 + 1];
    return Math.abs(ax * bz - az * bx) > 1e-4;
  }

  // Writes position (x, z) into out[0..1] and the forward tangent (towards the
  // head) into out[2..3].
  sample(s, out) {
    const v = this.v;
    const L = this.length;
    if (L <= 0) {
      out[0] = v[0];
      out[1] = v[1];
      out[2] = 0;
      out[3] = -1;
      return out;
    }
    if (s < 0) {
      const dx = v[0] - v[2];
      const dz = v[1] - v[3];
      out[0] = v[0] + dx * -s;
      out[1] = v[1] + dz * -s;
      out[2] = dx;
      out[3] = dz;
      return out;
    }
    if (s > L) s = L;
    const k = Math.round(s);
    if (k > 0 && k < L && Math.abs(s - k) < CORNER && this.isCorner(k)) {
      const cx = v[k * 2];
      const cz = v[k * 2 + 1];
      const p0x = cx + (v[(k - 1) * 2] - cx) * CORNER;
      const p0z = cz + (v[(k - 1) * 2 + 1] - cz) * CORNER;
      const p2x = cx + (v[(k + 1) * 2] - cx) * CORNER;
      const p2z = cz + (v[(k + 1) * 2 + 1] - cz) * CORNER;
      const u = (s - (k - CORNER)) / (2 * CORNER);
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      out[0] = a * p0x + b * cx + c * p2x;
      out[1] = a * p0z + b * cz + c * p2z;
      // derivative points towards increasing s (the tail); negate for forward
      const tx = 2 * (1 - u) * (cx - p0x) + 2 * u * (p2x - cx);
      const tz = 2 * (1 - u) * (cz - p0z) + 2 * u * (p2z - cz);
      const len = Math.hypot(tx, tz) || 1;
      out[2] = -tx / len;
      out[3] = -tz / len;
      return out;
    }
    const i = Math.min(Math.floor(s), L - 1);
    const f = s - i;
    const ax = v[i * 2];
    const az = v[i * 2 + 1];
    const bx = v[(i + 1) * 2];
    const bz = v[(i + 1) * 2 + 1];
    out[0] = ax + (bx - ax) * f;
    out[1] = az + (bz - az) * f;
    const len = Math.hypot(ax - bx, az - bz) || 1;
    out[2] = (ax - bx) / len;
    out[3] = (az - bz) / len;
    return out;
  }
}
