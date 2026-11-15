/**
 * Catálogo de campos de la API del terreno (/api/terrain). Cada campo se puede pedir (`fields=`), filtrar
 * (`campo=op.valor`) y ordenar (`sort=`). El catálogo se publica tal cual en GET /api/terrain.
 *
 * - `place`: un valor por municipio o departamento (indicadores, estados inicial/final, riesgo).
 * - `time`: un valor por lugar y año (serie anual observada y proyección de la cadena de Markov).
 *
 * Unidades siempre métricas. Las fracciones de área van de 0 a 1.
 */
import { HAZARDS, LAND_STATES, type Hazard, type LandState } from '@/features/terrain/kinds';

export type Value = number | string | null;
export type Row = Record<string, Value>;

export type FieldType = 'number' | 'integer' | 'string' | 'enum';
export type FieldScope = 'place' | 'time';
export type FieldGroup = 'identity' | 'location' | 'quality' | 'indicator' | 'state' | 'risk' | 'time';

export type FieldDef = {
  name: string;
  type: FieldType;
  scope: FieldScope;
  group: FieldGroup;
  unit?: string;
  values?: readonly string[];
  /** Misión o dataset de donde sale. */
  source?: string;
  es: string;
  en: string;
};

export const LEVELS = ['low', 'medium', 'high'] as const;
export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export const TRENDS = ['improving', 'worsening', 'stable'] as const;
export const KINDS = ['observed', 'projected'] as const;
export const PLACE_LEVELS = ['mpio', 'dpto'] as const;

const STATE_TEXT: Record<LandState, { es: string; en: string }> = {
  healthy: { es: 'vegetación sana (NDVI ≥ 0,6)', en: 'healthy vegetation (NDVI ≥ 0.6)' },
  stressed: { es: 'vegetación con estrés (0,35 ≤ NDVI < 0,6)', en: 'stressed vegetation (0.35 ≤ NDVI < 0.6)' },
  bare: { es: 'suelo expuesto (NDVI < 0,35)', en: 'bare soil (NDVI < 0.35)' },
  water: { es: 'agua o encharcado (MNDWI > 0)', en: 'water or waterlogged (MNDWI > 0)' },
};

const HAZARD_TEXT: Record<Hazard, { es: string; en: string }> = {
  drought: { es: 'sequía', en: 'drought' },
  water: { es: 'encharcamiento', en: 'waterlogging' },
  heat: { es: 'calor', en: 'heat' },
  soil: { es: 'suelo degradado', en: 'soil degradation' },
};

const IDENTITY: FieldDef[] = [
  {
    name: 'code',
    type: 'string',
    scope: 'place',
    group: 'identity',
    es: 'Código DIVIPOLA (DANE): 2 dígitos = departamento, 5 = municipio.',
    en: 'DIVIPOLA code (DANE): 2 digits = department, 5 = municipality.',
  },
  {
    name: 'level',
    type: 'enum',
    scope: 'place',
    group: 'identity',
    values: PLACE_LEVELS,
    es: 'Nivel: municipio (mpio) o departamento (dpto).',
    en: 'Level: municipality (mpio) or department (dpto).',
  },
  { name: 'name', type: 'string', scope: 'place', group: 'identity', es: 'Nombre oficial (DANE).', en: 'Official name (DANE).' },
  { name: 'dpto', type: 'string', scope: 'place', group: 'identity', es: 'Código del departamento.', en: 'Department code.' },
  { name: 'dptoName', type: 'string', scope: 'place', group: 'identity', es: 'Nombre del departamento.', en: 'Department name.' },
  {
    name: 'lat',
    type: 'number',
    scope: 'place',
    group: 'location',
    unit: '°',
    es: 'Latitud de un punto interior del área (siempre cae dentro del límite).',
    en: 'Latitude of an interior point (always inside the boundary).',
  },
  {
    name: 'lon',
    type: 'number',
    scope: 'place',
    group: 'location',
    unit: '°',
    es: 'Longitud de un punto interior del área.',
    en: 'Longitude of an interior point.',
  },
  {
    name: 'areaKm2',
    type: 'number',
    scope: 'place',
    group: 'location',
    unit: 'km²',
    es: 'Área del municipio o departamento.',
    en: 'Area of the municipality or department.',
  },
  {
    name: 'distanceKm',
    type: 'number',
    scope: 'place',
    group: 'location',
    unit: 'km',
    es: 'Distancia del punto de `near` al límite del lugar; 0 si el punto cae dentro (solo con `near`; si no, null).',
    en: 'Distance from the `near` point to the place boundary; 0 when the point is inside (only with `near`; otherwise null).',
  },
  {
    name: 'validShare',
    type: 'number',
    scope: 'place',
    group: 'quality',
    unit: '0–1',
    es: 'Parte del área que los satélites vieron bien (sin nubes, ciudades ni nieve).',
    en: 'Share of the area the satellites saw clearly (no clouds, cities or snow).',
  },
  {
    name: 'confidence',
    type: 'enum',
    scope: 'place',
    group: 'quality',
    values: CONFIDENCES,
    es: 'Confianza: alta con ≥ 80 % del área con dato válido, media con ≥ 50 %, baja con menos o con datos simulados.',
    en: 'Confidence: high with ≥ 80 % of the area valid, medium with ≥ 50 %, low otherwise or with simulated data.',
  },
];

const INDICATORS: FieldDef[] = (
  [
    ['smAnom', '%', 'NASA SMAP L4', 'Humedad del suelo en la zona de raíces, 2023–2025 frente a 2016–2022 (% de diferencia).', 'Root-zone soil moisture, 2023–2025 vs 2016–2022 (% difference).'],
    ['smWet', '%', 'NASA SMAP L4', 'Parte del tiempo con el suelo casi saturado (humedad de superficie > 0,9).', 'Share of time with near-saturated soil (surface wetness > 0.9).'],
    ['pAnom', '%', 'NASA GPM IMERG', 'Lluvia 2023–2025 frente a lo normal 2001–2022, por mes del calendario (% de diferencia).', 'Rainfall 2023–2025 vs 2001–2022 normal, by calendar month (% difference).'],
    ['pHeavy', 'días/año', 'NASA GPM IMERG', 'Días al año con más de 50 mm de lluvia.', 'Days per year with more than 50 mm of rain.'],
    ['mfi', 'mm', 'NASA GPM IMERG', 'Índice de Fournier modificado: lluvia que erosiona.', 'Modified Fournier index: erosive rainfall.'],
    ['etRatio', '0–1', 'MODIS MOD16A2GF', 'Evapotranspiración real / potencial, 2023–2025. Bajo = las plantas no consiguen el agua que piden.', 'Actual / potential evapotranspiration, 2023–2025. Low = plants do not get the water they demand.'],
    ['lstHot', '%', 'MODIS MOD11A2', 'Parte de las semanas con la superficie de día por encima de 35 °C, 2023–2025.', 'Share of weeks with daytime land surface above 35 °C, 2023–2025.'],
    ['lstAnom', '°C', 'MODIS MOD11A2', 'Temperatura de superficie 2023–2025 frente a 2016–2022 (subestimada por la deriva de MODIS Terra).', 'Land surface temperature 2023–2025 vs 2016–2022 (underestimated due to MODIS Terra orbit drift).'],
    ['gwTrend', 'cm/año', 'NASA GRACE/GRACE-FO', 'Tendencia del agua guardada en suelo y subsuelo (celda de ~300 km: tendencia regional).', 'Terrestrial water storage trend (~300 km cell: regional trend).'],
    ['slope', '%', 'NASA SRTM', 'Pendiente mediana.', 'Median slope.'],
    ['flat', '%', 'NASA SRTM', 'Parte del área baja y plana (pendiente < 2 %).', 'Share of low, flat land (slope < 2 %).'],
    ['ndviTrend', 'NDVI/década', 'MODIS MOD13Q1', 'Tendencia del NDVI anual (pendiente de Sen), por década.', 'Annual NDVI trend (Sen slope), per decade.'],
    ['toBare', '%', 'MODIS MOD13Q1 (Markov)', 'Parte del área que tenía plantas y pasó a suelo expuesto.', 'Share of the area that had plants and became bare soil.'],
  ] as const
).map(([name, unit, source, es, en]) => ({ name, type: 'number', scope: 'place', group: 'indicator', unit, source, es, en }));

const STATES: FieldDef[] = LAND_STATES.flatMap((s): FieldDef[] => [
  {
    name: `${s}Initial`,
    type: 'number',
    scope: 'place',
    group: 'state',
    unit: '0–1',
    source: 'MODIS',
    es: `Parte del área con ${STATE_TEXT[s].es}, mediana 2016–2018.`,
    en: `Share of the area with ${STATE_TEXT[s].en}, 2016–2018 median.`,
  },
  {
    name: `${s}Final`,
    type: 'number',
    scope: 'place',
    group: 'state',
    unit: '0–1',
    source: 'MODIS',
    es: `Parte del área con ${STATE_TEXT[s].es}, mediana 2023–2025.`,
    en: `Share of the area with ${STATE_TEXT[s].en}, 2023–2025 median.`,
  },
  {
    name: `${s}Change`,
    type: 'number',
    scope: 'place',
    group: 'state',
    unit: '−1–1',
    es: `Cambio de ${STATE_TEXT[s].es}: final − inicial.`,
    en: `Change in ${STATE_TEXT[s].en}: final − initial.`,
  },
]);

const RISK: FieldDef[] = [
  {
    name: 'riskScore',
    type: 'integer',
    scope: 'place',
    group: 'risk',
    unit: '0–100',
    es: 'Riesgo combinado: 0,6 × el peor + 0,4 × el promedio de los cuatro riesgos.',
    en: 'Combined risk: 0.6 × the worst + 0.4 × the mean of the four hazards.',
  },
  {
    name: 'riskLevel',
    type: 'enum',
    scope: 'place',
    group: 'risk',
    values: LEVELS,
    es: 'Nivel del riesgo combinado: bajo < 34 ≤ medio < 67 ≤ alto.',
    en: 'Combined risk level: low < 34 ≤ medium < 67 ≤ high.',
  },
  {
    name: 'riskTop',
    type: 'enum',
    scope: 'place',
    group: 'risk',
    values: HAZARDS,
    es: 'El riesgo que más pesa.',
    en: 'The hazard that weighs the most.',
  },
  ...HAZARDS.flatMap((h): FieldDef[] => [
    {
      name: `${h}Risk`,
      type: 'integer',
      scope: 'place',
      group: 'risk',
      unit: '0–100',
      es: `Puntaje de riesgo de ${HAZARD_TEXT[h].es} (null si falta más de la mitad del peso).`,
      en: `${HAZARD_TEXT[h].en} risk score (null when over half of the weight is missing).`,
    },
    {
      name: `${h}Level`,
      type: 'enum',
      scope: 'place',
      group: 'risk',
      values: LEVELS,
      es: `Nivel de riesgo de ${HAZARD_TEXT[h].es}.`,
      en: `${HAZARD_TEXT[h].en} risk level.`,
    },
  ]),
  {
    name: 'trend',
    type: 'enum',
    scope: 'place',
    group: 'state',
    values: TRENDS,
    es: 'Tendencia del terreno: mejora si (sana − expuesto) sube más de 3 puntos, empeora si baja más de 3, estable si no.',
    en: 'Land trend: improving if (healthy − bare) rises over 3 points, worsening if it drops over 3, otherwise stable.',
  },
];

const TIME: FieldDef[] = [
  {
    name: 'year',
    type: 'integer',
    scope: 'time',
    group: 'time',
    es: 'Año: observado (serie anual) o proyectado por la cadena de Markov.',
    en: 'Year: observed (annual series) or projected by the Markov chain.',
  },
  {
    name: 'kind',
    type: 'enum',
    scope: 'time',
    group: 'time',
    values: KINDS,
    es: 'observed = medido por satélite; projected = supone que los cambios siguen igual.',
    en: 'observed = measured by satellite; projected = assumes changes keep the same pace.',
  },
  ...LAND_STATES.map(
    (s): FieldDef => ({
      name: s,
      type: 'number',
      scope: 'time',
      group: 'time',
      unit: '0–1',
      source: 'MODIS',
      es: `Parte del área con ${STATE_TEXT[s].es} ese año.`,
      en: `Share of the area with ${STATE_TEXT[s].en} that year.`,
    }),
  ),
];

export const FIELDS: readonly FieldDef[] = [...IDENTITY, ...INDICATORS, ...STATES, ...RISK, ...TIME];
export const FIELD_MAP: ReadonlyMap<string, FieldDef> = new Map(FIELDS.map((f) => [f.name, f]));

export const PLACE_FIELDS = FIELDS.filter((f) => f.scope === 'place').map((f) => f.name);
export const TIME_FIELDS = FIELDS.filter((f) => f.scope === 'time').map((f) => f.name);
