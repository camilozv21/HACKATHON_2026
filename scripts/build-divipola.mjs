// Centroides de los municipios de Colombia (DIVIPOLA, DANE · datos.gov.co gdxc-w37w).
// UNGRD publica sus emergencias por municipio (código DIVIPOLA), sin coordenadas: las ubicamos en el centro del municipio.
// Uso: node scripts/build-divipola.mjs  → src/server/events/divipola.json
import { writeFileSync } from 'node:fs';

const url = 'https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=5000&$select=cod_dpto,dpto,cod_mpio,nom_mpio,longitud,latitud';
const res = await fetch(url);
if (!res.ok) throw new Error(`DIVIPOLA ${res.status}`);
const rows = await res.json();

const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);
const title = (s) =>
  s
    .toLowerCase()
    .split(/(\s+|-|\()/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
    .replace(/\bD\.c\./i, 'D.C.');

const out = {};
for (const r of rows) {
  const lat = Number(String(r.latitud).replace(',', '.'));
  const lon = Number(String(r.longitud).replace(',', '.'));
  if (!r.cod_mpio || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  out[r.cod_mpio.padStart(5, '0')] = [Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4, title(r.nom_mpio.trim()), title(r.dpto.trim())];
}
writeFileSync('src/server/events/divipola.json', JSON.stringify(out) + '\n');
console.log('municipios', Object.keys(out).length);
