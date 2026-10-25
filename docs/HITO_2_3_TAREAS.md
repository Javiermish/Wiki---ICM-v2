# Hito 2.3 — Tareas (24-10-2026)

## Resultado y límites

`tarea` es la cuarta categoría. Número obligatorio 1–999; sección, profesor y versión opcionales. Nombre académico `Tarea 2 - 2025-1`, descarga PDF `Tarea 2 - 2025-1.pdf`; no se infieren metadatos desde el nombre original o fecha de subida.

Se extienden catálogo, categorías vacías de cada ramo, búsqueda, filtros compartibles (`category=tarea`, `tipo=tareas`), aporte/corrección y contadores de ramos/favoritos. Visor, descarga, favoritos por ID y revisión reutilizan mecanismos existentes. Sin nuevos fixtures ni cambios de datos académicos.

**Hito 2.3 completado para V1:** el usuario confirmó el 24-10-2026 subida de Tarea PDF, persistencia, aprobación/publicación, visualización y descarga reales contra Supabase/R2. También confirmó Listado rechazado fuera del catálogo y estados `approved`/`rejected`, cargas `ready` y auditoría mediante consulta directa. [Cierre, pruebas actuales y limitaciones](HITO_2_3.md). Las pruebas inferiores son evidencia histórica local, no validación remota adicional. Sin avance al Hito 2.4.

## Migración incremental

- Nueva: `supabase/migrations/202610240001_material_tasks.sql`.
- Histórica intacta: `202610230003_materials.sql`, ya aplicada remotamente según el operador.
- Amplía `materials_category_check` y reemplaza `reserve_material_upload` cambiando solo la allowlist. `CREATE OR REPLACE` conserva identidad y ACL.
- Las restricciones existentes ya exigen número para toda categoría distinta de apunte. RLS y vista pública no enumeran categorías: mantienen aislamiento y `approved AND ready`, sin cambios.
- No actualiza filas ni crea/elimina recursos R2. Sustituir el CHECK toma bloqueo de tabla: programar su aplicación cuando sea apropiado.
- La nota anterior de aplicación remota pendiente queda superada por el cierre de integración real reportado por el usuario. Se conserva la incremental aplicada, sin editar ni reaplicar SQL en este cierre.

## Pruebas ejecutadas

- `pnpm lint`: PASS.
- `pnpm build`: PASS (compilación, TypeScript y generación).
- `WIKI_TEST_PRODUCTION_MANIFEST=true pnpm test`: **201 pruebas, 191 PASS, 10 SKIP opt-in, 0 FAIL**. Log: `/tmp/opencode/wiki-tasks-unit-tests.log`. Incluye tareas: número, nombres, opcionales, filtros, proyección pública, favoritos y corrección de moderación; regresiones de visor/descarga y manifiesto dinámico.
- Red/green: las tres nuevas pruebas de `tests/tasks.test.mjs` fallaron antes del cambio y pasaron después.
- `WIKI_EMBEDDED_POSTGRES_MODULE=/tmp/opencode/wiki-catalog-sql/node_modules/embedded-postgres/dist/index.js node scripts/run-catalog-sql-tests.mjs`: PASS, PostgreSQL 18.4 efímero; seis migraciones, suites Auth/catálogo/materiales/tareas y concurrencia. Compara fila/oferta anterior, funciones, ACL/RLS e integridad antes/después. Evidencia: `/tmp/opencode/wiki-sql-qa-ghj4gh/report.json`.
- `WIKI_TEST_BASE_URL=http://127.0.0.1:3107 node tests/browser-tasks.mjs`: **9 comprobaciones PASS**, ocho capturas; 375/768/1280/1440 px × claro/oscuro, cuarta categoría activa, filtros, etiquetas, tabulación Certámenes→Tareas y ausencia de desbordes. Catálogo global acepta `tarea`; sin errores de navegador ni solicitudes inesperadas. Evidencia: `/tmp/opencode/wiki-tasks-1792813592787/report.json`. Capturas móviles clara/oscura inspeccionadas; Tareas pasa a segunda línea sin ocultarse. Dos intentos iniciales fallaron por navegación/selector del test, corregidos sin cambios de producto.
- `git diff --check`: PASS.

Auth PostgreSQL es sintética: no valida GoTrue/PostgREST ni R2 real. Browser público solo de lectura, sin aporte autenticado/publicación. No se repitió la suite browser global con limitaciones documentadas en Hito 2.3. Avisos conocidos Node `MODULE_TYPELESS_PACKAGE_JSON` y PDF.js (PDF corrupto/fuentes) continúan. Accesibilidad básica, no auditoría integral.

## Archivos de esta ampliación

Dominio y consultas:
- `src/domain/catalog.ts`
- `src/domain/contribution.ts`
- `src/lib/catalog/query.ts`
- `src/lib/catalog/filters.ts`
- `src/lib/catalog/course-filters.ts`
- `src/lib/materials/rows.ts`

Interfaz:
- `src/components/catalog/elective-catalog.tsx`
- `src/components/catalog/semester-content.tsx`
- `src/components/catalog/favorites-content.tsx`
- `src/components/courses/course-manager.tsx`
- `src/components/materials/material-content.tsx`
- `src/components/contributions/contribution-form.tsx`
- `src/components/moderation/metadata-editors.tsx`

SQL y pruebas:
- `supabase/migrations/202610240001_material_tasks.sql` (nuevo)
- `supabase/tests/material_tasks.sql` (nuevo)
- `scripts/run-catalog-sql-tests.mjs`
- `tests/tasks.test.mjs` (nuevo)
- `tests/browser-tasks.mjs` (nuevo; runner independiente)
- `tests/contribution.test.mjs`
- `tests/course-management.test.mjs`
- `tests/dynamic-catalog.test.mjs`
- `tests/academic-routes.test.mjs`
- `tests/moderation.test.mjs`

Documentación:
- `README.md`
- `docs/BRIEF_PRODUCTO.md`
- `docs/MODELO_DOMINIO.md`
- `docs/DISENO.md`
- `docs/HITO_2_3.md`
- `docs/QA_POSTGRES_LOCAL.md`
- `docs/HITO_2_3_TAREAS.md` (nuevo)
- `docs/superpowers/plans/2026-10-24-tareas.md` (nuevo)

Cambios previos preservados sin revertirlos ni atribuirlos a esta ampliación. Sin dependencias nuevas, SQL remoto, cambios R2, commit, push ni despliegue.
