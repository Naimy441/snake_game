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
  assert.deepEqual(g.head, { x: h.x, z: h.z - 1 });
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
  zoneForLevel, OBSTACLE_WARN_MS, BOOST_TICKS, CHAIN_BONUS_PER_LINK, PREY_LIFETIME_MS, MAX_OBSTACLES,
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
  assert.equal(zoneForLevel(12), 3);
});

test('levelling up reports the level and zone change', () => {
  const g = new SnakeGame({ rng: seq([0.9]) });
  g.foodEaten = 11; // next orb -> level 3 = zone 1
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
  assert.deepEqual(g.head, { x: h0.x - 1, z: h0.z });
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
