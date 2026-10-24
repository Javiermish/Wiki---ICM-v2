# QA autenticada de Supabase — procedimiento preparado, NO ejecutado

## Límites y decisión

La preparación local no autoriza ninguna operación remota. El cierre del Hito 2.2 sigue pendiente. No se usan la cuenta principal, `service_role`, JWT fabricados, claves SQL dentro del runner ni cambios en RLS/grants. No se prueba almacenamiento ni se avanza al Hito 2.3.

Se elige login interactivo mediante el SDK existente y sesiones solo en memoria. Exportar JWT/cookies a archivos o reutilizar un navegador personal expone secretos y mezcla identidades. El runner no crea usuarios ni cambia roles; el operador preparará cuentas temporales **después de recibir autorización**.

## 1. Preparación manual que necesitará autorización

1. Confirmar el proyecto exacto (`project-ref`), preferentemente un proyecto QA aislado con las mismas cuatro migraciones. Si se autoriza el proyecto actual, aceptar que dos ramos QA serán brevemente públicos mientras se comprueba su lectura/archivo. Elegir una ventana sin otros usuarios operando sobre estos registros.
2. Crear **cuatro cuentas Auth temporales independientes**, con correos controlados por el operador: `studentA`, `studentB`, `moderator`, `admin`. Registrar sus UUID en una lista local. Confirmar sus correos mediante Auth normal; no desactivar confirmación ni crear sesiones artificiales. No reutilizar cuentas reales preexistentes ni sus datos.
3. Comprobar los cuatro UUID y sus fechas de creación en Dashboard. Al crearse, el trigger genera `profiles` y `user_roles=student`.
4. En SQL Editor, como operador autorizado de mantenimiento, asignar **solo** las dos filas nuevas: `UPDATE public.user_roles SET role='moderator' WHERE user_id='<UUID_QA_MOD>' AND role='student'` y lo mismo con `role='admin'` para `<UUID_QA_ADMIN>`. Hacerlo en una transacción, verificar exactamente una fila por UPDATE y confirmar; ante cualquier diferencia, rollback. Esto es bootstrap de identidades de QA, no una prueba de RLS ni un permiso para editar otros usuarios. Mantener este registro de mantenimiento sin contraseñas. No usar la RPC de cambio de moderador desde la cuenta principal: introduciría referencias de auditoría de esa cuenta en la limpieza.
5. Asegurar que estas identidades no tengan solicitudes ni cambios de roles/auditoría anteriores. No usar las cuentas para otras tareas durante QA.

**Secretos:** elegir contraseñas temporales en un gestor local. Nunca pegarlas en chat, argumentos CLI, variables de entorno, archivos JSON, reportes, capturas o historial. No exportar JWT/refresh tokens ni usar `curl -v`, DevTools con HAR, grabación de terminal o logs de SDK. Las credenciales se transmiten únicamente al endpoint HTTPS de Supabase Auth del proyecto elegido, como requiere un login real; no a terceros. El runner usa una terminal con eco oculto para correo y contraseña, `persistSession:false`, `autoRefreshToken:false`, sin trazas ni cuerpos de error. JavaScript no garantiza borrado criptográfico de cadenas en memoria: cerrar el proceso al terminar.

## 2. Configuración local sin secretos nuevos

Crear fuera de Git un archivo de permisos 0600, por ejemplo `/tmp/opencode/wiki-qa-accounts.json`, con **solo** estos cuatro UUID verificados (sustituir los marcadores, no añadir correos ni credenciales):

```json
{
  "studentA": "<UUID_QA_STUDENT_A>",
  "studentB": "<UUID_QA_STUDENT_B>",
  "moderator": "<UUID_QA_MOD>",
  "admin": "<UUID_QA_ADMIN>"
}
```

La aplicación ya usa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local`. El runner solo acepta URL `https://<project-ref>.supabase.co` coincidente con el argumento y clave `sb_publishable_…` o JWT de rol `anon`. Nunca acepta `sb_secret_…` o `service_role`. No imprimir el archivo de entorno para comprobarlo.

Cada ejecución usa un ID nuevo `qa-AAAAMMDD-<8 hex minúsculas>`. Los nombres serán `QA <run-id> Administracion`, `Aprobacion`, `Rechazo`, `Duplicado`; códigos `QA-<8 HEX>-ADM/APR/REJ/DUP`. El prefijo ayuda a reconocer, **no autoriza borrado**. Se valida que esté libre incluso entre archivados.

## 3. Comandos — el segundo queda pendiente de autorización

Inspección segura, sin abrir sesiones, red ni mutaciones:

```sh
node scripts/qa-authenticated-catalog.mjs
node --test tests/authenticated-qa.test.mjs
```

**NO ejecutar todavía.** Tras autorización expresa para el proyecto, las cuatro cuentas y las operaciones inferiores, el operador ejecutará en su terminal local, sin redirecciones, grabaciones ni `tee`:

```sh
node --env-file=.env.local scripts/qa-authenticated-catalog.mjs \
  --execute --project <PROJECT_REF_AUTORIZADO> \
  --run-id qa-20261023-0123abcd \
  --accounts /tmp/opencode/wiki-qa-accounts.json
```

El ID de ejemplo debe sustituirse por uno nuevo. El runner pide confirmación oculta `AUTORIZO <project-ref> <run-id>`, luego correos y contraseñas de las cuatro cuentas. El flag y la confirmación son barreras técnicas, **no sustituyen la autorización del usuario**. Antes de consultar perfiles o escribir, valida mediante `getUser()` que cada sesión pertenece al UUID autorizado y está verificada; consulta el rol actual en DB, no metadata.

Crea `/tmp/opencode/wiki-auth-qa-<run-id>/manifest.json` (directorio 0700, archivo 0600) exclusivamente para un run nuevo. Guarda atómicamente candidatos, UUIDs, IDs creados, IDs de auditoría, intenciones antes de cada escritura y comprobaciones; no guarda correos, contraseñas, tokens, claves, respuestas completas ni snapshots privados. Rechaza reutilizar el directorio. Al salir intenta `signOut({scope:'local'})` de cada sesión, nunca logout global de otras sesiones. El operador debe revocar las sesiones QA si el proceso se interrumpe.

## 4. Operaciones remotas exactas que se autorizarían

Todas las operaciones PostgREST se hacen con la clave **pública** y la sesión Auth real correspondiente. Ningún acceso de prueba usa SQL owner o service_role. Los GET se filtran a los cuatro UUID, prefijo o IDs QA; no se exportan tablas de usuarios ni auditoría general.

| Actor / operación | Expectativa y efecto |
| --- | --- |
| Cuatro logins Auth `signInWithPassword`, `getUser`, logout local | Cuatro sesiones reales y sus revocaciones; Auth puede actualizar `last_sign_in_at` y sus propios logs. No crea cuentas desde el runner. |
| Cada rol: GET perfil propio/otro, rol propio | Perfil propio visible, ajeno vacío incluso para admin; rol actual exacto. |
| Admin: GET solicitudes de las cuatro cuentas, catálogo por prefijo, plan y área | Cuentas nuevas sin solicitudes previas, prefijo libre, `plan-ilustrativo` y área `otro` activos. Solo lectura de plan/área. |
| studentA, studentB, moderator: POST `courses` con propuesta QA válida | Tres denegaciones `42501`; no debe crearse nada. |
| Admin: POST `courses` regular semestre 12 | **Un ramo QA** con ID/slug generados por DB, público activo. |
| studentA/moderator: PATCH ese ramo | RLS debe afectar cero filas; versión/descripción siguen iguales. Un cero de UPDATE se verifica releyendo como admin, no se confunde con un error de transporte. |
| Admin: PATCH nombre y reclasificar a electivo `otro` con versión esperada | Conserva ID/slug, aumenta versión. PATCH con versión obsoleta: cero filas. |
| Admin: archivar, GET como student/moderator/admin, restaurar | Archivado invisible a no-admin, visible a admin; luego se restaura. |
| Admin: dos POST `courses` | Nombre normalizado en mayúsculas y código en minúsculas/espacios de un archivado: ambos `23505`, sin filas nuevas. |
| Admin: PATCH slug y DELETE del ramo QA | `42501` por grants; sin cambio/borrado. No se seleccionan ramos ajenos. |
| studentA: dos POST solicitudes con UUIDs predeclarados | Una propuesta regular para aprobar; otra con nombre/código del ramo QA existente para comprobar rollback de aprobación duplicada. |
| studentB: POST solicitud electiva | Propuesta para rechazar; sin semestre curricular. Total esperado **tres solicitudes**. |
| studentA: POST pendiente duplicada y POST con `requested_by` ajeno | `23505` y `42501`, respectivamente; IDs candidatos también constan en el plan. |
| studentA/B: GET solicitudes propias/ajenas; admin/moderator: GET cola por esos IDs | Propia visible con dueño fijado por DB, ajena invisible; ambos revisores ven las tres. |
| studentA: RPC `review_course_request` sobre propia y ajena | Ambas `42501`; sin decisiones ni cursos. |
| Moderator: RPC aprobar solicitud A y rechazar B | Aprobación crea **segundo ramo QA**, resolución y auditorías; rechazo no crea ramo. |
| Admin: RPC segunda decisión sobre aprobada | `55000`, sin segunda resolución. |
| Moderator: RPC aprobar solicitud duplicada | `23505`: continúa pending, sin revisor/resultado/evento; se comprueba rollback por lectura. |
| Admin: RPC rechazar duplicada pendiente | Resolución válida por administrador. Al final: una aprobada, dos rechazadas. |
| GET por IDs QA de solicitudes, cursos y eventos | Estado/revisor/fecha/resultado persistidos; exactamente tres eventos de revisión, actores y resultados correctos; dueño lee su evento y otro colaborador no; moderador ve revisiones, no auditoría administrativa. |
| studentA: PATCH directo de solicitud ajena; admin: DELETE evento de revisión y PATCH evento admin QA | `42501` por grants. Prueba permisos API, no demuestra por sí sola ejecución de los triggers append-only; estos tienen cobertura SQL local. |
| Admin: archivar los dos ramos QA al terminar | Ningún ramo QA activo tras PASS. **Siete eventos administrativos** esperados: crear/editar/archivar/restaurar/archivar el primero, crear/archivar el aprobado. Se verifican actores, before/after e IDs; tres eventos de revisión. |

Ante cualquier resultado inesperado se detiene la matriz. No se aceptan fallas de red como permisos denegados; las denegaciones deben tener SQLSTATE exacto. Si una mutación supuestamente denegada tiene éxito, su ID retornado se registra **antes** de abortar. No hay reintentos automáticos de escrituras ni limpieza automática.

## 5. Limpieza exacta, separada y reversible antes de aprobar COMMIT

### Tras un PASS completo

1. Conservar el manifiesto y el informe de QA sin secretos. Comparar el `project-ref` con el Dashboard de destino. Esperado: cuatro UUID Auth nuevos, dos IDs de ramos, tres solicitudes, siete eventos administrativos y tres de revisión. Revisar fechas, prefijo, actores y referencias; el manifiesto es una ayuda, no fuente automática de autorización.
2. Los dos ramos quedan archivados. **No prometer borrado desde el rol admin:** no tiene DELETE, auditorías son append-only y FKs `RESTRICT` bloquean cuentas/cursos referenciados.
3. Pedir autorización de mantenimiento separada. `scripts/qa-catalog-cleanup.sql` es una plantilla **no ejecutada**: valor de manifiesto vacío y `ROLLBACK` por defecto. Como operador SQL owner, insertar el JSON revisado en el `set_config`, nunca una clave/token. Ejecutar primero con rollback, comparar conteos y comprobar que todos los checks pasan. Solo después de autorización para esos IDs exactos sustituir el último `ROLLBACK` por `COMMIT` en la copia local revisada.
4. La transacción toma locks breves, valida conteos, existencia, nombres QA, fechas, estados, dueños y actores. Aborta si encuentra solicitudes/eventos fuera del manifiesto que referencien las cuentas/ramos, o cualquier evento de roles que involucre esas cuentas. Deshabilita **solo** los dos triggers append-only de auditoría del catálogo durante los DELETE exactos, los vuelve a habilitar antes de terminar y deja RLS, FKs y demás triggers intactos. Borra por listas de PK: eventos de revisión → eventos administrativos → solicitudes → ramos. No `LIKE` para borrar, no `CASCADE`, no desactivar RLS, no `session_replication_role`. Un error revierte también el estado de los triggers.
5. El borrado de evidencia de auditoría QA es una excepción de mantenimiento explícita, no una capacidad del producto. Si no se autoriza esa excepción, conservar datos archivados y cuentas deshabilitadas; **no** inventar un atajo.
6. Comprobar por lectura que no quedan los IDs y que los triggers siguen habilitados. Revocar las sesiones de las cuatro cuentas y eliminar **solo esos UUID Auth** desde Dashboard, tras verificar otra vez que son cuentas nuevas de QA sin dependencias ajenas. `profiles` y `user_roles` se eliminan por su FK normal. No editar `auth.users` por SQL ni borrar cuentas por correo/prefijo. La eliminación Auth puede conservar logs internos del proveedor; no prometer borrado de esos registros de seguridad.

### Interrupción, timeout o FAIL

No ejecutar la plantilla de PASS, no reintentar el mismo run-id y no borrar por prefijo. El manifiesto puede contener una intención sin respuesta: reconciliar como admin/operador cada UUID de solicitud predeclarado y cada nombre/código candidato, dueño y ventana temporal. Añadir únicamente filas cuya creación por el run se haya probado, junto con sus eventos exactos; guardar un manifiesto revisado separado. Los nombres de ramos pueden haber cambiado y una aprobación puede haber creado un ID sin llegar a devolverlo. Archivar esos ramos con admin QA solo tras autorización. Preparar una limpieza específica para los IDs reconciliados y revisarla antes de ejecutarla; nunca alterar conteos/guards a ciegas para que pase la plantilla. Ante cualquier referencia ajena, detenerse y preservar los datos.

## 6. Qué demuestra y qué queda pendiente

Las pruebas locales del runner validan guardas, control de errores y registro seguro, **no** RLS remoto. El runner autorizado probará PostgREST/Auth/DB reales, no la UI autenticada. Para validar además las pantallas, usar perfiles de navegador temporales separados por cuenta y sin HAR/tracing: `/gestion/asignaturas`, `/moderacion`, `/admin/ramos`; comprobar redirecciones por rol, teclado/foco, persistencia/errores y trabajar solo con IDs QA autorizados, incluyendo toda mutación adicional en un manifiesto nuevo. No ejecutar esos recorridos sobre el conjunto cerrado de la plantilla sin actualizar primero el plan autorizado.

La matriz evita modificar plan/áreas existentes y no fuerza fallos de triggers remotos ni carga/concurrencia real remota. Atomicidad bajo fallo de auditoría y concurrencia tienen evidencia SQL local; no presentarla como Auth extremo a extremo. Adjuntar evidencia autenticada real antes de aprobar el cierre del hito.
