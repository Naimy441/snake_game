import test from 'node:test';
import assert from 'node:assert/strict';
import { SnakeGame, DIRS, BONUS_SIZE, BONUS_INTERVAL, BONUS_PARTY_AT } from '../src/game/SnakeGame.js';

const bonusGame = () => {
  const g = new SnakeGame({ rng: () => 0.5 });
  g.enterBonusLevel();
  return g;
};

// Walk the head straight onto the apple: put it right in front of the head.
const feed = (g) => {
  const h = g.head;
  g.food = { x: h.x + g.dir.x, z: h.z + g.dir.z, y: 0, type: 'orb', id: 999 + g.foodEaten, spawnedAt: g.time };
  return g.step();
};

test('the bonus level is a 17 x 17 board with a short snake and an apple straight ahead', () => {
  const g = bonusGame();
  assert.equal(g.bonusLevel, true);
  assert.equal(g.size, BONUS_SIZE);
  assert.equal(g.cells.length, 4);
  assert.equal(g.food.x, g.head.x);
  assert.ok(g.food.z < g.head.z);
});

test('every golden apple grows the snake by exactly one', () => {
  const g = bonusGame();
  for (let i = 1; i <= 4; i++) {
    const ev = feed(g);
    assert.ok(ev.ate);
    g.step();
    assert.equal(g.cells.length, 4 + i);
  }
});

test('the pace never changes, only Rush speeds it up', () => {
  const g = bonusGame();
  assert.equal(g.baseInterval(), BONUS_INTERVAL);
  for (let i = 0; i < 12; i++) {
    feed(g);
    if (i % 3 === 2) g.queueDirection(i % 2 ? DIRS.left : DIRS.right);
  }
  assert.equal(g.level, 0);
  assert.equal(g.baseInterval(), BONUS_INTERVAL);
  assert.ok(g.currentInterval(true) < g.currentInterval(false));
});

test('no prisms, chains, mice or boost pads ever appear', () => {
  const g = bonusGame();
  for (let i = 0; i < 30; i++) {
    if (!g.alive) break;
    const ev = feed(g);
    assert.ok(!ev.bonusSpawned && !ev.chainSpawned && !ev.preySpawned && !ev.padsSpawned);
    // keep clear of the walls by turning back and forth
    if (g.head.z < 3) g.queueDirection(g.head.x < BONUS_SIZE / 2 ? DIRS.right : DIRS.left);
    if (g.head.z < 3) g.step();
    if (g.head.z < 3) g.queueDirection(DIRS.down);
  }
  assert.equal(g.bonus, null);
  assert.equal(g.chain, null);
  assert.equal(g.prey, null);
  assert.equal(g.pads.length, 0);
});

test('progress counts apples to the party, then reports it', () => {
  const g = bonusGame();
  let p = g.levelProgress();
  assert.deepEqual([p.into, p.need, p.max, p.bonus], [0, BONUS_PARTY_AT, false, true]);
  g.foodEaten = BONUS_PARTY_AT;
  p = g.levelProgress();
  assert.equal(p.max, true);
});

test('the walls still kill', () => {
  const g = bonusGame();
  let ev;
  for (let i = 0; i < BONUS_SIZE + 2 && g.alive; i++) ev = g.step();
  assert.equal(g.alive, false);
  assert.equal(ev.cause, 'wall');
});

test('a fresh run after the bonus level is back to normal', () => {
  const g = bonusGame();
  g.reset();
  assert.equal(g.bonusLevel, false);
  assert.notEqual(g.baseInterval(), BONUS_INTERVAL);
});
