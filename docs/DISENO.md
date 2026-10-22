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
4. `/materiales/[id]`: cabecera, breadcrumbs, visor PDF/imagen placeholder (no fingir visor real) y botón de descarga demo claramente identificado.
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
