# Hito 2.2 — Plan de implementación

**Objetivo:** catálogo persistente, administración y solicitudes revisadas en Supabase, preservando rutas y muestras locales.
**Arquitectura:** tablas normalizadas con RLS; lectura pública sin cookies; mutaciones con sesión comprobada en servidor y autorización PostgreSQL. IDs de texto conservan las nueve referencias existentes; los nuevos usan UUID serializado. No se migra almacenamiento de documentos.
**Stack:** Next.js 16, React 19, TypeScript, Supabase PostgreSQL/Auth.
**Especificación:** solicitud Hito 2.2 del usuario y docs/MODELO_DOMINIO.md.

## Restricciones
- Sin SQL remoto, reset, commit, push, despliegue ni Hito 2.3.
- Las cinco áreas iniciales son Numérico, Discreta, Optimización, Estadística y Otro.
- Nueve ramos ilustrativos existentes; no inventar malla oficial.
- Errores de base de datos visibles, nunca fallback académico a fixtures.

## Focos de revisión
- Doble aprobación concurrente: una sola transacción y bloqueo de solicitud.
- Duplicados con acentos/caja/puntuación y archivados: unicidad PostgreSQL.
- Identidad/slug inmutables al reclasificar, editar y archivar.
- Estudiantes no pueden crear catálogo ni resolver solicitudes mediante API directa.
- Suspense antes de lecturas dinámicas; no regresiones Auth/Blocking Route.

## Tareas
- [x] SQL: migración nueva, seed idempotente generado desde fixtures, pruebas PostgreSQL/RLS, instrucciones de reconciliación CLI con comprobación previa.
- [x] Servicios: lector público y acciones servidor, validación compartida, traducción de filas, errores explícitos y revalidación.
- [x] UI: provider persistente y rutas públicas dinámicas; reutilizar gestión en /admin/ramos y solicitudes propias en /gestion/asignaturas; revisión real junto al workspace de archivos demo.
- [x] Verificar localmente: pruebas existentes y nuevas, lint, build, SQL/RLS/concurrencia real y navegador de error/Auth/muestras; distinguir simulación de integración real.
- [x] Documentar: esquema, archivos, operaciones y configuración externa pendiente. No declarar hito completo sin Supabase real.
- [ ] Integración remota: reconciliación/aplicación solo tras autorización explícita; comprobar lectura y mutaciones autenticadas vía Supabase/PostgREST y navegador con catálogo accesible.

## Archivos previstos
- supabase/migrations/*catalog*.sql, supabase/tests/catalog.sql, scripts/generate-catalog-seed.mjs.
- src/lib/catalog/{persistent,actions}.ts y src/components/catalog/course-catalog-provider.tsx.
- src/components/courses/*, src/app/admin/ramos/page.tsx, src/app/gestion/asignaturas/page.tsx, src/app/moderacion/page.tsx.
- src/app/layout.tsx, src/app/ramos/[slug]/page.tsx y consumidores de data.ts.
- tests/*, docs/HITO_2_2.md, docs/{BRIEF_PRODUCTO,MODELO_DOMINIO,DISENO}.md.

La ejecución autónoma y las decisiones técnicas menores están autorizadas en la solicitud. Se delegan SQL y UI por especialización; la integración compartida se realiza en la sesión principal. Cambios sin commit.
