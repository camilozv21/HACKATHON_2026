# Radio del campo: cómo agregar los audios generados con IA

La radio es un mock: emisoras y segmentos viven en [`src/mocks/radio.json`](../src/mocks/radio.json) y se
sirven con dos route handlers:

- `GET /api/radio/stations?lat&lon` → emisoras ordenadas por cercanía (la nacional, sin ubicación, al final).
- `GET /api/radio/stations/:id/segments` → segmentos de la emisora (más los de la nacional como relleno).

Mientras no existan los mp3, el reproductor **lee la transcripción con la voz del dispositivo**
(`speechSynthesis`) y lo indica en la vista expandida ("Audio IA pendiente"). Si el navegador no tiene voz,
muestra "Aún no hay audios para esta emisora" y no falla.

## Formato de los archivos

| | |
|---|---|
| Carpeta | `public/audio/` (se sirven como `/audio/<archivo>`) |
| Formato | MP3 (CBR 128 kbps) o M4A/AAC |
| Muestreo | 44.1 kHz, **mono** |
| Volumen | normalizado a **-16 LUFS** integrado, pico real ≤ -1 dBTP |
| Duración | 15–40 s por segmento (anuncio ≤ 20 s) |
| Nombre | `ejemplo-<emisora>-<n>.mp3` para los de ejemplo; cualquier nombre si actualizas `audioUrl` |

Normalizar con ffmpeg:

```bash
ffmpeg -i entrada.wav -ac 1 -ar 44100 -af loudnorm=I=-16:TP=-1:LRA=11 -b:a 128k public/audio/ejemplo-quindio-1.mp3
```

## Formato de un segmento

```json
{
  "id": "qui-1",
  "type": "alert",
  "title": "Lluvias fuertes en octubre y noviembre",
  "audioUrl": "/audio/ejemplo-quindio-1.mp3",
  "durationSec": 30,
  "transcript": "Texto exacto que dice el audio (accesibilidad y voz de respaldo).",
  "regionId": "quindio",
  "relatedLayerId": "rain",
  "dataSource": "GPM"
}
```

- `type`: `ad` (anuncio; se etiqueta siempre como **Anuncio** y debe llevar `sponsor`), `alert` o `tip`.
- `transcript`: obligatorio y fiel al audio: es la alternativa accesible.
- `relatedLayerId` (opcional): muestra "Ver en el mapa" y activa esa capa NASA (`ndvi`, `soil-moisture`, `rain`,
  `lst-day`, `lst-night`, `evap`, `groundwater`, `relief`).
- `dataSource` (opcional, en consejos/alertas): fuente NASA del dato que se menciona (`SMAP`, `GPM`, `MODIS`,
  `GRACE`, `NASA POWER`…).
- `regionId`: id de la emisora. Con `"destacado"` el segmento suena **primero en todas las emisoras**
  (así está `public/audio/radio-campo-1.mp3`, el audio del equipo; falta su transcripción).

Los esquemas zod están en `src/lib/api/contract.ts` (`RadioStation`, `RadioSegment`).

## Comportamiento

- Nunca suena sola al cargar: el primer play requiere un toque. Después, al mover el globo y cambiar de
  emisora, suena una estática breve generada con Web Audio y la nueva emisora sigue sola.
- Al empezar una emisora, la radio se identifica en voz ("Estás escuchando Radio Campo Salento, 101.3 FM")
  mientras llega el programa del día. Esa frase va dentro del toque, como piden los navegadores para hablar.
- Media Session: título, emisora y controles en la pantalla bloqueada.
- Baja el volumen (ducking) mientras el asistente responde; se pausa si el locutor de la app empieza a leer.
- Antes de la demo: revisar que los audios IA tengan derechos de uso.

## Programa del día (todo gira alrededor de la radio)

Cada emisora con lugar tiene un **boletín hecho con los datos de ese punto**, que suena antes de los segmentos
grabados. Bloques, en orden (`RADIO_TOPICS`): bienvenida, lluvia y temperatura, humedad del suelo, verdor,
eventos cerca, riesgo del terreno, precios, consejo y cierre. Fuera de Colombia no hay terreno ni precios; en
modo sencillo es más corto, pero nunca quita riesgos, confianza ni avisos.

```
GET /api/radio/program?lat&lon[&name][&station][&locale][&role][&mode][&units][&quick=1]
→ RadioProgramResponse { station, place, segments, generatedAt, by: 'claude' | 'rules', pending? }
```

| Paso | Dónde | Qué hace |
|---|---|---|
| Datos | `src/server/radio/facts.ts` | NASA POWER (lluvia y temperatura reales), tarjetas de sensores (las simuladas van marcadas), EONET + UNGRD + comunidad (50 km, 90 días), zona de riesgo del municipio (GEE + Markov) y mercado SIPSA (Colombia). Cada fuente con tope de 3–6 s; guardado 10 min. |
| Guion de plantillas | `src/server/radio/script.ts` | Frases cortas para oír (sin "mm" ni "%"), con fuente, fecha, confianza, vacío de información y "dato de demostración" dichos en voz. Pistas sobre el globo por frase. |
| Voz de locutor | `src/server/radio/claudeScript.ts` | Claude (`claude-opus-5-5`, esfuerzo bajo, salida JSON) reescribe solo el texto. Si un bloque trae un número que no estaba en el borrador, se descarta y suena el de plantillas. |
| Orden | `src/server/radio/program.ts` | Con `quick=1` responde enseguida con plantillas (`pending: true` si Claude puede mejorarlo, o la versión de Claude si ya estaba escrita); sin `quick`, Claude la escribe. Una llamada a Claude por emisora, hora, idioma, rol, modo y unidades (caché de una hora). Sin `ANTHROPIC_API_KEY` (o con `AGENT_FORCE_MOCK=true`), solo plantillas. |

En el cliente (`src/features/radio/programClient.ts`): al tocar play se pide el programa (máximo 9 s de espera,
con la identificación sonando); entra **delante** de lo grabado si la radio no suena, o justo después del
segmento actual si ya suena. Si la persona sigue en la emisora a los 4 s, se pide la versión de Claude y se
cambian los bloques que aún no sonaron (mismo id). Así no se gasta IA en cada emisora que se cruza al pasear.

## Emisoras de la zona

Si bajo la mira no hay una emisora fija cerca (el radio de sintonía se achica con el zoom) y se mira un lugar con
nombre (zoom ≥ 4,5), la radio arma **la emisora de esa zona** (`src/features/radio/local.ts`): celdas de 0,25°,
id `local:<lat>,<lon>`, frecuencia FM estable entre 88.1 y 107.9 y nombre "Radio Campo <lugar>". La UI aclara que
la arma la app con datos (no es una emisora real). Su relleno grabado es el de la emisora nacional.

## La radio mueve el globo (pistas)

Cada bloque trae `cues: [{ sentence, action }]` con las mismas acciones del agente (`flyTo`, `setLayer`,
`clearLayers`, `openRegion`, `showEvents`, `showListings`; nunca formularios). Cuando el locutor llega a esa
frase, `src/features/radio/cues.ts` las ejecuta con el ejecutor del agente:

- Si la persona toma el mapa (arrastra, hace zoom, busca, el asistente vuela), la radio sigue hablando pero deja
  de moverlo hasta que toque **Seguir a la radio**. "La radio mueve el mapa" se puede apagar (se recuerda).
- Mientras la radio maneja el mapa, sus vuelos no cambian de emisora.
- En el teléfono no abre el panel de la región (taparía el reproductor): queda el botón "Ver la zona".
- Un vuelo a donde ya se mira se omite; con `prefers-reduced-motion` la cámara salta sin animación.

## Subtítulos y "¿qué es esto?"

El guion se lee **frase por frase** (`src/features/radio/sentences.ts`): el mini reproductor muestra la frase que
suena y, si nombra un término técnico (NDVI, humedad del suelo, zona de riesgo…; `terms.ts`), ofrece su
"¿qué es esto?" del glosario. Expandido: la transcripción completa (tocar una frase la repite desde ahí), fuente
con fecha, confianza, lo que el dato no dice, si es de demostración y si el texto lo escribió la IA o las
plantillas. Al pausar se retoma desde la misma frase. En un mp3, la frase se estima por su largo.

El asistente también pone la radio: "ponme el boletín de Salento" → `flyTo` + `playRadio { lat, lon, name }`.
