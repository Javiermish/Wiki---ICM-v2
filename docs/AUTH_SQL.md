# Auth SQL — Hito 2.1

Alcance: `supabase/migrations/202610220001_profiles_roles.sql` y `202610220002_backfill_existing_accounts.sql`. No se aplica a remoto desde esta tarea. No crea catálogo, ofertas, materiales, favoritos ni Storage. La separación semestre curricular/período académico permanece intacta. Esta especificación reemplaza, para autenticación, la propuesta histórica de guardar `role` dentro de `profiles`: los privilegios viven exclusivamente en `user_roles`.

## Aplicación manual: SQL Editor, como postgres

Diagnóstico comunicado por el usuario, **no inspeccionado desde esta tarea**: esquema `public` sin tablas ni migraciones y una cuenta Auth confirmada. Confirmar proyecto/entorno antes de ejecutar. No borrar ni recrear la cuenta: confirmar el correo no crea por sí solo las tablas de la aplicación.

1. En **Supabase → SQL Editor**, seleccionar el proyecto autorizado y rol SQL **postgres**. Ejecutar primero las consultas de inspección de abajo, sin modificar datos.
2. Solo si `0001` no está aplicada y no hay objetos incompatibles, pegar y ejecutar **todo** `supabase/migrations/202610220001_profiles_roles.sql` **una sola vez**. Crea tablas, RLS, grants, RPC, trigger para nuevas cuentas y ya rellena las cuentas existentes. Si los objetos ya existen o hay una instalación parcial, detenerse y revisar; no repetir `0001`, ni usar DROP/reset para sortear errores.
3. Después de `0001`, pegar y ejecutar **todo** `supabase/migrations/202610220002_backfill_existing_accounts.sql`. **Precondición obligatoria: `0001` aplicada correctamente.** `0002` es transaccional y reejecutable: inserta perfiles/roles faltantes mediante `ON CONFLICT DO NOTHING`, nunca actualiza filas existentes y no importa metadata. No modifica `auth.users`, grants, triggers ni roles existentes; los roles nuevos son exclusivamente `student`.
4. Ejecutar las consultas de verificación posteriores. Con la única cuenta confirmada descrita y sin cambios posteriores de rol, se esperan **1 cuenta Auth, 1 confirmada, 1 perfil, 1 rol student, 0 moderator, 0 admin y 0 filas faltantes**. Ni `0001` ni `0002` crean administradores automáticamente. No hace falta ejecutar el bootstrap de administrador para reparar esta cuenta.
5. Probar inicio de sesión y `/mi-cuenta`; debe mostrar el perfil y rol student. Esto requiere una comprobación manual real y no queda validado por los tests locales.

**SQL Editor no registra automáticamente estos archivos en `supabase_migrations.schema_migrations`.** Conservar el registro operativo de qué archivo se aplicó y cuándo; la ausencia de historial CLI no prueba ausencia del esquema. No ejecutar `supabase db push`, reparar historial ni reaplicar `0001` por ese motivo. Una futura gestión mediante CLI requiere autorización y conciliación explícita del historial por otra vía. **Nunca ejecutar `supabase/tests/*` sobre remoto**: contienen usuarios sintéticos y operaciones privilegiadas de prueba.

### Inspección de solo lectura (antes de aplicar)

```sql
SELECT current_user, current_database();
SELECT to_regclass('public.profiles') AS profiles,
       to_regclass('public.user_roles') AS user_roles,
       to_regclass('public.role_change_events') AS role_change_events,
       to_regclass('supabase_migrations.schema_migrations') AS cli_history;
SELECT count(*) AS auth_accounts,
       count(*) FILTER (WHERE email_confirmed_at IS NOT NULL) AS confirmed_accounts
FROM auth.users;
```

Estas consultas no requieren ni muestran un correo o UUID personal. Tablas NULL y cuenta confirmada existente explican por qué Auth funciona pero falta el perfil. El trigger no existía cuando se registró la cuenta; `0001` incluye backfill para esa situación.

### Verificación de solo lectura (después de aplicar)

Ejecutar solo después de comprobar que existen las tablas. Los conteos son globales, no una afirmación sobre datos remotos leídos por el agente.

```sql
SELECT count(*) AS auth_accounts,
       count(*) FILTER (WHERE email_confirmed_at IS NOT NULL) AS confirmed_accounts,
       count(*) FILTER (WHERE p.id IS NULL) AS missing_profiles,
       count(*) FILTER (WHERE r.user_id IS NULL) AS missing_roles
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.user_roles r ON r.user_id = u.id;
SELECT count(*) AS profiles FROM public.profiles;
SELECT role, count(*) AS accounts FROM public.user_roles GROUP BY role ORDER BY role;

-- Tres filas; RLS activa en todas.
SELECT c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'user_roles', 'role_change_events');
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'user_roles', 'role_change_events')
ORDER BY tablename, policyname;

-- Solo la última columna debe ser true; ninguna escritura API de roles.
SELECT has_table_privilege('anon', 'public.profiles', 'SELECT') AS anon_profile_read,
       has_table_privilege('authenticated', 'public.user_roles', 'UPDATE') AS api_role_update,
       has_table_privilege('authenticated', 'public.user_roles', 'INSERT') AS api_role_insert,
       has_table_privilege('authenticated', 'public.user_roles', 'DELETE') AS api_role_delete,
       has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE') AS api_date_update,
       has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE') AS api_name_update;
SELECT grantee, table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'user_roles', 'role_change_events')
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, table_name, column_name, privilege_type;

-- Una fila: trigger habilitado (O), AFTER INSERT → private.handle_new_account().
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition,
       p.prosecdef AS security_definer, p.proconfig
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'auth.users'::regclass
  AND t.tgname = 'on_auth_user_created' AND NOT t.tgisinternal;
```

`0002` no sustituye un trigger ausente/deshabilitado ni repara políticas ajenas: revisar la definición de `0001` si la inspección difiere. No deshabilitar RLS ni conceder escrituras de roles para resolver errores de la app.

## Contrato para servidor/UI

- `profiles`: `id uuid`, `display_name text NOT NULL` (vacío inicialmente, máximo 80 caracteres), `created_at timestamptz`, `updated_at timestamptz`. Usuario autenticado lee solo su fila y actualiza exclusivamente `display_name`; el trigger establece `updated_at`. El servidor debe validar/normalizar el nombre y nunca aceptar identidad o fechas como campos de escritura.
- `user_roles`: `user_id uuid`, `role text` (`student | moderator | admin`). Lectura propia; administradores con correo confirmado pueden leer todas las filas. Ninguna escritura desde roles API.
- `role_change_events`: `id uuid`, `target_user_id uuid`, `actor_id uuid`, `old_role text`, `new_role text`, `reason text`, `created_at timestamptz`. Solo administradores verificados leen; nadie en API inserta/modifica/borra. Historial paginable con `.order('created_at', { ascending: false }).order('id').range(0, 49)` y filtro opcional por `target_user_id`.
- RPC `public.list_account_users(page_size integer DEFAULT 50, page_offset integer DEFAULT 0)` devuelve filas `{user_id uuid,email text,display_name text,role text,email_confirmed_at timestamptz|null,created_at timestamptz}`. Tamaño 1–200, offset >=0, orden estable `auth.users.created_at DESC NULLS LAST, id`. Ejemplo cliente: `rpc('list_account_users', {page_size: 50, page_offset: 0})`. Administradores verificados exclusivamente. No se otorga SELECT sobre `auth.users`; se proyectan solo estas seis columnas mediante RPC.
- RPC `public.set_moderator(target_user_id uuid, enabled boolean, reason text)` retorna `void`. Todos los parámetros obligatorios. Motivo recortado, 1–1000 caracteres; destino existente y correo confirmado. Solo `student ↔ moderator`; `admin` nunca es destino modificable. Repetir el estado actual es no-op sin evento adicional. El servidor invoca con el cliente de sesión normal, nunca service-role.
- SQLSTATE: `42501` sin autorización o destino administrador; `22023` parámetros/destino inválidos. La UI no debe presentar errores internos SQL directamente.

## Protección

Nuevo usuario y backfill reciben siempre `student`, ignorando metadata editable y claims de rol. Ningún correo se convierte automáticamente en administrador. El backfill conserva filas existentes mediante `ON CONFLICT DO NOTHING`; la migración no convierte tablas históricas incompatibles: revisar esquema antes de aplicarla.

RLS activa en las tres tablas; columnas de actualización explícitas y sin grants INSERT/DELETE para API. Administrador tampoco puede editar perfiles ajenos directamente. Las RPC `SECURITY DEFINER` fijan `search_path = ''`, califican tablas y resuelven `auth.uid()`, verificación de correo y rol actual desde DB. No se confía en metadata/JWT para el rol ni para la confirmación. Helpers están en esquema `private` (no añadir a esquemas expuestos por PostgREST); solo `is_verified_admin()` tiene EXECUTE para authenticated por las policies. Triggers y RPC no son ejecutables por PUBLIC/anon. Propietario de migración debe ser el rol SQL privilegiado (`postgres`), no un rol API.

`set_moderator` bloquea autoridad/correo del actor y correo/rol del destino hasta commit; serializa cambios sobre un mismo destino y escribe rol/evento en la misma transacción. Sin evento no hay cambio. Historial append-only también mediante trigger UPDATE/DELETE/TRUNCATE. Un propietario/superusuario SQL puede deshabilitar triggers: no existe garantía contra el administrador de infraestructura. Cambios de rol fuera de RPC están reservados a operación SQL privilegiada y deben incluir su evento en la misma transacción.

Los eventos tienen FK restrictivas a actor/destino para conservar trazabilidad; borrar una cuenta auditada queda bloqueado hasta disponer de un procedimiento explícito de retención/anonimización. No se habilita borrado de cuentas en este hito. No se exige confirmación para leer/editar el propio nombre, pero toda función administrativa sí la comprueba.

## Primer administrador: exclusivamente operador SQL

Primero registrar una cuenta real y confirmar su correo mediante Auth. Obtener su UUID desde el panel autorizado; no usar correos inventados ni editar metadata. Ejecutar manualmente desde **Supabase → SQL Editor** como `postgres` sobre el entorno autorizado. Reemplazar únicamente `REEMPLAZAR_POR_UUID_REAL` por ese UUID. **No ejecutar este procedimiento desde la app ni como migración automática.** También funciona en `psql`.

```sql
BEGIN;
SELECT set_config('wiki.bootstrap_user_id', 'REEMPLAZAR_POR_UUID_REAL', true);
LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  target uuid := current_setting('wiki.bootstrap_user_id')::uuid;
  previous text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'Ya existe un administrador; bootstrap no permitido';
  END IF;
  PERFORM 1 FROM auth.users WHERE id = target AND email_confirmed_at IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta inexistente o no confirmada'; END IF;
  SELECT role INTO previous FROM public.user_roles WHERE user_id = target FOR UPDATE;
  IF NOT FOUND OR previous <> 'student' THEN
    RAISE EXCEPTION 'Bootstrap requiere cuenta student inicializada';
  END IF;
  UPDATE public.user_roles SET role = 'admin' WHERE user_id = target;
  INSERT INTO public.role_change_events(target_user_id, actor_id, old_role, new_role, reason)
    VALUES (target, target, previous, 'admin', 'Bootstrap inicial mediante operador SQL autorizado');
END $$;
COMMIT;
```

En este evento especial `actor_id = target_user_id` identifica la cuenta inicializada; `reason` identifica el procedimiento SQL, no una sesión app. La identidad del operador debe quedar en los logs operacionales del proveedor. Administradores adicionales/recuperación requieren otro procedimiento SQL explícito auditado, fuera de esta RPC y de este hito.

## Pruebas reproducibles

Con un Supabase **local desechable** inicializado, sin variables de conexión remota:

```sh
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202610220001_profiles_roles.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/backfill_existing_accounts.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/profiles_roles.sql
```

Las pruebas usan usuarios sintéticos `example.invalid`, `SET LOCAL ROLE`, UID de sesión y rollback completo; no requieren pgTAP. Verifican metadata maliciosa, grants anónimos y de columnas, perfiles propios/ajenos, escalamiento, moderador sin facultades admin, administrador sin confirmar, UID vacío, listado/paginación, motivos inválidos, destino ausente/no confirmado, administrador protegido, idempotencia, revocación inmediata y contenido/inmutabilidad de auditoría. Una falla inyectada al insertar auditoría comprueba rollback del cambio de rol.

El rollback completo anterior corresponde a `profiles_roles.sql`. La suite nueva `backfill_existing_accounts.sql` **ejecuta el archivo real `0002` dos veces** mediante `\ir` (por eso requiere psql): sus COMMITs son intencionales y los cinco usuarios sintéticos se limpian explícitamente al finalizar. Si falla, descartar la DB local desechable. Cubre solo perfil, solo rol, ninguna fila y cuentas completas admin/moderator; compara todos los campos de perfiles existentes (nombre, created_at y updated_at), roles y todas las filas/campos de Auth antes/después. Comprueba metadata ignorada, creación sin exigir confirmación, idempotencia y denegación de cambio de rol/RPC por el estudiante reparado. No ejecutar esta suite sobre bases compartidas o remotas.

### Resultado ejecutado (2026-10-22)

Sin PostgreSQL/Supabase CLI instalado inicialmente. Se instaló `embedded-postgres` únicamente en `/tmp/opencode/wiki-auth-sql`, sin dependencias del proyecto; PostgreSQL real 18.4, servidor local temporal, apagado al terminar. Se crearon roles `anon/authenticated` y un esquema mínimo compatible `auth.users/auth.uid()` **como dobles explícitos de Supabase Auth**. Se aplicó la migración real, se comprobó backfill de cuenta preexistente con metadata `admin` hacia `student` y se ejecutó el archivo transaccional real. **PASS**: migración/backfill y todas las aserciones SQL (23 `assert_true` directas, una comprobación de actualización cruzada y 33 operaciones denegadas esperadas, incluyendo rollback ante fallo de auditoría). `git diff --check -- supabase docs/AUTH_SQL.md` sin incidencias.

### Revalidación del backfill independiente (2026-10-22)

Se reutilizaron **solo en lectura** las herramientas `embedded-postgres` previamente disponibles en `/tmp/opencode/wiki-auth-sql`; sin instalar dependencias. Archivos temporales nuevos, script, logs, sockets y DB dentro de `.next/sql-backfill` del repositorio. Comando ejecutado:

```sh
TMPDIR="$PWD/.next/sql-backfill" node .next/sql-backfill/run.mjs > .next/sql-backfill/run.log 2>&1
```

PostgreSQL real **18.4**, roles/grants/RLS/triggers reales y esquema mínimo `auth.users/auth.uid()` **doble explícito de Auth, no Supabase real**. Sin psql instalado, el runner temporal expande los `\ir` relativos y elimina `\set` antes de enviar el SQL real al motor (errores SQL abortan); usa conexiones separadas para las dos suites. Resultado final:

- **PASS**: `0001` aplicada una sola vez, sin modificarla.
- **PASS**: consultas documentadas de inspección/verificación de solo lectura ejecutadas en el doble local.
- **PASS**: `0002` ejecutada dos veces, **12 aserciones y 2 operaciones denegadas esperadas**.
- **PASS**: suite existente `profiles_roles.sql` completa, incluida la prohibición de escalar rol por estudiantes.
- **PASS**: limpieza de fixtures; queda la única cuenta sintética local preexistente. Servidor apagado al finalizar.

Una primera ejecución del runner detectó colisión de helpers `pg_temp` al reutilizar conexión entre suites; se corrigió el runner usando conexiones independientes como los comandos psql documentados. No requirió cambios en `0001` ni en la suite existente.

No se ha probado todavía contra el servicio Supabase completo (Auth, PostgREST, grants por defecto propios del proveedor), ni se ha aplicado SQL remoto. No se ejecutan lint/build desde esta subtarea exclusivamente SQL; corresponden a la integración del hito. No se modificaron TypeScript, package, catálogo, configuración remota ni usuarios reales. No se ejecutaron operaciones Git.
