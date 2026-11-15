# Puntaje y cuentas

La persona gana puntos por crear su cuenta, completar los retos de inicio y usar la app. El puntaje se ve en
**cada finca publicada** por esa cuenta: en la tarjeta del globo, en `/[locale]/fincas` y en la página de la finca.
También se ve en el botón de puntos (arriba a la derecha) y en "Mi finca".

> El puntaje mide cuánto usa y aprende con Field Shift quien publica la finca. **No califica la finca ni sus
> productos**: ese aviso acompaña al puntaje en todas partes.

## Cuenta

- **Solo usuario y contraseña.** Sin correo ni teléfono.
  - Usuario: de 3 a 20 letras, números, punto o guion bajo. No distingue mayúsculas.
  - Contraseña: de 6 a 72 caracteres.
  - No hay recuperación de contraseña, y el formulario lo dice.
- **Contraseña:** se guarda con scrypt (`src/server/accounts/password.ts`). El login de un usuario que no existe
  tarda lo mismo que uno real.
- **Sesión:**
  - token aleatorio en la cookie `fs_session` (`httpOnly`, `SameSite=Lax`, `Secure` en producción, 180 días);
  - en la base solo se guarda su sha256;
  - las escrituras rechazan otro `Origin`.
- **Límites:** 5 cuentas por hora por IP, 10 intentos de login cada 10 minutos por IP y 30 envíos de puntos por
  minuto por cuenta.
- **El usuario nunca se muestra en las fincas**, solo los puntos y el nivel.

## Reglas (`src/lib/points.ts`)

El cliente dice **qué hizo** y el servidor decide cuánto vale con estas reglas. El cliente no puede pedir puntos
por crear la cuenta ni por publicar.

| Acción | Puntos | Cuándo cuenta |
|---|---|---|
| `signup` crear la cuenta | 100 | una vez (la da el servidor) |
| `quest` retos de inicio | 30 + 20 por estrella (máx. 450) | se guarda el mejor resultado; repetir y mejorar suma la diferencia |
| `visit` entrar a la app | 10 | una vez al día |
| `field` marcar tu finca | 30 | por finca, hasta 5 |
| `analyze` analizar una finca | 40 | por finca, hasta 5 |
| `region` explorar una región | 5 | por región, hasta 10 al día |
| `layer` ver una capa NASA | 10 | por capa nueva |
| `radio` escuchar la radio | 15 | una vez al día |
| `ask` preguntar al asistente | 5 | hasta 5 al día |
| `glossary` "¿qué es esto?" | 5 | por término nuevo |
| `report` reportar un evento | 25 | hasta 3 al día |
| `publish` publicar tu finca | 80 | por finca, verificado con su token de edición (la da el servidor) |

Niveles: Semilla (0), Brote (150), Raíz firme (400), Cosecha (800), Bosque (1500).

Los días se cuentan en UTC. Las reglas se aplican con `applyAwards`, una función pura que comparten el servidor y
el cliente.

## Cómo se cuentan las acciones

- **Escucha de stores.** `src/features/points/PointsRuntime.tsx` (en `FirstLayer`) escucha los stores de capas,
  región, radio, chat, finca, glosario, eventos y publicaciones, y llama a `award()`. Así no hay que tocar cada
  función ni se provocan re-renders.
- **Retos de inicio.** Se leen del perfil (`quest.stars`) cuando termina el juego.
- **Sin cuenta.** Los puntos quedan **pendientes** en el teléfono (`localStorage fieldshift:points:pending:v1`),
  con las mismas reglas.
- **Al crear la cuenta o entrar:**
  - se envían los puntos pendientes;
  - se envían las fincas publicadas desde ese teléfono, con su token. El servidor las enlaza a la cuenta
    (`listings.account_id`) y suma `publish`.
  - Una finca ya enlazada a otra cuenta no cambia de dueño.
- **Con cuenta.** Los premios se agrupan durante 1 s y van a `POST /api/points`. Si la sesión venció, lo hecho
  vuelve a quedar pendiente.
- **Aviso visible.** Cada premio muestra "+N · qué hiciste" bajo el botón de puntos durante 2,8 s. También se
  anuncia en una región `role="status"`. Con `prefers-reduced-motion` no hay animación.

## API

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/account/signup` | `{ username, password }`. Crea la cuenta, suma 100 y abre la sesión (201). Errores: 400 `username`/`password`, 409 `taken`, 429 `rate`. |
| POST | `/api/account/login` | `{ username, password }`. Abre la sesión. Error: 401 `credentials`, sin decir si el usuario existe. |
| POST | `/api/account/logout` | Cierra la sesión (204). |
| GET | `/api/account` | `{ account, breakdown }` (puntos por acción), o 401. |
| POST | `/api/points` | `{ awards: [{ action, ref, value? }], listings: [{ id, token }] }`. Con sesión. Responde `{ total, level, awarded }`. |

En `/api/listings` y en las páginas `/fincas`, cada publicación enlazada a una cuenta trae
`score: { points, level }`. Los ejemplos de la demo tienen un puntaje fijo.

## Almacenamiento

- **Postgres:** migración `003_accounts_points` (se aplica sola en la primera consulta, o con `pnpm db:migrate`):
  - `fieldshift.accounts`: el total en `points`;
  - `fieldshift.sessions`;
  - `fieldshift.point_events`: el libro, con clave `(account_id, action, ref)`;
  - la columna `listings.account_id`.
- **Concurrencia:** cada premio bloquea la fila de la cuenta (`for update`), así dos peticiones a la vez no se
  saltan los topes.
- **Sin `DATABASE_URL`** (desarrollo y e2e): memoria del servidor (`memoryRepo`).

## Límites conocidos

- **Las acciones del cliente no se pueden verificar.** Alguien con conocimientos podría llamar a `/api/points` a
  mano. Los topes limitan cuánto puede inflar su puntaje, pero no lo impiden.
  - Crear la cuenta y publicar sí se verifican en el servidor.
- **No hay recuperación de contraseña** ni forma de borrar la cuenta desde la app.
