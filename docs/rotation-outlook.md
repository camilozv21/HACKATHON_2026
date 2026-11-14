# La rotación en el tiempo: proyección de 10 años y contexto social

Este documento explica qué hace el mock de `POST /rotations/outlook`. Sirve de referencia para el backend real, que
puede reemplazarlo con el mismo contrato (`src/lib/api/outlook.ts`).

- Código: `src/mocks/outlook/`.
- Pruebas: `src/mocks/outlook/outlook.test.ts`.
- Fuentes: `src/mocks/outlook/references.ts`.

## Por qué existe

`POST /analysis` dice cómo se ve **un ciclo** de cada rotación: qué se siembra cada mes y siete puntajes de 0 a 100.
Pero una rotación es una decisión de varios años. Las preguntas reales de una familia son otras:

- ¿Cuánto baja el ingreso el primer año y cuándo lo recupero?
- ¿Cuándo se nota en el suelo?
- ¿Alcanzamos a hacer el trabajo en los meses pico?
- ¿Hay meses sin comida o sin venta?
- Si arriendo la tierra, ¿me conviene?

Esta proyección las responde **año por año**, con reglas simples y visibles y una fuente para cada número.

## Dónde se ve en la app

- **Opciones → "Tu finca en 10 años"** (`OutlookOverview`): una línea por opción, con el mismo color que en la tabla.
  - Se puede elegir qué mostrar: ingreso, materia orgánica, suelo perdido o trabajo.
  - Se puede elegir el ritmo del cambio: todo de una vez o poco a poco.
  - Debajo: la frase que resume la mejor opción, las preguntas a la familia, el contexto de la región, los supuestos
    y las fuentes.
- **Detalle de una opción → "En el tiempo"** (`OutlookDetail`). Incluye:
  - la rueda del ciclo y la lista de cultivos de la vuelta;
  - los 10 años agrupados por fase, con sus hitos;
  - la trayectoria frente a lo de hoy, con la franja entre un año malo y uno bueno, y el rombo del año en que se
    recupera lo invertido;
  - "Contexto social": factores con estado, jornales por mes frente a lo que da la familia, y meses con comida y con
    venta.
- Las citas `[n]` abren la lista de fuentes y llevan el foco a la fuente citada.

Todo se carga aparte (`next/dynamic`) cuando se abre la pestaña de opciones: no suma al JS inicial.

## Entrada

El cliente manda las estrategias del último análisis, sin reordenar y sin el escenario "¿y si…?". También manda lo que
el análisis sabe del sitio:

- lluvia anual y temperatura media (NASA POWER);
- altitud;
- pendiente (SRTM);
- nivel de riesgo de erosión.

Manda además tres respuestas de la familia, todas opcionales:

| Campo | Valores | Para qué |
| --- | --- | --- |
| `household.workers` | 1–12 | Jornales que da la familia al mes (frente a los meses pico). |
| `household.tenure` | `own` \| `rent` \| `shared` \| `unknown` | Si conviene invertir en suelo cuando tarda años en pagarse. |
| `household.association` | `true` \| `false` | Venta en grupo, semilla y acompañamiento. |
| `pace` | `all` \| `gradual` | Todo el lote el año 1, o ¼ → ½ → todo. |

Si falta un dato, el modelo lo supone y lo dice en `assumptions` y en `baseline.*Assumed`.

## Modelo (por año, para cada estrategia)

`a` es la parte del lote que ya cambió. Con `pace: 'all'` vale 1 desde el año 1; con `gradual`, 0,25 → 0,5 → 1.
Cada puntaje efectivo mezcla lo de hoy y la opción según `a`.

| Indicador | Regla | Fuente |
| --- | --- | --- |
| Materia orgánica (%) | Se acerca a un nuevo equilibrio `MO₀ × (1 + r)`, con respuesta de primer orden (τ = 12 años en clima cálido, 18 en templado, 25 en frío). `r` sube 0,5 % por cada punto de puntaje de materia orgánica sobre lo de hoy. Lo de hoy también se mueve: baja si su puntaje es bajo (quema, suelo desnudo). Con una cobertura, el resultado da ~5 % más de carbono en 10 años. | Poeplau y Don 2015 (0,32 t C/ha/año; ~155 años al equilibrio); McDaniel et al. 2014 (+3,6 % de C con más cultivos; +8,5 % con cobertura); Minasny et al. 2017 (4 por mil al año) |
| Materia orgánica de partida | El análisis de suelo si lo hay. Si no, lo típico del clima: 5 % en clima frío o de altura, 1–1,8 % en zonas secas, 2,2 % en trópico cálido y 3 % en los demás. Siempre se marca como supuesto. | — |
| Suelo que se lava (t/ha/año) | Pérdida potencial × factor de cobertura `0,35 × ((100 − erosión)/100)^1,6` (lógica de RUSLE). Pérdida potencial = 150 × lluvia/2.000 mm × (pendiente + 2)/32 × textura. Calibrado con la finca demo de Quindío: el café sin cobertura da ~25 t/ha (Cenicafé midió 14,67 con azadón) y con cobertura < 1 t/ha (Cenicafé: 0,61). | Rivera Posada 1996, Cenicafé (14,67 t/ha con azadón; 0,61 t/ha con cobertura); Montgomery 2007 |
| Suelo perdido (mm, acumulado) | Σ pérdida / 13 (1 mm en una hectárea ≈ 13 t, con densidad aparente de 1,3). Lo tolerable es ~1 t/ha/año. | Verheijen et al. 2009 (0,3–1,4 t/ha/año) |
| Productividad | `1 − 0,0004 × mm perdidos`: ~4 % menos por cada 10 cm de suelo. | Bakker et al. 2004; den Biggelaar et al. 2004 (0,3 %/año en promedio mundial) |
| Ingreso neto (100 = hoy) | `productividad × [(1 − a) + a × L × (1 + g × rampa)] − costos`. Ver la explicación debajo de la tabla. | Zhao et al. 2022 (+20 % con leguminosa previa); Pittelkow et al. 2015, FCR (bache de 1–2 años); SARE 2019 (~3 años para recuperar) |
| Rango año malo / año bueno | `v = 0,24 − 0,0012 × corte de plagas − 0,025 × (familias − 1)`, entre 0,07 y 0,30, más 0,04 en la transición. Malo = `mid × (1 − v)`, bueno = `mid × (1 + 0,6 v)`: los años malos pesan más. | Gaudin et al. 2015; Bowles et al. 2020 |
| Jornales/ha | Mezcla de lo de hoy y de la opción, más los jornales de establecer un perenne nuevo el año en que se siembra. | DANE 2011; UPRA 2023 |

Partes de la fórmula del ingreso:

- `L = (ingresos + 20) / (ingresos de hoy + 20)`: el cambio de largo plazo.
- `g`: el efecto rotación. Vale `0,0015 × Δnitrógeno + 0,001 × Δcorte de plagas`, con tope de 0,15.
- `rampa = 1 − e^(−año/1,5)`: el efecto rotación crece año a año.
- Costos de la parte que cambia, por años desde que cambió:
  - un cultivo nuevo: 10 % el año 1 y 4 % el año 2;
  - una cobertura nueva: 3 % el año 1, y 2 % cada año por la semilla (con esto una cobertura típica se recupera hacia el
    año 3, como en SARE 2019);
  - un árbol de sombra o una cobertura viva: 5 % el año 1;
  - mientras un perenne nuevo no produce, se pierde 35–60 % del ingreso (café: 2 años; plátano y caña: 1).

**Fases.** El año 1 es siempre `transition`; con `gradual` también el año 2, y también los años en que un perenne nuevo
todavía no produce. Después viene `building` hasta el año 4, o hasta dos vueltas del ciclo si son más. Luego,
`stable`. Lo de hoy siempre es `stable`.

**Recuperar lo invertido** (`breakEvenYear`). Es el primer año en que el ingreso acumulado alcanza al de seguir como
hoy:

- `1` = el ingreso nunca queda por debajo;
- `null` = no lo alcanza en el horizonte.

**Hitos:**

- prueba (año 1);
- todo el lote (año 3, si el cambio es poco a poco);
- primera cosecha de un perenne nuevo;
- primera vuelta completa;
- corte de plagas;
- recuperar lo invertido;
- materia orgánica medible (+0,15 puntos);
- análisis de suelo (año 5).

## Calendario social (`calendar.ts`)

**Jornales por hectárea y ciclo.** Son valores para trabajo a mano o con animales.

| Cultivo | Jornales/ha | Fuente |
| --- | --- | --- |
| Maíz | 40 | DANE 2011 (37 por ha cosechada) |
| Fríjol | 80 | UPRA 2023: 48–131 según la región; DANE 2011: 38 |
| Yuca | 75 | UPRA 2023: 53–93; DANE 2011: 100 |
| Papa | 105 | DANE 2011 (104) |
| Plátano | 108 | DANE 2011 |
| Café | 150 por año | DANE 2011 |
| Caña panelera | 200 por año | DANE 2011 (204) |
| Hortalizas | 150 | DANE 2011 |
| Los demás | valores típicos | Sin fuente local: el backend debería reemplazarlos. |

Notas sobre los jornales:

- Con tractor o sembradora, los granos extensivos piden 40 % de esos jornales.
- Las coberturas piden ≤ 8 jornales: 70 % al sembrar y 30 % al cortar.
- Los coeficientes del DANE son de 2005 y miden algo distinto que los costos por ciclo de la UPRA. Por eso se usan
  como rango, no se mezclan en una misma cuenta.

**Reparto en el año.**

- Cultivo anual: 30 % al sembrar, 20 % en el deshierbe, 40 % en la cosecha y el resto repartido en los meses del medio.
- Café: 45 % parejo en el año y 55 % en la cosecha. Se usan oct–dic y la mitaca de abr–may, que son las de la zona
  cafetera central de Colombia; en otras zonas cambian.

**Lo que da la familia.** Cada persona da 14 jornales al mes. Sale de un empleo agrícola de tiempo completo, que son
173 jornales al año (DANE 2011, citando a MinAgricultura). Los jornales que pasan de ahí son los que habría que
contratar.

**Comida para la casa.** Los granos y las leguminosas secas duran ~6 meses guardados; la papa y la ahuyama, 3; la yuca,
4 (se queda en la tierra); las hortalizas, 2; el plátano da todo el año. El café, la caña, la soya y el algodón cuentan
como venta, no como comida para la casa. Los meses sin nada son la "temporada de hambre" (Vaitla et al. 2009). La
diversidad se cuenta en familias botánicas (Waha et al. 2018).

**Ventas.** Son los meses de cosecha. El café, el plátano y la caña venden en varios meses. Si hay pasto y se vende
ganado, hay venta todo el año.

## Factores sociales

Cada estrategia trae `social[]`. Cada factor tiene un estado (`good`, `watch` o `alert`), y la UI siempre lo muestra
con ícono y texto.

| Factor | Cuándo | Fuente |
| --- | --- | --- |
| `labor` | Siempre. Es `alert` si habría que contratar más jornales que hoy. | DANE 2011, UPRA 2023; en Colombia, el envejecimiento del campo (CNA 2014) |
| `tenure` | Tierra propia: a favor. Arrendada o en compañía con una opción que tarda ≥ 3 años en pagarse o que siembra un perenne: alerta. Sin respuesta: pregunta. | Higgins et al. 2018; Lawry et al. 2017 |
| `food` | Meses sin comida de la finca frente a hoy, y la diversidad. Si todo se vende, es menos grave. | Vaitla et al. 2009; Waha et al. 2018 |
| `cash` | Meses con venta frente a hoy. | Gaudin et al. 2015; Bowles et al. 2020 |
| `market` | Hay un cultivo nuevo que no está en los mercados que marcó la persona, o hay asociación. | Knowler y Bradshaw 2007 (capital social) |
| `knowledge` | Hay un cultivo o una cobertura nuevos para la persona: escuela de campo y prueba en parte del lote. | Waddington et al. 2014; Prokopy et al. 2019 |
| `workload` | El trabajo sube ≥ 15 % o hay una cobertura nueva: repartir tareas y decidir juntos sobre lo que se gana. | FAO 2023; en Colombia, CNA 2014 (36,4 % de productoras) |

**Contexto de la región** (`context`). Dentro de Colombia, la ruta usa `nearestMunicipio` (≤ 30 km del centro de un
municipio). Ahí suma tres datos del país:

- el tamaño de las fincas (CNA 2014: el 70,4 % tiene < 5 ha y ocupa el 2,0 % del área);
- el envejecimiento del campo (índice 51,7 en 2014);
- la política de agricultura campesina, familiar y comunitaria (Resolución 464 de 2017, modificada por la Resolución
  175 de 2024).

En cualquier lugar suma el dato mundial de fincas pequeñas (Lowder et al. 2021; Ricciardi et al. 2018) y cuatro
preguntas para conversar en familia o con un técnico.

## Lo que este mock no hace (y el backend debería hacer)

- **Precios locales.** El ingreso es un índice relativo a hoy, no son pesos.
- **Años extremos.** El clima es el promedio de 20 años: no hay El Niño ni La Niña. La franja de años buenos y malos
  es una regla de diversidad, no un escenario climático. Una mejora natural es usar la serie anual de NASA POWER
  (`climate.trend`) o pronósticos estacionales.
- **Pendiente real.** Fuera de las fincas demo, la pendiente es supuesta, y el suelo perdido es una estimación gruesa.
- **Jornales actualizados.** Faltan valores colombianos recientes para café, papa y plátano (la UPRA solo publica sus
  costos en pesos).
- **Arriendo.** No se pregunta cuántos años dura el contrato.
