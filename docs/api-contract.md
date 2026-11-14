# Contrato de API: frontend ↔ backend

La fuente de verdad son los esquemas zod de [`src/lib/api/contract.ts`](../src/lib/api/contract.ts). El frontend
valida cada respuesta: si un campo falta o tiene otro tipo, la UI muestra un error amable en vez de datos rotos.

- **Base URL:** `NEXT_PUBLIC_API_BASE_URL` (por ejemplo `https://api.fieldshift.app`).
- **Mocks:** con `NEXT_PUBLIC_USE_MOCKS=true` el frontend llama a `/api/mock/*` (route handlers de Next) con
  **este mismo contrato** y 800 ms de latencia simulada. El código está en `src/mocks/`.
- **Formato:** JSON UTF-8, fechas ISO 8601, coordenadas en orden GeoJSON `[lon, lat]`.
- **Idioma:** el cliente envía `locale` (`"es"` | `"en"`); los textos de la respuesta (razones, riesgos…) deben
  venir en ese idioma.
- **Timeout del cliente:** 25 s. Si el modelo tarda más, conviene responder con lo que haya y marcar
  `confidence: "low"`.

## `POST /analysis`

Análisis completo de una finca: clima, hallazgos y al menos 3 estrategias de rotación (una es la actual).

### Request

```json
{
  "locale": "es",
  "field": {
    "id": "p:{ltZrqnmMuAgo@vi@uAjDfo@",
    "name": "Montenegro, Quindío",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[-75.7784, 4.5329], [-75.7731, 4.5331], [-75.7729, 4.5287], [-75.7782, 4.5285], [-75.7784, 4.5329]]]
    },
    "areaHa": 24.6,
    "currentRotation": [{ "crop": "coffee", "startMonth": 1, "endMonth": 12, "year": 1, "role": "perennial" }],
    "soil": { "texture": "loam", "organicMatterPct": 4.2, "ph": 5.4, "drainage": "good" },
    "demoId": "cafe-quindio"
  },
  "priorities": {
    "waterSaving": 3,
    "soilHealth": 5,
    "income": 4,
    "forage": 1,
    "erosionControl": 5,
    "laborEquipment": 2,
    "constraints": { "irrigation": "none", "equipment": ["hand-tools"], "markets": ["coffee", "plantain", "Queso fresco"] }
  }
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `field.id` | string | Estable para la misma geometría (`pt:<lon>,<lat>`, `p:<polyline>` o `demo:<id>`). Sirve de clave de caché. |
| `field.geometry` | GeoJSON `Point` \| `Polygon` | Polígono cerrado (el primer punto se repite al final). |
| `field.areaHa` | number \| null | null si es un punto. |
| `field.currentRotation[]` | `CropSeason` | Puede venir vacío: el backend propone la rotación típica de la zona como "actual". |
| `field.soil` | opcional | Lo que contó el agricultor: `texture` (`sandy` \| `loam` \| `clay` \| `silt` \| `unknown` = "no sé"), `drainage?` (`poor` = se encharca varios días \| `moderate` \| `good`), `ph?`, `organicMatterPct?`. Solo viene si respondió algo. Si falta, declararlo en `dataGaps` y en `dataRequests`. |
| `field.survey` | opcional | Encuesta "Cuéntanos de tu terreno" (historial y manejo). Ver `FieldSurvey` abajo. Solo viene si la respondió. |
| `priorities.*` | entero 0–5 | El orden final lo recalcula el cliente con estos pesos; ver "Puntajes". |
| `priorities.constraints.irrigation` | `"none"` \| `"limited"` \| `"full"` | Cambia qué estrategias son viables. |
| `priorities.constraints.equipment[]` | string | `tractor`, `seed-drill` (siembra directa), `harvester`, `sprayer`, `animal`, `hand-tools`. |
| `priorities.constraints.markets[]` | string | Ids de `CROP_IDS`, `livestock` o texto libre (≤ 30 caracteres, sin comas). |

`CropSeason`: `{ crop, startMonth (1–12), endMonth (1–12), year (1–3), role }`. Si `endMonth < startMonth` la
temporada cruza el año (p. ej. trigo de invierno 10 → 7). `role`: `cash` | `cover` | `forage` | `fallow` |
`perennial` | `intercrop`. `crop` es uno de `CROP_IDS` en el contrato (maize, soybean, wheat, rice, coffee, beans,
sorghum, millet, cowpea, groundnut, chickpea, mungbean, barley, oats, potato, cassava, plantain, sugarcane, cotton,
sunflower, alfalfa, clover, vetch, rye, radish, pasture, forage-peanut, shade-trees, vegetables, squash, pigeonpea,
fallow). `squash` = calabaza/ahuyama (la tercera hermana de la milpa), `pigeonpea` = guandul.

`FieldSurvey` (todo opcional: `null` = sin responder):

| Campo | Valores | Cómo usarlo |
|---|---|---|
| `usualCrops[]` | ids de `CROP_IDS` (≤ 12) | Lo que suele sembrar: favorecer lo que ya sabe manejar. |
| `lastCrop` | id de `CROP_IDS` \| `null` | `fallow` = lo dejó descansar. No repetir la misma familia (plagas y enfermedades del suelo). |
| `fertilization` | `none` \| `organic` \| `synthetic` \| `both` | `none`: avisar si la estrategia pide mucho nitrógeno y dar valor a las leguminosas. |
| `residues` | `leave` \| `burn` \| `graze` \| `remove` | `burn`: menos materia orgánica y suelo desnudo; sugerir dejar el rastrojo como cobertura. |
| `pests[]` | `armyworm`, `soil-pests`, `fungus`, `weeds`, `animals` | `[]` = ninguno. Diversificar contra gusanos, coberturas contra malezas. |
| `purpose` | `home` \| `sale` \| `both` | Para la casa conviene más diversidad de alimentos; para vender, los mercados de `constraints.markets`. |

Suelo, drenaje y riego **no** van en la encuesta: son `field.soil` y `priorities.constraints.irrigation`.

**Cultivos asociados (pestaña "Tu plan").** Por ahora el cliente arma las asociaciones con reglas visibles
(`src/features/rotations/mixed/`: rasgos de cada cultivo en `traits.ts`, parejas en `relations.ts`, asociaciones
conocidas en `guilds.ts`, clima mes a mes con NASA POWER en `climate.ts`). Si el backend devuelve una estrategia
con `id` igual a un `guild.id` (`three-sisters`, `milpa-cassava`, `coffee-agroforestry`…), la UI la puede enlazar con
esa asociación.

### Response (recortada)

```json
{
  "field": { "...": "eco de la finca, con currentRotation completada" },
  "climate": {
    "location": { "lat": 4.531, "lon": -75.775, "elevationM": 1290 },
    "baselinePeriod": "2001–2024",
    "latestYear": 2025,
    "months": [
      {
        "month": 7,
        "tMean": { "value": 21.9, "unit": "°C", "source": "NASA POWER", "resolution": "0.5° × 0.625°", "period": "2001–2024 (promedio)", "confidence": "high" },
        "tMax": { "value": 26.9, "unit": "°C", "source": "NASA POWER", "resolution": "0.5° × 0.625°", "period": "2001–2024 (promedio)", "confidence": "high" },
        "tMin": { "value": 16.9, "unit": "°C", "source": "NASA POWER", "resolution": "0.5° × 0.625°", "period": "2001–2024 (promedio)", "confidence": "high" },
        "precip": { "value": 95, "unit": "mm", "source": "GPM", "resolution": "0.1° (~11 km)", "period": "2001–2024 (promedio)", "confidence": "medium" },
        "et": { "value": 102, "unit": "mm", "source": "MODIS", "resolution": "500 m", "period": "2001–2024 (promedio)", "confidence": "medium", "estimated": true },
        "soilMoisture": { "value": 70, "unit": "%", "source": "SMAP", "resolution": "9 km", "period": "2001–2024 (promedio)", "confidence": "medium" },
        "soilMoistureAnomaly": { "value": -9, "unit": "pp", "source": "SMAP", "resolution": "9 km", "period": "2025 vs. 2015–2024", "confidence": "medium" },
        "ndvi": { "value": 0.74, "unit": "", "source": "MODIS", "resolution": "250 m", "period": "2001–2024 (promedio)", "confidence": "high" },
        "frostDays": { "value": 0, "unit": "días", "source": "NASA POWER", "resolution": "0.5° × 0.625°", "period": "2001–2024 (promedio)", "confidence": "medium" },
        "heatDays": { "value": 0, "unit": "días", "source": "NASA POWER", "resolution": "0.5° × 0.625°", "period": "2001–2024 (promedio)", "confidence": "low", "estimated": true }
      }
    ],
    "trend": [{ "year": 2001, "tMean": 21.2, "precip": 2140 }, { "year": 2025, "tMean": 21.9, "precip": 1880 }],
    "summary": {
      "annualPrecipMm": 2050,
      "precipChangePct": -8,
      "tempChangeC": 0.5,
      "latestYearPrecipAnomalyPct": -12,
      "latestYearTempAnomalyC": 0.4
    },
    "sources": ["NASA POWER", "GPM", "SMAP", "MODIS"]
  },
  "insights": {
    "bareSoilPeriods": [{ "startMonth": 1, "endMonth": 3, "reason": "Calles entre surcos limpias de maleza" }],
    "stressSeasons": [{ "kind": "drought", "months": [7, 8], "severity": "medium", "source": "SMAP", "note": "Más fuerte en años de El Niño" }],
    "waterTrend": { "direction": "stable", "cmPerYear": 0.1, "period": "2002–2025", "source": "GRACE", "confidence": "low" },
    "erosionRisk": {
      "level": "high",
      "slopePct": 28,
      "extremeRainDaysPerYear": 14,
      "explanation": "Laderas empinadas y 14 días al año con lluvias muy fuertes: el suelo desnudo se lava.",
      "source": ["SRTM", "GPM"]
    },
    "waterloggingRisk": { "level": "low", "explanation": "Pendiente alta: el agua escurre rápido." }
  },
  "strategies": [
    {
      "id": "coffee-shade-cover",
      "name": "Café con sombrío leguminoso y maní forrajero",
      "isCurrent": false,
      "durationMonths": 12,
      "seasons": [
        { "crop": "coffee", "startMonth": 1, "endMonth": 12, "year": 1, "role": "perennial" },
        { "crop": "forage-peanut", "startMonth": 1, "endMonth": 12, "year": 1, "role": "cover" }
      ],
      "scores": { "water": 70, "soilOrganicMatter": 75, "nitrogen": 70, "erosion": 88, "pestBreak": 55, "income": 62, "forage": 20 },
      "rationale": "El maní forrajero cubre el suelo todo el año y los árboles de sombra bajan el calor.",
      "evidence": [
        {
          "id": "coffee-shade-cover-ev1",
          "source": "SMAP",
          "statement": "SMAP: suelo más seco en julio–agosto.",
          "rule": "Cobertura viva y sombra conservan humedad en meses secos.",
          "layerId": "soil-moisture",
          "date": "2025-08-01",
          "months": [7, 8]
        }
      ],
      "benefits": ["Suelo cubierto los 12 meses: frena la erosión en las lluvias fuertes."],
      "risks": ["Demasiada sombra favorece la roya: hay que podar."],
      "dataGaps": ["No tenemos un análisis de suelo de tu finca; con él ajustaríamos la recomendación de nitrógeno y cal."],
      "needsLocalReview": ["Porcentaje de sombra adecuado para tu altitud."],
      "confidence": "medium",
      "monthly": [{ "month": 1, "waterUseMm": 98, "soilCovered": true }]
    }
  ],
  "generatedAt": "2026-11-11T16:20:00.000Z",
  "disclaimer": "Esta herramienta te ayuda a explorar opciones. Revisa cualquier cambio con tu experiencia y con un técnico agrícola de tu zona.",
  "mock": false
}
```

### Reglas que el frontend valida

- `strategies.length >= 3` y **exactamente una** con `isCurrent: true`.
- `climate.months` tiene 12 elementos (enero → diciembre).
- Cada número va dentro de un `Metric` con `source`, `resolution`, `period` y `confidence`. Si es derivado, `estimated: true`.
- `source` ∈ `NASA POWER`, `SMAP`, `GPM`, `MODIS`, `VIIRS`, `ECOSTRESS`, `GRACE`, `SRTM`, `Landsat/HLS`, `MERRA-2`,
  `Modelo agronómico`, `Dato local`.
- `evidence[].layerId` ∈ `ndvi`, `soil-moisture`, `rain`, `lst-day`, `lst-night`, `evap`, `groundwater`, `relief`:
  el botón "ver en el mapa" activa esa capa en la fecha `date`.
- `monthly` es opcional pero si viene tiene 12 elementos (se usa en "comparar 2").
- `dataRequests` es opcional; las peticiones con un `need` desconocido se ignoran sin romper la respuesta.

### Datos que faltan: `dataRequests`

Cuando a los satélites no les alcanza, el análisis le pide al agricultor lo que solo él sabe. El backend declara
qué le falta y por qué; la app lo pregunta con toques grandes en la tarjeta **"Faltan datos para completar tu
análisis"** (pestaña *Tu finca*), una pregunta a la vez, y vuelve a llamar a `POST /analysis` con la respuesta.

```json
"dataRequests": [
  { "need": "soil-type", "impact": "high", "reason": "El tipo de tierra cambia cuánta agua guarda y qué cultivos le van mejor." },
  { "need": "soil-test", "impact": "medium", "reason": "Con el pH y la materia orgánica ajustamos el nitrógeno y la cal.", "strategyIds": ["coffee-full-sun"] }
]
```

| `need` | Qué pregunta la app | Dónde llega la respuesta |
|---|---|---|
| `current-rotation` | ¿Esto es lo que siembras hoy? (confirmar o cambiar la típica de la zona) | `field.currentRotation` |
| `soil-type` | ¿Cómo es la tierra? (arenosa, franca, arcillosa, limosa, no sé) | `field.soil.texture` |
| `irrigation` | ¿Puedes regar? | `priorities.constraints.irrigation` |
| `drainage` | Después de un aguacero, ¿el agua se queda? | `field.soil.drainage` |
| `soil-test` | ¿Tienes análisis de laboratorio? (pH y materia orgánica) | `field.soil.ph`, `field.soil.organicMatterPct` |

- `reason`: una frase simple en el `locale` pedido (≤ 240 caracteres). `impact`: `high` si puede cambiar la
  recomendación. `strategyIds` (opcional): estrategias que se ajustarían con ese dato.
- `[]` = no falta nada. **Si el campo no viene**, el cliente deduce lo que falta de lo que envió.
- El riego lo pregunta siempre el cliente si la persona no lo ha dicho (el backend recibe `"none"` por defecto y
  no puede distinguir "no tengo riego" de "no me lo han preguntado").
- Lo que la persona ya respondió no se vuelve a preguntar aunque el backend lo pida; "Ahora no" lo deja como vacío
  de información visible. El suelo se recuerda por finca en el teléfono.
- Cuando llega el dato, el backend debe usarlo y decirlo: quitar el vacío de `dataGaps`, añadir evidencia con
  `source: "Dato local"` y subir `confidence` si corresponde. El mock lo hace en `src/mocks/farmerData.ts`.
- El chat recibe la misma lista en `view.missingData` y puede pedirla con la acción `askForData` (ver
  [agent-contract.md](agent-contract.md)).

### Puntajes

`scores.*` van de 0 a 100 y **más alto = mejor para el agricultor** en todas las dimensiones (por ejemplo
`water: 80` = usa poca agua; `erosion: 85` = protege bien del lavado). El ranking final lo calcula el cliente (`src/features/priorities/ranking.ts`):

```
peso: mucho = 5, algo = 3, poco = 1   (lo que se guarda en priorities.* como 0–5)

ahorrar agua      = scores.water
mejorar el suelo  = (scores.soilOrganicMatter + scores.nitrogen + scores.pestBreak) / 3
más ingresos      = scores.income
forraje           = scores.forage
frenar la erosión = scores.erosion
menos trabajo     = 100 − 25 × (siembras por año − 1), entre 0 y 100   ← lo estima el cliente con seasons

puntaje_total = Σ (peso_p × puntaje_p) / Σ peso_p        (empate → orden del backend)
```

Así el agricultor puede cambiar prioridades sin volver a llamar al backend; la UI muestra esta cuenta en
"Así calculamos el orden". Las restricciones sí van al backend (son parte de la clave de caché del análisis).
El mock imita su efecto con reglas visibles: mercados que coinciden (beneficio), cultivos que piden riego sin
riego (riesgo), coberturas sin sembradora de siembra directa (revisar con técnico) y muchas labores sin tractor.

### Escenarios "¿y si…?" (cliente, mientras el backend no los soporte)

`src/features/rotations/whatIf.ts` ajusta los puntajes con reglas simples y la UI los marca siempre como
**estimación**: lluvia −30…+30 % y temperatura +0…+3 °C.

```
sed = (100 − water) / 100            cover = meses con suelo cubierto / 12 (de `monthly`)
seco = max(0, −lluvia%) × 0.6 + °C × 5          húmedo = max(0, lluvia%)
water'   = water − seco × (0.5 + sed) + húmedo × 0.2 × (0.5 + sed)
erosion' = erosion − húmedo × 0.4 × (1 − cover)
income'  = income − seco × 0.3 × sed
monthly.waterUseMm' = waterUseMm × (1 + 0.04 × °C)
```

Si el backend algún día acepta `scenario: { rainPct, tempC }` en `POST /analysis`, basta con mandar esos valores
y dejar de aplicar estas reglas. `monthly` (uso de agua y suelo cubierto por mes) alimenta "comparar 2"; si falta,
la UI lo dice.

### Enlaces e impresión

Un enlace compartido lleva `field`, `pr`/`eq`/`mk` (prioridades) y `view=rotations` (abre directo en las opciones).
`/[locale]/print?field=…&pr=…&wr=…&wt=…` genera el resumen imprimible (sin globo) para el técnico agrícola.

### Errores

Respuesta no-2xx con cuerpo `{ "error": "<código>", "message"?: "...", "issues"?: [...] }`. El frontend muestra
mensajes amables según el tipo (red, tiempo agotado, fuera de contrato) y ofrece reintentar.

## `POST /rotations/outlook`

La rotación **en el tiempo**: cómo evoluciona cada estrategia del análisis año por año (10 años), qué le pide a la
familia y en qué fuentes se apoya. El esquema está en
[`src/lib/api/outlook.ts`](../src/lib/api/outlook.ts). Va aparte de `contract.ts` para que solo lo cargue el chunk
"En el tiempo". El modelo del mock y sus fuentes están en [rotation-outlook.md](rotation-outlook.md).

### Request

```json
{
  "locale": "es",
  "field": { "...": "el field que devolvió POST /analysis (con currentRotation completada)" },
  "priorities": { "...": "igual que en /analysis (se usan constraints.markets y constraints.equipment)" },
  "strategies": [
    { "id": "current", "name": "Café a libre exposición", "isCurrent": true, "durationMonths": 12, "seasons": [], "scores": {}, "confidence": "medium" }
  ],
  "site": { "annualPrecipMm": 2050, "tMeanC": 21.4, "elevationM": 1290, "slopePct": 28, "erosionLevel": "high" },
  "household": { "workers": 2, "tenure": "rent", "association": null },
  "pace": "gradual",
  "horizonYears": 10
}
```

| Campo | Notas |
|---|---|
| `strategies[]` | Las de `/analysis`, con `id`, `name`, `isCurrent`, `durationMonths`, `seasons`, `scores` y `confidence`. Exactamente una `isCurrent`. Máximo 8. |
| `site` | Opcional; cada campo puede ser `null`. Sale de `climate` e `insights` del análisis. |
| `household` | Opcional; cada campo puede ser `null` (sin responder). `workers` va de 1 a 12. `tenure`: `own` \| `rent` \| `shared` \| `unknown`. `association`: boolean. |
| `pace` | `all` (todo el lote el año 1) \| `gradual` (¼ → ½ → todo). Por defecto `all`. |
| `horizonYears` | 3–15, por defecto 10. |

### Response (recortada; los números son de ejemplo)

```json
{
  "fieldId": "demo:cafe-quindio",
  "horizonYears": 10,
  "pace": "gradual",
  "baseline": {
    "soilOrganicMatterPct": 3, "soilOrganicMatterSource": "Modelo agronómico",
    "bareSoilLossTHa": 143, "tolerableSoilLossTHa": 1,
    "areaHa": 24.6, "areaAssumed": false, "workers": 2, "workersAssumed": false, "laborDaysHa": 150
  },
  "strategies": [
    {
      "strategyId": "coffee-shade-cover",
      "cycleYears": 1,
      "years": [
        {
          "year": 1, "cycleYear": 1, "phase": "transition", "adopted": 0.25,
          "months": ["coffee", "coffee", "...12 valores (CropId o null)"],
          "soilOrganicMatterPct": { "mid": 3.01, "low": 2.94, "high": 3.07 },
          "soilLossTHa": { "mid": 14.2, "low": 8.5, "high": 22.7 },
          "soilLostMm": 1.09,
          "incomeIndex": { "mid": 97.6, "low": 76.9, "high": 109.9 },
          "laborDaysHa": 156
        }
      ],
      "milestones": [{ "year": 1, "kind": "trial", "text": "Año de prueba: …", "refIds": ["pittelkow-2015-fcr"] }],
      "breakEvenYear": 3,
      "labor": { "perHaByMonth": [], "farmByMonth": [], "familyPerMonth": 28, "peakMonths": [10, 11, 12], "hiredDaysYear": 0 },
      "food": { "months": [], "gapMonths": [], "crops": [], "families": 0 },
      "cash": { "months": [] },
      "social": [{ "kind": "tenure", "status": "alert", "title": "Tierra arrendada", "text": "…", "refIds": ["higgins-2018"] }],
      "confidence": "medium"
    }
  ],
  "context": { "region": "co", "placeName": "Montenegro, Quindío", "facts": [{ "id": "co-smallholders", "text": "…", "refIds": ["dane-cna-2014"] }], "questions": ["…"] },
  "assumptions": ["No tenemos tu análisis de suelo: …"],
  "references": [
    { "id": "dane-cna-2014", "authors": "DANE", "year": 2016, "title": "3er Censo Nacional Agropecuario 2014 – Boletín 1: Uso del suelo", "venue": "DANE, Bogotá", "url": "https://www.dane.gov.co/…", "finding": "Las unidades productivas de menos de 5 hectáreas fueron el 70,4 %…", "topic": "colombia" }
  ],
  "generatedAt": "2026-11-14T16:20:00.000Z",
  "disclaimer": "Es una proyección con reglas simples y promedios, no un pronóstico. …",
  "mock": true
}
```

Reglas que valida el frontend y que debe cumplir el backend:

- `years` tiene `horizonYears` elementos. Cada `months` tiene 12 valores. Cada rango cumple `low ≤ mid ≤ high`.
- `incomeIndex`: 100 = lo que deja hoy la rotación actual en un año normal. Es un índice, no una moneda.
- `soilLostMm` es acumulado desde hoy y nunca baja.
- La rotación actual va en `strategies` con todas sus fases en `stable`, `adopted: 0` y `breakEvenYear: 1`.
- `labor.*`, `food.months` y `cash.months` tienen 12 valores (enero → diciembre).
- `social[].status` ∈ `good` \| `watch` \| `alert`. La UI siempre lo muestra con ícono y texto.
- Cada `refIds` apunta a un `references[].id` de la misma respuesta. Las citas que no están se omiten sin romper la UI.
- Los textos (`text`, `title`, `finding`, `assumptions`, `questions`, `disclaimer`) vienen en el `locale` pedido.

## Clima real sin backend: NASA POWER

El frontend llama directamente a NASA POWER para el perfil climático de un punto (CORS abierto, cache por celda de 0.1°):

```
GET https://power.larc.nasa.gov/api/temporal/monthly/point
    ?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR_SUM,RH2M,ALLSKY_SFC_SW_DWN,GWETROOT,EVPTRNS,FROST_DAYS
    &community=AG&latitude=4.5&longitude=-75.8&start=2001&end=2025&format=JSON
```

La transformación a `ClimateProfile` está en `src/lib/api/power.ts` (con tests sobre una respuesta real en
`tests/fixtures/`). Conversiones: `EVPTRNS` MJ/m²/día ÷ 2.45 → mm/día; `GWETROOT` 0–1 → %; `YYYY13` = total
anual (sumas) o promedio anual (temperaturas). NDVI no está en POWER: el backend debe aportarlo (MODIS/VIIRS).
Los días de calor (> 35 °C) se estiman desde la máxima media mensual y se marcan `estimated: true`.

## Máquina del tiempo (fechas pasadas)

La persona puede revisar un mes o un día pasado (`?t=2026-05` o `?t=2026-05-14` en la URL de la app).

- `GET /region?lat&lon[&demo][&name]&t=2026-05&locale`: las tarjetas describen **ese mes** (lluvia total contra lo
  normal de esos días y temperaturas del mes con datos diarios reales de NASA POWER; el resto, simulado en el mock) y
  la respuesta trae `period: { start, end, label, partial }`. Un día (`t=2026-05-14`) usa su mes completo.
  `t` inválido, en el futuro o en los últimos ~3 días → `400 invalid_time`.
- El panel de la finca pide los datos diarios directo a NASA POWER (`temporal/daily/point`, CORS abierto) y
  reconstruye los eventos en el cliente (`src/features/time/events.ts`):
  lluvia fuerte (≥ 20 mm en un día, o ≥ 3× la lluvia diaria normal y ≥ 10 mm), racha seca (≥ 7 días seguidos con
  < 1 mm), calor extremo (máxima ≥ 35 °C) y helada (mínima ≤ 0 °C). "Normal" = promedio mensual 2001–2025 de POWER.
- Si el backend quiere hacerlo él, basta con aceptar `t` en `/region` y devolver `period`; el cliente ya lo muestra.

## Departamentos y municipios de Colombia

Al tocar el globo dentro de Colombia, el drawer elige el **departamento** (zoom < 6) o el **municipio** (zoom ≥ 6)
que contiene el punto (límites del DANE, MGN, en `public/geo/`; `src/features/region/admin.ts`) y lo indica en la
petición:

- `GET /region?lat&lon&name&admin=co:05001&locale`: `admin` es opcional, `co:` + código DIVIPOLA (2 dígitos =
  departamento, 5 = municipio). `lat`/`lon` siguen siendo el punto tocado y `name` llega ya resuelto
  ("Medellín, Antioquia").
- El backend puede ignorarlo (el mock lo ignora) o usarlo para resumir el área completa. Mientras responda
  `kind: "cell"`, el drawer avisa que los datos son de la zona alrededor del punto y no un promedio de todo el
  municipio o departamento.
- Enlace compartible: `?region=co:05001` (o `co:05`) abre el área desde su punto interior.
- El `bbox` de la respuesta se dibuja en el mapa como **recuadro punteado** ("zona de los datos", con su tamaño en
  la leyenda del drawer), junto al borde del municipio y el de su departamento. Si el backend resume otra zona (una
  celda de 0,5°, el municipio entero…), basta con devolver ese `bbox`: el recuadro y el texto lo siguen.

## Zonas de riesgo y cambios del terreno (archivos estáticos)

No pasan por el backend. Los genera `node scripts/build-terrain-co.mjs` a partir del export de Google Earth Engine
(`scripts/gee/terrain-co.js`) y se validan con `src/lib/api/terrain.ts`. Método, tramos y pasos: `docs/terrain-risk.md`.

- `GET /geo/terrain-co.json`: índice de todos los municipios y departamentos (lo usa la capa `risk`).
  ```json
  {
    "version": 1,
    "source": "gee",
    "generatedAt": "2026-11-14T20:00:00Z",
    "periods": { "initial": { "label": "2016–2018", "years": [2016, 2018] }, "final": { "label": "2023–2025", "years": [2023, 2025] }, "years": [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], "stepYears": 7 },
    "datasets": ["MODIS/061/MOD13Q1", "NASA/SMAP/SPL4SMGP/008", "…"],
    "items": {
      "44001": {
        "a": 3120.4, "v": 0.91,
        "p0": [310, 420, 250, 20], "p1": [260, 430, 290, 20],
        "i": { "smAnom": -21.4, "smWet": 3.1, "pAnom": -24.8, "pHeavy": 0.9, "mfi": 68, "etRatio": 0.41, "lstHot": 52.3, "lstAnom": 1.4, "gwTrend": -1.2, "slope": 4.2, "flat": 61.5, "ndviTrend": -0.031, "toBare": 4.8 }
      }
    }
  }
  ```
  - `a`: área en km². `v`: fracción del área con dato válido.
  - `p0` / `p1`: estado inicial y final en milésimas (sana, con estrés, suelo expuesto, agua).
  - `i`: indicadores. Cualquiera puede ser `null`.
- `GET /geo/terrain/<dpto>.json`: detalle de un departamento y sus municipios (lo usa el drawer).
  - `t`: las 16 fracciones (estado inicial → estado final), fila por fila.
  - `y`: el reparto de cada año.
  ```json
  { "version": 1, "source": "gee", "dpto": "44", "items": { "44001": { "t": [250, 50, 10, 0, 10, 330, 80, 0, 0, 50, 200, 0, 0, 0, 0, 20], "y": [[300, 430, 250, 20], "…"] } } }
  ```
- `source: "synthetic"`: datos simulados para la demo. La leyenda y el drawer lo dicen, y la confianza baja.


## Mercado de Colombia (opcional, desde noviembre 2026)

Campos **opcionales** que el backend puede llenar; el mock los llena en Colombia (ver [`market-data.md`](market-data.md)):

- `AnalysisResponse.market`: `{ deptCode, deptName, nearestMarket: { name, distanceKm } | null, trmCop, fertilizerChange12mPct, asOf, source: "db" | "seed" }`.
- `RotationStrategy.market` (`StrategyMarket`): `{ summary, crops: MarketCrop[] (≤ 6), confidence, risks, gaps, asOf }`.
  Cada `MarketCrop`: `{ crop, product, priceCopKg, market, distanceKm, month, change12mPct, volatility, supplyTrend,
  yieldTHa, yieldScope, revenueCopHa, monthsToFirstHarvest, credit, factor, outlook }`.
- `DataSource` suma `SIPSA`, `EVA`, `TRM`, `Finagro`, `UPRA` y `Análisis IA` (para `Evidence.source`).

Ejemplo de `strategy.market`:

```json
{
  "summary": "Fríjol: $11.953/kg en Armenia, Mercar (5 km) · mercado a favor.",
  "crops": [{ "crop": "beans", "product": "frijol", "priceCopKg": 11953, "market": "Armenia, Mercar", "distanceKm": 5,
              "month": "2026-10", "change12mPct": 88.4, "volatility": "medium", "supplyTrend": "flat", "yieldTHa": 1.49,
              "yieldScope": "dept", "revenueCopHa": 17810000, "monthsToFirstHarvest": null,
              "credit": null, "factor": 1.12, "outlook": { "label": "favorable", "why": "…", "by": "claude", "confidence": "medium" } }],
  "confidence": "medium",
  "risks": ["Hoy el precio de fríjol está alto, pero puede bajar si muchos siembran lo mismo."],
  "gaps": ["Son precios mayoristas (lo que se paga en la central): en finca te pagan menos, y no descontamos tus costos de producción."],
  "asOf": "2026-10-01"
}
```

## Rutas propias de la app (no pasan por `NEXT_PUBLIC_API_BASE_URL`)

| Ruta | Contrato | Doc |
|---|---|---|
| `GET /api/market?lat&lon&locale&products` | `MarketResponse` (`src/lib/api/market.ts`) | [`market-data.md`](market-data.md) |
| `POST /api/market/jobs/refresh?sources=…` · `POST /api/market/jobs/outlook` | Header `X-FieldShift-Secret` | [`market-data.md`](market-data.md) |
| `/api/listings`, `/api/listings/[id]`, `…/flag`, `…/contact` | `src/lib/api/listings.ts` | [`listings.md`](listings.md) |

En el cliente se llaman con `fetch` + zod (no con `apiFetch`, que antepone `/api/mock` o el backend del equipo).
