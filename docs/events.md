# Eventos y emergencias

Capa "Eventos y emergencias" del globo, sección del drawer de región y formulario "Reportar un evento".
Une tres fuentes; cada evento dice de dónde viene y si está verificado.

| Fuente | Qué es | Cobertura | Ubicación | Verificado |
|---|---|---|---|---|
| **NASA EONET v3** (`eonet`) | Eventos naturales seguidos con satélites y agencias (los mismos de la pestaña *Events* de NASA Worldview) | Mundo, casi en tiempo real | Punto, o centro del área si es un polígono | Sí |
| **UNGRD** (`ungrd`) | Emergencias reportadas a la Unidad Nacional para la Gestión del Riesgo de Desastres (datos abiertos en datos.gov.co) | Colombia, 2019 hasta el último dato publicado (hoy: 31 dic 2025) | Centro del municipio (DIVIPOLA): UNGRD no publica coordenadas | Sí (registro oficial) |
| **Comunidad** (`community`) | Reportes hechos desde la app | Donde haya personas reportando | Redondeada a ~100 m | **No**: siempre "sin verificar" |

Contrato zod: `HazardEvent`, `EventsResponse`, `EventHistory`, `CommunityReportInput` en `src/lib/api/contract.ts`.

## Endpoints (Next.js, servidor)

### `GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD`

Sin fechas: últimos 90 días. Con la máquina del tiempo: el mes elegido. Máximo ~4 meses por consulta.

```json
{
  "from": "2025-05-01",
  "to": "2025-05-31",
  "sources": [
    { "id": "eonet", "status": "ok", "count": 355, "latest": null },
    { "id": "ungrd", "status": "ok", "count": 427, "latest": "2025-12-31" },
    { "id": "community", "status": "empty", "count": 0, "latest": null }
  ],
  "events": [
    {
      "id": "ungrd-2343-nuqp-row-s3b9-nmjd4g3m",
      "source": "ungrd",
      "kind": "landslide",
      "title": "Movimiento en Masa",
      "date": "2025-05-02",
      "lat": 4.6372,
      "lon": -75.5708,
      "place": "Salento, Quindío",
      "approx": true,
      "url": "https://www.datos.gov.co/d/2343-nuqp",
      "verified": true,
      "impact": { "people": 4, "families": 1, "hectares": 35 },
      "magnitude": null,
      "note": null
    }
  ]
}
```

`status`: `ok` | `empty` | `not-yet` (la fuente todavía no publica ese periodo: UNGRD llega con retraso) | `error` (no respondió).
`kind`: `landslide`, `flood`, `storm`, `wildfire`, `drought`, `frost`, `erosion`, `earthquake`, `volcano`, `other`.

### `GET /api/events/history?lat&lon[&from&to]`

Historial oficial del municipio más cercano (UNGRD, conteo por tipo y las 5 emergencias más recientes) y eventos de
NASA EONET y de la comunidad a menos de 50 km en el periodo. Fuera de Colombia: `status: "outside"`.

### `POST /api/reports` (mock)

Cuerpo `CommunityReportInput` (sin nombre, teléfono ni correo):

```json
{ "kind": "landslide", "date": "2026-11-10", "lat": 4.637, "lon": -75.571, "impacts": ["road", "crops"], "note": "Tapó la vía a la vereda" }
```

Respuesta `201 { "report": HazardEvent }` con `source: "community"`, `verified: false`. Errores: `400 invalid-report | date`,
`429 rate` (más de 5 reportes en 10 minutos desde la misma conexión).

**Hoy es un mock**: los reportes viven en la memoria del servidor (se pierden al reiniciar y no se comparten entre
instancias) y en el `localStorage` de quien reporta. El backend real debe guardarlos, moderarlos y, si una entidad
los confirma, marcarlos `verified: true`.

## Privacidad y seguridad

- El formulario no pide datos personales. El servidor borra del texto teléfonos, correos y enlaces, y redondea el punto a ~100 m.
- Para limitar el abuso solo se guarda en memoria un resumen irreversible (SHA-256) de la IP durante 10 minutos; nunca la IP ni se registra en logs.
- El formulario muestra primero "¿Hay personas en peligro? Llama al 123". La app **no** avisa a los organismos de emergencia.
- El agente (Claude) recibe los reportes de la comunidad sin su texto libre (contenido de terceros sin verificar).

## Calidad de los datos UNGRD

- Un conjunto por periodo y con columnas que cambian de nombre: `wwkg-r6te` (2019–2022), `rgre-6ak4` (2023–2024) y `2343-nuqp` (2025 en adelante). Ver `src/server/events/ungrd.ts`.
- En 2025 hay filas con un consecutivo en la columna DIVIPOLA: el código solo se usa si coincide con el nombre del municipio; si no, se ubica por municipio y departamento.
- Solo se muestran eventos agroclimáticos (deslizamientos, inundaciones, vendavales, incendios de cobertura vegetal, sequías, heladas, erosión, sismos y volcanes). Incendios estructurales, accidentes y colapsos no.
- Centroides municipales: `node scripts/build-divipola.mjs` → `src/server/events/divipola.json` (DIVIPOLA del DANE, `gdxc-w37w`).

## Mapa

Color = grupo de riesgo (paleta validada para daltonismo sobre el globo oscuro): azul agua y tormentas, ámbar tierra,
magenta fuego y sequía, gris otros. Forma = fuente: relleno (oficial o satélite) y anillo (comunidad, sin verificar).
El color nunca va solo: la leyenda, la lista y el detalle dicen el tipo con texto e ícono.

URL: `?ev=1` (eventos visibles) o `?ev=landslide` (un solo tipo); se combina con `?t=2025-05` (máquina del tiempo).

## Agente

Acciones `showEvents {on?, kind?}` y `reportEvent {kind?, lat?, lon?}` (solo abre el formulario; la persona decide si lo envía).
Claude tiene la herramienta `get_events` (historial UNGRD + eventos cercanos).
