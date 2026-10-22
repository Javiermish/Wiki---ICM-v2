# Wiki ICM — Dirección visual y arquitectura de interfaz

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
6. `/moderacion`: prototipo restringido simulado con cola de revisión; ruta real requerirá autorización servidor.
7. `/favoritos`: lista guardada para cuenta; en Hito 1 simular para demo, dejar claro que el guardado real requiere login.

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
