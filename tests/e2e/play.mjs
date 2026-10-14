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

// --- overhead gameplay
await page.keyboard.press('Enter');
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
const pilot = (on) => page.evaluate((on) => {
  clearInterval(window.__camPilot);
  if (!on) return;
  const g = window.__coil.game;
  window.__camPilot = setInterval(() => { const l = g.lookAhead(3); if (l.blocked && l.free < 3 && !g.queue.length) { if (!g.turn(1)) g.turn(-1); } }, 15);
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

// --- back to overhead
await page.keyboard.press('KeyC');
await pilot(false);
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
  // keep it alive: steer in a big loop by turning right whenever a wall is near
  window.__autopilot = setInterval(() => {
    const look = g.lookAhead(2);
    if (look.blocked && look.free < 2) g.turn(1);
  }, 30);
});
await page.waitForTimeout(3000);
await shot('06-first-person-run');
s = await state();
check(s.alive, 'survives a few seconds of first-person play with autopilot');
console.log(`info  fps in headless software rendering: ${s.fps?.toFixed(1)} (quality ${s.quality})`);
await page.evaluate(() => clearInterval(window.__autopilot));

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

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
server.httpServer.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
