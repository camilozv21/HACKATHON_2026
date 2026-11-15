# Field Shift — contexto del proyecto

App web para **NASA Space Apps 2026** (reto *Field Shift: Adapting Farms with NASA Data*).
Herramienta de apoyo a decisiones para que agricultores exploren rotaciones de cultivos que mejoren la
salud del suelo y la resiliencia al clima, usando observaciones de la Tierra de NASA:

- SMAP (humedad del suelo), GPM/IMERG (precipitación), MODIS/VIIRS/Landsat-HLS (NDVI),
  ECOSTRESS (evapotranspiración y temperatura superficial), NASA POWER (clima diario),
  GRACE/GRACE-FO (almacenamiento de agua), SRTM (elevación)
- más datos de suelo locales, características de cultivos y prioridades del agricultor.

Yo soy el **frontend developer**. Otro miembro del equipo hace el backend/modelo; el frontend consume
una API con contrato definido en `src/lib/api/contract.ts` y **debe funcionar con mocks** mientras tanto
(`NEXT_PUBLIC_USE_MOCKS=true`).

## Funciones clave de la experiencia

- **Ubicación al abrir:** primero por IP en el servidor (`/api/locate`), luego precisión con la geolocalización
  del navegador si la persona da permiso. El globo vuela a su zona.
- **Drawer de región:** tocar una región del globo abre un drawer lateral (derecha) con una animación de entrada
  llamativa y datos útiles de los sensores y misiones NASA para esa región.
- **Radio del campo (diferenciador, eje de la experiencia):** cada lugar tiene su emisora y su **programa del día**
  hecho con sus datos (NASA POWER, sensores, eventos, terreno, mercado), escrito por plantillas y reescrito por Claude
  sin poder inventar cifras (`/api/radio/program`, `src/server/radio/`). Se lee frase por frase con subtítulos y
  "¿qué es esto?", y **mueve el globo** con pistas por frase (mismas acciones del agente). Además, segmentos mp3 del
  mock (`public/audio/`). Detalle: `docs/radio.md`.
- **Plan de rotación (motor agronómico del equipo):** primera pestaña del drawer de la finca ("Recomendación").
  Al terminar de dibujar una finca el drawer se abre solo y el plan arranca sin otro toque. Primero se piden los datos
  de la zona (rectángulo de los extremos de la finca, no el polígono; si toca varias celdas de NASA POWER, el máximo
  de cada día) y luego se llama al motor (`POST /api/v1/evaluaciones`, FastAPI en Railway) desde el servidor.
  **La salida del motor pasa por AgroAstro** (agente de Claude en Managed Agents, `src/server/motor/advisor.ts`)
  **antes de servirse**: el teléfono solo recibe planes revisados (NDJSON con etapas). Detalle: `docs/motor-api.md`.
- **Chat con agente IA (n8n):** la persona pregunta por las condiciones de una región; el agente responde y además
  mueve el globo (vuela, activa capas, abre el drawer) mediante acciones estructuradas en su respuesta.
  El chat vive en la zona media inferior de la pantalla.
- **Puntaje:** cuenta sencilla (usuario y contraseña), puntos por crearla, por los retos de inicio y por usar la app;
  el puntaje se ve en cada finca publicada (sin el usuario y con el aviso de que no califica la finca).
  Detalle: `docs/points.md`.

## Stack fijo

- **Next.js** (última estable, App Router, RSC donde aplique), **TypeScript strict**, **pnpm**.
- **Tailwind CSS v4** + componentes propios accesibles (Radix primitives cuando haga falta), **lucide-react** para íconos.
- **Globo:** MapLibre GL JS con proyección `globe` (usamos v6, la estable actual; misma API de globo que v5,
  pero solo ESM: `import { Map } from 'maplibre-gl'` y `setWorkerUrl`). Se carga solo en cliente (`next/dynamic`, `ssr: false`).
- **Estado:** Zustand para UI/mapa; TanStack Query para datos remotos; estado clave sincronizado con la URL (**nuqs**) para compartir enlaces.
- **i18n:** next-intl, español (por defecto) e inglés.
- **Gráficas:** **visx** (única librería de gráficas; no mezclar con otras).
- **Validación:** zod para todas las respuestas de API.
- **Animaciones de UI:** Motion (`motion/react`). Las animaciones del globo usan la API de MapLibre, no Motion.
- **Agente IA:** `/api/agent` (oculta URL y secretos). Orden: n8n por webhook → Claude (`ANTHROPIC_API_KEY`, `src/server/claudeAgent.ts`, `claude-opus-5-5`) → agente mock local. Contrato en `docs/agent-contract.md`.
- **Markdown del agente:** react-markdown + rehype-sanitize (sin HTML crudo).

## Principios (respétalos en cada cambio)

1. **Mobile first:** diseña para 360×740 primero, luego tablet y desktop. Objetivos táctiles ≥ 44 px. Una mano: acciones principales en la mitad inferior.
2. **Fluidez:** el globo debe ir a 60 fps en un Android de gama media. Nada de re-renders de React por cada frame del mapa; el mapa vive fuera del árbol de render (ref + store).
3. **Lenguaje para agricultores:** frases cortas, sin jerga; cada término técnico (NDVI, evapotranspiración, anomalía de humedad) tiene un "¿qué es esto?" con explicación simple.
4. **Honestidad:** cada recomendación muestra evidencia, nivel de confianza, vacíos de información y riesgos. Recordatorio visible: la herramienta apoya, no reemplaza el criterio del agricultor ni a los expertos locales.
5. **Accesible:** contraste AA, navegable con teclado, `prefers-reduced-motion` respetado, no depender solo del color.
6. **Inspiración visual:** globo oscuro estilo radio.garden (espacio negro, atmósfera suave, puntos luminosos, vuelos suaves, panel inferior deslizable). Es inspiración; **no copies marca, assets ni layout exacto**.

## Mapa de pantalla en móvil (no superponer cosas)

- **Arriba:** búsqueda.
- **Centro:** el globo con la mira.
- **Abajo al centro:** la barra del chat.
- **Abajo, encima de la barra del chat:** mini reproductor de radio.
- **Derecha:** el drawer de región cuando se abre.

## Comandos

```bash
pnpm dev          # servidor de desarrollo (móvil: pnpm dev --hostname 0.0.0.0)
pnpm build        # build de producción
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest
pnpm e2e          # playwright (Pixel 7, contra `pnpm build && pnpm start --port 3100`); modo demo: /es?demo=1
node scripts/build-gibs-meta.mjs   # refresca fechas válidas y leyendas de las capas NASA GIBS (antes de la demo)
node scripts/build-admin-co.mjs    # regenera public/geo/co-{dpto,mpio}.json (límites DANE de Colombia)
node scripts/build-market-co.mjs   # regenera el seed de mercado (SIPSA, EVA, TRM, insumos, Finagro)
node scripts/build-terrain-co.mjs  # zonas de riesgo + Markov: sintético; --from=<csv de GEE> real (docs/terrain-risk.md)
pnpm db:inspect   # lista schemas y tablas de DATABASE_URL (solo lectura)
pnpm db:migrate   # aplica las migraciones del schema fieldshift (idempotente)
node scripts/bundle-size.mjs <url> # mide el JS inicial
node scripts/measure-perf.mjs <url> --cpu=4  # fps del globo en Pixel 7 con CPU 4x
```

## Convenciones

- Componentes en `src/components/<feature>/`.
- Lógica del mapa en `src/features/globe/`, capas en `src/features/layers/`, rotaciones en `src/features/rotations/`,
  drawer de región en `src/features/region/`, radio en `src/features/radio/`, chat en `src/features/agent/`,
  ubicación en `src/features/location/`, finca en `src/features/field/`, prioridades en `src/features/priorities/`,
  zonas de riesgo y cambios del terreno (Markov, Google Earth Engine) en `src/features/terrain/`,
  plan de rotación del motor agronómico en `src/features/motor/` (servidor en `src/server/motor/`, contrato en
  `src/lib/api/motor.ts`, catálogo en `src/lib/motorCatalog.ts`),
  puntaje en `src/features/points/` (servidor en `src/server/accounts/`, reglas compartidas en `src/lib/points.ts`).
- AgroAcademy (`/[locale]/academy`, enlazada desde Ajustes y el glosario) en `src/features/academy/`: lecciones de
  un minuto (`lessons.ts`: pasos del simulador `PhoneSim`, pregunta y enlace "Pruébalo en el globo" con parámetros
  de la URL) + práctica de los 7 retos del glosario (reutiliza `onboarding/games/registry.ts` y `Learned.tsx`).
  Avance en localStorage (`fieldshift:academy:v1`), cargado después de hidratar. Si añades una función a la app,
  añade su lección.
- API abierta del terreno (solo lectura, CORS `*`, filtros `campo=op.valor`, ubicación × tiempo) en `/api/terrain`,
  lógica en `src/server/terrain/`, contrato zod en `src/lib/api/terrainApi.ts` (ver `docs/terrain-api.md`).
- Capa de datos en `src/lib/api/` (contrato zod, cliente, hooks, mocks, NASA POWER).
- Textos de UI siempre vía next-intl (`messages/es.json`, `messages/en.json`); nunca strings sueltos en componentes.
- `localStorage` / `sessionStorage` siempre envueltos en try/catch.
- Variables solo de servidor (`N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `DEFAULT_LAT`, `DEFAULT_LON`, `DATABASE_URL`,
  `MARKET_JOB_SECRET`, `DATOS_GOV_APP_TOKEN`, `MOTOR_API_URL`, `MOTOR_API_KEY`) nunca con prefijo `NEXT_PUBLIC_`. La URL de Postgres solo en `.env.local`.
- Código de servidor en `src/server/` (base de datos en `src/server/db/`, schema `fieldshift`); ESLint prohíbe importarlo
  desde `src/features/**` y `src/components/**`.
- Commits pequeños con **Conventional Commits** (`feat:`, `fix:`, `perf:`, `docs:`, `chore:`…).

## Presupuesto de rendimiento (ver docs/performance.md)

- JS inicial de `/es` < 150 KB gz (`node scripts/bundle-size.mjs`). Hoy ~149,6 KB (14-nov-2026); el framework solo ya son ~133 KB (cada byte cuenta: mide antes de commitear).
- Todo lo que no se ve en el primer pintado va en `next/dynamic` / `import()`: MapLibre, vaul, terra-draw,
  visx, Motion, paneles, geocoding.
- **TanStack Query** no envuelve la app: cada panel con datos se envuelve en `<QueryProvider>` (`src/lib/query/client.tsx`).
- **nuqs** no está en el layout: cada chunk diferido que usa la URL se envuelve en `<UrlStateProvider>`
  (`src/lib/url/UrlStateProvider.tsx`). Parámetros en `src/lib/urlState.ts`.
- En el JS inicial, validar con `zod/mini`; el contrato completo (`zod`) solo en chunks diferidos.
- Mensajes ICU precompilados (next-intl `precompile`): **no usar `t.raw()`**.
- El mapa no se toca desde React por frame: imperativo vía `useGlobeStore.getState().map` y `src/features/globe/camera.ts`.
  Antes de volar a algo que se verá con un panel abierto, fijar el padding (`setMapPadding(..., { instant: true })`).
- Animaciones CSS infinitas solo mientras el elemento se ve (una animación oculta sigue repintando).
- Cada `dynamic()` del shell suma bytes al JS inicial: las piezas que llegan con el globo listo se agrupan en
  pocos módulos (`TopRight`, `TopCenter`, `FirstLayer` en `src/components/shell/`). Añade ahí, no en `AppShell`.
- Diálogos propios encima del sheet: `createPortal` a `<body>` (vaul usa transform) y `data-overlay-dialog` para que
  Esc cierre el diálogo y no el sheet. **Si el diálogo tiene campos de texto (o debe usarse con teclado), usa Radix
  `Dialog` de `radix-ui`** (con `data-overlay-dialog` en el contenedor): vaul no le pasa `modal` a Radix, así que el
  sheet deja una trampa de foco aunque sea `modal={false}` y un `<input>` fuera de él no recibe el foco. La trampa de
  Radix se apila y pausa la del sheet (ver `src/features/listings/PublishListingDialog.tsx`).
- Preferencias (modo sol/alto contraste, unidades, modo sencillo, locutor, introducción vista) en `src/lib/prefs.ts`;
  unidades con `useUnits()` (`src/lib/units.ts`), nunca "mm"/"°C" fijos en los mensajes. Modo sol: `data-contrast="high"`.
- Modo sencillo: `data-mode="lite"` en `<html>`; oculta detalle técnico con la variante CSS `lite:hidden` (sin JS) y
  usa `useLite()` solo si cambia la estructura. Nunca ocultes confianza, riesgos ni avisos de honestidad.
- Locutor (voz del teléfono): `src/features/narrator/` (`speak`/`stop`, `SpeakButton`). La radio baja el volumen o
  pausa su voz de respaldo mientras habla. La voz se elige con `src/features/narrator/voices.ts` (sin voces robóticas de Apple). Inicio tipo juego: bienvenida en línea (`OnboardingScript`, se lee sola en voz alta salvo que la persona la silencie: `fieldshift:narrator` = '0'; `introVoice` en prefs) → personaje y
  "cómo quieres jugar" en `src/features/onboarding/RoleQuiz.tsx` (diferido en `FirstLayer`) → 7 retos del glosario en
  `src/features/onboarding/games/` (reglas puras en `logic.ts`, una por reto; textos en `onboarding.games`) → primera
  misión → "Tu perfil de campo" → `/api/profile` (Claude → reglas). El agente recibe `profile` (rol, modo, voz y, si
  jugó, `level` y `review`) en cada pregunta.
- PWA: `public/sw.js` (solo producción) guarda el shell y `/_next/static`, nunca tiles ni `/api`; el último análisis
  vive en localStorage (`src/lib/api/offline.ts`). Los e2e arrancan con la introducción ya vista (`e2e/storage-state.json`).
- Orden de fases del plan: 0 → 1 → 2 → 2A (ubicación) → 3 → 4 → 5 → 6 → 6A (drawer de región) → 6B (radio) → 6C (chat n8n) → 7 → 8 → 9 → 10 → 11.
