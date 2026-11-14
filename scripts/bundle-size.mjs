/**
 * Suma el JS inicial (gzip) que descarga la ruta principal: los <script src> del HTML.
 * MapLibre y el resto de chunks dinámicos no aparecen aquí porque se cargan después.
 *   node scripts/bundle-size.mjs [url]
 */
import { gzipSync } from 'node:zlib';

const url = process.argv[2] ?? 'http://localhost:3100/es';
const origin = new URL(url).origin;
const html = await (await fetch(url)).text();
// Se excluyen los <script nomodule> (polyfills): los navegadores modernos no los descargan.
const srcs = [...html.matchAll(/<script([^>]*)>/g)]
  .filter((m) => !/nomodule/i.test(m[1]))
  .map((m) => m[1].match(/src="([^"]+)"/)?.[1])
  .filter(Boolean);

let total = 0;
const rows = [];
for (const src of new Set(srcs)) {
  const body = Buffer.from(await (await fetch(new URL(src, origin))).arrayBuffer());
  const gz = gzipSync(body, { level: 9 }).length;
  total += gz;
  rows.push([src.split('/').pop(), (body.length / 1024).toFixed(1), (gz / 1024).toFixed(1)]);
}
rows.sort((a, b) => Number(b[2]) - Number(a[2]));
console.table(rows.map(([file, raw, gz]) => ({ file, rawKB: raw, gzipKB: gz })));
console.log(`Total JS inicial: ${(total / 1024).toFixed(1)} KB gzip en ${rows.length} archivos`);

// ¿Quedó maplibre en el JS inicial? (no debería)
const maplibreInInitial = await Promise.all(
  srcs.map(async (s) => (await (await fetch(new URL(s, origin))).text()).includes('maplibre-gl-worker')),
);
console.log(`MapLibre en el JS inicial: ${maplibreInInitial.some(Boolean) ? 'SÍ (revisar)' : 'no'}`);
