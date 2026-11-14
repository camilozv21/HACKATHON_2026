#!/usr/bin/env node
/**
 * Genera los límites de Colombia para el globo (departamentos y municipios con su código DIVIPOLA):
 *
 *   public/geo/co-dpto.json  33 departamentos (TopoJSON, objeto "dpto")
 *   public/geo/co-mpio.json  1.122 municipios (objeto "mpio") + líneas entre municipios de un mismo
 *                            departamento (objeto "lines"; los bordes de departamento los dibujan las teselas OSM)
 *
 * Propiedades: c = código DIVIPOLA (2 dígitos departamento, 5 municipio), d/dn = código y nombre del departamento
 * del municipio, n = nombre, x/y = punto interior para centrar la cámara y pedir los datos.
 *
 * Fuente: DANE, Marco Geoestadístico Nacional (MGN), publicado por OCHA en HDX (COD-AB Colombia, CC BY-IGO).
 * Simplificación Douglas-Peucker: 250 m en municipios (≈1,6 px a zoom 9, donde las teselas OSM toman el relevo)
 * y 500 m en departamentos (se encuadran a zoom ≤ 8,5).
 *
 * Uso: node scripts/build-admin-co.mjs
 * La primera vez descarga ~117 MB (queda en caché en el directorio temporal). Necesita `unzip` y `npx`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const SRC_URL =
  'https://data.humdata.org/dataset/50ea7fee-f9af-45a7-8a52-abb9c790a0b6/resource/32fba556-0109-4d1c-84cb-c8abddf7775b/download/col-administrative-divisions-shapefiles.zip';
const SHP = 'col_admbnda_adm2_mgn_20200416';
const MAPSHAPER = 'mapshaper@0.6.102';
const QUANTIZATION = '50000';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/geo');
const cache = join(tmpdir(), 'fieldshift-admin-co');
const zip = join(cache, 'col-admin.zip');
const shp = join(cache, `${SHP}.shp`);

mkdirSync(cache, { recursive: true });
mkdirSync(outDir, { recursive: true });

if (!existsSync(zip)) {
  console.log('Descargando el MGN (DANE) desde HDX…');
  const res = await fetch(SRC_URL);
  if (!res.ok) throw new Error(`HDX respondió ${res.status}`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
}
if (!existsSync(shp)) execFileSync('unzip', ['-o', '-q', zip, `${SHP}.*`, '-d', cache], { stdio: 'inherit' });

const mapshaper = (args) => execFileSync('npx', ['-y', MAPSHAPER, ...args], { stdio: 'inherit' });

// Municipios + líneas internas (un solo MultiLineString, comparte arcos con los polígonos).
// prettier-ignore
mapshaper([
  shp, 'name=mpio',
  '-simplify', 'dp', 'interval=250', 'keep-shapes',
  '-clean',
  '-each', 'c=ADM2_PCODE.slice(2), d=ADM1_PCODE.slice(2), n=ADM2_ES, dn=ADM1_ES',
  '-filter-fields', 'c,d,n,dn',
  '-lines', 'd', '+', 'name=lines',
  '-filter', 'TYPE == "inner"', 'target=lines',
  '-dissolve', 'target=lines',
  '-each', 'x=+this.innerX.toFixed(4), y=+this.innerY.toFixed(4)', 'target=mpio',
  '-o', join(outDir, 'co-mpio.json'), 'format=topojson', `quantization=${QUANTIZATION}`, 'target=mpio,lines',
]);

// Departamentos: se disuelven los municipios (mismos bordes que los municipios).
// prettier-ignore
mapshaper([
  shp, 'name=dpto',
  '-simplify', 'dp', 'interval=500', 'keep-shapes',
  '-clean',
  '-each', 'd=ADM1_PCODE.slice(2), dn=ADM1_ES',
  '-filter-fields', 'd,dn',
  '-dissolve', 'd', 'copy-fields=dn',
  '-each', 'c=d, n=dn, x=+this.innerX.toFixed(4), y=+this.innerY.toFixed(4)',
  '-filter-fields', 'c,n,x,y',
  '-o', join(outDir, 'co-dpto.json'), 'format=topojson', `quantization=${QUANTIZATION}`,
]);

for (const name of ['co-dpto.json', 'co-mpio.json']) {
  const buf = readFileSync(join(outDir, name));
  console.log(
    `${name}: ${(buf.length / 1024).toFixed(0)} KB · ${(gzipSync(buf, { level: 9 }).length / 1024).toFixed(0)} KB gz`,
  );
}
