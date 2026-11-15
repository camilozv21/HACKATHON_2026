# Plan de rotación con el motor agronómico

La primera pestaña del drawer de la finca ("Recomendación") muestra el plan de rotación que arma el motor agronómico
del equipo (FastAPI, `POST /api/v1/evaluaciones`). Al terminar de dibujar una finca, el drawer se abre solo en esa
pestaña y el plan se genera sin otro toque. En una finca ya elegida, el botón dice "Generar plan de rotación de
cultivos".

## Flujo

```
teléfono                         Next (servidor)                          fuera
────────                         ───────────────                          ─────
1. POST /api/motor/zone  ──────▶ gatherZone(bbox) ─────────────────────▶ NASA POWER diario (por celda, caché 6 h)
   { geometry }                  pendiente SRTM del municipio (Colombia)
   ◀── MotorZone (90 días, resumen, pendiente)

2. POST /api/motor/plan  ──────▶ buildPayload → POST {MOTOR_API_URL}/api/v1/evaluaciones  (X-API-Key)
   { zone, cultivo, etapa,       normalizeMotor(registro) → MotorPlanBase
     síntomas, historial,        advisorPayload(registro, zona) → AgroAstro ───────────▶ Managed Agents (sesión,
     rastrojo, suelo, lugar }    informe Markdown → MotorPlan (plan + advisor)             web search)
   ◀── NDJSON: stage motor → stage advisor → activity… → plan | error
```

- El teléfono nunca llama al motor ni al agente: las URL y las claves viven solo en el servidor.
- **La salida del motor pasa por AgroAstro antes de servirse.** El teléfono solo recibe planes revisados; si el
  agente falla, recibe un error y puede reintentar (no se le muestra el plan sin revisar).
- El paso 1 va **antes** del motor, y la persona ve qué se pidió: "Datos de tu zona → Motor agronómico".
- Código:
  - Servidor: `src/server/motor/` (`zone.ts`, `client.ts`, `normalize.ts`, `mock.ts`).
  - Rutas: `src/app/api/motor/`.
  - Contrato zod: `src/lib/api/motor.ts`.
  - Catálogo y traducción de cultivos: `src/lib/motorCatalog.ts`.
  - Interfaz: `src/features/motor/`.

## La zona: los extremos de la finca, no el polígono

La zona es el rectángulo que forman los extremos del contorno: mínimo y máximo de longitud y de latitud.

- Se toman las 4 esquinas y el centro del rectángulo.
- Se buscan las celdas de NASA POWER que tocan esos puntos (rejilla de 0,5° × 0,625°).
- Si son varias celdas, para cada día y cada variable queda el **valor máximo**. Lo mismo pasa con la altura de la
  celda y con la pendiente de los municipios que tocan las esquinas.
- Una finca marcada como punto da un rectángulo de tamaño cero, con una sola muestra.

Datos de la zona:

| Dato | Fuente | Detalle |
| --- | --- | --- |
| Serie diaria de 90 días (hasta hace 3 días) | NASA POWER, comunidad AG | `T2M`, `T2M_MAX`, `T2M_MIN`, `RH2M`, `PRECTOTCORR`, `GWETROOT`, `GWETTOP`, `WS2M`, `ALLSKY_SFC_SW_DWN` |
| Resumen | Calculado de la serie | Temperatura y humedad de 7 días, lluvia de 7 y 30 días, último dato de humedad del suelo |
| Pendiente mediana y % de área plana | SRTM, por municipio | Zonas de riesgo en Google Earth Engine, solo Colombia. Si el set es sintético, se dice |

## Qué se le manda al motor

| Campo de la API | De dónde sale |
| --- | --- |
| `lat`, `lon` | Centro del rectángulo de la finca |
| `cultivo` | Lo que la persona marcó en "Afina tu plan". Si no marcó nada, el cultivo de este mes según "Tu rotación actual". Si no hay ninguno, no se manda |
| `etapa` | Solo si la persona la marca |
| `campo` | Solo lo medido u observado en el lote: `soil_ph`, `organic_matter`, `soil_texture` (de "Faltan datos") y `symptoms`. Los valores de NASA POWER **no** van aquí, para que el motor no los tome como medidos en el lote |
| `historial` | `[[último cultivo]]`. El último cultivo sale de "Afina tu plan"; si no, de la encuesta (`lastCrop`); si no, de la última temporada que terminó. Las tres hermanas se mandan como `["maiz","frijol","calabaza"]` |
| `rastrojo` | `incorporated` o `removed`. Sale de la encuesta: dejarlo en el lote = `incorporated`; sacarlo, quemarlo o darlo al ganado = `removed` |
| `serie_nasa_power` | La serie de la zona en el formato de la respuesta de NASA POWER: `properties.parameter.<PARAM>.<YYYYMMDD>`, con −999 para los huecos y GWET en fracción 0–1 |
| `referencia_cliente` | `fieldshift:<hash>`, un hash del id de la finca. Ese id lleva la geometría, así que no se manda tal cual |

Equivalencias entre los cultivos de la app y los del motor:

| App | Motor |
| --- | --- |
| maize | maiz |
| beans | frijol |
| squash | calabaza |
| cowpea | caupi |
| plantain | platano |
| sugarcane | cana_panelera |
| cualquier otro | otro |
| barbecho | no se manda |

### Escalera si el motor responde 422

El formato exacto de `serie_nasa_power`, `historial` y `rastrojo` está inferido del motor v2.1 y de la salida 4.1.0.
Para que un formato distinto no deje a la persona sin plan, se reintenta así:

1. **Todo** lo de la tabla.
2. Si responde 422: **sin la serie diaria**.
3. Si vuelve a responder 422: **lo mínimo** (`lat`, `lon`, `cultivo`, `etapa`).

El plan dice en `accepted` qué escalón entró, y la interfaz lo avisa. En el log del servidor queda dónde falló cada
422 (`loc` y `msg`, sin el valor). Un 500 o un timeout de 25 s no se reintentan.

## Qué ve la persona

Normalización: `normalizeMotor` toma la salida 4.x completa (o el registro con `resultado`) y es defensiva. Lo que no
entiende lo omite y nunca inventa datos.

En la pestaña, de arriba hacia abajo:

1. **Progreso**: los dos pasos, con lo que se pidió en cada uno.
2. **Riesgo general**: `risk_overview.overall`, con ícono y texto (no depende solo del color) y el recordatorio de
   que es un riesgo, no un diagnóstico.
3. **Qué sembrar después**: `rotation.candidates`, ordenados de recomendada a no recomendada.
   - Se ven 3; el resto queda plegado.
   - Cada opción trae su razón principal y, en "Por qué", lo que bloquea, lo que va en contra, lo que favorece y lo
     que falta.
   - Sin historial (`sin_historial`), el motor no evalúa la rotación. En su lugar aparece la pregunta "¿Qué sembraste
     la última vez?": un toque regenera el plan.
4. **Lo que encontramos**: `inference.findings`.
   - Cada hallazgo muestra su prioridad, su **certeza** (`certainty.level`), qué hacer y su porqué (variable,
     valor, umbral, fuente, periodo y calidad del dato).
   - También muestra las referencias y si el umbral no está calibrado para la zona.
   - Los hallazgos reemplazados o integrados en otro solo aparecen como contexto.
5. **Afina tu plan**: cultivo de hoy, etapa, síntomas (filtrados por cultivo), último cultivo y rastrojo.
   - Se guarda por finca en `localStorage` (`fieldshift:motor:v1`).
   - El plan se regenera con un botón, porque cada plan es una fila en la base del motor.
6. **Prácticas sugeridas**: `practices`, ordenadas por relevancia.
7. **Lo que falta saber**: reglas revisadas y no revisadas, los datos que más reglas habilitarían, la edad de los
   datos del territorio y qué verificar antes de decidir.
8. **Qué datos usó el motor**: el rectángulo, el periodo y las celdas de NASA POWER, los valores, lo que contó la
   persona, la celda del motor y el número de evaluación.
9. **Ten en cuenta**: los avisos globales del motor, y el recordatorio de que la herramienta apoya pero no reemplaza
   el criterio de la persona ni al técnico.

## Revisión de AgroAstro (agente de Claude)

AgroAstro es un agente de Managed Agents del equipo: Claude Opus 5.5, esfuerzo bajo, con herramientas y búsqueda
web, red sin restricciones. Su prompt pide un informe en Markdown de hasta 600 palabras con: decisión principal,
qué recomiendo, por qué, dónde comercializar, alternativas, qué hacer ahora, riesgos y fuentes. También le pide no
inventar precios, compradores, dosis ni rendimientos. Código: `src/server/motor/advisor.ts`.

1. **Qué recibe.** `Genera una recomendación para este JSON: {…}`. El JSON es la salida del motor recortada:
   - Se quita lo que es contabilidad interna: los hashes del bundle, la lista de reglas omitidas (se resume en
     conteos y variables faltantes), los ids de afirmaciones y las orientaciones genéricas repetidas por cultivo.
   - Se agrega `context.municipio` y `zona_finca`, con el resumen de NASA POWER de la zona y su periodo.
   - Baja de unos 115 KB a unos 25 KB.
2. **Sesión.** Una sesión por revisión: se abre el stream, se manda el mensaje y se lee hasta `session.status_idle`
   con `end_turn`.
   - El informe es el texto que el agente escribe después de su última herramienta. Los bloques de un mensaje con
     citas se pegan sin separador.
   - Si una herramienta pide confirmación (`evaluated_permission: ask`), se niega: nadie supervisa la sesión.
   - Límite de 4 min: al agotarse se manda `user.interrupt` para que deje de gastar.
   - Las sesiones no se borran ni se archivan; quedan en la consola de Claude.
3. **Informe para el teléfono.** Las tablas se vuelven listas: el teléfono no tiene `remark-gfm`, y en 360 px una
   lista se lee mejor. Las URL sueltas se vuelven enlaces `<https://…>`. Se muestra arriba de la pestaña, con un
   botón para escucharlo y el aviso de confirmar precios y compradores.
4. **Caché.** El mismo JSON da la misma revisión durante 30 min, en memoria del servidor: dos pedidos iguales
   comparten una sesión.
5. **Progreso.** La ruta responde NDJSON (`MotorStreamEvent`), y la interfaz muestra un tercer paso, "AgroAstro,
   asesor con IA", con las consultas web que va haciendo.
   - `stage: motor`, luego `stage: advisor`, y `activity` por cada herramienta que usa el agente.
   - `ping` cada 15 s, para que la conexión no se corte mientras investiga.
   - Al final llega `plan` (ya revisado) o `error`.
   - En la prueba real (Abriaquí): 30 s y 2 búsquedas.
6. **Sin agente.** Sin `ANTHROPIC_API_KEY`, o con `AGENT_FORCE_MOCK=true` (los e2e), se usa un asesor de ejemplo,
   marcado `source: "mock"`. Arma el informe solo con lo que dijo el motor, sin precios ni compradores.
7. **Costo.** Cada plan generado abre una sesión del agente, que se cobra a la cuenta de `ANTHROPIC_API_KEY`.
   Eso incluye el plan que arranca solo al dibujar una finca y cada "Generar de nuevo". Las búsquedas web suman a
   ese costo.

## Variables de entorno (solo servidor)

| Variable | Para qué |
| --- | --- |
| `MOTOR_API_URL` | Base del servicio, por ejemplo `https://<servicio>.up.railway.app`. Sin ella se responde un **ejemplo** basado en una salida real 4.1.0 (Antioquia), marcado `source: "mock"`. La interfaz lo avisa |
| `MOTOR_API_KEY` | Si el motor define `API_KEY`, va en la cabecera `X-API-Key`. Como la llamada sale del servidor de Next, la clave no queda expuesta |
| `MOTOR_FORCE_MOCK` | `true` usa el ejemplo aunque haya URL. Los e2e lo usan para no guardar filas en la base del motor |
| `ANTHROPIC_API_KEY` | La misma del chat. La usa AgroAstro (Managed Agents) |
| `AGROASTRO_AGENT_ID`, `AGROASTRO_ENVIRONMENT_ID` | Opcionales. Por defecto, `agent_01TLP7dJ64Hy5JgVEH4DdwHL` y `env_015T37KfLibazqNiZMNJqPuF` |

En Vercel, la ruta `/api/motor/plan` declara `maxDuration = 300`, porque el agente investiga en la web.

En Vercel: agregar `MOTOR_API_URL` y `MOTOR_API_KEY` en Production y Preview.

El CORS del motor no hace falta para este flujo, porque el navegador nunca lo llama directo.

## Preguntas abiertas para el backend

Hay que confirmarlas con el `schemas.py` o con un ejemplo real de la API. Si alguna cambia, se ajusta en
`src/server/motor/client.ts` y en `src/lib/motorCatalog.ts`.

1. **`serie_nasa_power`**: ¿espera la respuesta cruda de POWER (`properties.parameter`), como se manda hoy, o una
   lista de días ya normalizada? ¿Con qué parámetros?
2. **`historial`**: ¿una lista de ciclos con el más reciente primero, cada ciclo una lista de claves? ¿Acepta
   `platano` y `tres_hermanas`?
3. **`rastrojo`**: ¿`incorporated`/`removed` (los valores del motor) o palabras en español?
4. **Encharcamiento y abono con nitrógeno** (`waterlogging_prone`, `recent_n_fertilization`): ¿en qué campo van? La
   app ya pregunta por el drenaje y por el abono.
5. **Envoltura del registro**: ¿`{ id, created_at, ..., resultado }`? Se lee `resultado` (o `result`, `salida`,
   `output`) y, si no está, el cuerpo entero.
6. **Cobertura**: ¿qué responde para un punto fuera del índice territorial (fuera de Antioquia o de Colombia)? Hoy la
   interfaz muestra "puede que tu lote quede fuera de su cobertura" si los tres escalones dan 422.
7. **`GET /api/v1/catalogo`**: ¿qué forma tiene? Hoy el catálogo está fijo en `src/lib/motorCatalog.ts`.

## Pruebas

- `src/server/motor/zone.test.ts` cubre:
  - el rectángulo y las celdas de POWER;
  - el máximo entre celdas;
  - qué pasa si POWER no responde.
- `src/server/motor/motor.test.ts` cubre:
  - la normalización de la salida real 4.1.0 y de una salida incompleta;
  - el ejemplo sin historial;
  - el payload;
  - la escalera con 422;
  - que un 500 no se reintenta.
- `src/server/motor/advisor.test.ts` cubre:
  - el JSON recortado, con el municipio;
  - las tablas que se vuelven listas y las URL que se vuelven enlaces;
  - que el informe es el texto posterior a la última herramienta;
  - la negación de herramientas que piden confirmación;
  - el error si el agente se niega o no deja informe;
  - que dos pedidos iguales comparten una sesión.
- e2e `e2e/field.spec.ts`: al dibujar se abre "Recomendación" y aparece "Tu plan de rotación".
