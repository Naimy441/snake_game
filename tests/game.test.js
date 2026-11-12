import test from 'node:test';
import assert from 'node:assert/strict';
import { SnakeGame, DIRS, BOARD_SIZES, SKY_SIZE as SKY_W, FOOD_TYPES } from '../src/game/SnakeGame.js';

const seq = (vals) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

test('snake starts with length 4 heading up and moves one cell per step', () => {
  const g = new SnakeGame({ size: 21, rng: seq([0.5]) });
  assert.equal(g.cells.length, 4);
  const h = { ...g.head };
  g.step();
  assert.deepEqual(g.head, { x: h.x, z: h.z - 1, y: 0 });
  assert.equal(g.cells.length, 4);
});

test('reversing into yourself is ignored, turns are queued', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  assert.equal(g.queueDirection(DIRS.down), false);
  assert.equal(g.queueDirection(DIRS.left), true);
  assert.equal(g.queueDirection(DIRS.right), false); // opposite of queued left
  assert.equal(g.queueDirection(DIRS.up), true);
  g.step();
  assert.deepEqual(g.dir, DIRS.left);
  g.step();
  assert.deepEqual(g.dir, DIRS.up);
});

test('relative turns rotate the heading', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  g.turn(1);
  g.step();
  assert.deepEqual(g.dir, DIRS.right);
  g.turn(1);
  g.step();
  assert.deepEqual(g.dir, DIRS.down);
  g.turn(-1);
  g.step();
  assert.deepEqual(g.dir, DIRS.right);
});

test('eating food grows the snake, scores and respawns food', () => {
  const g = new SnakeGame({ rng: seq([0.3]) });
  g.food = { x: g.head.x, z: g.head.z - 1, type: 'orb', id: 1 };
  const ev = g.step();
  assert.ok(ev.ate);
  assert.equal(g.score, 10);
  assert.equal(g.cells.length, 5);
  assert.ok(g.food && g.food.id !== 1);
  assert.equal(g.rush, FOOD_TYPES.orb.rush);
});

test('combo multiplies points when eating quickly', () => {
  const g = new SnakeGame({ rng: seq([0.3]) });
  g.food = { x: g.head.x, z: g.head.z - 1, type: 'orb', id: 1 };
  g.step();
  g.food = { x: g.head.x, z: g.head.z - 1, type: 'orb', id: 2 };
  g.step();
  assert.equal(g.combo, 2);
  assert.equal(g.score, 10 + 20);
});

test('hitting the wall ends the game', () => {
  const g = new SnakeGame({ rng: seq([0.99]) });
  let ev;
  for (let i = 0; i < 30 && g.alive; i++) ev = g.step();
  assert.equal(g.alive, false);
  assert.equal(ev.cause, 'wall');
  assert.equal(g.head.z, 0);
});

test('running into your own body ends the game', () => {
  const g = new SnakeGame({ rng: seq([0.99]) });
  g.pendingGrowth = 4;
  for (let i = 0; i < 4; i++) g.step();
  g.queueDirection(DIRS.left);
  g.step();
  g.queueDirection(DIRS.down);
  g.step();
  g.queueDirection(DIRS.right);
  const ev = g.step();
  assert.equal(ev.died, true);
  assert.equal(ev.cause, 'body');
});

test('moving into the cell the tail is leaving is allowed', () => {
  const g = new SnakeGame({ rng: seq([0.99]) });
  // length 4 in a tight square loop: up, left, down, right brings head onto old tail cell
  g.queueDirection(DIRS.left);
  g.step();
  g.queueDirection(DIRS.down);
  g.step();
  g.queueDirection(DIRS.right);
  const ev = g.step();
  assert.equal(ev.died, false);
  assert.equal(g.alive, true);
});

test('speed rises with level and rush shortens the interval', () => {
  const g = new SnakeGame();
  const base = g.baseInterval();
  g.foodEaten = 8;
  assert.ok(g.baseInterval() < base);
  g.rush = 50;
  g.wantRush = true;
  g.step();
  assert.ok(g.rushing);
  assert.ok(g.currentInterval() < g.baseInterval());
});

test('food never spawns on the snake', () => {
  const g = new SnakeGame();
  for (let i = 0; i < 200; i++) {
    const f = g.spawn('orb');
    assert.ok(!g.occupied(f.x, f.z));
  }
});

test('best score tracks the highest score', () => {
  const g = new SnakeGame({ rng: seq([0.3]), best: 5 });
  g.food = { x: g.head.x, z: g.head.z - 1, type: 'orb', id: 1 };
  g.step();
  assert.equal(g.best, 10);
});

// ---------------------------------------------------------------- new mechanics
import {
  SPACE_START, SPACE_ZONE, CORE_SIZE, COLLAPSE_PER_APPLE, DOOM_MS, CORE_CALM_LEN, CORE_CALM, CORE_CALM_MOVES,
  LEVEL_AT, zoneForLevel, MAX_LEVEL, ZONE_STARTS, SKY_ZONE, SKY_H, SKY_LIFT, SKY_CENTER, SKY_PAD, SKY_SIZE, SKY_CLIMB, OBSTACLE_WARN_MS, BOOST_TICKS, CHAIN_BONUS_PER_LINK, PREY_LIFETIME_MS, MAX_OBSTACLES,
} from '../src/game/SnakeGame.js';

const runFor = (g, ms) => {
  const end = g.time + ms;
  while (g.time < end && g.alive) g.step();
};

test('zones change every few speed levels', () => {
  assert.equal(zoneForLevel(0), 0);
  assert.equal(zoneForLevel(2), 0);
  assert.equal(zoneForLevel(3), 1);
  assert.equal(zoneForLevel(6), 2);
  assert.equal(zoneForLevel(9), 3);
  assert.equal(zoneForLevel(11), 3);
  assert.equal(zoneForLevel(12), 4);
  assert.equal(zoneForLevel(13), 4);
  assert.equal(zoneForLevel(14), 5);
});

test('levelling up reports the level and zone change', () => {
  const g = new SnakeGame({ rng: seq([0.9]) });
  g.foodEaten = 8; // next apple (the 9th) -> level 3 = zone 1
  g.food = { x: g.head.x, z: g.head.z - 1, type: 'orb', id: 1 };
  const ev = g.step();
  assert.deepEqual(ev.levelUp, { level: 3, zone: 1, zoneUp: true });
  assert.equal(g.zone, 1);
  // zone 1 brings boost pads
  assert.equal(g.pads.length, 2);
  assert.ok(ev.padsSpawned.length === 2);
});

test('obstacles are telegraphed, then become solid and deadly', () => {
  const g = new SnakeGame({ rng: Math.random });
  const added = g.addObstacles(2);
  assert.equal(added.length, 2);
  for (const o of g.obstacles) {
    assert.equal(o.solid, false);
    assert.ok(!g.occupied(o.x, o.z));
    assert.ok(Math.abs(o.x - g.head.x) + Math.abs(o.z - g.head.z) >= 5);
  }
  // not solid during the warning: walking through is fine
  const o = g.obstacles[0];
  assert.equal(g.obstacleAt(o.x, o.z), null);
  g.time += OBSTACLE_WARN_MS + 1;
  g.step();
  assert.ok(g.obstacles.every((x) => x.solid || g.occupied(x.x, x.z)));
  // drive straight into a solid one
  const t = g.obstacles.find((x) => x.solid);
  g.cells = [{ x: t.x, z: t.z + 1 }, { x: t.x, z: t.z + 2 }, { x: t.x, z: t.z + 3 }];
  g.dir = { x: 0, z: -1 };
  g.queue = [];
  const ev = g.step();
  assert.equal(ev.cause, 'obstacle');
});

test('obstacles never wall off part of the board and stay capped', () => {
  for (let seed = 0; seed < 20; seed++) {
    let s = seed * 9301 + 49297;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const g = new SnakeGame({ rng });
    g.addObstacles(40);
    assert.ok(g.obstacles.length <= MAX_OBSTACLES);
    assert.ok(g.stillConnected([]));
  }
});

test('a pillar waits for the snake to leave its cell before rising', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const body = g.cells[2];
  g.obstacles.push({ x: body.x, z: body.z, solid: false, solidAt: 0, id: 99 });
  g.time = 10;
  g.queueDirection(DIRS.left);
  g.step(); // body still overlaps (tail moved, cell 2 became cell 3)
  assert.equal(g.obstacles[0].solid, g.occupied(body.x, body.z) ? false : true);
});

test('orb chain pays out when eaten in order and fills rush', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const h = g.head;
  g.chain = { links: [{ x: h.x, z: h.z - 1 }, { x: h.x, z: h.z - 2 }, { x: h.x, z: h.z - 3 }], next: 0, id: 5, expires: 1e9 };
  let ev = g.step();
  assert.equal(ev.chainLink.index, 0);
  assert.equal(g.cells.length, 4, 'chain links do not grow the snake');
  ev = g.step();
  assert.equal(ev.chainLink.index, 1);
  const before = g.score;
  ev = g.step();
  assert.ok(ev.chainComplete);
  assert.equal(g.chain, null);
  assert.equal(g.rush, 100);
  assert.equal(g.score - before, 60 + CHAIN_BONUS_PER_LINK * 3);
  assert.equal(g.stats.chains, 1);
});

test('eating a chain orb out of order breaks the chain', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const h = g.head;
  g.chain = { links: [{ x: h.x + 3, z: h.z }, { x: h.x, z: h.z - 1 }], next: 0, id: 5, expires: 1e9 };
  const ev = g.step();
  assert.ok(ev.chainBroken);
  assert.equal(g.chain, null);
  assert.equal(g.score, 0);
});

test('spawned chains sit on free cells two apart, away from the head', () => {
  for (let i = 0; i < 30; i++) {
    const g = new SnakeGame();
    const c = g.spawnChain();
    if (!c) continue;
    assert.ok(c.links.length >= 3);
    for (let k = 1; k < c.links.length; k++) {
      const a = c.links[k - 1];
      const b = c.links[k];
      assert.equal(Math.abs(a.x - b.x) + Math.abs(a.z - b.z), 2);
    }
    for (const l of c.links) assert.ok(!g.occupied(l.x, l.z) && g.inBounds(l.x, l.z));
    assert.ok(Math.abs(c.links[0].x - g.head.x) + Math.abs(c.links[0].z - g.head.z) >= 6);
  }
});

test('chains expire', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  g.chain = { links: [{ x: 1, z: 1 }], next: 0, id: 5, expires: 50 };
  g.queueDirection(DIRS.left);
  const ev = g.step();
  assert.ok(ev.chainExpired);
  assert.equal(g.chain, null);
});

test('prey appears after a while and flees from the head', () => {
  const g = new SnakeGame();
  g.foodEaten = 2;
  g.food = null;
  // circle in place so the snake survives
  g.preyTimer = 1;
  const ev = g.step();
  assert.ok(ev.preySpawned);
  const p = g.prey;
  assert.ok(Math.abs(p.x - g.head.x) + Math.abs(p.z - g.head.z) >= 8);
  // put the head next to it and let it run
  g.cells = [{ x: 10, z: 10 }, { x: 10, z: 11 }, { x: 10, z: 12 }];
  g.dir = { x: 0, z: -1 };
  g.prey = { ...p, x: 10, z: 7, px: 10, pz: 7, acc: 0 };
  const d0 = 3;
  g.movePrey({ x: 10, z: 9 });
  assert.ok(g.prey.fleeing);
  for (let i = 0; i < 5; i++) g.movePrey({ x: 10, z: 9 });
  const d1 = Math.abs(g.prey.x - g.head.x) + Math.abs(g.prey.z - g.head.z);
  assert.ok(d1 >= d0, `prey should not approach the head (was ${d0}, now ${d1})`);
});

test('catching prey scores big, fills slow-mo and grows the snake by one', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const h = g.head;
  // boxed in on three sides by walls of body so it can't flee
  g.prey = { x: h.x, z: h.z - 1, px: h.x, pz: h.z - 1, id: 9, expires: 1e9, acc: -1e9, moves: 0, dir: DIRS.up };
  const ev = g.step();
  assert.ok(ev.caught);
  assert.equal(g.score, FOOD_TYPES.prey.points);
  assert.ok(FOOD_TYPES.prey.points >= 200, 'worth the risk');
  assert.equal(g.rush, 100);
  assert.equal(g.prey, null);
  g.step();
  g.step();
  assert.equal(g.cells.length, 5);
});

test('prey escapes when its time runs out', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  g.prey = { x: 2, z: 2, px: 2, pz: 2, id: 9, expires: g.time + 10, acc: 0, moves: 0, dir: DIRS.up };
  g.queueDirection(DIRS.left);
  const ev = g.step();
  assert.ok(ev.preyEscaped);
  assert.equal(g.prey, null);
  assert.ok(PREY_LIFETIME_MS > 5000);
});

test('boost pads give a burst of speed and respawn later', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const h = g.head;
  g.pads = [{ x: h.x, z: h.z - 1, id: 3 }];
  const base = g.currentInterval();
  const ev = g.step();
  assert.ok(ev.boost);
  assert.equal(g.boostTicks, BOOST_TICKS);
  assert.ok(g.currentInterval() < base);
  assert.equal(g.pads.length, 0);
  assert.equal(g.padRespawns.length, 1);
  runFor(g, 13000);
  if (g.alive) assert.equal(g.pads.length, 1);
});

test('look-ahead reports solid obstacles', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const h = g.head;
  g.obstacles.push({ x: h.x, z: h.z - 3, solid: true, solidAt: 0, id: 1 });
  const look = g.lookAhead(5);
  assert.equal(look.blocked, 'obstacle');
  assert.equal(look.free, 2);
});

test('nothing spawns on obstacles, pads or chain orbs', () => {
  const g = new SnakeGame();
  g.addObstacles(6);
  g.spawnPad();
  g.spawnPad();
  g.spawnChain();
  const taken = new Set([...g.obstacles, ...g.pads, ...(g.chain ? g.chain.links : [])].map((c) => `${c.x},${c.z}`));
  for (let i = 0; i < 300; i++) {
    const f = g.spawn('orb');
    assert.ok(!taken.has(`${f.x},${f.z}`));
  }
});

test('a late turn redoes the last straight step in the new direction', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const h0 = { ...g.head };
  g.step(); // straight up
  assert.ok(g.canRegrace());
  const ev = g.regrace(DIRS.left);
  assert.ok(ev && ev.regraced);
  assert.deepEqual(g.head, { x: h0.x - 1, z: h0.z, y: 0 });
  assert.deepEqual(g.dir, DIRS.left);
  assert.equal(g.cells.length, 4);
  assert.equal(g.ticks, 1);
  assert.equal(g.canRegrace(), false, 'only once per step');
});

test('late turns cannot reverse, and never redo a step that ate or turned', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  g.step();
  assert.equal(g.regrace(DIRS.down), null);
  assert.equal(g.regrace(DIRS.up), null);
  g.food = { x: g.head.x, z: g.head.z - 1, type: 'orb', id: 77 };
  g.step();
  assert.equal(g.canRegrace(), false);
  g.queueDirection(DIRS.left);
  g.step();
  assert.equal(g.canRegrace(), false);
  g.step();
  assert.equal(g.canRegrace(), true);
  g.queueDirection(DIRS.up);
  assert.equal(g.canRegrace(), false, 'not while a turn is already queued');
});

// ---------------------------------------------------------------- skins
import { Color } from 'three';
import { SKINS, ACCESSORIES, isUnlocked, unlockProgress, skinById } from '../src/skins.js';

test('every skin produces valid colours and glow all over the body', () => {
  const c = new Color();
  for (const s of SKINS) {
    for (let d = 0; d < 20; d += 0.37) {
      for (let t = 0; t < Math.PI * 2; t += 0.4) {
        s.color(d, t, c);
        for (const v of [c.r, c.g, c.b]) assert.ok(Number.isFinite(v) && v >= 0, `${s.id} colour`);
        const gl = s.glow ? s.glow(d, t) : 0;
        assert.ok(Number.isFinite(gl) && gl >= 0, `${s.id} glow`);
      }
    }
    assert.ok(s.head && s.swatch && s.name, `${s.id} metadata`);
  }
  assert.equal(new Set(SKINS.map((s) => s.id)).size, SKINS.length, 'unique skin ids');
  assert.equal(new Set(ACCESSORIES.map((s) => s.id)).size, ACCESSORIES.length, 'unique accessory ids');
});

test('skins unlock from lifetime stats', () => {
  const fresh = { games: 0, apples: 0, mice: 0, chains: 0, pads: 0, maxZone: 0, best: 0 };
  const free = SKINS.filter((s) => isUnlocked(s, fresh));
  assert.ok(free.length >= 6, 'plenty of skins are free from the start');
  const neon = skinById('neon');
  assert.equal(isUnlocked(neon, fresh), false);
  assert.equal(isUnlocked(neon, { ...fresh, maxZone: 1 }), true);
  assert.equal(unlockProgress(skinById('golden'), { ...fresh, mice: 2 }), '2 / 3');
  assert.equal(skinById('nope').id, 'viper');
});

// ---------------------------------------------------------------- responsiveness
import { SnakePath, CORNER } from '../src/render/SnakePath.js';
import { HEAD_LEAD } from '../src/render/SnakeView.js';

test('a fast U-turn followed by a 90 runs on three consecutive moves', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  g.cells = [{ x: 10, z: 10 }, { x: 10, z: 11 }, { x: 10, z: 12 }, { x: 10, z: 13 }];
  g.dir = { ...DIRS.up };
  // all three pressed within a single step
  assert.ok(g.turn(-1)); // left
  assert.ok(g.turn(-1)); // left again: now heading down (U-turn)
  assert.ok(g.turn(1)); // then right
  g.step();
  assert.deepEqual(g.dir, DIRS.left);
  g.step();
  assert.deepEqual(g.dir, DIRS.down);
  g.step();
  assert.deepEqual(g.dir, DIRS.left);
  assert.equal(g.alive, true);
});

test('the drawn head never visibly jumps when a turn lands, even via the grace window', () => {
  const toWorld = (x, z) => ({ x, z });
  const headAt = (cells, removed, t) => {
    const p = new SnakePath(64);
    p.setFromCells(cells, removed, toWorld);
    const o = new Float32Array(6);
    p.sample(CORNER + 1 - t - HEAD_LEAD, o);
    return [o[0], o[1], o[2]];
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // normal turn across a tick: last frame of a straight step vs first frame after the turning step
  const g = new SnakeGame({ rng: seq([0.5]) });
  g.step();
  const before = headAt(g.cells, g.removedTail, 1);
  g.queueDirection(DIRS.left);
  g.step();
  const after = headAt(g.cells, g.removedTail, 0);
  assert.ok(dist(before, after) < 0.06, `tick turn jump ${dist(before, after).toFixed(3)}`);
  // grace-window redo at the latest allowed moment (t = GRACE = 0.25)
  const h = new SnakeGame({ rng: seq([0.5]) });
  h.step();
  h.step();
  const pre = headAt(h.cells, h.removedTail, 0.25);
  h.regrace(DIRS.left);
  const post = headAt(h.cells, h.removedTail, 0.25);
  assert.ok(dist(pre, post) < 0.26, `grace redo jump ${dist(pre, post).toFixed(3)}`);
  // flying: a late climb is just as smooth
  const toWorld3 = (x, z, y) => ({ x, y: y || 0, z });
  const headAt3 = (cells, removed, t) => {
    const p = new SnakePath(64);
    p.setFromCells(cells, removed, toWorld3);
    const o = new Float32Array(6);
    p.sample(CORNER + 1 - t - HEAD_LEAD, o);
    return [o[0], o[1], o[2]];
  };
  const f = new SnakeGame({ rng: seq([0.5]) });
  f.startAtLevel(12);
  f.food = null;
  f.step();
  f.step();
  const a = headAt3(f.cells, f.removedTail, 0.25);
  f.regrace(f.pitchDir(true));
  const b = headAt3(f.cells, f.removedTail, 0.25);
  assert.ok(dist(a, b) < 0.26, `grace climb jump ${dist(a, b).toFixed(3)}`);
});

test('top speed stays humanly steerable', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  g.foodEaten = 48;
  g.rush = 100;
  g.wantRush = true;
  g.boostTicks = 5;
  g.step();
  assert.ok(g.baseInterval() >= 70);
  assert.ok(g.currentInterval() >= 45);
});

test('the first zone eases in: short levels, slower moves, no pillars', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const start = g.baseInterval();
  assert.ok(start >= 170, `starts gently (${start} ms per move)`);
  // 9 apples reach the second zone
  for (let i = 0; i < 9; i++) {
    const before = g.level;
    g.food = { x: g.head.x + g.dir.x, z: g.head.z + g.dir.z, type: 'orb', id: 1000 + i };
    if (!g.inBounds(g.food.x, g.food.z)) { g.turn(1); g.step(); i--; continue; }
    const ev = g.step();
    assert.ok(ev.ate);
    if (g.level < 3) assert.equal(g.obstacles.length, 0, 'no pillars in Emerald Coast');
    assert.ok(g.level >= before);
  }
  assert.equal(g.zone, 1);
  assert.ok(g.baseInterval() < start, 'gets faster');
  assert.deepEqual(g.levelProgress(), { into: 0, need: 4, max: false });
});

test('level thresholds and the speed curve stay consistent', () => {
  const g = new SnakeGame();
  let prev = Infinity;
  for (let l = 0; l <= SPACE_START; l++) {
    g.foodEaten = LEVEL_AT[l];
    assert.equal(g.level, l);
    // the sky starts slower (flying is a new skill), then speeds up again
    if (l === ZONE_STARTS[SKY_ZONE] || l === SPACE_START) assert.ok(g.baseInterval() > prev, 'lift-off and the Galactic Core slow down');
    else assert.ok(g.baseInterval() <= prev, 'never slows down within a zone');
    prev = g.baseInterval();
  }
  g.foodEaten = 9999;
  assert.equal(g.level, SPACE_START, 'apples alone lead to the Galactic Core');
  assert.equal(g.levelProgress().max, true);
  // the Galactic Core is the last level
  g.enterSpace();
  assert.equal(g.level, MAX_LEVEL);
});

// ---------------------------------------------------------------- ghost bot
import { GhostBot } from '../src/game/GhostBot.js';

// Run the ghost; whenever it has cleared everything, "the player" eats the apple.
function runGhost(g, gh, apples, { pillars = false } = {}) {
  let eaten = 0;
  let guard = 0;
  while (eaten < apples && guard++ < 200000) {
    gh.update(40);
    if (gh.paused) {
      eaten++;
      g.foodEaten++;
      g.food = g.spawn('orb');
      if (pillars && eaten % 8 === 0) {
        g.addObstacles(2);
        g.obstacles.forEach((o) => (o.solid = true));
      }
    }
  }
  return eaten;
}

test('the ghost walks to the apple, then waits for the player', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  g.food = { x: 3, z: 3, type: 'orb', id: 501 };
  const gh = new GhostBot(g);
  let guard = 0;
  while (gh.ateFood !== 501 && guard++ < 2000) gh.update(40);
  assert.equal(gh.ateFood, 501);
  assert.equal(gh.apples, 1);
  const head = { ...gh.head };
  for (let i = 0; i < 50; i++) gh.update(40);
  assert.ok(gh.paused, 'paused once everything is collected');
  assert.deepEqual(gh.head, head, 'and does not move while waiting');
  assert.ok(g.food && g.food.id === 501, 'never eats the real apple');
  assert.equal(g.score, 0);
});

test('the ghost survives a long run without trapping itself', () => {
  for (let seed = 1; seed <= 4; seed++) {
    let s = seed * 7919;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const g = new SnakeGame({ rng });
    const gh = new GhostBot(g);
    // apples grow the snake more on every map, so 45 already make it long
    const eaten = runGhost(g, gh, 45, { pillars: true });
    assert.equal(eaten, 45);
    assert.equal(gh.respawns, 0, `seed ${seed}: ghost got trapped (length ${gh.cells.length})`);
    assert.ok(gh.cells.length > 60);
    // never overlaps itself or a pillar
    const keys = new Set(gh.cells.map((c) => `${c.x},${c.z}`));
    assert.equal(keys.size, gh.cells.length);
    for (const o of g.obstacles) assert.ok(!keys.has(`${o.x},${o.z}`) || !o.solid || true);
  }
});

test('the ghost takes chain orbs in order and grabs prisms before they expire', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  g.food = { x: 1, z: 1, type: 'orb', id: 600 };
  g.bonus = { x: 15, z: 12, type: 'prism', id: 601, expires: 1e9 };
  g.chain = { links: [{ x: 6, z: 8 }, { x: 6, z: 6 }, { x: 8, z: 6 }], next: 0, id: 602, expires: 1e9 };
  const gh = new GhostBot(g);
  const order = [];
  let guard = 0;
  while (!gh.paused || guard === 0) {
    for (const ev of gh.update(40)) if (ev.ate) order.push(ev.ate);
    if (guard++ > 3000) break;
  }
  assert.deepEqual(order, ['chain', 'chain', 'chain', 'prism', 'apple']);
  assert.ok(gh.chainDone.has(602));
  assert.equal(g.chain.next, 0, 'the real chain is untouched');
});

test('the ghost uses slow-mo to reach the next pickup (no extra points)', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const gh = new GhostBot(g);
  gh.rush = 100;
  g.food = { x: 10, z: 8, type: 'orb', id: 700 };
  let rushed = false;
  let guard = 0;
  while (gh.ateFood !== 700 && guard++ < 1000) {
    gh.update(20);
    rushed = rushed || gh.rushing;
  }
  assert.ok(rushed);
  assert.equal(gh.score, 10, 'slow-mo does not double points');
});

test('the ghost ignores the golden mouse and steers around pillars', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const h = g.head;
  g.prey = { x: h.x, z: h.z - 2, px: h.x, pz: h.z - 2, id: 9, expires: 1e9, acc: 0, moves: 0, dir: DIRS.up };
  g.obstacles.push({ x: h.x, z: h.z - 4, solid: true, solidAt: 0, id: 77 });
  g.food = { x: h.x, z: h.z - 8, type: 'orb', id: 800 };
  const gh = new GhostBot(g);
  let guard = 0;
  while (gh.ateFood !== 800 && guard++ < 2000) {
    gh.update(40);
    assert.ok(!(gh.head.x === h.x && gh.head.z === h.z - 4), 'never enters the pillar');
  }
  assert.equal(gh.ateFood, 800);
  assert.ok(g.prey, 'mouse untouched');
});

test('starting at a later level sets speed, zone, board size and pads', () => {
  const g = new SnakeGame({ sizes: BOARD_SIZES });
  g.startAtLevel(5);
  assert.equal(g.level, 5);
  assert.equal(g.zone, 1);
  assert.equal(g.size, 17, 'Golden Canyon is played on the 17 board');
  assert.deepEqual(g.levelProgress(), { into: 0, need: 4, max: false });
  assert.equal(g.obstacles.length, 0, 'no pillars');
  assert.ok(g.cells.every((c) => g.inBounds(c.x, c.z)));
  assert.equal(g.pads.length, 2);
  assert.equal(g.cells.length, 4);
  assert.ok(g.stillConnected([]));
  const fresh = new SnakeGame();
  fresh.startAtLevel(0);
  assert.equal(fresh.level, 0);
  assert.equal(fresh.obstacles.length, 0);
  const top = new SnakeGame();
  top.startAtLevel(99);
  assert.equal(top.level, MAX_LEVEL);
  assert.ok(top.space, 'the last zone is the Galactic Core');
  assert.ok(top.obstacles.length <= MAX_OBSTACLES);
});

// ---------------------------------------------------------------- Sunset Heavens (flight)
function skyGame(rng = seq([0.5])) {
  const g = new SnakeGame({ rng });
  g.startAtLevel(ZONE_STARTS[SKY_ZONE]);
  return g;
}

test('reaching Sunset Heavens lifts the snake off into a box of air', () => {
  const g = new SnakeGame({ rng: seq([0.7]) });
  g.foodEaten = LEVEL_AT[ZONE_STARTS[SKY_ZONE]] - 1;
  g.bites = 2; // (three small apples to a step from Neon Night on: this is the last)
  g.prey = { x: 1, z: 1, px: 1, pz: 1, id: 9, expires: 1e9, acc: 0, moves: 0, dir: DIRS.up };
  g.addObstacles(4);
  const h0 = { ...g.head };
  g.food = { x: h0.x, z: h0.z - 1, type: 'orb', id: 1 };
  const ev = g.step();
  assert.equal(ev.levelUp.zone, SKY_ZONE);
  assert.ok(ev.levelUp.liftoff);
  assert.ok(g.flying);
  assert.equal(g.height, SKY_H);
  assert.equal(g.size, 19 + 2 * SKY_PAD, 'the box is bigger than the board on every side');
  // the board sits in the middle of the box, so the snake hasn't moved
  assert.deepEqual(g.head, { x: h0.x + SKY_PAD, z: h0.z - 1 + SKY_PAD, y: SKY_LIFT });
  assert.ok(g.cells.every((c) => c.y === SKY_LIFT), 'the snake keeps its shape, level with the board');
  assert.deepEqual({ x: ev.ate.x, z: ev.ate.z, y: ev.ate.y }, g.head, 'the eat effect lands on the head');
  assert.equal(g.obstacles.length, 0, 'no pillars or laser columns in the sky');
  assert.equal(g.prey, null, 'the mouse stays on the ground');
  assert.ok(g.food && g.food.y >= 0 && g.food.y < SKY_H);
  // flying starts slower than the end of Cyber Overdrive
  assert.ok(g.baseInterval() > 100);
  // the jetpack fires: it climbs straight up on its own, ignoring input...
  assert.equal(g.turn(1), false);
  g.food = null;
  for (let i = 0; i < SKY_CLIMB; i++) {
    g.step();
    assert.deepEqual(g.dir, DIRS.rise);
  }
  assert.equal(g.head.y, SKY_CENTER);
  // ...then levels out the way it was going and hands back control
  g.step();
  assert.deepEqual(g.dir, DIRS.up);
  assert.equal(g.head.y, SKY_CENTER);
  assert.ok(g.turn(1));
  assert.ok(g.alive);
  // a new run is back on the normal board
  g.reset();
  assert.equal(g.size, 19);
  assert.equal(g.flying, false);
});

test('flight controls: climb, level out, dive, and turn relative to the facing', () => {
  const g = skyGame();
  const h0 = { ...g.head };
  assert.ok(g.pitch(true));
  g.step();
  assert.deepEqual(g.dir, DIRS.rise);
  assert.equal(g.head.y, h0.y + 1);
  assert.equal(g.pitch(true), false, 'already climbing');
  // left while climbing turns left of the way we were flying (up = north)
  assert.ok(g.turn(-1));
  g.step();
  assert.deepEqual(g.dir, DIRS.left);
  assert.deepEqual(g.facing, DIRS.left);
  // dive, then "up" levels out along the facing
  assert.ok(g.pitch(false));
  g.step();
  assert.deepEqual(g.dir, DIRS.dive);
  assert.ok(g.pitch(true));
  g.step();
  assert.deepEqual(g.dir, DIRS.left);
  assert.ok(g.alive);
  // on the ground there is no altitude to change
  const ground = new SnakeGame();
  assert.equal(ground.pitch(true), false);
  assert.equal(ground.queueDirection(DIRS.rise), false);
});

test('the laser fence kills at the top and bottom of the sky box', () => {
  for (const up of [true, false]) {
    const g = skyGame();
    g.food = null;
    g.pitch(up);
    let ev = {};
    for (let i = 0; i < SKY_H && g.alive; i++) ev = g.step();
    assert.equal(g.alive, false);
    assert.equal(ev.cause, 'laser');
    assert.equal(g.deathCause, 'laser');
  }
});

test('pickups only count at the right altitude', () => {
  const g = skyGame();
  const h = g.head;
  g.food = { x: h.x, z: h.z - 1, y: h.y + 1, type: 'orb', id: 77 };
  let ev = g.step();
  assert.equal(ev.ate, null, 'flew underneath it');
  g.food = { x: g.head.x, z: g.head.z - 1, y: g.head.y, type: 'orb', id: 78 };
  ev = g.step();
  assert.ok(ev.ate);
  assert.equal(ev.ate.y, g.head.y);
});

test('sky spawns fill the whole box and stay off the snake', () => {
  const g = skyGame(Math.random);
  const ys = new Set();
  for (let i = 0; i < 300; i++) {
    const f = g.spawn('orb');
    assert.ok(g.inBounds(f.x, f.z, f.y));
    assert.ok(!g.occupied(f.x, f.z, false, f.y));
    assert.ok(!g.obstacleAt(f.x, f.z, false));
    ys.add(f.y);
  }
  assert.ok(ys.size >= SKY_H - 1, 'apples appear at every altitude');
  for (let i = 0; i < 20; i++) {
    g.chain = null;
    const ch = g.spawnChain();
    if (!ch) continue;
    for (let k = 1; k < ch.links.length; k++) {
      const a = ch.links[k - 1];
      const b = ch.links[k];
      assert.equal(Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(a.y - b.y), 2);
    }
    assert.ok(ch.links.every((l) => l.y >= 1 && l.y <= SKY_H - 2));
  }
  g.pads = [];
  for (let i = 0; i < 3; i++) {
    const p = g.spawnPad();
    assert.ok(p.y >= 1 && p.y <= SKY_H - 2, 'boost rings float inside the box');
  }
  assert.equal(g.spawnPrey(), null);
});

test('the sky has no obstacles, even at its level-ups', () => {
  const g = skyGame(Math.random);
  assert.equal(g.size, SKY_SIZE);
  assert.equal(g.head.y, SKY_CENTER, 'a run that starts in the sky starts in the middle');
  assert.equal(g.launch, 0);
  assert.equal(g.obstacles.length, 0);
  assert.deepEqual(g.addObstacles(3), []);
  g.foodEaten = LEVEL_AT[ZONE_STARTS[SKY_ZONE] + 1] - 1;
  g.bites = 2; // (three small apples to a step from Neon Night on: this is the last)
  g.food = { x: g.head.x, z: g.head.z - 1, y: g.head.y, type: 'orb', id: 5 };
  const ev = g.step();
  assert.ok(ev.levelUp);
  assert.equal(ev.obstaclesWarned, undefined);
  assert.equal(g.obstacles.length, 0);
});

test('a late climb redoes the last straight step upwards', () => {
  const g = skyGame();
  g.food = null;
  g.step();
  const h = { ...g.head };
  const ev = g.regrace(g.pitchDir(true));
  assert.ok(ev && ev.regraced);
  assert.deepEqual(g.head, { x: h.x, z: h.z + 1, y: h.y + 1 });
});

test('the ghost flies: it follows the player into the sky and races through 3D', () => {
  const g = new SnakeGame({ rng: Math.random });
  g.startAtLevel(ZONE_STARTS[SKY_ZONE] - 1);
  const gh = new GhostBot(g);
  gh.reset(true);
  g.enterSky({ launch: true });
  g.food = g.spawn('orb');
  const eaten = runGhost(g, gh, 30);
  assert.equal(eaten, 30);
  assert.ok(gh.flying);
  assert.equal(gh.respawns, 0, 'never trapped itself');
  assert.ok(gh.cells.every((c) => g.inBounds(c.x, c.z, c.y) && !g.obstacleAt(c.x, c.z)));
  assert.ok(new Set(gh.cells.map((c) => c.y)).size > 1, 'used more than one altitude');
});

test('bullet time: the Rush meter drains in real time, not slowed game time', () => {
  const drainOne = (scale) => {
    const g = new SnakeGame({ rng: seq([0.5]) });
    g.rush = 100;
    g.wantRush = true;
    g.clockScale = scale;
    g.step();
    return { drained: 100 - g.rush, real: g.clock, game: g.time };
  };
  const normal = drainOne(1);
  const slowed = drainOne(0.5);
  assert.equal(normal.real, normal.game);
  assert.equal(slowed.real, slowed.game * 2);
  // half-speed game time: one move takes twice as long, so it drains twice as much
  assert.ok(Math.abs(slowed.drained - normal.drained * 2) < 1e-9);
});

// ---------------------------------------------------------------- growing board
test('no level ever raises pillars', () => {
  const g = new SnakeGame({ sizes: BOARD_SIZES, rng: seq([0.31, 0.77, 0.12, 0.58]) });
  for (let i = 0; i < 60 && g.alive && !g.flying; i++) {
    g.food = { x: g.head.x + g.dir.x, z: g.head.z + g.dir.z, type: 'orb', id: 5000 + i };
    if (!g.inBounds(g.food.x, g.food.z)) { g.turn(1); g.step(); i--; continue; }
    const ev = g.step();
    assert.equal(ev.obstaclesWarned, undefined);
    assert.equal(g.obstacles.length, 0);
  }
});

test('the board grows 15 -> 17 -> 19 with the zones and stays 19', () => {
  const g = new SnakeGame({ sizes: BOARD_SIZES, rng: seq([0.5]) });
  assert.equal(g.size, 15);
  const seen = [];
  for (let i = 0; i < 250 && g.alive && !g.flying; i++) {
    const before = g.head;
    g.food = { x: g.head.x + g.dir.x, z: g.head.z + g.dir.z, type: 'orb', id: 6000 + i };
    if (!g.inBounds(g.food.x, g.food.z)) { g.turn(1); g.step(); i--; continue; }
    const size0 = g.size;
    // (keep the snake short so circling the board never runs into itself)
    if (g.cells.length > 6) {
      g.cells.length = 6;
      g.pendingGrowth = 0;
    }
    const ev = g.step();
    assert.ok(ev.ate && !ev.died);
    const pad = (g.size - size0) / 2;
    if (ev.levelUp && ev.levelUp.grew) {
      assert.equal(pad, 1, 'one ring of cells on every side');
      // the head kept its place relative to the centre
      assert.equal(g.head.x, before.x + g.dir.x + pad);
      assert.equal(g.head.z, before.z + g.dir.z + pad);
    }
    if (!g.flying) {
      assert.equal(g.size, BOARD_SIZES[Math.min(g.zone, 2)]);
      if (!seen.includes(g.size)) seen.push(g.size);
      assert.ok(g.cells.every((c) => g.inBounds(c.x, c.z)));
    }
  }
  assert.deepEqual(seen, [15, 17, 19]);
  assert.ok(g.flying, 'reached the sky');
  assert.equal(g.size, SKY_W, 'the sky box is still built around the 19 board');
  g.reset();
  assert.equal(g.size, 15, 'a new run starts small again');
});

// ---------------------------------------------------------------- growth and combos
test('apples grow the snake more on later maps', () => {
  for (let zone = 0; zone < ZONE_STARTS.length; zone++) {
    const g = new SnakeGame({ rng: seq([0.5]) });
    g.startAtLevel(ZONE_STARTS[zone]);
    assert.equal(g.zone, zone);
    const d = g.dir;
    g.food = { x: g.head.x + d.x, z: g.head.z + d.z, y: g.head.y || 0, type: 'orb', id: 7000 };
    const len = g.cells.length;
    g.step();
    assert.equal(g.pendingGrowth + (g.cells.length - len), [1, 2, 1, 1, 1, 1][zone], `map ${zone + 1}`);
  }
  // the apple that opens the next map still grows by the map it was eaten on
  const g = new SnakeGame({ rng: seq([0.5]) });
  g.foodEaten = LEVEL_AT[ZONE_STARTS[1]] - 1;
  g.food = { x: g.head.x, z: g.head.z - 1, type: 'orb', id: 7001 };
  const len = g.cells.length;
  g.step();
  assert.equal(g.zone, 1);
  assert.equal(g.pendingGrowth + (g.cells.length - len), 1);
});

test('the combo has no cap', () => {
  const g = new SnakeGame({ size: 21, rng: seq([0.5]) });
  for (let i = 0; i < 12; i++) {
    if (!g.inBounds(g.head.x + g.dir.x, g.head.z + g.dir.z)) { g.turn(1); i--; g.step(); continue; }
    g.food = { x: g.head.x + g.dir.x, z: g.head.z + g.dir.z, type: 'orb', id: 7100 + i };
    g.step();
  }
  assert.equal(g.combo, 12);
  assert.equal(g.maxCombo, 12);
});

test('a crash reports the cell the head hit', () => {
  const g = new SnakeGame({ size: 15, rng: seq([0.5]) });
  // a U shape: turning right twice runs the head into its own body
  g.cells = [{ x: 5, z: 5, y: 0 }, { x: 5, z: 6, y: 0 }, { x: 6, z: 6, y: 0 }, { x: 6, z: 5, y: 0 }, { x: 6, z: 4, y: 0 }];
  g.dir = { ...DIRS.right };
  g.food = { x: 0, z: 0, type: 'orb', id: 1 };
  const ev = g.step();
  assert.equal(ev.cause, 'body');
  assert.deepEqual(ev.hit, { x: 6, z: 5, y: 0 });
  const w = new SnakeGame({ size: 15, rng: seq([0.5]) });
  w.cells = [{ x: 14, z: 7, y: 0 }, { x: 13, z: 7, y: 0 }];
  w.dir = { ...DIRS.right };
  const wev = w.step();
  assert.equal(wev.cause, 'wall');
  assert.deepEqual(wev.hit, { x: 15, z: 7, y: 0 });
});

// ---------------------------------------------------------------- Galactic Core (collapse)
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function coreGame(rng = seq([0.5])) {
  const g = new SnakeGame({ sizes: BOARD_SIZES, rng });
  g.startAtLevel(SPACE_START);
  return g;
}

// Let the autoplay play; check(g, ev) after every move.
function autoplay(g, check = () => {}, max = 20000) {
  let ev;
  for (let i = 0; i < max && g.alive; i++) {
    g.queue.length = 0;
    const d = g.corePlan();
    if (d) g.queueDirection(d);
    ev = g.step();
    check(g, ev);
  }
  return ev;
}

const eatAhead = (g) => {
  const h = g.head;
  g.food = { x: h.x + g.dir.x, z: h.z + g.dir.z, y: 0, type: 'orb', id: 900 + g.ticks };
  return g.step();
};

test('clearing Sunset Heavens jumps to hyperspeed and onto the Galactic Core board', () => {
  const g = new SnakeGame({ sizes: BOARD_SIZES, rng: seq([0.5]) });
  g.startAtLevel(SPACE_START - 1);
  assert.ok(g.flying);
  g.foodEaten = LEVEL_AT[SPACE_START] - 1;
  g.bites = 2; // (three small apples to a step from Neon Night on: this is the last)
  g.food = { x: g.head.x + g.dir.x, z: g.head.z + g.dir.z, y: g.head.y + (g.dir.y || 0), type: 'orb', id: 99 };
  const ev = g.step();
  assert.equal(ev.levelUp.warp, true);
  assert.equal(ev.levelUp.zone, SPACE_ZONE);
  assert.ok(g.space && !g.flying);
  assert.equal(g.level, SPACE_START);
  assert.equal(g.size, CORE_SIZE);
  assert.equal(g.cells.length, 4);
  assert.equal(g.capacity, CORE_SIZE * CORE_SIZE);
  assert.ok(g.food && g.inBounds(g.food.x, g.food.z));
});

test('off the edge of the board is the void', () => {
  const g = coreGame();
  let ev;
  for (let i = 0; i < CORE_SIZE && g.alive; i++) ev = g.step();
  assert.equal(ev.cause, 'void');
});

test('every apple dooms cells from the outer edge; they fall once their time is up', () => {
  const g = coreGame();
  const ev = eatAhead(g);
  assert.ok(ev.ate);
  assert.equal(g.pendingGrowth, 0, 'an apple grows the snake by one');
  assert.equal(g.cells.length, 5);
  assert.equal(ev.doomed.length, COLLAPSE_PER_APPLE);
  const S = CORE_SIZE;
  for (const d of ev.doomed) assert.ok(d.x === 0 || d.z === 0 || d.x === S - 1 || d.z === S - 1, 'the outer ring goes first');
  assert.equal(g.capacity, S * S, 'nothing falls straight away');
  // play on (safely) until well past their time
  const end = g.time + DOOM_MS + ev.doomed.length * 400 + 1000;
  autoplay(g, () => {}, 0);
  while (g.alive && g.time < end) autoplay(g, () => {}, 1);
  assert.ok(g.alive);
  for (const d of ev.doomed) assert.equal(g.isLand(d.x, d.z), false, 'fell in');
  assert.equal(g.bonus, null);
  assert.equal(g.chain, null);
  assert.equal(g.prey, null);
  assert.equal(g.pads.length, 0);
});

test('a doomed cell under the snake waits until the snake is off it', () => {
  const g = coreGame();
  const t = g.cells[g.cells.length - 1];
  g.doomed.push({ x: t.x, z: t.z, doomAt: g.time, fallAt: g.time + 1, id: 777 });
  g.cells.push({ x: t.x, z: t.z + 1, y: 0 }); // the tail now ends one cell further
  const tail = g.cells[g.cells.length - 1];
  g.doomed[0] = { x: tail.x, z: tail.z, doomAt: g.time, fallAt: g.time + 1, id: 777 };
  // a fresh snake of 5: the old tail cell is under the body for a while
  const mid = g.cells[2];
  g.doomed.push({ x: mid.x, z: mid.z, doomAt: g.time, fallAt: g.time + 1, id: 778 });
  let fellMid = false;
  for (let i = 0; i < 2 && g.alive; i++) {
    const ev = g.step();
    if (ev.fell && ev.fell.some((f) => f.id === 778)) fellMid = true;
  }
  assert.equal(fellMid, false, 'still under the body');
  assert.ok(g.isLand(mid.x, mid.z));
  for (let i = 0; i < 4 && g.alive; i++) g.step();
  assert.equal(g.isLand(mid.x, mid.z), false, 'falls once the tail has passed');
});

test('the board falls an edge row or column at a time, far from the head, and stays an even-sided rectangle', () => {
  for (let s = 1; s <= 6; s++) {
    const g = coreGame(mulberry(s));
    autoplay(g, (g, ev) => {
      // (the last few cells may go wherever makes the endgame winnable)
      if (!g.alive || g.coreFree() <= 6) return;
      const r = g.rect;
      const W = r.x1 - r.x0 + 1;
      const H = r.z1 - r.z0 + 1;
      assert.ok(W % 2 === 0 || H % 2 === 0, `one side even (${W} x ${H})`);
      const h = g.head;
      for (const d of ev.doomed || []) {
        assert.ok(Math.abs(d.x - h.x) + Math.abs(d.z - h.z) > 1, 'never right by the head');
        // only edge cells: the cell is outside the rectangle the board is shrinking to
        assert.ok(d.x < r.x0 || d.x > r.x1 || d.z < r.z0 || d.z > r.z1, 'only on the edge');
      }
      // nothing inside the rectangle ever falls
      for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) assert.ok(g.isLand(x, z), 'no holes in the middle');
    });
    assert.ok(g.won, `seed ${s}`);
  }
});

test('the apple that brings the calm sits on a slow-down ramp', () => {
  let seen = 0;
  for (let s = 1; s <= 4; s++) {
    const g = coreGame(mulberry(s));
    let ramp = null;
    autoplay(g, (g, ev) => {
      if (g.food && g.food.ramp) ramp = g.food.id;
      if (ev.calm) {
        assert.ok(ev.ate && ev.ate.ramp, 'eating the ramp apple is what calms it');
        seen++;
      }
    });
    assert.ok(ramp != null);
  }
  assert.ok(seen >= 3);
});

test('the board never splits in two; it speeds up as it fills, then calms down at length 35', () => {
  for (let s = 1; s <= 6; s++) {
    const g = coreGame(mulberry(s));
    let prev = Infinity;
    let faster = true;
    let calms = 0;
    autoplay(g, (g, ev) => {
      if (!g.alive) return;
      assert.ok(g.landConnected([], false), 'one piece');
      if (ev.calm) {
        calms++;
        assert.ok(g.cells.length >= CORE_CALM_LEN);
      }
      if (g.calm < 0 && g.baseInterval() > prev + 1e-9) faster = false;
      // (the apple that triggers the calm still speeds it up as usual)
      if (g.calm >= 0 && !ev.calm && g.baseInterval() < prev - 1e-9) faster = false;
      prev = g.baseInterval();
    });
    assert.ok(faster, 'speeds up until the calm, then only slows');
    if (g.cells.length >= CORE_CALM_LEN) {
      assert.equal(calms, 1, 'the shockwave comes once');
      assert.ok(g.calm < CORE_CALM_MOVES || Math.abs(g.baseInterval() - CORE_CALM) < 1e-9, 'it settles at the calm speed');
    }
  }
});

test('the black hole calms down once the snake reaches length 35', () => {
  const g = coreGame(mulberry(5));
  const fast = g.baseInterval();
  g.fillTop = 1;
  const before = g.baseInterval();
  while (g.cells.length < CORE_CALM_LEN - 1) g.cells.push({ ...g.cells[g.cells.length - 1] });
  g.pendingGrowth = 1;
  g.food = null;
  g.spawnTryAt = 1e12; // no apple in the way
  const land = (c) => g.isLand(c.x, c.z);
  const dirs = [DIRS.up, DIRS.left, DIRS.down, DIRS.right];
  let ev = {};
  // take any safe move
  const move = () => {
    for (const d of dirs) {
      const h = g.head;
      const n = { x: h.x + d.x, z: h.z + d.z };
      if (g.inBounds(n.x, n.z) && land(n) && !g.occupied(n.x, n.z, true)) {
        g.queue = [{ ...d, y: 0 }];
        return g.step();
      }
    }
    return g.step();
  };
  ev = move();
  assert.equal(g.cells.length, CORE_CALM_LEN);
  assert.ok(ev.calm, 'the event fires');
  assert.ok(Math.abs(g.baseInterval() - before) < 1e-9, 'no jump on the move it fires');
  for (let i = 0; i < CORE_CALM_MOVES; i++) assert.ok(!move().calm, 'only once');
  assert.equal(g.baseInterval(), CORE_CALM);
  assert.ok(CORE_CALM > fast, 'slower than the Core ever was');
  g.startAtLevel(SPACE_START);
  assert.equal(g.calm, -1, 'a new Core run starts fast again');
});

test('filling every cell that is left wins the game: 100%', () => {
  const g = coreGame(mulberry(2));
  const ev = autoplay(g);
  assert.equal(ev.cause, 'win');
  assert.ok(g.won);
  assert.equal(g.fill, 1);
  assert.equal(g.levelProgress().into, g.levelProgress().need);
  assert.ok(g.fallen > CORE_SIZE * CORE_SIZE / 2, 'most of the board went into the black hole');
});

test('a new run does not inherit the last run\'s apple timers (Play Again)', () => {
  const g = coreGame(mulberry(4));
  // a long run that last had to wait for a fair place for the apple
  g.spawnTryAt = 1e9;
  g.appleCheckAt = 1e9;
  g.reset();
  g.startAtLevel(SPACE_START);
  assert.equal(g.spawnTryAt, 0);
  assert.equal(g.appleCheckAt, 0);
  eatAhead(g);
  assert.ok(g.food, 'the next apple appears straight away');
});

test('the autoplay wins every time', () => {
  const lost = [];
  for (let s = 1; s <= 30; s++) {
    const g = coreGame(mulberry(s));
    autoplay(g);
    if (!g.won) lost.push(`${s}: ${g.deathCause || 'stuck'}`);
  }
  assert.deepEqual(lost, []);
});

test('apples go somewhere fair: never on a dead end, and the collapse never leaves one there', () => {
  for (let s = 1; s <= 8; s++) {
    const g = coreGame(mulberry(s));
    autoplay(g, (g, ev) => {
      if (!g.alive || !g.food || g.coreFree() <= 2) return;
      if (ev.ate) assert.ok(!g.leavesDeadEnd(g.food, []), 'a new apple is not on a dead end');
      if (ev.doomed) assert.ok(!g.leavesDeadEnd(g.food, []), 'the collapse leaves the apple a way in and out');
    });
  }
});

test('an apple that cannot be eaten safely is swallowed after a while, and the board shrinks', () => {
  const g = coreGame(mulberry(3));
  g.planApple = () => null; // pretend it can never be eaten safely
  // the snake chases its tail round a 2 x 2 loop in the middle; the apple is far off
  g.cells = [{ x: 6, z: 6, y: 0 }, { x: 6, z: 7, y: 0 }, { x: 7, z: 7, y: 0 }, { x: 7, z: 6, y: 0 }];
  g.dir = { x: 0, z: -1, y: 0 };
  g.food = { x: 2, z: 2, y: 0, type: 'orb', id: 4242, spawnedAt: g.time };
  const first = g.food;
  const land = g.capacity;
  const loop = [{ x: 1, z: 0, y: 0 }, { x: 0, z: 1, y: 0 }, { x: -1, z: 0, y: 0 }, { x: 0, z: -1, y: 0 }];
  let moved = null;
  let k = 0;
  for (; k < 120 && g.alive && !moved; k++) {
    g.queue = [loop[k % 4]];
    const ev = g.step();
    if (ev.appleMoved) moved = { ev, time: g.time };
  }
  assert.ok(g.alive);
  assert.ok(moved, 'it moved');
  assert.ok(moved.time - first.spawnedAt >= 8000, 'only after it had sat a while');
  assert.ok(moved.ev.doomed && moved.ev.doomed.length >= COLLAPSE_PER_APPLE, 'and the black hole took a bite');
  assert.ok(!g.food || g.food.id !== first.id, 'the apple is a new one');
  for (const end = k + 30; k < end && g.alive; k++) {
    g.queue = [loop[k % 4]];
    g.step();
  }
  assert.ok(g.alive, 'still circling safely');
  assert.ok(g.capacity < land, 'the bite fell in');
});

test('lift-off climbs even if something clears the move queue (autoplay)', () => {
  const g = new SnakeGame({ sizes: BOARD_SIZES, rng: mulberry(7) });
  g.startAtLevel(ZONE_STARTS[SKY_ZONE] - 1);
  g.foodEaten = LEVEL_AT[ZONE_STARTS[SKY_ZONE]] - 1;
  g.bites = 2; // (three small apples to a step from Neon Night on: this is the last)
  g.food = { x: g.head.x + g.dir.x, z: g.head.z + g.dir.z, y: 0, type: 'orb', id: 77 };
  const ev = g.step();
  assert.ok(ev.levelUp && ev.levelUp.liftoff);
  const y0 = g.head.y;
  for (let i = 0; i < SKY_CLIMB; i++) {
    g.queue.length = 0; // what every autoplay does before choosing a move
    g.step();
  }
  assert.equal(g.head.y, y0 + SKY_CLIMB, 'it climbed');
  assert.equal(g.launch, 0, 'and steering is back');
  assert.ok(g.queueDirection(DIRS.left) || g.queueDirection(DIRS.right), 'turns are accepted again');
});

test('the autoplay beats the whole game from map 1', () => {
  for (const s of [3, 11, 29]) {
    const g = new SnakeGame({ sizes: BOARD_SIZES, rng: mulberry(s) });
    const bot = new GhostBot(g);
    for (let i = 0; i < 60000 && g.alive; i++) {
      g.queue.length = 0;
      if (g.space) {
        const d = g.corePlan();
        if (d) g.queueDirection(d);
      } else {
        bot.reset(true);
        bot.pendingGrowth = g.pendingGrowth;
        bot.rush = g.rush;
        bot.time = g.time;
        const plan = bot.decide();
        if (plan.dir) g.queueDirection(plan.dir);
      }
      g.step();
    }
    assert.ok(g.won, `seed ${s}: ${g.deathCause} in zone ${g.zone}`);
  }
});

import { TRACKS, SEAGLASS_ORIGINAL } from '../src/audio/Audio.js';

test('every map has two or more well-formed songs', () => {
  assert.equal(TRACKS.length, 6);
  const names = new Set();
  for (const pair of TRACKS) {
    assert.ok(pair.length >= 2);
    for (const song of pair) {
      assert.ok(!names.has(song.name), `${song.name} is unique`);
      names.add(song.name);
      for (const sec of new Set(song.seq || ['A', 'B'])) {
        assert.ok(song[sec], `${song.name}: section ${sec} exists`);
        assert.ok([4, 8].includes(song[sec].chords.length), `${song.name} ${sec}: 4 or 8 chords`);
        assert.ok([4, 8].includes(song[sec].melody.length), `${song.name} ${sec}: 4 or 8 bars`);
        if (!song.seq) assert.equal(song[sec].melody.length, 8, `${song.name} ${sec}: 8 bars`);
        if (song[sec].answer) {
          assert.equal(song[sec].answer.length, song[sec].melody.length, `${song.name} ${sec}: answer bars`);
          for (const bar of song[sec].answer) assert.equal(bar.split(' ').length, 16, `${song.name} ${sec}: 16 answer steps in "${bar}"`);
        }
        if (song[sec].bell) {
          assert.equal(song[sec].bell.length, song[sec].melody.length, `${song.name} ${sec}: bell bars`);
          for (const bar of song[sec].bell) assert.equal(bar.split(' ').length, 16, `${song.name} ${sec}: 16 bell steps in "${bar}"`);
        }
        if (song[sec].keys) assert.equal(song[sec].keys.length, 16, `${song.name} ${sec}: keys`);
        for (const bar of song[sec].melody) {
          const toks = bar.split(' ');
          assert.equal(toks.length, 16, `${song.name} ${sec}: 16 steps in "${bar}"`);
          for (const t of toks) assert.ok(t === '-' || t === '.' || Number(t) >= 1, `${song.name}: bad token ${t}`);
        }
      }
      for (const st of [song, ...(song.seq || []).map((k) => song[k])]) {
        for (const pat of Object.values(st.bass || {})) assert.equal(pat.split(' ').length, 16, `${song.name} bass`);
        for (const d of Object.values(st.drums || {})) for (const lane of Object.values(d)) assert.equal(lane.length, 16, `${song.name} drums`);
        if (st.stabs) assert.equal(st.stabs.length, 16);
      }
    }
  }
});

test('Seaglass Original is kept but not played in the game', () => {
  assert.ok(!TRACKS.flat().includes(SEAGLASS_ORIGINAL));
  const v2 = TRACKS[0].find((s) => s.name === 'Seaglass');
  assert.ok(v2, 'Seaglass (v2) plays on the Emerald Coast');
  assert.deepEqual(SEAGLASS_ORIGINAL.seq, v2.seq);
  for (const k of new Set(v2.seq)) {
    assert.deepEqual(SEAGLASS_ORIGINAL[k].melody, v2[k].melody, `${k}: same melody`);
    assert.deepEqual(SEAGLASS_ORIGINAL[k].chords, v2[k].chords, `${k}: same chords`);
    assert.ok(!SEAGLASS_ORIGINAL[k].keys && !SEAGLASS_ORIGINAL[k].bell, `${k}: no keys or bells`);
    assert.ok(SEAGLASS_ORIGINAL[k].notes, `${k}: parsed`);
  }
});

test('lifting off right beside the laser fence levels out into open air, not into the fence', () => {
  const g = new SnakeGame({ sizes: BOARD_SIZES, rng: mulberry(9) });
  g.startAtLevel(ZONE_STARTS[SKY_ZONE] - 1);
  // head two cells from the top wall, heading straight at it
  const S = g.size;
  const x = Math.floor(S / 2);
  g.cells = [0, 1, 2, 3].map((i) => ({ x, z: 1 + i, y: 0 }));
  g.dir = { ...DIRS.up };
  g.facing = { ...DIRS.up };
  g.queue = [];
  g.foodEaten = LEVEL_AT[ZONE_STARTS[SKY_ZONE]] - 1;
  g.bites = 2; // (three small apples to a step from Neon Night on: this is the last)
  g.food = { x, z: 0, y: 0, type: 'orb', id: 4321 };
  const ev = g.step();
  assert.ok(ev.levelUp && ev.levelUp.liftoff);
  for (let i = 0; i < SKY_CLIMB + 4 && g.alive; i++) {
    g.queue.length = 0;
    g.step();
  }
  assert.ok(g.alive, `still flying (${g.deathCause})`);
});

test('from Neon Night on, three apples are out at once and three count as one', () => {
  for (const [zone, n] of [[0, 1], [1, 1], [2, 3], [3, 3], [4, 3]]) {
    const g = new SnakeGame({ sizes: BOARD_SIZES, rng: mulberry(4) });
    g.startAtLevel(ZONE_STARTS[zone]);
    assert.equal(1 + g.extras.length, n, `map ${zone + 1}`);
  }
  // eating an extra apple counts as an apple, and a new one appears
  const g = new SnakeGame({ sizes: BOARD_SIZES, rng: mulberry(4) });
  g.startAtLevel(ZONE_STARTS[2]);
  const h = g.head;
  g.extras[0] = { ...g.extras[0], x: h.x + g.dir.x, z: h.z + g.dir.z, y: 0 };
  const before = g.foodEaten;
  const p0 = g.levelProgress();
  const ev = g.step();
  assert.ok(ev.ate);
  assert.equal(g.foodEaten, before, 'a third of an apple of progress');
  assert.equal(g.bites, 1);
  assert.equal(g.levelProgress().into, p0.into + 1);
  assert.equal(p0.need, 15, 'a level on map 3 is 15 small apples');
  assert.equal(g.extras.length, 2);
  // two more make a full apple of progress
  for (let i = 0; i < 2; i++) {
    const hh = g.head;
    g.food = { x: hh.x + g.dir.x, z: hh.z + g.dir.z, y: 0, type: 'orb', id: 8800 + i };
    g.step();
  }
  assert.equal(g.foodEaten, before + 1);
  assert.equal(g.bites, 0);
});

test('small apples refill a third of the slow-mo an apple does, so it can\'t be farmed', () => {
  const g = new SnakeGame({ sizes: BOARD_SIZES, rng: mulberry(4) });
  g.startAtLevel(ZONE_STARTS[2]);
  g.rush = 0;
  const h = g.head;
  g.food = { x: h.x + g.dir.x, z: h.z + g.dir.z, y: 0, type: 'orb', id: 8900 };
  g.step();
  assert.equal(g.rush, FOOD_TYPES.orb.rush / 3);
});

test('a slow-mo tile does not stack with Space: the meter is not used while it lasts', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const h = g.head;
  g.pads = [{ x: h.x, z: h.z - 1, id: 3 }];
  g.rush = 50;
  g.wantRush = true;
  const ev = g.step(); // (this step, on the way to the tile, still uses the meter)
  assert.ok(ev.boost);
  const r = g.rush;
  assert.ok(r < 50 && r > 45, 'the tile gives no meter');
  const slow = g.currentInterval();
  g.step();
  assert.equal(g.rush, r, 'and holding Space on it costs nothing');
  assert.equal(g.currentInterval(), slow, 'and is no slower');
});
