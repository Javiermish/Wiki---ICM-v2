# Hito 1.4.1 — Electivos, gestión y favoritos DEMO

## Alcance vigente

Ampliación del **Hito 1.4**, no inicio del Hito 1.5. Catálogo ficticio, sin representar la malla oficial de la UdeC. Incluye electivos por área, gestión local de asignaturas y favoritos de demostración integrados con la navegación existente. Se conserva el formulario de aportes del [Hito 1.4](HITO_1_4.md), el lector y las descargas de muestras originales autorizadas del [Hito 1.3](HITO_1_3.md).

No hay autenticación, cuentas, permisos efectivos, API de administración, base de datos, Supabase, Storage, subida, publicación, solicitudes enviadas ni moderación real. No se ejecutan migraciones ni se cambia un esquema de producción. La ruta de gestión es **pública y exclusivamente DEMO**, no un panel protegido. No introducir un selector de roles ni una sesión ficticia para justificar acceso.

## Rutas y comportamiento

| Ruta | Contrato |
| --- | --- |
| `/electivos` | Electivos agrupados por las cinco áreas iniciales; cada área permanece visible aunque esté vacía. |
| `/electivos?area=numerico` | Filtra por ID de área; admite búsqueda `q` por nombre/código. Un área desconocida o parámetros inválidos/repetidos muestran un error, no crean categorías. |
| `/gestion/asignaturas` | Consultar, buscar, crear, editar, reclasificar, archivar y reabrir ramos solo en memoria. Aviso de demo pública sin login y de pérdida al recargar. |
| `/favoritos` | Añadir/quitar materiales aprobados de una selección DEMO local; no es guardado en una cuenta ni exige una autenticación inexistente. |
| `/semestres/[semestre]` | Ramos regulares activos del semestre curricular; se admiten enteros canónicos del 1 al 12, incluidos estados vacíos para nuevas asignaturas locales. |
| `/ramos/[slug]` | Listados, Apuntes y Certámenes siempre disponibles, incluso sin documentos. Mantiene filtros académicos y enlaces estables. |
| `/aportar` | Selector de ramos activos del catálogo compartido, incluidos electivos; continúa sin enviar archivos ni crear ofertas/materiales. |
| `/materiales/[id]` | Material aprobado, clasificación actual del ramo, lector y descarga existentes; favoritos DEMO sobre el mismo ID de material. |

Áreas ilustrativas iniciales: `numerico` (Numérico), `discreta` (Discreta), `optimizacion` (Optimización), `estadistica` (Estadística) y `otro` (Otro). No son la oferta oficial. Se mantienen los seis ramos regulares y todos los IDs/slugs, ofertas, documentos y variantes previos; los nuevos electivos de ejemplo no agregan materiales ni ofertas artificiales.

### Memoria compartida, no persistencia

- El provider de catálogo se monta en el layout raíz con una semilla pública. Cada árbol/pestaña tiene su instancia de repositorio; no existe singleton mutable de servidor.
- Catálogo y favoritos DEMO se mantienen durante navegación cliente mediante `Next Link` y `Next Form`. Un envío/navegación que recargue el documento no tiene esa garantía.
- Recargar, cerrar la pestaña o abrir otra carga el estado inicial; no se propagan cambios a otras pestañas, usuarios ni servidor. No se usa `localStorage`/`sessionStorage`, cookies ni disco para catálogo o favoritos. La preferencia de tema conserva su política independiente anterior.
- Renombrar, cambiar semestre, pasar de regular a electivo o mover de área conserva ID y slug. Las relaciones `Course → CourseOffering → Material` y los IDs de favoritos no se reconstruyen.
- Archivar retira el ramo de listados/selectores activos; permite consultarlo y reabrirlo en gestión. **No elimina ni despublica sus materiales aprobados**, no cambia sus periodos ni revoca archivos públicos. La retirada de un material requerirá una política propia futura.

### URLs locales y limitación HTTP explícita

Los ramos creados en memoria usan UUID mediante `crypto.randomUUID()` y slug estable `local-${id}`. Los slugs existentes no cambian ni se regeneran al editar.

El servidor no conoce las creaciones del navegador. Para `/ramos/local-…` acepta únicamente el patrón `^local-[a-zA-Z0-9-]+$` y entrega un shell que resuelve el ramo contra el provider. **Un slug local inexistente también puede responder HTTP 200**: el cliente muestra que no existe en esta demo, sin inventar una ficha. Tras recargar, el ramo creado desaparece aunque su URL siga abriendo ese shell. Los slugs desconocidos normales, fuera del patrón reservado, conservan 404 HTTP reales. Esta excepción no aplica a archivos/materiales ni constituye una autorización.

En el backend futuro el servidor resolverá identidad/slug contra datos persistidos y devolverá 404 real si no existe; los enlaces de ramos ya creados deberán conservarse mediante una migración/estrategia explícita, no regenerando slugs desde el nombre.

## Dominio y validación

`src/domain/catalog.ts` discrimina:

- Regular: `kind: 'regular'`, `curricularSemester` entero 1–12 y `electiveAreaId: null`.
- Electivo: `kind: 'elective'`, `curricularSemester: null` y un `electiveAreaId` existente.
- Comunes: ID, slug, código opcional, nombre, plan, descripción opcional y `status: 'active' | 'archived'`.

El semestre de malla es independiente de `CourseOffering.academicYear/academicTerm`; los materiales pertenecen a una oferta, nunca al momento de subida. Continúan permitidas varias versiones/secciones/profesores del mismo certamen y periodo, con IDs diferentes.

`CourseInput` contiene únicamente nombre, código, tipo, semestre curricular, área y descripción. No acepta identidad, slug, estado, plan, usuario ni rol como autoridad. `validateCourseInput` valida tipos en runtime, discriminante, área existente, semestre entero y longitudes: nombre 2–160, código hasta 40, descripción hasta 2000 caracteres. Normaliza texto, transforma vacío opcional a `null` y descarta los campos de la variante inactiva.

Política actual de duplicados: el repositorio DEMO opera sobre un único catálogo/plan ilustrativo; bloquea código no vacío repetido y nombre exactamente normalizado repetido, incluidos archivados. El nombre se compara sin acentos, diferencias de caja ni puntuación, con separadores normalizados; el código se normaliza a mayúsculas y blancos. Editar excluye solo el ID del propio ramo. Coincidencias aproximadas son avisos explícitos en `duplicates`, no fusiones ni bloqueos silenciosos. `CourseValidationError` conserva errores por campo y coincidencias.

Para múltiples planes, la decisión recomendada es unicidad por `curriculum_id`, no global. El adaptador de servidor deberá resolver el plan autorizado y aplicar ese alcance tanto a las consultas de duplicados como a sus restricciones; no aceptar un plan arbitrario del cliente. Esta evolución está pendiente, no implementada en el repositorio DEMO.

`materialCategories`/`categoryLabels` definen las tres categorías compartidas. Son pestañas/vistas del catálogo, no filas que haya que crear por asignatura: crear un ramo vacío no crea materiales, ofertas ni registros de categoría por ramo.

## Frontera pública y acceso a datos

- `PublicCatalogMaterial` solo admite `status: 'approved'` y prohíbe los campos privados `originalFilename` y `submittedAt`; `PublicCatalog` es la semilla serializable del provider. No basta con hacer opcionales esos campos en `Material`.
- `toPublicCatalog` (`src/lib/catalog/public-catalog.ts`) es una proyección pura con **allowlist explícita** de campos: excluye pendientes/rechazados y metadatos privados; conserva solo ofertas referenciadas por materiales aprobados. Conserva ramos/áreas aunque no tengan materiales para permitir navegar estados vacíos.
- `src/lib/catalog/data.ts` es `server-only`: obtiene fixtures iniciales de solo lectura y expone `getPublicDemoCatalog()` mediante esa proyección. El layout serializa únicamente esa semilla; ni el provider ni sus imports cliente deben importar los fixtures privados. No se envía primero el catálogo privado para filtrarlo después en el navegador.
- Las consultas de materiales continúan pasando por aprobación y relaciones válidas; las facetas, contadores, favoritos y acceso por ID no deben revelar filas privadas. La ruta de bytes conserva su comprobación independiente en servidor.
- `createDemoCourseRepository` es síncrono, inmutable por snapshots y solo en memoria. No modifica fixtures, ofertas ni materiales; nunca elimina ramos. Su `getCatalog()` es interno, no un endpoint público ni una barrera de permisos.

### Puertos preparados para servicios futuros

En `src/domain/course-management.ts` los contratos **asíncronos**, sin backend implementado, son:

- `CourseCatalogReader`: listar y resolver ramos por ID/slug.
- `CourseAdministrationService`: crear, editar, archivar/reabrir.
- `CourseCreationRequestService`: enviar sugerencia y consultar solicitudes propias.
- `CourseCreationRequestReviewService`: listar pendientes y aprobar/rechazar con notas y propuesta corregida opcional.

El provider ofrece mutaciones asíncronas aunque hoy envuelva un repositorio síncrono; la UI utiliza `await`, estados de operación y manejo de errores. Un futuro gateway cliente llamará handlers de servidor que implementen esos puertos; se sustituye la fuente del provider sin reconstruir formularios ni permitir acceso SQL desde la UI. No importar Supabase ni claves privilegiadas en el cliente. Los contratos no conceden permiso para conectar servicios durante este hito.

`CourseCreationRequest` contiene `requestedBy`, estado, propuesta normalizada, `submittedAt`, `reviewedBy`, `reviewedAt`, `resultingCourseId` y notas. `CourseRequestReviewEvent` registra solicitud, actor, decisión, notas y fecha. Son contratos de trazabilidad, no una cola en funcionamiento: no hay adaptador DEMO de envío/revisión ni actores ficticios. La identidad de solicitante/revisor y todas las fechas/estados serán impuestos por servidor.

## Base de datos recomendada — diseño, NO migración ejecutada

Detalle y consultas en [MODELO_DOMINIO.md](MODELO_DOMINIO.md). Requisitos antes de conectar servicios:

1. UUID como PK de ramo y slug único, estable e inmutable; código nullable, nombre/clave normalizada, plan, descripción, tipo, estado y clasificación con restricciones de variante. Área referenciada por FK; cinco áreas iniciales como seed independiente, no ramas de UI ni una lista fija de asignaturas. Los ramos se consultarán dinámicamente desde DB.
2. No borrar en cascada: archivado lógico; ofertas con FK al ramo `ON DELETE RESTRICT`, materiales con FK a oferta también restrictiva. Conservar documentos, enlaces y favoritos al reclasificar.
3. Índices únicos por plan/nombre normalizado y por plan/código normalizado **solo cuando el código no es NULL**; no excluir archivados de esos índices. Revalidación transaccional de duplicados y traducción de conflictos a errores de campo.
4. Control futuro de versiones para edición concurrente; rechazar cambios basados en versiones obsoletas en lugar de sobrescribir silenciosamente. La demo por pestaña no ofrece control de concurrencia multiusuario.
5. Autenticación con cualquier correo verificado, autorización de administración/revisión en handlers y RLS, nunca roles del cliente. Lectura pública de metadatos aprobados; pendientes/rechazados y sus archivos privados, con Storage privado y acceso autorizado.
6. Solicitudes permitidas a usuarios registrados/verificados: servidor impone autor y `pending`; lectura restringida a solicitante/revisores. Aprobar bloquea/revalida la solicitud y crea ramo, transición y evento en **una transacción**; rechazar registra transición/evento sin crear ramo. Una solicitud no se puede resolver dos veces. No aceptar `requestedBy`, `reviewedBy`, fechas, estado o rol como entrada autorizadora.

## Prueba manual prevista

1. Abrir `/electivos`; recorrer las cinco áreas, buscar sin acentos y probar un área vacía y otra inválida.
2. En `/gestion/asignaturas`, crear un regular sin código y un electivo por área; abrir sus fichas mediante navegación cliente. Ambas muestran tres categorías vacías sin inventar archivos.
3. Probar semestre 0/13/fraccionario, área ausente, longitudes y código/nombre duplicados. Comprobar avisos aproximados y errores por campo sin perder datos.
4. Reclasificar Cálculo I de regular a electivo, cambiar área y nombre: mismo ID/slug y documentos. Su `Certamen 2 - 2024-2` conserva periodo y versiones. Volver a regular con semestre 1.
5. Verificar cambios en inicio, semestres, electivos, breadcrumbs, ficha de material y selector de aporte sin recargar. El aporte sigue sin enviar ni publicar.
6. Añadir/quitar favoritos DEMO desde materiales y consultar `/favoritos`; conservarlos por ID tras renombrar/reclasificar/archivar el ramo. Ningún material pendiente/rechazado puede guardarse ni aparecer.
7. Archivar y reabrir un ramo con documentos: desaparece de selectores activos, no se elimina ni se despublica el material aprobado. Confirmación de archivo accesible y cancelable.
8. Recargar y abrir otra pestaña: ni modificaciones ni favoritos se comparten/persisten. Probar URL local inexistente (shell HTTP 200 y mensaje cliente) frente a slug normal desconocido (404 HTTP real).
9. Revisar HTML/RSC y chunks cliente: sin fixtures privados ni sus marcadores/campos. Materiales privados/desconocidos y sus rutas de archivo mantienen 404.
10. Repetir a 375, 768, 1280 y 1440 px, claro/oscuro, teclado, foco, estados vacíos, texto largo y sin JavaScript. Las mutaciones locales no deben producir envíos nativos ni mensajes de éxito real.

## Verificaciones — resultados pendientes de completar

Esta sección no acredita ejecuciones ni sustituye evidencia. El coordinador completará resultados, restricciones y capturas de la integración final.

```bash
node --test tests/course-management.test.mjs
pnpm lint
pnpm test
pnpm build
git diff --check
```

Con el servidor autorizado iniciado en la URL correspondiente:

```bash
WIKI_TEST_BASE_URL=http://localhost:3000 pnpm test
WIKI_TEST_BASE_URL=http://localhost:3000 node tests/browser-catalog.mjs
WIKI_TEST_BASE_URL=http://localhost:3000 node tests/browser-materials.mjs
WIKI_TEST_BASE_URL=http://localhost:3000 node tests/browser-contributions.mjs
```

Pendientes: resultados de lint/build/pruebas; HTTP de rutas nuevas, privacidad y regresiones; prueba interactiva de gestión y favoritos; matriz responsive/teclado/tema; evidencia visual; limitaciones del entorno y riesgos abiertos. Los runners previos no acreditan por sí solos cobertura de los flujos nuevos. No afirmar cierre de Hito 1.4.1 hasta registrar las verificaciones efectivamente realizadas. Cambios sin commit/push; Hito 1.5 y servicios reales siguen no autorizados.
