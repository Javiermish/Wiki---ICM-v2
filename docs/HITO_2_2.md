# Hito 2.2 — Catálogo académico persistente

## Estado

**Completado y aprobado para la V1 el 23-10-2026 por decisión expresa del usuario.** Catálogo persistente, administración y solicitudes con revisión auditada entregados; soft-404 corregidos y regresiones públicas previas satisfactorias. Se acepta no realizar por ahora las pruebas adicionales de RLS remoto con cuentas temporales, considerando la evidencia local y manual. No se presentan como ejecutadas ni aprobadas.

RLS y todos los controles de seguridad permanecen intactos. Se conservan los procedimientos de QA autenticada, limpieza y runners históricos para uso futuro autorizado. En este cierre no se realizaron nuevas pruebas remotas ni cambios en Supabase; no se inicia Hito 2.3 ni se hace commit/push.

Última verificación exclusivamente local: lint/build PASS; suite vigente `pnpm test` con SQL efímero **159 PASS, 9 SKIP HTTP, 0 FAIL**; runner SQL completo y seed PASS. Navegador Auth **26 PASS** con campos deshabilitados; materiales **29 PASS/12 FAIL** por prerrequisitos de catálogo ausentes. HTTP focalizado **32 PASS/2 FAIL** (un caso de redirección y su contenedor: parámetro `error=configuration`). No se declara una ronda completa verde sin Supabase; evidencia anterior, comandos y límites en [QA_HITO_2_2.md](QA_HITO_2_2.md). Los resultados inferiores son históricos y no representan la ronda del cierre ni el estado remoto actual.

## Alcance

- PostgreSQL sustituye a los arreglos de ramos/áreas en la aplicación. No hay fallback académico a fixtures ante errores.
- `/`, `/semestres/[semestre]`, `/electivos`, búsqueda, filtros, selectores de aportes y `/ramos/[slug]` comparten el catálogo consultado.
- `/admin/ramos` requiere administrador verificado: creación, edición/reclasificación, archivo/restauración, búsqueda y filtro de estado.
- `/gestion/asignaturas` requiere cuenta verificada: propuestas con justificación y consulta de solicitudes propias.
- `/moderacion` distingue solicitudes persistentes de archivos/reportes DEMO. Moderadores y administradores aprueban/rechazan con confirmación y motivo.
- Los documentos de ejemplo y sus bytes permanecen locales. No hay R2, subidas reales, nuevas tablas de documentos ni moderación real de archivos. Los favoritos siguen siendo locales.

## Esquema

| Tabla | Función |
| --- | --- |
| `curricula` | Identidad de plan; semilla `plan-ilustrativo`. |
| `elective_areas` | Lookup de las cinco áreas exactas, orden y estado. |
| `courses` | Identidad y slug permanentes, plan, nombre/código, descripción, clasificación, estado, fechas y versión de concurrencia. |
| `course_creation_requests` | Propuesta original, justificación, solicitante, decisión, revisor/fecha/notas y ramo resultante. |
| `course_admin_events` | Auditoría de creación y cambios, con snapshot anterior/posterior. |
| `course_request_review_events` | Decisión append-only, actor, motivo y resultado. |

Todas tienen RLS. Visitantes solo leen catálogo activo; administradores pueden consultar archivados. La clasificación exige semestre entero 1–12 y área NULL para regulares; semestre NULL y FK de área para electivos. Nombres normalizados y códigos no vacíos son únicos por plan, incluyendo archivados. Los triggers normalizan entradas, protegen identidad y aumentan versión. La actualización web usa versión esperada, fijada al abrir la edición, para evitar sobreescrituras silenciosas.

La identidad V1 admite nombres latinos acentuados, dígitos ASCII y puntuación habitual, con el mismo alfabeto explícito en TS/SQL. Letras de otros alfabetos y superíndices se rechazan con validación; ampliarlos exige versionar la normalización. Esta decisión evita diferencias de casing/clasificación Unicode entre motores, sin modificar ningún nombre existente.

Se mantienen IDs de texto existentes (`demo-calculo-i`, etc.) sin una tabla de alias ni conversión innecesaria. Nuevos IDs son UUID representados como texto y sus slugs se fijan al crearlos (`ramo-<id>`); renombrar no altera enlaces.

Las categorías compartidas `materialCategories` conservan Listados, Apuntes y Certámenes sin insertar tres filas por ramo. El contrato `Course → CourseOffering → Material` mantiene el período documental independiente del semestre curricular y prepara la asociación en Hito 2.3, sin implementar almacenamiento.

## Autorización y revisión

Las acciones de servidor comprueban la cuenta y los roles actuales mediante el sistema del Hito 2.1. Los permisos de columnas y RLS vuelven a imponer autorización en PostgreSQL. El solicitante se fija mediante `default auth.uid()`; el cliente no puede asignar solicitante, estado, revisor ni fechas.

`review_course_request(request_id, decision, notes)` es una RPC restringida a revisores verificados. Bloquea la solicitud y autoridad, exige estado pendiente y aprueba creando ramo + resolución + eventos en una transacción. Si hay duplicado o falla una parte, no se publica nada y la solicitud permanece pendiente. Moderadores no obtienen permisos generales de escritura en `courses`.

La aplicación no expone claves privilegiadas. La lectura pública usa exclusivamente la configuración pública, un cliente sin sesión/cookies y `no-store`; `React.cache` deduplica solo dentro de la petición. `connection()` y Suspense separan el acceso dinámico del prerenderizado. Las mutaciones revalidan el layout y refrescan el cliente; no hay caché compartida de roles. En una caída del catálogo, se informa el error y las cuentas siguen accesibles; no se hidratan favoritos contra una lista vacía de emergencia.

## Migraciones y carga inicial

1. Consultar `docs/CATALOGO_SQL.md` para reconciliación segura del historial previo y aplicación; no reaplicar archivos históricos a ciegas.
2. Nueva estructura: `supabase/migrations/202610230001_catalog.sql`.
3. `supabase/migrations/202610230002_catalog_seed.sql`, generada desde `src/fixtures/catalog.ts`, conserva los **9 ramos: 6 regulares y 3 electivos**, IDs, slugs, nombres, códigos y clasificaciones. No representa una malla oficial.
4. Usar el generador y sus comprobaciones documentadas; la carga es idempotente y no sobrescribe modificaciones administrativas existentes.
5. Comparar el manifiesto inicial con PostgreSQL antes de aceptar la migración. Los documentos locales se asocian exclusivamente a IDs que existan en el catálogo consultado: jamás reintroducen ramos ausentes.

Los archivados dejan de ser públicos por RLS. No se eliminan sus filas, eventos ni archivos de ejemplo; las URLs estáticas de muestras deliberadamente públicas no son un mecanismo revocable de acceso. La ficha pública activa no debe exponer un ramo archivado. Los enlaces directos de muestras conservan lector y descarga aunque PostgreSQL falle o su ramo esté archivado: muestran el nombre documental local y un aviso, sin reconstruir nombre, código o clasificación del ramo desde fixtures. El acceso documental definitivo y sus referencias se implementarán en el hito autorizado correspondiente.

Las solicitudes tienen cuotas DB de 10 pendientes y 20 envíos en 24 horas por cuenta, protegidas con bloqueo transaccional, y unicidad de nombre normalizado pendiente por solicitante/plan. La cola consulta páginas de 50 registros y filtra estado en SQL; búsqueda de texto explícitamente limitada a la página visible.

## Cómo probar manualmente tras aplicar SQL autorizado

1. Sin sesión, abrir inicio, semestre 1, electivos y Cálculo I. Buscar `calculo`/`DEMO-C1` y filtrar áreas. Abrir Listados, Apuntes, Certámenes y un PDF local.
2. Como admin, abrir `/admin/ramos`, completar nombre, tipo y semestre o área; código opcional. Guardar y comprobar el nuevo ramo desde otra sesión anónima y tras recargar.
3. Editar nombre, semestre/área o tipo; confirmar que ID y slug no cambian. Intentar duplicar nombre/código incluyendo acentos y ramos archivados.
4. Abrir el mismo ramo en dos sesiones, guardar una edición e intentar guardar la anterior: debe rechazarse hasta recargar.
5. Archivar con confirmación; verificar desaparición pública y conservación en administración. Restaurar y comprobar su ruta original.
6. Como estudiante, enviar una propuesta con justificación; comprobar su estado tras recargar y que no aparece públicamente. Otra cuenta no debe verla ni poder revisar.
7. Como moderador, aprobar o rechazar con motivo. Verificar persistencia, único ramo por aprobación y bloqueo de una segunda decisión. Verificar que el moderador no puede administrar arbitrariamente ramos.
8. Probar móvil/escritorio, teclado, foco, claro/oscuro, errores de red y estados vacíos.

## Verificación y límites

Los tests `persistent-actions` y `persistent-reader` ejecutan servicios con dobles SDK: comprueban validación, contratos, identidad, errores y autorización de servidor, **no demuestran RLS ni Supabase real**. `persistent-catalog` ejecuta mapeo y asociación real de muestras; las pruebas SQL se ejecutan aparte contra PostgreSQL local. Las suites HTTP antiguas requieren `WIKI_TEST_BASE_URL` y un catálogo inicial cargado; no son equivalentes a la suite unitaria predeterminada.

### Resultados ejecutados el 23-10-2026

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | PASS, sin errores/advertencias ESLint. |
| `pnpm build` | PASS, Next 16.4.2; sin Blocking Route. |
| `pnpm test` | 156 pruebas: 147 PASS, 9 suites HTTP opt-in omitidas, 0 fallos. |
| `node scripts/generate-catalog-seed.mjs --check` | PASS: 9 ramos y 5 áreas coinciden con fixtures; verifica también el inspector SQL. |
| Runner SQL local descrito abajo | PASS: 4 migraciones, inspector de seed, 5 suites SQL y concurrencia con dos conexiones reales. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3102 node --test tests/auth-routes.test.mjs tests/materials.test.mjs tests/moderation-routes.test.mjs` | 34 PASS, 0 fallos. Auth anónima, callback malformado inocuo, rutas protegidas y lector/bytes/descargas de muestras en cuatro formatos, privacidad HTML/RSC/JS. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3102 node tests/browser-persistent-catalog.mjs` | 12 comprobaciones PASS en 1280/390 px; claro/oscuro, teclado, sin overflow, errores explícitos y login accesible. Sin errores ni advertencias de consola, fallos de red o peticiones inesperadas. |
| `git diff --check` | PASS. |

```sh
LD_LIBRARY_PATH=/tmp/opencode/wiki-catalog-sql/node_modules/@embedded-postgres/linux-x64/native/lib \
WIKI_EMBEDDED_POSTGRES_MODULE=/tmp/opencode/wiki-catalog-sql/node_modules/embedded-postgres/dist/index.js \
node scripts/run-catalog-sql-tests.mjs
```

La dependencia opcional de QA ya existía fuera del repositorio; no se instalaron dependencias de aplicación. Ver `docs/QA_POSTGRES_LOCAL.md` para otra máquina. PostgreSQL 18.4 nativo ejecuta RLS, permisos, triggers, rollback de fallos de auditoría y bloqueo real; Auth y roles del harness son sintéticos, no GoTrue/PostgREST. Evidencia final SQL: `/tmp/opencode/wiki-sql-qa-XMSXNA/report.json`. Evidencia final navegador y 12 capturas: `/tmp/opencode/wiki-persistent-catalog-1792782429773/report.json`; se inspeccionaron también capturas de móvil y escritorio.

La primera prueba HTTP de documentos detectó que el lector dependía del catálogo caído; se corrigió para conservar las muestras locales sin fallback académico, y la suite completa focalizada se repitió con 34 PASS. La primera ronda de navegador registró React #441 en la ficha de ramo sin DB; se sustituyó por un estado explícito y las dos últimas rondas no tienen errores de consola. Las revisiones de seguridad cerraron los hallazgos de normalización y cuotas tras pruebas focales y SQL reales.

Persisten avisos de Node `MODULE_TYPELESS_PACKAGE_JSON` al ejecutar TypeScript nativo, y el aviso esperado de PDF.js al probar un PDF corrupto; no se modificó la configuración de módulos solo para silenciarlos.

**No comprobado:** catálogo público con tablas accesibles desde Supabase, mutaciones administrativas/solicitudes autenticadas vía PostgREST real y sus pantallas en navegador. Las suites HTTP de exploración que requieren seed accesible no se presentan como aprobadas. Los scripts históricos `browser-courses.mjs` y `browser-moderation.mjs` prueban flujos DEMO anteriores y no equivalen a pruebas de mutaciones persistentes; no ejecutarlos contra catálogo real sin adaptar identidad/aislamiento. No se utilizaron credenciales de estudiantes/admin ni se modificaron usuarios, perfiles o roles remotos.

## Archivos de esta entrega (nuevos y modificados)

```text
docs/BRIEF_PRODUCTO.md
docs/DISENO.md
docs/MODELO_DOMINIO.md
docs/CATALOGO_SQL.md
docs/HITO_2_2.md
docs/QA_POSTGRES_LOCAL.md
docs/superpowers/plans/2026-10-23-catalogo-persistente.md
scripts/generate-catalog-seed.mjs
scripts/run-catalog-sql-tests.mjs
scripts/test-catalog-concurrency.mjs
src/app/admin/ramos/page.tsx
src/app/error.tsx
src/app/gestion/asignaturas/page.tsx
src/app/layout.tsx
src/app/materiales/[id]/page.tsx
src/app/mi-cuenta/page.tsx
src/app/moderacion/page.tsx
src/app/not-found.tsx
src/app/ramos/[slug]/page.tsx
src/app/semestres/[semestre]/page.tsx
src/components/auth/auth-shell.tsx
src/components/catalog/course-catalog-provider.tsx
src/components/catalog/course-content.tsx
src/components/catalog/elective-catalog.tsx
src/components/catalog/favorites-provider.tsx
src/components/catalog/persistent-catalog-shell.tsx
src/components/catalog/semester-content.tsx
src/components/courses/course-manager.tsx
src/components/courses/course-requests.tsx
src/components/layout/prototype-notice.tsx
src/components/layout/site-footer.tsx
src/components/layout/site-header.tsx
src/components/materials/material-content.tsx
src/components/moderation/moderation-workspace.tsx
src/domain/auth.ts
src/domain/catalog.ts
src/domain/course-management.ts
src/lib/catalog/actions.ts
src/lib/catalog/persistent.ts
src/lib/catalog/request-pagination.ts
src/lib/catalog/rows.ts
supabase/migrations/202610230001_catalog.sql
supabase/migrations/202610230002_catalog_seed.sql
supabase/tests/catalog.sql
supabase/tests/catalog_quotas.sql
supabase/tests/catalog_seed.sql
supabase/tests/inspect_auth_schema.sql
supabase/tests/inspect_catalog_seed.sql
tests/academic-routes.test.mjs
tests/auth-routes.test.mjs
tests/auth.test.mjs
tests/course-routes.test.mjs
tests/header-navigation.test.mjs
tests/browser-persistent-catalog.mjs
tests/persistent-actions.test.mjs
tests/persistent-catalog.test.mjs
tests/persistent-course-route.test.mjs
tests/persistent-reader.test.mjs
tests/persistent-sample-reader.test.mjs
tests/persistent-ui.test.mjs
```

No se eliminan fixtures, archivos del visor ni muestras. Cambios sin commit/push. No hay despliegue ni avance al Hito 2.3.
