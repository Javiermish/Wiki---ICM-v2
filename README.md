# Wiki ICM — Hito 2.1

Catálogo navegable de una biblioteca colaborativa de Ingeniería Civil Matemática.
**Prototipo con datos ficticios: los ramos no representan la malla oficial de la UdeC.**

## Ejecutar

Node **22.18 o superior** (para las pruebas TS nativas) y pnpm según `package.json`.
Validado en Node 26.11.1 / pnpm 12.14.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Abrir <http://localhost:3000>. El catálogo público funciona sin credenciales.
Las cuentas reales requieren Supabase y las variables de `.env.example`.
Configuración de correo, migraciones, administrador inicial y pruebas: [docs/HITO_2_1.md](docs/HITO_2_1.md).
Si Auth funciona pero faltan perfiles/roles, aplicar manualmente `supabase/migrations/202610220001_profiles_roles.sql` una sola vez y después `202610220002_backfill_existing_accounts.sql` (reejecutable). Orden, precauciones y consultas de verificación: [docs/AUTH_SQL.md](docs/AUTH_SQL.md). No borrar ni registrar de nuevo la cuenta existente.
Las fuentes son locales del sistema; no se descargan fuentes de Google.

Para comprobar producción:

```bash
pnpm lint
pnpm test
pnpm build
pnpm start
```

Con producción iniciada, comprobación HTTP opcional de rutas y estados:

```bash
WIKI_TEST_BASE_URL=http://localhost:3000 pnpm test
```

Sin esa variable se omiten las suites HTTP. Las pruebas de catálogo,
contraste de tokens y tema con APIs simuladas no necesitan servidor ni navegador.

La comprobación de navegador es opcional, usa Chrome/Chromium existente vía CDP
y no requiere instalar Playwright:

```bash
WIKI_TEST_BASE_URL=http://localhost:3000 WIKI_CHROME_PATH=/ruta/a/chrome node tests/browser-catalog.mjs
WIKI_TEST_BASE_URL=http://localhost:3000 WIKI_CHROME_PATH=/ruta/a/chrome node tests/browser-materials.mjs
WIKI_TEST_BASE_URL=http://localhost:3000 WIKI_CHROME_PATH=/ruta/a/chrome node tests/browser-contributions.mjs
WIKI_TEST_BASE_URL=http://localhost:3000 node tests/browser-courses.mjs
WIKI_TEST_BASE_URL=http://localhost:3000 node tests/browser-favorites.mjs
WIKI_TEST_BASE_URL=http://localhost:3000 node tests/browser-auth.mjs
```

Capturas e informes locales en `.next/qa-evidence/`, `.next/qa-materials-evidence/`,
`.next/qa-contributions-evidence/`, `.next/qa-courses-evidence/`,
`.next/qa-favorites-evidence/` y `.next/qa-moderation-evidence/` (ignorados por Git). Los runners de aportes y
visor no desactivan el sandbox si Chromium está bloqueado por el entorno.

## Funcionalidades del alcance vigente

- `/`: portada del Hito 1.1, encabezado, navegación móvil, pie y aviso
  explícito de prototipo. Sus accesos ahora abren semestres y ramos.
- `/semestres/[semestre]`: ramos del semestre curricular, buscador local por nombre
  o código, navegación entre semestres y estados vacíos. Admite enteros canónicos
  1–12 para ramos creados en la demo; fuera de ese rango/formato devuelve 404.
- `/electivos?area=numerico`: electivos por Numérico, Discreta, Optimización,
  Estadística y Otro; búsqueda por nombre/código, áreas vacías y parámetros en URL.
- `/gestion/asignaturas`: consulta, creación, edición, reclasificación, archivo y
  reapertura **DEMO pública sin login**. Identidad/ruta estables; no elimina documentos.
- `/favoritos`: asignaturas regulares/electivas y materiales aprobados agrupados,
  con añadir/quitar y persistencia defensiva en este navegador;
  no es un guardado en una cuenta ni una autenticación simulada.
- `/moderacion`: revisión DEMO protegida para moderadores/administradores verificados, de aportes, solicitudes de asignaturas
  y reportes. Correcciones, decisiones confirmadas e historial solo en memoria;
  aprobar no publica archivos ni incorpora ramos al catálogo.
- `/registro`, `/login`, `/recuperar-contrasena`, `/restablecer-contrasena`, `/auth/confirm`: Supabase Auth SSR, correo confirmado y contraseña.
- `/mi-cuenta`: perfil propio editable; `/mis-aportes` informa la funcionalidad futura.
- `/admin/usuarios`: consulta y asignación/revocación de moderación con auditoría; autorización servidor y SQL.
- `/ramos/[slug]`: ficha del ramo, breadcrumbs, Listados, Apuntes y Certámenes;
  filtros combinables por año, semestre académico y número, conservados en URL.
- Múltiples secciones/versiones del mismo documento con identificadores únicos;
  ramos sin código o materiales también son navegables.
- Tokens de Wiki ICM claros/oscuros; tema accesible, preferencia del sistema y
  persistencia local defensiva (`wiki-icm-theme-v1`). Si el navegador bloquea
  almacenamiento, el cambio sigue funcionando durante la sesión.
- Búsqueda global sobre ejemplos **aprobados**, sin distinguir acentos ni
  mayúsculas. Formulario GET con consulta `?q=` y filtros opcionales combinables.
- Filtros por semestre curricular, categoría, año, semestre académico y número,
  conservados en URL. Estados sin resultados y de parámetros inválidos.
- Catálogo tipado `Course → CourseOffering → Material`, separado de UI y fixtures.
  Regulares con semestre curricular y electivos por área sin semestre obligatorio.
  Pruebas para Cálculo I (curricular 1) y **Certamen 2 - 2024-2**.
- Breadcrumbs en resultados, enlace de salto, etiquetas, foco visible y estado
  de carga accesible para el renderizado progresivo de Next.js.
- `/materiales/[id]`: lector PDF real con React-PDF/PDF.js, navegación de páginas,
  búsqueda/selección de texto, zoom, ajuste al ancho, restablecer y pantalla completa.
- Imágenes PNG/JPEG/WebP sin recortes, zoom y descarga del original; ficha académica,
  retorno al ramo con filtros, estados sin archivo y reportes explícitamente simulados.
- PDF original de tres páginas y tres formatos de imagen en `public/demo/`, de
  distribución autorizada. Descarga real con nombre público normalizado.
- `/aportar`: formulario guiado con búsqueda de ramos del catálogo, metadatos,
  nombre público normalizado, autorización obligatoria y simulación inequívoca.
  Selección local de un PDF/JPEG/PNG/WebP, hasta 25 MiB; preview con el lector
  existente, reemplazo y eliminación. Sin subidas ni persistencia de datos/archivos.

### URLs de prueba

```text
/?q=calculo
/?q=Certamen+2+-+2024-2
/?q=calculo&curricularSemester=1&category=certamen&year=2024&term=2&number=2
/?q=calculo&curricularSemester=2&category=certamen&year=2024&term=2&number=2
/?curricularSemester=4
/?q=sin-coincidencias
/?term=7
/semestres/1
/semestres/1?q=DEMO-C1
/semestres/4
/electivos
/electivos?area=numerico
/electivos?area=optimizacion
/gestion/asignaturas
/moderacion
/favoritos
/ramos/calculo-i
/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2
/ramos/geometria?tipo=apuntes
/materiales/demo-certamen-calculo-2
/materiales/demo-listado-calculo-3
/materiales/demo-apuntes-calculo
/materiales/demo-certamen-calculo-1
/materiales/demo-listado-algebra-1
/aportar
/aportar?ramo=calculo-i
```

La tercera URL encuentra dos versiones del material sin cambiar el semestre curricular
del ramo. La cuarta y quinta muestran el estado vacío. `/?term=7` muestra una
advertencia, sin devolver silenciosamente todo el catálogo. Geometría ilustra un
ramo sin materiales; el semestre 4 tampoco tiene ramos en la semilla inicial.

Gestión, moderación y reportes comparten memoria durante la navegación cliente con
`Next Link`/`Next Form`; recargar/cerrar u otra pestaña restablece esos datos. Favoritos
guarda únicamente referencias tipadas en `localStorage` (`wiki-icm:favorites:v1`),
sin cuenta ni sincronización entre dispositivos o en vivo entre pestañas. Datos
inválidos y referencias no públicas se omiten; fallos de almacenamiento dejan la
selección en memoria con un aviso. Favoritos de ramos locales que ya no existen se
descartan al recargar. No hay persistencia de catálogo en almacenamiento web ni
servidor. Editar o reclasificar mantiene
IDs/slugs y documentos; archivar retira selectores activos, **no despublica materiales
aprobados**. Los nuevos ramos usan `/ramos/local-<uuid>`. El servidor entrega un shell
HTTP 200 para ese prefijo válido incluso si no existe en la memoria cliente; muestra
ausencia explícita, no una ficha inventada. Slugs normales desconocidos mantienen 404.

En las rutas de ramo se usan `tipo=listados|apuntes|certamenes`, `anio`, `periodo`
y `numero`. Se reutilizan las validaciones académicas de la portada, cuyo contrato
URL anterior se conserva. Parámetros desconocidos se ignoran; conocidos inválidos
o repetidos muestran errores y no devuelven materiales. Sin `tipo` se abre Listados.

## Arquitectura y límites

```text
src/app/                 Layout, catálogo, fichas públicas y endpoint de archivos
src/components/catalog/  Buscador, semestres, fichas y carga
                         Provider de catálogo DEMO y exploración de electivos
src/components/courses/  Gestión pública DEMO de asignaturas
src/components/moderation/ Panel y estado aislado de revisión DEMO
src/components/layout/   Navegación compartida, breadcrumbs y avisos
src/components/theme/    Control de tema (cliente)
src/components/materials/ Lectores interactivos, toolbar y reporte simulado
src/components/contributions/ Formulario y preview local, sin persistencia
src/components/ui/       Primitivas reutilizables, incluido Button existente
src/domain/              Tipos del catálogo, validación y puertos asíncronos futuros
src/fixtures/            Ejemplos explícitamente ficticios
src/lib/catalog/         Consulta, allowlist pública, repositorio DEMO y filtros URL
src/lib/materials/       Fuente de archivos solo servidor, nombres y navegación
src/lib/favorites/       Adaptador de favoritos locales versionados y recuperables
src/lib/moderation/      Servicio de revisión DEMO sin publicación
src/lib/auth/            Sesión verificada, acciones y flujos de cuentas reales
src/lib/supabase/        Clientes browser/SSR y configuración pública
src/proxy.ts             Renovación de sesión y cabeceras no-store
supabase/migrations/     Perfiles, roles, RLS y auditoría (aplicación manual)
supabase/tests/          Pruebas SQL transaccionales
src/lib/theme.ts         Preferencia y script inicial del tema
public/demo/             Muestras originales intencionalmente públicas
scripts/                 Preparación PDF.js y generación opcional de muestras
tests/                   node:test y navegador Chromium vía CDP
```

Hay aportes preparados localmente, electivos, gestión y favoritos DEMO; no hay
moderación de contenido, subida ni publicación reales. Autenticación, perfiles y roles
usan Supabase real una vez configuradas variables, migración y correo.
La gestión abierta no tiene permisos efectivos ni representa una administración segura.
Solicitudes y reportes alimentan únicamente una cola DEMO en memoria, sin envío ni
revisión real. Las funciones futuras se señalan como
**Próximamente**, no como acciones activas.
El filtrado de fixtures no sustituye permisos de servidor/RLS en hitos futuros.
El prototipo incluye metadata `noindex`. Los fixtures incluyen casos pendientes y
rechazados para comprobar su exclusión de la proyección pública, incluidas facetas
y acceso por ID. El layout serializa únicamente `PublicCatalog` mediante
`getPublicDemoCatalog()`/`toPublicCatalog`: materiales aprobados por allowlist, sin
nombres originales ni fechas de subida y sin ofertas exclusivas de filas privadas.
Fixtures privados permanecen del lado servidor. El repositorio local usa snapshots
inmutables; el provider expone mutaciones asíncronas esperadas por la UI. Los futuros
handlers de servidor y gateway cliente podrán sustituirlo sin importar Supabase ni
claves privilegiadas desde los componentes.

El kit original y su mockup estático se conservan en `README_HITO1.md` y
`prototype/`; no son la aplicación implementada. Criterios y pruebas manuales:
[`docs/HITO_1_1.md`](docs/HITO_1_1.md) (histórico) y
[`docs/HITO_1_2.md`](docs/HITO_1_2.md) (catálogo) y
[`docs/HITO_1_3.md`](docs/HITO_1_3.md) (lector, seguridad, pruebas y límites) y
[`docs/HITO_1_4.md`](docs/HITO_1_4.md) (aportes locales y contratos futuros, histórico) y
[`docs/HITO_1_4_1.md`](docs/HITO_1_4_1.md) (histórico: electivos y gestión) y
[`docs/HITO_1_5.md`](docs/HITO_1_5.md) (histórico) y
[`docs/HITO_2_1.md`](docs/HITO_2_1.md) (alcance vigente, configuración y límites).
Restricciones/consultas DB recomendadas y revisión transaccional futura en
[`docs/MODELO_DOMINIO.md`](docs/MODELO_DOMINIO.md); son diseño, no migraciones aplicadas.
Solo cuentas tienen migración implementada; no se han aplicado migraciones remotas.
No se inicia Hito 2.2. Los archivos futuros usarán Cloudflare R2, no Supabase Storage.

## Dependencias del lector

React-PDF **11.0.0** (React 19+, Node 22.13+) y PDF.js **6.3.289** exactos,
compatibles con Next 16.4.2 / React 19.3.0 / Node 26.11.1 instalados.
PDF.js es dependencia directa para resolver el worker con pnpm sin hoisting adicional.
El worker se empaqueta localmente; `predev` y `prebuild` copian fuentes estándar,
cMaps y WASM de esa misma versión a `public/pdfjs/` (generado, ignorado en Git).
No hay CDN de documentos, worker ni fuentes. El motor PDF se carga dinámicamente
en cliente, sin SSR y sin incorporarse a las páginas de exploración.
