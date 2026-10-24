# Validación final del Hito 2.2 — 2026-10-23

## Dictamen

**Hito 2.2 completado y aprobado para la V1 por decisión expresa del usuario el 23-10-2026.** Se acepta la limitación de no realizar por ahora las pruebas adicionales de RLS remoto con cuentas temporales, considerando las pruebas locales y las comprobaciones manuales satisfactorias comunicadas. Esta aceptación no convierte las pruebas remotas omitidas en PASS ni demuestra integración Auth/RLS completa.

El operador informa que las cuatro migraciones están aplicadas y que comprobó manualmente creación, persistencia, duplicados, solicitudes y moderación. La validación anterior confirmó acceso público por PostgREST, sin verificar de forma independiente el historial ni la equivalencia completa del esquema remoto. Las comprobaciones manuales no sustituyen la matriz RLS autenticada: su ausencia queda aceptada para este cierre.

Se conservan íntegramente las políticas RLS, permisos, controles de servidor, migraciones, procedimientos de QA autenticada y limpieza, runners y evidencia histórica. Una futura ejecución remota requiere autorización específica; **no se autoriza ni inicia el Hito 2.3**. Sin commit, push ni despliegue.

## Última verificación del cierre — 2026-10-23, exclusivamente local

Plan de cierre: registrar aprobación y limitación; actualizar documentación de progreso; ejecutar verificaciones locales; revisar el diff. Solo se modificó documentación. No se crearon cuentas, iniciaron sesiones reales ni realizaron lecturas, pruebas o modificaciones nuevas contra Supabase remoto.

Para cumplir la prohibición de nuevas pruebas remotas, build y servidor local se ejecutaron con `NEXT_PUBLIC_SUPABASE_URL=` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` (solo entorno del proceso, sin editar `.env.local`). Servidor propio: `http://127.0.0.1:3104`. No se repitió `pnpm test:browser` completo ni las suites HTTP de catálogo que requieren PostgreSQL accesible desde la aplicación: hacerlo con la configuración habitual produciría lecturas remotas. Se conserva como evidencia **anterior**, no reejecutada en este cierre, la ronda de 223 PASS y 137 comprobaciones de navegador de la sección siguiente.

| Comando | Resultado del cierre local |
| --- | --- |
| `pnpm lint` | PASS, salida 0. |
| `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= pnpm build` | PASS, salida 0, Next.js 16.4.2. |
| `WIKI_TEST_BASE_URL= LD_LIBRARY_PATH=/tmp/opencode/wiki-catalog-sql/node_modules/@embedded-postgres/linux-x64/native/lib WIKI_EMBEDDED_POSTGRES_MODULE=/tmp/opencode/wiki-catalog-sql/node_modules/embedded-postgres/dist/index.js pnpm test` | 168 pruebas: **159 PASS, 9 SKIP HTTP sin URL, 0 FAIL**. Incluye limpieza SQL efímera (33 comprobaciones). |
| Runner SQL local con las mismas variables `LD_LIBRARY_PATH` y `WIKI_EMBEDDED_POSTGRES_MODULE`: `node scripts/run-catalog-sql-tests.mjs` | PASS: cuatro migraciones, inspector, cinco suites SQL y concurrencia con dos conexiones. Auth sintética, no Supabase remoto. |
| `node scripts/generate-catalog-seed.mjs --check` | PASS: 9 ramos y 5 áreas; sin consultar ni escribir remoto. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3104 node tests/browser-auth.mjs` | **26 PASS**, 0 FAIL; validación de campos habilitados omitida en 12 variantes por Auth desconfigurada. Foco, contraste, navegación y bloqueo anónimo comprobados. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3104 node tests/browser-materials.mjs` | **29 PASS, 12 FAIL**, salida 1, sin errores JS ni fallos de red. No se presenta como suite aprobada. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3104 node --test tests/auth-routes.test.mjs tests/materials.test.mjs tests/moderation-routes.test.mjs` | **32 PASS, 2 FAIL** (un caso y su contenedor), salida 1. Auth y materiales pasan; detalle de moderación debajo. |
| `git diff --check` | PASS. |

Los 12 fallos de navegador corresponden a prerrequisitos de catálogo ausentes: semestre curricular (1), reporte y su foco (2), navegación desde ramo (1) y ocho muestras de contraste de la ficha sin archivo, cuyo estado independiente contiene menos texto. `MaterialContent` muestra deliberadamente la muestra local independiente cuando no puede asociar el ramo; no reconstruye datos académicos desde fixtures. Lectura PDF/imágenes, descarga exacta y recuperación pasan. No se alteró implementación ni aserciones.

El caso HTTP de moderación exige una redirección exacta sin parámetros adicionales; sin configuración la respuesta incorpora `&error=configuration`. Una inspección HTTP local confirmó `private, no-store`, redirección a login y ausencia de colas privadas; el navegador también verifica el bloqueo. Este resultado no es evidencia de exposición ni un PASS del caso HTTP. Se deja registrado el límite del test en este entorno, sin cambiarlo dentro del cierre documental.

Evidencia: `/tmp/opencode/wiki-hito22-close-{lint,build,test,sql,http,browser-auth,browser-materials,server}.log`; SQL: `/tmp/opencode/wiki-sql-qa-2eZknX/report.json`. Los reportes actuales de Auth/materiales en `.next/qa-*-evidence` corresponden a esta ronda sin configuración, no a los PASS anteriores. Persisten los avisos conocidos de Node/PDF corrupto. Los resultados históricos inferiores conservan sus condiciones originales; no equivalen a una última ronda completamente verde en el entorno sin Supabase.

Se detuvo únicamente el servidor propio de QA en 3104 mediante SIGTERM; el servidor preexistente no se modificó. Archivos modificados en este cierre: `README.md`, `docs/QA_HITO_2_2.md`, `docs/HITO_2_2.md`, `docs/BRIEF_PRODUCTO.md`, `docs/MODELO_DOMINIO.md` y `docs/DISENO.md`. Los demás cambios preexistentes se preservaron, sin commit ni push.

## Preparación del cierre: runners históricos y QA autenticada — 2026-10-23

### Parte A: retirada sin pérdida de cobertura

- Revisados ambos runners completos contra las suites vigentes. Matriz y motivos: [QA_RUNNERS_HISTORICOS.md](QA_RUNNERS_HISTORICOS.md).
- Fuentes movidas a `tests/historical/browser-{courses,moderation}.mjs`, con guard que informa `RETIRADO` y termina antes de Chromium, red o escritura de reportes. No se cuentan como PASS ni se debilitaron permisos. Sus 20 fallos/timeout anteriores quedan documentados más abajo; ya no son fallos de la suite habitual.
- Migrado a `tests/browser-catalog.mjs` el único hueco público detectado: Electivos → **Todas** conserva `q` y quita solo `area`, comprobando enlace, clic real, URL y campo. Catálogo pasa ahora 27 comprobaciones.
- Nuevo `pnpm test:browser`: lista explícita de las seis suites vigentes; catálogo persistente usa `public`. No glob de archivos históricos ni inclusión del runner autenticado.
- `tests/browser-suite.test.mjs` comprueba selección de runners, ausencia de QA remota y que invocar históricos no sobrescribe evidencia.

### Parte B: preparada para uso futuro, NO ejecutada en remoto

Procedimiento completo, intervención manual, matriz por actor y operaciones exactas: **[QA_SUPABASE_AUTENTICADO.md](QA_SUPABASE_AUTENTICADO.md)**.

- `scripts/qa-authenticated-catalog.mjs`: sin `--execute` no abre sesiones ni contacta red. Exige proyecto exacto, clave pública, cuatro UUID QA distintos y confirmación interactiva. Login oculto con sesiones SDK solo en memoria; valida identidad/correo/rol. No hay `service_role`, JWT fabricados, exportación de tokens, logs de errores crudos ni credenciales en argumentos/archivos.
- Cubre acceso propio/ajeno, solicitudes, intentos de suplantación, permisos de administración, edición con versión/archivo/restauración, duplicados normalizados incluyendo archivados, revisión de colaborador denegada, aprobación/rechazo por moderador/admin, segunda decisión, rollback por duplicado y visibilidad/integridad de auditoría.
- Manifiesto atómico sin secretos: intenciones antes de escribir, IDs exactos de filas/eventos y actores QA. Un éxito inesperado de una operación denegada se registra antes de detenerse. Sin reintentos de escrituras ni limpieza automática.
- Revisión de seguridad detectó y se corrigieron dos posibles falsos PASS antes de ejecutar: exigir archivo final de cada ramo y relectura de ambos como `archived`; exigir siete eventos administrativos exactos con actores y transiciones. Pruebas negativas en `tests/authenticated-qa.test.mjs` observadas en rojo y luego verde. Ocho pruebas offline del runner pasan; esto **no** demuestra Auth/RLS remoto.
- `scripts/qa-catalog-cleanup.sql`: plantilla separada, manifiesto vacío y rollback por defecto. Valida listas exactas, conteos, prefijo/fechas, actores, dueños y referencias ajenas; necesita autorización de mantenimiento para la excepción transaccional de los dos triggers append-only. No desactiva RLS/FKs, no usa CASCADE ni borra por prefijo. Usuarios Auth se revisan y eliminan manualmente por UUID solo después. Ante FAIL/timeout se reconcilian intenciones; no ejecutar la plantilla de PASS sin esa revisión.
- `tests/qa-catalog-cleanup.test.mjs`: opt-in únicamente a clúster PostgreSQL efímero, sin URL remota. **33 comprobaciones locales**: NULL/campos ausentes, manifiestos incorrectos, actores/referencias ajenos, borrado por IDs, rollback y triggers restablecidos/efectivos.

### Autorizaciones necesarias solo para una ejecución futura (no bloquean el cierre aprobado)

1. Crear/verificar cuatro cuentas temporales: colaboradores A/B, moderador y administrador, independientes de la cuenta principal. Asignar por mantenimiento únicamente los roles de los dos UUID nuevos; no editar otros usuarios.
2. Iniciar esas sesiones Auth reales y ejecutar la matriz PostgREST en el proyecto explícitamente identificado. Efecto previsto: **dos ramos QA** (archivados al terminar), **tres solicitudes**, **siete eventos administrativos** y **tres de revisión**, más intentos denegados y logs normales de Auth. Dos ramos estarán brevemente públicos durante la prueba.
3. Tras revisar manifiesto y evidencia, autorizar limpieza de **esos IDs exactos**, incluyendo la excepción a append-only; comprobar rollback primero y aprobar COMMIT después. Revocar sesiones y borrar únicamente los cuatro UUID Auth de QA. Si no se autoriza esa excepción, conservar filas archivadas y deshabilitar cuentas, sin atajos.

### Últimos comandos y resultados

Servidor de producción **local** en `127.0.0.1:3103`; navegadores anónimos con perfiles separados. Las únicas escrituras de esta preparación fueron locales (archivos del repo, memoria/almacenamiento de perfiles QA y PostgreSQL efímero).

Al terminar se detuvo solo el servidor 3103 iniciado para esta preparación (SIGTERM/salida 143 esperada); no se intervino el servidor preexistente en 3000. Los builds pueden limpiar artefactos de `.next`; se conserva el resumen completo de fallos históricos y sus logs originales en el documento enlazado.

| Comando | Resultado actual |
| --- | --- |
| `pnpm test` | 168 pruebas: 158 PASS, 10 SKIP (9 HTTP sin URL y 1 limpieza SQL opt-in), 0 FAIL. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3103 LD_LIBRARY_PATH=/tmp/opencode/wiki-catalog-sql/node_modules/@embedded-postgres/linux-x64/native/lib WIKI_EMBEDDED_POSTGRES_MODULE=/tmp/opencode/wiki-catalog-sql/node_modules/embedded-postgres/dist/index.js pnpm test` | **223 PASS, 0 FAIL, 0 SKIP**. Incluye toda la suite HTTP, guardas offline y limpieza SQL local; no ejecuta QA autenticada remota. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3103 pnpm test:browser` | **137 comprobaciones PASS**: Auth 26, materiales 41, catálogo 27, favoritos 7, aportes 26, catálogo persistente 10. |
| `pnpm lint` | PASS, salida 0. |
| `pnpm build` | PASS, salida 0, Next.js 16.4.2. |
| `git diff --check` | PASS. |

**Fallos finales de las suites ejecutadas: ninguno.** En una ejecución intermedia hubo un 500 de un chunk CSS (caso de recursos y su contenedor): se había reconstruido `.next` mientras el servidor de QA usaba el build anterior. Se reinició únicamente el servidor propio tras terminar build y se repitieron suites completas HTTP/SQL/navegador sin concurrencia con build; todo pasó. No se cambió implementación para ocultarlo. Auth/RLS reales siguen **NO EJECUTADOS**, no aprobados.

Evidencia final:
- `/tmp/opencode/wiki-hito22-prep-{unit,lint,build,final,browser-final}.log`.
- Incidente intermedio conservado: `/tmp/opencode/wiki-hito22-prep-complete.log`.
- Limpieza SQL: `/tmp/opencode/wiki-cleanup-qa-l3l8bu/report.json` (33 checks); primera revisión especializada: `/tmp/opencode/wiki-cleanup-qa-JCWXRv/report.json`.
- Catálogo público: `/tmp/opencode/wiki-persistent-catalog-1792794562354/report.json`.
- Reportes de las otras cinco suites regenerados en las rutas `.next/qa-*-evidence` documentadas más abajo.

Archivos de esta preparación: `package.json`; `tests/historical/browser-{courses,moderation}.mjs` (movidos); `tests/browser-catalog.mjs`; `tests/{browser-suite,authenticated-qa,qa-catalog-cleanup}.test.mjs`; `scripts/qa-authenticated-catalog.mjs`; `scripts/qa-catalog-cleanup.sql`; los dos procedimientos enlazados; este informe y `docs/superpowers/plans/2026-10-23-qa-autenticada.md`. Sin cambios en páginas, autorización, RLS, migraciones o dependencias de aplicación.

## Revalidación anterior: correcciones de rutas — 2026-10-23

### Cambios y comprobaciones

- `src/proxy.ts`: mecanismo Proxy de Next.js 16, antes del streaming. Valida semestres canónicos 1–12; consulta `courses` por slug y estado `active` en Supabase, sin lista fija ni excepciones para `local-`. Ausencia confirmada reescribe a `/404` con estado 404, conservando cookies renovadas y cabeceras privadas/no-cache. Un error de consulta no se interpreta como ausencia: continúa hacia el estado explícito de error del catálogo. Se mantienen las comprobaciones `notFound()` de las páginas como defensa adicional.
- `tests/auth-session.test.mjs`: regresión nueva observada primero en rojo (`/semestres/0`: 200 en vez de 404) y después en verde. Cubre rutas inválidas, slug persistente nuevo y `local-` válido, error de DB, falta de configuración, codificación malformada, cookies renovadas y cabeceras.
- `tests/browser-contributions.mjs`: expectativa siguiente calculada desde los radios habilitados del DOM, no desde el antiguo orden de fixtures. ArrowRight selecciona **y enfoca** el siguiente radio; ArrowLeft vuelve a seleccionar y enfocar Cálculo I. No se encontró un problema de accesibilidad ni se modificó la interfaz.
- Comprobación HTTP adicional: las seis rutas señaladas en el hallazgo 1 y los controles `/materiales/no-existe` y `/no-existe` responden 404 con UI de ausencia y noindex; `/semestres/1`, `/semestres/12` y `/ramos/calculo-i` conservan 200. RSC/prefetch mantiene 404 para semestre y ramo inexistentes y 200 para Cálculo I.
- Revisión especializada de seguridad, solo lectura y limitada al cambio: sin hallazgos accionables. Inspección visual de la captura nueva de Aportes a 375 px en oscuro, sin desbordes visibles; pruebas automatizadas de foco, teclado, etiquetas y contraste pasan.
- No se cambiaron dependencias, configuración de Next, páginas, migraciones ni datos remotos. No se crearon cuentas, no hubo commit, push ni despliegue; no se avanzó al Hito 2.3. Se preservaron los cambios preexistentes.

### Comandos y resultados actuales

Servidor de producción local: `pnpm start --hostname 127.0.0.1 --port 3103`. Cada runner HTTP/navegador usó `WIKI_TEST_BASE_URL=http://127.0.0.1:3103`; el de catálogo además `WIKI_CATALOG_QA_MODE=public`.

Al finalizar se detuvo únicamente ese servidor con SIGTERM (salida 143 esperada); el servidor preexistente en 3000 no se modificó. La corrección añade una consulta de existencia por navegación a un ramo; no introduce caché compartida ni sustituye la consulta del catálogo.

| Comando | Resultado de la revalidación |
| --- | --- |
| `pnpm lint` | PASS, salida 0. |
| `pnpm build` | PASS, salida 0, Next.js 16.4.2. |
| `pnpm test` | 148 PASS, 9 HTTP omitidas por URL no definida, 0 fallos (157 pruebas). |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3103 pnpm test` | **212 PASS, 0 FAIL, 0 omitidas**. Incluye todas las pruebas unitarias y HTTP. |
| `node tests/browser-persistent-catalog.mjs` (modo public) | 10 comprobaciones PASS, catálogo Supabase disponible, 1280/390 px. |
| `node tests/browser-auth.mjs` | 26 PASS, navegación pública y formularios sin envío real. |
| `node tests/browser-materials.mjs` | 41 PASS, lector, descargas, errores esperados y recuperación. |
| `node tests/browser-catalog.mjs` | 26 PASS, navegación cliente, filtros, responsive y teclado. |
| `node tests/browser-favorites.mjs` | 7 PASS, referencias locales, teclado y recuperación. |
| `node tests/browser-contributions.mjs` | **26 PASS, 0 FAIL**, incluyendo flechas nativas y foco. |
| `node tests/browser-courses.mjs` (histórico) | **42 PASS, 20 FAIL**, salida 1. Espera formulario/edición DEMO públicos en `/gestion/asignaturas`; obtiene login. Fallan también prerrequisitos de ramos locales y favoritos derivados. Sin errores JS/red ni endpoints de envío. |
| `node tests/browser-moderation.mjs` (histórico) | **FAIL**, salida 1: timeout inicial `page ready /moderacion`, antes de ejecutar checks, por redirección anónima a login. Sin solicitudes de escritura ni externas. |
| `node scripts/generate-catalog-seed.mjs --check` | PASS, semilla coincide con fixtures; no compara ni escribe remoto. |
| Runner SQL local (mismo comando documentado más abajo) | PASS, cuatro migraciones, inspector, cinco suites SQL y concurrencia con dos conexiones; solo clúster efímero local. |
| `git diff --check` | PASS. |

**Pruebas que continúan fallando:** `browser-courses.mjs` (20 checks) y `browser-moderation.mjs` (arranque). Se ejecutaron los ocho runners de navegador en perfiles anónimos aislados, sin crear cuentas, enviar mutaciones ni eludir permisos. No se relajaron permisos ni se adaptaron flujos históricos de creación/moderación DEMO a mutaciones reales: necesitarían sesiones autorizadas y un entorno de datos de QA separado. Los seis runners vigentes suman 136 comprobaciones aprobadas. Siguen omitidas las operaciones con cuentas reales descritas más abajo.

Evidencia nueva:

- Logs: `/tmp/opencode/wiki-hito22-fix-unit.log`, `wiki-hito22-fix-http.log`, `wiki-hito22-fix-sql.log` y `wiki-hito22-fix-browser-{persistent,auth,materials,catalog,favorites,contributions,courses,moderation}.log` (todos bajo `/tmp/opencode`).
- Estados HTTP/controles/RSC: `/tmp/opencode/wiki-hito22-fix-route-status.json`.
- SQL: `/tmp/opencode/wiki-sql-qa-hjNAMp/report.json`.
- Catálogo remoto público: `/tmp/opencode/wiki-persistent-catalog-1792792580351/report.json`.
- Los reportes/capturas de las otras cinco suites en `.next/qa-*-evidence` listados abajo fueron regenerados por esta revalidación.
- Runners históricos: `.next/qa-courses-evidence/browser-report.json` y `.next/qa-moderation-evidence/report.json`, con resultados FAIL conservados, no contados como aprobados.

## Registro de la validación inicial

Los fallos y comandos siguientes conservan la evidencia anterior a la corrección; los resultados actuales son los de la sección superior.

## Alcance y seguridad de la ejecución

- Aplicación de producción **local**, `http://127.0.0.1:3103`, conectada al proyecto configurado. No despliegue.
- No se crearon usuarios ni registros de prueba remotos; no se editaron ni borraron datos reales, perfiles o roles.
- No se utilizó `service_role`, ni se fabricaron JWT/claims para representar usuarios normales.
- Solo se detectaron los nombres de las dos variables públicas de Supabase; no se imprimieron valores ni se buscaron credenciales en perfiles personales.
- El runner SQL creó su propio clúster efímero local. Sus usuarios y registros sintéticos quedaron exclusivamente en ese clúster; nunca se ejecutaron los tests SQL contra Supabase remoto.
- Los navegadores usaron perfiles de QA separados. Favoritos y aportes DEMO solo alteraron almacenamiento local del perfil o memoria, no la base remota. Las fallas de archivos se inyectaron en Chromium, sin cambiar archivos reales.
- No se modificó implementación, configuración, migraciones ni tests. Cambios de esta validación: este informe y notas de estado en documentación. Se conservaron los cambios previos sin commit.

## Plan y resultados

- [x] Revisar documentación, scripts y efectos de las pruebas.
- [x] Ejecutar lint, build, suite predeterminada, suites HTTP y SQL local.
- [x] Ejecutar regresiones de navegador públicas, lector, descarga, aportes DEMO y favoritos.
- [x] Probar acceso anónimo a API remota sin modificar filas.
- [ ] Ejecutar RLS con sesiones reales student/moderator/admin: diferido por decisión expresa; no bloquea el cierre V1 ni cuenta como PASS.
- [x] Resolver el contrato HTTP de rutas inexistentes y la expectativa obsoleta del test de aportes (revalidación superior).
- [x] Documentar evidencia, límites y condiciones de cierre.

### Comandos ejecutados

| Comando | Resultado de esta sesión |
| --- | --- |
| `pnpm lint` | PASS, salida 0. |
| `pnpm build` | PASS, salida 0, Next.js 16.4.2. |
| `pnpm test` | 156 pruebas: 147 PASS, 9 HTTP omitidas por no definir URL, 0 fallos. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3103 pnpm test` | **203 PASS, 8 FAIL, 0 omitidas**, 211 pruebas. Son cuatro casos fallidos y sus cuatro contenedores, no ocho defectos independientes. |
| `node scripts/generate-catalog-seed.mjs --check` | PASS: semilla versionada coincide con fixtures (9 ramos, 5 áreas). No compara ni reescribe remoto. |
| Runner SQL local (comando inferior) | PASS: cuatro migraciones, inspector, cinco suites SQL y concurrencia con dos conexiones. |
| `WIKI_CATALOG_QA_MODE=public WIKI_TEST_BASE_URL=http://127.0.0.1:3103 node tests/browser-persistent-catalog.mjs` | 10 comprobaciones PASS; 12 capturas, 1280/390 px, claro/oscuro, login y redirección admin. Sin errores/advertencias de consola, fallas de red ni solicitudes inesperadas. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3103 node tests/browser-auth.mjs` | 26 PASS: navegación anónima, formularios sin envío real, foco, etiquetas y contraste, 375/1440 px, claro/oscuro. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3103 node tests/browser-materials.mjs` | 41 PASS: PDF.js real, worker, páginas, búsqueda, zoom, formatos de imagen, descarga real con bytes/nombre comprobados, errores y recuperación, navegación, responsive y teclado. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3103 node tests/browser-catalog.mjs` | 26 PASS: clics, filtros combinados, búsqueda, historial, teclado, tema y responsive. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3103 node tests/browser-favorites.mjs` | 7 PASS: referencias locales, recarga, otra pestaña, teclado, recuperación y almacenamiento bloqueado. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3103 node tests/browser-contributions.mjs` | **25 PASS, 1 FAIL**: expectativa de orden fijo de ramos; diagnóstico inferior. Sin uploads ni escrituras remotas. |
| `git diff --check` | PASS, sin errores de whitespace. |

```sh
LD_LIBRARY_PATH=/tmp/opencode/wiki-catalog-sql/node_modules/@embedded-postgres/linux-x64/native/lib \
WIKI_EMBEDDED_POSTGRES_MODULE=/tmp/opencode/wiki-catalog-sql/node_modules/embedded-postgres/dist/index.js \
node scripts/run-catalog-sql-tests.mjs
```

Persisten el aviso de Node `MODULE_TYPELESS_PACKAGE_JSON` y el aviso esperado de PDF.js para una muestra corrupta. No se cambiaron dependencias para silenciarlos.

## API remota anónima: evidencia y límites

Llamadas directas a `/rest/v1`, con `apikey` pública y sin sesión:

| Operación | Resultado |
| --- | --- |
| GET `curricula`, `elective_areas`, `courses` (solo columna status) | HTTP 200: 1 plan, 5 áreas y 11 ramos; todos activos. No se presupone que remoto deba seguir teniendo solo los nueve ramos iniciales. |
| GET `courses` filtrado por `status=eq.archived` | HTTP 200, cero filas. No demuestra por sí solo ocultación de un archivado existente, cuya existencia no se pudo contrastar como admin. |
| GET solicitudes, eventos de administración, eventos de revisión y roles (`limit=1`) | HTTP 401 / SQLSTATE `42501`, sin filas privadas expuestas. |
| PATCH `courses?id=is.null`, campo description | HTTP 401 / `42501`. La PK nunca puede ser NULL: ninguna fila real era seleccionable. |
| DELETE `courses?id=is.null` | HTTP 401 / `42501`; mismo filtro imposible. |
| POST `courses` con `{}` | HTTP 401 / `42501`. No puede crear una fila válida: faltan nombre y otros campos obligatorios sin default. No se envió una propuesta válida de prueba sin autorización. |

Estas respuestas prueban denegación de permisos anónimos en los endpoints examinados, **no** cobertura de todas las políticas RLS ni de payloads válidos con usuarios autenticados. Un error de grants no debe presentarse como una prueba de RLS por fila. No se intentó resolver solicitudes existentes.

## Hallazgos reproducidos

### 1. Rutas académicas inexistentes responden HTTP 200 — corregido

`/semestres/0`, `/semestres/13`, `/semestres/01`, `/semestres/1x`, `/ramos/no-existe` y `/ramos/local-no-existe` devuelven 200. El HTML sí incluye la UI «No encontramos esta página», la señal `NEXT_HTTP_ERROR_FALLBACK;404` y noindex. Como controles, `/materiales/no-existe` y `/no-existe` devuelven 404 real.

La validación existe (`src/app/semestres/[semestre]/page.tsx:18`, `src/app/ramos/[slug]/page.tsx:24`), pero está en el árbol suspendido: `src/app/layout.tsx:31` introduce Suspense y `PersistentCatalogShell` espera PostgreSQL antes de renderizar children. La ficha de ramo también valida dentro de su propio Suspense. La respuesta inicia streaming antes de ejecutar `notFound()`, por lo que ya no puede cambiar el estado HTTP. `unstable_paramMatching` no evita este resultado en el build probado.

Fallan los casos en `tests/academic-routes.test.mjs:102`, `tests/contribution-routes.test.mjs:95`, `tests/course-routes.test.mjs:67` y `tests/routes.test.mjs:43`. No se relajaron sus aserciones ni se hizo una reestructuración del render durante esta validación. Impacto observado: contrato HTTP/soft-404, no exposición de un material privado en estos casos. Pendiente solucionar o acordar explícitamente ese contrato y repetir las suites completas.

### 2. Test de aportes acoplado al orden antiguo de fixtures — corregido

`tests/browser-contributions.mjs:367` supone que ArrowRight desde Cálculo I selecciona Álgebra I. El catálogo persistente se presenta en otro orden: el siguiente radio es Ecuaciones Diferenciales. El reporte de fallo muestra ese radio efectivamente seleccionado.

Un diagnóstico independiente en Chromium calculó el siguiente ID desde el DOM: ArrowRight seleccionó exactamente ese ID y ArrowLeft volvió a Cálculo I. **No se confirmó una regresión de teclado**; la expectativa del test está obsoleta. No se modificó el test ni se declaró aprobado su resultado original. Pendiente desacoplar esa expectativa del orden fijo.

## Matriz de los siete requisitos solicitados

| Requisito | Estado |
| --- | --- |
| Lint, build y todas las pruebas | Última preparación PASS: 223 tests con HTTP/SQL local y 137 checks de navegador; lint/build correctos. Históricos retirados con evidencia conservada y hueco público migrado. Omisiones explícitas inferiores. |
| RLS con roles reales, sin service_role | **DIFERIDO, limitación aceptada para V1**: no ejecutado con sesiones reales de QA. SQL local tiene motor/RLS reales, pero Auth sintética. Procedimiento conservado para futuro uso autorizado. |
| Visitante y colaborador no modifican catálogo por API | Visitante: probes denegados con límites explícitos. Colaborador: solo SQL local y dobles SDK; **pendiente PostgREST autenticado real**. |
| Administrador y moderador | Matriz local SQL pasa: admin confirmado administra; moderador revisa mediante RPC, no administra catálogo arbitrariamente; cuenta sin confirmar no adquiere privilegios. **Pendiente repetir con sesiones reales**. |
| Auditoría, duplicados y resolución | SQL local PASS: eventos append-only, actor, duplicados de nombre/código y archivados, cuotas, aprobación/rechazo, bloqueo de segunda resolución, rollback ante fallo de auditoría y concurrencia real. **No se inspeccionó auditoría remota como admin ni se resolvieron solicitudes remotas**. |
| Auth, PDF, descargas y navegación | Suites públicas HTTP y navegador pasan, incluidos soft-404 y teclado de Aportes corregidos. Auth real de cuentas existentes/renovación/cierre de sesión y pantallas privilegiadas **no comprobados**. |
| Omisiones documentadas | Ver apartados de decisión y última verificación. Cierre aprobado por el usuario con limitación remota aceptada; no se presentan omisiones ni fallos locales como PASS. |

## Pruebas omitidas y por qué

1. **Operaciones reales student/moderator/admin**: sin tokens/sesiones autorizadas para QA. No se reutilizaron perfiles personales ni se buscaron contraseñas. Se necesitan sesiones de cuentas existentes verificadas, entregadas mediante un mecanismo local seguro, no pegadas en el chat ni versionadas.
2. **Crear/editar/archivar/restaurar registros, provocar duplicados y aprobar/rechazar solicitudes remotos**: requieren modificar datos. El usuario exige autorización previa para registros de prueba, por lo que no se crearon ni se usaron registros existentes como blancos. La validación positiva y de atomicidad requiere un entorno aislado o autorización explícita para un conjunto de registros de QA y sus operaciones; no basta con sesiones reales en modo lectura.
3. **Inspección remota completa de historial, RLS/grants/triggers e índices**: no hay conexión SQL administrativa de solo lectura disponible. El acceso público a tablas confirma disponibilidad, no identidad exacta de las cuatro migraciones. No se ejecutaron `db push`, repair, reset ni tests SQL remotos.
4. **Registro, confirmación, recuperación, cambio de contraseña y login/logout reales**: podrían crear cuentas, enviar correos o alterar cuentas/sesiones; faltan identidades y autorización. Se ejecutaron dominio/SDK dobles y navegador anónimo, sin presentarlos como Auth extremo a extremo.
5. **Mutaciones autenticadas de navegador**: los runners históricos abiertos no prueban mutaciones persistentes. Inicialmente omitidos y luego ejecutados anónimamente (42 PASS/20 FAIL y fallo de arranque), quedaron archivados en `tests/historical/` con entrada bloqueada. Cobertura vigente y hueco migrado en `QA_RUNNERS_HISTORICOS.md`. Las interacciones privadas siguen pendientes de sesiones/aislamiento autorizados y no se cuentan como PASS.
6. **Modo error del runner de catálogo contra remoto**: ya hay catálogo disponible. No se interrumpió Supabase ni se retiraron tablas para simular caída. Las pruebas unitarias de error/fallback sí se ejecutaron.

## Evidencia local

- PostgreSQL: `/tmp/opencode/wiki-sql-qa-30cjXJ/report.json`.
- API anónima (solo estados/códigos/conteos): `/tmp/opencode/wiki-hito22-anon-api.json`.
- Reproducción de rutas: `/tmp/opencode/wiki-hito22-invalid-routes.json`.
- Diagnóstico de radios: `/tmp/opencode/wiki-hito22-radio-diagnostic/report.json`.
- Catálogo persistente: `/tmp/opencode/wiki-persistent-catalog-1792791886039/report.json`.
- Auth: `.next/qa-auth-evidence/report.json`.
- Visor/descargas: `.next/qa-materials-evidence/browser-materials-report.json`.
- Navegación: `.next/qa-evidence/browser-report.json`.
- Favoritos: `.next/qa-favorites-evidence/report.json`.
- Aportes: `.next/qa-contributions-evidence/browser-contributions-report.json`.

Se inspeccionaron visualmente capturas de portada móvil, login móvil oscuro y PDF móvil oscuro. Las capturas adicionales y verificaciones responsive/contraste/teclado constan en los reportes automatizados; no todas se revisaron visualmente una por una. Los artefactos en `.next` y `/tmp/opencode` son locales y pueden perderse al limpiar/reconstruir; este informe conserva los resultados y comandos. Al terminar se detuvo únicamente el servidor local 3103 iniciado para esta validación; no se interrumpió el servidor preexistente.

## Resolución de las condiciones de cierre

1. **Cumplido:** resolver soft-404 y actualizar la expectativa de orden del test; suites afectadas y completas reejecutadas sin fallos.
2. **Diferido por decisión expresa del usuario:** sesiones temporales student/moderator/admin y matriz remota adicional. No son requisito bloqueante para la V1 aprobada; no se afirma que se hayan ejecutado.
3. **Procedimientos preservados:** API por rol, aislamiento, auditoría/duplicados/resolución atómica e inspección del esquema podrán retomarse con autorización futura, sin relajar políticas ni controles.
4. **Cierre aprobado:** evidencia local/manual previa y última verificación local con sus límites documentados arriba. Hito 2.3 no autorizado. Sin commit ni push.
