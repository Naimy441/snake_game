// End-to-end check: builds nothing, expects `npm run build` first. Serves
// dist/ with vite preview, drives the game in headless Chromium, and saves
// screenshots to test-results/.
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import fs from 'node:fs';

const out = 'test-results';
fs.mkdirSync(out, { recursive: true });
const server = await preview({ preview: { port: 4173, strictPort: true } });
const url = 'http://localhost:4173/';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const viewport = { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) };
const page = await browser.newPage({ viewport });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};
const state = () => page.evaluate(() => {
  const a = window.__coil;
  const g = a.game;
  return {
    state: a.state, alive: g.alive, score: g.score, len: g.cells.length, head: { ...g.head }, dir: { ...g.dir },
    mode: a.rig.mode, cameraMode: a.cameraMode, cam: a.camera.position.toArray(), headPos: a.snake.headPos.toArray(),
    fps: a.fps, quality: a.activeQuality,
  };
});
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const waitState = (s, timeout = 30000) => page.waitForFunction((s) => window.__coil.state === s, s, { timeout });

await page.goto(url);
await page.waitForFunction(() => window.__coil && window.__coil.state === 'menu');
console.log('info  menu fps', await page.evaluate(() => new Promise((r) => setTimeout(() => r(window.__coil.fps), 2500))), errors);
await page.waitForTimeout(1500);
await shot('01-menu');
check(await page.isVisible('#screen-start'), 'start screen visible');

// --- garage: free skins equip, locked ones only preview
await page.click('#btn-garage');
await page.waitForFunction(() => window.__coil.rig.mode === 'showcase');
check(await page.isVisible('#garage'), 'garage opens with the showcase camera');
await page.click('.gar-item[data-kind="skin"][data-id="tiger"]');
await page.click('.gar-item[data-kind="acc"][data-id="shades"]');
let gs = await page.evaluate(() => ({ skin: window.__coil.snake.skin.id, acc: window.__coil.snake.accessoryId, saved: window.__coil.settings.skin }));
check(gs.skin === 'tiger' && gs.acc === 'shades' && gs.saved === 'tiger', `free skin and accessory equip (${JSON.stringify(gs)})`);
await page.click('.gar-item[data-kind="skin"][data-id="neon"]');
gs = await page.evaluate(() => ({ skin: window.__coil.snake.skin.id, saved: window.__coil.settings.skin, lock: document.getElementById('gar-lock').textContent }));
check(gs.skin === 'neon' && gs.saved === 'tiger' && /Locked/.test(gs.lock), 'locked skin previews but does not equip');
await shot('01b-garage');
await page.keyboard.press('Escape');
await page.waitForFunction(() => !window.__coil.garageOpen);
gs = await page.evaluate(() => window.__coil.snake.skin.id);
check(gs === 'tiger', 'closing the garage restores the equipped skin');

// --- level select starts locked at level 1; toasts on the menu draw above the menu card
let ls = await page.evaluate(() => ({ name: document.getElementById('lvl-sel-name').textContent, prev: document.getElementById('lvl-prev').disabled, next: document.getElementById('lvl-next').disabled }));
check(ls.name === 'Level 1' && ls.prev && ls.next, `level select is locked on a fresh save (${JSON.stringify(ls)})`);
await page.keyboard.press('KeyM');
await page.waitForTimeout(400);
ls = await page.evaluate(() => {
  const t = document.getElementById('toast');
  const r = t.getBoundingClientRect();
  const c = document.querySelector('#screen-start .card').getBoundingClientRect();
  const overlap = !(r.bottom <= c.top || r.top >= c.bottom || r.right <= c.left || r.left >= c.right);
  return { z: getComputedStyle(t).zIndex, overlap, shown: t.classList.contains('show'), text: t.textContent };
});
check(ls.shown && Number(ls.z) >= 10 && !ls.overlap, `menu toast shows above the screens, clear of the menu card (${JSON.stringify(ls)})`);
await page.keyboard.press('KeyM');
await shot('01c-menu-toast');

// --- overhead gameplay; mashing keys during the countdown keeps at most one (the latest) turn
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__coil.state === 'countdown');
for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowRight']) await page.keyboard.press(k);
let q = await page.evaluate(() => ({ state: window.__coil.state, queue: window.__coil.game.queue.map((d) => d.x) }));
check(q.state !== 'countdown' || (q.queue.length === 1 && q.queue[0] === 1), `countdown mashing keeps only the latest turn (${JSON.stringify(q)})`);
await page.keyboard.press('ArrowUp'); // same as the heading: cancels the pre-aimed turn
q = await page.evaluate(() => ({ state: window.__coil.state, n: window.__coil.game.queue.length }));
check(q.state !== 'countdown' || q.n === 0, 'pressing the current heading during the countdown cancels the pre-aim');
await waitState('playing');
let s = await state();
check(s.mode === 'overhead', `overhead camera active (mode=${s.mode})`);
const h0 = s.head;
await page.waitForFunction((z) => window.__coil.game.head.z < z - 1, h0.z, { timeout: 8000 }).catch(() => {});
s = await state();
check(s.head.z < h0.z, `snake moves forward (z ${h0.z} -> ${s.head.z})`);
await page.keyboard.press('ArrowLeft');
await page.waitForFunction(() => window.__coil.game.dir.x === -1, null, { timeout: 5000 }).catch(() => {});
s = await state();
check(s.dir.x === -1, 'arrow key turns left in overhead (absolute)');
// put food right in front of the snake and check scoring + growth
await page.evaluate(() => {
  const g = window.__coil.game;
  g.food = { x: g.head.x + g.dir.x, z: g.head.z + g.dir.z, type: 'orb', id: 424242 };
  window.__coil.syncFood();
});
await page.waitForFunction(() => window.__coil.game.score >= 10, null, { timeout: 5000 }).catch(() => {});
s = await state();
check(s.score >= 10 && s.len === 5, `eating food scores and grows (score=${s.score}, len=${s.len})`);
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(250);
await shot('02-overhead');

// --- pause / resume
await page.keyboard.press('KeyP');
await waitState('paused');
const pausedHead = (await state()).head;
await page.waitForTimeout(500);
check(JSON.stringify((await state()).head) === JSON.stringify(pausedHead), 'pause freezes the snake');
check(await page.isVisible('#screen-pause'), 'pause screen visible');
await shot('03-paused');
await page.keyboard.press('KeyP');
await waitState('playing');

// --- C cycles overhead -> chase -> first person; the game state carries over
// (an autopilot keeps the snake off the walls while the slow software renderer takes screenshots)
// The autopilot decides right before every move (software rendering is slow,
// so several moves can happen between two frames).
const pilot = (on) => page.evaluate((on) => {
  const g = window.__coil.game;
  if (!g.__step) g.__step = g.step.bind(g);
  if (!on) {
    g.step = g.__step;
    return;
  }
  g.step = () => {
    const l = g.lookAhead(3);
    if (l.blocked && l.free < 2 && !g.queue.length) {
      // the side with the longer clear run (in the sky, climbing or diving too)
      const opts = [g.turnDir(1), g.turnDir(-1), g.pitchDir(true), g.pitchDir(false)].filter(Boolean);
      let best = null;
      for (const d of opts) {
        let n = 0;
        while (n < 12 && !g.fatalAt(g.head.x + d.x * (n + 1), g.head.z + d.z * (n + 1), (g.head.y || 0) + (d.y || 0) * (n + 1))) n++;
        if (!best || n > best.n) best = { d, n };
      }
      if (best) g.queueDirection(best.d);
    }
    return g.__step();
  };
}, on);
await pilot(true);
const before = await state();
await page.keyboard.press('KeyC');
await page.waitForFunction(() => window.__coil.rig.blend >= 1, null, { timeout: 10000 }).catch(() => {});
s = await state();
check(s.mode === 'tp' && s.alive, `switched to chase camera (mode=${s.mode})`);
const tpDist = Math.hypot(s.cam[0] - s.headPos[0], s.cam[2] - s.headPos[2]);
check(tpDist > 2 && tpDist < 8 && s.cam[1] > 1.5, `chase camera sits behind and above the head (dist=${tpDist.toFixed(2)}, y=${s.cam[1].toFixed(2)})`);
await shot('03b-chase');
await page.keyboard.press('KeyC');
await page.waitForFunction(() => window.__coil.rig.blend >= 1, null, { timeout: 10000 }).catch(() => {});
s = await state();
check(s.mode === 'fp' && s.alive, 'switched to first-person mid-game, still alive');
check(s.len >= before.len && s.score >= before.score, 'game state carried across camera switches');
const camDist = Math.hypot(s.cam[0] - s.headPos[0], s.cam[2] - s.headPos[2]);
check(camDist < 1.2 && s.cam[1] < 1.2, `first-person camera sits at the head (dist=${camDist.toFixed(2)}, y=${s.cam[1].toFixed(2)})`);
await pilot(false);
await page.evaluate(() => { const g = window.__coil.game; g.queue = []; });
s = await state();
const d0 = s.dir;
await page.keyboard.press('ArrowRight');
await page.waitForFunction((d) => window.__coil.game.dir.x !== d.x || window.__coil.game.dir.z !== d.z, d0, { timeout: 5000 }).catch(() => {});
s = await state();
check(s.dir.x === -d0.z + 0 && s.dir.z === d0.x + 0, 'right arrow turns right relative to heading in first-person');
// steer away from walls for a moment and take a screenshot
await page.evaluate(() => {
  const g = window.__coil.game;
  g.food = { x: g.head.x + g.dir.x * 3, z: g.head.z + g.dir.z * 3, type: 'orb', id: 777 };
  if (!g.inBounds(g.food.x, g.food.z)) g.food = { x: 10, z: 10, type: 'orb', id: 777 };
  window.__coil.syncFood();
});
await pilot(true);
await page.waitForTimeout(600);
await shot('04-first-person');
check(await page.isVisible('#minimap'), 'minimap visible in first-person');
check(await page.isVisible('#compass'), 'food compass visible in first-person');

// --- back to overhead (the autopilot keeps flying through the next sections)
await page.keyboard.press('KeyC');
await page.waitForFunction(() => window.__coil.rig.blend >= 1, null, { timeout: 10000 }).catch(() => {});
check((await state()).mode === 'overhead', 'switched back to overhead');

// --- new mechanics: obstacles, pads, chains and prey all appear and render without errors
await page.evaluate(() => {
  const g = window.__coil.game;
  g.addObstacles(3);
  g.obstacles.forEach((o) => (o.solidAt = 0));
  g.spawnPad();
  g.spawnChain();
  g.spawnPrey();
});
await page.waitForTimeout(1500);
s = await page.evaluate(() => { const g = window.__coil.game; return { obs: g.obstacles.filter((o) => o.solid).length, pads: g.pads.length, prey: !!g.prey, alive: g.alive }; });
check(s.obs > 0 || !s.alive, `pillars rise (${s.obs} solid)`);
await shot('04b-mechanics');
await page.evaluate(() => { const a = window.__coil; a.world.setZone(2, { instant: true }); });
await page.waitForTimeout(800);
await shot('04c-neon-zone');
check(await page.evaluate(() => window.__coil.world.zone === 2), 'world can switch zones');

// --- ghost guide: G toggles it; it races for the apple without touching the real board
await pilot(true);
await page.evaluate(() => { const g = window.__coil.game; if (!g.food) g.food = g.spawn('orb'); });
await page.keyboard.press('KeyG');
s = await page.evaluate(() => ({ on: window.__coil.settings.ghost, vis: window.__coil.ghostView.group.visible, row: !document.getElementById('hud-ghost-row').classList.contains('hidden') }));
check(s.on && s.row, `G turns the ghost guide on (${JSON.stringify(s)})`);
await page.waitForFunction(() => window.__coil.ghost.ticks > 0, null, { timeout: 30000 }).catch(() => {});
s = await page.evaluate(() => ({ moved: window.__coil.ghost.ticks > 0, vis: window.__coil.ghostView.group.visible, real: window.__coil.game.food != null }));
check(s.moved && s.vis && s.real, 'the ghost moves on the board without touching the real apple');
await shot('04d-ghost');
await page.keyboard.press('KeyG');
s = await page.evaluate(() => ({ on: window.__coil.settings.ghost }));
check(!s.on, 'G turns the ghost guide off again');
await pilot(false);

// --- crash into wall -> game over
await page.evaluate(() => {
  const g = window.__coil.game;
  g.food = null;
  g.bonus = null;
});
await waitState('over', 15000);
s = await state();
check(!s.alive, 'game ends on a crash');
check(await page.isVisible('#screen-over'), 'game over screen visible');
await shot('05-game-over');

// --- quick restart
await page.keyboard.press('Enter');
await waitState('playing');
s = await state();
check(s.alive && s.len === 4 && s.score === 0, 'Enter restarts a fresh run');

// --- start directly in first person and run a while for an FPS sample
await page.keyboard.press('KeyC');
await page.evaluate(() => {
  const g = window.__coil.game;
});
await pilot(true);
await page.waitForTimeout(3000);
await shot('06-first-person-run');
s = await state();
check(s.alive, 'survives a few seconds of first-person play with autopilot');
console.log(`info  fps in headless software rendering: ${s.fps?.toFixed(1)} (quality ${s.quality})`);
await pilot(false);

// --- settings panel + reduce motion
await page.keyboard.press('Escape');
await waitState('paused');
await page.click('#screen-pause [data-open="settings"]');
check(await page.isVisible('#panel-settings'), 'settings panel opens');
await page.click('#set-quality [data-v="low"]');
await page.check('#set-motion');
await shot('07-settings');
s = await state();
check(s.quality === 'low', 'quality can be changed');
await page.keyboard.press('Escape');
check(!(await page.isVisible('#panel-settings')), 'Esc closes the settings panel');

// --- level select: start at an unlocked level, then slow motion at a zone change
await page.evaluate(() => window.__coil.toMenu());
await waitState('menu');
await page.evaluate(() => { const a = window.__coil; a.stats.maxLevel = 5; a.renderLevelSelect(); });
for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
ls = await page.evaluate(() => document.getElementById('lvl-sel-name').textContent);
check(ls === 'Level 4', `arrow keys pick an unlocked starting level (${ls})`);
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
ls = await page.evaluate(() => document.getElementById('lvl-sel-name').textContent);
check(ls === 'Level 6', `cannot go past the highest unlocked level (${ls})`);
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('Enter');
await waitState('playing');
s = await page.evaluate(() => { const g = window.__coil.game; return { level: g.level, zone: g.zone, pillars: g.obstacles.length }; });
check(s.level === 3 && s.zone === 1, `run starts at the chosen level (${JSON.stringify(s)})`);
await pilot(true);
await page.evaluate(() => {
  const g = window.__coil.game;
  g.foodEaten = 20; // one apple before level 7 = Neon Night
  const nx = g.head.x + g.dir.x;
  const nz = g.head.z + g.dir.z;
  g.food = { x: nx, z: nz, type: 'orb', id: 9090 };
  if (!g.inBounds(nx, nz) || g.obstacleAt(nx, nz, false)) g.foodEaten = 20;
});
await page.waitForFunction(() => window.__coil.game.zone === 2, null, { timeout: 20000 }).catch(() => {});
await page.waitForFunction(() => (window.__coil.timeScale ?? 1) < 0.6, null, { timeout: 20000 }).catch(() => {});
s = await page.evaluate(() => ({ zone: window.__coil.game.zone, ts: window.__coil.timeScale }));
check(s.zone === 2 && s.ts < 0.6, `gameplay slows down while the zone card shows (timeScale ${s.ts?.toFixed(2)})`);
await shot('08-slowmo-zone');
await page.waitForFunction(() => (window.__coil.timeScale ?? 1) > 0.95 || window.__coil.state !== 'playing', null, { timeout: 30000 }).catch(() => {});
s = await page.evaluate(() => ({ ts: window.__coil.timeScale, state: window.__coil.state }));
check(s.ts > 0.95 || s.state !== 'playing', 'and returns to full speed afterwards');
await pilot(false);

// --- zone maps: a run in Neon Night starts with its city and portals
await page.evaluate(() => window.__coil.toMenu());
await waitState('menu');
await page.evaluate(() => { const a = window.__coil; a.stats.maxLevel = 8; a.settings.startLevel = 8; a.renderLevelSelect(); });
await page.keyboard.press('Enter');
await waitState('playing');
await pilot(true);
s = await page.evaluate(() => {
  const g = window.__coil.game;
  const walls = g.obstacles.filter((o) => o.kind === 'wall');
  return { zone: g.zone, walls: walls.length, solid: walls.filter((o) => o.solid || g.columnOccupied(o.x, o.z)).length, portals: g.portals.length, drawn: window.__coil.map.meshes[2].count };
});
check(s.zone === 2 && s.walls === 64 && s.solid === 64 && s.portals === 2, `a run in Neon Night starts with its whole city map (${JSON.stringify(s)})`);
await page.waitForTimeout(800);
s.drawn = await page.evaluate(() => window.__coil.map.meshes[2].count);
check(s.drawn === 64, `the city's towers are drawn (${s.drawn})`);
// steer into a portal and come out of its partner
s = await page.evaluate(() => {
  const a = window.__coil; const g = a.game; const p = g.portals[0];
  const e = p.a; const dx = e.x < 10 ? 1 : -1;
  g.cells = [1, 2, 3, 4].map((i) => ({ x: e.x + dx * i, z: e.z, y: 0 }));
  g.dir = { x: -dx, z: 0, y: 0 }; g.facing = { ...g.dir }; g.queue = []; g.warpTo = null; g.removedTail = null;
  g.food = { x: 10, z: 10, y: 0, type: 'orb', id: 31337 }; g.power = null; a.syncFood();
  return { exit: p.b };
});
await page.waitForFunction((exit) => window.__coil.game.cells.some((c) => c.x === exit.x && c.z === exit.z), s.exit, { timeout: 20000 }).catch(() => {});
s = await page.evaluate((exit) => ({ through: window.__coil.game.cells.some((c) => c.x === exit.x && c.z === exit.z), alive: window.__coil.game.alive }), s.exit);
check(s.through && s.alive, `diving into a portal brings the snake out of its partner (${JSON.stringify(s)})`);
await shot('11-neon-city');

// --- Data Core: laser gates switch on in turn
await page.evaluate(() => { const a = window.__coil; a.stats.maxLevel = 9; a.settings.startLevel = 9; a.startGame(); });
await waitState('playing');
await pilot(true);
s = await page.evaluate(() => ({ zone: window.__coil.game.zone, gates: window.__coil.game.gates.length }));
check(s.zone === 3 && s.gates === 2, `Cyber Overdrive brings two laser gates (${JSON.stringify(s)})`);
await page.waitForFunction(() => window.__coil.game.gates.some((g) => g.state === 'on') || !window.__coil.game.alive, null, { timeout: 60000 }).catch(() => {});
s = await page.evaluate(() => { const g = window.__coil.game; const on = g.gates.find((q) => q.state === 'on'); return { on: !!on, solid: on ? g.obstacles.filter((o) => o.gate === on.id).every((o) => o.solid) : false, alive: g.alive }; });
check(s.on && s.solid, `a laser gate switches on and blocks its cells (${JSON.stringify(s)})`);
await shot('12-data-core');

// --- power-ups: pick up a shield, then crash: the shield swerves instead
await pilot(false);
s = await page.evaluate(() => {
  const a = window.__coil; const g = a.game;
  g.gates.forEach((q) => { q.state = 'off'; q.next = g.time + 1e9; });
  g.obstacles.forEach((o) => { if (o.kind === 'gate') o.solid = false; });
  // up the clear lane along the left wall
  g.cells = [[1, 16], [1, 17], [1, 18], [1, 19]].map(([x, z]) => ({ x, z, y: 0 }));
  g.dir = { x: 0, z: -1, y: 0 }; g.facing = { ...g.dir }; g.queue = []; g.warpTo = null; g.removedTail = null;
  g.food = { x: 19, z: 19, y: 0, type: 'orb', id: 4242 };
  g.power = { x: 1, z: 15, y: 0, type: 'power', kind: 'shield', id: 4343, expires: g.time + 1e6 };
  a.syncFood();
  return g.alive;
});
await page.waitForFunction(() => (window.__coil.game.shield === 1 && document.getElementById('pw-shield')) || !window.__coil.game.alive, null, { timeout: 20000 }).catch(() => {});
s = await page.evaluate(() => ({ shield: window.__coil.game.shield, hud: !!document.getElementById('pw-shield') }));
check(s.shield === 1 && s.hud, `picking up a shield raises it, shown in the HUD (${JSON.stringify(s)})`);
await shot('13-shield');
// aim at the top wall, one cell away
await page.evaluate(() => {
  const g = window.__coil.game;
  g.cells = [[1, 0], [1, 1], [1, 2], [1, 3]].map(([x, z]) => ({ x, z, y: 0 }));
  g.dir = { x: 0, z: -1, y: 0 }; g.facing = { ...g.dir }; g.queue = []; g.removedTail = null;
});
await page.waitForFunction(() => window.__coil.game.stats.saves > 0 || !window.__coil.game.alive, null, { timeout: 20000 }).catch(() => {});
s = await page.evaluate(() => ({ saves: window.__coil.game.stats.saves, alive: window.__coil.game.alive, shield: window.__coil.game.shield }));
check(s.saves === 1 && s.alive && s.shield === 0, `the shield takes the crash and is used up (${JSON.stringify(s)})`);
await page.evaluate(() => window.__coil.pause());

// --- Sunset Heavens: lift off from Cyber Overdrive and fly in 3D
await page.evaluate(() => window.__coil.toMenu());
await waitState('menu');
await page.evaluate(() => { const a = window.__coil; a.stats.maxLevel = 11; a.settings.startLevel = 11; a.settings.reduceMotion = false; a.applyMotion(); a.renderLevelSelect(); });
ls = await page.evaluate(() => document.getElementById('lvl-sel-name').textContent);
check(ls === 'Level 12', `level select reaches the end of Cyber Overdrive (${ls})`);
await page.keyboard.press('Enter');
await waitState('playing');
await pilot(true);
await page.evaluate(() => {
  const g = window.__coil.game;
  g.foodEaten = 50; // one apple before level 13 = Sunset Heavens
  g.queue = [];
  let nx = g.head.x + g.dir.x;
  let nz = g.head.z + g.dir.z;
  g.food = { x: nx, z: nz, y: 0, type: 'orb', id: 9191 };
});
await page.waitForFunction(() => window.__coil.game.flying, null, { timeout: 20000 }).catch(() => {});
s = await page.evaluate(() => { const g = window.__coil.game; return { flying: g.flying, zone: g.zone, y: g.head.y, alive: g.alive }; });
check(s.flying && s.zone === 4, `eating into level 13 lifts off into Sunset Heavens (${JSON.stringify(s)})`);
// (the cinematic starts as the drawn head reaches the apple, a beat after the logic)
await page.waitForFunction(() => window.__coil.rig.cine || window.__coil.game.launch === 0, null, { timeout: 10000 }).catch(() => {});
s = await page.evaluate(() => { const a = window.__coil; const g = a.game; return { cine: !!a.rig.cine, launch: g.launch, obs: g.obstacles.length, size: g.size, h: g.height }; });
check(s.obs === 0 && s.size === 25 && s.h === 13, `the sky box is bigger and has no obstacles (${JSON.stringify(s)})`);
check(s.cine && s.launch > 0, `lift-off: the camera circles while the snake rockets up on its own (${JSON.stringify(s)})`);
await page.waitForFunction(() => window.__coil.game.launch === 0 && !window.__coil.rig.cine, null, { timeout: 30000 }).catch(() => {});
s = await page.evaluate(() => ({ launch: window.__coil.game.launch, cine: !!window.__coil.rig.cine, alive: window.__coil.game.alive, maxY: Math.max(...window.__coil.game.cells.map((c) => c.y)) }));
check(s.launch === 0 && !s.cine && s.alive && s.maxY >= 6, `then control and the normal camera come back (${JSON.stringify(s)})`);
await page.waitForFunction(() => window.__coil.world.skyAmount > 0.999 || !window.__coil.game.alive, null, { timeout: 30000 }).catch(() => {});
s = await page.evaluate(() => { const a = window.__coil; return { sky: a.world.skyAmount, island: a.world.island.group.visible, jet: !!a.snake.jetpack && a.snake.jetpack.visible, arena: a.world.skyArena.group.visible, alive: a.game.alive, unlocked: a.unlockedLevel() }; });
check(s.sky > 0.999 && !s.island && s.arena, `the island sinks away and the laser box appears (${JSON.stringify(s)})`);
check(s.jet || !s.alive, 'the snake wears a jetpack');
check(s.unlocked >= 12, 'reaching the sky unlocks it in the level select');
check(await page.isVisible('#alt') || !s.alive, 'altitude gauge shows while flying');
await shot('09-sunset-heavens');
await pilot(false);
s = await page.evaluate(() => {
  const g = window.__coil.game;
  g.queue = [];
  g.dir = { x: 0, z: -1, y: 0 };
  g.facing = { x: 0, z: -1, y: 0 };
  g.obstacles = [];
  g.cells = [9, 10, 11, 12, 13].map((z) => ({ x: 10, z, y: 4 }));
  return g.alive;
});
if (s) {
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => window.__coil.game.head.y > 4, null, { timeout: 5000 }).catch(() => {});
  s = await page.evaluate(() => ({ y: window.__coil.game.head.y, dir: window.__coil.game.dir }));
  check(s.y > 4 && s.dir.y === 1, `ArrowUp climbs (${JSON.stringify(s)})`);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => window.__coil.game.dir.y === 0, null, { timeout: 5000 }).catch(() => {});
  check(await page.evaluate(() => window.__coil.game.dir.y === 0), 'ArrowDown levels out again');
  await shot('10-flying');
}

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
server.httpServer.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
