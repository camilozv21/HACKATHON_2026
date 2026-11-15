# Publicar mi finca (fincas que venden)

Un agricultor en Colombia publica su finca y lo que vende: producto, variedad, cantidad, unidad, precio por unidad
o "a convenir", y ventana de cosecha. Los compradores lo encuentran en el globo, en el drawer de la región y en
`/[locale]/fincas`, y le escriben por **WhatsApp**. Field Shift no vende ni cobra comisiones.

## Flujo

1. **Mi finca → "Publicar mi finca".** Es una fila en el resumen de la finca. Solo aparece en fincas reales en
   Colombia, no en las demo. Si en la encuesta dijo que vende (`purpose: sale | both`), la pestaña de condiciones
   muestra además la tarjeta "¿Vendes tu cosecha?" (`SellSuggestion`).
2. **Formulario en 3 pasos** (`src/features/listings/PublishListingDialog.tsx`, portal a `<body>`, Esc lo cierra):
   1. **¿Qué vendes?**
      - Los productos se llenan con la rotación actual, con la ventana de cosecha según el mes en que termina cada
        temporada.
      - Junto a cada producto se ve la **referencia mayorista SIPSA** de la central más cercana, convertida a la
        unidad elegida (arroba 12,5 kg, bulto 50 kg, carga 125 kg).
   2. **Contacto y privacidad:** nombre, descripción, sellos declarados, celular y consentimiento.
   3. **Revisa y publica:** vista previa de la tarjeta.
3. **Al publicar:**
   - el servidor responde con un **token de edición** que se guarda en el teléfono
     (`localStorage fieldshift:my-listings:v1`);
   - la fila pasa a decir "Mi publicación": pausar, reactivar, renovar 60 días o borrar.
4. **Globo:**
   - capa "Fincas que venden" (`?shop=1`) en el catálogo de capas;
   - las publicaciones reales son puntos verdes rellenos y los ejemplos, anillos;
   - tocar uno abre su tarjeta (`?listing=<id>`), con "Escribir por WhatsApp" y "Ver finca".
5. **Drawer de región (Colombia):** "Mercado en esta zona" incluye "Fincas que venden aquí" (el municipio).
6. **Páginas (RSC, sin el JS del globo):**
   - `/[locale]/fincas`: directorio con filtros de departamento y producto, formulario sin JS;
   - `/[locale]/fincas/[id]`: la página de la publicación. Tiene:
     - los productos;
     - la imagen satelital Esri de la celda pública;
     - el **verdor NASA MODIS NDVI** (WMS de GIBS, caja de 0,3° porque el píxel es ~1 km);
     - los precios de referencia de la zona;
     - el botón de WhatsApp;
     - una vista previa para compartir (`opengraph-image`, ~110 KB, sin foto: WhatsApp descarta las pesadas).

## Privacidad (Ley 1581 de 2012)

- **Ubicación:**
  - no se guarda el polígono de la finca;
  - el punto público es el **centro de una celda de 0,05°** (~5,5 km), junto con el municipio (DIVIPOLA).
- **WhatsApp:**
  - el teléfono **nunca** sale en el JSON ni en el HTML;
  - el botón pasa por `GET /api/listings/[id]/contact`, que redirige (302) a `wa.me` con un mensaje prellenado;
  - límite de 30 contactos cada 10 minutos por IP.
- **Consentimiento explícito** (`consent: true`): la publicación es visible al público, se puede borrar y vence a
  los 60 días.
- **Texto:** el nombre, la descripción y la variedad pasan por `redact` (se quitan correos, enlaces y teléfonos).
- **Anti-abuso:**
  - 3 publicaciones por hora por IP; se guarda solo un hash de la IP;
  - 3 denuncias de IPs distintas la ocultan (`hidden`) hasta revisarla. Pausar y reactivar no la desoculta.
- **Ejemplos de la demo** (`sample: true`, Quindío y Valle): no tienen WhatsApp. Su botón de contacto lleva a la
  página con un aviso.

## API

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/listings?dept&mpio&product&bbox=w,s,e,n&limit` | Publicaciones activas y vigentes, más los ejemplos. |
| POST | `/api/listings` | Publica. Responde 201 con `{ listing, token }`. Errores: 400 `invalid`/`phone`, 422 `outside` (fuera de Colombia), 429 `rate`, 503 `storage`. |
| GET | `/api/listings/[id]` | Una publicación (404 si venció, se borró o está oculta). |
| PATCH | `/api/listings/[id]` | Con `Authorization: Bearer <token>`: `status` (`active`/`paused`), `products`, `description`, `renew`. |
| DELETE | `/api/listings/[id]` | Con el token: la retira (204). |
| POST | `/api/listings/[id]/flag` | Denuncia (una por IP). |
| GET | `/api/listings/[id]/contact?locale&product` | 302 a WhatsApp. |

Si la finca está enlazada a una cuenta, cada publicación trae además `score: { points, level }`, el puntaje de
esa cuenta (nunca el usuario). Ver `docs/points.md`.

Esquemas zod: `src/lib/api/listings.ts`. Catálogo de productos y unidades: `src/lib/market/catalog.ts`. Es más
amplio que `CROP_IDS`: incluye cacao, aguacate y frutas, con un enlace opcional al cultivo del motor.

## Almacenamiento

- **Con `DATABASE_URL`:** Postgres `fieldshift.listings` y `fieldshift.listing_flags` (migración `002_listings`).
- **Sin ella** (desarrollo y e2e): memoria del servidor (`memoryRepo`).
- **Dueño:** `listings.account_id` (migración `003_accounts_points`). Se llena cuando la persona entra a su cuenta
  en el teléfono donde publicó: el token de edición prueba que la finca es suya.
- Una escritura que falla en Postgres devuelve 503: **nunca** cae a memoria en silencio.
- Los e2e fijan `DATABASE_URL=''` en `playwright.config.ts` para no tocar la base real.

## Pendiente (fuera del alcance de la demo)

- Fotos de los productos (almacén de archivos y moderación).
- Verificar sellos.
- Revisión humana de las publicaciones ocultas.
- Edición completa desde "Mi publicación".
