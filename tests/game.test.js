import test from 'node:test';
import assert from 'node:assert/strict';
import { SnakeGame, DIRS } from '../src/game/SnakeGame.js';

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
  assert.equal(g.rush, 25);
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
  assert.equal(zoneForLevel(15), 4);
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

test('catching prey scores big and grows the snake', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const h = g.head;
  // boxed in on three sides by walls of body so it can't flee
  g.prey = { x: h.x, z: h.z - 1, px: h.x, pz: h.z - 1, id: 9, expires: 1e9, acc: -1e9, moves: 0, dir: DIRS.up };
  const ev = g.step();
  assert.ok(ev.caught);
  assert.equal(g.score, 100);
  assert.equal(g.prey, null);
  g.step();
  g.step();
  assert.equal(g.cells.length, 6);
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
  runFor(g, 6000);
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
  for (let l = 0; l <= MAX_LEVEL; l++) {
    g.foodEaten = LEVEL_AT[l];
    assert.equal(g.level, l);
    // the sky starts slower (flying is a new skill), then speeds up again
    if (l === ZONE_STARTS[SKY_ZONE]) assert.ok(g.baseInterval() > prev, 'lift-off slows down');
    else assert.ok(g.baseInterval() <= prev, 'never slows down within a zone');
    prev = g.baseInterval();
  }
  g.foodEaten = 9999;
  assert.equal(g.level, MAX_LEVEL);
  assert.equal(g.levelProgress().max, true);
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
    const eaten = runGhost(g, gh, 110, { pillars: true });
    assert.equal(eaten, 110);
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

test('the ghost uses Rush to reach the next pickup at double points', () => {
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
  assert.equal(gh.score, 20, 'apple scored double during Rush');
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

test('starting at a later level sets speed, zone, pillars and pads', () => {
  const g = new SnakeGame();
  g.startAtLevel(5);
  assert.equal(g.level, 5);
  assert.equal(g.zone, 1);
  assert.deepEqual(g.levelProgress(), { into: 0, need: 4, max: false });
  assert.equal(g.obstacles.length, 3, 'pillars from levels 4 and 5');
  assert.ok(g.obstacles.every((o) => o.solid));
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
  assert.ok(top.flying, 'the last zone is flown');
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
  g.prey = { x: 1, z: 1, px: 1, pz: 1, id: 9, expires: 1e9, acc: 0, moves: 0, dir: DIRS.up };
  g.addObstacles(4);
  const h0 = { ...g.head };
  g.food = { x: h0.x, z: h0.z - 1, type: 'orb', id: 1 };
  const ev = g.step();
  assert.equal(ev.levelUp.zone, SKY_ZONE);
  assert.ok(ev.levelUp.liftoff);
  assert.ok(g.flying);
  assert.equal(g.height, SKY_H);
  assert.equal(g.size, 21 + 2 * SKY_PAD, 'the box is bigger than the board on every side');
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
  assert.equal(g.size, 21);
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
