# Regresiones automatizadas — Hito 2.3

**Verificación final: 25-10-2026. Sin fallos en las suites ejecutadas.** Única
omisión del lote completo: recorrido de formulario con identidad real; explicación
abajo. No equivale a E2E autenticado Supabase/R2.

## Alcance y aislamiento

Corrección previa al commit, sin avanzar al Hito 2.4. Sin cambios de usuarios,
credenciales, migraciones aplicadas, RLS o moderación. Sin escrituras en Supabase
remoto, sin operaciones R2, sin deploy, commit ni push.

`pnpm test:local` construye la aplicación con URL Supabase **loopback**, clave
sintética y secretos de servicio/R2 vacíos explícitamente. Arranca un doble REST
de solo lectura y Next en `127.0.0.1:3123`; rechaza un puerto ya ocupado. Ejecuta
HTTP, los siete navegadores vigentes y el modo de caída del catálogo. Guarda
logs y reporte en `/tmp/opencode/wiki-regressions-*` y cierra sus procesos.

El doble REST usa los ramos/áreas ficticios existentes, `public_materials=[]` y
`WIKI_ENABLE_DEMO_MATERIALS=true`: conserva nueve muestras públicas y sus IDs sin
introducir materiales privados en el cliente. No es una implementación de
PostgREST ni prueba RLS. RLS/transacciones se comprueban con PostgreSQL nativo
efímero por separado; SDK/R2/subida/moderación tienen pruebas unitarias de servicio.

## Diagnóstico individual

Se reprodujeron **16 fallos HTTP** (12 hojas y 4 suites padre) y **29 PASS / 12
FAIL** en materiales con el catálogo local disponible pero las muestras desactivadas.
No eran 28 defectos independientes. Mensajes exactos HTTP/materiales recogidos
antes de corregir; los artefactos temporales iniciales desaparecieron al reanudar
el entorno, por lo que las tablas conservan la evidencia textual observada.

| Prueba HTTP fallida | Mensaje observado | Clasificación y causa |
| --- | --- | --- |
| `academic-routes`: categorías/filtros | `/ramos/calculo-i: 0 !== 1` | Prerrequisito: muestras no asociadas al catálogo. |
| `academic-routes`: vacíos/parámetros desconocidos | `0 !== 3` | Derivado del mismo prerrequisito. |
| `academic-routes`: IDs privados | `/materiales/demo-pending-calculo`, aserción de estado falsa | Defecto real: ausencia resuelta después del streaming. |
| `course-routes`: semestres/slugs | `/materiales/demo-pending-calculo: 200 !== 404` | Mismo defecto de estado, no otra filtración. |
| `course-routes`: buscador | `0 !== 5` | Prerrequisito: muestras ausentes. |
| `materials`: private and unknown IDs | `/materiales/demo-pending-calculo: 200 !== 404` | Mismo defecto de estado. Los endpoints de archivo seguían denegados. |
| `routes`: `/` | `0 !== 9` | Prerrequisito: muestras ausentes. |
| `routes`: `?q=calculo` | `0 !== 5` | Mismo prerrequisito. |
| `routes`: búsqueda por nombre de certamen | `0 !== 2` | Mismo prerrequisito. |
| `routes`: filtros combinados, malla 1 | `assert.ok(html.includes(expected))` | Nombre esperado ausente por el mismo prerrequisito. |
| `routes`: filtros combinados, malla 2 | `assert.ok(html.includes(expected))` | Expectativa obsoleta: título vacío actual es `No encontramos materiales`, sin `de ejemplo`. |
| `routes`: `?q=` | `0 !== 9` | Prerrequisito: muestras ausentes. |
| Cuatro suites padre | subtests fallidos | Derivados de las doce hojas anteriores, sin causa adicional. |

| Prueba de materiales fallida | Mensaje observado | Clasificación y causa |
| --- | --- | --- |
| PDF/contexto académico | `undefined !== '1'` | Prerrequisito: muestra independiente sin ramo en el catálogo. |
| Reporte local | `focus Reportar material` | Derivado: sin contexto público de material no se ofrece reporte. |
| Retorno con filtros/historial | `visible click target main a[href^="/materiales/demo-certamen-calculo-2?"]` | Derivado: falta tarjeta enlazada en ramo. |
| Contraste sin archivo: 375 claro | `contrast samples populated` | Derivado: se examinaba un estado de ausencia, no la ficha sin archivo. |
| Contraste sin archivo: 375 oscuro | `contrast samples populated` | Mismo prerrequisito. |
| Contraste sin archivo: 768 claro | `contrast samples populated` | Mismo prerrequisito. |
| Contraste sin archivo: 768 oscuro | `contrast samples populated` | Mismo prerrequisito. |
| Contraste sin archivo: 1280 claro | `contrast samples populated` | Mismo prerrequisito. |
| Contraste sin archivo: 1280 oscuro | `contrast samples populated` | Mismo prerrequisito. |
| Contraste sin archivo: 1440 claro | `contrast samples populated` | Mismo prerrequisito. |
| Contraste sin archivo: 1440 oscuro | `contrast samples populated` | Mismo prerrequisito. |
| Tabulación lector/reporte/descarga | `assert.ok(rows.some(row => row.name === 'Reportar material'))` | Derivado: falta el mismo reporte contextual. |

Otros fallos registrados en el cierre anterior y revisados en los runners:

- Catálogo: cuatro recorridos con conteos/selectores de muestras dependen de esos
  mismos fixtures. El quinto exige tres categorías en Geometría: **expectativa
  obsoleta**, ahora son cuatro y se exige explícitamente Tareas incluso vacía.
- Favoritos: selección del material, persistencia tras recarga, retirada por
  teclado y recuperación de referencias manipuladas dependen de los IDs de
  ramos/materiales del fixture; no se reducen sus aserciones ni se cambian los
  favoritos para encajar con datos remotos.
- Runner: cadena `&&` detenía el resto de navegadores y omitía Tareas. Ahora
  ejecuta las siete suites y devuelve error agregado si cualquiera falla.
- Se eliminó tolerancia HTTP 200 para ramos ausentes y se separaron las negativas
  de IDs privados del bloque optativo DEMO de aportes. Las negativas exigen 404
  real aunque no haya muestras.
- Al activar el test opt-in SQL de limpieza apareció `42704: role
  "service_role" does not exist`: faltaba ese rol sintético en **su clúster
  efímero**, requerido por las migraciones de materiales. Se añadió como en el
  runner SQL principal; test observado rojo y luego verde, sin roles remotos.
- La primera verificación tras importar el catálogo en el Proxy detectó dos
  `SyntaxError: Cannot use import statement outside a module` en `auth-session`:
  su cargador manual no sustituía los nuevos imports. Se actualizó el cargador
  conservando todas las aserciones de sesión, cookies y fallas de DB.
- En la copia con instalación limpia, materiales y catálogo no arrancaron:
  `FATAL:chrome/browser/process_singleton_posix.cc:315] Socket path too long:
  /tmp/opencode/wiki-clean-install-v_xknihu/.next/qa-m-profile/tmp/org.chromium.Chromium.RplnDE/SingletonSocket`
  (catálogo: `qa-browser-profile/tmp/.../SingletonSocket`). **Configuración del
  runner**, no fallo del lector. Ambos guardaban `TMPDIR` bajo el checkout;
  el socket Unix supera 108 bytes en rutas largas. Ahora usan una ruta corta por
  proceso en `/tmp/opencode`, igual que el driver compartido, sin alterar los
  perfiles, sandbox ni aserciones.

## Correcciones

1. El Proxy verifica que un ID DEMO sea público antes de que el layout pueda
   emitir cabeceras, también sin Supabase configurado. No se cambia el acceso a
   muestras aprobadas deliberadamente públicas ni a archivos privados.
2. Test de regresión observado rojo (`demo-pending-calculo: 200 !== 404`) y luego
   verde para pendiente, rechazado, inexistente y aprobado.
3. Fixtures/runners reproducibles, sin dependencia del contenido remoto; conteos
   originales conservados y expectativas textuales/categorías actualizadas.
4. Se conserva cobertura de lector PDF real, imágenes, hash/bytes de descarga,
   filtros/historial, reporte local, favoritos, aportes protegidos, Tareas,
   moderación y controles RLS/transaccionales. No se abren rutas DEMO protegidas.

## Reproducción desde instalación limpia

Requisitos: Node >=22.18, pnpm de `packageManager`, Chromium instalado (o
`WIKI_CHROME_PATH`), puerto 3123 libre. No hace falta `.env.local` ni credenciales.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test:local
```

Para SQL/concurrencia local, seguir [QA_POSTGRES_LOCAL.md](QA_POSTGRES_LOCAL.md).
Con ese harness ya instalado, activar también el test de limpieza durante el lote:

```sh
WIKI_EMBEDDED_POSTGRES_MODULE=/tmp/opencode/wiki-postgres-harness/node_modules/embedded-postgres/dist/index.js pnpm test:local
```

Sin esa variable, el test local de limpieza es opt-in y aparece omitido; no
significa que haya pasado. En la verificación final se ejecutó explícitamente.
En instalaciones npm que bloquean scripts de dependencias, ejecutar el
`scripts/hydrate-symlinks.js` del paquete nativo PostgreSQL revisado, dentro de
su directorio temporal, antes del runner; sin ello `initdb` no encuentra
`libpq.so.5`. No requiere permisos del sistema ni cambiar dependencias de la app.

`pnpm test` sin URL omite las pruebas HTTP por diseño; **no equivale al lote
completo**. `pnpm test:browser` necesita servidor ya configurado: no lo inicie
contra una instancia con credenciales remotas para reproducir este informe.

El build de QA usa configuración pública loopback y escribe `.next`. Después de
QA, ejecutar nuevamente `pnpm build` con la configuración normal antes de usar
`pnpm start` con servicios reales. No usar el build de fixtures para despliegue.

## Resultados finales

| Alcance / comando | Resultado comprobado |
| --- | --- |
| Unitarias: `WIKI_TEST_PRODUCTION_MANIFEST=true WIKI_EMBEDDED_POSTGRES_MODULE=… pnpm test` | **205 tests: 196 PASS, 0 FAIL, 9 SKIP**. Los nueve SKIP son contenedores HTTP sin URL, ejecutados en el lote HTTP separado. |
| SQL: `TMPDIR=/tmp/opencode WIKI_EMBEDDED_POSTGRES_MODULE=… node scripts/run-catalog-sql-tests.mjs` | **PASS**: seis migraciones, diez archivos SQL, preservación de datos/ACL/RLS e incremental de Tareas. PostgreSQL 18.4 efímero. |
| Concurrencia catálogo | **PASS**: cuotas y doble revisión con dos conexiones reales. |
| Concurrencia materiales | **PASS**: cuotas, idempotencia, presupuesto de intentos, revisión y limpieza/finalización con bloqueos reales. |
| Limpieza local opt-in | **1 PASS, 0 FAIL, 0 SKIP** tras preparar el rol sintético requerido. También activada en HTTP. |
| Instalación limpia: `WIKI_EMBEDDED_POSTGRES_MODULE=… pnpm test:local` | **Salida 0**, build, HTTP, siete navegadores y catálogo en error ejecutados sin detenerse antes del final. |
| HTTP (incluye unitarias) | **264 tests: 263 PASS, 0 FAIL, 1 SKIP**: formulario con identidad real, preexistente y no usado para ocultar regresiones. |
| Browser Auth | **26 PASS, 0 FAIL**. |
| Browser materiales | **41 PASS, 0 FAIL**: PDF.js, imágenes, bytes/descargas, reporte, navegación/filtros, teclado, contraste y responsive. |
| Browser catálogo | **27 PASS, 0 FAIL**, cuatro categorías. |
| Browser favoritos | **7 PASS, 0 FAIL**. |
| Browser aportes | **11 PASS_WITH_LIMITATIONS**, frontera anónima y estados públicos; no envío autenticado. |
| Browser catálogo persistente público | **10 PASS, 0 FAIL**. |
| Browser Tareas | **9 PASS, 0 FAIL**. |
| Browser catálogo en error | **12 PASS, 0 FAIL**, sin fallback a fixtures. |
| `pnpm build` en instalación limpia | **PASS**, salida 0; compilación, TypeScript y generación. |
| `pnpm lint` | **PASS**, salida 0 tras los últimos cambios de runners. |
| `git diff --check` y enlaces QA locales | **PASS**. |

Evidencia SQL: `/tmp/opencode/wiki-sql-qa-NGdSZ4/report.json`; limpieza:
`/tmp/opencode/wiki-cleanup-qa-bjfngm/report.json`; unitarias:
`/tmp/opencode/wiki-regressions-unit-verified.log`.

Lote final: `/tmp/opencode/wiki-regressions-nikqPE/report.json`, logs individuales
en esa carpeta; salida del coordinador en
`/tmp/opencode/wiki-clean-qa-verified.log`. Todos los procesos terminaron con 0;
el doble REST recibió únicamente GET. **143 comprobaciones de navegador** entre
las siete suites y el modo de error (once de ellas con las limitaciones de aportes).

La copia no contiene `.env.local`, se instalaron dependencias con el lockfile
congelado y se compararon **228 archivos de código/configuración idénticos**
contra el checkout; no reutilizó su `node_modules` ni su build.

### Incidencias intermedias conservadas

- Primera pasada corregida en el checkout: HTTP **260 PASS / 2 FAIL / 2 SKIP**
  por el cargador `auth-session`; siete navegadores y catálogo en error pasaron.
  `/tmp/opencode/wiki-regressions-vgPI3q/report.json`.
- Instalación sin caché con `--offline`: `ERR_PNPM_NO_OFFLINE_TARBALL` para
  `@nolyfill/is-core-module@1.0.39`; no es defecto del lockfile. Instalación normal
  `pnpm install --frozen-lockfile` descargó los paquetes y terminó correctamente,
  sin cambiar dependencias ni lockfile. Logs `wiki-clean-install*.log`.
- Primera pasada desde instalación limpia: build y HTTP **263 PASS / 0 FAIL /
  1 SKIP**; materiales y catálogo bloqueados por el socket largo, las otras cinco
  suites y el modo de caída pasaron. Se conserva como ejecución fallida, no se
  convierte en verde. `/tmp/opencode/wiki-regressions-YdQjRa/report.json`.
- PostgreSQL recién instalado: `initdb` falló por `libpq.so.5` al bloquear npm el
  postinstall de symlinks. Tras ejecutar el script nativo revisado dentro del
  paquete temporal, SQL/concurrencia pasaron en un clúster nuevo. Evidencia del
  intento fallido: `/tmp/opencode/wiki-sql-qa-z5bLW8/report.json`.

## Limitaciones y omisiones

- El recorrido autenticado de formulario real permanece omitido por no tener
  identidad de prueba local autorizada. No se crean usuarios ni se usa una
  sesión remota para forzarlo. El formulario/transporte, autorización, subida,
  moderación, fallas y cuotas se cubren en servicios/SQL, no se presentan como
  un E2E autenticado completo de navegador.
- Los dos runners históricos de gestión/moderación públicas siguen retirados:
  requerían abrir rutas que hoy exigen cuenta/rol. La cobertura vigente se
  detalla en [QA_RUNNERS_HISTORICOS.md](QA_RUNNERS_HISTORICOS.md).
- Revisión estática especializada de seguridad sin hallazgos concretos nuevos.
  Revisión QA advierte que los coordinadores no tienen watchdog global por
  proceso: un hijo suspendido externamente puede bloquear el lote. No se
  reprodujo ese caso ni ocurrió en los lotes completados; no es una garantía
  de tolerancia a procesos suspendidos. Los pasos CDP sí tienen plazos propios.
- Advertencias conocidas de Node `MODULE_TYPELESS_PACKAGE_JSON` y PDF.js al
  analizar PDFs inválidos/fuentes, sin ocultarlas ni silenciarlas. Dos errores
  del lector se inyectan deliberadamente para comprobar recuperación.
- Capturas públicas revisadas: PDF móvil oscuro y ficha sin archivo móvil
  clara, sin desborde aparente. Contraste/foco/responsive automatizados no
  equivalen a auditoría WCAG integral ni cubren pantallas autenticadas.
- No se repite integración remota ni pruebas de carga/antivirus. Continúan los
  límites operativos de [HITO_2_3.md](HITO_2_3.md).

## Archivos de esta corrección

- Producción: `src/proxy.ts`.
- Ejecución: `package.json`, `scripts/run-local-qa.mjs`, `tests/run-browser-suites.mjs`.
- Fixtures/pruebas nuevas: `tests/fixtures/catalog-server.mjs`,
  `tests/local-catalog-fixture.test.mjs`, `tests/material-page-status.test.mjs`.
- Pruebas existentes: `tests/{academic-routes,auth-session,browser-suite,contribution-routes,course-routes,qa-catalog-cleanup,routes}.test.mjs`,
  `tests/browser-catalog.mjs`, `tests/browser-materials.mjs`.
- Documentación: `README.md`, este informe, `docs/HITO_2_3.md`, `docs/QA_POSTGRES_LOCAL.md`,
  `docs/QA_RUNNERS_HISTORICOS.md` y el plan de regresiones.

El resto del árbol modificado corresponde al trabajo preexistente del Hito 2.3;
no se revierte ni se atribuye a esta corrección.
