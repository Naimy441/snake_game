// Pure game state for Snake Rush. No rendering here: every camera mode reads
// the same instance, so the rules are identical whichever view is active.

// x/z run across the board ("up" is screen-north in the overhead view); y is
// altitude, which only exists once the snake flies in Sunset Heavens.
export const DIRS = {
  up: { x: 0, z: -1, y: 0 },
  down: { x: 0, z: 1, y: 0 },
  left: { x: -1, z: 0, y: 0 },
  right: { x: 1, z: 0, y: 0 },
  rise: { x: 0, z: 0, y: 1 },
  dive: { x: 0, z: 0, y: -1 },
};

export const FOOD_TYPES = {
  orb: { points: 10, grow: 1, rush: 25 },
  prism: { points: 50, grow: 2, rush: 100 },
  prey: { points: 100, grow: 2, rush: 50 },
};

export const COMBO_WINDOW_MS = 5000;
// No cap: every quick follow-up eat raises the multiplier by one.
export const MAX_COMBO = Infinity;
export const PRISM_LIFETIME_MS = 9000;
export const RUSH_DRAIN_PER_SEC = 32;
// Levels 0..13 are reached by eating apples; the Galactic Core is level 14,
// the last one, won by filling the board as it collapses (see SPACE_START).
export const MAX_LEVEL = 14;
export const MIN_INTERVAL = 72; // ~14 cells/s

// Difficulty ramp. Apples needed to clear each level: short levels in the
// first zone, longer ones later. Milliseconds per move at each level: a
// gentle warm-up in Emerald Coast that builds to the top speed in Cyber
// Overdrive. Flying in three dimensions is a new skill, so Sunset Heavens
// starts slower again and builds back up over its two levels. The Galactic
// Core is a precision puzzle (fill every cell), so it starts slower again and
// speeds up as the board fills (see CORE_FAST).
export const LEVEL_COSTS = [3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 6];
export const LEVEL_SPEEDS = [175, 163, 152, 142, 133, 124, 115, 106, 98, 90, 83, 77, 122, 106, 150];
// Total apples eaten at which each level starts.
export const LEVEL_AT = LEVEL_COSTS.reduce((acc, c) => (acc.push(acc[acc.length - 1] + c), acc), [0]);
export const MIN_FAST_INTERVAL = 48; // ~21 cells/s with Rush or Boost

// The world changes zone every few speed levels.
export const ZONE_STARTS = [0, 3, 6, 9, 12, 14];
export const ZONE_NAMES = ['Emerald Coast', 'Golden Canyon', 'Neon Night', 'Cyber Overdrive', 'Sunset Heavens', 'Galactic Core'];

// The Galactic Core: after Sunset Heavens the snake jumps to hyperspeed and
// drops out over a black hole, onto a CORE_SIZE x CORE_SIZE board of light
// floating above it. The black hole eats the board: every apple dooms
// COLLAPSE_PER_APPLE more cells, which glow for DOOM_MS and then fall in
// (only once the snake is off them). They go in a spiral from the outer edge
// inwards, so the board shrinks around the snake. Dead-end nubs (cells with
// one neighbour left, which could only ever be filled last) go first, for
// free. The collapse never splits the board, never takes the cells right in
// front of the head, and never cuts the head off from its own tail (so there
// is always a way to stay alive). The run is won when every cell left is
// snake: 100%.
export const SPACE_ZONE = 5;
export const SPACE_START = 14;
export const CORE_SIZE = 12;
export const COLLAPSE_PER_APPLE = 3;
export const DOOM_MS = 1300;
export const DOOM_STAGGER_MS = 170;
export const CORE_FAST = 132; // ms per move once the board is nearly full (~7.6 moves/s: room to think in the endgame)
// The black hole calms down for the last stretch: once the snake is this
// long, a shockwave rolls out and the game eases back to CORE_CALM over
// CORE_CALM_MOVES moves, and stays there.
export const CORE_CALM_LEN = 35;
export const CORE_CALM = 180; // ms per move (~5.5 moves/s)
export const CORE_CALM_MOVES = 10;
const MAX_FREE_EATS = 4; // dead-end nubs taken per apple, on top
// What the bot's planning copies can share with the game (never changed in
// the Galactic Core, or not wanted in a copy).
const SIM_SHARED = new Set(['spiral', 'sizes', 'undo', 'corePlanned', 'stallWay', 'appleAfter', 'obstacles', 'pads', 'padRespawns', 'stats', 'simPlan']);
const scratch = {}; // reused buffers for roomScore
// The same apple (planning copies have their own copy of it)?
const sameFood = (a, b) => a === b || (!!a && !!b && a.id === b.id && a.x === b.x && a.z === b.z);
const APPLE_STUCK_MS = 8000; // an apple no one can safely eat moves after this

// Sunset Heavens: the snake straps on a jetpack and the board becomes a box
// of air, fenced in by lasers: SKY_PAD cells wider than the board on every
// side (SKY_SIZE across) and SKY_H layers tall. Layer SKY_LIFT is level with
// where the board was; at lift-off the snake rockets SKY_CLIMB layers
// straight up on its own (to SKY_CENTER) before the player takes over.
export const SKY_ZONE = 4;
export const SKY_PAD = 2;
// The board grows as the zones change: 15 x 15 in Emerald Coast, 17 x 17 in
// Golden Canyon, then 19 x 19 for the rest of the ground (the sky box is
// built around the 19 board). It grows by a ring of cells on every side, so
// everything on it keeps its place on screen.
export const BOARD_SIZES = [15, 17, 19];

// The bonus level (unlocked by growing to BONUS_UNLOCK_LENGTH in the Galactic
// Core): classic Snake on a 17 x 17 board. No power-ups, no mice, no speed
// ramp; every golden apple grows the snake by one, and Rush still works.
export const BONUS_SIZE = 17;
export const BONUS_INTERVAL = 128; // ms per move (~7.8 moves/s), the whole level
export const BONUS_PARTY_AT = 10; // apples until the lights come on
export const BONUS_UNLOCK_LENGTH = 30;
// The epilogue's meteor storm, on Emerald Coast's own 15 x 15 board, with
// the snake's home (a 3 x 3 block, family and all) in the middle. A first
// barrage has already landed when it starts; the rest rain down in
// METEOR_WAVES, each meteor marking where it will land METEOR_WARN_MS ahead,
// then burning there until it is eaten. Eat all METEOR_TOTAL before
// METEOR_TIME_MS runs out (or one big one finishes everything off). One that
// lands on the snake clangs off its head: it's gone, but it costs one of
// METEOR_LIVES. Walls, its own body and its home are solid. It speeds up as
// it goes.
export const METEOR_SIZE = 15;
export const METEOR_LIVES = 3;
export const METEOR_TIME_MS = 120000;
export const METEOR_FIRST = 8; // already burning on the board at the start
export const METEOR_WAVES = [6, 8, 10];
export const METEOR_TOTAL = METEOR_FIRST + METEOR_WAVES.reduce((a, b) => a + b, 0);
export const METEOR_WARN_MS = 1700;
export const METEOR_STAGGER_MS = 240;
export const METEOR_INTERVAL = [130, 100]; // ms per move, first meteor to last
export const METEOR_POINTS = 30;
export const SKY_SIZE = BOARD_SIZES[BOARD_SIZES.length - 1] + SKY_PAD * 2;
export const SKY_H = 13;
export const SKY_LIFT = 3;
export const SKY_CLIMB = 3;
export const SKY_CENTER = SKY_LIFT + SKY_CLIMB;

// Orb chains: numbered orbs that pay out when eaten in order.
export const CHAIN_LINK_POINTS = 20;
export const CHAIN_LINK_RUSH = 15;
export const CHAIN_BONUS_PER_LINK = 100;

// Fleeing prey.
export const PREY_LIFETIME_MS = 14000;
export const PREY_FIRST_DELAY_MS = 16000;

// Boost pads: free burst of speed and double points.
export const BOOST_TICKS = 14;
export const PAD_POINTS = 25;
export const PAD_RUSH = 15;
export const PAD_RESPAWN_MS = 5000;

// Obstacles rise at these speed levels (level index -> how many). The
// board is kept clear: no level raises pillars any more (the machinery stays
// so a mode could bring them back).
export const OBSTACLE_PLAN = {};
export const MAX_OBSTACLES = 12;
export const OBSTACLE_WARN_MS = 2200;

// Cells and directions carry y (altitude); anything without one is on the ground.
const Y = (c) => c.y || 0;
const sameDir = (a, b) => a.x === b.x && a.z === b.z && Y(a) === Y(b);
const opposite = (a, b) => a.x === -b.x && a.z === -b.z && Y(a) === -Y(b);
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(Y(a) - Y(b));
const at = (c, x, z, y) => c.x === x && c.z === z && Y(c) === y;
export const NEIGHBOURS = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
export const NEIGHBOURS_3D = [...NEIGHBOURS, DIRS.rise, DIRS.dive];
export const cellKey = (x, z, y = 0) => (x * 64 + z) * 16 + y;

// Apples grow the snake more on each map: 1 cell on the first, 2 on the
// second, then 3 from the third map on.
export const MAX_APPLE_GROWTH = 3;
export function appleGrowth(zone) {
  return Math.min(MAX_APPLE_GROWTH, zone + 1);
}

// The order the Galactic Core's board falls in: the outer edge first, going
// round clockwise (seen from above) from the top-left corner, then the next
// ring in, and so on.
function spiralOrder(S) {
  const order = new Int32Array(S * S);
  let k = 0;
  for (let L = 0; L < S / 2; L++) {
    const a = L;
    const b = S - 1 - L;
    const path = [];
    for (let x = a; x <= b; x++) path.push([x, a]);
    for (let z = a + 1; z <= b; z++) path.push([b, z]);
    for (let x = b - 1; x >= a; x--) path.push([x, b]);
    for (let z = b - 1; z > a; z--) path.push([a, z]);
    for (const [x, z] of path) order[x * S + z] = k++;
  }
  return order;
}

export function zoneForLevel(level) {
  let z = 0;
  for (let i = 0; i < ZONE_STARTS.length; i++) if (level >= ZONE_STARTS[i]) z = i;
  return z;
}

export class SnakeGame {
  // sizes: board width per zone (the last one repeats). Without it the
  // board stays `size` wide.
  constructor({ size = 19, sizes = null, rng = Math.random, best = 0 } = {}) {
    this.sizes = sizes && sizes.length ? sizes.slice() : [size];
    this.boardSize = this.sizes[this.sizes.length - 1];
    this.size = this.sizes[0];
    this.rng = rng;
    this.best = best;
    this.uid = 1;
    this.reset();
  }

  reset() {
    this.size = this.boardSizeFor(0); // a new run is back on the first, smallest board
    const c = Math.floor(this.size / 2);
    const startZ = this.size - 5;
    this.dir = { ...DIRS.up };
    // last horizontal heading: what "left" and "right" turn from while climbing or diving
    this.facing = { ...DIRS.up };
    this.flying = false;
    this.space = false; // on the collapsing board of the Galactic Core
    this.bonusLevel = false; // in the bonus level (see enterBonusLevel)
    this.meteorLevel = false; // in the epilogue's meteor storm (see enterMeteorLevel)
    this.meteors = []; // { x, z, y, id, landAt, landed }
    this.meteorsEaten = 0;
    this.meteorsSpawned = 0;
    this.wave = 0;
    this.home = null;
    this.lives = 0;
    this.land = null; // Galactic Core: 1 for each cell still there (x * size + z)
    this.doomed = []; // cells about to fall: { x, z, doomAt, fallAt, id }
    this.fallen = 0;
    this.calm = -1; // Galactic Core: moves since the slow-down began (-1: not yet)
    this.calmFrom = 0; // (and how fast it was going then, ms per move)
    this.clearCoreTimers();
    this.launch = 0; // lift-off climb steps left (input is ignored meanwhile)
    this.height = 1;
    this.yMid = 0;
    this.cells = [];
    for (let i = 0; i < 4; i++) this.cells.push({ x: c, z: startZ + i, y: 0 });
    // The cell the tail vacated on the last step (null when the snake grew).
    // The renderer uses it to slide the tail smoothly.
    this.removedTail = { x: c, z: startZ + 4, y: 0 };
    this.queue = [];
    this.pendingGrowth = 0;
    this.score = 0;
    this.foodEaten = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this.lastEatTime = -1e9;
    this.time = 0;
    // Real-time clock (ms). Differs from `time` only while the presentation
    // runs gameplay slower than real time (Rush bullet time sets clockScale);
    // the Rush and combo meters run on it so they drain at their usual pace.
    this.clock = 0;
    this.clockScale = 1;
    this.ticks = 0;
    this.rush = 0;
    this.rushing = false;
    this.wantRush = false;
    this.boostTicks = 0;
    this.alive = true;
    this.won = false;
    this.deathCause = null;
    this.newBest = false;
    this.bonus = null;
    this.chain = null;
    this.prey = null;
    this.preyTimer = PREY_FIRST_DELAY_MS;
    this.obstacles = []; // { x, z, solid, solidAt, id }
    this.pads = []; // { x, z, id }
    this.padRespawns = []; // times at which a used pad comes back
    this.stats = { chains: 0, prey: 0, pads: 0 };
    this.food = null;
    this.food = this.spawn('orb');
  }

  get head() {
    return this.cells[0];
  }

  boardSizeFor(zone) {
    return this.sizes[Math.min(zone, this.sizes.length - 1)];
  }

  // Shift everything by pad cells on x and z (the grid grew by pad on every
  // side). Pickups are moved in place: callers may hold the same objects.
  shiftGrid(pad, y) {
    const moved = (c) => ({ ...c, x: c.x + pad, z: c.z + pad, y: y == null ? Y(c) : y });
    this.cells = this.cells.map(moved);
    if (this.removedTail) this.removedTail = moved(this.removedTail);
    const inPlace = (c, ny) => c && Object.assign(c, { x: c.x + pad, z: c.z + pad }, ny == null ? {} : { y: ny });
    return inPlace;
  }

  // On the ground, between zones: widen the board by a ring of cells.
  growBoard(size) {
    if (this.flying || size <= this.size) return 0;
    const pad = Math.floor((size - this.size) / 2);
    const shift = this.shiftGrid(pad);
    shift(this.food);
    shift(this.bonus);
    if (this.chain) this.chain.links.forEach((c) => shift(c));
    if (this.prey) {
      shift(this.prey);
      this.prey.px += pad;
      this.prey.pz += pad;
    }
    this.pads.forEach((c) => shift(c));
    this.obstacles.forEach((c) => shift(c));
    this.size = size;
    this.undoOk = false;
    return pad;
  }

  get level() {
    if (this.bonusLevel || this.meteorLevel) return 0;
    if (this.space) return SPACE_START;
    let l = 0;
    while (l < SPACE_START && this.foodEaten >= LEVEL_AT[l + 1]) l++;
    return l;
  }

  // Apples eaten into the current level and how many it takes. In the
  // Galactic Core: how much of what is left of the board the snake fills.
  levelProgress() {
    if (this.meteorLevel) {
      const n = this.meteorsEaten;
      return { into: n, need: METEOR_TOTAL, max: n >= METEOR_TOTAL, meteor: true };
    }
    if (this.bonusLevel) {
      const n = this.foodEaten;
      return { into: Math.min(n, BONUS_PARTY_AT), need: BONUS_PARTY_AT, max: n >= BONUS_PARTY_AT, bonus: true };
    }
    if (this.space) {
      const n = this.cells.length;
      return { into: n, need: n + Math.max(0, this.coreFree()), max: false, core: true };
    }
    const l = this.level;
    if (l >= SPACE_START) return { into: 1, need: 1, max: true };
    return { into: this.foodEaten - LEVEL_AT[l], need: LEVEL_COSTS[l], max: false };
  }

  // Cells on the board (in the Galactic Core: the ones not fallen yet).
  get capacity() {
    if (this.space) return this.landCount();
    return this.size * this.size * this.height;
  }

  landCount() {
    let n = 0;
    for (let i = 0; i < this.land.length; i++) n += this.land[i];
    return n;
  }

  // How full the Galactic Core board is, 0..1 (1 = won): cells about to
  // fall don't count as still to fill.
  get fill() {
    if (!this.space) return 0;
    const n = this.cells.length;
    return Math.min(1, n / Math.max(1, n + this.coreFree()));
  }

  isLand(x, z) {
    return x >= 0 && z >= 0 && x < this.size && z < this.size && this.land[x * this.size + z] === 1;
  }

  doomAt(x, z) {
    for (const d of this.doomed) if (d.x === x && d.z === z) return d;
    return null;
  }

  dist(a, b) {
    return manhattan(a, b);
  }

  get zone() {
    return zoneForLevel(this.level);
  }

  get boosting() {
    return this.boostTicks > 0;
  }

  // Milliseconds per move. Speed is capped so that a quick double tap (a
  // tight U-turn) is still physically possible at the top speed.
  baseInterval() {
    if (this.bonusLevel) return BONUS_INTERVAL;
    if (this.meteorLevel) {
      const f = Math.min(1, this.meteorsEaten / (METEOR_TOTAL - 1));
      return Math.round(METEOR_INTERVAL[0] + (METEOR_INTERVAL[1] - METEOR_INTERVAL[0]) * f);
    }
    if (this.space) {
      // by the fullest the board has been, so it never slows down again
      const f = Math.max(this.fillTop || 0, this.fill);
      const base = LEVEL_SPEEDS[SPACE_START] + (CORE_FAST - LEVEL_SPEEDS[SPACE_START]) * f * f;
      if (!(this.calm >= 0)) return base;
      // eased from the speed it had when the calm began, so it never lands mid-turn
      const from = this.calmFrom || base;
      const t = Math.min(1, this.calm / CORE_CALM_MOVES);
      return from + (CORE_CALM - from) * t * t * (3 - 2 * t);
    }
    return Math.max(MIN_INTERVAL, LEVEL_SPEEDS[this.level]);
  }

  currentInterval(rushing = this.rushing) {
    let f = 1;
    if (rushing) f = 0.6;
    if (this.boostTicks > 0) f = rushing ? 0.5 : 0.55;
    return Math.max(MIN_FAST_INTERVAL, this.baseInterval() * f);
  }

  // Speed as a 0..1 value for presentation effects.
  intensity() {
    if (this.meteorLevel) return Math.min(1, 0.45 + (this.meteorsEaten / METEOR_TOTAL) * 0.3 + (this.rushing ? 0.35 : 0));
    if (this.bonusLevel) return Math.min(1, 0.35 + (this.rushing ? 0.45 : 0));
    const lvl = this.level / MAX_LEVEL;
    return Math.min(1, lvl * 0.7 + (this.rushing || this.boostTicks > 0 ? 0.45 : 0));
  }

  lastQueuedDir() {
    return this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
  }

  // Horizontal heading once the queued moves have been made.
  lastFacing() {
    let f = this.facing;
    for (const q of this.queue) if (!Y(q)) f = q;
    return f;
  }

  queueDirection(d) {
    if (!this.alive || !d || this.launch > 0) return false;
    if (Y(d) && !this.flying) return false;
    const last = this.lastQueuedDir();
    if (sameDir(d, last) || opposite(d, last)) return false;
    if (this.queue.length >= 3) return false;
    this.queue.push({ x: d.x, z: d.z, y: Y(d) });
    return true;
  }

  // side: -1 = turn left, +1 = turn right, relative to the heading the snake
  // will have once already-queued turns are applied.
  turn(side) {
    return this.queueDirection(this.turnDir(side));
  }

  // Flight controls: climb (up = true) or dive from level flight; the
  // opposite key levels out again along the facing. null if it does nothing.
  pitchDir(up) {
    if (!this.flying) return null;
    const l = this.lastQueuedDir();
    const f = this.lastFacing();
    if (!Y(l)) return up ? { ...DIRS.rise } : { ...DIRS.dive };
    if (Y(l) > 0) return up ? null : { x: f.x, z: f.z, y: 0 };
    return up ? { x: f.x, z: f.z, y: 0 } : null;
  }

  pitch(up) {
    return this.queueDirection(this.pitchDir(up));
  }

  get neighbours() {
    return this.flying ? NEIGHBOURS_3D : NEIGHBOURS;
  }

  inBounds(x, z, y = 0) {
    if (this.space) return y === 0 && this.isLand(x, z);
    return x >= 0 && z >= 0 && x < this.size && z < this.size && y >= 0 && y < this.height;
  }

  occupied(x, z, ignoreTail = false, y = 0) {
    const n = ignoreTail ? this.cells.length - 1 : this.cells.length;
    for (let i = 0; i < n; i++) if (at(this.cells[i], x, z, y)) return true;
    return false;
  }

  // Is any layer of this board cell taken by the snake?
  columnOccupied(x, z) {
    for (const c of this.cells) if (c.x === x && c.z === z) return true;
    return false;
  }

  obstacleAt(x, z, solidOnly = true) {
    for (const o of this.obstacles) if (o.x === x && o.z === z && (o.solid || !solidOnly)) return o;
    return null;
  }

  padAt(x, z, y = 0) {
    for (const p of this.pads) if (at(p, x, z, y)) return p;
    return null;
  }

  chainIndexAt(x, z, y = 0) {
    if (!this.chain) return -1;
    const links = this.chain.links;
    for (let i = this.chain.next; i < links.length; i++) if (at(links[i], x, z, y)) return i;
    return -1;
  }

  // Cells that are blocked for spawning anything new (keys from cellKey).
  // flat: project everything onto the board, for placing full-height columns.
  takenSet(flat = false) {
    const taken = new Set();
    const add = (c) => taken.add(cellKey(c.x, c.z, flat ? 0 : Y(c)));
    this.cells.forEach(add);
    if (this.food) add(this.food);
    if (this.bonus) add(this.bonus);
    if (this.prey) add(this.prey);
    if (this.chain) for (let i = this.chain.next; i < this.chain.links.length; i++) add(this.chain.links[i]);
    for (const o of this.obstacles) for (let y = 0; y < (flat ? 1 : this.height); y++) taken.add(cellKey(o.x, o.z, y));
    for (const p of this.pads) add(p);
    for (const m of this.meteors) add(m);
    return taken;
  }

  freeCells(flat = false) {
    const taken = this.takenSet(flat);
    const H = flat ? 1 : this.height;
    const out = [];
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        if (this.space && (!this.isLand(x, z) || this.doomAt(x, z))) continue;
        for (let y = 0; y < H; y++) if (!taken.has(cellKey(x, z, y))) out.push({ x, z, y });
      }
    }
    return out;
  }

  // Cells along the current heading, used to keep new things out of the way.
  // flat: compare on the board only (for columns).
  inFrontOfHead(c, reach = 6, flat = false) {
    const h = this.head;
    const d = this.lastQueuedDir();
    for (let i = 1; i <= reach; i++) {
      if (h.x + d.x * i === c.x && h.z + d.z * i === c.z && (flat || Y(h) + Y(d) * i === Y(c))) return true;
    }
    return false;
  }

  pick(pool) {
    return pool[Math.floor(this.rng() * pool.length)];
  }

  // strict (Galactic Core): null rather than an unfair cell.
  spawn(type, avoid = null, strict = false) {
    let free = this.freeCells();
    if (avoid) free = free.filter((c) => c.x !== avoid.x || c.z !== avoid.z);
    if (!free.length) return null;
    const all = free;
    // Galactic Core: only where the head can still get to
    if (this.space) {
      const reach = this.reachMap();
      const ok = free.filter((c) => reach[c.x * this.size + c.z]);
      if (ok.length) free = ok;
    }
    // Prefer cells that are not right in front of the head so food never
    // appears where the player can't react to it.
    // Galactic Core: never on a dead end (the black hole is about to eat those)
    if (this.space) {
      const open = free.filter((c) => !this.leavesDeadEnd(c, []));
      if (open.length) free = open;
    }
    const h = this.head;
    const fair = free.filter((c) => this.dist(c, h) > 2);
    const pool = fair.length ? fair : free;
    const c = this.space && !this.sim ? this.fairCoreCell(pool, all, strict) : this.pick(pool);
    if (!c) return null;
    return { x: c.x, z: c.z, y: c.y, type, id: this.uid++, spawnedAt: this.time };
  }

  // Galactic Core: a random cell from pool, but a fair one. Best is a cell
  // the snake can get to, eat, and still be safe after (see planApple); next
  // best, one that at least leaves it a safe way on while the apple sits
  // there. For that it finds one way to get safe for good with no apple
  // about (see survive): any cell that way never touches is fine. It tries
  // pool first, then the rest of the board (more); with nothing fair at all,
  // it takes its first pick (or, if strict, none). The work is capped, as
  // this runs mid-move.
  fairCoreCell(pool, more = [], strict = false) {
    const first = this.pick(pool);
    const rest = more.filter((c) => !pool.includes(c));
    const g0 = this.simCopy();
    g0.food = null;
    const way = this.survive(g0, undefined, { n: 2000 });
    let wayCells = null;
    let end = null;
    if (way) {
      // the cells the head passes over, and where it ends up
      wayCells = new Set();
      end = this.simCopy(g0);
      for (const d of way) {
        this.simMove(end, d);
        wayCells.add(end.head.x * this.size + end.head.z);
      }
    }
    const safeWith = (c) => {
      if (!wayCells || wayCells.has(c.x * this.size + c.z)) return false;
      end.food = c;
      const ok = this.safeForGood(end);
      end.food = null;
      return ok;
    };
    const budget = { n: 4000 };
    let fallback = null;
    let tries = 0;
    for (const set of [pool, rest]) {
      const left = set.slice();
      while (left.length && budget.n > 0) {
        const c = tries++ === 0 ? first : this.pick(left);
        left.splice(left.indexOf(c), 1);
        if (!fallback && safeWith(c)) fallback = c;
        const g = this.simCopy();
        g.food = { x: c.x, z: c.z, y: 0, type: 'orb', id: -1 };
        if (g.planApple(budget)) return c;
      }
      if (fallback) return fallback;
    }
    const all = [...pool, ...rest];
    for (const c of all) if (safeWith(c)) return c;
    // the safe way runs over every cell: look for one it can wait beside
    // properly, apple and all
    const spare = { n: 3000 };
    for (const c of all) {
      if (spare.n <= 0) break;
      const g = this.simCopy();
      g.food = { x: c.x, z: c.z, y: 0, type: 'orb', id: -1 };
      const tried = { n: Math.min(1000, spare.n) };
      const ok = this.survive(g, undefined, tried);
      spare.n -= Math.min(1000, spare.n) - Math.max(0, tried.n);
      if (ok) return c;
    }
    return strict ? null : first;
  }

  // ---------------------------------------------------------------- chains
  spawnChain() {
    const n = 3 + Math.min(2, this.zone);
    const taken = this.takenSet();
    const nb = this.neighbours;
    const yOk = (y) => (this.flying ? y >= 1 && y < this.height - 1 : y === 0);
    const ok = (c) => c.x >= 1 && c.z >= 1 && c.x < this.size - 1 && c.z < this.size - 1 && yOk(c.y) && !taken.has(cellKey(c.x, c.z, c.y));
    for (let attempt = 0; attempt < 60; attempt++) {
      const start = this.pick(this.freeCells());
      if (!start || manhattan(start, this.head) < 6 || !ok(start)) continue;
      let d = this.pick(nb);
      const links = [{ x: start.x, z: start.z, y: start.y }];
      let cur = start;
      let good = true;
      for (let i = 1; i < n && good; i++) {
        if (this.rng() < 0.35) d = this.pick(nb.filter((e) => e.x * d.x + e.z * d.z + Y(e) * Y(d) === 0));
        const mid = { x: cur.x + d.x, z: cur.z + d.z, y: cur.y + Y(d) };
        const next = { x: cur.x + d.x * 2, z: cur.z + d.z * 2, y: cur.y + Y(d) * 2 };
        if (!ok(mid) || !ok(next) || this.inFrontOfHead(next, 3)) good = false;
        else {
          links.push(next);
          cur = next;
        }
      }
      if (good) {
        this.chain = { links, next: 0, id: this.uid++, spawnedAt: this.time, expires: this.time + 10000 + n * 1500 };
        return this.chain;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- prey
  spawnPrey() {
    if (this.flying) return null; // mice can't fly
    const pool = this.freeCells().filter((c) => manhattan(c, this.head) >= 9);
    if (!pool.length) return null;
    const c = this.pick(pool);
    this.prey = {
      x: c.x, z: c.z, px: c.x, pz: c.z, id: this.uid++, spawnedAt: this.time,
      expires: this.time + PREY_LIFETIME_MS, acc: 0, moves: 0, dir: this.pick(NEIGHBOURS), fleeing: false,
    };
    return this.prey;
  }

  preyMoveMs() {
    return Math.max(150, 290 - this.level * 9);
  }

  preyCanEnter(x, z, ahead) {
    if (!this.inBounds(x, z) || this.occupied(x, z) || this.obstacleAt(x, z, false)) return false;
    if (ahead && ahead.x === x && ahead.z === z) return false;
    if (this.food && this.food.x === x && this.food.z === z) return false;
    if (this.bonus && this.bonus.x === x && this.bonus.z === z) return false;
    if (this.chainIndexAt(x, z) >= 0) return false;
    return true;
  }

  movePrey(ahead) {
    const p = this.prey;
    const h = this.head;
    const options = [];
    for (const d of NEIGHBOURS) {
      const x = p.x + d.x;
      const z = p.z + d.z;
      if (this.preyCanEnter(x, z, ahead)) options.push({ x, z, d });
    }
    p.px = p.x;
    p.pz = p.z;
    const dist = manhattan(p, h);
    p.fleeing = dist <= 7;
    if (!options.length) return;
    let choice = null;
    if (p.fleeing) {
      // Run from the head, preferring open cells so it doesn't trap itself
      // too easily, with a little randomness to stay catchable.
      let bestScore = -Infinity;
      for (const o of options) {
        let open = 0;
        for (const d of NEIGHBOURS) if (this.preyCanEnter(o.x + d.x, o.z + d.z, null)) open++;
        const s = manhattan(o, h) * 1.0 + open * 0.3 + this.rng() * 0.9;
        if (s > bestScore) {
          bestScore = s;
          choice = o;
        }
      }
      if (manhattan(choice, h) <= dist && this.rng() < 0.3) choice = null; // hesitates
    } else if (this.rng() < 0.6) {
      const straight = options.find((o) => sameDir(o.d, p.dir));
      choice = straight && this.rng() < 0.6 ? straight : this.pick(options);
    }
    if (choice) {
      p.x = choice.x;
      p.z = choice.z;
      p.dir = choice.d;
      p.moves++;
    }
  }

  // ---------------------------------------------------------------- level events
  // Is every free cell still reachable from the head if `extra` cells were blocked?
  stillConnected(extra) {
    const s = this.size;
    const blocked = new Uint8Array(s * s);
    for (const o of this.obstacles) blocked[o.x * s + o.z] = 1;
    for (const e of extra) blocked[e.x * s + e.z] = 1;
    let total = 0;
    for (let i = 0; i < blocked.length; i++) if (!blocked[i]) total++;
    const h = this.head;
    if (blocked[h.x * s + h.z]) return false;
    const seen = new Uint8Array(s * s);
    const stack = [h.x * s + h.z];
    seen[stack[0]] = 1;
    let count = 0;
    while (stack.length) {
      const k = stack.pop();
      count++;
      const x = Math.floor(k / s);
      const z = k % s;
      for (const d of NEIGHBOURS) {
        const nx = x + d.x;
        const nz = z + d.z;
        if (nx < 0 || nz < 0 || nx >= s || nz >= s) continue;
        const nk = nx * s + nz;
        if (!blocked[nk] && !seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    return count === total;
  }

  addObstacles(n) {
    const added = [];
    if (this.flying) return added;
    const room = MAX_OBSTACLES - this.obstacles.length;
    n = Math.min(n, room);
    const h = { x: this.head.x, z: this.head.z };
    for (let i = 0; i < n; i++) {
      // judged on the board: in the sky an obstacle is a column through every layer
      const pool = this.freeCells(true).filter((c) => {
        if (c.x < 2 || c.z < 2 || c.x > this.size - 3 || c.z > this.size - 3) return false;
        if (manhattan(c, h) < 5 || this.inFrontOfHead(c, 8, true)) return false;
        // keep pillars apart so they never form tight pockets
        for (const o of this.obstacles) if (Math.abs(o.x - c.x) <= 2 && Math.abs(o.z - c.z) <= 2) return false;
        return true;
      });
      for (let tries = 0; tries < 30 && pool.length; tries++) {
        const k = Math.floor(this.rng() * pool.length);
        const c = pool.splice(k, 1)[0];
        if (!this.stillConnected([c])) continue;
        const o = { x: c.x, z: c.z, solid: false, solidAt: this.time + OBSTACLE_WARN_MS, id: this.uid++ };
        this.obstacles.push(o);
        added.push({ ...o });
        break;
      }
    }
    return added;
  }

  spawnPad() {
    const yOk = (y) => !this.flying || (y >= 1 && y < this.height - 1);
    const pool = this.freeCells().filter((c) => manhattan(c, this.head) >= 4 && !this.inFrontOfHead(c, 3) && c.x > 0 && c.z > 0 && c.x < this.size - 1 && c.z < this.size - 1 && yOk(c.y));
    if (!pool.length) return null;
    const c = this.pick(pool);
    const p = { x: c.x, z: c.z, y: c.y, id: this.uid++ };
    this.pads.push(p);
    return p;
  }

  padTarget() {
    if (this.space || this.bonusLevel) return 0;
    const z = this.zone;
    return z >= 3 ? 3 : z >= 1 ? 2 : 0;
  }

  onLevelUp(ev, prevLevel) {
    const lvl = this.level;
    const zonePrev = zoneForLevel(prevLevel);
    ev.levelUp = { level: lvl, zone: this.zone, zoneUp: this.zone > zonePrev };
    if (this.zone >= SPACE_ZONE && !this.space) {
      // hyperspeed: the run continues over the black hole
      this.enterSpace();
      ev.levelUp.warp = true;
      return;
    }
    if (!this.flying && this.zone < SKY_ZONE) {
      const grew = this.growBoard(this.boardSizeFor(this.zone));
      if (grew) ev.levelUp.grew = { pad: grew, size: this.size };
      if (grew) ev.levelUp.shift = grew;
    }
    if (this.zone === SKY_ZONE && !this.flying) {
      ev.levelUp.shift = Math.floor((SKY_SIZE - this.size) / 2);
      this.enterSky({ launch: true });
      ev.levelUp.liftoff = true;
    }
    let obstacles = [];
    for (let l = prevLevel + 1; l <= lvl; l++) if (OBSTACLE_PLAN[l]) obstacles = obstacles.concat(this.addObstacles(OBSTACLE_PLAN[l]));
    if (obstacles.length) ev.obstaclesWarned = obstacles;
    const pads = [];
    while (this.pads.length + this.padRespawns.length < this.padTarget()) {
      const p = this.spawnPad();
      if (!p) break;
      pads.push({ ...p });
    }
    if (pads.length) ev.padsSpawned = pads;
  }

  // Begin a fresh run at a later level (level select): that level's speed,
  // and the pillars and boost pads every earlier level would have added.
  // The snake starts short; pillars are already standing. A run that starts
  // in the sky starts already flying, in the middle of the box.
  startAtLevel(level) {
    const L = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
    if (L === 0) return;
    this.foodEaten = LEVEL_AT[Math.min(L, SPACE_START)];
    if (L >= SPACE_START) {
      this.enterSpace();
      return;
    }
    this.growBoard(this.boardSizeFor(Math.min(this.zone, SKY_ZONE - 1)));
    if (this.zone >= SKY_ZONE) {
      this.enterSky();
      return void this.fillPads();
    }
    for (let l = 1; l <= L; l++) if (OBSTACLE_PLAN[l]) this.addObstacles(OBSTACLE_PLAN[l]);
    for (const o of this.obstacles) o.solid = true;
    this.fillPads();
  }

  // Playtesting: lengthen the snake to n cells at once (a run starts with it
  // in a straight line). The extra body zig-zags in rows behind the tail; in
  // the sky it steps down a layer first and lies under the head's layer,
  // which stays clear. Whatever doesn't fit is added as growth instead.
  coilTo(n) {
    const t = this.cells[this.cells.length - 1];
    const p = this.cells[this.cells.length - 2] || this.head;
    const bz = Math.sign(t.z - p.z) || 1; // which way "behind" is
    const y = this.flying ? Y(t) - 1 : Y(t);
    const ok = (x, z) => this.inBounds(x, z, y) && !this.obstacleAt(x, z) && !this.occupied(x, z, false, y) && !(this.food && this.food.x === x && this.food.z === z && Y(this.food) === y);
    const add = (x, z) => {
      if (this.cells.length >= n || !ok(x, z)) return false;
      this.cells.push({ x, z, y });
      return true;
    };
    // first row: from under (or behind) the tail out to the side wall, then
    // full rows back and forth further behind
    let z = this.flying ? t.z : t.z + bz;
    let go = true;
    for (let x = t.x; x >= 0 && go; x--) go = add(x, z);
    let dir = 1;
    for (z += bz; go && z >= 0 && z < this.size; z += bz, dir = -dir) {
      for (let i = 0; i < this.size && go; i++) go = add(dir > 0 ? i : this.size - 1 - i, z);
    }
    this.pendingGrowth += Math.max(0, n - this.cells.length);
    this.removedTail = null;
  }

  fillPads() {
    while (this.pads.length < this.padTarget()) if (!this.spawnPad()) break;
  }

  // Lift off: the board becomes a bigger box of air. Coordinates shift by
  // SKY_PAD so the old board sits in the middle; the snake keeps its shape at
  // the layer level with the board (so nothing moves on screen) and, when
  // launching, then climbs SKY_CLIMB layers by itself. Pickups move up to
  // the middle where it will be flying, pillars and boost pads are left
  // behind (rings take the pads' place), and so is the golden mouse.
  enterSky({ launch = false } = {}) {
    if (this.flying) return;
    // the box is centred on the board, whatever size the board had grown to
    const pad = Math.floor((SKY_SIZE - this.size) / 2);
    const y0 = launch ? SKY_LIFT : SKY_CENTER;
    const shift = this.shiftGrid(pad, y0);
    const lift = (c) => shift(c, SKY_CENTER);
    this.flying = true;
    this.size = SKY_SIZE;
    this.height = SKY_H;
    this.yMid = SKY_LIFT;
    lift(this.food);
    lift(this.bonus);
    if (this.chain) this.chain.links.forEach(lift);
    this.obstacles = [];
    this.pads = [];
    this.padRespawns = [];
    this.prey = null;
    this.undoOk = false;
    if (launch) {
      this.queue = [{ ...DIRS.rise }];
      this.launch = SKY_CLIMB;
    }
  }

  // ---------------------------------------------------------------- bonus level
  // A fresh run on the bonus board: a short snake low in the middle heading
  // up, the first golden apple straight ahead, and nothing else at all.
  enterBonusLevel() {
    this.reset();
    const S = BONUS_SIZE;
    this.bonusLevel = true;
    this.size = S;
    const c = Math.floor(S / 2);
    const z0 = S - 5;
    this.cells = [];
    for (let i = 0; i < 4; i++) this.cells.push({ x: c, z: z0 + i, y: 0 });
    this.removedTail = { x: c, z: z0 + 4, y: 0 };
    this.preyTimer = Infinity;
    this.rush = 50;
    this.food = { x: c, z: z0 - 6, y: 0, type: 'orb', id: this.uid++, spawnedAt: 0 };
  }

  // ---------------------------------------------------------------- meteor storm
  // A fresh run in the epilogue: a short snake low on the left heading up,
  // its home (a solid cell) in the middle, and the first barrage of meteors
  // already burning on the board.
  enterMeteorLevel() {
    this.reset();
    const S = METEOR_SIZE;
    const c = Math.floor(S / 2);
    this.meteorLevel = true;
    this.size = S;
    this.home = { x: c, z: c };
    this.obstacles = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) this.obstacles.push({ x: c + dx, z: c + dz, solid: true, solidAt: 0, id: this.uid++, home: true });
    this.lives = METEOR_LIVES;
    const x0 = c - 4;
    const z0 = S - 6;
    this.cells = [];
    for (let i = 0; i < 5; i++) this.cells.push({ x: x0, z: z0 + i, y: 0 });
    this.removedTail = { x: x0, z: z0 + 5, y: 0 };
    this.preyTimer = Infinity;
    this.rush = 60;
    this.food = null;
    this.meteors = [];
    this.meteorsEaten = 0;
    this.meteorsSpawned = 0;
    this.wave = 0;
    this.nextWaveAt = 0;
    for (let i = 0; i < METEOR_FIRST; i++) {
      const m = this.spawnMeteor(0);
      if (m) m.landed = true;
    }
  }

  get meteorsLeft() {
    return Math.max(0, METEOR_TOTAL - this.meteorsEaten);
  }

  // Real time left (ms) before the last meteor finishes everything off.
  get timeLeft() {
    return Math.max(0, METEOR_TIME_MS - this.clock);
  }

  // A meteor aimed at a free cell: not right next to home, not right by the
  // head or in its path, and not where another one is.
  spawnMeteor(landAt) {
    const h = this.home;
    const head = this.head;
    let free = this.freeCells().filter((c) => !h || Math.max(Math.abs(c.x - h.x), Math.abs(c.z - h.z)) > 2);
    const fair = free.filter((c) => this.dist(c, head) > 3 && !this.inFrontOfHead(c, 5));
    if (fair.length) free = fair;
    if (!free.length) return null;
    const c = this.pick(free);
    const m = { x: c.x, z: c.z, y: 0, id: this.uid++, landAt, landed: false, type: 'meteor', spawnedAt: this.time };
    this.meteors.push(m);
    this.meteorsSpawned++;
    return m;
  }

  // Meteors land on time; once the sky has (nearly) emptied, the next wave.
  updateMeteors(ev) {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (m.landed || this.time < m.landAt) continue;
      if (this.occupied(m.x, m.z)) {
        // it clangs off the snake: gone, but it costs a life
        this.meteors.splice(i, 1);
        this.meteorsEaten++;
        this.lives = Math.max(0, this.lives - 1);
        (ev.meteorsSmashed || (ev.meteorsSmashed = [])).push({ ...m, lives: this.lives });
      } else {
        m.landed = true;
        (ev.meteorsLanded || (ev.meteorsLanded = [])).push({ ...m });
      }
    }
    const left = this.meteors.length;
    if (this.meteorsSpawned < METEOR_TOTAL && left <= 2 && this.time >= this.nextWaveAt) {
      const n = Math.min(METEOR_WAVES[this.wave] ?? 6, METEOR_TOTAL - this.meteorsSpawned);
      const list = [];
      for (let i = 0; i < n; i++) {
        const m = this.spawnMeteor(this.time + METEOR_WARN_MS + i * METEOR_STAGGER_MS);
        if (m) list.push({ ...m });
      }
      this.wave++;
      this.nextWaveAt = this.time + METEOR_WARN_MS + n * METEOR_STAGGER_MS;
      if (list.length) ev.meteorWave = { n: this.wave, of: METEOR_WAVES.length, meteors: list };
    }
  }

  // ---------------------------------------------------------------- galactic core
  // Drop onto the board over the black hole: a fresh, short snake low in the
  // middle heading up, a new apple, and nothing else from the old map.
  enterSpace() {
    const S = CORE_SIZE;
    this.space = true;
    this.flying = false;
    this.launch = 0;
    this.height = 1;
    this.yMid = 0;
    this.size = S;
    this.land = new Uint8Array(S * S).fill(1);
    this.spiral = spiralOrder(S);
    this.doomed = [];
    this.fallen = 0;
    this.fillTop = 0;
    this.calm = -1;
    this.calmFrom = 0;
    this.clearCoreTimers();
    const c = Math.floor(S / 2);
    const z0 = S - 5;
    this.dir = { ...DIRS.up };
    this.facing = { ...DIRS.up };
    this.queue = [];
    this.pendingGrowth = 0;
    this.cells = [];
    for (let i = 0; i < 4; i++) this.cells.push({ x: c, z: z0 + i, y: 0 });
    this.removedTail = { x: c, z: z0 + 4, y: 0 };
    this.bonus = null;
    this.chain = null;
    this.prey = null;
    this.obstacles = [];
    this.pads = [];
    this.padRespawns = [];
    this.boostTicks = 0;
    this.undoOk = false;
    this.food = null;
    this.food = this.spawn('orb');
  }

  // The Galactic Core's own clocks (when to look for a fair place for the
  // next apple, when to check on a stuck one) and the bot's plans are kept in
  // game time, which starts again from 0 every run: start them afresh too, or
  // a new run would wait for the old run's times (no apple for a long while).
  clearCoreTimers() {
    this.spawnTryAt = 0;
    this.appleCheckAt = 0;
    this.corePlanned = null;
    this.stallWay = null;
    this.appleAfter = null;
  }

  // Free cells (not snake, not about to fall) still on the board.
  // (The snake only ever lies on board cells, and never on the same one twice.)
  coreFree() {
    const L = this.land;
    let n = 0;
    for (let i = 0; i < L.length; i++) n += L[i];
    n -= this.cells.length;
    for (const d of this.doomed) if (!this.columnOccupied(d.x, d.z)) n--;
    return n;
  }

  bodyMask() {
    const S = this.size;
    const m = new Uint8Array(S * S);
    for (const c of this.cells) m[c.x * S + c.z] = 1;
    return m;
  }

  // Cells the head can get to (1 = yes), knowing when each body cell will be
  // vacated: body cell i (0 = head) is gone after cells.length - i moves.
  reachMap(gone = null) {
    return this.reachInfo(gone).reach;
  }

  // reachMap plus how many moves away each cell is (-1: out of reach).
  // gone: cells to treat as fallen already.
  reachInfo(gone = null) {
    const S = this.size;
    const n = this.cells.length;
    const free = new Int32Array(S * S).fill(-1); // moves until the cell is free
    for (let i = 0; i < S * S; i++) if (this.land[i]) free[i] = 0;
    if (gone) for (const c of gone) free[c.x * S + c.z] = -1;
    for (let i = 0; i < n; i++) {
      const c = this.cells[i];
      free[c.x * S + c.z] = n - i + this.pendingGrowth;
    }
    const dist = new Int32Array(S * S).fill(-1);
    const reach = new Uint8Array(S * S);
    const h = this.head;
    const q = [h.x * S + h.z];
    dist[q[0]] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi];
      const x = Math.floor(k / S);
      const z = k % S;
      for (const d of NEIGHBOURS) {
        const nx = x + d.x;
        const nz = z + d.z;
        if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
        const nk = nx * S + nz;
        if (dist[nk] >= 0 || free[nk] < 0) continue;
        const dd = dist[k] + 1;
        if (free[nk] > dd) continue; // still snake when we'd get there
        dist[nk] = dd;
        reach[nk] = 1;
        q.push(nk);
      }
    }
    return { reach, dist };
  }

  // Can the head still get back to its own tail (with these cells gone)?
  // While it can, the snake can always stay alive by following its tail.
  tailInReach(gone = null) {
    const t = this.cells[this.cells.length - 1];
    return this.reachMap(gone)[t.x * this.size + t.z] === 1;
  }

  // Would the board still be in one piece without these cells (and without
  // the ones already doomed)? The snake's cells count as board.
  landConnected(extra, skipDoomed = true) {
    const S = this.size;
    const L = this.land.slice();
    if (skipDoomed) for (const d of this.doomed) L[d.x * S + d.z] = 0;
    for (const e of extra) L[e.x * S + e.z] = 0;
    let total = 0;
    let start = -1;
    for (let i = 0; i < L.length; i++) {
      if (!L[i]) continue;
      total++;
      if (start < 0) start = i;
    }
    if (total === 0) return true;
    const h = this.head;
    if (L[h.x * S + h.z]) start = h.x * S + h.z;
    const seen = new Uint8Array(S * S);
    const stack = [start];
    seen[start] = 1;
    let count = 0;
    while (stack.length) {
      const k = stack.pop();
      count++;
      const x = Math.floor(k / S);
      const z = k % S;
      for (const d of NEIGHBOURS) {
        const nx = x + d.x;
        const nz = z + d.z;
        if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
        const nk = nx * S + nz;
        if (L[nk] && !seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    return count === total;
  }

  // Would cell c be left a dead end (one way in or none) with these cells
  // gone as well as the doomed ones? An apple there could only be eaten by
  // driving into it and dying.
  leavesDeadEnd(c, gone) {
    let n = 0;
    for (const d of NEIGHBOURS) {
      const x = c.x + d.x;
      const z = c.z + d.z;
      if (!this.isLand(x, z) || this.doomAt(x, z)) continue;
      if (gone.some((e) => e.x === x && e.z === z)) continue;
      n++;
    }
    return n <= 1;
  }

  // Board cells around (x, z) that will still be there.
  landDegree(x, z) {
    let n = 0;
    for (const d of NEIGHBOURS) if (this.isLand(x + d.x, z + d.z) && !this.doomAt(x + d.x, z + d.z)) n++;
    return n;
  }

  // An apple was eaten: doom the next n cells of the spiral, plus (for free)
  // any dead-end nubs.
  collapse(ev, n = COLLAPSE_PER_APPLE) {
    const S = this.size;
    const body = this.bodyMask();
    const { dist } = this.reachInfo();
    const h = this.head;
    // never take the cells right in front of the head, or cut it off from
    // its tail (if it can still reach it now)
    const near = Math.min(5, 2 + Math.floor(this.coreFree() / 12));
    const guardTail = this.tailInReach();
    const cand = [];
    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        const k = x * S + z;
        if (!this.land[k] || body[k] || this.doomAt(x, z)) continue;
        if (this.food && this.food.x === x && this.food.z === z) continue;
        if (Math.abs(x - h.x) + Math.abs(z - h.z) <= 1 || (dist[k] >= 0 && dist[k] < near)) continue;
        const cls = this.landDegree(x, z) <= 1 ? 0 : 2;
        cand.push({ x, z, cls, ord: this.spiral[k] });
      }
    }
    cand.sort((a, b) => a.cls - b.cls || a.ord - b.ord);
    const picked = [];
    let extra = 0;
    let spiral = 0;
    for (const c of cand) {
      if (c.cls < 2 ? extra >= MAX_FREE_EATS : spiral >= n) continue;
      if (!this.landConnected([...picked, c])) continue;
      if (this.food && this.leavesDeadEnd(this.food, [...picked, c])) continue;
      if (guardTail && !this.tailInReach([...this.doomed, ...picked, c])) continue;
      picked.push(c);
      if (c.cls < 2) extra++;
      else spiral++;
      if (spiral >= n && (extra >= MAX_FREE_EATS || c.cls === 2)) break;
    }
    const out = picked.map((c, i) => {
      const d = { x: c.x, z: c.z, doomAt: this.time, fallAt: this.time + DOOM_MS + i * DOOM_STAGGER_MS, id: this.uid++ };
      this.doomed.push(d);
      return { ...d };
    });
    if (out.length) ev.doomed = out;
    return out;
  }

  // Doomed cells fall once their time is up and the snake is off them. If
  // the board has changed so that one would now split it, it is spared; if
  // it would only cut off other doomed cells still standing, it waits.
  updateCollapse(ev) {
    if (!this.doomed.length) return;
    const S = this.size;
    const body = this.bodyMask();
    for (let i = 0; i < this.doomed.length; i++) {
      const d = this.doomed[i];
      if (this.time < d.fallAt || body[d.x * S + d.z]) continue;
      const others = this.doomed.filter((o) => o !== d);
      const saved = this.doomed;
      this.doomed = others;
      const ok = this.landConnected([d]);
      this.doomed = saved;
      if (!ok) {
        this.doomed.splice(i--, 1);
        continue;
      }
      // if it would leave cells still standing cut off (doomed ones that
      // haven't gone yet), it waits for them to go first
      if (!this.landConnected([d], false)) continue;
      this.doomed.splice(i--, 1);
      this.land[d.x * S + d.z] = 0;
      this.fallen++;
      (ev.fell || (ev.fell = [])).push({ x: d.x, z: d.z, id: d.id });
    }
  }

  // Autoplay in the Galactic Core (the title-screen demo and the tests). It
  // plans by trying moves out on copies of the game (real steps, so cells
  // fall exactly when they would), and only commits to a route to the apple
  // if, once it has eaten (and the black hole has taken its cells), it can
  // still find a way to stay alive for a whole body length and more. If no
  // such route exists yet it stalls safely, the same way, until one does.
  corePlan() {
    if (!this.alive) return null;
    const p = this.corePlanned;
    if (p && p.length && p.tick === this.ticks && sameFood(p.food, this.food) && p.at === this.head.x * this.size + this.head.z) {
      const d = p.shift();
      p.tick = this.ticks + 1;
      p.at = (this.head.x + d.x) * this.size + this.head.z + d.z;
      return d;
    }
    this.corePlanned = null;
    this.appleAfter = null;
    let plan = this.planApple();
    if (plan && this.appleAfter) {
      // after eating, the way it knows is safe (the next apple never goes on
      // it, see fairCoreCell), to fall back on if it can't find another
      const f = this.food;
      this.stallWay = { path: this.appleAfter, tick: this.ticks + plan.length, at: f.x * this.size + f.z, food: '*' };
    }
    if (!plan) plan = this.planStall();
    if (!plan || !plan.length) return null;
    const d = plan.shift();
    if (plan.length) {
      plan.tick = this.ticks + 1;
      plan.food = this.food;
      plan.at = (this.head.x + d.x) * this.size + this.head.z + d.z;
      this.corePlanned = plan;
    }
    return d;
  }

  // A copy of the game to try moves on: real steps, its own dull rng (so the
  // real game's luck isn't used up). It keeps the apple there is now, but
  // gets no new one once that is eaten.
  simCopy(src = this) {
    const g = Object.create(Object.getPrototypeOf(src));
    let plan = src.simPlan;
    if (!plan) {
      // how to copy each field: share it, copy the array, or copy the object
      plan = { keys: Object.keys(src), how: [] };
      for (const k of plan.keys) {
        const v = src[k];
        plan.how.push(SIM_SHARED.has(k) ? 0 : Array.isArray(v) || ArrayBuffer.isView(v) ? 1 : v && typeof v === 'object' && v.constructor === Object ? 2 : 0);
      }
    }
    const { keys, how } = plan;
    for (let i = 0; i < keys.length; i++) {
      const v = src[keys[i]];
      g[keys[i]] = v == null ? v : how[i] === 1 ? v.slice() : how[i] === 2 ? { ...v } : v;
    }
    g.simPlan = plan;
    g.rng = () => 0.5;
    g.undo = null;
    g.corePlanned = null;
    g.sim = true;
    return g;
  }

  // One move on a copy; false if it died (a win counts as alive).
  simMove(g, d) {
    g.queue = [{ x: d.x, z: d.z, y: 0 }];
    const ev = g.step();
    return g.alive || g.won || ev.won;
  }

  // Moves that don't kill the snake straight away.
  coreMoves(g = this) {
    const out = [];
    for (const d of NEIGHBOURS) {
      if (opposite(d, g.dir)) continue;
      const x = g.head.x + d.x;
      const z = g.head.z + d.z;
      if (!g.isLand(x, z)) continue;
      const growing = g.pendingGrowth > 0 || (g.food && g.food.x === x && g.food.z === z);
      if (g.occupied(x, z, !growing)) continue;
      out.push(d);
    }
    return out;
  }

  // Safe for good: nothing is left to fall, the snake isn't growing, and
  // the head has a clear run (over empty cells, not the apple) to beside
  // its tail. Then the body plus that run is a loop the snake can circle
  // for ever, and the cells under the body can't fall.
  safeForGood(g) {
    if (g.won) return true;
    if (g.doomed.length || g.pendingGrowth > 0) return false;
    const S = g.size;
    const h = g.head;
    const t = g.cells[g.cells.length - 1];
    if (Math.abs(h.x - t.x) + Math.abs(h.z - t.z) === 1) return true;
    const body = g.bodyMask();
    const seen = new Uint8Array(S * S);
    const q = [h.x * S + h.z];
    seen[q[0]] = 1;
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi];
      const x = Math.floor(k / S);
      const z = k % S;
      for (const d of NEIGHBOURS) {
        const nx = x + d.x;
        const nz = z + d.z;
        if (!g.isLand(nx, nz)) continue;
        const nk = nx * S + nz;
        if (seen[nk] || body[nk]) continue;
        if (g.food && g.food.x === nx && g.food.z === nz) continue;
        if (Math.abs(nx - t.x) + Math.abs(nz - t.z) === 1) return true;
        seen[nk] = 1;
        q.push(nk);
      }
    }
    return false;
  }

  // How far ahead to look for that: past every cell yet to fall, and long
  // enough to unwind the whole body.
  safeHorizon(g) {
    let last = 0;
    const iv = g.currentInterval();
    for (const d of g.doomed) last = Math.max(last, Math.ceil((d.fallAt - g.time) / iv));
    return Math.max(last, 0) + g.cells.length * 2 + 8;
  }

  // Moves that get the copy safe for good, or null. Depth-first, trying the
  // moves that keep the tail in reach and leave the most room first, and
  // giving up after `budget` tries.
  survive(g, depth = this.safeHorizon(g), budget = { n: 1500 }) {
    if (this.safeForGood(g)) return [];
    if (depth <= 0) return null;
    // positions already found to be hopeless (cells still to fall make the
    // time matter, so it's part of the key until they're gone)
    const dead = budget.dead || (budget.dead = new Set());
    let key = g.pendingGrowth + (g.doomed.length ? '@' + Math.round(g.time) : '') + ':' + g.dir.x + g.dir.z;
    for (const c of g.cells) key += ',' + (c.x * g.size + c.z);
    if (dead.has(key)) return null;
    const kids = [];
    for (const d of this.coreMoves(g)) {
      if (budget.n-- <= 0) return null;
      const c = this.simCopy(g);
      if (!this.simMove(c, d)) continue;
      if (c.won) return [d];
      kids.push({ d, c, s: this.roomScore(c) + (sameDir(d, g.dir) ? 0.5 : 0) });
    }
    kids.sort((a, b) => b.s - a.s);
    for (const { d, c } of kids) {
      const rest = this.survive(c, depth - 1, budget);
      if (rest) return [d, ...rest];
      if (budget.n <= 0) return null;
    }
    if (!g.doomed.length) dead.add(key); // (with cells to fall, a shallower look may have run out of depth)
    return null;
  }

  // How good a copy's position looks: tail in reach first, then room to move
  // (counting cells about to fall as gone already).
  // (reachInfo, without making new arrays: this runs for every move tried)
  roomScore(g) {
    const S = g.size;
    const N = S * S;
    if (!scratch.free || scratch.free.length < N) {
      scratch.free = new Int32Array(N);
      scratch.dist = new Int32Array(N);
      scratch.q = new Int32Array(N);
    }
    const { free, dist, q } = scratch;
    for (let i = 0; i < N; i++) {
      free[i] = g.land[i] ? 0 : -1;
      dist[i] = -1;
    }
    for (const d of g.doomed) free[d.x * S + d.z] = -1;
    const n = g.cells.length;
    for (let i = 0; i < n; i++) free[g.cells[i].x * S + g.cells[i].z] = n - i + g.pendingGrowth;
    const h = g.head;
    let qn = 0;
    q[qn++] = h.x * S + h.z;
    dist[q[0]] = 0;
    let room = 0;
    for (let qi = 0; qi < qn; qi++) {
      const k = q[qi];
      const x = (k / S) | 0;
      const z = k - x * S;
      for (const d of NEIGHBOURS) {
        const nx = x + d.x;
        const nz = z + d.z;
        if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
        const nk = nx * S + nz;
        if (dist[nk] >= 0 || free[nk] < 0 || free[nk] > dist[k] + 1) continue;
        dist[nk] = dist[k] + 1;
        room++;
        q[qn++] = nk;
      }
    }
    const t = g.cells[n - 1];
    return (n < 5 || dist[t.x * S + t.z] > 0 ? 1000 : 0) + room;
  }

  // Routes to the apple worth trying: the shortest one, then ones that leave
  // the head pointing each other way, shortest first.
  appleRoutes() {
    const routes = [];
    const seen = new Set();
    const add = (cells) => {
      if (!cells || !cells.length) return;
      const key = cells.map((c) => c.x * this.size + c.z).join(',');
      if (seen.has(key)) return;
      seen.add(key);
      routes.push(cells);
    };
    add(this.pathTo(this.food));
    for (const first of this.coreMoves()) {
      const g = this.simCopy();
      if (!this.simMove(g, first)) continue;
      if (!g.alive) continue;
      if (g.head.x === this.food.x && g.head.z === this.food.z) {
        add([{ x: g.head.x, z: g.head.z }]);
        continue;
      }
      const rest = g.pathTo(this.food);
      if (rest) add([{ x: g.head.x, z: g.head.z }, ...rest]);
    }
    routes.sort((a, b) => a.length - b.length);
    return routes.slice(0, 4);
  }

  // A route to the apple after which the snake can still stay alive.
  planApple(budget = { n: 4000 }) {
    if (!this.food) return null;
    for (const route of this.appleRoutes()) {
      if (budget.n <= 0) return null;
      const g = this.simCopy();
      const dirs = [];
      let ok = true;
      let h = this.head;
      for (const c of route) {
        const d = { x: c.x - h.x, z: c.z - h.z, y: 0 };
        dirs.push(d);
        if (!this.simMove(g, d)) {
          ok = false;
          break;
        }
        h = c;
      }
      if (!ok || sameFood(g.food, this.food)) continue;
      if (g.won) return dirs;
      budget.n -= route.length;
      const tried = { n: Math.min(1500, budget.n) };
      const after = this.survive(g, undefined, tried);
      budget.n -= Math.min(1500, budget.n) - Math.max(0, tried.n);
      if (after) {
        this.appleAfter = after; // its safe way on, once it has eaten
        return dirs;
      }
    }
    return null;
  }

  // No safe route to the apple yet: take a move that is still safe for good,
  // the one closest to the apple (now and then a random one, so it doesn't
  // circle the same loop for ever). If none is, the one with the most room.
  planStall() {
    const safe = [];
    let best = null;
    let top = -Infinity;
    for (const d of this.coreMoves()) {
      const g = this.simCopy();
      if (!this.simMove(g, d)) continue;
      if (g.won) return [d];
      const path = this.survive(g, undefined, { n: 3000 });
      const len = this.food && sameFood(g.food, this.food) ? g.pathLen(this.food) : 0;
      if (path) safe.push({ d, len: len < 0 ? 999 : len, path });
      const r = g.reachMap(g.doomed);
      let s = 0;
      for (let i = 0; i < r.length; i++) s += r[i];
      if (g.cells.length < 5 || g.tailInReach(g.doomed)) s += 1e4;
      if (s > top) {
        top = s;
        best = d;
      }
    }
    const keep = (pick) => {
      // remember the rest of its safe way, in case a later look misses it
      const at = (this.head.x + pick.d.x) * this.size + this.head.z + pick.d.z;
      this.stallWay = { path: pick.path, tick: this.ticks + 1, at, food: this.food };
      return [pick.d];
    };
    if (safe.length) {
      if (safe.length > 1 && this.botRand() < 0.25) return keep(safe[Math.floor(this.botRand() * safe.length)]);
      safe.sort((a, b) => a.len - b.len);
      return keep(safe[0]);
    }
    // nothing found this time: carry on along the safe way found before
    const w = this.stallWay;
    if (w && w.path.length && w.tick === this.ticks && w.at === this.head.x * this.size + this.head.z && (w.food === '*' || sameFood(w.food, this.food))) {
      const d = w.path[0];
      return keep({ d, path: w.path.slice(1) });
    }
    return best ? [best] : null;
  }

  // The bot's own dice, so its choices don't use up the game's luck.
  botRand() {
    let t = (this.botSeed = ((this.botSeed || 0x9e3779b9) + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // The cells of the shortest route from the head to c (time-aware, as in
  // reachMap), not counting the head; null if there is none.
  pathTo(c) {
    const S = this.size;
    const n = this.cells.length;
    const free = new Int32Array(S * S).fill(-1);
    for (let i = 0; i < S * S; i++) if (this.land[i]) free[i] = 0;
    for (let i = 0; i < n; i++) free[this.cells[i].x * S + this.cells[i].z] = n - i + this.pendingGrowth;
    for (const d of this.doomed) free[d.x * S + d.z] = -1; // don't plan across cells about to fall
    const dist = new Int32Array(S * S).fill(-1);
    const from = new Int32Array(S * S).fill(-1);
    const h = this.head;
    const q = [h.x * S + h.z];
    dist[q[0]] = 0;
    const goal = c.x * S + c.z;
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi];
      if (k === goal) {
        const out = [];
        for (let j = k; j !== q[0]; j = from[j]) out.unshift({ x: Math.floor(j / S), z: j % S });
        return out;
      }
      const x = Math.floor(k / S);
      const z = k % S;
      for (const d of NEIGHBOURS) {
        const nx = x + d.x;
        const nz = z + d.z;
        if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
        if (k === q[0] && opposite(d, this.dir)) continue;
        const nk = nx * S + nz;
        if (dist[nk] >= 0 || free[nk] < 0 || free[nk] > dist[k] + 1) continue;
        dist[nk] = dist[k] + 1;
        from[nk] = k;
        q.push(nk);
      }
    }
    return null;
  }

  // Moves from the head to cell c (time-aware, as in reachMap), or -1.
  pathLen(c) {
    const S = this.size;
    const n = this.cells.length;
    const free = new Int32Array(S * S).fill(-1);
    for (let i = 0; i < S * S; i++) if (this.land[i]) free[i] = 0;
    for (let i = 0; i < n; i++) free[this.cells[i].x * S + this.cells[i].z] = n - i + this.pendingGrowth;
    const dist = new Int32Array(S * S).fill(-1);
    const h = this.head;
    const q = [h.x * S + h.z];
    dist[q[0]] = 0;
    const goal = c.x * S + c.z;
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi];
      if (k === goal) return dist[k];
      const x = Math.floor(k / S);
      const z = k % S;
      for (const d of NEIGHBOURS) {
        const nx = x + d.x;
        const nz = z + d.z;
        if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
        const nk = nx * S + nz;
        if (dist[nk] >= 0 || free[nk] < 0 || free[nk] > dist[k] + 1) continue;
        dist[nk] = dist[k] + 1;
        q.push(nk);
      }
    }
    return -1;
  }

  // Cells straight ahead along the heading the snake will take next, up to the
  // first obstacle. Used for the path guide and danger warnings.
  lookAhead(max = this.size) {
    const d = this.lastQueuedDir();
    const out = { free: 0, blocked: 'wall' };
    let x = this.head.x;
    let z = this.head.z;
    let y = Y(this.head);
    for (let i = 0; i < max; i++) {
      x += d.x;
      z += d.z;
      y += Y(d);
      if (!this.inBounds(x, z, y)) {
        out.blocked = 'wall';
        return out;
      }
      if (this.obstacleAt(x, z)) {
        out.blocked = 'obstacle';
        return out;
      }
      if (this.occupied(x, z, i === 0, y)) {
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

  registerEat() {
    this.combo = this.clock - this.lastEatTime <= COMBO_WINDOW_MS ? Math.min(MAX_COMBO, this.combo + 1) : 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.lastEatTime = this.clock;
  }

  get scoreMult() {
    return this.rushing || this.boostTicks > 0 ? 2 : 1;
  }

  // Advance one grid move. Returns an event object describing what happened.
  step() {
    const ev = { ate: null, died: false, cause: null, turned: false, bonusExpired: false, won: false };
    if (!this.alive) return ev;
    if (this.sim) return this.advance(ev); // the bot's planning copies can't be undone
    // Snapshot for the late-turn grace window (see regrace).
    this.undo = {
      cells: this.cells.slice(), removedTail: this.removedTail, pendingGrowth: this.pendingGrowth,
      dir: this.dir, facing: this.facing, queue: this.queue.slice(), time: this.time, clock: this.clock, ticks: this.ticks,
      rush: this.rush, rushing: this.rushing, boostTicks: this.boostTicks,
      prey: this.prey ? { ...this.prey } : null, preyTimer: this.preyTimer,
    };
    this.undoOk = false;
    const result = this.advance(ev);
    // Only a plain straight move (nothing eaten, spawned, expired or turned) can be redone.
    this.undoOk = this.alive && Object.entries(result).every(([k, v]) => k === 'cause' || !v);
    return result;
  }

  // A turn pressed just after the snake committed to its next cell would
  // otherwise only apply one cell later, which feels laggy because the drawn
  // head is still behind. If the last step was a plain straight move, undo it
  // and take it again in the new direction.
  canRegrace() {
    return this.alive && !!this.undoOk && this.queue.length === 0 && this.launch === 0;
  }

  regrace(d) {
    if (!this.canRegrace()) return null;
    const u = this.undo;
    if (sameDir(d, u.dir) || opposite(d, u.dir)) return null;
    this.cells = u.cells;
    this.removedTail = u.removedTail;
    this.pendingGrowth = u.pendingGrowth;
    this.dir = u.dir;
    this.facing = u.facing;
    this.time = u.time;
    this.clock = u.clock;
    this.ticks = u.ticks;
    this.rush = u.rush;
    this.rushing = u.rushing;
    this.boostTicks = u.boostTicks;
    this.prey = u.prey;
    this.preyTimer = u.preyTimer;
    this.queue = [{ x: d.x, z: d.z, y: Y(d) }];
    this.undoOk = false;
    const ev = this.step();
    ev.regraced = true;
    return ev;
  }

  // Relative turn resolved against the heading (the facing while climbing or diving).
  turnDir(side) {
    const l = this.lastFacing();
    return side > 0 ? { x: -l.z + 0, z: l.x + 0, y: 0 } : { x: l.z + 0, z: -l.x + 0, y: 0 };
  }

  advance(ev) {

    this.rushing = this.wantRush && this.rush > 0;
    const interval = this.currentInterval();
    this.time += interval;
    const real = interval / this.clockScale;
    this.clock += real;
    this.ticks++;
    if (this.rushing) this.rush = Math.max(0, this.rush - (RUSH_DRAIN_PER_SEC * real) / 1000);
    if (this.boostTicks > 0) this.boostTicks--;

    if (this.queue.length) {
      this.dir = this.queue.shift();
      if (!Y(this.dir)) this.facing = this.dir;
      ev.turned = true;
    }
    // lift-off: climb straight up, then level out the way we were going.
    // (It climbs whatever the queue says, so nothing that clears the queue,
    // like an autoplay, can leave it stuck mid-lift-off with steering locked.)
    if (this.launch > 0) {
      this.dir = { ...DIRS.rise };
      if (--this.launch === 0) this.queue = [{ ...this.facing }];
    }

    // timed things
    if (this.bonus && this.time > this.bonus.expires) {
      ev.bonusExpired = { ...this.bonus };
      this.bonus = null;
    }
    if (this.chain && this.time > this.chain.expires) {
      ev.chainExpired = { ...this.chain };
      this.chain = null;
    }
    for (const o of this.obstacles) {
      // Rise only once the cell is clear, so a pillar never crushes the snake.
      if (!o.solid && this.time >= o.solidAt && !this.columnOccupied(o.x, o.z)) {
        o.solid = true;
        (ev.obstaclesRaised || (ev.obstaclesRaised = [])).push({ ...o });
      }
    }
    for (let i = this.padRespawns.length - 1; i >= 0; i--) {
      if (this.time >= this.padRespawns[i]) {
        this.padRespawns.splice(i, 1);
        const p = this.spawnPad();
        if (p) (ev.padsSpawned || (ev.padsSpawned = [])).push({ ...p });
      }
    }

    if (this.space) this.updateCollapse(ev);
    if (this.meteorLevel) {
      this.updateMeteors(ev);
      // out of lives, or out of time: it's over
      const end = this.lives <= 0 ? 'crushed' : this.clock >= METEOR_TIME_MS ? 'doom' : null;
      if (end) {
        this.die(end);
        ev.died = true;
        ev.cause = end;
        return ev;
      }
    }

    const h = this.head;
    let nx = h.x + this.dir.x;
    let nz = h.z + this.dir.z;
    let ny = Y(h) + Y(this.dir);

    // prey moves on its own clock, never into the cell the head is entering
    if (this.prey) {
      if (this.time > this.prey.expires) {
        ev.preyEscaped = { ...this.prey };
        this.prey = null;
        this.preyTimer = 20000 + this.rng() * 12000;
      } else {
        this.prey.acc += interval;
        const ms = this.preyMoveMs();
        let guard = 0;
        while (this.prey.acc >= ms && guard++ < 3) {
          this.prey.acc -= ms;
          this.movePrey({ x: nx, z: nz });
        }
      }
    } else if (this.foodEaten >= 2 && !this.flying && !this.space && !this.bonusLevel) {
      this.preyTimer -= interval;
      if (this.preyTimer <= 0) {
        const p = this.spawnPrey();
        if (p) ev.preySpawned = { ...p };
        else this.preyTimer = 3000;
      }
    }

    // in the sky the walls are a laser fence and pillars are laser columns
    if (!this.inBounds(nx, nz, ny)) {
      const cause = this.space ? 'void' : this.flying ? 'laser' : 'wall';
      this.die(cause);
      ev.died = true;
      ev.cause = cause;
      ev.hit = { x: nx, z: nz, y: ny }; // where the head crashed
      return ev;
    }
    if (this.obstacleAt(nx, nz)) {
      const cause = this.obstacleAt(nx, nz).home ? 'home' : 'obstacle';
      this.die(cause);
      ev.died = true;
      ev.cause = cause;
      ev.hit = { x: nx, z: nz, y: ny }; // where the head crashed
      return ev;
    }

    let eaten = null;
    if (this.food && at(this.food, nx, nz, ny)) eaten = this.food;
    else if (this.bonus && at(this.bonus, nx, nz, ny)) eaten = this.bonus;
    const caught = this.prey && at(this.prey, nx, nz, ny) ? this.prey : null;
    const meteor = this.meteorLevel ? this.meteors.find((m) => m.landed && m.x === nx && m.z === nz) || null : null;

    const growing = this.pendingGrowth > 0 || !!eaten || !!caught || !!meteor;
    if (this.occupied(nx, nz, !growing, ny)) {
      this.die('body');
      ev.died = true;
      ev.cause = 'body';
      ev.hit = { x: nx, z: nz, y: ny };
      return ev;
    }

    if (eaten) {
      const def = FOOD_TYPES[eaten.type];
      this.registerEat();
      const points = def.points * this.combo * this.scoreMult;
      this.score += points;
      // an apple grows by the map it was eaten on (before any level-up it brings)
      this.pendingGrowth += this.space || this.bonusLevel ? 1 : eaten.type === 'orb' ? appleGrowth(this.zone) : def.grow;
      this.rush = Math.min(100, this.rush + def.rush);
      const prevLevel = this.level;
      if (eaten.type === 'orb') this.foodEaten++;
      ev.ate = { ...eaten, points, combo: this.combo, rushing: this.scoreMult > 1, levelUp: this.level > prevLevel };
      if (this.level > prevLevel) {
        this.onLevelUp(ev, prevLevel);
        if (ev.levelUp.warp) {
          // the run jumps to the Galactic Core: this step ends here
          if (this.score > this.best) {
            this.best = this.score;
            this.newBest = true;
          }
          return ev;
        }
        const pad = ev.levelUp.shift || 0;
        if (pad) {
          // the board just grew (or turned into the sky box) around us
          nx += pad;
          nz += pad;
          if (ev.levelUp.liftoff) ny = SKY_LIFT;
          Object.assign(ev.ate, { x: eaten.x, z: eaten.z, y: ev.levelUp.liftoff ? SKY_LIFT : ny });
        }
      }
    }

    if (caught) {
      const def = FOOD_TYPES.prey;
      this.registerEat();
      const points = def.points * this.combo * this.scoreMult;
      this.score += points;
      this.pendingGrowth += def.grow;
      this.rush = Math.min(100, this.rush + def.rush);
      this.stats.prey++;
      ev.caught = { ...caught, type: 'prey', points, combo: this.combo };
      this.prey = null;
      this.preyTimer = 18000 + this.rng() * 12000;
    }

    if (meteor) {
      this.meteors.splice(this.meteors.indexOf(meteor), 1);
      this.registerEat();
      const points = METEOR_POINTS * this.combo * this.scoreMult;
      this.score += points;
      this.pendingGrowth += 1;
      this.rush = Math.min(100, this.rush + 20);
      this.meteorsEaten++;
      ev.ate = { ...meteor, type: 'meteor', points, combo: this.combo, rushing: this.scoreMult > 1, left: this.meteorsLeft };
    }

    const link = this.chainIndexAt(nx, nz, ny);
    if (link >= 0) {
      const ch = this.chain;
      if (link === ch.next) {
        ch.next++;
        const points = CHAIN_LINK_POINTS * ch.next * this.scoreMult;
        this.score += points;
        this.rush = Math.min(100, this.rush + CHAIN_LINK_RUSH);
        this.lastEatTime = this.clock; // keeps a combo alive
        ev.chainLink = { x: nx, z: nz, y: ny, index: link, of: ch.links.length, points };
        if (ch.next >= ch.links.length) {
          const bonus = CHAIN_BONUS_PER_LINK * ch.links.length * this.scoreMult;
          this.score += bonus;
          this.rush = 100;
          this.stats.chains++;
          ev.chainComplete = { x: nx, z: nz, y: ny, bonus, links: ch.links.length };
          this.chain = null;
        }
      } else {
        ev.chainBroken = { ...ch, x: nx, z: nz, y: ny };
        this.chain = null;
      }
    }

    const pad = this.padAt(nx, nz, ny);
    if (pad) {
      this.pads.splice(this.pads.indexOf(pad), 1);
      this.padRespawns.push(this.time + PAD_RESPAWN_MS);
      this.boostTicks = BOOST_TICKS;
      this.score += PAD_POINTS * (this.rushing ? 2 : 1);
      this.rush = Math.min(100, this.rush + PAD_RUSH);
      this.stats.pads++;
      ev.boost = { ...pad };
    }

    this.cells.unshift({ x: nx, z: nz, y: ny });
    if (this.pendingGrowth > 0) {
      this.pendingGrowth--;
      this.removedTail = null;
    } else {
      this.removedTail = this.cells.pop();
    }

    if (this.space) {
      this.fillTop = Math.max(this.fillTop, this.fill);
      if (this.calm >= 0) this.calm = Math.min(CORE_CALM_MOVES, this.calm + 1);
      else if (this.cells.length >= CORE_CALM_LEN) {
        this.calmFrom = this.baseInterval();
        this.calm = 0;
        ev.calm = true;
      }
      // the black hole feeds on the board; once every cell left is snake, it's won
      if (eaten) {
        this.food = null;
        this.collapse(ev);
        this.fillTop = Math.max(this.fillTop, this.fill); // (the speed the next apple is judged at)
      }
      // A new one only goes somewhere fair (see fairCoreCell). If there's no
      // such place yet it waits, and looks again a few times a second. (The
      // bot's planning copies don't get one, as they can't know where it'll
      // be, unless there's only one cell left for it.)
      const left = this.food ? 0 : this.coreFree();
      if (left === 1) this.food = this.spawn('orb');
      else if (left > 1 && !this.sim && this.time >= (this.spawnTryAt || 0)) {
        this.food = this.spawn('orb', null, true);
        if (!this.food) this.spawnTryAt = this.time + 400;
      }
      // an apple that has sat a while and still can't be eaten without
      // getting trapped is swallowed by the black hole, and a fair one
      // appears (or, if there's nowhere fair yet, one will soon)
      if (this.food && !this.sim && this.time - this.food.spawnedAt > APPLE_STUCK_MS && this.time >= (this.appleCheckAt || 0)) {
        this.appleCheckAt = this.time + 1000;
        if (!this.planApple()) {
          // (and takes a bite of the board, as if it had been eaten, but only
          // if that still leaves the snake a safe way on)
          const old = this.food;
          this.food = null;
          const n0 = this.doomed.length;
          const told = ev.doomed;
          this.collapse(ev);
          if (this.doomed.length > n0 && !this.survive(this.simCopy(), undefined, { n: 2000 })) {
            this.doomed.length = n0;
            ev.doomed = told;
          }
          this.food = this.spawn('orb', old, true);
          ev.appleMoved = { from: { ...old }, to: this.food ? { ...this.food } : null };
        }
      }
      if (this.coreFree() <= 0) {
        this.food = null;
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
      this.fillTop = Math.max(this.fillTop, this.fill);
      return ev;
    }

    if (this.meteorLevel) {
      if (this.meteorsEaten >= METEOR_TOTAL) {
        this.won = true;
        this.die('win');
        ev.won = true;
        ev.died = true;
        ev.cause = 'win';
      }
    } else if (eaten === this.food && this.bonusLevel) {
      this.food = this.spawn('orb');
    } else if (eaten === this.food) {
      this.food = this.spawn('orb');
      const r = this.rng();
      if (!this.bonus && this.foodEaten >= 3 && r < 0.28) {
        const b = this.spawn('prism');
        if (b) {
          b.expires = this.time + PRISM_LIFETIME_MS;
          this.bonus = b;
          ev.bonusSpawned = { ...b };
        }
      } else if (!this.chain && this.foodEaten >= 5 && r < 0.5) {
        const c = this.spawnChain();
        if (c) ev.chainSpawned = { ...c, links: c.links.map((l) => ({ ...l })) };
      }
    } else if (eaten && eaten === this.bonus) {
      this.bonus = null;
    }

    if (!this.space && !this.meteorLevel && !this.food && !this.bonus && this.freeCells().length === 0) {
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
