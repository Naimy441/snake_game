import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SnakeGame, DIRS, LEVEL_AT, ZONE_STARTS, WALL_WARN_MS, WALL_STAGGER_MS, PORTAL_OPEN_MS, GATE_FIRST_MS, GATE_WARN_MS, GATE_ON_MS, GATE_OFF_MS,
  RISE_CLEARANCE, cellKey,
} from '../src/game/SnakeGame.js';
import { LAYOUTS, SYMMETRIES, layoutStages, layoutUpTo, transformCell } from '../src/game/maps.js';
import { GhostBot } from '../src/game/GhostBot.js';

const N = 21;
const seeded = (seed) => {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
};

// A game sitting at the start of `level`, as if it had just levelled up there.
function gameAt(level, rng = seeded(7)) {
  const g = new SnakeGame({ rng });
  g.startAtLevel(level);
  return g;
}

// Put the snake somewhere specific: head first, heading `dir`.
function place(g, cells, dir) {
  g.cells = cells.map(([x, z]) => ({ x, z, y: 0 }));
  g.dir = { ...dir, y: 0 };
  g.facing = { ...dir, y: 0 };
  g.queue = [];
  g.removedTail = null;
  g.warpTo = null;
}

test('every map is 21 x 21, connected, without dead ends, in every orientation and stage', () => {
  for (let zone = 0; zone < LAYOUTS.length; zone++) {
    const L = LAYOUTS[zone];
    assert.equal(L.grid.length, N, `${L.name} rows`);
    for (const row of L.grid) assert.equal(row.length, N, `${L.name} row width`);
    for (let sym = 0; sym < SYMMETRIES; sym++) {
      for (let stage = 0; stage < 3; stage++) {
        const lay = layoutUpTo(zone, stage, sym, N);
        const blocked = new Set();
        for (const w of lay.walls) blocked.add(w.x * N + w.z);
        // worst case: every laser gate switched on
        for (const gt of lay.gates) for (const c of gt.cells) blocked.add(c.x * N + c.z);
        const isFree = (x, z) => x >= 0 && z >= 0 && x < N && z < N && !blocked.has(x * N + z);
        let total = 0;
        let start = null;
        for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) if (isFree(x, z)) { total++; start ??= [x, z]; }
        const seen = new Set([start[0] * N + start[1]]);
        const stack = [start];
        while (stack.length) {
          const [x, z] = stack.pop();
          for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + d[0];
            const nz = z + d[1];
            if (isFree(nx, nz) && !seen.has(nx * N + nz)) {
              seen.add(nx * N + nz);
              stack.push([nx, nz]);
            }
            }
        }
        assert.equal(seen.size, total, `${L.name} sym ${sym} stage ${stage} is connected`);
        for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
          if (!isFree(x, z)) continue;
          const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter((d) => isFree(x + d[0], z + d[1])).length;
          assert.ok(open >= 2, `${L.name} sym ${sym} stage ${stage}: dead end at ${x},${z}`);
        }
        for (const p of lay.portals) assert.ok(p.a && p.b && (p.a.x !== p.b.x || p.a.z !== p.b.z), 'portals come in pairs');
        for (const gt of lay.gates) {
          // straight, contiguous, with a wall (an emitter) at each end
          const along = gt.axis === 'x' ? 'x' : 'z';
          gt.cells.forEach((c, i) => i && assert.equal(c[along] - gt.cells[i - 1][along], 1, 'gate cells are contiguous'));
          const first = gt.cells[0];
          const last = gt.cells[gt.cells.length - 1];
          const before = along === 'x' ? [first.x - 1, first.z] : [first.x, first.z - 1];
          const after = along === 'x' ? [last.x + 1, last.z] : [last.x, last.z + 1];
          assert.ok(!isFreeWall(lay, ...before) && !isFreeWall(lay, ...after), 'gates run between walls');
        }
      }
    }
  }
  function isFreeWall(lay, x, z) {
    return !lay.walls.some((w) => w.x === x && w.z === z);
  }
});

test('symmetries are the eight distinct transforms of the square', () => {
  const seen = new Set();
  for (let s = 0; s < SYMMETRIES; s++) {
    const pts = [[1, 2], [5, 0], [20, 7]].map(([x, z]) => transformCell(x, z, s, N)).map((c) => `${c.x},${c.z}`).join('|');
    seen.add(pts);
  }
  assert.equal(seen.size, SYMMETRIES);
  // stages only add things
  for (let z = 0; z < LAYOUTS.length; z++) {
    const st = layoutStages(z, 3, N);
    assert.equal(st.length, 3);
  }
});

test('the first level is open; hedges are telegraphed, then rise in a wave from the centre', () => {
  const g = new SnakeGame({ rng: seeded(3) });
  assert.equal(g.obstacles.length, 0);
  g.foodEaten = LEVEL_AT[1] - 1;
  g.food = { x: g.head.x, z: g.head.z - 1, type: 'orb', id: 9001 };
  const ev = g.step();
  assert.equal(g.level, 1);
  assert.ok(ev.layout && ev.layout.walls.length === 16, 'level 2 grows four hedge blocks');
  assert.ok(g.obstacles.every((o) => o.kind === 'wall' && !o.solid), 'walls start as warnings');
  // the further from the centre, the later a wall rises
  const c = (N - 1) / 2;
  for (const o of g.obstacles) {
    const d = Math.abs(o.x - c) + Math.abs(o.z - c);
    assert.ok(Math.abs(o.solidAt - (g.time + WALL_WARN_MS + d * WALL_STAGGER_MS)) < 1e-6 || o.solidAt <= g.time + WALL_WARN_MS + d * WALL_STAGGER_MS);
  }
  // nothing spawns on a warned cell
  const taken = g.takenSet(true);
  for (const o of g.obstacles) assert.ok(taken.has(cellKey(o.x, o.z)));
  // after the warning they are solid
  g.time += WALL_WARN_MS + 30 * WALL_STAGGER_MS;
  place(g, [[10, 19], [11, 19], [12, 19], [13, 19]], DIRS.left);
  g.step();
  assert.ok(g.obstacles.every((o) => o.solid), 'all hedges have risen');
});

test('walls never rise onto the snake or right in front of its head', () => {
  const g = new SnakeGame({ rng: seeded(4) });
  g.layoutSym[0] = 0;
  g.foodEaten = LEVEL_AT[1];
  g.buildLayout({});
  // hedge block at x 6..7, z 6..7: lie across one cell, aim the head at another
  place(g, [[6, 9], [6, 10], [6, 11], [6, 12]], DIRS.up);
  const [lying] = g.obstacles.filter((o) => o.x === 6 && o.z === 7);
  g.cells.push({ x: 7, z: 6, y: 0 }, { x: 7, z: 5, y: 0 });
  g.time = 1e6; // long past every warning
  g.step(); // head moves to 6,8: 6,7 is right in front, 7,6 is under the body
  const at = (x, z) => g.obstacles.find((o) => o.x === x && o.z === z);
  assert.equal(at(6, 7).solid, false, 'the cell right ahead stays open');
  assert.equal(lying.solid, false);
  assert.ok(g.obstacles.filter((o) => !g.columnOccupied(o.x, o.z) && !(o.x === 6 && o.z <= 7)).every((o) => o.solid), 'the rest rose');
  assert.ok(g.alive);
  g.queueDirection(DIRS.right);
  g.step();
  g.step();
  g.step();
  assert.equal(at(6, 7).solid, true, 'it rises once the head has turned away');
});

test('a new zone sinks the old map and starts its own; pickups move out of the way', () => {
  const g = gameAt(2, seeded(11));
  assert.equal(g.zone, 0);
  assert.ok(g.obstacles.length > 0);
  g.layoutSym[1] = 0;
  // park the apple and the prism on cells the canyon's first ridge will claim
  g.bonus = { x: 3, z: 5, y: 0, type: 'prism', id: 777, expires: g.time + 9000 };
  g.foodEaten = LEVEL_AT[3] - 1;
  place(g, [[10, 19], [11, 19], [12, 19], [13, 19]], DIRS.left);
  g.food = { x: 9, z: 19, type: 'orb', id: 778 };
  const ev = g.step();
  assert.equal(g.zone, 1);
  assert.ok(ev.layoutCleared, 'the hedges sink');
  assert.ok(g.obstacles.every((o) => o.zone === 1), 'only canyon structures remain');
  assert.equal(g.obstacles.filter((o) => o.kind === 'wall').length, 48);
  assert.ok(g.bonus && g.bonus.id !== 777 && !g.obstacleAt(g.bonus.x, g.bonus.z, false), 'the prism moved off the ridge');
  assert.ok(g.food && !g.obstacleAt(g.food.x, g.food.z, false));
});

test('starting inside a zone keeps the starting lane clear', () => {
  for (let seed = 1; seed < 30; seed++) {
    for (const level of [1, 2, 3, 5, 6, 8, 9, 11]) {
      const g = gameAt(level, seeded(seed));
      for (let z = g.head.z - 4; z <= 19; z++) {
        const o = g.obstacleAt(10, z, false);
        assert.ok(!o || o.kind === 'gate', `level ${level} seed ${seed}: wall at 10,${z}`);
      }
      assert.ok(g.alive);
    }
  }
});

// ---------------------------------------------------------------- portals
function portalGame() {
  const g = gameAt(ZONE_STARTS[2], seeded(5)); // Neon City
  // one known pair, already open
  g.portals = [{ id: 501, key: 'A', a: { x: 2, z: 2 }, b: { x: 18, z: 18 }, zone: 2, activeAt: 0 }];
  g.obstacles = [];
  g.food = { x: 0, z: 10, y: 0, type: 'orb', id: 1 };
  g.bonus = null;
  g.chain = null;
  g.pads = [];
  return g;
}

test('stepping onto a portal takes the head to its partner on the next move', () => {
  const g = portalGame();
  place(g, [[2, 4], [2, 5], [2, 6], [2, 7]], DIRS.up);
  g.step();
  let ev = g.step();
  assert.deepEqual({ x: g.head.x, z: g.head.z }, { x: 2, z: 2 });
  assert.ok(ev.portal, 'entered a portal');
  assert.deepEqual(g.warpTo, { x: 18, z: 18 });
  g.queueDirection(DIRS.left); // a turn pressed now waits until after the jump
  ev = g.step();
  assert.ok(ev.warped);
  assert.deepEqual({ x: g.head.x, z: g.head.z }, { x: 18, z: 18 });
  assert.deepEqual(g.dir, { x: 0, z: -1, y: 0 }, 'still heading the same way');
  assert.equal(g.cells[1].x, 2, 'the body follows through the entrance');
  g.step();
  assert.deepEqual({ x: g.head.x, z: g.head.z }, { x: 17, z: 18 }, 'the queued turn applies after the exit');
  // the jump is never redone by the late-turn grace
  const g2 = portalGame();
  place(g2, [[2, 3], [2, 4], [2, 5], [2, 6]], DIRS.up);
  g2.step();
  assert.equal(g2.canRegrace(), false, 'entering a portal is committed');
  g2.step();
  assert.equal(g2.canRegrace(), false, 'so is the jump');
});

test('a portal whose exit is blocked by your body is deadly', () => {
  const g = portalGame();
  g.pendingGrowth = 0;
  place(g, [[2, 3], [18, 18], [18, 19], [19, 19]], DIRS.up);
  g.cells.push({ x: 19, z: 18, y: 0 }, { x: 19, z: 17, y: 0 });
  g.step();
  const ev = g.step();
  assert.equal(ev.died, true);
  assert.equal(ev.cause, 'body');
});

test('portals open after a moment, and nothing spawns or hides on them', () => {
  const g = portalGame();
  g.portals[0].activeAt = g.time + PORTAL_OPEN_MS;
  assert.equal(g.portalExit(2, 2), null, 'still opening');
  g.time += PORTAL_OPEN_MS;
  assert.deepEqual(g.portalExit(2, 2), { x: 18, z: 18 });
  for (let i = 0; i < 300; i++) {
    const f = g.spawn('orb');
    assert.ok(!g.portalCell(f.x, f.z));
  }
  assert.equal(g.preyCanEnter(2, 2, null), false, 'mice stay off portals');
});

test('the look-ahead follows a portal through to the far side', () => {
  const g = portalGame();
  place(g, [[2, 5], [2, 6], [2, 7], [2, 8]], DIRS.up);
  const look = g.lookAhead(8);
  const cells = look.cells.map((c) => `${c.x},${c.z}`);
  assert.deepEqual(cells.slice(0, 5), ['2,4', '2,3', '2,2', '18,18', '18,17']);
  assert.equal(look.cells[3].warped, true);
});

// ---------------------------------------------------------------- gates
function gateGame() {
  const g = gameAt(ZONE_STARTS[3], seeded(9)); // Data Core
  return g;
}

test('laser gates cycle off, warn, on and off again', () => {
  const g = gateGame();
  assert.equal(g.gates.length, 2);
  const gt = g.gates[0];
  assert.equal(gt.state, 'off');
  assert.ok(g.obstacles.filter((o) => o.gate === gt.id).every((o) => !o.solid));
  // keep the snake well away from both gates, circling in the middle band
  const loop = () => {
    const l = g.lookAhead(2);
    if (l.blocked && l.free < 2) g.turn(1);
    g.step();
  };
  place(g, [[8, 8], [8, 9], [8, 10], [8, 11]], DIRS.up);
  const seen = [];
  const end = g.time + GATE_FIRST_MS + (GATE_ON_MS + GATE_OFF_MS) * 2;
  while (g.time < end && g.alive) {
    // pin the snake in place so it never reaches a gate
    place(g, [[8, 8], [8, 9], [8, 10], [8, 11]], DIRS.up);
    g.food = null;
    loop();
    if (seen[seen.length - 1] !== gt.state) seen.push(gt.state);
    const solid = g.obstacles.filter((o) => o.gate === gt.id).every((o) => o.solid);
    assert.equal(solid, gt.state === 'on');
  }
  assert.deepEqual(seen.slice(0, 4), ['off', 'warn', 'on', 'off']);
  assert.ok(GATE_WARN_MS > 0);
});

test('a gate never switches on with the snake on it or about to cross it, and kills when on', () => {
  const g = gateGame();
  const gt = g.gates[0];
  const cell = gt.cells[Math.floor(gt.cells.length / 2)];
  const toward = gt.axis === 'x' ? (cell.z < 10 ? DIRS.up : DIRS.down) : (cell.x < 10 ? DIRS.left : DIRS.right);
  const back = { x: -toward.x, z: -toward.z };
  // head two cells before the gate, heading into it
  const head = [cell.x + back.x * 2, cell.z + back.z * 2];
  place(g, [0, 1, 2, 3].map((i) => [head[0] + back.x * i, head[1] + back.z * i]), toward);
  g.food = null;
  gt.state = 'warn';
  gt.warnSince = g.time;
  gt.next = g.time;
  g.step();
  assert.notEqual(gt.state, 'on', 'stays off while the head is about to cross');
  // now from further away with the gate switching on: crossing kills
  const g2 = gateGame();
  const gt2 = g2.gates[0];
  const far = [cell.x + back.x * 4, cell.z + back.z * 4];
  place(g2, [0, 1, 2, 3].map((i) => [far[0] + back.x * i, far[1] + back.z * i]), toward);
  g2.food = null;
  gt2.state = 'warn';
  gt2.warnSince = g2.time;
  gt2.next = g2.time;
  g2.step();
  assert.equal(gt2.state, 'on');
  let ev;
  for (let i = 0; i < 8 && g2.alive; i++) {
    gt2.next = g2.time + 1e6; // hold it on
    ev = g2.step();
  }
  assert.equal(g2.alive, false);
  assert.equal(ev.cause, 'gate');
});

test('flying leaves every portal and gate behind', () => {
  const g = gateGame();
  g.foodEaten = LEVEL_AT[12] - 1;
  place(g, [[10, 14], [10, 15], [11, 15], [12, 15]], DIRS.up);
  g.food = { x: 10, z: 13, y: 0, type: 'orb', id: 4242 };
  const ev = g.step();
  assert.ok(ev.levelUp.liftoff);
  assert.equal(g.portals.length, 0);
  assert.equal(g.gates.length, 0);
  assert.equal(g.obstacles.length, 0);
  assert.equal(g.warpTo, null);
});

// ---------------------------------------------------------------- ghost
test('the ghost takes a portal when it is the shortest way to the apple', () => {
  const g = portalGame();
  place(g, [[2, 5], [2, 6], [2, 7], [2, 8]], DIRS.up);
  g.food = { x: 18, z: 14, y: 0, type: 'orb', id: 9 };
  const ghost = new GhostBot(g);
  ghost.reset(true);
  let warped = false;
  for (let i = 0; i < 12 && !ghost.ateFood; i++) {
    const ev = ghost.step();
    if (ev.warped) warped = true;
  }
  assert.ok(warped, 'it dived through the portal');
  assert.equal(ghost.ateFood, 9);
  assert.equal(ghost.respawns, 0);
});

test('the ghost plays every zone map for a long time without trapping itself', () => {
  for (const level of [2, 5, 8, 11]) {
    const g = gameAt(level, seeded(level * 13 + 1));
    for (const gt of g.gates) gt.next = Infinity; // gates hold still (the ghost avoids them anyway)
    const ghost = new GhostBot(g);
    ghost.reset(false);
    let eaten = 0;
    for (let i = 0; i < 1500; i++) {
      const ev = ghost.step();
      if (ev.ate === 'apple') {
        eaten++;
        // the player "eats" too: a new apple appears
        g.food = g.spawn('orb');
      }
    }
    assert.equal(ghost.respawns, 0, `level ${level}: never trapped`);
    assert.ok(eaten > 20, `level ${level}: keeps eating (${eaten})`);
  }
});

test('nothing ever rises within reach of the head while playing a zone map', () => {
  for (const level of [3, 6, 9]) {
    const g = new SnakeGame({ rng: seeded(level) });
    g.foodEaten = LEVEL_AT[level] - 1;
    g.food = { x: g.head.x, z: g.head.z - 1, type: 'orb', id: 31337 };
    g.step();
    // drive a simple bot: eat apples, avoid what is ahead
    for (let i = 0; i < 3000 && g.alive; i++) {
      const before = new Set(g.obstacles.filter((o) => o.solid).map((o) => o.id));
      const next = g.nextCells(RISE_CLEARANCE);
      const look = g.lookAhead(2);
      if (look.blocked && look.free < 2 && !g.queue.length) {
        if (!g.turn(1) || g.lookAhead(2).free < 1) g.turn(-1);
      }
      g.step();
      for (const o of g.obstacles) {
        if (!o.solid || before.has(o.id) || o.kind === 'gate') continue;
        assert.ok(!next.slice(0, 2).some((c) => c.x === o.x && c.z === o.z), 'rose right where the head was going');
      }
    }
  }
});
