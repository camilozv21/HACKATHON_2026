# Usabilidad y accesibilidad

## Lo que ya se comprobó (automático)

| Revisión | Cómo | Resultado |
|---|---|---|
| axe (WCAG 2.1 A/AA) | `e2e/a11y.spec.ts` en Pixel 7: introducción, inicio, panel de la finca, opciones, ajustes en modo sol, opciones en modo sol, glosario | Sin violaciones críticas ni serias |
| Teclado | El primer Tab llega a "Saltar a la lista de lugares (sin mapa)"; diálogos con foco inicial, Esc y retorno del foco | OK (e2e) |
| Lector de pantalla | Calendario y gráficas con texto alternativo; tabla oculta con los datos de "comparar 2"; anuncios `aria-live` al cambiar el orden de opciones y al cargar | Revisado en el árbol de accesibilidad |
| No solo color | Riesgos con ícono + texto + patrón (rayas/puntos); diferencias con flecha y signo; series de "comparar 2" con patrón; paleta de barras validada para daltonismo (CVD ΔE ≥ 8.4) | OK |
| Modo sol | Ajustes → Modo sol, o `prefers-contrast: more`. Fondo claro, letra 12,5 % más grande, acentos oscurecidos | axe sin violaciones serias |
| Objetivos táctiles | Botones y opciones ≥ 44 px | Revisado en capturas 360–412 px |
| Movimiento | `prefers-reduced-motion` respetado (Motion `reducedMotion="user"`, scroll sin animación) | OK |
| Sin saber leer | Bienvenida con botón "Escuchar con voz" (voz del teléfono, `speechSynthesis`); las 3 preguntas de inicio tienen íconos grandes, se leen solas con la voz encendida y cada opción se lee al tocarla ("toca el tractor…"). Con voz: el panel de región y las respuestas del asistente se leen solos, y cada uno tiene "Escuchar" / "Detener" | `e2e/onboarding.spec.ts` (flujo); voz real: probar en Android Chrome |
| Modo sencillo | `html[data-mode="lite"]` (preguntas de inicio o Ajustes): sin coordenadas ni línea técnica, 4 tarjetas principales y "Ver más datos", sin gráficas de tendencia, puntajes ni fórmula. La confianza, la evidencia y los riesgos siguen visibles | `e2e/onboarding.spec.ts` |

Hallazgo conocido: mientras el sheet de la finca está abierto en móvil, el resto de la pantalla queda oculto para el
lector de pantalla (el sheet se comporta como modal). Para buscar otra finca hay que cerrar el sheet primero.

## Pruebas con personas (pendiente)

Todavía no se hicieron pruebas con agricultores ni con personas no técnicas. Protocolo propuesto (20 min por
persona, en su propio teléfono si es posible, con sol directo si se puede):

1. "Busca tu pueblo y abre tu finca" (o una finca demo). Observar si encuentra la búsqueda o "Mi finca".
2. "¿Cómo está la lluvia este año comparada con lo normal?" Observar si entiende las tarjetas del resumen.
3. "¿En qué meses tu suelo queda sin cultivo?" (calendario).
4. "Dinos qué es lo más importante para ti" (prioridades, cronometrar: objetivo < 30 s).
5. "¿Cuál opción de rotación te sugerimos y por qué?" Observar si abre el detalle y la evidencia.
6. "¿Qué pasaría con menos lluvia?" (¿y si…?).
7. Preguntas finales: ¿qué palabra no entendiste?, ¿confiarías en esto?, ¿qué le mostrarías a tu técnico?

### Registro de hallazgos

| # | Persona (perfil, sin datos personales) | Tarea | Hallazgo | Severidad | Cambio |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |

Severidad: alta (no pudo terminar), media (terminó con ayuda o con dudas), baja (comentario).
