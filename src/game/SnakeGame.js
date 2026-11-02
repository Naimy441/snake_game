// Pure game state for Snake Rush. No rendering here: every camera mode reads
// the same instance, so the rules are identical whichever view is active.

import { LAYOUTS, SYMMETRIES, layoutStages, layoutUpTo } from './maps.js';

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
export const MAX_COMBO = 8;
export const PRISM_LIFETIME_MS = 9000;
export const RUSH_DRAIN_PER_SEC = 32;
export const MAX_LEVEL = 15;
export const MIN_INTERVAL = 72; // ~14 cells/s

// Difficulty ramp. Apples needed to clear each level: short levels in the
// first zone, longer ones later. Milliseconds per move at each level: a
// gentle warm-up in Emerald Coast that builds to the top speed in Cyber
// Overdrive. Flying in three dimensions is a new skill, so Sunset Heavens
// starts slower again and builds back up.
export const LEVEL_COSTS = [3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 6];
export const LEVEL_SPEEDS = [175, 163, 152, 142, 133, 124, 115, 106, 98, 90, 83, 77, 128, 116, 105, 95];
// Total apples eaten at which each level starts.
export const LEVEL_AT = LEVEL_COSTS.reduce((acc, c) => (acc.push(acc[acc.length - 1] + c), acc), [0]);
export const MIN_FAST_INTERVAL = 48; // ~21 cells/s with Rush or Boost

// The world changes zone every few speed levels.
export const ZONE_STARTS = [0, 3, 6, 9, 12];
export const ZONE_NAMES = ['Emerald Coast', 'Golden Canyon', 'Neon Night', 'Cyber Overdrive', 'Sunset Heavens'];

// Sunset Heavens: the snake straps on a jetpack and the board becomes a box
// of air, fenced in by lasers: SKY_PAD cells wider than the board on every
// side (SKY_SIZE across) and SKY_H layers tall. Layer SKY_LIFT is level with
// where the board was; at lift-off the snake rockets SKY_CLIMB layers
// straight up on its own (to SKY_CENTER) before the player takes over.
export const SKY_ZONE = 4;
export const SKY_PAD = 2;
export const SKY_SIZE = 21 + SKY_PAD * 2;
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

// Power-ups: one at a time may appear after eating an apple, for a while.
// Shield: survive one crash (the snake swerves to the safest side instead).
// Magnet: the apple (and prism) slide towards the head. Chill: the snake
// moves slower for a few seconds.
export const POWER_KINDS = ['shield', 'magnet', 'chill'];
export const POWER_LIFETIME_MS = 11000;
export const POWER_CHANCE = 0.17;
export const POWER_MIN_APPLES = 4;
export const POWER_POINTS = 25;
export const MAGNET_MS = 10000;
export const MAGNET_RANGE = 7;
export const CHILL_MS = 8000;
export const CHILL_SLOW = 1.45; // move interval multiplier while chilled

// Random pillars rise at these speed levels (level index -> how many), on top
// of each zone's own map. None in the first zone; one in each later zone's
// second level. The sky has none: everything is left behind at lift-off.
export const OBSTACLE_PLAN = { 4: 1, 7: 1, 10: 1 };
export const MAX_OBSTACLES = 12;
export const OBSTACLE_WARN_MS = 2200;

// Zone maps (see maps.js): walls rise in a wave out from the centre after a
// warning, never onto the snake or the cells right in front of its head.
export const WALL_WARN_MS = 2000;
export const WALL_STAGGER_MS = 70; // extra delay per cell of distance from the centre
// how many of the head's next cells nothing may rise onto (walls, pillars, gates)
export const RISE_CLEARANCE = 3;
// Portals open a moment after they appear; entering one moves the head to its
// partner on the next step.
export const PORTAL_OPEN_MS = 1500;
// Laser gates: off, a warning flicker, then on; never switched on onto the snake.
export const GATE_ON_MS = 2600;
export const GATE_OFF_MS = 3600;
export const GATE_WARN_MS = 1000;
export const GATE_FIRST_MS = 2500; // after the gate appears
export const GATE_WAIT_MS = 1500; // give up a cycle if blocked this long

// Cells and directions carry y (altitude); anything without one is on the ground.
const Y = (c) => c.y || 0;
const sameDir = (a, b) => a.x === b.x && a.z === b.z && Y(a) === Y(b);
const opposite = (a, b) => a.x === -b.x && a.z === -b.z && Y(a) === -Y(b);
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(Y(a) - Y(b));
const at = (c, x, z, y) => c.x === x && c.z === z && Y(c) === y;
export const NEIGHBOURS = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
export const NEIGHBOURS_3D = [...NEIGHBOURS, DIRS.rise, DIRS.dive];
export const cellKey = (x, z, y = 0) => (x * 64 + z) * 16 + y;

export function zoneForLevel(level) {
  let z = 0;
  for (let i = 0; i < ZONE_STARTS.length; i++) if (level >= ZONE_STARTS[i]) z = i;
  return z;
}

export class SnakeGame {
  constructor({ size = 21, rng = Math.random, best = 0 } = {}) {
    this.boardSize = size;
    this.size = size;
    this.rng = rng;
    this.best = best;
    this.uid = 1;
    this.reset();
  }

  reset() {
    this.size = this.boardSize; // the sky box is bigger; a new run is back on the board
    const c = Math.floor(this.size / 2);
    const startZ = this.size - 5;
    this.dir = { ...DIRS.up };
    // last horizontal heading: what "left" and "right" turn from while climbing or diving
    this.facing = { ...DIRS.up };
    this.flying = false;
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
    // { x, z, solid, solidAt, id, kind: 'pillar' | 'wall' | 'gate', zone, gate }
    this.obstacles = [];
    this.portals = []; // { id, key, a, b, zone, activeAt }
    this.gates = []; // { id, key, axis, cells, zone, state: 'off' | 'warn' | 'on', next }
    this.warpTo = null; // partner portal the head jumps to on the next step
    this.layoutSym = {}; // zone -> symmetry of its map this run
    this.layoutZone = -1;
    this.layoutStage = -1;
    this.pads = []; // { x, z, id }
    this.padRespawns = []; // times at which a used pad comes back
    this.stats = { chains: 0, prey: 0, pads: 0, powers: 0, saves: 0 };
    this.power = null; // power-up on the board: { x, z, y, kind, id, expires }
    this.shield = 0;
    this.magnetUntil = 0;
    this.chillUntil = 0;
    this.food = null;
    this.food = this.spawn('orb');
  }

  get head() {
    return this.cells[0];
  }

  get level() {
    let l = 0;
    while (l < MAX_LEVEL && this.foodEaten >= LEVEL_AT[l + 1]) l++;
    return l;
  }

  // Apples eaten into the current level and how many it takes.
  levelProgress() {
    const l = this.level;
    if (l >= MAX_LEVEL) return { into: 1, need: 1, max: true };
    return { into: this.foodEaten - LEVEL_AT[l], need: LEVEL_COSTS[l], max: false };
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
    return Math.max(MIN_INTERVAL, LEVEL_SPEEDS[this.level]);
  }

  currentInterval(rushing = this.rushing) {
    let f = 1;
    if (rushing) f = 0.6;
    if (this.boostTicks > 0) f = rushing ? 0.5 : 0.55;
    return Math.max(MIN_FAST_INTERVAL, this.baseInterval() * f) * (this.chilled ? CHILL_SLOW : 1);
  }

  get chilled() {
    return this.time < this.chillUntil;
  }

  get magnetized() {
    return this.time < this.magnetUntil;
  }

  // Speed as a 0..1 value for presentation effects.
  intensity() {
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
    if (this.power) add(this.power);
    if (this.chain) for (let i = this.chain.next; i < this.chain.links.length; i++) add(this.chain.links[i]);
    for (const o of this.obstacles) for (let y = 0; y < (flat ? 1 : this.height); y++) taken.add(cellKey(o.x, o.z, y));
    for (const p of this.pads) add(p);
    for (const p of this.portals) {
      taken.add(cellKey(p.a.x, p.a.z, 0));
      taken.add(cellKey(p.b.x, p.b.z, 0));
    }
    return taken;
  }

  // ---------------------------------------------------------------- portals
  // The partner of an open portal at (x, z), or null. Only on the ground.
  portalExit(x, z) {
    for (const p of this.portals) {
      if (this.time < p.activeAt) continue;
      if (p.a.x === x && p.a.z === z) return p.b;
      if (p.b.x === x && p.b.z === z) return p.a;
    }
    return null;
  }

  // Any portal (open or still opening) on this cell?
  portalCell(x, z) {
    for (const p of this.portals) if ((p.a.x === x && p.a.z === z) || (p.b.x === x && p.b.z === z)) return p;
    return null;
  }

  // The cells the head will occupy over its next n moves (following queued
  // turns and portals), ignoring what is in the way. `from` lets advance()
  // start from the cell it is about to enter.
  nextCells(n, from = null) {
    const out = [];
    let x = this.head.x;
    let z = this.head.z;
    let y = Y(this.head);
    let d = this.dir;
    let qi = 0;
    let warp = this.warpTo;
    if (from) {
      ({ x, z } = from);
      y = from.y || 0;
      out.push({ x, z, y });
      warp = from.warped ? null : this.flying ? null : this.portalExit(x, z);
      qi = 0;
    }
    while (out.length < n) {
      if (warp) {
        ({ x, z } = warp);
        warp = null;
      } else {
        if (qi < this.queue.length) d = this.queue[qi++];
        x += d.x;
        z += d.z;
        y += Y(d);
        if (!this.flying) warp = this.portalExit(x, z);
      }
      out.push({ x, z, y });
    }
    return out;
  }

  freeCells(flat = false) {
    const taken = this.takenSet(flat);
    const H = flat ? 1 : this.height;
    const out = [];
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
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

  spawn(type) {
    const free = this.freeCells();
    if (!free.length) return null;
    // Prefer cells that are not right in front of the head so food never
    // appears where the player can't react to it.
    const h = this.head;
    const fair = free.filter((c) => manhattan(c, h) > 2);
    const pool = fair.length ? fair : free;
    const c = this.pick(pool);
    return { x: c.x, z: c.z, y: c.y, type, id: this.uid++, spawnedAt: this.time };
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
    if (!this.inBounds(x, z) || this.occupied(x, z) || this.obstacleAt(x, z, false) || this.portalCell(x, z)) return false;
    if (ahead && ahead.x === x && ahead.z === z) return false;
    if (this.food && this.food.x === x && this.food.z === z) return false;
    if (this.bonus && this.bonus.x === x && this.bonus.z === z) return false;
    if (this.power && this.power.x === x && this.power.z === z) return false;
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
  // Is every free cell still reachable from the head if `extra` cells were
  // blocked? The rest of the zone's map (walls and gates still to come)
  // counts as blocked too.
  stillConnected(extra) {
    const s = this.size;
    const blocked = new Uint8Array(s * s);
    for (const o of this.obstacles) blocked[o.x * s + o.z] = 1;
    for (const e of extra) blocked[e.x * s + e.z] = 1;
    const reserved = this.reservedCells(false);
    if (reserved) for (const k of reserved) blocked[Math.floor(k / 1024) * s + ((k >> 4) & 63)] = 1;
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

  // Every cell of the current zone's map (all stages), as cellKeys: walls and
  // gates, plus portals unless `portals` is false. null when there is no map.
  reservedCells(portals = true) {
    const z = this.zone;
    if (this.flying || !LAYOUTS[z] || this.layoutZone !== z) return null;
    const all = layoutUpTo(z, 2, this.layoutSym[z] || 0, this.size);
    const set = new Set();
    for (const w of all.walls) set.add(cellKey(w.x, w.z));
    for (const g of all.gates) for (const c of g.cells) set.add(cellKey(c.x, c.z));
    if (portals) for (const p of all.portals) set.add(cellKey(p.a.x, p.a.z)).add(cellKey(p.b.x, p.b.z));
    return set;
  }

  addObstacles(n) {
    const added = [];
    if (this.flying) return added;
    const pillars = this.obstacles.filter((o) => !o.kind || o.kind === 'pillar').length;
    const room = MAX_OBSTACLES - pillars;
    n = Math.min(n, room);
    const h = { x: this.head.x, z: this.head.z };
    const reserved = this.reservedCells();
    const near = (c, x, z) => Math.abs(x - c.x) <= 2 && Math.abs(z - c.z) <= 2;
    for (let i = 0; i < n; i++) {
      // judged on the board: in the sky an obstacle is a column through every layer
      const pool = this.freeCells(true).filter((c) => {
        if (c.x < 2 || c.z < 2 || c.x > this.size - 3 || c.z > this.size - 3) return false;
        if (manhattan(c, h) < 5 || this.inFrontOfHead(c, 8, true)) return false;
        // keep pillars apart (from each other and the map) so they never form tight pockets
        for (const o of this.obstacles) if (near(c, o.x, o.z)) return false;
        if (reserved) for (const k of reserved) if (near(c, Math.floor(k / 1024), (k >> 4) & 63)) return false;
        return true;
      });
      for (let tries = 0; tries < 30 && pool.length; tries++) {
        const k = Math.floor(this.rng() * pool.length);
        const c = pool.splice(k, 1)[0];
        if (!this.stillConnected([c])) continue;
        const o = { x: c.x, z: c.z, solid: false, solidAt: this.time + OBSTACLE_WARN_MS, id: this.uid++, kind: 'pillar', zone: this.zone };
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
    const z = this.zone;
    return z >= 3 ? 3 : z >= 1 ? 2 : 0;
  }

  onLevelUp(ev, prevLevel) {
    const lvl = this.level;
    const zonePrev = zoneForLevel(prevLevel);
    ev.levelUp = { level: lvl, zone: this.zone, zoneUp: this.zone > zonePrev };
    if (this.zone >= SKY_ZONE && !this.flying) {
      this.enterSky({ launch: true });
      ev.levelUp.liftoff = true;
    } else this.buildLayout(ev);
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
    this.foodEaten = LEVEL_AT[L];
    if (this.zone >= SKY_ZONE) {
      this.enterSky();
      return void this.fillPads();
    }
    const zone = this.zone;
    this.layoutSym[zone] = this.startSymmetry(zone, L - ZONE_STARTS[zone]);
    this.buildLayout({}, { instant: true });
    // this zone's pillars so far (earlier zones' sank when they ended)
    for (let l = ZONE_STARTS[zone] + 1; l <= L; l++) if (OBSTACLE_PLAN[l]) this.addObstacles(OBSTACLE_PLAN[l]);
    for (const o of this.obstacles) if (o.kind !== 'gate' && !this.columnOccupied(o.x, o.z)) o.solid = true;
    this.fillPads();
  }

  // ---------------------------------------------------------------- zone maps
  // A symmetry for a run that starts inside a zone: one that keeps the
  // starting lane (the snake and the cells ahead of it) clear of walls.
  startSymmetry(zone, stage) {
    const h = this.head;
    const tail = this.cells[this.cells.length - 1];
    let best = [];
    let bestScore = Infinity;
    for (let sym = 0; sym < SYMMETRIES; sym++) {
      const lay = layoutUpTo(zone, stage, sym, this.size);
      let score = 0;
      for (const w of lay.walls) if (w.x === h.x && w.z >= h.z - 4 && w.z <= tail.z) score += 2;
      for (const g of lay.gates) for (const c of g.cells) if (c.x === h.x && c.z >= h.z - 4 && c.z <= tail.z) score += 1;
      if (score < bestScore) {
        bestScore = score;
        best = [sym];
      } else if (score === bestScore) best.push(sym);
    }
    return this.pick(best);
  }

  // Bring the zone's map up to date with the level: a new zone clears the
  // old zone's walls, gates, portals and pillars (they sink away) and its
  // map starts; each further level adds that stage. instant: everything is
  // solid and open right away (a run starting at this level).
  buildLayout(ev, { instant = false } = {}) {
    if (this.flying) return;
    const zone = this.zone;
    const stage = this.level - ZONE_STARTS[zone];
    if (this.layoutZone !== zone) {
      if (this.obstacles.length || this.portals.length) ev.layoutCleared = true;
      this.obstacles = [];
      this.portals = [];
      this.gates = [];
      this.layoutZone = zone;
      this.layoutStage = -1;
    }
    if (!LAYOUTS[zone] || stage <= this.layoutStage) return;
    if (this.layoutSym[zone] === undefined) this.layoutSym[zone] = Math.floor(this.rng() * SYMMETRIES);
    const stages = layoutStages(zone, this.layoutSym[zone], this.size);
    const added = { zone, stage, walls: [], portals: [], gates: [] };
    for (let s = this.layoutStage + 1; s <= stage; s++) this.addStage(stages[s], zone, instant, added);
    this.layoutStage = stage;
    if (added.walls.length || added.portals.length || added.gates.length) ev.layout = added;
    this.relocatePickups(ev);
  }

  addStage(st, zone, instant, added) {
    const c = (this.size - 1) / 2;
    for (const w of st.walls) {
      if (this.obstacleAt(w.x, w.z, false)) continue; // a pillar got there first
      const d = Math.abs(w.x - c) + Math.abs(w.z - c);
      const o = { x: w.x, z: w.z, kind: 'wall', zone, id: this.uid++, solid: false, solidAt: this.time + WALL_WARN_MS + d * WALL_STAGGER_MS };
      if (instant && !this.columnOccupied(w.x, w.z)) {
        o.solid = true;
        o.solidAt = this.time;
      }
      this.obstacles.push(o);
      added.walls.push({ ...o });
    }
    for (const p of st.portals) {
      const portal = { id: this.uid++, key: p.key, a: { ...p.a }, b: { ...p.b }, zone, activeAt: instant ? this.time : this.time + PORTAL_OPEN_MS };
      this.portals.push(portal);
      added.portals.push({ ...portal });
    }
    for (const g of st.gates) {
      const cycle = GATE_ON_MS + GATE_OFF_MS;
      const gate = {
        id: this.uid++, key: g.key, axis: g.axis, zone, cells: g.cells.map((q) => ({ x: q.x, z: q.z })),
        state: 'off', next: this.time + GATE_FIRST_MS + g.phase * cycle, warnSince: 0,
      };
      this.gates.push(gate);
      for (const q of gate.cells) this.obstacles.push({ x: q.x, z: q.z, kind: 'gate', gate: gate.id, zone, id: this.uid++, solid: false, solidAt: Infinity });
      added.gates.push({ id: gate.id, cells: gate.cells.slice(), axis: gate.axis });
    }
  }

  // Move anything that sits where the map just claimed a cell.
  relocatePickups(ev) {
    const blocked = (c) => !!c && !c.y && (!!this.obstacleAt(c.x, c.z, false) || !!this.portalCell(c.x, c.z));
    if (blocked(this.food)) {
      this.food = this.spawn('orb');
      ev.foodMoved = true;
    }
    if (blocked(this.bonus)) {
      const b = this.spawn('prism');
      if (b) b.expires = this.bonus.expires;
      this.bonus = b;
    }
    if (blocked(this.power)) {
      const pw = this.spawn('power');
      if (pw) Object.assign(pw, { kind: this.power.kind, expires: this.power.expires });
      this.power = pw;
    }
    if (this.chain && this.chain.links.slice(this.chain.next).some(blocked)) {
      ev.chainExpired = { ...this.chain };
      this.chain = null;
    }
    for (let i = this.pads.length - 1; i >= 0; i--) {
      if (!blocked(this.pads[i])) continue;
      this.pads.splice(i, 1);
      this.padRespawns.push(this.time + 600);
    }
    if (this.prey && blocked(this.prey)) {
      ev.preyEscaped = { ...this.prey };
      this.prey = null;
      this.preyTimer = 4000;
    }
  }

  // Laser gates cycle off -> warn -> on -> off. A gate only switches on when
  // none of its cells holds the snake or lies right in front of the head;
  // otherwise it keeps warning, and skips the cycle if that takes too long.
  updateGates(ahead, ev) {
    for (const gt of this.gates) {
      if (this.time < gt.next) continue;
      if (gt.state === 'off') {
        gt.state = 'warn';
        gt.warnSince = this.time;
        gt.next = this.time + GATE_WARN_MS;
      } else if (gt.state === 'warn') {
        const clear = gt.cells.every((c) => !this.columnOccupied(c.x, c.z) && !ahead.some((a) => a.x === c.x && a.z === c.z));
        if (clear) {
          gt.state = 'on';
          gt.next = this.time + GATE_ON_MS;
          (ev.gatesOn || (ev.gatesOn = [])).push(gt.id);
        } else if (this.time - gt.warnSince > GATE_WARN_MS + GATE_WAIT_MS) {
          gt.state = 'off';
          gt.next = this.time + GATE_OFF_MS - GATE_WARN_MS;
        }
      } else {
        gt.state = 'off';
        gt.next = this.time + GATE_OFF_MS - GATE_WARN_MS;
        (ev.gatesOff || (ev.gatesOff = [])).push(gt.id);
      }
      const on = gt.state === 'on';
      for (const o of this.obstacles) if (o.gate === gt.id) o.solid = on;
    }
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
    this.flying = true;
    this.size = SKY_SIZE;
    this.height = SKY_H;
    this.yMid = SKY_LIFT;
    const y0 = launch ? SKY_LIFT : SKY_CENTER;
    const move = (c, y) => ({ ...c, x: c.x + SKY_PAD, z: c.z + SKY_PAD, y });
    this.cells = this.cells.map((c) => move(c, y0));
    if (this.removedTail) this.removedTail = move(this.removedTail, y0);
    // pickups are moved in place: callers may hold the same objects
    const lift = (c) => c && Object.assign(c, { x: c.x + SKY_PAD, z: c.z + SKY_PAD, y: SKY_CENTER });
    lift(this.food);
    lift(this.bonus);
    lift(this.power);
    if (this.chain) this.chain.links.forEach(lift);
    this.obstacles = [];
    this.portals = [];
    this.gates = [];
    this.warpTo = null;
    this.pads = [];
    this.padRespawns = [];
    this.prey = null;
    this.undoOk = false;
    if (launch) {
      this.queue = [{ ...DIRS.rise }];
      this.launch = SKY_CLIMB;
    }
  }

  // Cells straight ahead along the heading the snake will take next (through
  // any portal on the way), up to the first obstacle. Used for the path
  // guide and danger warnings; `cells` lists the free ones.
  lookAhead(max = this.size) {
    const d = this.lastQueuedDir();
    const out = { free: 0, blocked: 'wall', cells: [] };
    let x = this.head.x;
    let z = this.head.z;
    let y = Y(this.head);
    let warp = this.warpTo;
    for (let i = 0; i < max; i++) {
      const warped = !!warp;
      if (warp) {
        ({ x, z } = warp);
        warp = null;
      } else {
        x += d.x;
        z += d.z;
        y += Y(d);
      }
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
      out.cells.push({ x, z, y, warped });
      if (!warped && !this.flying) warp = this.portalExit(x, z);
    }
    out.blocked = null;
    return out;
  }

  // What would kill the head entering (x, z, y)? null if nothing.
  fatalAt(x, z, y) {
    // in the sky the walls are a laser fence
    if (!this.inBounds(x, z, y)) return this.flying ? 'laser' : 'wall';
    const hit = this.obstacleAt(x, z);
    // map walls and laser gates get their own message
    if (hit) return hit.kind === 'gate' ? 'gate' : hit.kind === 'wall' ? 'block' : 'obstacle';
    const eats = (this.food && at(this.food, x, z, y)) || (this.bonus && at(this.bonus, x, z, y)) || (this.prey && at(this.prey, x, z, y));
    if (this.occupied(x, z, !(this.pendingGrowth > 0 || eats), y)) return 'body';
    return null;
  }

  // The shield's swerve: the safe sideways move (up or down too, in the sky)
  // with the most room behind it, or null if there is none.
  dodge() {
    const h = this.head;
    let best = null;
    for (const d of this.neighbours) {
      if (sameDir(d, this.dir) || opposite(d, this.dir)) continue;
      const x = h.x + d.x;
      const z = h.z + d.z;
      const y = Y(h) + Y(d);
      if (this.fatalAt(x, z, y)) continue;
      // most room to manoeuvre, then the longest clear run straight on
      let run = 0;
      while (run < 20 && !this.fatalAt(x + d.x * (run + 1), z + d.z * (run + 1), y + Y(d) * (run + 1))) run++;
      const room = this.roomFrom(x, z, y, 80) * 100 + run * 2 - (Y(d) ? 1 : 0);
      if (!best || room > best.room) best = { room, d };
    }
    return best ? { x: best.d.x, z: best.d.z, y: Y(best.d) } : null;
  }

  // Free cells reachable from (x, z, y), counted up to `cap`.
  roomFrom(x, z, y, cap) {
    const seen = new Set([cellKey(x, z, y)]);
    const stack = [{ x, z, y }];
    let n = 0;
    while (stack.length && n < cap) {
      const c = stack.pop();
      n++;
      for (const d of this.neighbours) {
        const nx = c.x + d.x;
        const nz = c.z + d.z;
        const ny = c.y + Y(d);
        const k = cellKey(nx, nz, ny);
        if (seen.has(k) || !this.inBounds(nx, nz, ny) || this.obstacleAt(nx, nz) || this.occupied(nx, nz, true, ny)) continue;
        seen.add(k);
        stack.push({ x: nx, z: nz, y: ny });
      }
    }
    return n;
  }

  spawnPower() {
    const kinds = POWER_KINDS.filter((k) => k !== 'shield' || !this.shield);
    const p = this.spawn('power');
    if (!p) return null;
    p.kind = this.pick(kinds);
    p.expires = this.time + POWER_LIFETIME_MS;
    this.power = p;
    return p;
  }

  applyPower(kind) {
    if (kind === 'shield') this.shield = 1;
    else if (kind === 'magnet') this.magnetUntil = this.time + MAGNET_MS;
    else if (kind === 'chill') this.chillUntil = this.time + CHILL_MS;
  }

  // Magnet: pickups in range slide one cell towards where the head is going.
  pullPickups(tx, tz, ty) {
    const moved = [];
    for (const key of ['food', 'bonus']) {
      const f = this[key];
      if (!f) continue;
      const dx = tx - f.x;
      const dz = tz - f.z;
      const dy = ty - Y(f);
      if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > MAGNET_RANGE || (!dx && !dz && !dy)) continue;
      // step along the longest axis first, else another that closes in
      const steps = [
        { a: Math.abs(dx), d: { x: Math.sign(dx), z: 0, y: 0 } },
        { a: Math.abs(dz), d: { x: 0, z: Math.sign(dz), y: 0 } },
        { a: Math.abs(dy), d: { x: 0, z: 0, y: Math.sign(dy) } },
      ].filter((q) => q.a > 0).sort((p, q) => q.a - p.a);
      for (const { d } of steps) {
        const x = f.x + d.x;
        const z = f.z + d.z;
        const y = Y(f) + d.y;
        const target = x === tx && z === tz && y === ty;
        if (!this.inBounds(x, z, y) || this.obstacleAt(x, z, false) || this.portalCell(x, z) || this.padAt(x, z, y)) continue;
        if (!target && (this.occupied(x, z, false, y) || this.chainIndexAt(x, z, y) >= 0)) continue;
        if ((this.food && f !== this.food && at(this.food, x, z, y)) || (this.bonus && f !== this.bonus && at(this.bonus, x, z, y))) continue;
        if (this.power && at(this.power, x, z, y)) continue;
        f.x = x;
        f.z = z;
        if (this.flying) f.y = y;
        moved.push(key);
        break;
      }
    }
    return moved;
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
    // Snapshot for the late-turn grace window (see regrace).
    this.undo = {
      cells: this.cells.slice(), removedTail: this.removedTail, pendingGrowth: this.pendingGrowth,
      dir: this.dir, facing: this.facing, queue: this.queue.slice(), time: this.time, clock: this.clock, ticks: this.ticks,
      rush: this.rush, rushing: this.rushing, boostTicks: this.boostTicks,
      prey: this.prey ? { ...this.prey } : null, preyTimer: this.preyTimer, warpTo: this.warpTo,
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
    this.warpTo = u.warpTo;
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

    // through a portal: this move is the jump to its partner (turns wait)
    const warp = this.warpTo;
    this.warpTo = null;
    if (!warp && this.queue.length) {
      this.dir = this.queue.shift();
      if (!Y(this.dir)) this.facing = this.dir;
      ev.turned = true;
    }
    // lift-off: climb straight up, then level out the way we were going
    if (this.launch > 0 && Y(this.dir) > 0 && --this.launch === 0) this.queue = [{ ...this.facing }];

    const h = this.head;
    let nx = warp ? warp.x : h.x + this.dir.x;
    let nz = warp ? warp.z : h.z + this.dir.z;
    let ny = warp ? 0 : Y(h) + Y(this.dir);
    // nothing rises or switches on in the head's way
    const ahead = this.nextCells(RISE_CLEARANCE, { x: nx, z: nz, y: ny, warped: !!warp });
    const inWay = (x, z) => ahead.some((a) => a.x === x && a.z === z);

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
      // Rise only once the cell is clear and not right in front of the head,
      // so a wall or pillar never crushes the snake or pops up in its face.
      if (o.kind === 'gate' || o.solid || this.time < o.solidAt) continue;
      if (this.columnOccupied(o.x, o.z) || inWay(o.x, o.z) || (this.prey && this.prey.x === o.x && this.prey.z === o.z)) continue;
      o.solid = true;
      (ev.obstaclesRaised || (ev.obstaclesRaised = [])).push({ ...o });
    }
    if (this.gates.length) this.updateGates(ahead, ev);
    for (let i = this.padRespawns.length - 1; i >= 0; i--) {
      if (this.time >= this.padRespawns[i]) {
        this.padRespawns.splice(i, 1);
        const p = this.spawnPad();
        if (p) (ev.padsSpawned || (ev.padsSpawned = [])).push({ ...p });
      }
    }

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
    } else if (this.foodEaten >= 2 && !this.flying) {
      this.preyTimer -= interval;
      if (this.preyTimer <= 0) {
        const p = this.spawnPrey();
        if (p) ev.preySpawned = { ...p };
        else this.preyTimer = 3000;
      }
    }

    if (this.power && this.time > this.power.expires) {
      ev.powerExpired = { ...this.power };
      this.power = null;
    }
    // magnet: the apple slides towards the cell the head is entering
    if (this.magnetized && !warp) {
      const moved = this.pullPickups(nx, nz, ny);
      if (moved.length) ev.pulled = moved;
    }

    let cause = this.fatalAt(nx, nz, ny);
    if (cause && this.shield > 0) {
      // the shield takes the hit: swerve onto the safest side instead
      const alt = this.dodge();
      if (alt) {
        ev.shieldSaved = { x: h.x, z: h.z, y: Y(h), cause, dir: { ...alt } };
        this.shield = 0;
        this.stats.saves++;
        this.dir = alt;
        if (!alt.y) this.facing = alt;
        this.queue = [];
        nx = h.x + alt.x;
        nz = h.z + alt.z;
        ny = Y(h) + alt.y;
        cause = null;
      }
    }
    if (cause) {
      this.die(cause);
      ev.died = true;
      ev.cause = cause;
      return ev;
    }

    let eaten = null;
    if (this.food && at(this.food, nx, nz, ny)) eaten = this.food;
    else if (this.bonus && at(this.bonus, nx, nz, ny)) eaten = this.bonus;
    const caught = this.prey && at(this.prey, nx, nz, ny) ? this.prey : null;

    let ateFood = false;
    if (eaten) {
      const def = FOOD_TYPES[eaten.type];
      this.registerEat();
      const points = def.points * this.combo * this.scoreMult;
      this.score += points;
      this.pendingGrowth += def.grow;
      this.rush = Math.min(100, this.rush + def.rush);
      const prevLevel = this.level;
      if (eaten.type === 'orb') this.foodEaten++;
      ev.ate = { ...eaten, points, combo: this.combo, rushing: this.scoreMult > 1, levelUp: this.level > prevLevel };
      // off the board now, so a map growing at this level-up leaves it alone
      ateFood = eaten === this.food;
      if (ateFood) this.food = null;
      else this.bonus = null;
      if (this.level > prevLevel) {
        this.onLevelUp(ev, prevLevel);
        if (ev.levelUp.liftoff) {
          // the whole board just turned into the sky box around us
          nx += SKY_PAD;
          nz += SKY_PAD;
          ny = SKY_LIFT;
          Object.assign(ev.ate, { x: nx, z: nz, y: SKY_LIFT });
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

    if (this.power && at(this.power, nx, nz, ny)) {
      const pw = this.power;
      this.power = null;
      this.applyPower(pw.kind);
      this.score += POWER_POINTS * this.scoreMult;
      this.stats.powers++;
      ev.power = { ...pw, points: POWER_POINTS * this.scoreMult };
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
    // portals: stepping onto an open one sends the head to its partner next
    if (warp) ev.warped = { from: { x: h.x, z: h.z }, to: { x: nx, z: nz } };
    else if (!this.flying) {
      const exit = this.portalExit(nx, nz);
      if (exit) {
        this.warpTo = { x: exit.x, z: exit.z };
        ev.portal = { x: nx, z: nz, to: { ...this.warpTo }, id: this.portalCell(nx, nz).id };
      }
    }

    if (ateFood) {
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
      if (!this.power && this.foodEaten >= POWER_MIN_APPLES && this.rng() < POWER_CHANCE) {
        const pw = this.spawnPower();
        if (pw) ev.powerSpawned = { ...pw };
      }
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
