# Wiki ICM — Hito 1.3

Catálogo navegable de una biblioteca colaborativa de Ingeniería Civil Matemática.
**Prototipo con datos ficticios: los ramos no representan la malla oficial de la UdeC.**

## Ejecutar

Node **22.18 o superior** (para las pruebas TS nativas) y pnpm según `package.json`.
Validado en Node 26.11.1 / pnpm 12.14.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Abrir <http://localhost:3000>. No requiere variables de entorno ni credenciales.
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
```

Capturas e informe local en `.next/qa-evidence/` (ignorado por Git).

## Funcionalidades listas

- `/`: portada del Hito 1.1, encabezado, navegación móvil, pie y aviso
  explícito de prototipo. Sus accesos ahora abren semestres y ramos.
- `/semestres/[semestre]`: ramos del semestre curricular, buscador local por nombre
  o código, navegación entre semestres y estados vacíos. Solo semestres de ejemplo
  declarados en los fixtures; los demás devuelven 404.
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
  Pruebas para Cálculo I (curricular 1) y **Certamen 2 - 2024-2**.
- Breadcrumbs en resultados, enlace de salto, etiquetas, foco visible y estado
  de carga accesible para el renderizado progresivo de Next.js.
- `/materiales/[id]`: lector PDF real con React-PDF/PDF.js, navegación de páginas,
  búsqueda/selección de texto, zoom, ajuste al ancho, restablecer y pantalla completa.
- Imágenes PNG/JPEG/WebP sin recortes, zoom y descarga del original; ficha académica,
  retorno al ramo con filtros, estados sin archivo y reportes explícitamente simulados.
- PDF original de tres páginas y tres formatos de imagen en `public/demo/`, de
  distribución autorizada. Descarga real con nombre público normalizado.

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
/ramos/calculo-i
/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2
/ramos/geometria?tipo=apuntes
/materiales/demo-certamen-calculo-2
/materiales/demo-listado-calculo-3
/materiales/demo-apuntes-calculo
/materiales/demo-certamen-calculo-1
/materiales/demo-listado-algebra-1
```

La tercera URL encuentra dos versiones del material sin cambiar el semestre curricular
del ramo. La cuarta y quinta muestran el estado vacío. `/?term=7` muestra una
advertencia, sin devolver silenciosamente todo el catálogo. Geometría ilustra un
ramo sin materiales; el semestre 4 tampoco tiene ramos de ejemplo.

En las rutas de ramo se usan `tipo=listados|apuntes|certamenes`, `anio`, `periodo`
y `numero`. Se reutilizan las validaciones académicas de la portada, cuyo contrato
URL anterior se conserva. Parámetros desconocidos se ignoran; conocidos inválidos
o repetidos muestran errores y no devuelven materiales. Sin `tipo` se abre Listados.

## Arquitectura y límites

```text
src/app/                 Layout, catálogo, fichas públicas y endpoint de archivos
src/components/catalog/  Buscador, semestres, fichas y carga
src/components/layout/   Navegación compartida, breadcrumbs y avisos
src/components/theme/    Control de tema (cliente)
src/components/materials/ Lectores interactivos, toolbar y reporte simulado
src/components/ui/       Primitivas reutilizables, incluido Button existente
src/domain/              Tipos del catálogo
src/fixtures/            Ejemplos explícitamente ficticios
src/lib/catalog/         Consulta, proyección pública y contrato de filtros URL
src/lib/materials/       Fuente de archivos solo servidor, nombres y navegación
src/lib/theme.ts         Preferencia y script inicial del tema
public/demo/             Muestras originales intencionalmente públicas
scripts/                 Preparación PDF.js y generación opcional de muestras
tests/                   node:test y navegador Chromium vía CDP
```

No hay pantallas de aporte, moderación ni favoritos; no hay
Supabase, autenticación, subida ni publicación reales. Los reportes son una simulación sin backend. Las
funciones futuras se señalan como **Próximamente**, no como acciones activas.
El filtrado de fixtures no sustituye permisos de servidor/RLS en hitos futuros.
El prototipo incluye metadata `noindex`. Los fixtures incluyen casos pendientes y
rechazados para comprobar su exclusión de la proyección pública, incluidas facetas
y acceso por ID. No se envían nombres originales al cliente.

El kit original y su mockup estático se conservan en `README_HITO1.md` y
`prototype/`; no son la aplicación implementada. Criterios y pruebas manuales:
[`docs/HITO_1_1.md`](docs/HITO_1_1.md) (histórico) y
[`docs/HITO_1_2.md`](docs/HITO_1_2.md) (catálogo) y
[`docs/HITO_1_3.md`](docs/HITO_1_3.md) (lector, seguridad, pruebas y límites).
**Hito 1.4 no iniciado: requiere aprobación.**

## Dependencias del lector

React-PDF **11.0.0** (React 19+, Node 22.13+) y PDF.js **6.3.289** exactos,
compatibles con Next 16.4.2 / React 19.3.0 / Node 26.11.1 instalados.
PDF.js es dependencia directa para resolver el worker con pnpm sin hoisting adicional.
El worker se empaqueta localmente; `predev` y `prebuild` copian fuentes estándar,
cMaps y WASM de esa misma versión a `public/pdfjs/` (generado, ignorado en Git).
No hay CDN de documentos, worker ni fuentes. El motor PDF se carga dinámicamente
en cliente, sin SSR y sin incorporarse a las páginas de exploración.
