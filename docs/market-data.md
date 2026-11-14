# Datos de mercado de Colombia

Field Shift suma factores socioeconómicos a cada recomendación en Colombia: precio mayorista y su tendencia, oferta
que llega a las centrales, rendimiento local, costos (vía índice de insumos), distancia al mercado, crédito y flujo
de caja de los perennes. Todas las cifras salen de fuentes públicas y de cálculos deterministas. Claude solo redacta
conclusiones, sin cifras.

## Fuentes

| Fuente | Qué usamos | Acceso | Frecuencia |
|---|---|---|---|
| **DANE SIPSA** (SOAP `https://appweb.dane.gov.co/sipsaWS/SrvSipsaUpraBeanService`) | `promediosSipsaMesMadr`: precio promedio mensual $/kg por central y artículo. `promedioAbasSipsaMesMadr`: toneladas que llegan a cada central. | SOAP 1.2, sin auth, sin CORS y **sin filtros** (la historia completa: ~60 MB y ~42 MB). Se lee en streaming en el servidor. | Mensual (día 8–10); el refresco corre los miércoles. |
| **EVA** (UPRA/MinAgricultura) `uejq-wxrr` | Área sembrada y cosechada y producción por departamento y cultivo, 2019–2025 (se suman los semestres A y B). | SODA con `$group`, sin auth. | Anual (~1 año de rezago). |
| **TRM** `32sa-8pi3` | Dólar del día y cambio a 12 meses (café, cacao, aguacate). | SODA. | Diaria. |
| **Insumos** (UPRA) `gwbi-fnzs` | Índice de precios de insumos: total y fertilizantes, cambio a 12 meses. | SODA. | Mensual. |
| **Finagro** `jjvv-55ck` | Créditos por municipio y cadena en ~18 meses, aparte los de pequeños productores. | SODA con `$group`. | Mensual. |

**Por qué no usamos un costo por hectárea.** No hay ninguna fuente abierta legible por máquina; solo fichas en PDF
de UPRA. Inventar costos sería deshonesto. Por eso:
- el bloque "Mercado" muestra el **ingreso bruto** (precio × rendimiento) y dice que no descuenta costos;
- los costos entran solo como **tendencia** del índice de fertilizantes.

El café y el cacao no están en SIPSA. Se muestran sin precio y con su vacío de información ("pregunta en tu
cooperativa"). Para la referencia de hortalizas se usa el tomate chonto.

## Arquitectura

```
n8n (America/Bogota) ──X-FieldShift-Secret──▶ POST /api/market/jobs/refresh?sources=…   (src/server/market/refresh.ts)
                                            ▶ POST /api/market/jobs/outlook             (src/server/market/outlook.ts)
                       src/server/market/pipeline/* (mismo código que el seed)
                                │
                                ▼
            Postgres fieldshift.market_kv  (kind: central | dept | national | outlook)
            Postgres fieldshift.market_runs (cada corrida: ok, filas, error)
                                │   sin base o con error ▼
                                │   src/server/market/seed-co.json (comiteado)
                                ▼
marketForPoint(lat, lon) ──▶ /api/mock/analysis (motor) · GET /api/market (drawer, publicar) · tools del agente
```

- **Esquema `fieldshift`.** Lo aplican `pnpm db:migrate` o el primer acceso (`ensureSchema`, con candado). Las
  migraciones viven en `src/server/db/migrations.ts`. Por la base compartida, no se toca nada fuera de ese esquema.
- **Seed.** `node --experimental-strip-types --no-warnings scripts/build-market-co.mjs` toma ~30 s y deja ~450 KB:
  74 centrales, 33 departamentos, 24 meses de precios y 15 de abastecimiento. Lo usan los e2e, el desarrollo sin
  base y cualquier respaldo.
- **Caché.** Las instantáneas se guardan 10 min en memoria (`loadMarket`). Un refresco la invalida.

## Indicadores (src/server/market/indicators.ts)

| Indicador | Cómo |
|---|---|
| Precio de referencia | **Mediana de 12 meses** en la central SIPSA más cercana que publica el producto (máx. 650 km). No el último mes: perseguir un pico de precio lleva a sobreoferta. |
| Tendencia | Promedio de los últimos 3 meses frente a los mismos 3 meses del año anterior. |
| Volatilidad | Coeficiente de variación de 12 meses: baja < 12 %, media < 25 %, alta. |
| Oferta | Toneladas que llegaron a esa central (3 meses vs. año anterior): sube > +10 %, baja < −10 %. |
| Rendimiento | EVA del departamento (último año, si hay ≥ 50 ha cosechadas); si no, el nacional. |
| Área | Área sembrada del departamento: último año vs. dos años antes. |
| Ingreso bruto | Precio × rendimiento por hectárea y cosecha (redondeado a $10.000). |
| Crédito | Créditos Finagro de la cadena en el departamento (total y a pequeños productores). |

## Cómo cambia el puntaje de "ingresos" (src/mocks/engine/market.ts)

`ingresos = Σ valor relativo × rendimiento esperado × LER × mercados que dijo × factor local`

El **factor local** está acotado entre 0,6 y 1,4. Partes:
- √(precio local / mediana nacional × rendimiento del depto / nacional), acotado entre 0,75 y 1,3;
- tendencia: ≥ +15 % ×1,04; ≤ −15 % ×0,94;
- volatilidad: alta ×0,94; media ×0,98;
- sobreoferta (área ≥ +15 % o más oferta, con el precio bajando más de 5 %): ×0,92;
- distancia: perecedero a más de 250 km ×0,90; cualquiera a más de 400 km ×0,93;
- fertilizantes: si suben ≥ 10 % en 12 meses, ×0,97 para los cultivos que más nitrógeno piden.

Según la encuesta (`purpose`), el factor se atenúa así: `1 + (f − 1) × {casa: 0,3, ambos: 0,7, venta: 1}`.

**Efecto en las opciones.** La selección de opciones usa pesos iguales. Por eso el mercado puede cambiar **qué**
opciones salen, no solo su orden. Es deliberado.

Las cifras en pesos solo aparecen como evidencia y en el bloque "Mercado", nunca como puntaje.

## Conclusiones (Claude o reglas)

- **Claude** (`claude-opus-5-5`, esfuerzo `low`, salida JSON Schema, fallback del servidor) recibe por departamento:
  - los indicadores de sus 6 cultivos principales;
  - el cambio de la TRM y de los fertilizantes;
  - la anomalía de lluvia y temperatura máxima de los últimos 30 días de NASA POWER en la capital.
- **Salida de Claude:** etiqueta (`favorable`, `neutral`, `unfavorable`), una frase en español y otra en inglés, y
  la confianza.
- **Honestidad:**
  - un texto con dígitos o un producto que falta se reemplaza por la regla;
  - los productos que no venían en la entrada se ignoran;
  - la interfaz marca la conclusión con "Análisis IA" o "Reglas".
- **Reglas** (`src/server/market/rules.ts`): misma forma. Se usan sin `ANTHROPIC_API_KEY`, con
  `AGENT_FORCE_MOCK=true` o si Claude falla.
- **Costo:** una llamada por departamento (33), 4 a la vez, ~12 s cada una.

## Scheduler en n8n

Importa [`docs/n8n/market-scheduler.json`](n8n/market-scheduler.json) y luego:

1. Cambia `https://TU-APP.example.com` por la URL de la app en los 5 nodos HTTP.
2. Crea una credencial **Header Auth** con el nombre `X-FieldShift-Secret` y como valor el `MARKET_JOB_SECRET` del
   servidor. Así el secreto no queda en el JSON.
3. Revisa la zona horaria (America/Bogota) y activa el workflow.

| Disparador | Llama a |
|---|---|
| Diario 06:30 | `trm,inputs` |
| Miércoles 15:30 | `sipsa` → `sipsa-supply` → `outlook` |
| Día 5 de cada mes | `eva,finagro` |

El nodo "¿Alguna fuente falló?" termina en error si el reporte trae `ok: false` (respuesta 207), para que n8n avise.

Para probar a mano:

```bash
curl -X POST "$URL/api/market/jobs/refresh?sources=trm,inputs" -H "X-FieldShift-Secret: $MARKET_JOB_SECRET"
curl -X POST "$URL/api/market/jobs/outlook?depts=63" -H "X-FieldShift-Secret: $MARKET_JOB_SECRET"
```

Sin secreto configurado responde 503; con un secreto distinto, 401. `maxDuration = 300` s: SIPSA tarda 20–60 s.

## Variables (solo servidor)

`DATABASE_URL`, `DATABASE_POOL_MAX` (3), `DATABASE_SSL` (`disable` en local), `MARKET_JOB_SECRET`,
`DATOS_GOV_APP_TOKEN` (opcional), `ANALYSIS_USE_MARKET=false` (apaga el mercado en el análisis).

## Límites

- **Precio de referencia:** es mayorista, no el precio en finca. La central más cercana puede no ser donde vende la
  persona.
- **Rendimientos EVA:** son estimaciones de expertos por departamento y llegan con un año de rezago.
- **Sin costos por hectárea.** El ingreso bruto no es ganancia.
- **Crédito Finagro:** "Otros frutales" y "Cítricos" agrupan varios productos. Se muestra el nombre de la cadena para
  no exagerar.
