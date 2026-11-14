# Rendimiento del globo (Fase 3)

Objetivo: 60 fps en un Android de gama media, primer JS < 150 KB gz y Lighthouse móvil ≥ 85.

## Cómo medir

```bash
pnpm build && pnpm start --port 3100        # en otra terminal
node scripts/measure-perf.mjs http://localhost:3100 --cpu=4   # Pixel 7 + CPU 4x (CDP)
node scripts/bundle-size.mjs http://localhost:3100/es         # JS inicial (gzip)
pnpm e2e                                                      # Playwright, Pixel 7
```

- `?debug=1` muestra en pantalla fps, tiles pedidos por red (y MB), tiles listos/errores, memoria JS, pixelRatio y zoom.
  Escribe en el DOM cada 500 ms, sin re-renders de React. También expone `window.__fieldShiftPerf.measureFps(ms)`.
- `?savedata=1` fuerza el modo ahorro de datos (solo GIBS, pixelRatio 1).
- `measure-perf.mjs` usa Chromium headless con GPU (ANGLE/D3D11 en la máquina de medición: RTX 3060 Ti),
  emulación **Pixel 7** (DPR 2.625) y **CPU 4× más lenta**. Escenarios: rotación del globo 5 s, vuelo a una finca
  (Quindío, z14, 4 s) y paneo continuo 4 s.

## Resultados (11-nov-2026)

### fps (Pixel 7 emulado, CPU 4×)

| Escenario | Antes | Después |
|---|---|---|
| Rotación del globo | 60.1 fps (p95 16.8 ms) | 59.7 fps (p95 16.8 ms) |
| **Vuelo a una finca (z14)** | **39.5 fps (p95 50 ms)** | **56.7 fps (p95 16.8 ms)** |
| Paneo a zoom de finca | 60.3 fps | 60.1 fps |
| Tiles pedidos durante el vuelo | 165 | 146–156 |
| pixelRatio | 2.625 | 2 |
| Heap JS | 11 MB | 10 MB |
| Tiempo hasta globo cargado | 2.3 s | 2.0 s |
| Errores de consola | 0 | 0 |

### JS inicial de `/es` (gzip, sin `nomodule`)

| Paso | Total |
|---|---|
| Inicial (TanStack + zod + intl-messageformat en el bundle) | 195 KB |
| Mensajes ICU precompilados (next-intl `precompile`) + `zod/mini` | 172 KB |
| TanStack Query fuera del layout + esquema de `/api/locate` en chunk diferido | **149 KB** |

El piso del framework (React DOM 19 + runtime de Next 16) es ~133 KB. MapLibre (~280 KB gz) **no** está en el JS
inicial: se descarga con `next/dynamic` después del skeleton.

### Lighthouse móvil (13.6, throttling simulado, `/es`)

| Métrica | Antes | Después |
|---|---|---|
| **Performance** | **42** | **76–78** |
| First Contentful Paint | 3.3 s | 0.8 s |
| Largest Contentful Paint | 6.4 s | 0.8 s |
| Total Blocking Time | 1 140 ms | 760 ms |
| Cumulative Layout Shift | 0.001 | 0.002 |
| Speed Index | 6.0 s | 4.0–5.9 s |
| Accesibilidad / Buenas prácticas | 100 / 96 | 100 / 96 |

**Pendiente:** Lighthouse ≥ 85. Lo que queda es TBT: la evaluación del módulo de MapLibre y la inicialización de
WebGL son tareas largas que no se pueden partir desde fuera, y Lighthouse las multiplica ×4. Ideas si hace falta
más: posponer la creación del mapa hasta la primera interacción en conexiones lentas, o servir una imagen estática del
globo como LCP y arrancar WebGL después de `load`. Hay que validarlo en un Android real antes de sacrificar
la experiencia de apertura.

## Qué se hizo

1. **pixelRatio** = `min(devicePixelRatio, 2)`; 1.5 si `deviceMemory ≤ 4` o `hardwareConcurrency ≤ 4`; 1 con ahorro de datos.
2. **Tiles:** `maxTileCacheSize` 280 (120 en gama baja), `fadeDuration` 100 ms, `raster-fade-duration` 120–150 ms,
   `cancelPendingTileRequestsWhileZooming`, `maxzoom` por fuente según el GetCapabilities de GIBS
   (Blue Marble L8, VIIRS L9) y `minzoom` en la satelital/relieve para no pedir tiles invisibles con el globo completo.
3. **Pausas:** la rotación automática se detiene con la pestaña oculta (`visibilitychange`) y cuando un panel tapa el
   globo (`setGlobeOccluded()` en `src/features/globe/runtime.ts`). Sin rotación, MapLibre no repinta.
4. **Prefetch:** al iniciar un `flyTo` se precargan en la caché HTTP los tiles satelitales del destino a zoom final
   (solo Esri/MapTiler; GIBS responde `Cache-Control: no-store`).
5. **Code splitting:** MapLibre, el overlay de depuración y el esquema zod de `/api/locate` van en chunks dinámicos;
   TanStack Query solo envuelve paneles cargados bajo demanda (`src/lib/query/client.tsx`).
6. **Primer pintado:** skeleton del globo en SVG y texto de la mira pintados desde el HTML del servidor (FCP/LCP sin
   esperar WebGL). El mapa se crea en `requestIdleCallback`; etiquetas, color real y rotación se añaden tras el primer
   `idle`. La animación del skeleton se detiene al ocultarse (antes forzaba ~2.5 s de Style & Layout).
7. **WebGL:** `webglcontextlost/restored` muestran "Recuperando el globo…" (MapLibre restaura solo). Sin WebGL se
   muestra una vista 2D (NASA GIBS WMS, Blue Marble) con un mensaje amable.
8. **Gestos:** `touch-action: none` solo sobre el canvas; `overscroll-behavior: none` en `body`; sin pitch con dos dedos
   (`touchPitch: false`); doble toque para acercar (comportamiento por defecto de MapLibre).
9. **Movimiento reducido:** sin rotación y vuelos instantáneos (`jumpTo`). **Ahorro de datos**
   (`navigator.connection.saveData` o 2G): solo GIBS a pantalla completa, sin satelital comercial ni relieve.
10. **e2e:** `e2e/globe.spec.ts` (Pixel 7) carga, hace zoom a una coordenada, verifica que el canvas tiene imagen y que
    no hay errores; y comprueba el respaldo sin WebGL.

## Cachés y pintado fluido de datos

GIBS responde `Cache-Control: no-store`: el navegador no guarda sus teselas y MapLibre suelta las de una fuente al
cambiar de fecha o quitar la capa. Por eso, sin caché propia, cada cambio de capa o fecha volvía a descargar todo.

| Pieza | Dónde | Qué hace |
|---|---|---|
| Caché de teselas GIBS | `src/features/layers/tileCache.ts` | Protocolo `gibs://` de MapLibre (registrado en `GlobeCanvas`). LRU en memoria de bytes comprimidos: 16 MB (8 MB en gama baja), solo la sesión. Une peticiones iguales en vuelo y cancela solo cuando nadie espera. La usan la capa principal, los 12 fotogramas de la animación, la cortina de comparación y la sonda de valores. |
| Cambio de fecha/capa sin parches | `src/features/layers/rasterSwap.ts` | Doble búfer: la versión nueva se carga invisible encima y, cuando sus teselas del viewport están listas (máx. 2,5 s), cruza con la anterior en 300 ms (0 con movimiento reducido). Ids: `data-<capa>` y `data-<capa>-b`, alternando. |
| Consultas que sobreviven a recargar | `src/lib/query/persist.ts` | Regiones (20), análisis (3) y clima POWER (8) en localStorage (~300 KB máx.), validados con zod al restaurar. Región y análisis se restauran como viejos: se pintan al instante y se vuelven a pedir en segundo plano. |
| Límites de Colombia | `src/features/region/admin.ts`, `AdminLines.tsx` | TopoJSON estático del DANE en `public/geo/` (no es JS: no cuenta en el JS inicial). `co-dpto.json` (28 KB gz) se precarga al mirar Colombia a zoom ≥ 3 y `co-mpio.json` (~220 KB gz) a zoom ≥ 5; con ahorro de datos, solo al tocar Colombia. Se decodifica en tiempo ocioso y una sola vez; el toque busca el municipio con punto en polígono (sin `queryRenderedFeatures`). A MapLibre solo le llega un `MultiLineString` (líneas entre municipios, zoom 5,5–9, fuente con `maxzoom: 9`) y el borde del área elegida. |
| Drawer de región | `useRegionSummary` + `RegionDrawer` | Al cambiar de periodo en la misma región se ven los datos anteriores atenuados (sin esqueleto) y "Actualizando datos…"; números y sparklines pasan del valor anterior al nuevo. |

`?debug=1` muestra la línea `caché GIBS <teselas> (<MB>/<límite> MB) aciertos <hits>/<pedidas>`.

## Prueba en un Android real

```bash
pnpm build && pnpm start --hostname 0.0.0.0 --port 3100
# en el celular (misma red Wi-Fi): http://<IP-de-tu-PC>:3100/es?debug=1
```

Anota aquí fps al girar, al volar a la finca y al hacer pinch-zoom, con modelo del teléfono y navegador.

## Revisión final (Fase 11)

| Medida | Valor |
|---|---|
| JS inicial `/es` | 149,4 KB gz en 9 archivos (MapLibre fuera) |
| Lighthouse móvil 13.6 (`/es`, primera visita) | Rendimiento 74 · Accesibilidad 96 → objetivo táctil de la atribución ajustado · Buenas prácticas 100 |
| FCP / LCP | 0,9 s / 0,9 s |
| CLS | 0,046 |
| TBT | ~1,5 s (evaluación de MapLibre + arranque de WebGL; sin cambios desde la Fase 3) |
| Errores de consola | 0 |

Hallazgos corregidos en esta revisión:
- La introducción de 3 pantallas era un componente diferido que aparecía cuando el globo estaba listo y se volvía el
  LCP (7,2 s). Ahora es un script en línea que arma el diálogo con el primer HTML (`OnboardingScript`): LCP 0,9 s.
- Un ícono de lucide en `[locale]/not-found.tsx` metía el componente base de íconos en el JS inicial de todas las
  páginas (el 404 vive en el layout): ahora es un SVG en línea.
- El vuelo de la intro (`IntroFlight`) y los controles del globo pasaron a módulos diferidos.
- `/favicon.ico` daba 404.
