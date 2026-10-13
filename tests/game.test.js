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
