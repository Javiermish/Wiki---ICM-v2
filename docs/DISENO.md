# Wiki ICM — Dirección visual y arquitectura de interfaz

> **Ampliación Hito 2.1:** formularios de registro/login/recuperación/restablecimiento, cuenta y usuarios usan el sistema existente. Cabecera distingue visitante, estudiante, moderador y admin a partir de sesión verificada en servidor. `/moderacion` deja de ser pública, sin convertir su workspace DEMO en moderación real. Favoritos permanecen locales. Las descripciones Hito 1 siguientes son históricas donde contradigan esta ampliación. Ver [HITO_2_1.md](HITO_2_1.md).

## Personalidad
Plataforma académica y comunitaria; orden editorial de biblioteca digital, no dashboard administrativo.
Tonos: verde bosque #174B38, verde medio #348568, marfil #F5F5EE y texto #182521. Crear tokens light/dark; revisar contraste WCAG AA.

## Tipografía y sistema
Tipografía sans legible para UI; titulares claros y jerarquía 32-48/24/18/14 px dependiendo del dispositivo. Escala de espaciado 4,8,12,16,24,32,48. Radios 10-16 px, bordes tenues, tarjetas minimalistas.

## Pantallas Hito 1
1. `/`: hero con buscador, accesos por semestre curricular, últimos aportes aprobados simulados y CTA para aportar.
2. `/semestres/[semestre]`: listado de ramos; campo de búsqueda local.
3. `/ramos/[slug]`: ficha de ramo, tabs `Listados | Apuntes | Certámenes`, filtros Año y Periodo académico, tarjetas con número y fecha.
4. `/materiales/[id]`: en Hito 1.3 autorizado, cabecera, breadcrumbs, lector PDF/imagen real y descarga de archivos originales de demostración; ficha sin archivo muestra disponibilidad explicativa, nunca un visor ficticio.
5. `/aportar`: diseño de formulario con ramo, categoría, número, año, semestre académico, archivos y aviso de moderación.
6. `/moderacion`: demo pública sin protección real; tres colas de aportes, solicitudes y reportes, con filtros, consulta, corrección, confirmaciones e historial. La versión real requerirá autorización servidor.
7. `/favoritos`: selección DEMO de asignaturas y documentos aprobados, agrupados, con persistencia local defensiva desde Hito 1.5; añadir/quitar sin falsa sesión. El guardado en cuenta requerirá login futuro.
8. `/electivos`: exploración por área, búsqueda y estados vacíos; `?area=…` conserva la selección compartible.
9. `/gestion/asignaturas`: gestión pública DEMO de ramos, sin permisos reales ni backend; consulta, creación, edición, reclasificación y archivo reversible.

## Cabecera
Brand/logo, explorar, aportar, favoritos, búsqueda en portada y controles de tema/cuenta. Navegación móvil mediante menú accesible.

## Comportamiento
A cada documento se le muestra nombre normalizado + etiqueta de periodo clara. Tema claro y oscuro; persistencia opcional de preferencia local. Hover nunca es única forma de interacción. No crear botones falsamente activos: demo/placeholder etiquetado.

## Estados de diseño
Carga, sin resultados, ausencia de favoritos, error de documento, pendiente de revisión, rechazo con explicación, envío exitoso, entrada no válida.

## Pruebas visuales
Capturas a 375, 768, 1280 y 1440px; modo claro/oscuro; keyboard tab; foco; contraste; no desbordes; navegación; texto largo y sin resultados.

## Lector Hito 1.3
- Documento protagonista a todo el ancho del `page-container` existente (máximo 1152 px); metadatos debajo, sin sidebar permanente.
- Toolbar compacta con wrapping móvil, controles de al menos 44 px, paginación, zoom, ajuste al ancho, restablecer y pantalla completa. Solo una página PDF montada a la vez.
- Búsqueda de texto real cuando el PDF lo contiene; sin prometer OCR. No invertir colores del documento en tema oscuro.
- Navegación desde tarjeta a ficha con filtros del ramo conservados; breadcrumbs distinguen semestre curricular de período académico.
- Diálogo de reporte etiquetado como demostración, sin envíos ni persistencia reales.

## Aportes Hito 1.4
- `/aportar`: una página guiada, columna legible sin sidebar permanente; cuatro bloques numerados para ramo, metadatos, archivo/lector y revisión/autorización.
- Búsqueda local por nombre/código y radios nativos de ramos existentes. El semestre curricular es información del ramo, nunca un campo editable del período.
- Nombre público derivado de la normalización compartida; la extensión deriva del formato seleccionado. Título, sección, profesor y versión son datos secundarios opcionales.
- Input de archivo y arrastrar/soltar como alternativa. Solo un archivo, hasta 25 MiB. Reemplazar, quitar, abrir/cerrar preview; errores concretos sin perder los otros datos.
- El lector se monta fuera del formulario de metadatos: la búsqueda PDF tiene su propio formulario. Se conserva paginación, zoom, ajuste, pantalla completa y colores originales del documento en ambos temas.
- Resumen de errores enfocable y enlazado, errores por campo asociados, controles de 44 px y declaración de permiso sin marcar inicialmente.
- Acción final explícitamente simulada; nunca mensajes de recepción, publicación ni pendientes reales. El formulario no persiste al recargar.

## Electivos, gestión y favoritos Hito 1.4.1

Descripción histórica: Hito 1.5 sustituye únicamente la política de favoritos en memoria por referencias locales persistidas. Gestión y moderación siguen en memoria; ver [HITO_1_5.md](HITO_1_5.md).

- Mantener la biblioteca como lenguaje principal, no convertir el sitio completo en un dashboard. Electivos distingue cinco áreas ilustrativas (Numérico, Discreta, Optimización, Estadística y Otro) con títulos, contador y vacío útil. Un electivo no se ubica artificialmente en un semestre de malla; su breadcrumb vuelve a `/electivos?area=…`.
- Todas las fichas conservan las tres categorías, incluso con cero documentos; las categorías no se ocultan por ausencia de materiales.
- Gestión muestra aviso persistente de **demo pública sin login**, datos ficticios y cambios que se pierden al recargar. Evitar insignias de administrador autenticado, candados que sugieran protección real o promesas de publicación. Solicitudes para usuarios registrados/revisión humana se explican como futuras, sin falso envío.
- Formulario con nombre, código opcional, tipo, semestre curricular 1–12 solo para regulares, área existente solo para electivos y descripción opcional. ID y ruta son consultables, no editables. Mostrar duplicados exactos como errores y aproximados como avisos con los ramos coincidentes.
- Consultar activos/archivados, confirmar archivo y permitir reabrir. Explicar que conserva enlaces y documentos; archivar un ramo no equivale a retirar un material aprobado. Reclasificación actualiza etiquetas/breadcrumbs sin regenerar URLs ni fechas académicas.
- Mutaciones con `await`, estado ocupado, prevención de doble acción y errores recuperables; no mostrar éxito antes de resolver la operación. Resumen enfocable, errores asociados a controles visibles, foco tras confirmación/cancelación, etiquetas semánticas y objetivos de al menos 44 px. Sin JavaScript no hay mutaciones ni envío nativo de los metadatos.
- Favoritos ofrece añadir/quitar sobre materiales aprobados, estado del control anunciado y lista vacía útil. Rotular siempre DEMO local: no exigir ni simular cuenta, y no confundirlo con favoritos persistentes de producto final.
- El estado compartido se conserva al navegar con `Next Link`/`Next Form`; recargas y otras pestañas no lo conservan. El aviso aplica a gestión y favoritos, no a la preferencia independiente de tema. Las URLs locales `local-…` pueden abrir un shell HTTP 200 sin ramo tras recargar; mostrar una explicación y salida útil, no una ficha inventada ni afirmar que fue un 404 HTTP.
- Validación prevista: 375/768/1280/1440 px, claro/oscuro, teclado, foco, largos sin espacios, vacíos y errores, reclasificación con documentos, favoritos y navegación entre pantallas. Resultados de esta ampliación pendientes en [HITO_1_4_1.md](HITO_1_4_1.md); la especificación no acredita pruebas realizadas.
