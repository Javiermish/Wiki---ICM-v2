# QA local de PostgreSQL y catálogo persistente

Sin Supabase remoto, sin credenciales de aplicación y sin modificar datos existentes.

## PostgreSQL real y efímero

El runner `scripts/run-catalog-sql-tests.mjs` crea **su propio clúster**, enlazado a
`127.0.0.1`, en un directorio nuevo `/tmp/opencode/wiki-sql-qa-*`. Usa una contraseña
aleatoria efímera y destruye el clúster al finalizar. Ignora `DATABASE_URL` y no
acepta URLs ni clústeres externos. No instala dependencias ni requiere root.

Requiere un paquete `embedded-postgres` ya disponible **fuera del repositorio**.
Si no existe, instalación opcional explícita (no forma parte de dependencias app):

```sh
mkdir -p /tmp/opencode/wiki-postgres-harness
npm install --prefix /tmp/opencode/wiki-postgres-harness --no-audit --no-fund embedded-postgres@18.4.0-beta.17
TMPDIR=/tmp/opencode \
WIKI_EMBEDDED_POSTGRES_MODULE=/tmp/opencode/wiki-postgres-harness/node_modules/embedded-postgres/dist/index.js \
node scripts/run-catalog-sql-tests.mjs
```

En el entorno QA de esta sesión **ya existe** una instalación reutilizable:
`/tmp/opencode/wiki-catalog-sql/node_modules/embedded-postgres/dist/index.js`.
No fue necesario descargar PostgreSQL ni instalar paquetes del sistema.

Se ejecutan todas las migraciones ordenadas, el inspector readonly de seed y después `profiles_roles.sql`,
`backfill_existing_accounts.sql`, `catalog.sql`, `catalog_quotas.sql`, `catalog_seed.sql`. Finalmente `scripts/test-catalog-concurrency.mjs` comprueba cuota y doble aprobación con dos conexiones, observando el bloqueo real en `pg_stat_activity`. Cada archivo usa una conexión
independiente; sus `COMMIT`/`ROLLBACK` se conservan. Se expande `\ir` relativo al
archivo que lo contiene y se admite `\set ON_ERROR_STOP on`; cualquier otro
metacomando falla explícitamente. Un fallo SQL finaliza con código 1.
`--auth-only` limita expresamente a Hito 2.1 y sus dos pruebas.

### Qué se simula y qué no

El motor es PostgreSQL nativo, no un intérprete JS de SQL. RLS, roles, permisos,
PL/pgSQL, transacciones y triggers se ejecutan realmente. **La infraestructura
Auth es sintética**: roles `anon`/`authenticated`, tabla mínima `auth.users` y
`auth.uid()` sobre `request.jwt.claim.sub`. Los tests SQL existentes **no crean**
ese esquema; lo requieren del entorno. Esto no valida tokens, GoTrue, PostgREST,
Storage ni conexiones de la aplicación. No se deben presentar sus resultados
como integración completa de Supabase.

## Chromium: error de DB y público sin mutaciones

```sh
WIKI_TEST_BASE_URL=http://127.0.0.1:3102 node tests/browser-persistent-catalog.mjs
# Solo cuando la DB esté integrada y accesible:
WIKI_CATALOG_QA_MODE=public WIKI_TEST_BASE_URL=http://127.0.0.1:3102 node tests/browser-persistent-catalog.mjs
```

Reutiliza `tests/browser-driver.mjs` y Chromium existente en
`~/.cache/ms-playwright/chromium-1248/`. No instala navegador, inicia servidores,
crea usuarios ni envía formularios de escritura. Solo permite servidor loopback.
Capturas, perfil y reporte quedan en `/tmp/opencode/wiki-persistent-catalog-*`.
El driver registra si el entorno obliga a desactivar sandbox para su perfil
nuevo. Consola, fallos de red y peticiones externas/escritura se preservan.

Comprueba 1280 y 390 px: portada, semestre, electivos, ramo; error explícito sin
ramos/materiales ficticios de reemplazo; ausencia de scroll horizontal; login
accesible; tabulación email→contraseña; admin anónimo redirigido a
`/login?next=%2Fadmin%2Framos`; claro/oscuro; reintento con teclado.
El modo público es smoke de lectura, no alta/edición/revisión administrativa.

## Evidencia ejecutada (2026-10-23)

- Motor: PostgreSQL 18.4 nativo x86_64.
- Hito 2.1: ambas migraciones y ambos tests SQL **PASS**.
  `/tmp/opencode/wiki-sql-qa-qLA7CQ/report.json`.
- Hito 2.2, ejecución final: cuatro migraciones **PASS** y cuatro suites
  (`profiles_roles`, `backfill_existing_accounts`, `catalog`, `catalog_seed`)
  **PASS**. Incluye RLS/autorización y replay de seed preservando ediciones.
  `/tmp/opencode/wiki-sql-qa-j7zzVv/report.json`.
  La primera ejecución detectó una expectativa incorrecta del test de segunda
  aprobación (`notes=null` daba 22023 antes de comprobar estado 55000). Backend
  corrigió el test usando notas válidas; se repitió todo en un clúster nuevo.
- Navegador contra producción local 3102: 12 comprobaciones **PASS** y 12 capturas;
  1280/390 px, rutas de error y login/admin sin mutaciones.
  `/tmp/opencode/wiki-persistent-catalog-1792781547888/report.json`.
  Consola conserva dos React #441 (error de render Server Components oculto en
  producción), observados al recorrer el ramo sin DB disponible. No se considera
  consola limpia; revisar junto a los logs servidor, sin exponer secretos.
- No se ejecutó modo público con catálogo accesible ni flujos de administrador
  autenticado. No se ejecutaron build/lint globales en paralelo con integración.

### Revalidación final de la sesión principal

- Runner permanente del repo con cuatro migraciones, inspector, cinco suites y concurrencia: **PASS**, `/tmp/opencode/wiki-sql-qa-XMSXNA/report.json`.
- Chromium sobre build final: **12 PASS**, 12 capturas; **cero** errores/advertencias de consola y fallos de red. `/tmp/opencode/wiki-persistent-catalog-1792782429773/report.json`. Se corrigió el error #441 descrito arriba mediante estado explícito en ficha de ramo.
- Suite HTTP Auth/materiales/moderación anónima: **34 PASS**. Conserva lectura y descarga de archivos locales aun sin catálogo disponible; no reconstruye datos del ramo desde fixtures.
- Lint/build/suite unitaria, límites de pruebas simuladas y pendientes remotos: `docs/HITO_2_2.md`.
