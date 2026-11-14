#!/usr/bin/env node
/**
 * Datos del terreno de Colombia para las zonas de riesgo y la cadena de Markov (docs/terrain-risk.md).
 *
 *   node scripts/build-terrain-co.mjs                       set SINTÉTICO (demo sin Earth Engine; la app dice "simulado")
 *   node scripts/build-terrain-co.mjs --from=terrain-co.csv export de Google Earth Engine (scripts/gee/terrain-co.js)
 *   node scripts/build-terrain-co.mjs --export-boundaries   escribe scripts/gee/out/co-mpio.geojson para subirlo a GEE
 *
 * Salidas:
 *   public/geo/terrain-co.json      índice (capa del mapa): área, dato válido, estado inicial/final e indicadores
 *   public/geo/terrain/<dpto>.json  detalle (drawer): matriz de cambios (16 fracciones) y serie anual por estado
 * Municipios y departamentos (el departamento es el promedio de sus municipios ponderado por área).
 * Las fracciones van en milésimas. El esquema que valida la app está en src/lib/api/terrain.ts.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (name) => args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i);
const PERIODS = {
  initial: { label: '2016–2018', years: [2016, 2018] },
  final: { label: '2023–2025', years: [2023, 2025] },
  years: YEARS,
  stepYears: 7,
};
const DATASETS = [
  'MODIS/061/MOD13Q1',
  'MODIS/061/MOD09A1',
  'MODIS/061/MCD12Q1',
  'NASA/SMAP/SPL4SMGP/008',
  'NASA/GPM_L3/IMERG_MONTHLY_V07',
  'NASA/GPM_L3/IMERG_V07',
  'MODIS/061/MOD16A2GF',
  'MODIS/061/MOD11A2',
  'NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI',
  'USGS/SRTMGL1_003',
];
const INDICATORS = ['smAnom', 'smWet', 'pAnom', 'pHeavy', 'mfi', 'etRatio', 'lstHot', 'lstAnom', 'gwTrend', 'slope', 'flat', 'ndviTrend'];
const DECIMALS = { etRatio: 2, ndviTrend: 3, lstAnom: 2, gwTrend: 2, toBare: 2 };
const H = 0; // sana
const S = 1; // con estrés
const B = 2; // suelo expuesto
const W = 3; // agua o encharcado

// ---------------------------------------------------------------- municipios (TopoJSON del DANE)

function decodeArcs(topo) {
  const t = topo.transform;
  if (!t) return topo.arcs;
  const [sx, sy] = t.scale;
  const [tx, ty] = t.translate;
  return topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
}

function stitch(arcs, refs) {
  const out = [];
  for (const ref of refs) {
    const arc = ref < 0 ? arcs[~ref].slice().reverse() : arcs[ref];
    for (let i = out.length ? 1 : 0; i < arc.length; i++) out.push(arc[i]);
  }
  return out;
}

/** Área de un anillo en km² (proyección equirectangular local; error < 1 % a esta escala). */
function ringKm2(ring) {
  let a = 0;
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
  const kx = 111.32 * Math.cos(lat0);
  const ky = 110.57;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
  return Math.abs(a / 2);
}

function loadMunicipios() {
  const topo = JSON.parse(readFileSync(join(root, 'public/geo/co-mpio.json'), 'utf8'));
  const arcs = decodeArcs(topo);
  return topo.objects.mpio.geometries
    .filter((g) => typeof g.properties?.c === 'string')
    .map((g) => {
      const p = g.properties;
      const polygons =
        g.type === 'Polygon' ? [g.arcs.map((r) => stitch(arcs, r))] : g.type === 'MultiPolygon' ? g.arcs.map((poly) => poly.map((r) => stitch(arcs, r))) : [];
      const area = polygons.reduce((s, poly) => s + ringKm2(poly[0]) - poly.slice(1).reduce((h, r) => h + ringKm2(r), 0), 0);
      return { c: p.c, d: p.d ?? p.c.slice(0, 2), n: p.n, dn: p.dn, x: p.x, y: p.y, polygons, area };
    });
}

// ---------------------------------------------------------------- export de límites para GEE

/**
 * CSV para "Assets → NEW → Table upload → CSV" del Code Editor (no acepta GeoJSON): una fila por municipio, con la
 * geometría como texto GeoJSON en la columna `geometry`. El código va como `c` (Earth Engine puede leerlo como número;
 * build-terrain-co.mjs --from lo vuelve a rellenar con ceros).
 */
function exportBoundaries(muni) {
  const outDir = join(root, 'scripts/gee/out');
  mkdirSync(outDir, { recursive: true });
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const round5 = (ring) => ring.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
  // RFC 7946: exterior antihorario y huecos horarios. El TopoJSON trae la convención de Shapefile (al revés), y
  // Earth Engine lee un exterior horario como "todo el planeta menos el municipio".
  const signed = (r) => r.reduce((a, [x, y], i) => a + (r[(i + r.length - 1) % r.length][0] * y - x * r[(i + r.length - 1) % r.length][1]), 0);
  const wind = (ring, ccw) => (signed(ring) > 0 === ccw ? ring : ring.slice().reverse());
  const rows = muni.map((m) => {
    const coordinates = m.polygons.map((poly) => poly.map((ring, k) => wind(round5(ring), k === 0)));
    const geometry = { type: 'MultiPolygon', coordinates };
    return [q(m.c), q(m.n), q(m.dn ?? ''), q(JSON.stringify(geometry))].join(',');
  });
  const file = join(outDir, 'co-mpio.csv');
  writeFileSync(file, ['c,n,dn,geometry', ...rows].join('\n') + '\n');
  console.log(`${muni.length} municipios → ${file}`);
  console.log('Súbelo en el Code Editor: Assets → NEW → Table upload → CSV file, con el nombre co-mpio.');
}

// ---------------------------------------------------------------- utilidades

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const milli = (v) => Math.round(clamp(v, 0, 1) * 1000);
function normalize(v) {
  const s = v.reduce((a, b) => a + Math.max(0, b), 0);
  return s > 0 ? v.map((x) => Math.max(0, x) / s) : v.map(() => 0.25);
}

/** PRNG determinista sembrado con un texto (FNV-1a + xorshift32). */
function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let x = h >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

/** De las 16 fracciones conjuntas (fila = estado inicial) a estado inicial, final y paso a suelo expuesto. */
function fromJoint(t) {
  const tt = normalize(t);
  const p0 = [0, 1, 2, 3].map((i) => tt.slice(i * 4, i * 4 + 4).reduce((a, b) => a + b, 0));
  const p1 = [0, 1, 2, 3].map((j) => tt[j] + tt[4 + j] + tt[8 + j] + tt[12 + j]);
  const toBare = (tt[H * 4 + B] + tt[S * 4 + B]) * 100;
  return { tt, p0, p1, toBare };
}

// ---------------------------------------------------------------- set sintético (demo)

const g = (lon, lat, [cx, cy, s, w]) => w * Math.exp(-((lon - cx) ** 2 + (lat - cy) ** 2) / (2 * s * s));
const fieldOf = (anchors) => (lon, lat) => clamp(anchors.reduce((a, k) => a + g(lon, lat, k), 0), 0, 1);

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Focos aproximados (lon, lat, radio en grados, peso). Patrones conocidos del país, no mediciones.
const drought = fieldOf([
  [-72.4, 11.6, 0.9, 1], // La Guajira
  [-73.6, 10.1, 0.8, 0.55], // Cesar y Magdalena
  [-74.8, 9.5, 0.9, 0.35], // sabanas del Caribe
  [-75.2, 3.3, 0.4, 0.45], // Tatacoa (Huila)
  [-72.9, 6.9, 0.4, 0.35], // cañón del Chicamocha
  [-69.5, 5.3, 1.6, 0.3], // altillanura
]);
const wet = fieldOf([
  [-76.9, 5.7, 0.8, 1], // Chocó
  [-74.6, 8.6, 0.6, 0.95], // La Mojana
  [-76.8, 7.7, 0.5, 0.7], // Urabá y bajo Atrato
  [-71.2, 6.2, 1.0, 0.7], // sabanas inundables de Arauca y Casanare
  [-78.3, 2.0, 0.6, 0.7], // Pacífico nariñense
  [-75.0, 10.4, 0.5, 0.4], // bajo Magdalena y canal del Dique
  [-70.0, -1.5, 2.0, 0.35], // ríos amazónicos
]);
const heat = fieldOf([
  [-74.6, 9.8, 1.6, 0.85], // Caribe
  [-72.4, 11.5, 0.8, 0.8], // La Guajira
  [-74.1, 7.0, 0.8, 0.55], // Magdalena medio
  [-70.8, 5.6, 1.8, 0.6], // Llanos
  [-75.2, 3.3, 0.4, 0.5], // Huila
  [-73.0, 8.3, 0.5, 0.4], // Catatumbo
]);
const deforest = fieldOf([
  [-74.8, 1.3, 0.7, 1], // Caquetá
  [-72.6, 2.2, 0.7, 0.95], // Guaviare
  [-73.9, 2.7, 0.6, 0.9], // sur del Meta (La Macarena)
  [-76.0, 0.7, 0.5, 0.6], // Putumayo
  [-72.9, 8.7, 0.4, 0.5], // Catatumbo
  [-75.9, 7.3, 0.4, 0.35], // bajo Cauca
]);
const cloudy = fieldOf([
  [-77.0, 5.0, 1.2, 0.9], // Pacífico
  [-71.0, -0.5, 2.5, 0.6], // Amazonía
]);
const RIDGES = [
  [[-77.6, 0.9], [-76.9, 3.5], [-76.2, 5.5], [-76.0, 7.0]], // cordillera Occidental
  [[-77.2, 1.3], [-76.0, 2.6], [-75.4, 4.5], [-75.4, 6.3], [-75.1, 7.4]], // Central
  [[-76.0, 1.5], [-74.5, 3.8], [-73.8, 5.3], [-72.7, 7.0], [-72.8, 9.5]], // Oriental
];
function andes(lon, lat) {
  let d = Infinity;
  for (const r of RIDGES) for (let i = 1; i < r.length; i++) d = Math.min(d, segDist(lon, lat, r[i - 1], r[i]));
  const sierra = Math.hypot(lon + 73.7, lat - 10.85); // Sierra Nevada de Santa Marta
  return clamp(Math.max(Math.exp(-(d * d) / (2 * 0.32 * 0.32)), Math.exp(-(sierra * sierra) / (2 * 0.3 * 0.3))), 0, 1);
}

function synthItem(m) {
  const r = seeded(`terrain:${m.c}`);
  const noise = (s) => (r() - 0.5) * 2 * s;
  const lon = m.x;
  const lat = m.y;
  const A = andes(lon, lat);
  const D = drought(lon, lat);
  const Wt = wet(lon, lat);
  const Ht = heat(lon, lat) * (1 - 0.7 * A);
  const F = deforest(lon, lat);
  const C = cloudy(lon, lat);

  const i = {
    smAnom: clamp(-26 * D + 3 * Wt + noise(4), -40, 25),
    smWet: clamp(4 + 44 * Wt + noise(4), 0, 85),
    pAnom: clamp(-28 * D + 4 * (1 - D) + noise(5), -45, 30),
    pHeavy: clamp(0.4 + 9 * Wt + 1.5 * A + noise(0.8), 0, 20),
    mfi: clamp(70 + 70 * Wt + 40 * A + noise(10), 30, 220),
    etRatio: clamp(0.86 - 0.5 * D + noise(0.05), 0.15, 1),
    lstHot: clamp(60 * Ht + noise(5), 0, 90),
    lstAnom: clamp(0.25 + 1.7 * Ht + 0.4 * D + noise(0.25), -0.5, 3),
    gwTrend: clamp(-1.6 * D - 0.4 * F + 0.3 * Wt + noise(0.15), -3, 2),
    slope: clamp(3 + 30 * A + noise(3), 0.5, 45),
    flat: clamp(75 - 85 * A + 10 * Wt + noise(6), 1, 95),
    ndviTrend: clamp(0.012 - 0.09 * F - 0.03 * D + noise(0.01), -0.15, 0.05),
  };

  // Estado inicial.
  const p0 = normalize([
    clamp(0.78 - 0.45 * D - 0.15 * Ht - 0.05 * A + 0.06 * F + noise(0.04), 0.08, 0.92),
    clamp(0.14 + 0.25 * D + 0.1 * Ht + noise(0.03), 0.03, 0.7),
    clamp(0.02 + 0.2 * D + 0.04 * A + noise(0.01), 0.003, 0.4),
    clamp(0.01 + 0.16 * Wt + noise(0.01), 0.002, 0.35),
  ]);
  // Matriz de cambios: persistencia alta, deriva hacia estrés y suelo expuesto donde hay deforestación o sequía.
  const jitter = () => 1 + noise(0.15);
  const off = [
    [null, (0.05 + 0.22 * F + 0.12 * D) * jitter(), (0.005 + 0.08 * F + 0.03 * D) * jitter(), (0.004 + 0.03 * Wt) * jitter()],
    [(0.12 - 0.06 * D - 0.05 * F) * jitter(), null, (0.03 + 0.12 * D + 0.08 * F) * jitter(), (0.01 + 0.04 * Wt) * jitter()],
    [0.03 * jitter(), (0.18 - 0.08 * D) * jitter(), null, (0.01 + 0.03 * Wt) * jitter()],
    [0.04 * jitter(), (0.08 + 0.08 * D) * jitter(), (0.02 + 0.04 * D) * jitter(), null],
  ];
  const P = off.map((row) => {
    const others = row.reduce((s, v) => s + (v ?? 0), 0);
    const stay = Math.max(0.4, 1 - others);
    return normalize(row.map((v) => (v == null ? stay : Math.max(0, v))));
  });
  const t = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) t.push(p0[a] * P[a][b]);
  const { p1, toBare } = fromJoint(t);

  // Serie anual: de p0 (centro 2017) a p1 (centro 2024), con los años de El Niño (2016, 2024) y La Niña (2021–2022).
  const y = YEARS.map((yr) => {
    const f = (yr - 2017) / 7;
    const base = p0.map((v, k) => v + (p1[k] - v) * f);
    const nino = yr === 2016 || yr === 2024 ? 0.06 * D + 0.02 : yr === 2019 || yr === 2020 ? 0.02 * D : 0;
    const nina = yr === 2021 || yr === 2022 ? 0.05 * Wt : 0;
    base[H] -= nino + nina * 0.6;
    base[S] += nino - nina * 0.4;
    base[W] += nina;
    return normalize(base.map((v) => Math.max(0.001, v + noise(0.008))));
  });

  return {
    a: m.area,
    v: clamp(0.88 - 0.35 * C + noise(0.04), 0.35, 0.98),
    t,
    y,
    i: { ...i, toBare },
  };
}

// ---------------------------------------------------------------- export de GEE (CSV)

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (q) {
      if (ch === '"' && line[k + 1] === '"') {
        cur += '"';
        k++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Une los CSV de GEE por código de municipio. `from` es una carpeta (lee todos los terrain-co*.csv) o una lista
 * separada por comas. El script de GEE exporta 4 tablas (markov, annual, climate, heavy); un CSV único también sirve.
 */
function readGeeCsvs(from) {
  const path = resolve(from);
  const files = from.includes(',')
    ? from.split(',').map((f) => resolve(f.trim()))
    : existsSync(path) && !path.endsWith('.csv')
      ? readdirSync(path)
          .filter((f) => /^terrain-co.*\.csv$/.test(f))
          .map((f) => join(path, f))
      : [path];
  if (!files.length) throw new Error(`No hay archivos terrain-co*.csv en ${from}`);
  const rows = new Map();
  const columns = new Set();
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    const head = parseCsvLine(lines[0]);
    head.forEach((h) => columns.add(h));
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line);
      const rec = Object.fromEntries(head.map((h, k) => [h, cells[k]]));
      const c = String(rec.c ?? '').trim().replace(/\.0+$/, '').padStart(5, '0');
      rows.set(c, { ...rows.get(c), ...rec });
    }
    console.log(`  ${file}: ${lines.length - 1} filas, ${head.length} columnas`);
  }
  return { rows, columns };
}

function fromGeeCsv(from, muni) {
  const { rows, columns } = readGeeCsvs(from);
  const required = ['c', 'areaKm2', 'valid', 't_0_0', 'y2016_0', ...INDICATORS];
  const missing = required.filter((n) => !columns.has(n));
  if (missing.length) throw new Error(`Faltan columnas en los CSV: ${missing.join(', ')}`);
  const byCode = new Map(muni.map((m) => [m.c, m]));
  const items = new Map();
  for (const [c, rec] of rows) {
    const num = (name) => {
      const v = rec[name];
      if (v === undefined || v === '' || v === 'null') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    if (!byCode.has(c)) continue;
    const t = [];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) t.push(num(`t_${a}_${b}`) ?? 0);
    if (t.reduce((s, v) => s + v, 0) <= 0) continue; // sin píxeles válidos: queda como "sin dato"
    const y = YEARS.map((yr) => normalize([0, 1, 2, 3].map((k) => num(`y${yr}_${k}`) ?? 0)));
    const i = Object.fromEntries(INDICATORS.map((n) => [n, num(n)]));
    const { toBare } = fromJoint(t);
    items.set(c, { a: num('areaKm2') ?? byCode.get(c).area, v: clamp(num('valid') ?? 0, 0, 1), t, y, i: { ...i, toBare } });
  }
  return items;
}

// ---------------------------------------------------------------- departamentos y salida

function aggregate(list) {
  const wsum = list.reduce((s, it) => s + it.a, 0) || 1;
  const avg = (get) => list.reduce((s, it) => s + get(it) * it.a, 0) / wsum;
  const i = {};
  for (const n of [...INDICATORS, 'toBare']) {
    const ok = list.filter((it) => it.i[n] != null);
    const w = ok.reduce((s, it) => s + it.a, 0);
    i[n] = w > 0 ? ok.reduce((s, it) => s + it.i[n] * it.a, 0) / w : null;
  }
  return {
    a: wsum,
    v: avg((it) => it.v),
    t: Array.from({ length: 16 }, (_, k) => avg((it) => normalize(it.t)[k])),
    y: YEARS.map((_, yi) => [0, 1, 2, 3].map((k) => avg((it) => it.y[yi][k]))),
    i,
  };
}

function indexItem(it) {
  const { p0, p1 } = fromJoint(it.t);
  return {
    a: round(it.a, 1),
    v: round(it.v, 2),
    p0: p0.map(milli),
    p1: p1.map(milli),
    i: Object.fromEntries(Object.entries(it.i).map(([k, v]) => [k, round(v, DECIMALS[k] ?? 1)])),
  };
}

function detailItem(it) {
  return { t: normalize(it.t).map(milli), y: it.y.map((row) => normalize(row).map(milli)) };
}

function write(items, source) {
  const byDpto = new Map();
  for (const [c, it] of items) {
    const d = c.slice(0, 2);
    if (!byDpto.has(d)) byDpto.set(d, []);
    byDpto.get(d).push([c, it]);
  }
  const all = new Map(items);
  for (const [d, list] of byDpto) all.set(d, aggregate(list.map(([, it]) => it)));

  const generatedAt = new Date().toISOString();
  const index = {
    version: 1,
    source,
    generatedAt,
    periods: PERIODS,
    datasets: DATASETS,
    items: Object.fromEntries([...all].sort(([a], [b]) => a.localeCompare(b)).map(([c, it]) => [c, indexItem(it)])),
  };
  const geo = value('out') ? resolve(value('out')) : join(root, 'public/geo');
  mkdirSync(geo, { recursive: true });
  const indexFile = join(geo, 'terrain-co.json');
  writeFileSync(indexFile, JSON.stringify(index));

  const detailDir = join(geo, 'terrain');
  if (existsSync(detailDir)) for (const f of readdirSync(detailDir)) if (f.endsWith('.json')) rmSync(join(detailDir, f));
  mkdirSync(detailDir, { recursive: true });
  let detailBytes = 0;
  for (const [d, list] of byDpto) {
    const detail = {
      version: 1,
      source,
      dpto: d,
      items: Object.fromEntries([[d, detailItem(all.get(d))], ...list.sort(([a], [b]) => a.localeCompare(b)).map(([c, it]) => [c, detailItem(it)])]),
    };
    const json = JSON.stringify(detail);
    detailBytes += gzipSync(json).length;
    writeFileSync(join(detailDir, `${d}.json`), json);
  }
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const indexJson = readFileSync(indexFile);
  console.log(`${source}: ${items.size} municipios, ${byDpto.size} departamentos`);
  console.log(`  ${indexFile}: ${kb(indexJson.length)} (${kb(gzipSync(indexJson).length)} gz)`);
  console.log(`  ${detailDir}/<dpto>.json: ${byDpto.size} archivos, ${kb(detailBytes)} gz en total`);
}

// ---------------------------------------------------------------- main

const muni = loadMunicipios();
if (has('export-boundaries')) {
  exportBoundaries(muni);
} else if (has('from')) {
  const file = value('from');
  if (!file) throw new Error('Uso: --from=<carpeta con los CSV de GEE, o lista separada por comas> [--out=<carpeta>]');
  const items = fromGeeCsv(file, muni);
  if (!items.size) throw new Error('El CSV no trajo municipios con datos válidos.');
  write(items, 'gee');
} else {
  write(new Map(muni.map((m) => [m.c, synthItem(m)])), 'synthetic');
}
