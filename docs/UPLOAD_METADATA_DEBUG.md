# Hito 2.3 — rechazo de metadatos en la reserva

> **Nota de cierre (24-10-2026):** diagnóstico histórico, no bloqueo vigente del Hito 2.3. El usuario confirmó el ciclo real de Tarea PDF aprobada/publicada con lectura y descarga y Listado rechazado fuera del catálogo; estados `ready` y auditoría en Supabase. Hito completado para V1; [resultados y limitaciones actuales](HITO_2_3.md). Las restricciones y resultados de la sesión de depuración inferior se conservan como evidencia histórica, no como pruebas remotas nuevas.

## Causa y evidencia

La RPC de `202610230003_materials.sql` (informada como aplicada) rechaza
`category: "tarea"` en su primera validación: SQLSTATE `22023`, mensaje
`Invalid upload metadata`. `/aportar` ya ofrece esa categoría. No es un fallo de
R2 ni de conversión numérica. El catch convertía cualquier fallo en HTTP 503.

La incremental **ya preparada**, `202610240001_material_tasks.sql`, corrige la
allowlist en `materials_category_check` y `reserve_material_upload`. No hace
falta otra migración ni cambiar la histórica. Ninguna migración fue modificada
ni aplicada remotamente en esta depuración.

Reproducción en PostgreSQL real efímero: el mismo borrador del formato del
formulario falla con la RPC histórica y pasa tras la incremental, quedando
privado en `pending/uploading`. Se verifica preservación de filas, oferta,
ACL, RLS, funciones, índices y otras restricciones. No se inspeccionó el cuerpo
SQL remoto en esta sesión: la conclusión remota se basa en el error aportado y
la versión aplicada informada, contrastados con la reproducción local.

## Contrato comprobado

| Campo | Borrador del formulario | JSON enviado a RPC | Validación SQL |
| --- | --- | --- | --- |
| `courseId` | ID del ramo, string | string, no se convierte a UUID | string de 1–100 caracteres; ramo existente y activo |
| `academicYear` | `"2025"` | `2025` (number) | número de cuatro dígitos; 1900–2100 |
| `academicTerm` | `"1"` | `1` (number) | número 1 o 2, independiente de la malla |
| `documentNumber` | `"2"` | `2` (number) | entero 1–999; null/ausente solo en apunte |
| `category` | `"tarea"` | `"tarea"` (string) | histórica: listado/apunte/certamen; incremental: también tarea |

`uploadMaterial` serializa el borrador con cadenas de inputs/selects en
multipart: es intencional. La ruta ejecuta `validateContributionDraft`, que
convierte y valida los números. Envía `metadata.value`, no el borrador crudo.
Las claves camelCase coinciden con SQL; la proyección descarta autor, rol y
estado del cliente. Textos opcionales admiten string/null y SQL normaliza vacíos.

## Corrección y regresiones

- `22023` **en reserva**: HTTP 400 con mensaje seguro de metadatos; para Tareas
  y `Invalid upload metadata`, indica comprobar la incremental pendiente.
- `Upload quota exceeded` en reserva: HTTP 429, no 400 ni 503.
- Catálogo, R2 y finalización conservan 503 con advertencia de recepción incierta.
  No se afirma que un error de finalización signifique que no hubo guardado.
- No se devuelven mensajes arbitrarios, detalles SQL, tokens ni payloads en logs.
  Validaciones, autorización, idempotencia y aislamiento permanecen intactos.

La regresión de endpoint ejecuta el transporte real `uploadMaterial` con un XHR
de prueba, entrega su FormData a la ruta real y verifica los números JSON RPC,
el 400 con RPC antigua y la ausencia de PUT tras el rechazo. El fixture es
sintético con la estructura exacta del formulario, no datos privados de una
subida del usuario. La regresión SQL consume ese mismo borrador y validador real.

## Cómo repetir la subida real (operador)

1. **Solicitar autorización independiente antes de cambios remotos.** Comprobar
   la versión aplicada. Si falta Tareas, el operador autorizado debe revisar y
   aplicar **solo** `supabase/migrations/202610240001_material_tasks.sql` completo.
   No reaplicar la histórica ni todas las migraciones pendientes a ciegas.
   El CHECK toma bloqueo de tabla: elegir el momento apropiado. Sin cambios R2.
2. Ejecutar `pnpm dev` con la configuración existente, sin mostrar credenciales.
   Iniciar sesión con correo verificado y abrir `/aportar`.
3. Seleccionar un ramo real activo, Tareas, número `2`, año `2025`, semestre
   académico `1`; seleccionar un PDF válido de hasta 25 MiB, esperar la vista
   previa y confirmar permiso. No disfrazar una tarea como certamen/listado.
4. Enviar y comprobar `POST /api/materiales` → **201**, `{id, status: "pending"}`.
   Sin la incremental, ahora se espera **400**, no 503, sin PUT R2. El formulario
   conserva datos y archivo para reintentar.
5. Comprobar `/mis-aportes`: nunca público antes de revisión humana. Seguir el
   procedimiento autorizado de Hito 2.3 para revisión/publicación. Esta sesión
   no ejecutó ese ciclo ni cerró el hito.

## Verificación ejecutada

- Red: regresión de endpoint observó `503 !== 400` antes del cambio.
- `pnpm test`: **203 pruebas, 192 PASS, 11 SKIP opt-in, 0 FAIL**.
  Log: `/tmp/opencode/wiki-upload-metadata-tests.log`.
- `pnpm lint`: PASS.
- `pnpm build`: PASS. Un intento inicial detectó TS2367 al seguir la etapa
  mutada dentro de callbacks; corregido con contexto tipado mutable.
- `WIKI_EMBEDDED_POSTGRES_MODULE=/tmp/opencode/wiki-catalog-sql/node_modules/embedded-postgres/dist/index.js node scripts/run-catalog-sql-tests.mjs`:
  PASS; reproducción antes/después, seguridad, preservación y concurrencia.
  Evidencia: `/tmp/opencode/wiki-sql-qa-yjSE3A/report.json`.
- `git diff --check`: PASS.

Sin cambios visuales: se conserva el feedback de error enfocable con
`role="alert"`. No se ejecutó navegador autenticado ni subida remota. PostgreSQL
utiliza Auth sintética: no verifica GoTrue, PostgREST ni R2 reales. Continúan
avisos conocidos de Node (`MODULE_TYPELESS_PACKAGE_JSON`) y PDF.js en pruebas.
Sin dependencias, cambios remotos, commit, push, despliegue ni Hito 2.4.

## Archivos de esta depuración

- `src/app/api/materiales/route.ts`
- `tests/material-endpoints.test.mjs`
- `tests/fixtures/material-upload.mjs` (nuevo)
- `scripts/run-catalog-sql-tests.mjs`
- `docs/UPLOAD_METADATA_DEBUG.md` (nuevo)
- `docs/HITO_2_3.md`
- `docs/superpowers/plans/2026-10-24-upload-metadata-fix.md` (nuevo)

Cambios previos preservados, incluida la incremental ya existente.
