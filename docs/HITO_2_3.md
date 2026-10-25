# Hito 2.3 — Materiales reales (completado para V1)

> **Revisión de regresiones posterior al cierre:** diagnóstico, correcciones,
> comandos reproducibles sin Supabase/R2 remoto y resultados vigentes en
> [QA_REGRESIONES_2_3.md](QA_REGRESIONES_2_3.md). Las cifras de fallos de este
> documento conservan la evidencia histórica del cierre, no el resultado de la
> nueva verificación. No se avanza al Hito 2.4.

> **Cierre aprobado por el usuario el 24-10-2026.** Integración manual real con Supabase y Cloudflare R2 confirmada por el operador. Este estado sustituye las notas históricas de integración/configuración pendiente. No implica que todas las pruebas automatizadas o pendientes operativos estén aprobados. No se despliega ni se inicia Hito 2.4.

## Integración real reportada por el operador

| Flujo | Resultado confirmado por el usuario |
| --- | --- |
| Tarea PDF | Subida real y persistencia de metadatos. |
| Moderación de Tarea | Aprobación y publicación. |
| Lectura de Tarea | Visualización y descarga correctas. |
| Segundo aporte: Listado | Subida real, rechazo y ocultamiento del catálogo público. |
| Consulta directa a Supabase | Ambos estados `approved` y `rejected`, cargas `ready` y eventos de auditoría correspondientes. |

**Procedencia:** verificación manual comunicada por el usuario en la solicitud de cierre, no una ejecución remota repetida por el agente. No se adjuntan IDs, correos, documentos privados, capturas SQL ni secretos. No se infieren pruebas de imágenes, aislamiento con múltiples cuentas, hashes, concurrencia, recuperación o limpieza remota a partir de este ciclo.

Se conservan RLS, permisos, controles de moderación, bucket privado y migraciones aplicadas. En esta tarea solo se actualiza documentación y se ejecuta QA; no se aplica/reaplica SQL remoto, no se modifican datos ni se crean recursos.

### Checklist del cierre documental

- [x] Registrar integración real y su procedencia.
- [x] Actualizar roadmap y notas de estado sin avanzar al Hito 2.4.
- [x] Separar limitaciones y evidencia histórica de pruebas aprobadas.
- [x] Registrar resultados finales de lint, build, suites y revisión de secretos (incluidos fallos, sin declararlos aprobados).

## Limitaciones pendientes (no son pruebas aprobadas)

- El ciclo real reportado cubre dos aportes y un PDF aprobado; no demuestra todos los formatos ni todos los roles. Quedan sin nueva evidencia remota: acceso directo a pendientes/rechazados por visitante/otra cuenta, filtros/facetas, comparación SHA-256, archivos hostiles o >25 MiB, reintentos, carreras, fallos R2/DB y limpieza de reservas. La cobertura local de esos controles no equivale a integración remota.
- La auditoría adicional de RLS remoto con cuentas temporales del Hito 2.2 sigue diferida; procedimientos conservados. No se debilitan políticas para cerrar V1.
- Los fallos HTTP/browser heredados del cierre quedaron corregidos y verificados localmente el 25-10-2026 en [QA_REGRESIONES_2_3.md](QA_REGRESIONES_2_3.md), incluida instalación limpia. Las cifras inferiores conservan la ejecución histórica fallida; no son evidencia de publicación de documentos privados ni sustituyen el informe vigente. El recorrido autenticado de navegador conserva su omisión explícita.
- PDF.js no es antivirus ni aislamiento de recursos; límites de memoria/CPU, abuso distribuido y compatibilidad de uploads de 25 MiB con el hosting siguen pendientes antes de tráfico hostil/despliegue. Detalle operativo abajo.
- Favoritos locales sin sincronización de cuenta, reportes DEMO y mantenimiento de limpieza manual. No se implementan funcionalidades nuevas en este cierre.
- Sin prueba de carga de producción ni auditoría completa de accesibilidad/configuración del bucket. La visualización/descarga reportada no certifica por sí sola toda la configuración de seguridad de R2.

## Verificación automatizada del cierre (24-10-2026)

Servidor de producción local en `http://127.0.0.1:3110`, sin sesión autenticada ni envíos reales. Logs de esta sesión bajo `/tmp/opencode/wiki-hito-2-3-close-*` (fuera de Git).

| Comando / alcance | Resultado de esta sesión |
| --- | --- |
| `pnpm lint` | PASS, salida 0. |
| `pnpm build` | PASS, salida 0; compilación, TypeScript y generación. |
| `WIKI_TEST_PRODUCTION_MANIFEST=true pnpm test` | 203 pruebas: **193 PASS, 10 SKIP, 0 FAIL**. Los SKIP son opt-in, no aprobaciones. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3110 WIKI_TEST_PRODUCTION_MANIFEST=true pnpm test` | 261 pruebas: **242 PASS, 3 SKIP, 16 FAIL** (incluye fallos de suites padre). No es una suite HTTP global verde. |
| Runner SQL efímero, comando de `QA_POSTGRES_LOCAL.md` | PASS: seis migraciones, suites Auth/catálogo/materiales/Tareas/cuotas y concurrencia real. Preservación de filas, ACL y RLS comprobada; Auth sintética, no Supabase remoto. Informe `/tmp/opencode/wiki-sql-qa-NAqNq4/report.json`. |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3110 pnpm test:browser` | Salida 1. Auth **26 PASS**; materiales **29 PASS, 12 FAIL**, 40 capturas, sin errores de navegador ni fallos de red. La cadena `&&` detuvo las suites siguientes; resultados independientes se registran abajo. |

Suites posteriores ejecutadas **por separado**, todas contra el mismo servidor mediante `WIKI_TEST_BASE_URL=http://127.0.0.1:3110`:

| Comando | Resultado |
| --- | --- |
| `node tests/browser-catalog.mjs` | **22 PASS, 5 FAIL**, salida 1; 22 capturas, sin errores de navegador ni fallos de red. Fallan navegación/filtros con conteos DEMO y expectativa antigua de tres categorías; hoy existen cuatro. |
| `node tests/browser-favorites.mjs` | **3 PASS, 4 FAIL**, salida 1. Falla selección de material de muestra, conteos al recargar, retirada por teclado y recuperación con referencias manipuladas; no se certifican esas regresiones de favoritos. |
| `node tests/browser-contributions.mjs` | **11 PASS_WITH_LIMITATIONS**, salida 0: acceso anónimo protegido, enlaces, responsive claro/oscuro y estados explícitos. No envía aportes ni inicia sesión. |
| `WIKI_CATALOG_QA_MODE=public node tests/browser-persistent-catalog.mjs` | **10 PASS**, salida 0, sin errores de navegador. Smoke público de solo lectura, teclado y redirección administrativa; no es QA autenticada. Informe `/tmp/opencode/wiki-persistent-catalog-1792817112389/report.json`. |
| `node tests/browser-tasks.mjs` | **9 PASS**, salida 0: cuarta categoría, filtros, etiquetas/foco y no overflow en 375/768/1280/1440 px claro/oscuro. Informe `/tmp/opencode/wiki-tasks-1792817135211/report.json`. |

Resumen del lote independiente: `/tmp/opencode/wiki-hito-2-3-close-browser-remaining.json`. Informes de Auth/materiales/catálogo/favoritos/aportes en sus carpetas `.next/qa-*-evidence/` ignoradas por Git. No se desactivaron ni reescribieron pruebas para ocultar fallos. Prerrequisito para reproducir HTTP/browser: `pnpm start --hostname 127.0.0.1 --port 3110` después del build.

**Fallos HTTP observados:** expectativas DEMO de conteos, filtros, búsqueda y fichas de muestras no coinciden con el catálogo persistente actual. Además, `/materiales/demo-pending-calculo` y `/materiales/demo-rejected-algebra` responden HTTP 200 con UI de no encontrado (`notFound` tras streaming); no se considera correcto el estado HTTP. Sondas anónimas confirmaron 404 en `/materiales/demo-pending-calculo/archivo` y `/api/materiales/demo-pending-calculo/archivo`, sin bytes PDF. Esto no sustituye probar IDs reales privados ni demuestra una filtración de sus archivos. Corrección del estado HTTP/actualización del harness pendientes, sin tocar controles en este cierre.

**Fallos browser de materiales:** contexto curricular de muestra, reporte/tabulación, regreso con filtros y ocho comprobaciones de contraste de ficha sin archivo (muestra ausente). Coinciden con el alcance de fallos históricos 29/12, pero siguen siendo fallos vigentes; no se certifican navegación/contraste globales.

**Secretos y preservación:** `git check-ignore -v .env.local` confirma exclusión por `.env*`; `.env.local` no está en el índice. Inspección de 241 archivos del índice, archivos nuevos no ignorados y 400 blobs del historial alcanzable: sin coincidencias con los valores privados locales ni patrones de claves privadas, AWS o `sb_secret_`; sin rutas sensibles versionadas. Revisión adicional del historial: sin JWT `service_role`, tokens GitHub ni URLs de conexión con contraseña detectados. `.env.example` contiene configuración de ejemplo, no credenciales locales. Se comprueban nombres/patrones y coincidencias sin imprimir valores; no es garantía contra todo secreto desconocido ni inspecciona historia inaccesible/remotos externos.

Comparación SHA-256 contra el inicio de la tarea: **157 archivos de `src/` y `supabase/` intactos**, incluidas migraciones, RLS y moderación. `git diff --check`: PASS. Enlaces locales de los siete documentos modificados: PASS. Inspección visual de captura nueva de login móvil oscuro: sin desborde aparente; no constituye auditoría de accesibilidad de pantallas autenticadas.

**Archivos modificados en este cierre:** `README.md` (roadmap y estado), `docs/HITO_2_3.md` (integración, pruebas y pendientes), `docs/HITO_2_3_TAREAS.md`, `docs/UPLOAD_METADATA_DEBUG.md`, `docs/BRIEF_PRODUCTO.md`, `docs/MODELO_DOMINIO.md` y `docs/DISENO.md` (estado vigente y contexto histórico). Se conservan todos los cambios de implementación preexistentes. Sin dependencias nuevas, commit, push ni despliegue.

Avisos conocidos Node `MODULE_TYPELESS_PACKAGE_JSON` y PDF.js durante tests; no se cambia configuración para silenciarlos. No se modifica código, permisos ni migraciones para hacer pasar expectativas heredadas.

## Evidencia histórica de implementación y depuración

Las secciones siguientes conservan lo observado en sesiones anteriores. Las frases «pendiente», «no aplicado» o «no probado» describen esas sesiones, no revocan el cierre actual. Las instrucciones operativas siguen disponibles para mantenimiento autorizado, **no ordenan reaplicar migraciones ya aplicadas**.

## Depuración del 503 de aportes (24-10-2026)

- El texto «No se pudo confirmar la recepción…» corresponde al `catch` final de `src/app/api/materiales/route.ts`, no identifica por sí mismo R2. Engloba catálogo → reserva → PUT privado → finalización. `receiveMaterial` no borra filas ni objetos ante errores. Una tabla realmente vacía en SQL Editor sitúa el fallo antes de completar la reserva; una consulta filtrada por RLS no permite esa conclusión.
- Defecto confirmado y corregido: reserva/finalización descartaban el código PostgREST y PUT descartaba el error SDK. Ahora se conserva internamente (sin enviarlo al navegador) y se registra únicamente una allowlist segura al activar `WIKI_MATERIAL_UPLOAD_DIAGNOSTICS=true` en el proceso servidor. No se imprimen errores completos, mensajes originales, IDs, archivos, metadatos, URLs ni credenciales. `reason`, cuando existe, es una etiqueta fija de errores SQL conocidos, nunca texto libre.
- Etapas: `configuration`, `supabase_budget`, `catalog`, `supabase_reserve`, `r2_put`, `supabase_finalize`. Ejemplo ficticio: `[material-upload] { stage: 'supabase_reserve', code: '22023', reason: 'invalid_upload_metadata' }`. `PGRST202` apunta a resolución de RPC/schema cache; `42501` a permisos/verificación; `22023` a validaciones SQL (consultar `reason`); `AccessDenied`/403 en `r2_put` a almacenamiento. `UNKNOWN` no demuestra ninguna causa concreta.
- Cliente privilegiado independiente, sin cookies, persistencia ni sesión SSR. Prueba con SDK real y fetch simulado verifica `apikey`/Bearer de servidor en finalización. Consulta remota **solo lectura** a `materials?select=id&limit=0` con clave de servidor: HTTP 200; esquema REST anuncia `reserve_material_upload` y `finalize_material_upload`. Lectura pública de `courses` y `public_materials` con SDK: HTTP 200. Esto no verifica el cuerpo SQL remoto, el PUT R2 ni la ejecución real de finalización.
- **Actualización del diagnóstico:** el operador aportó `stage=supabase_reserve`, `code=22023`, `reason=invalid_upload_metadata`. Se reprodujo la incompatibilidad de Tareas con la RPC histórica en PostgreSQL efímero; ver [detalle](UPLOAD_METADATA_DEBUG.md). No se inspeccionó el cuerpo SQL remoto ni se repitió escritura remota. Los diagnósticos siguen siendo opt-in (`WIKI_MATERIAL_UPLOAD_DIAGNOSTICS=true`), con allowlist segura; desactivarlos tras depurar. No llamar a limpieza para este rechazo.
- Verificación local: `pnpm test` (192 PASS, 11 SKIP), `pnpm lint`, `pnpm build`; todas las migraciones, suites SQL y concurrencia en PostgreSQL efímero PASS (`/tmp/opencode/wiki-sql-qa-mYwoOg/report.json`). Advertencias de Node por módulos TS sin `type` explícito. Sin cambios visuales; no se ejecutó navegador autenticado ni carga remota. No se modifica ningún dato remoto/R2, política RLS, migración aplicada ni Git remoto.

## Estado y alcance al implementar (histórico)

**Registro previo al cierre — Tareas:** el operador informó que `202610230003_materials.sql` ya estaba aplicada en Supabase remoto. La ampliación entregó `202610240001_material_tasks.sql`; en esa sesión su aplicación/integración real seguía pendiente. El ciclo real confirmado ahora por el usuario supera ese bloqueo. Ninguna migración aplicada debe editarse ni reaplicarse en este cierre.

Autorizado por la solicitud del usuario del 23-10-2026. En la sesión de implementación no se declaró completado: faltaba verificar un ciclo real de subida → moderación → publicación con Supabase y Cloudflare R2. En esa sesión no se aplicó SQL remoto, no se crearon recursos Cloudflare, no se modificaron usuarios ni datos académicos remotos, no hubo deploy/commit/push ni avance al Hito 2.4.

La comprobación de configuración únicamente por presencia (sin mostrar valores) encontró configuración pública Supabase disponible; faltan `SUPABASE_SERVICE_ROLE_KEY` y las cuatro variables R2. No se intentó usar ni inventar esas credenciales.

## Implementación

- `course_offerings` conserva la relación ramo/período, independiente de la ubicación curricular. `materials` guarda metadatos, descripción, propietario, hash SHA-256, clave privada, carga y revisión. La identidad es UUID, nunca el título ni el nombre original.
- Se conserva el normalizador compartido: un archivo llamado `certamen2 2024-2.pdf` puede tener nombre público `Certamen 2 - 2024-2.pdf`, pero el nombre original nunca determina sus metadatos.
- `upload_state`: `uploading → ready` solo mediante RPC exclusiva del servidor validador; `uploading → failed` para reservas fallidas/expiradas. `status`: `pending → approved/rejected` únicamente con revisión humana atómica. Un archivo incompleto nunca entra en la cola revisable ni en el catálogo.
- RLS permite metadatos privados solo al propietario o revisor. Visitantes no tienen SELECT de tablas privadas; `public_materials` es una vista de propietario con **allowlist fija** y predicado obligatorio `approved AND ready`. No es una vista genérica `SELECT *`; cualquier cambio de ese predicado exige nueva revisión de seguridad.
- `material_review_events` es append-only. La RPC de revisión bloquea fila y autoridad, exige notas y guarda decisión + evento en una transacción. Una segunda decisión devuelve conflicto; un fallo de auditoría revierte publicación.
- Reserva idempotente por `(uploaded_by, operation_id)`: un reintento con payload diferente se rechaza. Índice de duplicado exacto por propietario/hash/oferta/tipo/número/sección/profesor/versión, sin impedir otras versiones legítimas. Un aporte rechazado o carga fallida no bloquea un nuevo intento.
- Cuotas SQL serializadas: 10 pendientes no fallidos y 20 aportes en 24 horas por cuenta. Además, **20 intentos en 15 minutos antes de leer/validar el archivo**, incluidos inválidos/reintentos. Máximo dos cargas concurrentes por proceso, sin cola de archivos en memoria.
- `/aportar` usa el formulario existente con sesión verificada, progreso XHR real y confirmación solo tras 201. `/mis-aportes` lista estados propios. `/moderacion` añade cola real paginada con preview PDF/imagen, observaciones y confirmación. Solicitudes reales anteriores y ejercicios DEMO se mantienen separados.
- Catálogo público usa materiales persistentes; solo las muestras opt-in `WIKI_ENABLE_DEMO_MATERIALS=true` se añaden identificadas como DEMO. No hay fallback de materiales reales ante fallos SQL. Los enlaces directos de muestras originales siguen disponibles para QA, incluso con el opt-in desactivado; son assets deliberadamente públicos, nunca uploads.
- Se mantienen filtros, nombre académico, visor PDF.js/imágenes, descargas y favoritos locales por ID. Los favoritos no se migran ni sincronizan con cuentas. Los reportes siguen explícitamente simulados.

## Configurar Supabase — referencia operativa histórica

1. Confirmar respaldo e historial previo con `docs/AUTH_SQL.md` y `docs/CATALOGO_SQL.md`. Las cuatro migraciones anteriores son prerrequisito; **no reaplicarlas a ciegas**.
2. La migración histórica `supabase/migrations/202610230003_materials.sql` ya fue aplicada según el operador: no editarla ni reaplicarla. Revisar la incremental `supabase/migrations/202610240001_material_tasks.sql`; ejecutarla remotamente solo con autorización expresa. Amplía el CHECK de categoría y sustituye la RPC conservando sus permisos; no modifica filas, ofertas ni recursos R2.
3. Verificar tablas, índices, políticas, vista y grants contra esta migración; recargar el schema cache de PostgREST si no reconoce las RPC nuevas. Las RPC son `reserve_material_upload`, `authorize_material_upload_attempt`, `review_material`; finalización/fallo/expiración/marcado de limpieza son exclusivas `service_role`.
4. Configurar `SUPABASE_SERVICE_ROLE_KEY` **solo en servidor**, junto a la URL y clave pública existentes. Sirve para confirmar cargas validadas y mantener objetos; no representa la identidad del estudiante/moderador. Las reservas/revisiones usan el cliente de su sesión y vuelven a autorizar en PostgreSQL.
5. Nunca poner esta clave en `NEXT_PUBLIC_*`, código cliente, capturas, logs ni Git. No modificar usuarios ni asignar roles para esta entrega; usar cuentas de prueba ya autorizadas o pedir autorización separada si hicieran falta.

## Configurar Cloudflare R2 — referencia operativa

No se crea ningún recurso automáticamente. El operador debe proporcionar un bucket privado existente o autorizar su creación por separado.

```dotenv
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_BUCKET=<bucket-privado>
R2_ACCESS_KEY_ID=<token-s3-solo-servidor>
R2_SECRET_ACCESS_KEY=<secreto-solo-servidor>
WIKI_ENABLE_DEMO_MATERIALS=false
```

- Mantener **deshabilitados r2.dev y dominios públicos**. El token debe estar limitado al bucket y permitir lectura/escritura/eliminación de objetos, no administración de la cuenta. No enviar credenciales al navegador.
- Endpoint sin ruta/query/credenciales; el adaptador rechaza hosts arbitrarios. Solo desarrollo/test admite un servicio S3 local por loopback HTTP.
- Claves generadas en SQL: `materials/<uid>/<uuid>.<extension>`. No se usa el nombre original como ruta. PUT condicional `If-None-Match: *`; ante 412, HEAD debe coincidir en tamaño/MIME/hash para aceptar reintento. Nunca sobrescribe un objeto existente diferente.
- Los objetos aprobados también permanecen en el bucket privado. La aplicación autoriza cada lectura y sirve bytes desde sus propias rutas; no necesita CORS de subida directa ni URLs públicas. El adaptador permite firmas de lectura de **60 segundos** para usos autorizados, pero los endpoints actuales no las entregan: usan proxy de la Wiki y no filtran claves de almacenamiento.
- Cada lectura comprueba tamaño, MIME y SHA-256. Errores SQL/R2 dan error explícito y no enlaces de respaldo públicos. La ficha pública no descarga el objeto solo para construir metadatos.

## Validación de archivos y límites operativos

- PDF, JPEG, PNG o WebP únicos, de 1 byte a **25 MiB**; MIME, extensión, firma, longitud real y parseo de contenido deben coincidir. Se limita también multipart a 25 MiB + 64 KiB y su recepción a 120 segundos.
- Imágenes: decode con sharp, dimensiones hasta 20000 por eje, hasta 40 millones de píxeles, una imagen/página, rechazo de errores/truncados.
- PDF: parseo con PDF.js sin eval, fuentes deshabilitadas; hasta 1000 páginas/200000 operadores y 15 segundos orientativos. Se rechazan cifrado, JavaScript, adjuntos y acciones detectadas; escaneo complementario de tokens peligrosos. **No es antivirus ni garantiza detectar todas las variantes de contenido activo**. El timeout no puede interrumpir trabajo síncrono ni constituye aislamiento de memoria. Antes de tráfico hostil a escala se necesita aislar el parser en un proceso/worker con límites de recursos y considerar escaneo especializado.
- El servidor recibe el multipart completo y mantiene buffers acotados; las lecturas públicas también consumen memoria por petición. Estos límites no equivalen a un sistema antiabuso distribuido general.
- **Hosting:** probar localmente con Node. No asumir compatibilidad de uploads de 25 MiB con funciones Vercel Hobby, cuyo límite de cuerpo puede ser menor. Antes de desplegar habrá que elegir un receptor que admita ese tamaño o autorizar un flujo de staging directo firmado con validación posterior. No se implementa/despliega esa ampliación aquí.

## Recuperación y limpieza

No hay transacción distribuida entre R2 y PostgreSQL. La reserva se guarda antes del PUT. Un error/timeout de R2 o DB conserva la reserva y permite reintentar con la misma operación; no se anuncia recepción y nunca se borra automáticamente un objeto después de una finalización ambigua que podría haberse confirmado. El cliente conserva el identificador mientras no cambie archivo/metadatos en esa página; tras recargar, Mis aportes permite comprobar qué quedó guardado.

Reservas `uploading` sin actividad durante 24 horas se marcan `failed` mediante bloqueo excluyente con finalización y reserva. Cada reintento idéntico bloquea la fila y renueva el lease `updated_at`, sin cambiar `submitted_at`; una colisión de payload no renueva. Así la limpieza no puede borrar debajo de un PUT reintentado. PUT tiene límites efectivos de conexión/solicitud (`throwOnRequestTimeout: true`, comprobado con SDK real loopback) y dos intentos como máximo, muy por debajo del lease. Un mantenimiento administrativo explícito elimina solo objetos de filas fallidas, registra `storage_deleted_at` tras borrar y permite avanzar en lotes de 100; si R2 o el marcado falla, se puede repetir. No borra filas académicas, archivos listos, rechazados revisados ni aprobados. No activar una regla de expiración general sobre `materials/`: borraría archivos publicados.

Para solicitar limpieza, desde la consola del navegador en la Wiki, autenticado como **administrador autorizado**:

```js
await fetch('/api/materiales/limpieza', { method: 'POST' }).then(r => r.json())
```

Repetir hasta `deleted: 0` si hay más de 100. Cada solicitud valida origen y rol actual; no hay GET destructivo ni cron/recursos externos creados automáticamente.

## Checklist ampliado de integración (referencia; no todo ejecutado)

Una vez autorizada/aplicada la migración y entregadas las credenciales **fuera del chat/Git**:

1. Reiniciar `pnpm dev`; iniciar sesión con correo verificado. Abrir `/aportar`, elegir ramo activo, Tareas, número 2, año 2025, término 1 y PDF original autorizado (también comprobar PNG/JPEG/WebP). Confirmar permiso, observar progreso y recepción pendiente con ID.
2. Recargar `/mis-aportes`: debe persistir y poder previsualizarse solo con sesión propia/revisor. Desde otra cuenta estudiante y sesión anónima, probar el ID privado `/api/materiales/<id>/archivo`: 404. Ficha/archivo público no deben publicarlo.
3. Con un moderador ya autorizado, abrir `/moderacion`, revisar metadatos/preview, añadir observaciones y confirmar aprobación. Recargar la cola y verificar auditoría. Intentar decidir simultáneamente desde otra pestaña: solo una resolución.
4. Sin sesión, comprobar el material en su ramo, cuarta categoría Tareas, filtros 2025-1/número 2, búsqueda, visor y descarga `Tarea 2 - 2025-1.pdf`. Verificar favoritos locales y navegación; comparar hash de descarga con el archivo aportado.
5. Enviar otro archivo autorizado y rechazar con motivo: solo propietario/revisor pueden consultarlo; no aparece por ID, búsqueda, facetas ni descarga pública. No reutilizar sin permiso documentos de terceros.
6. Probar archivo falso, corrupto, extensión/MIME distintos y >25 MiB: nunca se publica. Doble clic/reintento conserva un único ID; cambiar payload con la misma operación se rechaza.
7. En entorno de pruebas autorizado, simular indisponibilidad R2/DB y recuperar sin duplicar; revisar Mis aportes antes de reintentar. Probar limpieza de una reserva abandonada sin alterar filas existentes ni archivos listos.
8. Registrar evidencia del ciclo, sin secretos ni datos personales. El cierre V1 actual se basa en el alcance confirmado por el usuario al inicio de este documento; los pasos adicionales no reportados siguen pendientes y no se dan por aprobados. No hace falta organizar la auditoría remota adicional con cuatro cuentas temporales del Hito 2.2 para este cierre.

## Pruebas y evidencia local histórica

- `WIKI_TEST_PRODUCTION_MANIFEST=true pnpm test`: **198 pruebas, 188 PASS, 10 SKIP opt-in, 0 FAIL** tras build final. Incluye manifiesto real: fichas UUID no generadas en build permiten resolución dinámica (`fallback: null`), no quedan cerradas a los IDs DEMO. Sin esa variable, la prueba de manifiesto también se omite (187 PASS/11 SKIP).
- `pnpm lint`: PASS. `pnpm build`: PASS con configuración final. `git diff --check`: PASS. PDF.js se externaliza exclusivamente en servidor para resolver su worker nativo; el lector cliente conserva su worker preparado existente.
- PostgreSQL efímero real: cinco migraciones, pruebas de Auth/catálogo/materiales/cuotas/presupuesto y concurrencia real PASS. Última ejecución del coordinador, incluyendo lease contra limpieza: `/tmp/opencode/wiki-sql-qa-cgk9Ol/report.json`. Auth sintética del harness; no valida GoTrue/PostgREST remoto.
- HTTP producción local Auth/materiales/moderación: **34 PASS**, rutas protegidas, lector/descarga de muestras y ausencia de fixtures privados. Chromium error/configuración, claro/oscuro, teclado, 390/1280px: **12 comprobaciones PASS**, consola sin errores; `/tmp/opencode/wiki-persistent-catalog-1792803196538/report.json`.
- QA aportes actualizado al contrato protegido: HTTP final en puerto 3105 **8 PASS, 2 SKIP, 0 FAIL** (incluye contenedor); browser **11 comprobaciones PASS_WITH_LIMITATIONS**, 375/768/1280/1440px en claro/oscuro, etiquetas, contraste muestreado y foco. Evidencia `.next/qa-contributions-evidence/browser-contributions-report.json`. Se corrigieron el origen HTTP normalizado por Next (se compara contra Host real) y el destino permitido `/aportar` después de login. No se probó envío autenticado.
- `WIKI_TEST_BASE_URL=http://127.0.0.1:3104 pnpm test:browser`: **no pasa completo**. Auth **26 PASS**; materiales **29 PASS/12 FAIL**, sin errores de consola/red. Los 12 fallos corresponden a contexto curricular, reporte y navegación de muestras, más contraste de ficha sin archivo: requieren catálogo activo/fixtures, ausentes por configuración/migración no aplicada. La secuencia `&&` se detuvo allí; catálogo, favoritos y smoke público posteriores **no se ejecutaron en esa secuencia**. Aportes protegido y smoke de error sí se ejecutaron por separado. Informe `.next/qa-materials-evidence/browser-materials-report.json`; no se presenta como regresión pública completa verde. El mismo límite 29/12 ya estaba documentado en el cierre local del Hito 2.2.
- Nuevas pruebas usan bytes reales/parsers para archivos y dobles SDK para HTTP/servicios/R2; cubren acceso propietario/otro/revisor, validación, cuota previa al cuerpo, idempotencia, fallos R2/DB, integridad y limpieza de más de 100. SQL prueba RLS/grants, rollback de auditoría y carreras con dos conexiones reales.
- Avisos esperados: Node `MODULE_TYPELESS_PACKAGE_JSON`, recuperación de PDF corrupto y fuente estándar PDF.js durante QA. No se silenciaron fallos ni se presentaron dobles como R2 real.
- No probado en aquella sesión: ciclo Supabase/R2 real, pantallas autenticadas con registros reales, carga de producción ni configuración del bucket. La integración manual reportada en el cierre actual solo cubre el alcance detallado al inicio; no convierte el resto en pruebas aprobadas.

Se inspeccionaron visualmente capturas de login móvil y lector PDF en oscuro; no se vio overflow. La pantalla autenticada real sigue pendiente de configuración e identidad autorizada. Las comprobaciones de contraste no constituyen auditoría completa de accesibilidad.

Reproducir SQL sin conexiones remotas: `docs/QA_POSTGRES_LOCAL.md`. Los tests de aportes ya no exigen una ruta pública DEMO: prueban la frontera anónima, sin inventar una sesión.

## Archivos y dependencias

- Migración: `supabase/migrations/202610230003_materials.sql`; suites `supabase/tests/materials*.sql`, runner `scripts/run-catalog-sql-tests.mjs` y nueva concurrencia `scripts/test-materials-concurrency.mjs`.
- Servidor: `src/app/api/materiales/**`, `src/lib/materials/{actions,http,persistent,r2,rows,server-config,stored-source,upload-limits,upload-service,validate-upload}.ts`; integración `src/lib/catalog/{persistent,public-catalog,query}.ts`, `src/proxy.ts`, fichas/archivos públicos y `next.config.ts`.
- Interfaz: páginas aportar/mis-aportes/moderación, formulario/selectores existentes y transporte XHR, nuevo `src/components/moderation/persistent-materials.tsx`, etiquetas del catálogo/lector y avisos compartidos. Dominio de catálogo/aporte/moderación y destino seguro de Auth ajustados sin cambiar roles.
- Tests node nuevos: `tests/material-*.test.mjs`, `tests/persistent-material*.test.mjs`, `tests/persistent-contributions-ui.test.mjs`, `tests/r2.test.mjs`; actualización de pruebas de lector/aporte y runner browser de aportes.
- Configuración/documentación: `.env.example`, README, brief/modelo/diseño, este documento, QA SQL y plan del hito.
- Dependencias justificadas: `@aws-sdk/client-s3` para R2 compatible S3; `@aws-sdk/s3-request-presigner` para firmas de 60 s; `sharp` como dependencia directa para decodificar/verificar imágenes en servidor. PDF.js existente se reutiliza. Sin dependencias nuevas de UI ni servicios creados.
