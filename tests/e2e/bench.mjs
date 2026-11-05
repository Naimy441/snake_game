// Rough rendering benchmark. Serves dist/ (run `npm run build` first), emulates
// a Retina display (device pixel ratio 2), plays with an autopilot and reports
// frame time plus renderer stats. Headless Chromium renders on the CPU here,
// so absolute numbers are not real-GPU frame rates, but CPU rasterising cost
// tracks pixel-shading cost, which makes before/after comparisons meaningful.
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import fs from 'node:fs';

const quality = process.env.Q || 'high';
const camera = process.env.CAM || 'overhead';
const seconds = Number(process.env.SECS || 8);
const level = Number(process.env.LEVEL || 0); // 12 = Sunset Heavens (flight)
const server = await preview({ preview: { port: 4174, strictPort: true } });
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 2 });
await page.addInitScript(([q, cam, lvl]) => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('.settings.v1')) || 'coilrush.settings.v1';
  localStorage.setItem(key, JSON.stringify({ quality: q, camera: cam, music: 0, sfx: 0, fixedResolution: true, startLevel: lvl }));
  localStorage.setItem('coilrush.stats.v1', JSON.stringify({ maxLevel: lvl, maxZone: 0 }));
}, [quality, camera, level]);
await page.goto('http://localhost:4174/');
await page.waitForFunction(() => window.__coil && window.__coil.state === 'menu', null, { timeout: 60000 });
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__coil.state === 'playing', null, { timeout: 60000 });
const result = await page.evaluate(async (seconds) => {
  const a = window.__coil;
  const g = a.game;
  const pilot = setInterval(() => {
    if (!g.alive) return;
    const look = g.lookAhead(3);
    if (look.blocked && look.free < 3) {
      if (!g.turn(1)) if (!g.turn(-1)) if (!g.pitch(true)) g.pitch(false);
    }
  }, 16);
  await new Promise((r) => setTimeout(r, 1500));
  const times = [];
  let last = performance.now();
  const end = last + seconds * 1000;
  await new Promise((resolve) => {
    const tick = (now) => {
      times.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  clearInterval(pilot);
  times.sort((x, y) => x - y);
  const info = a.renderer.info;
  return {
    frames: times.length,
    avgMs: times.reduce((s, v) => s + v, 0) / times.length,
    p50Ms: times[Math.floor(times.length / 2)],
    p95Ms: times[Math.floor(times.length * 0.95)],
    calls: info.render.calls,
    triangles: info.render.triangles,
    programs: info.programs.length,
    pixelRatio: a.renderer.getPixelRatio(),
    canvas: `${a.renderer.domElement.width}x${a.renderer.domElement.height}`,
    quality: a.activeQuality,
    alive: g.alive,
  };
}, seconds);
console.log(JSON.stringify({ quality, camera, level, ...result }, null, 2));
await browser.close();
server.httpServer.close();
