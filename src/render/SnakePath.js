// A smooth path through grid cell centres. Corners are rounded with a
// quadratic Bezier of radius CORNER so the snake bends instead of snapping.
// Distance s is measured in cells from the first vertex (the logical head);
// negative s extrapolates past the head, which the death lunge uses.
// Points are 3D: on the ground every y is 0; in the sky the path climbs and dives.
//
// Portals: two consecutive cells that aren't neighbours are a jump from an
// entry portal (the vertex further from the head) to an exit portal. The path
// dives straight down into the entry for half a cell, then rises straight up
// out of the exit, so the body pours into one portal and out of the other.

export const CORNER = 0.3;
const DOWN = [0, -1, 0];

export class SnakePath {
  constructor(maxPoints = 1024) {
    this.v = new Float32Array(maxPoints * 3);
    this.jump = new Uint8Array(maxPoints); // segment k (vertex k -> k+1) is a portal jump
    this.count = 0;
    this.dh = [0, 0, 0];
    this.dt = [0, 0, 0];
  }

  setFromCells(cells, removedTail, toWorld) {
    let n = 0;
    let prev = null;
    const push = (c) => {
      const w = toWorld(c.x, c.z, c.y);
      this.v[n * 3] = w.x;
      this.v[n * 3 + 1] = w.y || 0;
      this.v[n * 3 + 2] = w.z;
      if (n > 0) this.jump[n - 1] = Math.abs(c.x - prev.x) + Math.abs(c.z - prev.z) + Math.abs((c.y || 0) - (prev.y || 0)) > 1 ? 1 : 0;
      prev = c;
      n++;
    };
    for (const c of cells) push(c);
    if (removedTail) push(removedTail);
    this.count = n;
    if (n > 0) this.jump[n - 1] = 0;
  }

  get length() {
    return Math.max(0, this.count - 1);
  }

  // Unit direction from vertex k towards the head (vertex k - 1). Coming out
  // of a portal jump (vertex k is the entry), that's straight down.
  dirHead(k, out) {
    if (this.jump[k - 1]) return set(out, DOWN);
    return unit(this.v, k, k - 1, out);
  }

  // Unit direction from vertex k towards the tail (vertex k + 1); at an exit
  // portal that's straight down too.
  dirTail(k, out) {
    if (this.jump[k]) return set(out, DOWN);
    return unit(this.v, k, k + 1, out);
  }

  isCorner(k) {
    const a = this.dirHead(k, this.dh);
    const b = this.dirTail(k, this.dt);
    const cx = a[1] * b[2] - a[2] * b[1];
    const cy = a[2] * b[0] - a[0] * b[2];
    const cz = a[0] * b[1] - a[1] * b[0];
    return cx * cx + cy * cy + cz * cz > 1e-8;
  }

  // Writes position (x, y, z) into out[0..2], the unit forward tangent
  // (towards the head) into out[3..5] and how far below the floor the point
  // has gone through a portal (0..1) into out[6].
  sample(s, out) {
    const v = this.v;
    const L = this.length;
    out[6] = 0;
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
      // past the head: carry on the way it was going (up, out of an exit portal)
      const d = this.jump[0] ? set(this.dh, [0, 1, 0]) : unit(v, 1, 0, this.dh);
      for (let i = 0; i < 3; i++) out[i] = v[i] + d[i] * -s;
      out[3] = d[0];
      out[4] = d[1];
      out[5] = d[2];
      return out;
    }
    if (s > L) s = L;
    const k = Math.round(s);
    if (k > 0 && k < L && Math.abs(s - k) < CORNER && this.isCorner(k)) {
      const u = (s - (k - CORNER)) / (2 * CORNER);
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      const dh = this.dh;
      const dt = this.dt;
      let len = 0;
      for (let i = 0; i < 3; i++) {
        const ci = v[k * 3 + i];
        const p0 = ci + dh[i] * CORNER;
        const p2 = ci + dt[i] * CORNER;
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
      // the corner into or out of a portal dips below the floor
      if (this.jump[k - 1] || this.jump[k]) out[6] = Math.max(0, -out[1] + v[k * 3 + 1]) * 2;
      return out;
    }
    const i = Math.min(Math.floor(s), L - 1);
    const f = s - i;
    if (this.jump[i]) {
      // vertex i is the exit, i + 1 the entry: down into the entry, up out of the exit
      const entry = f >= 0.5;
      const base = (entry ? i + 1 : i) * 3;
      const depth = entry ? 1 - f : f;
      out[0] = v[base];
      out[1] = v[base + 1] - depth;
      out[2] = v[base + 2];
      out[3] = 0;
      out[4] = entry ? -1 : 1;
      out[5] = 0;
      out[6] = Math.min(1, depth * 2);
      return out;
    }
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

function set(out, d) {
  out[0] = d[0];
  out[1] = d[1];
  out[2] = d[2];
  return out;
}

function unit(v, from, to, out) {
  let len = 0;
  for (let i = 0; i < 3; i++) {
    out[i] = v[to * 3 + i] - v[from * 3 + i];
    len += out[i] * out[i];
  }
  len = Math.sqrt(len) || 1;
  out[0] /= len;
  out[1] /= len;
  out[2] /= len;
  return out;
}
