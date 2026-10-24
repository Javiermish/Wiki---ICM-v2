# SQL catálogo — Hito 2.2

Implementación versionada; **el operador informa las cuatro migraciones aplicadas en remoto**. La validación final confirma catálogo público accesible, pero no ha verificado independientemente el historial/esquema completo ni las operaciones con sesiones reales: [QA_HITO_2_2.md](QA_HITO_2_2.md). Las notas de no ejecución por el agente y los procedimientos inferiores son históricos, no instrucciones para reaplicar migraciones. Depende de `202610220001_profiles_roles.sql` y `202610220002_backfill_existing_accounts.sql`, sin modificarlas. IDs de texto preservan los nueve ramos y sus rutas de ejemplo. No representan la malla oficial. No crea documentos, ofertas, favoritos ni Storage; el período académico sigue siendo independiente de `curricular_semester`. Archivos futuros siguen la decisión Cloudflare R2 privado.

## Archivos y contrato

- `202610230001_catalog.sql`: `curricula`, `elective_areas`, `courses`, `course_creation_requests`, `course_admin_events`, `course_request_review_events`; todas con RLS.
- `202610230002_catalog_seed.sql`: un plan ilustrativo, cinco áreas y exactamente los nueve ramos de `src/fixtures/catalog.ts`. `ON CONFLICT DO NOTHING` en todas las inserciones; conserva cambios, versiones y timestamps existentes. Un conflicto diferente de ID también se omite: revisar divergencias, nunca asumir que el seed reparó datos existentes.
- `scripts/generate-catalog-seed.mjs`: importa los fixtures mediante el soporte TypeScript nativo de Node >=22.18, sin dependencias, conexiones ni extracción aproximada con regex. Las áreas provienen del mismo objeto `demoCatalog`. El aviso de Node por package sin `type: module` es inocuo; no cambiar configuración del proyecto para silenciarlo. Después de aplicar una migración no regenerarla para nuevos datos: crear otra migración versionada.

`courses`: `id text DEFAULT gen_random_uuid()::text`, `slug text UNIQUE`, `curriculum_id text`, `name`, `code NULL`, `description NULL`, `kind regular/elective`, `curricular_semester int NULL`, `elective_area_id text NULL`, `status active/archived`, fechas y `version int` inicial 1. El trigger genera slug `ramo-{id}` si se omite. `id`, `slug`, `created_at` son inmutables; API ni siquiera tiene grants para escribirlos. `version` y `updated_at` los impone el trigger. Editar con `WHERE id = :id AND version = :expected_version`, solicitar fila de retorno y tratar cero filas como conflicto; el valor incrementa exactamente una vez. No existe DELETE API. Campos `name_key/code_key` son calculados, no aceptados del cliente.

`curricula(id text,name,status)` y `elective_areas(id text,name,position int,status)` son lookups sembrados; API solo SELECT. Áreas se ordenan por `position,id`. Nuevos planes/áreas requieren operación SQL autorizada, no gestión de roles ni metadata.

`course_creation_requests`: `id uuid`, propuesta plana (`name,code,description,kind,curricular_semester,elective_area_id,curriculum_id`), `justification` 10–2000 caracteres, `requested_by DEFAULT auth.uid()`, `status DEFAULT pending`, `created_at`, `reviewed_by`, `reviewed_at`, `review_notes`, `resulting_course_id text`. INSERT API solo propuesta/justificación e ID opcional; nunca autor/fechas/estado/revisor/resultado. Justificación y descripción aceptan saltos de línea, no otros controles. No UPDATE/DELETE API. Los CHECK de variante validan NULL explícitamente: regular requiere semestre entero 1–12 sin área; electivo exige área existente sin semestre.

RPC exacta:

```ts
rpc('review_course_request', { request_id: uuid, decision: 'approved' /* o rejected */, notes: texto })
// RETURNS text: ID del ramo creado al aprobar; null al rechazar.
```

Notas **obligatorias 1–1000** en ambas decisiones. `42501`: falta autoridad; `22023`: parámetros/recurso/plan/área inválidos o cuota; `55000`: ya resuelta; `23505`: duplicado; `23514`: CHECK; `23503`: FK. Traducir a mensajes seguros en servidor, no exponer SQL interno. Cliente de sesión normal, no service-role. Servidor debe validar antes de consultar; DB es la segunda frontera autoritativa.

## Permisos, duplicados y atomicidad

Anon lee solo activos de catálogo/lookups, sin ejecutar helpers privados. Autenticado lee activos; admin confirmado también archivados. Solo admin confirmado inserta/actualiza ramos directamente, con grants por columna y RLS. Confirmación y rol se leen de `auth.users`/`public.user_roles`, nunca claims de rol ni metadata. `private.is_verified_admin()` es el helper existente. Solicitante lee sus solicitudes/eventos de revisión; moderador/admin confirmado ve todas las solicitudes/revisiones. Solo admin ve auditoría general. Usuario sin correo confirmado no solicita ni revisa aunque DB le asigne admin. Los esquemas expuestos en PostgREST deben continuar excluyendo `private`.

Moderador **no** obtiene escritura general de catálogo: solo la RPC `SECURITY DEFINER`, `search_path=''`, calificación completa, EXECUTE revocado a PUBLIC/anon y otorgado a authenticated. Comprueba autoridad y bloquea correo/rol hasta commit; bloquea solicitud `FOR UPDATE`, permite solo `pending → approved/rejected`, publica únicamente la propuesta original (sin parámetros de corrección), escribe resultado y evento en la misma transacción. Segundo intento válido: `55000`. Duplicado o error de auditoría revierte todo. Puede haber propuestas del mismo nombre de diferentes solicitantes; reiteraciones pendientes del mismo solicitante/plan están bloqueadas.

Nombre canónico V1: NFD, elimina marcas U+0300–U+036F (acentos), convierte ASCII A–Z a a–z mediante tabla explícita y colapsa todo lo ajeno a `[a-z0-9]` como separador. No depende de `lower()` ni clases POSIX/locale. **El alfabeto admitido en nombres es latino descomponible a ASCII, números 0–9, puntuación ASCII y `–—‘’“”¿¡·`**; TS y SQL rechazan explícitamente letras griegas, superíndices y marcas extendidas en vez de discrepar sobre duplicados. Se mantienen los acentos en el nombre visible. Ampliar ese alfabeto requiere una versión nueva de normalización y análisis de colisiones; no cambiar índices aplicados a ciegas. Código: espacios colapsados, trim, mayúsculas; puntuación significativa (`ABC-1` no equivale a `ABC1`). Nombres/códigos normalizados únicos **por plan**, incluyendo archivados. Código vacío se vuelve NULL. Índices únicos resuelven carreras; no sustituirlos por SELECT previo. No hay normalización borrosa ni fusión silenciosa.

Solicitudes: máximo **10 pendientes y 20 envíos en una ventana móvil de 24 horas por solicitante** (incluye resueltas). Trigger `SECURITY DEFINER` privado sin EXECUTE API comprueba `auth.uid() = requested_by` y correo confirmado, toma `pg_advisory_xact_lock` por solicitante y cuenta filas antes de insertar; `22023` al superar cuota. El lock serializa conexiones concurrentes; no depende de rate limit del cliente. RLS y grants permanecen activos, sin aceptar `requested_by` del formulario. Índice único parcial `(requested_by,curriculum_id,private.course_name_key(name)) WHERE status='pending'` impide reiterar la misma propuesta pendiente (`23505`); otro usuario puede solicitarla sin ver datos ajenos. Resolver permite volver a proponer, pero no reinicia el límite diario. Es contención de abuso de esta operación, no reemplaza protección Auth/HTTP contra creación masiva de cuentas.

Triggers auditan cada INSERT/UPDATE de ramo (antes/después JSON, `actor_id = auth.uid()`) y cada resolución (actor, notas, resultado). Eventos append-only: sin INSERT/UPDATE/DELETE API y trigger contra UPDATE/DELETE/TRUNCATE incluso del operador. Seed/operación SQL sin sesión tiene actor NULL en evento general: significa operador/migración, no usuario anónimo autorizado; conservar log operativo. FK restrictivas conservan trazabilidad y pueden impedir borrar cuentas auditadas. Un superusuario puede deshabilitar triggers; la protección no cubre administradores de infraestructura.

## Pruebas exclusivamente locales

Nunca ejecutar `supabase/tests/*` contra una base compartida/remota. DB local desechable con Auth/roles de Supabase, ejecutar migraciones una sola vez, en orden:

```sh
node scripts/generate-catalog-seed.mjs --check
for f in supabase/migrations/*.sql; do
  psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || exit 1
done
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/catalog.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/catalog_quotas.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/profiles_roles.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/backfill_existing_accounts.sql
# Última: deja cambios deliberados de catálogo en la DB desechable.
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/catalog_seed.sql
```

`catalog.sql` hace rollback: permisos anónimos, estudiante, admin sin confirmar, moderador y admin; identidad impuesta; variantes; duplicados por nombre/código; archivados; versión; slug; aprobación/rechazo; segunda revisión; auditoría y fallo inyectado de auditoría con rollback de ramo/solicitud/eventos. `catalog_quotas.sql` hace rollback y cubre 10 pendientes, 20 diarias incluyendo rechazos, duplicado normalizado, cuotas independientes, aislamiento entre usuarios y atribución de actor. `catalog_seed.sql` ejecuta la migración seed real varias veces y compara filas completas y eventos, también después de ediciones administrativas. Contiene COMMITs intencionales y no restaura esas ediciones: descartar DB al finalizar.

Resultado local 2026-10-23: PostgreSQL real 18.4 mediante `embedded-postgres` instalado solo bajo `/tmp/opencode/wiki-catalog-sql`, roles/RLS/grants reales y **doble mínimo explícito de Supabase Auth**, no servicio completo. Suite detectó primero ausencia de `public.courses` y, para cuotas, aceptación indebida del duplicado; después de implementar pasan **las cuatro migraciones y las cinco suites** (`catalog`, `catalog_quotas`, `profiles_roles`, `backfill_existing_accounts`, `catalog_seed`). Runner temporal también abrió dos conexiones reales: inserción 11 bloqueada hasta commit de inserción 10 y luego `22023`; segunda revisión bloqueada hasta commit de primera aprobación y luego `55000`, con un único evento. Se verificó `pg_stat_activity.wait_event_type = 'Lock'` antes de liberar cada transacción. Comando local (sin credenciales remotas):

```sh
LD_LIBRARY_PATH=/tmp/opencode/wiki-catalog-sql/node_modules/@embedded-postgres/linux-x64/native/lib \
  node /tmp/opencode/wiki-catalog-sql/run.mjs
```

El runner temporal no es dependencia ni archivo del proyecto; los comandos psql de arriba son el procedimiento permanente reproducible. Servidor local apagado al finalizar. No es prueba de PostgREST/Supabase real. Lint/build y UI corresponden a integración de la sesión principal.

## Reconciliar dos migraciones anteriores aplicadas manualmente

**Procedimiento para un operador autorizado; no ejecutado por el agente.** SQL Editor puede haber aplicado `0001/0002` sin registrar historial CLI. No inferir que faltan tablas porque `migration list` las muestre pendientes. No ejecutar `db reset`, reaplicar `0001`, reparar a ciegas ni hacer `db push` para averiguar qué ocurre.

1. Confirmar proyecto/ref/entorno y versión CLI con el operador. Tener respaldo y ventana de revisión; comandos linked solo con autorización de acceso al proyecto. No incluir credenciales en documentación/logs/Git.
2. Inspeccionar historial y esquema en **solo lectura**. Ejecutar consultas de `docs/AUTH_SQL.md` (tablas, backfill, políticas, grants, trigger) y `supabase/tests/inspect_auth_schema.sql`. Comparar todas las definiciones con `202610220001_profiles_roles.sql`: columnas/tipos/defaults/FK/CHECK/índices, RLS, políticas/grants, funciones con `SECURITY DEFINER/search_path`, trigger Auth. Confirmar efecto de `0002`: ninguna cuenta sin perfil/rol, preservación de roles existentes. Ausencia de filas faltantes por sí sola no demuestra la aplicación de `0002`; contrastar registro operacional del SQL Editor. No mostrar correos ni datos personales.
3. Si hay cualquier diferencia, instalación parcial, versión ya registrada distinta o falta evidencia: **detenerse y reconciliar manualmente**, sin DROP ni reset. No usar repair para ocultar divergencias.
4. Solo tras comprobar equivalencia y confirmar autorización para **cambiar historial**:

```sh
supabase --version
supabase migration list --linked
supabase migration repair 202610220001 202610220002 --status applied --linked
supabase migration list --linked
```

`repair --status applied` solo registra historial; no valida ni ejecuta el SQL. Deben quedar aplicadas exactamente las dos versiones anteriores. Con autorización aparte, revisar `supabase db push --dry-run --linked`: solo debería proponer `202610230001` y `202610230002`. La aplicación real requiere autorización explícita adicional; **no se ejecuta push ni reset desde esta tarea**. Conservar registro del operador, inspección y comandos. Si el proyecto tiene otras migraciones, reconciliarlas antes; nunca marcar nuevas versiones como aplicadas sin haber aplicado su SQL.

## Aplicar nuevas versiones y comprobar carga (operador, solo tras autorización)

Con el historial reconciliado y backup revisado, el operador autorizado puede ejecutar:

```sh
node scripts/generate-catalog-seed.mjs --check
supabase db push --dry-run --linked
# Revisar que únicamente propone 202610230001 y 202610230002.
# SOLO con autorización explícita para aplicar SQL:
supabase db push --linked
supabase migration list --linked
```

El `db push` de Supabase es aplicación de migraciones SQL, **no** `git push`; el agente no ejecutó ninguno de los dos. No usar `--include-all` para forzar historial divergente.

Antes de cualquier edición de catálogo, ejecutar en SQL Editor o conexión autorizada de **solo lectura** `supabase/tests/inspect_catalog_seed.sql`. Debe devolver **9 `MATCH` de ramos y 5 `MATCH` de áreas**. El archivo lo genera el mismo script desde fixtures y compara IDs, slugs, plan, nombres, códigos, descripción, tipo, semestre/área y estado; no borra ni corrige filas. `MISSING` revela una carga incompleta/conflicto; `DIFFERS` exige inspección, no resembrar ni sobrescribir a ciegas. Después de editar desde la aplicación, las diferencias respecto de la semilla pueden ser legítimas. No ejecutar los otros tests SQL destructivos/locales en remoto.

Después comprobar API anónima, UI y flujos autenticados de `docs/HITO_2_2.md`. Las pruebas locales con Auth sintética no sustituyen este paso.
