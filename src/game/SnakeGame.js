// Pure game state for Coil Rush. No rendering here: both camera modes read
// the same instance, so the rules are identical whichever view is active.

export const DIRS = {
  up: { x: 0, z: -1 },
  down: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
};

export const FOOD_TYPES = {
  orb: { points: 10, grow: 1, rush: 25 },
  prism: { points: 50, grow: 2, rush: 100 },
};

export const COMBO_WINDOW_MS = 5000;
export const MAX_COMBO = 8;
export const PRISM_LIFETIME_MS = 9000;
export const RUSH_DRAIN_PER_SEC = 32;

const sameDir = (a, b) => a.x === b.x && a.z === b.z;
const opposite = (a, b) => a.x === -b.x && a.z === -b.z;

export class SnakeGame {
  constructor({ size = 21, rng = Math.random, best = 0 } = {}) {
    this.size = size;
    this.rng = rng;
    this.best = best;
    this.reset();
  }

  reset() {
    const c = Math.floor(this.size / 2);
    const startZ = this.size - 5;
    this.dir = { ...DIRS.up };
    this.cells = [];
    for (let i = 0; i < 4; i++) this.cells.push({ x: c, z: startZ + i });
    // The cell the tail vacated on the last step (null when the snake grew).
    // The renderer uses it to slide the tail smoothly.
    this.removedTail = { x: c, z: startZ + 4 };
    this.queue = [];
    this.pendingGrowth = 0;
    this.score = 0;
    this.foodEaten = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this.lastEatTime = -1e9;
    this.time = 0;
    this.ticks = 0;
    this.rush = 0;
    this.rushing = false;
    this.wantRush = false;
    this.alive = true;
    this.won = false;
    this.deathCause = null;
    this.newBest = false;
    this.bonus = null;
    this.food = null;
    this.food = this.spawn('orb');
  }

  get head() {
    return this.cells[0];
  }

  get level() {
    return Math.min(12, Math.floor(this.foodEaten / 4));
  }

  baseInterval() {
    return Math.max(62, 140 - this.level * 7);
  }

  currentInterval() {
    return this.rushing ? this.baseInterval() * 0.6 : this.baseInterval();
  }

  // Speed as a 0..1 value for presentation effects.
  intensity() {
    const lvl = this.level / 12;
    return Math.min(1, lvl * 0.7 + (this.rushing ? 0.45 : 0));
  }

  lastQueuedDir() {
    return this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
  }

  queueDirection(d) {
    if (!this.alive) return false;
    const last = this.lastQueuedDir();
    if (sameDir(d, last) || opposite(d, last)) return false;
    if (this.queue.length >= 3) return false;
    this.queue.push({ x: d.x, z: d.z });
    return true;
  }

  // side: -1 = turn left, +1 = turn right, relative to the heading the snake
  // will have once already-queued turns are applied.
  turn(side) {
    const l = this.lastQueuedDir();
    const d = side > 0 ? { x: -l.z + 0, z: l.x + 0 } : { x: l.z + 0, z: -l.x + 0 };
    return this.queueDirection(d);
  }

  inBounds(x, z) {
    return x >= 0 && z >= 0 && x < this.size && z < this.size;
  }

  occupied(x, z, ignoreTail = false) {
    const n = ignoreTail ? this.cells.length - 1 : this.cells.length;
    for (let i = 0; i < n; i++) {
      const c = this.cells[i];
      if (c.x === x && c.z === z) return true;
    }
    return false;
  }

  freeCells() {
    const taken = new Set(this.cells.map((c) => c.x * 1000 + c.z));
    if (this.food) taken.add(this.food.x * 1000 + this.food.z);
    if (this.bonus) taken.add(this.bonus.x * 1000 + this.bonus.z);
    const out = [];
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        if (!taken.has(x * 1000 + z)) out.push({ x, z });
      }
    }
    return out;
  }

  spawn(type) {
    const free = this.freeCells();
    if (!free.length) return null;
    // Prefer cells that are not right in front of the head so food never
    // appears where the player can't react to it.
    const h = this.head;
    const fair = free.filter((c) => Math.abs(c.x - h.x) + Math.abs(c.z - h.z) > 2);
    const pool = fair.length ? fair : free;
    const c = pool[Math.floor(this.rng() * pool.length)];
    return { x: c.x, z: c.z, type, id: Math.floor(this.rng() * 1e9), spawnedAt: this.time };
  }

  // Cells straight ahead along the heading the snake will take next, up to the
  // first obstacle. Used for the first-person path guide and danger warnings.
  lookAhead(max = this.size) {
    const d = this.lastQueuedDir();
    const out = { free: 0, blocked: 'wall' };
    let x = this.head.x;
    let z = this.head.z;
    for (let i = 0; i < max; i++) {
      x += d.x;
      z += d.z;
      if (!this.inBounds(x, z)) {
        out.blocked = 'wall';
        return out;
      }
      if (this.occupied(x, z, i === 0)) {
        out.blocked = 'body';
        return out;
      }
      out.free++;
    }
    out.blocked = null;
    return out;
  }

  die(cause) {
    this.alive = false;
    this.deathCause = cause;
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
    }
  }

  // Advance one grid move. Returns an event object describing what happened.
  step() {
    const ev = { ate: null, died: false, cause: null, turned: false, bonusExpired: false, won: false };
    if (!this.alive) return ev;

    this.rushing = this.wantRush && this.rush > 0;
    const interval = this.currentInterval();
    this.time += interval;
    this.ticks++;
    if (this.rushing) this.rush = Math.max(0, this.rush - (RUSH_DRAIN_PER_SEC * interval) / 1000);

    if (this.queue.length) {
      this.dir = this.queue.shift();
      ev.turned = true;
    }

    if (this.bonus && this.time > this.bonus.expires) {
      ev.bonusExpired = { ...this.bonus };
      this.bonus = null;
    }

    const h = this.head;
    const nx = h.x + this.dir.x;
    const nz = h.z + this.dir.z;

    if (!this.inBounds(nx, nz)) {
      this.die('wall');
      ev.died = true;
      ev.cause = 'wall';
      return ev;
    }

    let eaten = null;
    if (this.food && this.food.x === nx && this.food.z === nz) eaten = this.food;
    else if (this.bonus && this.bonus.x === nx && this.bonus.z === nz) eaten = this.bonus;

    const growing = this.pendingGrowth > 0 || !!eaten;
    if (this.occupied(nx, nz, !growing)) {
      this.die('body');
      ev.died = true;
      ev.cause = 'body';
      return ev;
    }

    if (eaten) {
      const def = FOOD_TYPES[eaten.type];
      this.combo = this.time - this.lastEatTime <= COMBO_WINDOW_MS ? Math.min(MAX_COMBO, this.combo + 1) : 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.lastEatTime = this.time;
      const points = def.points * this.combo * (this.rushing ? 2 : 1);
      this.score += points;
      this.pendingGrowth += def.grow;
      this.rush = Math.min(100, this.rush + def.rush);
      const prevLevel = this.level;
      if (eaten.type === 'orb') this.foodEaten++;
      ev.ate = { ...eaten, points, combo: this.combo, rushing: this.rushing, levelUp: this.level > prevLevel };
    }

    this.cells.unshift({ x: nx, z: nz });
    if (this.pendingGrowth > 0) {
      this.pendingGrowth--;
      this.removedTail = null;
    } else {
      this.removedTail = this.cells.pop();
    }

    if (eaten === this.food) {
      this.food = this.spawn('orb');
      if (!this.bonus && this.foodEaten >= 3 && this.rng() < 0.28) {
        const b = this.spawn('prism');
        if (b) {
          b.expires = this.time + PRISM_LIFETIME_MS;
          this.bonus = b;
          ev.bonusSpawned = { ...b };
        }
      }
    } else if (eaten && eaten === this.bonus) {
      this.bonus = null;
    }

    if (!this.food && !this.bonus && this.freeCells().length === 0) {
      this.won = true;
      this.die('win');
      ev.won = true;
      ev.died = true;
      ev.cause = 'win';
    }
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
    }
    return ev;
  }
}
