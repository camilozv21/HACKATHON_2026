/**
 * Mide el globo en emulación de Pixel 7 con CPU 4x más lenta (CDP), como pide docs/performance.md.
 *   pnpm build && pnpm start --port 3100   (en otra terminal)
 *   node scripts/measure-perf.mjs [baseUrl] [--cpu=4]
 * Escenarios: rotación automática del globo, vuelo a una finca (z14) y reposo en la finca.
 */
import { chromium, devices } from '@playwright/test';

const baseUrl = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3100';
const cpu = Number(process.argv.find((a) => a.startsWith('--cpu='))?.split('=')[1] ?? 4);

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default'],
});
const context = await browser.newContext({ ...devices['Pixel 7'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

const t0 = Date.now();
await page.goto(`${baseUrl}/es?debug=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__fieldShiftMap?.loaded(), null, { timeout: 60_000 });
const timeToGlobe = Date.now() - t0;

const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/d';
});

// Rotación: forzamos zoom de globo completo y medimos mientras gira.
await page.evaluate(() => {
  const m = window.__fieldShiftMap;
  m.jumpTo({ center: [-40, 10], zoom: 1 });
});
await page.waitForTimeout(1500);
const rotation = await page.evaluate(async () => {
  const m = window.__fieldShiftMap;
  // Giro continuo equivalente a la rotación automática (independiente del temporizador de inactividad).
  let stop = false;
  const spin = () => {
    if (stop) return;
    const c = m.getCenter();
    c.lng -= 2.4;
    m.easeTo({ center: c, duration: 1000, easing: (n) => n });
    m.once('moveend', spin);
  };
  spin();
  const r = await window.__fieldShiftPerf.measureFps(5000);
  stop = true;
  m.stop();
  return r;
});

const fly = await page.evaluate(async () => {
  const m = window.__fieldShiftMap;
  const perf = window.__fieldShiftPerf;
  const before = performance.getEntriesByType('resource').length;
  m.flyTo({ center: [-75.68, 4.53], zoom: 14, duration: 4000, essential: true });
  const r = await perf.measureFps(4200);
  await new Promise((res) => m.once('idle', res));
  const tiles = performance
    .getEntriesByType('resource')
    .slice(before)
    .filter((e) => /gibs|arcgisonline|maptiler|openfreemap|elevation-tiles/.test(e.name)).length;
  return { ...r, tilesRequested: tiles };
});

const pan = await page.evaluate(async () => {
  const m = window.__fieldShiftMap;
  let i = 0;
  const id = setInterval(() => m.panBy([40 * (i++ % 2 ? -1 : 1), 25], { duration: 400 }), 450);
  const r = await window.__fieldShiftPerf.measureFps(4000);
  clearInterval(id);
  return r;
});

const memory = await page.evaluate(() => {
  const mem = performance.memory;
  return mem ? Math.round(mem.usedJSHeapSize / 1048576) : null;
});
const pixelRatio = await page.evaluate(() => window.__fieldShiftMap.getPixelRatio());

console.log(
  JSON.stringify(
    { baseUrl, cpuThrottle: cpu, device: 'Pixel 7', renderer, pixelRatio, timeToGlobeMs: timeToGlobe, rotation, fly, pan, heapMB: memory, errors },
    null,
    2,
  ),
);
await browser.close();
