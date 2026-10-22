# Modelo de dominio propuesto (Hito 1: diseño, no migración SQL)

> Las secciones 1.4.1 conservan decisiones históricas. Hito 1.5 autoriza moderación/reportes DEMO y favoritos persistidos localmente; su ampliación al final y `HITO_1_5.md` prevalecen sobre las antiguas notas de no autorización. No hay backend conectado.

## Entidades
- `curricula`: versiones de malla, como identificador de plan y año de vigencia (futuro, recomendable prever).
- `courses`: id, code, name, slug, kind(regular/elective), curricular_semester NULLABLE, elective_area_id NULLABLE, curriculum_id, description NULLABLE, status(active/archived). Restricciones y evolución multi-plan al final; una tabla puente será necesaria si el mismo ramo pertenece a varios planes.
- `elective_areas`: id estable y nombre; cinco áreas ilustrativas iniciales, desacopladas de los ramos.
- `course_offerings`: id, course_id, academic_year, academic_term; UNIQUE(course_id, academic_year, academic_term). Edición del ramo en el periodo efectivamente dictado.
- `materials`: id, offering_id, category enum(listado,apunte,certamen), document_number NULLABLE, title NULLABLE, original_filename, normalized_display_name, optional_section, optional_instructor, mime_verified, bytes, storage_object_key, status(pending/approved/rejected), uploaded_by, submitted_at, reviewed_at, reviewed_by, rejection_reason.
- `profiles`: id ligado a auth.users, display_name, role(student/moderator/admin). Autorización servidor/RLS.
- `favorites`: user_id y destino exclusivo course_id/material_id; unicidad por usuario/destino, FK y RLS propias (detalle Hito 1.5 al final).
- `reports`: id, material_id, reporter_id, reason, status, created_at, handled_by.
- `moderation_events`: id, material_id, actor_id, action, notes, happened_at.
- `course_creation_requests` y `course_request_review_events`: sugerencias de ramos y decisiones auditables futuras; no hay cola real en Hito 1.4.1.

## Ejemplo crucial
`courses.name = Cálculo I`; `courses.curricular_semester = 1`.
Una fila en `course_offerings` referencia Cálculo I y declara `academic_year = 2024`, `academic_term = 2`.
`materials.category = certamen`, `document_number = 2` y `offering_id` apunta a esa fila.
Nombre visible: `Certamen 2 - 2024-2`. No mover Cálculo I al semestre 2 de malla.

## Reglas de nomenclatura
- Categoría `certamen`: "Certamen N - AAAA-S".
- Categoría `listado`: "Listado N - AAAA-S".
- Categoría `apunte`: "Apuntes - AAAA-S" o "Apuntes [N] - AAAA-S" si corresponde; título descriptivo secundario opcional.
- Identidad del registro por UUID, no por el título. Múltiples secciones/profesores pueden compartir mismo tipo y periodo.
- El año académico y el semestre se eligen en formulario; validar ambos.

## Búsquedas y filtros
Filtro de semestre curricular opera sobre `courses`; filtro `academic_term` sobre `course_offerings`.
Filtros por año, término, categoría y número se pueden combinar; búsqueda textual por ramo y título.

## Aislamiento y permiso futuro
- `pending`/`rejected`: privados para aportante (metadatos permitidos) y personal moderador, nunca endpoint público de lectura ni Storage público.
- `approved`: disponible para visitantes, con descargas controladas según política legal/técnica.
- No confiar en roles guardados en la app cliente, aplicar RLS y autorización en handlers del servidor.
- Limitar tamaños, validar firmas/formatos, escanear contenido y registrar acciones de moderación.

## Proyección local del Hito 1.2
- `src/domain/catalog.ts` representa `Course → CourseOffering → Material`; no es una migración ni un esquema conectado.
- Código de ramo opcional (`string | null`); sección y versión opcionales en materiales, conservadas como información secundaria pública.
- Los IDs de fixtures son cadenas estables identificadas como demo. No existe restricción de unicidad por categoría/número/período: dos versiones conservan IDs distintos.
- `approvedMaterials`, `courseMaterials`, `courseFacets` y `publicMaterialById` comparten el filtrado por aprobación; nunca proyectan nombre original ni fecha de subida.
- Los ramos se exploran independientemente de sus materiales: una categoría o un ramo vacío sigue siendo navegable.

## Archivos locales Hito 1.3
- `PublicMaterialFile` y `MaterialFileSource` (`src/domain/material-file.ts`) desacoplan UI de una fuente local o futuro Storage. No se deduce formato ni nombre público desde `originalFilename`.
- `src/fixtures/material-files.ts` es una allowlist separada; los metadatos aprobados pueden existir sin un archivo. No se agregan enlaces ficticios para completarlos.
- `src/lib/materials/local-source.ts`, solo servidor, consulta `publicMaterialById` antes de manifiesto/disco y comparte resolución entre ficha y lectura/descarga. La fuente limita muestras a 20 MiB y comprueba firmas; no constituye validación de uploads.
- `/materiales/[id]/archivo` sirve bytes y `?descargar=1` utiliza el nombre normalizado con extensión permitida. IDs no aprobados, desconocidos o sin archivo reciben 404 sin detalles internos.
- Solo muestras originales deliberadamente públicas en `public/demo`. Su URL estática es pública: ninguna comprobación de ficha revoca esos assets. Material privado futuro requerirá buckets privados, autorización servidor/RLS, validación y revisión; nunca moverlo a `public/`.

## Preparación de aportes Hito 1.4
- `src/domain/contribution.ts` define borrador, metadatos válidos y errores por campo sin depender de React. El ramo referencia un ID existente; año/término son de la edición académica, independientes de la malla.
- Número obligatorio en listados/certámenes y opcional en apuntes. Sección, profesor y versión opcionales; sin restricción de unicidad por tipo/número/período.
- `contributionDisplayName` comparte `materialDisplayName`; este recibe solo los campos necesarios, sin crear registros ni IDs ficticios. El formato permitido aporta la extensión canónica.
- Política local de selección única hasta 25 MiB, configurable. MIME/extensión y firmas mínimas orientan UX; no son validación de servidor.
- `ContributionService.submit(ContributionSubmission)` y `ContributionReceipt` son contratos futuros sin adaptador ni llamadas. La identidad y el estado `pending` deberán establecerse y autorizarse en servidor, con email verificado, RLS y Storage privado.
- El formulario mantiene únicamente memoria temporal, no crea `CourseOffering`/`Material`, no cambia fixtures ni publica/encola aportes. Consentimiento obligatorio; nada se envía en esta demostración. Requisitos y pruebas: `docs/HITO_1_4.md`.

## Ampliación local Hito 1.4.1

### Identidad, clasificación y archivo

`Course` es una unión discriminada en `src/domain/catalog.ts`:

| Tipo | Semestre curricular | Área |
| --- | --- | --- |
| `regular` | Entero 1–12 | `null` |
| `elective` | `null` | ID de `ElectiveArea` existente |

Nombre, código opcional, plan, descripción opcional, ID, slug y `status: active/archived` son comunes. `initialElectiveAreas` en `src/domain/course-management.ts` contiene `numerico`, `discreta`, `optimizacion`, `estadistica`, `otro` (Numérico, Discreta, Optimización, Estadística, Otro); son semillas ilustrativas, no la malla ni la oferta oficial.

Los nuevos ramos DEMO usan UUID y slug `local-${id}`; los IDs/slugs de fixtures anteriores permanecen intactos. Editar nombre, semestre, tipo o área no cambia identidad, slug, ofertas, documentos ni favoritos. El repositorio no elimina: archivar/reabrir solo cambia estado, retira/restaura selectores activos y **no despublica materiales aprobados**. No se interpreta `archived` como una autorización de borrado ni como estado de moderación del documento.

`materialCategories` y `categoryLabels` son el diccionario compartido de Listados, Apuntes y Certámenes. Cada ramo presenta sus tres vistas aunque estén vacías: no requiere filas nuevas de categoría por ramo, materiales ficticios ni ofertas sin motivo. Un futuro lookup global de tipos puede reemplazar/extender el enum; no duplicar las categorías por asignatura.

### Proyección pública y estado DEMO

- `PublicCatalogMaterial` restringe el estado a `approved` y prohíbe `originalFilename`/`submittedAt`. `PublicCatalog` usa ese tipo estricto, distinto del catálogo interno de fixtures; la opcionalidad de los campos privados en `Material` no autoriza enviarlos.
- `toPublicCatalog` es una función pura de `src/lib/catalog/public-catalog.ts`: allowlist explícita de metadatos aprobados y solo ofertas referenciadas por esos materiales. Conserva ramos/áreas vacíos para navegación. Consultas posteriores descartan relaciones inválidas y mantienen el filtro de aprobación.
- El layout raíz recibe la semilla desde `getPublicDemoCatalog()` en `data.ts` (`server-only`), no serializa los fixtures privados. No filtrar pendientes por primera vez después de enviarlos al cliente. Probar ausencia de filas/marcadores y claves privadas en HTML, RSC y chunks cliente, además del acceso por ID/archivo.
- `createDemoCourseRepository(initial, generateId?)` es un adaptador síncrono de snapshots inmutables; `getCatalog` es interno, no un endpoint público. Provider por árbol/pestaña, sin singleton mutable en servidor, DB ni almacenamiento web. Las mutaciones expuestas por el provider son asíncronas y la UI las espera con `await`.
- Navegación cliente `Next Link`/`Next Form` conserva catálogo y favoritos DEMO; recargar/cerrar u otra pestaña no. Favoritos referencia IDs de materiales aprobados, no copias de sus nombres/clasificación; no representa una cuenta autenticada.
- El prefijo de ruta `local-` permite un shell SSR para ramos creados solo en navegador. Un local inexistente puede responder HTTP 200 y mostrar ausencia en cliente; los slugs normales desconocidos siguen dando 404 HTTP real. El backend futuro deberá resolver persistencia/404 en servidor y preservar los enlaces existentes, no mantener esta excepción como autorización.

### Entradas, duplicados y puertos

`CourseInput` solo aporta nombre, código, tipo, semestre curricular, área y descripción. Validación runtime de discriminante, tipos, área existente y semestre entero; nombre 2–160, código hasta 40 y descripción hasta 2000 caracteres. Texto opcional vacío se convierte a `null`; se descartan campos de la variante inactiva. ID/slug/plan/estado/autor/rol no son campos autorizadores del formulario.

Decisión de duplicados: nombre exactamente normalizado (sin acentos, caja ni puntuación y con separadores normalizados) y código no vacío normalizado a mayúsculas/blancos bloquean creación/edición; archivados conservan la reserva. Excluir solo el ID editado. Coincidencias aproximadas son avisos explícitos en `duplicates`; no se fusionan ni se bloquean como si fueran identidades. `CourseValidationError` entrega errores por campo y coincidencias.

La demo compara el catálogo completo porque contiene un único plan ilustrativo. **Para DB multi-plan la unicidad recomendada es por `curriculum_id`**: servicio y restricciones deben usar el mismo alcance y algoritmo normalizador. No afirmar que el repositorio DEMO ya distingue planes. Si se introduce una tabla puente de planes, revisar el alcance de identidad/ubicación y migrarlo explícitamente, preservando IDs y relaciones.

Puertos asíncronos sin implementación de backend:

- `CourseCatalogReader`: `listCourses`, `getCourse`, `getCourseBySlug`.
- `CourseAdministrationService`: lectura y `createCourse`, `updateCourse`, `setCourseArchived`.
- `CourseCreationRequestService`: `submit` y `listOwnRequests`.
- `CourseCreationRequestReviewService`: `listPendingRequests` y `review` (aprobar/rechazar, notas y propuesta corregida opcional).

El gateway cliente futuro llamará handlers/servicios en servidor y reemplazará el repositorio del provider. Formularios conservan `await`, estados ocupados y manejo de errores; no deben importar Supabase, SQL ni claves privilegiadas. La identidad/rol los resolverá el servidor en cada operación. La ruta actual de gestión es pública, sin permisos efectivos; estos contratos no son autenticación ni autorización.

## PostgreSQL recomendado — antes del hito backend, NO ejecutar aquí

No hay migración aplicada ni conexión Supabase en Hito 1.4.1. Las siguientes restricciones, índices y consultas son propuestas para una migración futura autorizada, con revisión de datos existentes y pruebas de preservación. Los IDs de fixtures son ejemplos; no reescribir IDs de producción ni regenerar slugs para adaptarlos al formato DEMO.

### Restricciones e integridad

- `courses.id UUID PRIMARY KEY`; `curriculum_id` obligatorio con FK; `slug NOT NULL UNIQUE` e inmutable mediante validación de servidor y protección DB (p. ej. trigger que rechace cambios). El slug se fija al crear, no se deriva de cada renombrado.
- `kind NOT NULL` restringido a `regular/elective`; `status NOT NULL` restringido a `active/archived`, con valor inicial `active`; nombre y clave normalizada no vacíos. Código vacío se guarda como NULL, no como cadena vacía.
- `elective_areas` como lookup de IDs estables con los cinco seeds iniciales. `courses.elective_area_id` FK `ON DELETE RESTRICT`; no permitir áreas inexistentes. Ramos y áreas se consultan desde DB, no desde una lista de asignaturas incrustada en UI.
- La restricción de variante debe comprobar explícitamente los NULL para evitar el paso de un `CHECK` por resultado desconocido:

```sql
-- Fragmento de diseño, no una migración ejecutable del proyecto.
CHECK (
  (kind = 'regular'
   AND curricular_semester IS NOT NULL
   AND curricular_semester BETWEEN 1 AND 12
   AND elective_area_id IS NULL)
  OR
  (kind = 'elective'
   AND curricular_semester IS NULL
   AND elective_area_id IS NOT NULL)
)
```

- `course_offerings.course_id` FK a `courses(id) ON DELETE RESTRICT`; `materials.offering_id` FK a ofertas también restrictiva. Conservar `UNIQUE(course_id, academic_year, academic_term)`, año válido y término 1/2. No agregar relación entre esos campos y `curricular_semester`.
- No ofrecer borrado físico de ramos ni cascadas que eliminen ofertas/materiales/favoritos por archivo o reclasificación. Eliminar contenido requiere un flujo futuro separado, autorizado y con política de retención. Favoritos conserva la referencia estable a material.
- No crear `UNIQUE(offering_id, category, document_number)`: impediría versiones válidas por sección/profesor. PK independiente por material, categoría conocida y número válido/nullable según tipo.

### Duplicados y concurrencia

Persistir claves canónicas `name_key` y `code_key`, calculadas/revalidadas por servidor con un algoritmo compartido y versionado; no confiar en las claves enviadas por cliente ni inventar una columna generada basada en funciones SQL no inmutables. Cambiar normalización exige analizar colisiones antes de migrar.

```sql
-- Índices propuestos sobre las claves canónicas, NO ejecutar en Hito 1.
CREATE UNIQUE INDEX courses_plan_name_key_uq
  ON courses (curriculum_id, name_key);
CREATE UNIQUE INDEX courses_plan_code_key_uq
  ON courses (curriculum_id, code_key)
  WHERE code_key IS NOT NULL;
```

No añadir `WHERE status = 'active'`: archivados siguen reservando código/nombre. Varios códigos NULL son válidos. Validación previa aporta UX, pero no evita carreras: crear/editar se hace en transacción y la restricción única resuelve inserciones concurrentes; convertir el conflicto en error de campo sin filtrar información de otro plan no autorizado. Avisos aproximados no son restricciones únicas.

Agregar una versión/revisión de fila futura: actualización condicional por ID y versión esperada, incremento atómico y conflicto recuperable (p. ej. HTTP 409) si la versión está obsoleta. Revisar versión y duplicados dentro de la operación, no sobrescribir silenciosamente una edición de otro usuario. La demo por pestaña no implementa concurrencia multiusuario.

### Consultas orientativas con parámetros enlazados

```sql
-- Electivos activos: área opcional; el catálogo de áreas se consulta aparte
-- para poder mostrar grupos vacíos. No requiere materiales asociados.
SELECT c.id, c.slug, c.code, c.name, c.description, c.elective_area_id
FROM courses c
WHERE c.curriculum_id = :authorized_plan
  AND c.kind = 'elective' AND c.status = 'active'
  AND (:area_id IS NULL OR c.elective_area_id = :area_id)
ORDER BY c.name, c.id;

-- Regular por ubicación de malla: no filtra el término de la oferta.
SELECT c.id, c.slug, c.code, c.name, c.curricular_semester
FROM courses c
WHERE c.curriculum_id = :authorized_plan
  AND c.kind = 'regular' AND c.status = 'active'
  AND c.curricular_semester = :curricular_semester
ORDER BY c.name, c.id;

-- Solo campos públicos; archivar un ramo no retira un material aprobado.
SELECT m.id, m.category, m.document_number, m.title,
       o.academic_year, o.academic_term, c.id AS course_id, c.slug
FROM materials m
JOIN course_offerings o ON o.id = m.offering_id
JOIN courses c ON c.id = o.course_id
WHERE m.status = 'approved' AND c.id = :course_id
  AND (:academic_year IS NULL OR o.academic_year = :academic_year)
  AND (:academic_term IS NULL OR o.academic_term = :academic_term)
ORDER BY o.academic_year DESC, o.academic_term DESC, m.id;
```

Los parámetros se validan y enlazan; nunca concatenar texto del usuario. Las consultas no sustituyen RLS, autorización, paginación ni políticas de descarga. Para las tres pestañas vacías usar el lookup global de categorías y conteos aprobados; no insertar documentos para obtener ceros.

### Solicitudes, identidad y revisión atómica futuras

`CourseCreationRequest` prevé ID, `requestedBy`, propuesta normalizada, `status`, `submittedAt`, `reviewedBy`, `reviewedAt`, `resultingCourseId` y `reviewNotes`. `CourseRequestReviewEvent` prevé ID, `requestId`, `actorId`, decisión `approved/rejected`, notas y `happenedAt`. Persistir FK de actores a perfiles y de resultado al ramo; historial append-only para trazabilidad.

1. Solo usuario registrado con correo verificado solicita. Handler impone `requestedBy` desde sesión, fecha y `pending`; no acepta autor, estado, revisor ni rol como entrada autorizadora. RLS limita lectura al solicitante y revisores autorizados. No mezclar solicitudes pendientes con el catálogo público.
2. Administración de catálogo y revisión requieren rol comprobado en servidor y RLS; un usuario verificado no obtiene por ello permiso de crear ramos públicos directamente. La UI DEMO abierta no define la política real.
3. `review` bloquea o compara versión/estado `pending`, revalida propuesta/plan/duplicados y autorización. Aprobar crea el ramo y actualiza solicitud/revisor/fecha/resultado junto al evento en **una transacción**. Rechazar actualiza revisión y evento sin crear ramo. Si alguna parte falla, rollback completo; impedir doble resolución/reintentos duplicados.
4. Reglas de consistencia: pendiente sin revisor/fecha/resultado; aprobada con revisor, fecha y ramo resultante; rechazada con revisor/fecha y sin ramo resultante. Actor y fechas del evento los impone el servidor. No borrar eventos para ocultar decisiones.
5. Antes de backend: autenticar cualquier correo verificado; validar entradas en servidor y limitar abuso; RLS en ramos/mutaciones, solicitudes/eventos y favoritos propios. Lectura de materiales exclusivamente aprobados para visitantes; originales pendientes/rechazados en Storage privado, acceso autorizado y URLs firmadas solo tras verificar permisos. Nunca service-role key en cliente.

No había adaptador de envío/revisión en Hito 1.4.1 ni solicitudes/actores simulados. Favoritos DEMO no son filas reales de `favorites`. Especificación histórica de integración y límite HTTP de rutas locales: [HITO_1_4_1.md](HITO_1_4_1.md).

## Ampliación Hito 1.5 — demo, no backend

Moderación tiene un estado separado del catálogo público y semillas sintéticas explícitas. Las decisiones pasan por dominio/servicio, no por setters de estado desde los componentes. Solo se resuelve desde `pending` hacia `approved` o `rejected`; el rechazo requiere explicación. Los eventos conservan recurso/tipo, estado anterior/nuevo, motivo, fecha y actor nullable; `null` significa ausencia de autenticación, no moderador autorizado. Corregir metadatos reutiliza las validaciones académicas, sin deducir periodo desde nombre original o fecha.

En esta demo, aprobar un aporte **no** lo incorpora a `PublicCatalog` ni habilita archivo/ficha; aprobar una solicitud **no** crea un ramo. Una muestra usada para previsualizar es una muestra original ya pública, no bytes de un aporte pendiente. Los reportes referencian solo materiales aprobados; su resolución registra explicación/historial sin retirar ni modificar el documento. Recargar restablece decisiones, solicitudes y reportes.

Favoritos utiliza `FavoriteReference { kind: 'course' | 'material', id }` y un puerto asíncrono `FavoritesService.list/setSaved`, sin recibir `userId`. El adaptador local es independiente de React, lee un esquema versionado y guarda solo referencias. Deduplica por tipo/ID, descarta desconocidos/no aprobados y no transforma referencias en autorización. Archivar/reclasificar un ramo no cambia su ID; sus favoritos continúan resolviéndose. Una referencia a un ramo local desaparecido al recargar se descarta con aviso. Fallos de acceso/lectura/escritura no impiden usar la selección en memoria. No hay sincronización en vivo entre pestañas ni entre dispositivos.

### Requisitos para Supabase en un hito posterior autorizado

- **Auth:** aceptar cualquier correo verificado; handlers obtienen la sesión verificada. Aportante/reportante/moderador/fechas/estado inicial se imponen en servidor. No leer roles desde localStorage, formulario, contexto React o metadata editable por usuario como autorización.
- **PostgreSQL:** eventos append-only para materiales, solicitudes y reportes. Una revisión bloquea/compara estado y versión esperada, valida entradas y decide estado/evento en una transacción; rechazar segunda revisión con conflicto recuperable. IDs de operación/idempotencia evitan duplicación por reintentos. El servidor fija actor y reloj. Conservar correcciones académicas con antes/después auditables. La demo no ofrece concurrencia multiusuario.
- **Solicitudes:** validación y duplicados por plan autorizado, incluyendo archivados. La futura publicación explícita del ramo requerirá transacción de creación, resultado y evento; no extrapolar que aprobar localmente ya crea catálogo. Registrar decisiones sobre coincidencias aproximadas, no fusionar silenciosamente.
- **RLS:** lectura anónima exclusivamente de metadatos aprobados mediante allowlist pública. `pending/rejected` visibles solo según política del propietario/revisor; no consultas públicas por ID, facetas, búsquedas o conteos. Tablas de reportes/solicitudes/eventos restringidas al propietario y/o rol revisor comprobado; no exponer información personal del reportante. Mutaciones administrativas solo a personal autorizado. Probar políticas con visitante, usuario verificado, propietario y revisor, incluyendo IDs conocidos.
- **Favoritos:** `user_id` FK a usuario y exactamente uno de `course_id`/`material_id` mediante CHECK, ambas FK restrictivas; índices únicos parciales `(user_id,course_id)` y `(user_id,material_id)`. RLS propia para SELECT/INSERT/DELETE con `auth.uid() = user_id`; insertar favorito de material requiere aprobación y relación pública válida. La consulta JOIN vuelve a verificar visibilidad si el material fue retirado. No aceptar autor arbitrario ni tratar el favorito como permiso de descarga. Migrar locales solo con consentimiento y revalidación, no sincronizarlos automáticamente hacia cuentas.
- **Storage privado:** nunca subir pendientes/rechazados a `public/` ni buckets públicos. Verificar sesión/rol/propiedad/estado antes de acceso o URL firmada de vida corta. Validar tamaño, firma/formato/contenido y autorización legal en servidor; MIME/extensión no bastan. La transición a aprobado no debe generar una URL pública accidental; políticas deben permitir revocación futura. No exponer claves service-role ni rutas internas al cliente.
- **Reportes y abuso:** validar motivo/descripción y material público en servidor, límites de frecuencia/tamaño y política de retención. Resolución y eventual retiro de material son operaciones distintas, explícitas, autorizadas y auditadas; requieren confirmación, no efectos laterales desde un reporte local.

Estos son requisitos/documentación de integración, **no migraciones aplicadas, conexión Supabase ni garantías de protección de la demo pública**.
