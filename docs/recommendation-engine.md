# Motor de recomendaciones de rotación

Este documento explica qué hace el mock de `POST /analysis` para elegir y puntuar las rotaciones. Sirve de
referencia al backend real, que puede reemplazarlo con el mismo contrato (`src/lib/api/contract.ts`). El código vive
en `src/mocks/engine/`. Las pruebas están en `src/mocks/engine/engine.test.ts`.

## En qué se basa

| Pieza | Fuente | Dónde |
| --- | --- | --- |
| Clima mensual del punto (2001–último año) | NASA POWER, comunidad AG; plantilla de la zona si POWER no responde | `src/server/powerAnalysis.ts` |
| Rango diario medio de temperatura | NASA POWER climatología, `T2M_RANGE` | `src/server/powerAnalysis.ts` |
| ET0 (lo que pierde el campo por evaporación y transpiración) | Hargreaves–Samani, FAO-56 ec. 52; Ra de FAO-56 ec. 21 | `site.ts` |
| Periodo de crecimiento | FAO, zonas agroecológicas: lluvia ≥ ½ ET0 y temperatura ≥ 5 °C | `site.ts` |
| Lluvia erosiva | Índice de Fournier modificado (Arnoldus 1980) | `site.ts` |
| Pendiente | SRTM en las fincas demo; en las demás se supone 4 % (15 % en zonas de montaña) y se dice en `dataGaps` | `analysis.ts`, `site.ts` |
| Rasgos de cultivo: altura, raíces, ciclo, familia, temperatura, agua | Los mismos que usa la UI de cultivos asociados | `src/features/rotations/mixed/traits.ts` |
| Ajuste térmico mes a mes | `monthScore` de la UI de asociaciones, más la muerte por invierno (SARE 2019) | `agronomy.ts` |
| Kc (coeficiente de cultivo), Ky (respuesta al déficit de agua) | FAO-56, tabla 12; FAO-33 | `agronomy.ts` |
| Compatibilidad de parejas en cultivos mixtos | `pairRelation` de la UI (curadas y deducidas) | `src/features/rotations/mixed/relations.ts` |
| Asociaciones conocidas: milpa, maíz–guandul, café agroforestal… | `GUILDS` de la UI (mismo id en la estrategia) | `src/features/rotations/mixed/guilds.ts` |

**Dato importante de NASA POWER.** En la serie mensual, `T2M_MAX` y `T2M_MIN` son los **extremos del mes**, no el
promedio de las máximas y mínimas diarias. En Iowa, julio da 35 °C y 13 °C (22 °C de rango), cuando el rango diario
medio (`T2M_RANGE`) es 11 °C. Con los extremos, la ET0 de Hargreaves sale ~40 % más alta. Por eso el motor pide
`T2M_RANGE` y, si no llega, usa 0,52 × (máx − mín). La misma confusión afecta `estimateHeatDays` en
`src/lib/api/power.ts`, que usa la UI: ahí los días de calor salen sobrestimados. Eso queda pendiente de corregir
fuera del motor.

**Altitud.** La celda de POWER mide ~50 km y promedia montañas y valles. Si se conoce la altitud de la finca (hoy
solo en las fincas demo), la temperatura se corrige con 6,5 °C por km.

## Flujo

1. **Sitio** (`site.ts`): ET0, lluvia que entra al suelo, periodo de crecimiento, meses secos, con helada, con calor o
   encharcados, lluvia erosiva y zona agroclimática. La zona se clasifica por el clima, no por cajas de
   latitud/longitud: árida, semiárida, sabana, trópico húmedo, montaña tropical, montaña fría, monzón, mediterránea,
   continental o subtropical.
2. **Lo que haces hoy**: la rotación que dio el agricultor. Si no dio ninguna, se usa la de la finca demo o la más
   común de la zona (comprobando que se dé con el clima), y se avisa en `dataGaps` ("Supusimos…").
3. **Calendario** (`schedule.ts`, `place.ts`): las fechas salen del clima, no de meses fijos por región.
   - La temporada principal son los meses ≥ 12 °C, sin heladas y con lluvia ≥ ½ ET0. Si llueve todo el año, empieza
     en el mes en que más sube la lluvia.
   - En climas bimodales hay una segunda temporada.
   - La época fresca es para los cereales de invierno.
   - El ciclo de cada cultivo se alarga con el frío y se acorta con el calor (aproximación de grados-día).
   - Las coberturas se quedan hasta la siguiente siembra.
4. **Candidatos** (`recommend.ts`, `systems.ts`):
   - **Mejorar lo de hoy**: cobertura en el hueco sin cultivo, que puede ser una mezcla de la época fresca de la UI;
     leguminosa intercalada; cobertura viva bajo un perenne; o dejar el rastrojo como mantillo.
   - **Cultivos mixtos**: las asociaciones de `GUILDS`.
   - **Otras rotaciones**: cereal–leguminosa, maíz–soya–trigo con trébol, doble cultivo, arroz de siembra directa,
     papa de montaña, pradera con ganado (solo si hay señales de animales), soya–maíz con pasto, zaï con árboles…
5. **Viabilidad**: se descarta lo que no se da con el clima. Cada cultivo que se cosecha debe rendir ≥ 45 % del
   máximo; las coberturas deben tener frío y agua suficientes; los cultivos principales no pueden pisarse.
6. **Selección**: tres opciones distintas, una de cada tipo si se puede. Variantes de la misma idea (otra cobertura en
   el mismo hueco) no cuentan como opciones distintas. Si la finca tiene un perenne (café, plátano, caña), lo que lo
   quita va al final y lo dice en sus riesgos. **El orden final lo pone el teléfono** con las prioridades de la persona
   (`src/features/priorities/ranking.ts`).

## Los 7 puntajes (0–100)

Todos se calculan mes a mes, con la misma cuenta para lo de hoy y para cada opción (`score.ts`).

| Puntaje | Cómo se calcula |
| --- | --- |
| Agua | 100 · e^(−R/500). R es el riego que haría falta al año para rendir al máximo. Sale de un balance de agua con una cubeta de 130 mm por metro de raíz: lluvia que entra frente a ET0 × Kc. El arroz inundado suma 120 mm/mes de percolación. |
| Materia orgánica | Meses con raíces vivas + rastrojo que vuelve al suelo (según rendimiento y qué se hace con el rastrojo) + perennes − quema. |
| Nitrógeno | Leguminosas (pesan más si son cobertura que se incorpora) + cobertura que atrapa el N en meses de lavado + cultivo exigente después o al lado de una leguminosa − cultivos exigentes sin leguminosa. |
| Erosión | Lógica de RUSLE: lluvia erosiva (Fournier) × pendiente (factor S) × (1 − cobertura). La cobertura se pondera por la lluvia de cada mes (p²) e incluye el mantillo. En zonas secas se suma el riesgo de viento. |
| Corte de plagas | Cambios de familia entre cultivos seguidos, número de cultivos y familias, asociaciones y coberturas de otra familia. |
| Ingresos | Σ valor relativo × rendimiento esperado × parte de la asociación. El rendimiento esperado combina frío/calor con el agua (FAO-33, Ky). La parte de la asociación sale del LER = 1 + 0,1 × valor medio de las parejas; si hay una pareja curada cereal + leguminosa, el LER es al menos 1,25. Los mercados cercanos suben el valor. **No son precios locales.** |
| Forraje | Coberturas y forrajes pastoreables por mes + rastrojo de los granos. En un cafetal, ×0,4. |

"Menos trabajo" no viene del motor: lo calcula el teléfono con las siembras por año. Una mezcla de cobertura sembrada
el mismo mes cuenta como una sola siembra.

## Texto que genera

- **Evidencia**: frases con los números del sitio, por ejemplo "MODIS NDVI: hoy el campo queda sin verde en nov–abr",
  "NASA POWER: lluvias más fuertes en abr, oct–nov; índice de Fournier 189" o "Balance de agua FAO-56: ~330 mm de
  riego al año (lo de hoy: ~1.340 mm)". Cada una va ligada a su capa del mapa.
- **Beneficios** que salen de las diferencias con lo de hoy, más los propios de cada sistema.
- **Riesgos**: cultivos que sufren (frío, calor, sed), riego que no hay, cobertura que compite por agua, mercados y
  labores.
- **Vacíos de información** (`dataGaps`): análisis de suelo (mismo texto que `NO_SOIL_TEST`, que
  `src/mocks/farmerData.ts` quita cuando llega uno), pendiente no medida, clima promedio de ~50 km o plantilla, y
  semanas secas que los promedios no muestran en zonas secas.
- **Confianza**:
  - Baja si algún cultivo rinde menos de 60 %.
  - Alta si el clima es de POWER, todo rinde ≥ 85 % y la práctica tiene mucha evidencia.
  - Media en los demás casos.

## Entradas que usa

- `field.currentRotation`, `field.demoId` y `field.geometry`. Para el clima se usa el centro del polígono.
- `field.survey`:
  - `residues` cambia cuánto rastrojo queda y si se quema;
  - `lastCrop` genera un riesgo si la primera siembra es de la misma familia;
  - `fertilization: 'none'` genera un aviso de nitrógeno si no hay leguminosas.
- `priorities.constraints`:
  - riego: si lo de hoy solo se da con riego y la persona marcó "sin riego", se supone que riega lo de hoy y se avisa;
  - maquinaria: siembras sin tractor ni animales;
  - mercados: valor y avisos de comprador.
- `field.soil` **no** entra en los puntajes del motor: lo aplica `src/mocks/farmerData.ts` después, para no contar dos
  veces.

## Variables de entorno

- `ANALYSIS_USE_POWER=false` hace que el análisis use solo la plantilla, sin red. Las e2e lo usan para que las opciones
  sean siempre las mismas.

## Limitaciones conocidas

- Paso mensual con promedios de 20+ años. No ve semanas secas, olas de calor ni años extremos. El escenario "¿y si…?"
  (`src/features/rotations/whatIf.ts`) es aparte.
- Los valores relativos de ingreso son genéricos. El backend real debería usar precios y rendimientos locales.
- Sin pendiente real fuera de las fincas demo. Un servicio SRTM (p. ej. OpenTopoData) la daría, pero enviaría la
  ubicación a un tercero.
- La rotación supuesta cuando la persona no da la suya es una conjetura por zona (en el delta del Mekong, por ejemplo,
  supone maíz).
