# Zonas de riesgo y cambios del terreno (cadena de Markov)

Capa `risk` del globo y sección "Zonas de riesgo / Cómo cambia el terreno" del drawer de región, para los 1.122
municipios y 33 departamentos de Colombia. Los datos se calculan en **Google Earth Engine** (GEE) a partir de
misiones NASA y se sirven como JSON estático. Sin export de GEE la app usa un set **sintético** y lo dice en pantalla
("simulado", confianza baja).

| Pieza | Dónde |
| --- | --- |
| Script de GEE (Code Editor) | `scripts/gee/terrain-co.js` |
| CSV de GEE → JSON de la app (o set sintético) | `scripts/build-terrain-co.mjs` |
| Datos | `public/geo/terrain-co.json` (índice), `public/geo/terrain/<dpto>.json` (detalle) |
| Esquema zod y descarga | `src/lib/api/terrain.ts` |
| Puntaje de riesgo | `src/features/terrain/score.ts` |
| Cadena de Markov | `src/features/terrain/markov.ts` |
| Capa del mapa (relleno, patrones, relieve) | `src/features/terrain/riskLayer.ts`, leyenda `RiskLegend.tsx` |
| Drawer | `src/features/terrain/TerrainSection.tsx`, gráficas `charts.tsx` (visx) |
| API abierta (filtros por campo, ubicación × tiempo, CSV/GeoJSON) | `/api/terrain`, `src/server/terrain/` ([terrain-api.md](terrain-api.md)) |

## Estados del terreno

Cada píxel (MODIS, 250–500 m) recibe un estado por periodo. Ciudades (MCD12Q1 clase 13) y nieve (15) quedan fuera.

| Estado | Regla |
| --- | --- |
| `water`: agua o encharcado | MNDWI > 0 en ≥ 25 % de los compuestos despejados de 8 días (MOD09A1, bandas 4 y 6; nubes en `StateQA`) |
| `healthy`: vegetación sana | NDVI mediano ≥ 0,6 (MOD13Q1, `SummaryQA` ≤ 1) |
| `stressed`: vegetación con estrés | 0,35 ≤ NDVI mediano < 0,6 |
| `bare`: suelo expuesto | NDVI mediano < 0,35 |

- **Estado inicial:** mediana 2016–2018.
- **Estado final:** mediana 2023–2025.
- **Serie anual:** 2016 a 2025.

## Cadena de Markov

GEE exporta, por municipio, la fracción del área en cada pareja (estado inicial *i*, estado final *j*): 16 números
`t_i_j`. Con eso (`markov.ts`):

- **Estado inicial** `p0[i] = Σj t[i][j]`; **estado final** `p1[j] = Σi t[i][j]`.
- **Matriz de transición** `P[i][j] = t[i][j] / p0[i]`. Cada fila suma 1. Si un estado no existía al inicio, su fila
  queda como "se queda igual".
- Un **paso** de la cadena son 7 años, del centro del periodo inicial (2017) al del final (2024).
- **Proyección:** `p1 · P`, hacia ~2031, suponiendo que los cambios siguen igual.
- **Tendencia a largo plazo:** la distribución estacionaria, por iteración de potencias.
- **Resumen** (`summarize`):
  - el estado que más cambió de tamaño;
  - el mayor flujo de área entre dos estados;
  - la tendencia: mejora si *(sana − expuesto)* sube más de 3 puntos, empeora si baja más de 3 puntos, estable si no.

El drawer muestra:
- las dos barras (estado inicial y estado final);
- el diagrama de estados: el tamaño del círculo es la parte del área al final, "se queda X %" es la diagonal de `P`, y
  solo hay flechas para los cambios de 5 % o más;
- la serie anual con la proyección punteada;
- una tabla accesible con la matriz y la serie.

En modo sencillo se ven la frase clave, las barras y la proyección. El diagrama, la serie y la tabla se ocultan.

## Indicadores y puntaje de riesgo

GEE exporta indicadores crudos. La app los convierte en un puntaje de 0 a 100 con **tramos absolutos**: un municipio
no sale "alto" solo por compararse con los demás.

| Riesgo | Componente (peso) | Tramo: 0 → 100 puntos | Dataset |
| --- | --- | --- | --- |
| Sequía | `smAnom` (0,35): humedad de raíz 2023–25 frente a 2016–22 | 0 → −25 % | SMAP L4 `sm_rootzone` |
| | `pAnom` (0,30): lluvia reciente frente a 2001–22, por mes del calendario | 0 → −30 % | IMERG mensual V07 |
| | `etRatio` (0,20): ET / PET 2023–25 | 0,8 → 0,3 | MOD16A2GF |
| | `gwTrend` (0,15): tendencia del agua almacenada | 0 → −2 cm/año | GRACE/GRACE-FO mascon CRI V04 |
| Encharcamiento | `pHeavy` (0,30): días al año con más de 50 mm | 0 → 8 días | IMERG V07 cada 30 min |
| | `smWet` (0,30): % del tiempo con `sm_surface_wetness` > 0,9 | 0 → 40 % | SMAP L4 |
| | `flat` (0,25): % del área con pendiente < 2 % | 0 → 60 % | SRTM |
| | agua al final (0,15): `p1[water]` | 0 → 15 % | MOD09A1 (MNDWI) |
| Calor | `lstHot` (0,7): % de semanas con superficie de día > 35 °C, 2023–25 | 0 → 50 % | MOD11A2 |
| | `lstAnom` (0,3): temperatura de superficie 2023–25 frente a 2016–22 | 0 → +2 °C | MOD11A2 |
| Suelo degradado | `toBare` (0,35): % del área que tenía plantas y pasó a suelo expuesto | 0 → 10 % | Markov (MOD13Q1) |
| | `ndviTrend` (0,35): pendiente de Sen del NDVI anual, por década | 0 → −0,08 | MOD13Q1 |
| | erosión (0,30): Fournier modificado × factor de pendiente | 60 → 160 mm | IMERG mensual · SRTM |

- **Factor de pendiente:** `0,2 + 0,8 · pendiente / 30`, con tope en 1.
- **Riesgo combinado:** `0,6 · peor + 0,4 · promedio`. Un riesgo grave no se diluye entre los demás.
- **Niveles:** bajo < 34 ≤ medio < 67 ≤ alto.
- **Sin dato:** si falta más de la mitad del peso de un riesgo, no se da puntaje. Se muestra "Sin dato" y se lista lo
  que falta.

## Honestidad (lo que la app siempre muestra)

- **Evidencia:** las dos frases que más pesan en cada riesgo, con su misión.
- **Confianza:** alta con ≥ 80 % de píxeles válidos, media con ≥ 50 %, baja con menos. El set sintético siempre tiene
  confianza baja.
- **Vacíos de información:**
  - el área que los satélites vieron bien;
  - GRACE mide zonas de ~300 km, así que es una tendencia regional;
  - los indicadores sin dato;
  - "es el promedio del municipio, no tu finca".
- **Avisos:** la proyección supone que los cambios siguen igual, y la herramienta apoya, no reemplaza, el criterio del
  agricultor ni a los técnicos locales.
- **Color:** no es la única pista. El nivel alto lleva rayado y el medio puntos, en el mapa y en el drawer. Los estados
  llevan su propio patrón y su nombre.

## Límites conocidos

- MODIS ve mal bajo nubes persistentes (Pacífico, Amazonía): la confianza baja ahí.
- El NDVI no distingue bosque de cultivo sano. Un potrero recién arado cuenta como "suelo expuesto" aunque no esté
  degradado.
- IMERG mensual V07 llega hasta 2025-09 y GRACE V04 hasta 2024-09 (catálogo GEE, 14-nov-2026): el periodo reciente
  de esos indicadores es más corto.
- SMAP L4 (~11 km), IMERG (~11 km) y GRACE (~300 km) son más gruesos que un municipio pequeño: se re-muestrean.
- **Deriva de MODIS Terra.** Desde 2020 el satélite cruza cada vez más temprano, así que la temperatura de superficie
  de día baja aunque el clima no se haya enfriado.
  - En el primer export real (14-nov-2026), `lstAnom` dio una mediana de −1,1 °C en Colombia.
  - Por eso el calor pesa sobre todo por `lstHot` y el drawer lo avisa en "Lo que no sabemos".
  - Mejora pendiente: comparar Terra con Aqua (MYD11A2) o corregir por hora de paso.

## Primer export real (14-nov-2026, proyecto `imposing-kite-396719`)

Niveles por municipio (1.122):

| Riesgo | Bajo | Medio | Alto |
| --- | --- | --- | --- |
| Combinado | 824 | 298 | 0 |
| Encharcamiento | 713 | 329 | 80 |
| Sequía | 1.116 | 6 | 0 |
| Calor | 1.094 | 28 | 0 |
| Suelo degradado | 1.112 | 10 | 0 |

- **Confianza:** alta en 1.102 municipios.
- **Sequía casi sin riesgo:** 2023–2025 frente a 2016–2022 no muestra sequía fuerte. La mediana de lluvia es −2,7 % y
  la de humedad del suelo −0,6 %, porque el año húmedo 2025 compensa El Niño de 2023–2024.
- **Encharcamiento:** sale sobre todo de los aguaceros, con mediana de 3,5 días al año por encima de 50 mm, y del
  terreno plano.

## Cómo regenerar los datos

0. **Conectar GEE.** En [code.earthengine.google.com](https://code.earthengine.google.com), inicia sesión y elige un
   proyecto de Google Cloud registrado para Earth Engine (uso no comercial). No hace falta nada instalado en el equipo.
1. `node scripts/build-terrain-co.mjs --export-boundaries` → `scripts/gee/out/co-mpio.csv` (no se comitea). Es CSV,
   con la geometría como texto GeoJSON en la columna `geometry`, porque el Code Editor solo sube Shapefile o CSV.
2. En el Code Editor: **Assets → NEW → Table upload → CSV file**, sube ese archivo con el nombre `co-mpio`. Si el
   proyecto no es `imposing-kite-396719`, cambia `ASSET` en `scripts/gee/terrain-co.js`.
3. Pega el script y dale **Run**. En la consola, la **prueba de conexión** debe mostrar el id de `USGS/SRTMGL1_003` y
   ~1.122 municipios. Si sale error de permisos, el proyecto no está registrado en Earth Engine.
4. En **Tasks**, dale **RUN** a las 4 tareas: `terrain-co-markov`, `-annual`, `-climate` y `-heavy`.
   - Todo junto excede la memoria de Earth Engine, por eso van separadas.
   - La consola no imprime una muestra porque tiene límites más bajos que las tareas.
   - La tarea más pesada es `-heavy` (días de lluvia fuerte con IMERG cada 30 min).
5. Descarga los 4 CSV de Google Drive a una carpeta y corre `node scripts/build-terrain-co.mjs --from=<carpeta>`.
   El script los une por código de municipio. Para probar sin tocar `public/geo/`, agrega `--out=<otra carpeta>`.
6. `pnpm test`: `src/lib/api/terrain.test.ts` valida los archivos nuevos contra el esquema.

Sin flags, `node scripts/build-terrain-co.mjs` vuelve al set sintético.
- **Cómo se arma:** campos suaves alrededor de focos conocidos del país, más ruido determinista por municipio.
  - Seco y caliente: La Guajira y el Caribe.
  - Encharcamiento: Chocó, La Mojana y las sabanas inundables.
  - Laderas: los Andes.
  - Degradación: el arco de deforestación de Caquetá, Guaviare y el sur del Meta.
- **Para qué sirve:** solo para la demo. No son mediciones.
