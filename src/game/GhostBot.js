// The ghost: a perfect-play bot that runs on the same board as the player
// without touching it. It takes the shortest safe route to every available
// pickup (chain orbs in order and prisms before they expire, then the apple),
// avoids pillars and its own body, ignores the golden mouse, uses Rush only
// when it pays off, then waits in place until the player eats the apple, so
// it is never more than one apple ahead.
//
// Pathfinding is a breadth-first search that knows when each of its own body
// cells will be vacated. Before committing to a route it simulates following
// it and checks it can still reach its own tail afterwards, so it never boxes
// itself in; with no safe target it follows its tail to buy time.

import {
  DIRS, NEIGHBOURS, NEIGHBOURS_3D, SKY_PAD, SKY_LIFT, SKY_CENTER, FOOD_TYPES, COMBO_WINDOW_MS, MAX_COMBO, RUSH_DRAIN_PER_SEC, CHAIN_LINK_POINTS, CHAIN_LINK_RUSH,
  CHAIN_BONUS_PER_LINK, LEVEL_AT, LEVEL_SPEEDS, MIN_INTERVAL, MIN_FAST_INTERVAL, MAX_LEVEL,
} from './SnakeGame.js';

const Y = (c) => c.y || 0;
const at = (c, x, z, y) => c.x === x && c.z === z && Y(c) === y;

export class GhostBot {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  // Start where the player starts (or copy the player's current snake).
  reset(fromPlayer = false) {
    const g = this.game;
    const s = g.size;
    if (fromPlayer) {
      this.cells = g.cells.map((c) => ({ x: c.x, z: c.z, y: Y(c) }));
      this.dir = { ...g.dir };
      this.facing = { ...g.facing };
      this.flying = g.flying;
      this.removedTail = g.removedTail ? { ...g.removedTail } : null;
      this.apples = g.foodEaten;
      this.score = g.score;
    } else {
      const c = Math.floor(s / 2);
      const startZ = s - 5;
      this.cells = [];
      for (let i = 0; i < 4; i++) this.cells.push({ x: c, z: startZ + i, y: 0 });
      this.dir = { ...DIRS.up };
      this.facing = { ...DIRS.up };
      this.flying = false;
      this.removedTail = { x: c, z: startZ + 4, y: 0 };
      this.apples = 0;
      this.score = 0;
    }
    this.pendingGrowth = 0;
    this.ticks = 0;
    this.time = 0;
    this.t = 1;
    this.combo = 1;
    this.lastEat = -1e9;
    this.rush = 0;
    this.rushing = false;
    this.ateFood = null;
    this.atePrism = null;
    this.chainId = null;
    this.chainNext = 0;
    this.chainDone = new Set();
    this.paused = true;
    this.respawns = 0;
    this.goal = null;
  }

  get head() {
    return this.cells[0];
  }

  // Grid index of a cell: the board is size x size x game.height.
  idx(x, z, y) {
    const s = this.game.size;
    return (x * s + z) * this.game.height + y;
  }

  cellOf(k) {
    const H = this.game.height;
    const s = this.game.size;
    const xz = Math.floor(k / H);
    return { x: Math.floor(xz / s), z: xz % s, y: k % H };
  }

  inside(x, z, y) {
    const g = this.game;
    return x >= 0 && z >= 0 && x < g.size && z < g.size && y >= 0 && y < g.height;
  }

  get nb() {
    return this.game.flying ? NEIGHBOURS_3D : NEIGHBOURS;
  }

  // Follow the player into the sky: same shift into the bigger box, at the
  // layer level with the board.
  liftOff() {
    this.flying = true;
    const move = (c) => ({ ...c, x: c.x + SKY_PAD, z: c.z + SKY_PAD, y: SKY_LIFT });
    this.cells = this.cells.map(move);
    if (this.removedTail) this.removedTail = move(this.removedTail);
  }

  get level() {
    let l = 0;
    while (l < MAX_LEVEL && this.apples >= LEVEL_AT[l + 1]) l++;
    return l;
  }

  baseInterval() {
    return Math.max(MIN_INTERVAL, LEVEL_SPEEDS[this.level]);
  }

  fastInterval() {
    return Math.max(MIN_FAST_INTERVAL, this.baseInterval() * 0.6);
  }

  interval() {
    return this.rushing ? this.fastInterval() : this.baseInterval();
  }

  // Pickups the ghost still wants, most urgent first.
  targets() {
    const g = this.game;
    const out = [];
    if (g.chain && !this.chainDone.has(g.chain.id)) {
      const next = this.chainId === g.chain.id ? this.chainNext : g.chain.next;
      if (next < g.chain.links.length) out.push({ kind: 'chain', cell: g.chain.links[next], expires: g.chain.expires, index: next, grow: 0 });
    }
    if (g.bonus && this.atePrism !== g.bonus.id) out.push({ kind: 'prism', cell: g.bonus, expires: g.bonus.expires, grow: FOOD_TYPES.prism.grow });
    if (g.food && this.ateFood !== g.food.id) out.push({ kind: 'apple', cell: g.food, expires: Infinity, grow: FOOD_TYPES.orb.grow });
    return out;
  }

  // Cells the ghost must never enter: pillars (solid or about to rise) and
  // chain orbs other than the next one (eating out of order breaks a chain).
  get cellCount() {
    const g = this.game;
    return g.size * g.size * g.height;
  }

  staticBlocked(nextChain) {
    const g = this.game;
    const b = new Uint8Array(this.cellCount);
    // pillars, or in the sky laser columns through every layer
    for (const o of g.obstacles) for (let y = 0; y < g.height; y++) b[this.idx(o.x, o.z, y)] = 1;
    if (g.chain && !this.chainDone.has(g.chain.id)) {
      const next = this.chainId === g.chain.id ? this.chainNext : g.chain.next;
      g.chain.links.forEach((l, i) => {
        if (!this.inside(l.x, l.z, Y(l))) return;
        const k = this.idx(l.x, l.z, Y(l));
        if (i > next || (i === next && !nextChain)) b[k] = 1;
        if (i === next && nextChain) b[k] = 0;
      });
    }
    return b;
  }

  // Moves until each body cell is vacated (head = longest).
  freeTimes(cells, growth) {
    const f = new Int32Array(this.cellCount);
    const n = cells.length;
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      if (!this.inside(c.x, c.z, Y(c))) continue;
      const k = this.idx(c.x, c.z, Y(c));
      f[k] = Math.max(f[k], n - i + growth);
    }
    return f;
  }

  // Time-aware BFS from the head. Returns parent/dist arrays.
  bfs(cells, growth, blocked) {
    const free = this.freeTimes(cells, growth);
    const dist = new Int32Array(this.cellCount).fill(-1);
    const parent = new Int32Array(this.cellCount).fill(-1);
    const h = cells[0];
    const start = this.idx(h.x, h.z, Y(h));
    dist[start] = 0;
    const queue = [start];
    const nbs = this.nb;
    for (let qi = 0; qi < queue.length; qi++) {
      const k = queue[qi];
      const c = this.cellOf(k);
      const d = dist[k] + 1;
      for (const nb of nbs) {
        const nx = c.x + nb.x;
        const nz = c.z + nb.z;
        const ny = c.y + Y(nb);
        if (!this.inside(nx, nz, ny)) continue;
        const nk = this.idx(nx, nz, ny);
        if (dist[nk] >= 0 || blocked[nk] || free[nk] > d) continue;
        dist[nk] = d;
        parent[nk] = k;
        queue.push(nk);
      }
    }
    return { dist, parent };
  }

  pathTo(parent, target) {
    const path = [];
    for (let k = target; parent[k] >= 0; k = parent[k]) path.push(this.cellOf(k));
    return path.reverse();
  }

  // Simulate following `path`, eating a target at its end that grows by `grow`.
  simulate(path, grow) {
    const body = this.cells.slice();
    let growth = this.pendingGrowth;
    path.forEach((c, i) => {
      if (i === path.length - 1) growth += grow;
      body.unshift(c);
      if (growth > 0) growth--;
      else body.pop();
    });
    return { body, growth };
  }

  // Can the head still reach its own tail? (the classic never-trap test)
  tailReachable(body, growth, blocked) {
    if (body.length < 3) return true;
    const tail = body[body.length - 1];
    // time-aware: the tail cell counts once it has been vacated
    return this.bfs(body, growth, blocked).dist[this.idx(tail.x, tail.z, Y(tail))] > 0;
  }

  // Pick the next direction and whether to Rush.
  decide() {
    const g = this.game;
    for (const tg of this.targets()) {
      if (!this.inside(tg.cell.x, tg.cell.z, Y(tg.cell))) continue;
      const blocked = this.staticBlocked(tg.kind === 'chain');
      const { dist, parent } = this.bfs(this.cells, this.pendingGrowth, blocked);
      const key = this.idx(tg.cell.x, tg.cell.z, Y(tg.cell));
      const d = dist[key];
      if (d <= 0) continue;
      let rush = false;
      if (tg.expires !== Infinity) {
        const left = tg.expires - g.time;
        if (d * this.baseInterval() > left * 0.95) {
          // only reachable in time with Rush (and enough meter for the trip)
          if (d * this.fastInterval() <= left * 0.95 && this.rushCovers(d)) rush = true;
          else continue;
        }
      }
      const path = this.pathTo(parent, key);
      const sim = this.simulate(path, tg.grow);
      const after = this.staticBlocked(false);
      if (!this.tailReachable(sim.body, sim.growth, after)) continue;
      // Rush when the meter carries us all the way there: the pickup scores double
      if (!rush && this.rushCovers(d)) rush = true;
      const first = path[0];
      this.goal = tg;
      return { dir: { x: first.x - this.head.x, z: first.z - this.head.z, y: first.y - Y(this.head) }, rush };
    }
    this.goal = null;
    return { dir: this.survive(), rush: false };
  }

  rushCovers(steps) {
    return this.rush > 0 && (steps * this.fastInterval() * RUSH_DRAIN_PER_SEC) / 1000 <= this.rush;
  }

  // No safe target: follow the tail the long way round, or failing that take
  // the move that keeps the most room.
  survive() {
    const blocked = this.staticBlocked(false);
    const free = this.freeTimes(this.cells, this.pendingGrowth);
    const h = this.head;
    let best = null;
    for (const nb of this.nb) {
      const nx = h.x + nb.x;
      const nz = h.z + nb.z;
      const ny = Y(h) + Y(nb);
      if (!this.inside(nx, nz, ny)) continue;
      const k = this.idx(nx, nz, ny);
      if (blocked[k] || free[k] > 1) continue;
      const sim = this.simulate([{ x: nx, z: nz, y: ny }], 0);
      const safe = this.tailReachable(sim.body, sim.growth, blocked);
      const { dist } = this.bfs(sim.body, sim.growth, blocked);
      let area = 0;
      const tail = sim.body[sim.body.length - 1];
      for (let i = 0; i < dist.length; i++) if (dist[i] > 0) area++;
      const tailD = Math.max(0, dist[this.idx(tail.x, tail.z, Y(tail))]);
      const score = (safe ? 10000 : 0) + (safe ? tailD * 10 : 0) + area;
      if (!best || score > best.score) best = { score, dir: nb };
    }
    return best ? { ...best.dir } : null;
  }

  // Find a fresh spot if the ghost ever gets trapped (very rare).
  respawn() {
    const g = this.game;
    const s = g.size;
    const y = g.flying ? SKY_CENTER : 0;
    const blocked = this.staticBlocked(false);
    for (let z = s - 2; z >= 1; z--) {
      for (let x = 2; x < s - 2; x++) {
        let ok = true;
        for (let i = 0; i < 4 && ok; i++) if (z + i >= s || blocked[this.idx(x, z + i, y)]) ok = false;
        if (z - 1 < 0 || blocked[this.idx(x, z - 1, y)]) ok = false;
        if (ok) {
          this.cells = [0, 1, 2, 3].map((i) => ({ x, z: z + i, y }));
          this.dir = { ...DIRS.up };
          this.facing = { ...DIRS.up };
          this.removedTail = null;
          this.pendingGrowth = 0;
          this.respawns++;
          return;
        }
      }
    }
  }

  registerEat() {
    this.combo = this.time - this.lastEat <= COMBO_WINDOW_MS ? Math.min(MAX_COMBO, this.combo + 1) : 1;
    this.lastEat = this.time;
  }

  // One move.
  step() {
    const g = this.game;
    const plan = this.decide();
    if (!plan.dir) {
      this.respawn();
      return { respawned: true };
    }
    this.rushing = plan.rush && this.rush > 0;
    const interval = this.interval();
    this.time += interval;
    this.ticks++;
    if (this.rushing) this.rush = Math.max(0, this.rush - (RUSH_DRAIN_PER_SEC * interval) / 1000);
    this.dir = plan.dir;
    if (!Y(this.dir)) this.facing = this.dir;
    const nx = this.head.x + this.dir.x;
    const nz = this.head.z + this.dir.z;
    const ny = Y(this.head) + Y(this.dir);
    // The plan is always legal; this guards against the board changing
    // under the ghost (a pillar rising in its way). Checked before any pickup
    // adds growth: an apple may spawn on the ghost's own tail, and a ghost
    // briefly overlapping its tail is harmless.
    const free = this.freeTimes(this.cells, this.pendingGrowth);
    if (!this.inside(nx, nz, ny) || free[this.idx(nx, nz, ny)] > 1 || g.obstacleAt(nx, nz, false)) {
      this.respawn();
      return { respawned: true };
    }
    const ev = {};
    const mult = this.rushing ? 2 : 1;
    if (g.food && at(g.food, nx, nz, ny) && this.ateFood !== g.food.id) {
      this.ateFood = g.food.id;
      this.apples++;
      this.registerEat();
      this.score += FOOD_TYPES.orb.points * this.combo * mult;
      this.pendingGrowth += FOOD_TYPES.orb.grow;
      this.rush = Math.min(100, this.rush + FOOD_TYPES.orb.rush);
      ev.ate = 'apple';
    }
    if (g.bonus && at(g.bonus, nx, nz, ny) && this.atePrism !== g.bonus.id) {
      this.atePrism = g.bonus.id;
      this.registerEat();
      this.score += FOOD_TYPES.prism.points * this.combo * mult;
      this.pendingGrowth += FOOD_TYPES.prism.grow;
      this.rush = 100;
      ev.ate = 'prism';
    }
    const ch = g.chain;
    if (ch && !this.chainDone.has(ch.id)) {
      if (this.chainId !== ch.id) {
        this.chainId = ch.id;
        this.chainNext = ch.next;
      }
      const l = ch.links[this.chainNext];
      if (l && at(l, nx, nz, ny)) {
        this.chainNext++;
        this.score += CHAIN_LINK_POINTS * this.chainNext * mult;
        this.rush = Math.min(100, this.rush + CHAIN_LINK_RUSH);
        this.lastEat = this.time;
        ev.ate = 'chain';
        if (this.chainNext >= ch.links.length) {
          this.chainDone.add(ch.id);
          this.score += CHAIN_BONUS_PER_LINK * ch.links.length * mult;
          this.rush = 100;
          ev.chainComplete = true;
        }
      }
    }
    this.cells.unshift({ x: nx, z: nz, y: ny });
    if (this.pendingGrowth > 0) {
      this.pendingGrowth--;
      this.removedTail = null;
    } else {
      this.removedTail = this.cells.pop();
    }
    return ev;
  }

  // Advance by real time. Waits (paused) when nothing is left to collect.
  update(dtMs) {
    if (this.game.flying && !this.flying) this.liftOff();
    const wanted = this.targets().length > 0;
    if (!wanted) {
      // finish gliding into the last cell, then hold still
      this.paused = true;
      this.rushing = false;
      this.time += dtMs;
      this.t = Math.min(1, this.t + dtMs / this.baseInterval());
      return [];
    }
    this.paused = false;
    const events = [];
    this.t += dtMs / this.interval();
    let guard = 0;
    while (this.t >= 1 && guard++ < 4) {
      this.t -= 1;
      events.push(this.step());
      if (!this.targets().length) {
        this.paused = true;
        this.t = Math.min(this.t, 1);
        break;
      }
    }
    return events;
  }
}
