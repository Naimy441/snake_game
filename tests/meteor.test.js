import test from 'node:test';
import assert from 'node:assert/strict';
import { SnakeGame, DIRS, METEOR_SIZE, METEOR_TOTAL, METEOR_FIRST, METEOR_INTERVAL, METEOR_WARN_MS, METEOR_LIVES, METEOR_TIME_MS } from '../src/game/SnakeGame.js';

const meteorGame = (rng = () => 0.5) => {
  const g = new SnakeGame({ rng });
  g.enterMeteorLevel();
  return g;
};

// Put a landed meteor right in front of the head and step onto it.
const feed = (g) => {
  const h = g.head;
  g.meteors.push({ x: h.x + g.dir.x, z: h.z + g.dir.z, y: 0, id: 5000 + g.meteorsEaten, landAt: 0, landed: true, type: 'meteor' });
  return g.step();
};

test('the meteor storm: World 1\'s board, a 3 x 3 home in the middle, the first barrage already down', () => {
  const g = meteorGame();
  assert.equal(g.meteorLevel, true);
  assert.equal(g.size, METEOR_SIZE);
  assert.equal(g.food, null);
  const c = Math.floor(METEOR_SIZE / 2);
  assert.deepEqual(g.home, { x: c, z: c });
  assert.equal(g.meteors.length, METEOR_FIRST);
  assert.ok(g.meteors.every((m) => m.landed));
  assert.equal(g.lives, METEOR_LIVES);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) assert.ok(g.obstacleAt(c + dx, c + dz).home);
  // none on or next to home, none on the snake
  for (const m of g.meteors) {
    assert.ok(Math.max(Math.abs(m.x - c), Math.abs(m.z - c)) > 2);
    assert.ok(!g.occupied(m.x, m.z));
  }
  assert.equal(g.meteorsLeft, METEOR_TOTAL);
});

test('eating a meteor grows the snake by one and counts down', () => {
  const g = meteorGame();
  g.meteors = [];
  const ev = feed(g);
  assert.equal(ev.ate.type, 'meteor');
  assert.equal(ev.ate.left, METEOR_TOTAL - 1);
  g.step();
  assert.equal(g.cells.length, 6);
});

test('crashing into home ends the run', () => {
  const g = meteorGame();
  g.meteors = [];
  const c = Math.floor(METEOR_SIZE / 2);
  g.cells = [{ x: c, z: c + 2, y: 0 }, { x: c, z: c + 3, y: 0 }, { x: c, z: c + 4, y: 0 }];
  g.dir = { ...DIRS.up };
  const ev = g.step();
  assert.equal(ev.died, true);
  assert.equal(ev.cause, 'home');
});

test('new waves fall once the board is nearly clear, marked well ahead', () => {
  const g = meteorGame();
  g.meteors = [];
  const ev = g.step();
  assert.ok(ev.meteorWave);
  assert.ok(ev.meteorWave.meteors.length > 0);
  for (const m of ev.meteorWave.meteors) assert.ok(m.landAt - g.time >= METEOR_WARN_MS - 200);
  assert.ok(g.meteors.every((m) => !m.landed));
});

test('a meteor landing on the snake clangs off: gone, but it costs a life', () => {
  const g = meteorGame();
  const t = g.cells[2];
  g.meteors = [{ x: t.x, z: t.z, y: 0, id: 1, landAt: 0, landed: false, type: 'meteor' }];
  const ev = g.step();
  assert.equal(ev.meteorsSmashed.length, 1);
  assert.equal(g.meteorsEaten, 1);
  assert.equal(g.lives, METEOR_LIVES - 1);
  assert.equal(ev.died, false);
});

test('the third clang ends it', () => {
  const g = meteorGame();
  g.lives = 1;
  const t = g.cells[2];
  g.meteors = [{ x: t.x, z: t.z, y: 0, id: 1, landAt: 0, landed: false, type: 'meteor' }];
  const ev = g.step();
  assert.equal(ev.died, true);
  assert.equal(ev.cause, 'crushed');
});

test('when time runs out, it is all over', () => {
  const g = meteorGame();
  g.meteors = [];
  g.clock = METEOR_TIME_MS - 1;
  const ev = g.step();
  assert.equal(ev.died, true);
  assert.equal(ev.cause, 'doom');
  assert.equal(g.timeLeft, 0);
});

test('eating every meteor wins, and it speeds up along the way', () => {
  const g = meteorGame();
  assert.equal(g.baseInterval(), METEOR_INTERVAL[0]);
  g.meteorsEaten = METEOR_TOTAL - 1;
  g.meteorsSpawned = METEOR_TOTAL;
  assert.equal(g.baseInterval(), METEOR_INTERVAL[1]);
  g.meteors = [];
  const ev = feed(g);
  assert.equal(ev.won, true);
  assert.equal(ev.cause, 'win');
  assert.equal(g.won, true);
});
