# Wiki ICM

Biblioteca colaborativa de material para Ingeniería Civil Matemática (UdeC). Cualquiera puede ver y descargar el material aprobado. Para aportar se necesita una cuenta con correo verificado, y cada aporte pasa por moderación antes de publicarse.

> Los ramos de ejemplo son ficticios y no representan la malla oficial.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind + shadcn/ui · Supabase (Auth + PostgreSQL con RLS) · Cloudflare R2 (archivos privados) · PDF.js · pnpm

## Puesta en marcha

Requisitos: Node 22.18 o superior y pnpm 12 (`npx pnpm@12.14.0` funciona si no lo tienes instalado).

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local   # completar variables (ver abajo)
pnpm dev                     # http://localhost:3000
```

### Variables de entorno

| Variable | Dónde se usa |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Cliente Supabase (público) |
| `SITE_URL` | Origen exacto de la app, sin barra final (enlaces de correo) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor**: confirmar subidas validadas |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | **Solo servidor**: bucket privado de materiales |
| `WIKI_ENABLE_DEMO_MATERIALS` | `true` para mostrar las muestras DEMO de `public/demo/` |

### Base de datos

Aplica las migraciones de `supabase/migrations/` en orden (`npx supabase db push` con el proyecto vinculado). Para crear el primer administrador, sigue [docs/AUTH_SQL.md](docs/AUTH_SQL.md). La configuración de correo y plantillas de Auth está en [docs/HITO_2_1.md](docs/HITO_2_1.md).

### CORS del bucket R2 (obligatorio)

El navegador sube y descarga los archivos **directamente desde R2** con URLs firmadas, así que el bucket debe aceptar el origen de la app. En Cloudflare, ve a R2 → bucket → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://TU-DOMINIO"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["content-type", "if-none-match", "range"],
    "ExposeHeaders": ["Accept-Ranges", "Content-Range", "Content-Length", "Content-Encoding"],
    "MaxAgeSeconds": 3600
  }
]
```

## Cómo funciona una subida

Los archivos nunca pasan por el servidor de Next. Así no aplica el límite de cuerpo de las funciones serverless, que en Vercel es de unos 4,5 MB, y se pueden subir archivos de hasta 25 MiB.

1. **Reserva** (`POST /api/materiales`, JSON): el servidor verifica la sesión, la cuota y los metadatos; reserva el aporte en PostgreSQL (`reserve_material_upload`) y devuelve una URL de subida firmada. Esa URL dura 5 minutos y fija el tipo, el tamaño exacto y `If-None-Match: *`.
2. **Subida**: el navegador hace `PUT` del archivo directo a R2, con barra de progreso.
3. **Confirmación** (`POST /api/materiales/[id]/confirmar`): el servidor lee el objeto desde R2 y lo valida (firma del archivo, PDF sin contenido activo, imagen decodificable). También comprueba que el SHA-256, el tamaño y el tipo coincidan con lo reservado, y recién entonces lo marca `ready` para moderación. Si el contenido no es válido, la reserva se marca `failed` y el objeto se borra.

Reintentar con la misma operación es idempotente. Las descargas verifican los permisos y redirigen a una URL firmada de 60 segundos.

## Pruebas

```bash
pnpm lint
pnpm test          # unitarias, SQL simulado y rutas con dobles del SDK
pnpm build
pnpm test:local    # regresión completa con servicios simulados (requiere Chromium)
```

Las suites HTTP y de navegador y su configuración están descritas en [docs/QA_REGRESIONES_2_3.md](docs/QA_REGRESIONES_2_3.md).

## Estructura

```text
src/app/                 Rutas (páginas y API)
src/components/          UI por dominio: catalog, contributions, materials, moderation, courses, auth, layout
src/domain/              Tipos y validaciones del dominio (sin dependencias de framework)
src/lib/                 Acceso a datos y servicios: auth, catalog, materials (R2, subidas), supabase
supabase/migrations/     Esquema, RLS, RPC y auditoría
supabase/tests/          Pruebas SQL transaccionales
tests/                   node:test y navegador (Chromium vía CDP)
docs/                    Brief, diseño, modelo de dominio y bitácora por hito
```

## Documentación

- Producto y reglas: [docs/BRIEF_PRODUCTO.md](docs/BRIEF_PRODUCTO.md), [docs/MODELO_DOMINIO.md](docs/MODELO_DOMINIO.md), [docs/DISENO.md](docs/DISENO.md)
- Estado, roadmap y detalle de funcionalidades por hito: [docs/ESTADO_HITOS.md](docs/ESTADO_HITOS.md)
