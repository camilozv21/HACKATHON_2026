# API abierta del terreno (`/api/terrain`)

API de solo lectura sobre el modelo de terreno de [terrain-risk.md](terrain-risk.md): 1.122 municipios y 33
departamentos de Colombia, con indicadores NASA (SMAP, GPM IMERG, MODIS, GRACE/GRACE-FO, SRTM), estados del terreno
año por año (2016–2025) y la proyección de la cadena de Markov (2031, 2038, 2045).

- Sin clave, CORS abierto (`*`), solo `GET`.
- Respuestas JSON (también CSV y GeoJSON).
- **Se describe sola:** `GET /api/terrain` devuelve todos los campos, con unidad, misión y descripción en es/en.
  Empieza por ahí.

| Endpoint | Para qué | Formatos |
| --- | --- | --- |
| `GET /api/terrain` | Catálogo: campos, operadores, años con dato, ejemplos | json |
| `GET /api/terrain/places` | Lista de lugares, con filtros por cualquier campo | json, csv, geojson |
| `GET /api/terrain/places/{code}` | Un lugar: riesgo con evidencia, Markov y serie anual | json |
| `GET /api/terrain/series` | **Ubicación × tiempo:** estado del terreno por lugar y año | json, csv |
| `GET /api/terrain/at?lat&lon` | Qué municipio y departamento contienen el punto, con su detalle | json |

## Ubicación

Estos parámetros se combinan entre sí y con los filtros (todo con Y).

| Parámetro | Qué elige |
| --- | --- |
| `code=05001,11001` | Por código DIVIPOLA: 5 dígitos = municipio, 2 = departamento |
| `dpto=05` | Todo un departamento (el departamento y sus municipios) |
| `level=mpio` o `level=dpto` | Solo municipios o solo departamentos |
| `lat=6.24&lon=-75.58` | El municipio y el departamento que contienen el punto (límites del DANE) |
| `near=4.71,-74.07&radiusKm=50` | Lugares cuyo límite está a menos de `radiusKm` del punto. Añade `distanceKm` (0 = el punto cae dentro). Por defecto 25 km |
| `bbox=oeste,sur,este,norte` | Lugares que tocan la caja |
| `q=san jose narino` | Búsqueda por nombre del lugar y del departamento, sin tildes |

> Con `lat`/`lon` salen dos filas por año, el municipio y el departamento. Agrega `level=mpio` si solo quieres el
> municipio.

## Tiempo

| Parámetro | Qué hace |
| --- | --- |
| *(nada)* | La serie observada, 2016–2025 |
| `from=2020&to=2025` | Un rango |
| `to=2031` (o `2038`, `2045`) | Pasado 2025 se suma la **proyección**, con `kind: "projected"` |
| `year=2024` | Un solo año. En `/places` además deja filtrar por el estado ese año (`bare=gte.0.05`) |
| `aggregate=true` (`/series`) | Una fila por año con el promedio de los lugares elegidos, ponderado por el área con dato válido. Si hay municipios, usa solo municipios (no cuenta dos veces el departamento) |

- **Proyección:** un paso de la cadena son 7 años desde 2024, el centro de 2023–2025. Supone que los cambios siguen
  igual.
- Un año sin dato (por ejemplo `year=2030`) da 400 `invalid-year`, con los años disponibles en `hint`.
- Los indicadores (`smAnom`, `pHeavy`…) no son anuales. Comparan 2023–2025 con una línea base, así que son campos
  del lugar, no del año.

## Filtros por campo

Funcionan como en PostgREST: `campo=op.valor`. Puedes filtrar cualquier campo del catálogo.

| Operador | Ejemplo | Significado |
| --- | --- | --- |
| *(ninguno)* | `riskLevel=high` | igual |
| `eq` · `neq` | `trend=neq.stable` | igual · distinto |
| `gt` · `gte` · `lt` · `lte` | `pHeavy=gte.5` · `smAnom=lt.-5` | comparaciones |
| `in` · `nin` | `riskLevel=in.(medium,high)` · `dpto=nin.(88,91)` | en la lista · fuera de ella |
| `like` · `ilike` | `name=ilike.*bogota*` | texto con comodín `*`; `ilike` ignora mayúsculas y tildes |
| `is` | `gwTrend=is.null` · `gwTrend=is.notnull` | sin dato · con dato |

Reglas:

- **Atajo de listas:** en códigos y enums, `a,b` equivale a `in.(a,b)`. Ejemplos: `code=05001,05002` y
  `level=mpio,dpto`.
- **Rangos:** repite el campo, por ejemplo `pHeavy=gte.3&pHeavy=lt.8`.
- **Valores null:** igual que en SQL, un null solo cumple `is.null` (o `campo=null`). Cualquier otra comparación
  con null da falso.
- **Parámetros desconocidos:** dan 400 `unknown-field`, con la lista de campos en `hint`. Así un error de dedo no
  devuelve "todo" sin avisar. Los parámetros que empiezan por `_` se ignoran (por ejemplo `_=123` para saltar cachés).

### Campos

La lista completa, con unidades, está en `GET /api/terrain`. Por grupos:

| Grupo | Campos |
| --- | --- |
| Identidad | `code`, `level`, `name`, `dpto`, `dptoName` |
| Ubicación | `lat`, `lon` (punto interior), `areaKm2`, `distanceKm` (solo con `near`) |
| Calidad | `validShare` (0–1), `confidence` (`high`/`medium`/`low`) |
| Indicadores | `smAnom`, `smWet`, `pAnom`, `pHeavy`, `mfi`, `etRatio`, `lstHot`, `lstAnom`, `gwTrend`, `slope`, `flat`, `ndviTrend`, `toBare` |
| Estados | `healthyInitial`, `healthyFinal`, `healthyChange`, igual para `stressed`, `bare` y `water` (fracciones 0–1); `trend` |
| Riesgo | `riskScore` (0–100), `riskLevel`, `riskTop`, más `droughtRisk`/`droughtLevel`, `waterRisk`/`waterLevel` (encharcamiento), `heatRisk`/`heatLevel`, `soilRisk`/`soilLevel` |
| Por año | `year`, `kind` (`observed`/`projected`), `healthy`, `stressed`, `bare`, `water` |

## Forma de la respuesta

`fields=code,name,riskScore` elige las columnas. `sort=-riskScore,name` ordena: `-` es descendente y los null van al
final.

```jsonc
{
  "data": [ { "code": "05001", "name": "Medellín", "year": 2031, "kind": "projected", "healthy": 0.981, ... } ],
  "meta": {
    "source": "gee",              // "synthetic" = datos simulados (y lo dice en caveats)
    "generatedAt": "2026-11-14T23:18:29.600Z",
    "years": { "observed": [2016, ...2025], "projected": [2031, 2038, 2045] },
    "query": { ... },             // la consulta tal como se entendió
    "caveats": [ ... ],           // lo que el dato no dice: siempre muéstralos
    "total": 298, "count": 100, "limit": 100, "offset": 0
  },
  "links": { "self": "...", "next": "/api/terrain/places?...&offset=100", "catalog": "/api/terrain" }
}
```

- **Paginación:** `limit` y `offset`. El siguiente bloque está en `links.next` y en la cabecera `Link`; el total, en
  `X-Total-Count`.
  - `/places`: 100 filas por defecto, máximo 2.000 (cabe todo el país).
  - `/series`: 1.000 por defecto, máximo 20.000 (todo el país × todos los años ≈ 15.000).
- **CSV:** `format=csv`. Las columnas son `fields`, o todas las del endpoint si no lo pasas.
- **GeoJSON:** `format=geojson` (`/places`). Da puntos en el punto interior de cada lugar; los límites están en
  `public/geo/co-{mpio,dpto}.json`.
- **Errores:** `{ "error": "<código estable>", "detail": "<explicación>", "hint"?: {...} }`.
  - 400: consulta inválida.
  - 404: `not-found` o `outside-coverage`. En `outside-coverage`, `hint.nearest` trae el municipio más cercano si
    está a menos de 50 km.
  - 503: no se pudieron leer los datos.
- **Idioma:** `lang=en` para mensajes, descripciones y avisos (por defecto `es`).
- **Caché:** `public, max-age=300, s-maxage=3600`. Los datos solo cambian al regenerarlos y desplegar.

## Ejemplos

```bash
B=http://localhost:3000/api/terrain

# Mi finca en el tiempo: el municipio que contiene el punto, 2016 → proyección 2038
curl "$B/series?lat=6.2442&lon=-75.5812&level=mpio&to=2038"

# Municipios de Antioquia con más aguaceros fuertes
curl "$B/places?dpto=05&level=mpio&sort=-pHeavy&limit=10&fields=code,name,pHeavy,waterLevel"

# Dónde creció el suelo expuesto en 2025, para una hoja de cálculo
curl "$B/series?level=mpio&year=2025&bare=gte.0.1&sort=-bare&format=csv"

# Promedio del Caquetá año por año, con proyección
curl "$B/series?dpto=18&level=mpio&aggregate=true&to=2045"

# Municipios a menos de 50 km de un punto, del más cercano al más lejano
curl "$B/places?near=4.711,-74.072&radiusKm=50&level=mpio&fields=code,name,distanceKm,riskLevel"

# Todo sobre un punto (detalle del municipio y del departamento)
curl "$B/at?lat=10.39&lon=-75.51&to=2031"
```

Desde TypeScript, valida con el contrato de `src/lib/api/terrainApi.ts`:

```ts
const res = TerrainListResponse.parse(await (await fetch('/api/terrain/series?code=05001')).json());
```

## Honestidad

Toda respuesta trae `meta.caveats`, y el detalle trae además `confidence`, `risk.hazards.*.evidence` y `missing`.
Cualquier pantalla o agente que use la API debe mostrarlos:

- Es un promedio del municipio, no de una finca.
- La proyección supone que los cambios siguen igual.
- GRACE es una tendencia regional.
- Límites del NDVI y de MODIS LST.
- La herramienta apoya, no reemplaza, el criterio del agricultor ni a los técnicos locales.

## Código

| Pieza | Dónde |
| --- | --- |
| Rutas | `src/app/api/terrain/**/route.ts` |
| Catálogo de campos (nombre, tipo, unidad, misión, descripción es/en) | `src/server/terrain/fields.ts` |
| Lenguaje de consulta (filtros, orden, paginación, ubicación, tiempo) | `src/server/terrain/query.ts` |
| Consultas (selección por ubicación, serie, agregados, detalle) | `src/server/terrain/service.ts` |
| Carga de datos y línea de tiempo (observado + Markov) | `src/server/terrain/data.ts` |
| CORS, CSV, GeoJSON, errores | `src/server/terrain/http.ts` |
| Contrato zod para clientes | `src/lib/api/terrainApi.ts` |
| Pruebas | `src/server/terrain/terrain.test.ts` |

- **Datos:** lee los mismos JSON que el globo (`public/geo/terrain-co.json`, `public/geo/terrain/<dpto>.json`,
  `public/geo/co-{mpio,dpto}.json`). Los carga una vez por proceso (10 min en memoria).
- **Despliegue:** `outputFileTracingIncludes`, en `next.config.ts`, copia esos archivos junto a las funciones.
- **Puntaje y Markov:** reutiliza `src/features/terrain/score.ts` y `markov.ts`, así que la API da los mismos números
  que el drawer.
- **Añadir un campo:**
  1. Agrégalo en `fields.ts`.
  2. Calcula su valor en `placeRow` (`data.ts`), si es del lugar, o en `timeRow` (`service.ts`), si es por año.
  3. Las pruebas exigen descripción en es y en.
