/* eslint-disable */
/* global ee, print, Map, Export */
/**
 * Field Shift · Zonas de riesgo y cambios del terreno (cadena de Markov) por municipio de Colombia.
 * Script para el Code Editor de Google Earth Engine (https://code.earthengine.google.com). Método: docs/terrain-risk.md.
 *
 * Pasos:
 *  1. node scripts/build-terrain-co.mjs --export-boundaries   → scripts/gee/out/co-mpio.csv
 *  2. En el Code Editor: Assets → NEW → Table upload → CSV file, sube ese archivo con el nombre co-mpio (si tu proyecto es otro, cambia ASSET).
 *  3. Corre el script (Run). En la consola, la PRUEBA DE CONEXIÓN debe mostrar el id de SRTM y ~1.122 municipios.
 *  4. Pestaña Tasks → RUN en las 4 tareas terrain-co-*. Descarga los 4 CSV de Google Drive a una carpeta.
 *  5. node scripts/build-terrain-co.mjs --from=<carpeta con los 4 CSV>   → public/geo/terrain-co.json y terrain/<dpto>.json
 *
 * Datasets (ids verificados en el catálogo de GEE el 14-nov-2026):
 *  MODIS/061/MOD13Q1  NDVI 250 m, 16 días (estado del terreno, tendencia del verdor)
 *  MODIS/061/MOD09A1  reflectancia 500 m, 8 días → MNDWI (agua o encharcado); nubes en StateQA bits 0–1
 *  MODIS/061/MCD12Q1  cobertura: fuera ciudades (13) y nieve (15)
 *  NASA/SMAP/SPL4SMGP/008  humedad del suelo L4, 3 h, ~11 km (sm_rootzone, sm_surface_wetness)
 *  NASA/GPM_L3/IMERG_MONTHLY_V07  lluvia mensual (mm/h promedio; hasta 2025-09)
 *  NASA/GPM_L3/IMERG_V07  lluvia cada 30 min (mm/h) → días con más de 50 mm
 *  MODIS/061/MOD16A2GF  ET y PET 500 m, 8 días (escala 0,1)
 *  MODIS/061/MOD11A2  temperatura de superficie de día 1 km (K × 0,02)
 *  NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI  agua total almacenada, lwe_thickness cm (hasta 2024-09)
 *  USGS/SRTMGL1_003  elevación 30 m → pendiente
 */

// ================================================================ configuración
var ASSET = 'projects/imposing-kite-396719/assets/co-mpio'; // tabla subida desde scripts/gee/out/co-mpio.csv (propiedad c = código DIVIPOLA)
var SCALE = 500; // m, escala de la reducción por municipio
var TILE_SCALE = 16; // más alto = menos memoria por tesela (más lento); baja a 4 si sobra memoria
var INITIAL = [2016, 2018]; // estado inicial
var FINAL = [2023, 2025]; // estado final
var FIRST_YEAR = 2016;
var LAST_YEAR = 2025;
var BASE = ['2016-01-01', '2023-01-01']; // referencia para anomalías de SMAP y temperatura (2016–2022)
var RECENT = ['2023-01-01', '2026-01-01']; // periodo reciente (2023–2025)
var STATES = ['healthy', 'stressed', 'bare', 'water']; // 0, 1, 2, 3 (mismo orden que la app)
var NDVI_HEALTHY = 0.6;
var NDVI_BARE = 0.35;
var WATER_SHARE = 0.25; // parte de las semanas con MNDWI > 0 para contar como agua o encharcado

// ================================================================ 0. prueba de conexión
// Los límites vienen del DANE con los anillos en sentido horario (como un Shapefile). Earth Engine lee ese sentido
// como "todo el planeta menos el municipio", y falla con "Unable to transform geometry". Se reconstruye cada
// polígono plano con la regla par-impar, que no depende del sentido de los anillos.
// (Sin ee.Algorithms.If: evalúa las dos ramas. geometries() sirve igual para Polygon y MultiPolygon.)
var mpios = ee.FeatureCollection(ASSET).map(function (f) {
  var parts = f.geometry().geometries().map(function (p) {
    return ee.Geometry.Polygon(ee.Geometry(p).coordinates(), 'EPSG:4326', false, null, true);
  });
  return f.setGeometry(ee.Geometry.MultiPolygon(parts, 'EPSG:4326', false, null, true));
});
var srtm = ee.Image('USGS/SRTMGL1_003');
print('PRUEBA DE CONEXIÓN · Earth Engine responde. SRTM:', srtm.get('system:id'));
print('PRUEBA DE CONEXIÓN · Municipios en el asset (esperado ~1.122):', mpios.size());
var region = ee.Geometry.Rectangle([-81.8, -4.3, -66.8, 13.5]); // Colombia con San Andrés

// ================================================================ 1. estados del terreno
// Un año fijo de cobertura (2022). unmask(1): donde no hay dato de cobertura, el píxel se queda (no se borra todo).
var lc = ee.ImageCollection('MODIS/061/MCD12Q1').filterDate('2022-01-01', '2023-01-01').first().select('LC_Type1');
var landMask = lc.neq(13).and(lc.neq(15)).unmask(1);

var ndviCol = ee.ImageCollection('MODIS/061/MOD13Q1')
  .filterBounds(region)
  .map(function (img) {
    var ok = img.select('SummaryQA').lte(1); // 0 bueno, 1 marginal; fuera nieve y nubes
    return img.select('NDVI').multiply(0.0001).updateMask(ok).set('system:time_start', img.get('system:time_start'));
  });

var wetCol = ee.ImageCollection('MODIS/061/MOD09A1')
  .filterBounds(region)
  .map(function (img) {
    var clear = img.select('StateQA').bitwiseAnd(3).eq(0); // bits 0–1 = 0: despejado
    var green = img.select('sur_refl_b04').float();
    var swir = img.select('sur_refl_b06').float();
    var mndwi = green.subtract(swir).divide(green.add(swir));
    return mndwi.gt(0).rename('wet').updateMask(clear).set('system:time_start', img.get('system:time_start'));
  });

function range(y0, y1) {
  return [ee.Date.fromYMD(y0, 1, 1), ee.Date.fromYMD(y1 + 1, 1, 1)];
}

/** Estado de cada píxel en un periodo: 0 sana, 1 con estrés, 2 suelo expuesto, 3 agua o encharcado. */
function stateFor(y0, y1) {
  var r = range(y0, y1);
  var ndvi = ndviCol.filterDate(r[0], r[1]).median();
  var water = wetCol.filterDate(r[0], r[1]).mean().gte(WATER_SHARE).unmask(0);
  // Se construye desde el NDVI (no desde una imagen constante): hereda su máscara y su proyección.
  // NDVI < 0,35 → 2 (expuesto); 0,35–0,6 → 1 (con estrés); ≥ 0,6 → 0 (sana).
  return ndvi
    .gte(NDVI_BARE)
    .add(ndvi.gte(NDVI_HEALTHY))
    .multiply(-1)
    .add(2)
    .where(water, 3)
    .updateMask(landMask)
    .rename('state')
    .toByte();
}

var s0 = stateFor(INITIAL[0], INITIAL[1]);
var s1 = stateFor(FINAL[0], FINAL[1]);

// Diagnóstico rápido (zona pequeña del Eje Cafetero, 1 km): si sale 0, los estados quedaron vacíos.
var testBox = ee.Geometry.Rectangle([-75.8, 4.4, -75.5, 4.7]);
print(
  'DIAGNÓSTICO · parte con estado válido en la zona de prueba (esperado > 0,5):',
  s1.mask().reduceRegion({ reducer: ee.Reducer.mean(), geometry: testBox, scale: 1000 })
);
print(
  'DIAGNÓSTICO · reparto del estado final en la zona de prueba (0 sana, 1 estrés, 2 expuesto, 3 agua):',
  s1.reduceRegion({ reducer: ee.Reducer.frequencyHistogram(), geometry: testBox, scale: 1000 })
);

var markovBands = [];
var markovNames = [];
// Transiciones: fracción del área con estado i al inicio y j al final (la media de una banda 0/1 es una fracción).
for (var i = 0; i < 4; i++) {
  for (var j = 0; j < 4; j++) {
    markovBands.push(s0.eq(i).and(s1.eq(j)).rename('t_' + i + '_' + j));
    markovNames.push('t_' + i + '_' + j);
  }
}
// Parte del área con dato válido al inicio y al final (nubes, ciudades y nieve quedan fuera).
markovBands.push(s0.mask().and(s1.mask()).rename('valid'));
markovNames.push('valid');

// Estado de cada año, para ver la tendencia.
var annualBands = [];
var annualNames = [];
for (var y = FIRST_YEAR; y <= LAST_YEAR; y++) {
  var sy = stateFor(y, y);
  for (var k = 0; k < 4; k++) {
    annualBands.push(sy.eq(k).rename('y' + y + '_' + k));
    annualNames.push('y' + y + '_' + k);
  }
}

// ================================================================ 2. indicadores de riesgo
// SMAP L4 (un dato por día para que sea liviano).
var smap = ee.ImageCollection('NASA/SMAP/SPL4SMGP/008').filterBounds(region).filter(ee.Filter.calendarRange(0, 2, 'hour'));
var smBase = smap.filterDate(BASE[0], BASE[1]).select('sm_rootzone').mean();
var smRecent = smap.filterDate(RECENT[0], RECENT[1]).select('sm_rootzone').mean();
var smAnom = smRecent.divide(smBase).subtract(1).multiply(100).rename('smAnom');
var smWet = smap
  .filterDate(BASE[0], RECENT[1])
  .select('sm_surface_wetness')
  .map(function (img) {
    return img.gt(0.9);
  })
  .mean()
  .multiply(100)
  .rename('smWet');

// GPM IMERG mensual: mm/h promedio del mes → mm del mes. Anomalía y Fournier por mes del calendario.
var monthly = ee.ImageCollection('NASA/GPM_L3/IMERG_MONTHLY_V07')
  .select('precipitation')
  .map(function (img) {
    var d = ee.Date(img.get('system:time_start'));
    var hours = d.advance(1, 'month').difference(d, 'hour');
    // La aritmética borra las propiedades: sin system:time_start, filterDate dejaría la colección vacía.
    return img
      .multiply(hours)
      .rename('p')
      .set('system:time_start', img.get('system:time_start'))
      .set('month', d.get('month'));
  });
function climatology(d0, d1) {
  return ee.ImageCollection.fromImages(
    ee.List.sequence(1, 12).map(function (m) {
      return monthly.filterDate(d0, d1).filter(ee.Filter.eq('month', m)).mean().rename('p');
    })
  );
}
var climBase = climatology('2001-01-01', '2023-01-01');
var climRecent = climatology(RECENT[0], RECENT[1]); // el mensual llega hasta 2025-09
var pAnom = climRecent.sum().divide(climBase.sum()).subtract(1).multiply(100).rename('pAnom');
var mfi = climBase
  .map(function (img) {
    return img.pow(2);
  })
  .sum()
  .divide(climBase.sum())
  .rename('mfi');

// GPM IMERG cada 30 min → lluvia de cada día → días al año con más de 50 mm. Es la parte más pesada del script.
var imerg = ee.ImageCollection('NASA/GPM_L3/IMERG_V07').select('precipitation').filterBounds(region);
var day0 = ee.Date(FIRST_YEAR + '-01-01');
var nDays = ee.Date(LAST_YEAR + 1 + '-01-01').difference(day0, 'day');
var heavyDays = ee.ImageCollection.fromImages(
  ee.List.sequence(0, nDays.subtract(1)).map(function (n) {
    var d = day0.advance(n, 'day');
    return imerg.filterDate(d, d.advance(1, 'day')).sum().multiply(0.5).gt(50).rename('heavy');
  })
);
var pHeavy = heavyDays.sum().divide(LAST_YEAR - FIRST_YEAR + 1).rename('pHeavy');

// MODIS ET/PET reciente (sin los valores de relleno > 32700).
var etCol = ee.ImageCollection('MODIS/061/MOD16A2GF')
  .filterDate(RECENT[0], RECENT[1])
  .map(function (img) {
    var ok = img.select('ET').lt(32700).and(img.select('PET').lt(32700));
    return img.select(['ET', 'PET']).updateMask(ok);
  });
var etRatio = etCol.select('ET').sum().divide(etCol.select('PET').sum()).rename('etRatio');

// MODIS LST de día en °C.
var lst = ee.ImageCollection('MODIS/061/MOD11A2')
  .select('LST_Day_1km')
  .map(function (img) {
    return img.multiply(0.02).subtract(273.15).set('system:time_start', img.get('system:time_start'));
  });
var lstRecent = lst.filterDate(RECENT[0], RECENT[1]);
var lstHot = lstRecent
  .map(function (img) {
    return img.gt(35);
  })
  .mean()
  .multiply(100)
  .rename('lstHot');
var lstAnom = lstRecent.mean().subtract(lst.filterDate(BASE[0], BASE[1]).mean()).rename('lstAnom');

// GRACE/GRACE-FO: tendencia lineal del agua almacenada (cm/año). Mascons de ~300 km: tendencia regional.
var grace = ee.ImageCollection('NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI')
  .select('lwe_thickness')
  .filterDate(FIRST_YEAR + '-01-01', RECENT[1])
  .map(function (img) {
    var t = ee.Date(img.get('system:time_start')).difference(ee.Date(FIRST_YEAR + '-01-01'), 'year');
    return ee.Image.constant(t).float().rename('t').addBands(img.float());
  });
var gwTrend = grace.reduce(ee.Reducer.linearFit()).select('scale').rename('gwTrend');

// SRTM: pendiente en % y parte del área plana (< 2 %).
var slope = ee.Terrain.slope(srtm).multiply(Math.PI / 180).tan().multiply(100).rename('slope');
var flat = slope.lt(2).multiply(100).rename('flat');

// Tendencia del NDVI (pendiente de Sen sobre las medianas anuales), por década.
var annualNdvi = ee.ImageCollection.fromImages(
  ee.List.sequence(FIRST_YEAR, LAST_YEAR).map(function (yr) {
    var d = ee.Date.fromYMD(yr, 1, 1);
    return ee.Image.constant(yr).float().rename('year').addBands(ndviCol.filterDate(d, d.advance(1, 'year')).median().rename('ndvi'));
  })
);
var ndviTrend = annualNdvi.reduce(ee.Reducer.sensSlope()).select('slope').multiply(10).rename('ndviTrend');

var climate = [smAnom, smWet, pAnom, mfi, etRatio, lstHot, lstAnom, gwTrend, ndviTrend];
var climateNames = ['smAnom', 'smWet', 'pAnom', 'mfi', 'etRatio', 'lstHot', 'lstAnom', 'gwTrend', 'ndviTrend'];

// ================================================================ 3. vista previa en el mapa
Map.centerObject(region, 5);
Map.addLayer(s0, { min: 0, max: 3, palette: ['3fcf78', 'e8c25a', 'c98a5a', '7cc4ff'] }, 'Estado inicial 2016–2018', false);
Map.addLayer(s1, { min: 0, max: 3, palette: ['3fcf78', 'e8c25a', 'c98a5a', '7cc4ff'] }, 'Estado final 2023–2025');
Map.addLayer(mpios.style({ color: 'ffffff55', fillColor: '00000000', width: 0.5 }), {}, 'Municipios');

// ================================================================ 4. reducción por municipio y export
// Todo junto excede la memoria: se divide en 4 tareas. No se imprime una muestra (la consola tiene límites más bajos
// que las tareas). Corre las 4 en la pestaña Tasks y descarga los 4 CSV a una misma carpeta.
var withArea = mpios.map(function (f) {
  return f.set('areaKm2', f.geometry().area(100).divide(1e6));
});

function exportTable(name, image, scale, columns) {
  // forEachBand: la columna se llama como la banda (con una sola banda, mean() la llamaría "mean").
  var reducer = ee.Reducer.mean().forEachBand(image);
  var stats = image.reduceRegions({ collection: withArea, reducer: reducer, scale: scale, tileScale: TILE_SCALE });
  Export.table.toDrive({
    collection: stats,
    description: name,
    fileNamePrefix: name,
    fileFormat: 'CSV',
    selectors: ['c', 'areaKm2'].concat(columns),
  });
}

// Estado inicial → final (Markov), dato válido y relieve: 500 m.
exportTable('terrain-co-markov', ee.Image.cat(markovBands.concat([slope, flat])), SCALE, markovNames.concat(['slope', 'flat']));
// Estado de cada año (tendencia): 500 m.
exportTable('terrain-co-annual', ee.Image.cat(annualBands), SCALE, annualNames);
// Clima, agua y calor (SMAP ~11 km, GPM ~11 km, GRACE ~300 km, MODIS 0,5–1 km): 1 km basta.
exportTable('terrain-co-climate', ee.Image.cat(climate), 1000, climateNames);
// Días de lluvia fuerte (IMERG ~11 km, la parte más pesada): 5 km para que los municipios pequeños tengan dato.
exportTable('terrain-co-heavy', pHeavy, 5000, ['pHeavy']);

print('Listo. En la pestaña Tasks dale RUN a las 4 tareas terrain-co-* y descarga los 4 CSV de Google Drive.');
