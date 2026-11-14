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
  emisora (la más cercana al centro), suena una estática breve generada con Web Audio y sigue reproduciendo.
- Media Session: título, emisora y controles en la pantalla bloqueada.
- Baja el volumen (ducking) mientras el asistente responde.
- Antes de la demo: revisar que los audios IA tengan derechos de uso.
