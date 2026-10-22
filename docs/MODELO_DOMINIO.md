# Modelo de dominio propuesto (Hito 1: diseño, no migración SQL)

## Entidades
- `curricula`: versiones de malla, como identificador de plan y año de vigencia (futuro, recomendable prever).
- `courses`: id, code, name, slug, curricular_semester, curriculum_id (o tabla puente si un ramo pertenece a varios planes).
- `course_offerings`: id, course_id, academic_year, academic_term; UNIQUE(course_id, academic_year, academic_term). Edición del ramo en el periodo efectivamente dictado.
- `materials`: id, offering_id, category enum(listado,apunte,certamen), document_number NULLABLE, title NULLABLE, original_filename, normalized_display_name, optional_section, optional_instructor, mime_verified, bytes, storage_object_key, status(pending/approved/rejected), uploaded_by, submitted_at, reviewed_at, reviewed_by, rejection_reason.
- `profiles`: id ligado a auth.users, display_name, role(student/moderator/admin). Autorización servidor/RLS.
- `favorites`: user_id, material_id; único por par.
- `reports`: id, material_id, reporter_id, reason, status, created_at, handled_by.
- `moderation_events`: id, material_id, actor_id, action, notes, happened_at.

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
