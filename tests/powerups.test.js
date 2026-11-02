import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SnakeGame, DIRS, POWER_MIN_APPLES, POWER_LIFETIME_MS, POWER_POINTS, MAGNET_MS, CHILL_MS, CHILL_SLOW, LEVEL_AT, ZONE_STARTS,
} from '../src/game/SnakeGame.js';

const seq = (vals) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

function place(g, cells, dir) {
  g.cells = cells.map(([x, z]) => ({ x, z, y: 0 }));
  g.dir = { ...dir, y: 0 };
  g.facing = { ...dir, y: 0 };
  g.queue = [];
  g.removedTail = null;
}

test('power-ups turn up after a few apples, on free cells, and fade away', () => {
  const g = new SnakeGame({ rng: seq([0.05]) }); // every roll succeeds
  let seen = null;
  for (let i = 0; i < 8 && !seen; i++) {
    g.food = { x: g.head.x + g.dir.x, z: g.head.z + g.dir.z, type: 'orb', id: 100 + i };
    if (!g.inBounds(g.food.x, g.food.z)) break;
    const ev = g.step();
    if (ev.powerSpawned) seen = { ev, eaten: g.foodEaten };
  }
  assert.ok(seen, 'a power-up appeared');
  assert.ok(seen.eaten >= POWER_MIN_APPLES, 'not before a few apples');
  const p = g.power;
  assert.ok(['shield', 'magnet', 'chill'].includes(p.kind));
  assert.ok(!g.occupied(p.x, p.z) && !(g.food && g.food.x === p.x && g.food.z === p.z));
  assert.ok(g.takenSet().size > 0 && g.takenSet().has((p.x * 64 + p.z) * 16));
  g.time = p.expires + 1;
  place(g, [[10, 19], [11, 19], [12, 19], [13, 19]], DIRS.left);
  const ev = g.step();
  assert.ok(ev.powerExpired);
  assert.equal(g.power, null);
  assert.ok(POWER_LIFETIME_MS > 5000);
});

test('picking up a power-up scores and switches it on', () => {
  for (const kind of ['shield', 'magnet', 'chill']) {
    const g = new SnakeGame({ rng: seq([0.5]) });
    g.power = { x: g.head.x, z: g.head.z - 1, y: 0, type: 'power', kind, id: 7, expires: 1e9 };
    const ev = g.step();
    assert.equal(ev.power.kind, kind);
    assert.equal(g.power, null);
    assert.equal(g.score, POWER_POINTS);
    if (kind === 'shield') assert.equal(g.shield, 1);
    if (kind === 'magnet') assert.ok(g.magnetized && g.magnetUntil === g.time - g.currentInterval() + MAGNET_MS + g.currentInterval() - g.currentInterval() || g.magnetized);
    if (kind === 'chill') assert.ok(g.chilled);
  }
});

test('a shield turns a crash into a swerve towards open space, once', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  // heading up at the top wall, near the left edge: right has more room
  place(g, [[2, 0], [2, 1], [2, 2], [2, 3]], DIRS.up);
  g.food = { x: 15, z: 15, type: 'orb', id: 1 };
  g.shield = 1;
  const ev = g.step();
  assert.ok(g.alive, 'survived the wall');
  assert.ok(ev.shieldSaved);
  assert.equal(ev.shieldSaved.cause, 'wall');
  assert.deepEqual(g.dir, { x: 1, z: 0, y: 0 }, 'swerved towards the open side');
  assert.deepEqual({ x: g.head.x, z: g.head.z }, { x: 3, z: 0 });
  assert.equal(g.shield, 0, 'the shield is used up');
  assert.equal(g.stats.saves, 1);
  // no shield left: the next crash is real
  place(g, [[2, 0], [2, 1], [2, 2], [2, 3]], DIRS.up);
  const ev2 = g.step();
  assert.equal(g.alive, false);
  assert.equal(ev2.cause, 'wall');
});

test('a shield also saves you from your own body, but not from a dead end', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  // a U: the head at 5,5 heading right into its own body at 6,5
  place(g, [[5, 5], [5, 6], [6, 6], [7, 6], [7, 5], [6, 5], [6, 4]], DIRS.right);
  g.food = { x: 15, z: 15, type: 'orb', id: 1 };
  g.shield = 1;
  const ev = g.step();
  assert.ok(g.alive && ev.shieldSaved && ev.shieldSaved.cause === 'body');
  assert.ok(g.dir.z !== 0, 'turned up or down');
  // boxed in on every side: the shield can't help
  const b = new SnakeGame({ rng: seq([0.5]) });
  place(b, [[0, 0], [0, 1], [1, 1], [1, 0], [2, 0], [2, 1]], DIRS.up);
  b.food = { x: 15, z: 15, type: 'orb', id: 1 };
  b.shield = 1;
  const ev2 = b.step();
  assert.equal(b.alive, false);
  assert.ok(['wall', 'body'].includes(ev2.cause));
});

test('a shield swerves off a laser gate too', () => {
  const g = new SnakeGame({ rng: seq([0.3]) });
  g.startAtLevel(ZONE_STARTS[3]);
  const gt = g.gates[0];
  const cell = gt.cells[3];
  const back = gt.axis === 'x' ? (cell.z < 10 ? { x: 0, z: 1 } : { x: 0, z: -1 }) : (cell.x < 10 ? { x: 1, z: 0 } : { x: -1, z: 0 });
  const dir = { x: -back.x, z: -back.z };
  place(g, [1, 2, 3, 4].map((i) => [cell.x + back.x * i, cell.z + back.z * i]), dir);
  g.food = null;
  for (const o of g.obstacles) if (o.gate === gt.id) o.solid = true;
  gt.state = 'on';
  gt.next = g.time + 1e9;
  g.shield = 1;
  const ev = g.step();
  assert.ok(g.alive && ev.shieldSaved && ev.shieldSaved.cause === 'gate');
});

test('the magnet pulls the apple to the head', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  place(g, [[10, 15], [10, 16], [10, 17], [10, 18]], DIRS.up);
  g.food = { x: 14, z: 11, type: 'orb', id: 55 };
  g.magnetUntil = g.time + MAGNET_MS;
  let ate = false;
  for (let i = 0; i < 6 && !ate; i++) {
    const ev = g.step();
    if (ev.ate && ev.ate.id === 55) ate = true;
  }
  assert.ok(ate, 'the apple came to the snake');
  // out of range: it stays put
  const far = new SnakeGame({ rng: seq([0.5]) });
  place(far, [[10, 15], [10, 16], [10, 17], [10, 18]], DIRS.up);
  far.food = { x: 1, z: 1, type: 'orb', id: 56 };
  far.magnetUntil = far.time + MAGNET_MS;
  far.step();
  assert.deepEqual({ x: far.food.x, z: far.food.z }, { x: 1, z: 1 });
  // never onto the body or a wall
  const g2 = new SnakeGame({ rng: seq([0.5]) });
  place(g2, [[10, 10], [10, 11], [11, 11], [12, 11], [12, 10]], DIRS.up);
  g2.food = { x: 12, z: 9, type: 'orb', id: 57 };
  g2.magnetUntil = g2.time + MAGNET_MS;
  g2.step();
  assert.ok(!g2.occupied(g2.food.x, g2.food.z));
});

test('chill slows the snake for a while', () => {
  const g = new SnakeGame({ rng: seq([0.5]) });
  const normal = g.currentInterval();
  g.chillUntil = g.time + CHILL_MS;
  assert.ok(Math.abs(g.currentInterval() - normal * CHILL_SLOW) < 1e-9);
  g.time += CHILL_MS + 1;
  assert.equal(g.currentInterval(), normal);
  assert.equal(LEVEL_AT[0], 0);
});
