# Contrato del agente de IA (n8n)

El frontend nunca llama a n8n directamente. El navegador envía la pregunta a nuestro route handler
**`POST /api/agent`**, que la reenvía al webhook de n8n y valida la respuesta. Esquemas zod:
`AgentRequest`, `AgentResponse` y `AgentAction` en [`src/lib/api/contract.ts`](../src/lib/api/contract.ts).

## Configuración (variables solo de servidor)

| Variable | Uso |
|---|---|
| `N8N_WEBHOOK_URL` | URL del webhook (nodo **Webhook** → **AI Agent** → **Respond to Webhook**). Sin ella responde un agente mock local. |
| `N8N_WEBHOOK_SECRET` | Se envía en el header `X-FieldShift-Secret`. En n8n, valida ese header en el nodo Webhook (Header Auth). |
| `N8N_STREAMING` | Reservado. Hoy se responde JSON completo; el streaming se activará detrás de este flag. |

Límites del proxy: 30 s de timeout, 20 preguntas por minuto por IP, entrada y salida validadas. La URL y el
secreto nunca llegan al navegador ni a los logs.

## Request que recibe n8n

```json
{
  "sessionId": "b6c1f3c2-6a1f-4c5e-9a9b-2f5f0e0c1d22",
  "message": "Muéstrame la humedad del suelo en el Valle del Cauca",
  "locale": "es",
  "userLocation": { "lat": 4.71, "lon": -74.07, "accuracy": "ip", "city": "Bogotá", "country": "CO" },
  "view": {
    "center": [-75.68, 4.53],
    "zoom": 6.2,
    "activeLayerId": "rain",
    "layerDate": "2026-11-10",
    "openRegionId": "cell:4.53,-75.68",
    "fieldId": "p:{ltZrqnmMuAgo@vi@uAjDfo@",
    "when": "2026-05"
  },
  "history": [
    { "role": "user", "content": "¿Cómo está la lluvia en mi zona?" },
    { "role": "assistant", "content": "Llovió un 20 % menos de lo normal en el último mes…" }
  ],
  "profile": { "role": "farmer", "mode": "lite", "narrator": true }
}
```

- `userLocation` puede ser `null` (la persona no compartió ubicación y falló la IP).
- `history`: últimos 10 mensajes de la sesión. `sessionId` sirve para la memoria del agente en n8n.
- `view` describe lo que la persona está viendo: úsalo para entender "aquí", "esta capa", "mi finca".
- `view.when` (opcional): la **máquina del tiempo** está activa en esa fecha pasada (`YYYY-MM` o `YYYY-MM-DD`).
  Responde sobre ese periodo salvo que la persona pregunte por otro.
- `view.missingData` (opcional): datos de la finca que el análisis **todavía no tiene** y los satélites no ven, en
  orden de importancia: `current-rotation` (qué siembra hoy), `soil-type` (arenosa, franca, arcillosa…),
  `irrigation` (si puede regar), `drainage` (si se encharca después de un aguacero), `soil-test` (pH y materia
  orgánica de laboratorio). Si la persona pide una recomendación, una rotación o "qué sembrar" y la lista no está
  vacía: **primero pregunta** 1–3 de esos datos en palabras simples, explica en una frase por qué cambian el
  consejo, añade la acción `askForData` con el primero y da solo consejos generales hasta que responda. Nunca
  supongas esos valores.
- `profile` (opcional): quién pregunta y cómo ve la app, según las preguntas de inicio y Ajustes. **Adapta la
  respuesta**:
  - `role`: `farmer` (palabras simples) o `technician` (agrónomo o extensionista: puedes usar términos técnicos,
    misión, unidades y resolución). Puede faltar si la persona saltó las preguntas.
  - `mode`: `lite` (modo sencillo: unas 60 palabras como máximo, una idea principal, listas de 3 o menos, sin
    tablas) o `full`.
  - `narrator`: `true` si la respuesta se leerá en voz alta con la voz del teléfono. Escribe para oír: sin tablas,
    símbolos, emojis ni abreviaturas ("milímetros", no "mm").

## Response que debe devolver n8n

```json
{
  "reply": "**Más seco que lo normal** en el Valle del Cauca (SMAP, 8 nov 2026).\n\nTe muestro la capa de humedad del suelo.",
  "actions": [
    { "type": "flyTo", "lat": 3.75, "lon": -76.3, "zoom": 7.2, "label": "Valle del Cauca" },
    { "type": "setLayer", "layerId": "soil-moisture", "date": "2026-11-08" },
    { "type": "openRegion", "lat": 3.75, "lon": -76.3, "name": "Valle del Cauca, Colombia" }
  ],
  "sources": [{ "dataset": "SMAP L4 Root Zone Soil Moisture", "date": "2026-11-08", "url": "https://nsidc.org/data/spl4smgp" }],
  "suggestions": ["¿Y la lluvia del último mes?", "¿Qué rotación me conviene si sigue seco?"]
}
```

- `reply`: markdown simple (negritas, listas, enlaces). **No uses HTML**: se elimina al renderizar.
- `actions` (opcional): se ejecutan en este orden aunque lleguen mezcladas: primero `flyTo`/`fitBounds`
  (se espera a que termine el vuelo), luego `clearLayers` y `setTime`, `setLayer`, `highlightArea`, `openRegion`,
  `showStrategies`/`askForData` y `playRadio`. Las acciones desconocidas o mal formadas se ignoran sin romper la respuesta.
- `sources` (opcional): se muestran como chips bajo la respuesta.
- `suggestions` (opcional, máx. 4): preguntas rápidas para seguir.

El proxy también acepta las formas habituales de n8n y las normaliza: `[ {…} ]`, `{ "output": {…} }` o
`{ "output": "<json como texto>" }`. Si el texto no es JSON, se muestra como `reply` sin acciones.

### Acciones disponibles

| Acción | Campos | Qué hace |
|---|---|---|
| `flyTo` | `lat`, `lon`, `zoom?`, `label?` | Vuela a un punto. Si solo mandas `label`, el cliente lo geocodifica (MapTiler/Nominatim). |
| `fitBounds` | `bbox: [oeste, sur, este, norte]` | Encuadra un área. |
| `setLayer` | `layerId`, `date?`, `opacity?`, `risk?` | Activa una capa NASA. `layerId` ∈ `ndvi`, `soil-moisture`, `rain`, `lst-day`, `lst-night`, `evap`, `groundwater`, `relief`, `risk`. La fecha se ajusta a la válida más cercana. `risk` (solo con `layerId: "risk"`, zonas de riesgo de Colombia) ∈ `all`, `drought`, `water`, `heat`, `soil`; por defecto `all`. Con la capa `risk` activa, un `openRegion` en Colombia abre el municipio, y su panel muestra el riesgo y los cambios del terreno (docs/terrain-risk.md). |
| `clearLayers` | — | Quita las capas de datos. |
| `openRegion` | `lat`, `lon`, `name?` | Abre el drawer de región con los sensores NASA. |
| `highlightArea` | `geojson` | Dibuja un contorno luminoso (GeoJSON en EPSG:4326). |
| `showStrategies` | `fieldId?` | Abre el análisis de rotaciones de la finca seleccionada. |
| `askForData` | `need?` (uno de `view.missingData`) | Abre las preguntas rápidas "Faltan datos para completar tu análisis" en ese dato. Solo si hay finca (`view.fieldId`). No la combines con `openRegion` ni `showStrategies`: se abren del mismo lado. |
| `playRadio` | `stationId?` | Sintoniza y reproduce la radio del campo. |
| `setTime` | `when: "YYYY-MM" \| "YYYY-MM-DD" \| null` | Máquina del tiempo: lleva toda la app (capas, drawer de región, panel de la finca) a esa fecha pasada; `null` vuelve a hoy. Hay datos diarios desde 1981 y con ~3 días de retraso. Ejemplo: "¿cómo llovió en mayo?" → `setTime "2026-05"` + `setLayer rain`. |
| `showEvents` | `on?: boolean`, `kind?` (`landslide`, `flood`, `storm`, `wildfire`, `drought`, `frost`, `erosion`, `earthquake`, `volcano`, `other`) | Muestra (u oculta) los eventos y emergencias en el globo: NASA EONET, UNGRD (Colombia) y reportes de la comunidad, del periodo de `view.when` o de los últimos 90 días. Ver [`events.md`](events.md). |
| `reportEvent` | `kind?`, `lat?`, `lon?` | Abre el formulario "Reportar un evento" con esos datos. **Solo lo abre**: la persona revisa y decide si lo envía. Si hay personas en peligro, la respuesta debe decir primero que llamen al 123. |
| `showListings` | `on?: boolean`, `listingId?` | Muestra (u oculta) las **fincas que venden** en Colombia; con `listingId` abre la tarjeta de esa publicación. Nunca compartas teléfonos: el comprador usa el botón de WhatsApp de la app. Ver [`listings.md`](listings.md). |
| `agroReport` | `lat?`, `lon?`, `name?`, `when?` (`YYYY-MM`) | Prepara el informe agroclimático imprimible y en CSV de esa zona (sin `lat/lon`: la que se ve después del vuelo) para ese mes, el mes de `view.when` o los últimos 30 días. El chat muestra el botón "Abrir el informe". Úsala cuando pidan un informe, exportar o descargar datos, un PDF o un CSV. |

## Recomendaciones para el flujo en n8n

1. En el nodo **AI Agent**, activa *Require Specific Output Format* (structured output) con este JSON Schema:
   `reply` (string, requerido), `actions` (array), `sources` (array), `suggestions` (array de strings).
2. Pon en el prompt del sistema: las capas disponibles y sus `layerId`, que responda en el `locale` recibido,
   con frases cortas para agricultores, citando la fuente NASA y la fecha del dato, y que nunca invente valores.
3. Geocodificación: puedes resolverla en n8n (devolver `lat`/`lon`) o mandar solo `label` y dejar que el
   cliente la resuelva. Ambas funcionan.
4. Si consultas mucha data, responde en menos de ~30 s. Cuando habilitemos streaming, envía primero las
   acciones del globo y luego el texto.
5. Ten presente el aviso que ve la persona: *"Respuestas generadas por IA con datos NASA. Verifica decisiones
   importantes con un técnico local."*

## Modo Claude (sin n8n)

Si no hay `N8N_WEBHOOK_URL` pero sí `ANTHROPIC_API_KEY` (en `.env.local` o en las variables del servidor),
`/api/agent` responde con Claude (`src/server/claudeAgent.ts`), con este mismo contrato:

- Modelo `claude-opus-5-5`, esfuerzo `low` (chat rápido) y *fallback* del servidor ante rechazos
  (`server-side-fallback-2026-07-01`, `fallbacks: "default"`).
- Tool runner del SDK con cinco herramientas: `get_region_data` (resumen de sensores; lluvia y temperatura reales
  de NASA POWER, el resto simulado y marcado), `get_events` (eventos y emergencias), `geocode` (MapTiler o
  Nominatim), `get_market` (precios SIPSA, rendimientos EVA, crédito Finagro y conclusión del departamento; solo
  Colombia) y `find_listings` (fincas que venden, sin teléfonos).
- El `profile` de la request va en el bloque `<context>`; el prompt del sistema explica cómo adaptar la respuesta.
- Salida estructurada con JSON Schema (`reply`, `actions`, `sources`, `suggestions`), validada otra vez con zod.
- Latencia medida: ~12 s en caliente (geocodificar + datos de la región + respuesta).
- Si Claude falla (red, límite de uso), responde el agente mock para que la demo no se quede colgada.
- `AGENT_FORCE_MOCK=true` desactiva Claude (lo usan los e2e para no gastar la clave).

La respuesta lleva el header `X-Agent: n8n | claude | mock` para saber quién contestó.

## Perfil de inicio: `POST /api/profile`

Al entrar, la app hace 3 preguntas con íconos grandes (se pueden responder sin leer, con la voz del teléfono):
rol (`farmer` / `technician`), qué quiere hacer hoy (`climate` / `rotations` / `satellite`) y cómo prefiere la
información (`listen` / `little` / `detail`). Esta ruta las recibe y **sugiere** cómo mostrar la app; la persona ve
la sugerencia (marcada "Sugerencia de la IA" o "Sugerencia automática") y la confirma o la cambia.

```json
// request
{ "answers": { "role": "farmer", "goal": "climate", "reading": "listen" }, "locale": "es" }
// response (ProfileSuggestion en contract.ts)
{
  "role": "farmer", "mode": "lite", "narrator": true,
  "welcome": "Hola. Te mostramos cómo están la lluvia, el suelo y tus cultivos, con palabras sencillas.",
  "reasons": ["Elegiste escuchar: la voz te leerá lo importante.", "Empezamos por el clima de tu zona."],
  "suggestions": ["¿Cómo está la lluvia en mi zona?", "¿Está seco el suelo en mi zona?"],
  "firstStep": "myArea", "source": "claude"
}
```

- Orden: Claude (`src/server/claudeProfile.ts`, `claude-opus-5-5`, esfuerzo `low`, salida estructurada, 8 s) →
  reglas locales (`src/features/onboarding/rules.ts`). Header `X-Profile: claude | rules`. 10 peticiones por minuto por IP.
- La IA no decide el rol (lo dijo la persona) y si pidió escuchar la voz queda encendida y el modo es `lite`.
- `firstStep`: `myArea` (abre el panel de su zona), `myFarm` (modo "elegir mi finca"), `layers` (catálogo de capas)
  o `explore`. `suggestions` reemplazan las preguntas iniciales del chat.
- Si la ruta falla o tarda más de 9 s, el cliente usa las mismas reglas: nadie se queda esperando.

## Probar sin n8n

Sin `N8N_WEBHOOK_URL`, `src/mocks/agent.ts` reconoce frases como "muéstrame la humedad del suelo en el Punjab",
"¿cómo estará la lluvia en mi zona este mes?" o "¿qué rotación me conviene si hay sequía?" y devuelve el
mismo contrato.

```bash
curl -X POST http://localhost:3000/api/agent -H 'Content-Type: application/json' \
  -d '{"sessionId":"demo-session-1","message":"muéstrame la humedad del suelo en el Punjab","locale":"es","userLocation":null,"view":{"center":[0,0],"zoom":2},"history":[]}'
```

## Mercado y fincas que venden (Colombia)

Si el flujo de n8n quiere responder sobre precios o compra/venta, puede llamar a nuestras rutas públicas:
`GET /api/market?lat&lon&locale&products` (precios mayoristas SIPSA, tendencia, oferta, rendimiento EVA, crédito Finagro y
la conclusión del departamento) y `GET /api/listings?product&bbox` (sin teléfonos). Reglas para el prompt de n8n:
citar "DANE SIPSA" y el mes, decir que son precios mayoristas (en finca pagan menos, sin descontar costos), advertir la
sobreoferta cuando muchos siembran lo mismo y, para comprar, añadir `showListings`. El prompt del AI Agent de n8n se
actualiza en n8n (no vive en este repo).
