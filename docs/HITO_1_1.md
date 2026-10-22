# Hito 1.1 — Fundaciones compartidas y portada

> Registro histórico de la entrega 1.1. La navegación de semestres y ramos se
> incorpora en [Hito 1.2](HITO_1_2.md); sus resultados actuales reemplazan las
> restricciones de navegación descritas aquí, sin rediseñar la portada.

## Alcance aprobado

Solo la portada (`/`) y su infraestructura compartida. No incluye páginas de
semestre, ramo, documento, aporte, moderación ni favoritos. No hay autenticación,
Supabase, almacenamiento, archivos ni descargas reales. Hito 1.2 requiere aprobación.

Los datos son ficticios y **no representan la malla oficial de la UdeC**.

## Decisiones visuales

Consulta previa a `ui-designer`: biblioteca editorial, no dashboard. Búsqueda
dominante, grupos de semestres curriculares y fichas bibliográficas. Sin ilustración
emoji, métricas inventadas ni botones de vista previa/descarga inactivos.

- Fondo claro `#F5F5EE`, superficie blanca, texto `#182521`, primario `#174B38`.
- Fondo oscuro `#101C17`, superficie `#17261F`, texto `#F5F5EE`, primario `#76C9A7`.
- Verde medio `#348568` reservado a acentos; blanco sobre este verde no alcanza
  4.5:1 para texto normal. No usarlo para botones con texto blanco.
- Fuente sans del sistema: no requiere solicitudes ni descargas de Google Fonts.
- Márgenes móviles 16 px, ancho máximo 1152 px, una columna móvil y dos desde
  tablet para semestres. Controles de al menos 44 px y foco visible.

La portada no necesita breadcrumbs de inicio redundantes. La búsqueda sí expone
`Inicio > Resultados`, mediante un componente compartido.

## Contrato de catálogo y URL

La relación es `Course → CourseOffering → Material`. El semestre curricular vive
en `Course`; el año y término académicos viven en `CourseOffering`.
Nombre público derivado solo de metadatos explícitos, nunca del nombre original
ni de la fecha de subida. La proyección pública filtra primero `approved`.

La búsqueda se envía con formulario GET y se puede compartir, recargar y recorrer
con atrás/adelante. Next.js usa JavaScript para completar el contenido progresivo
dentro del límite Suspense. Todos los filtros se combinan
con AND. La consulta se compara sin distinguir mayúsculas ni acentos.

| Parámetro | Significado |
| --- | --- |
| `q` | Palabras del ramo, nombre público o descripción del material |
| `curricularSemester` | Semestre curricular del ramo |
| `category` | `listado`, `apunte`, `certamen` |
| `year` | Año académico |
| `term` | Término académico `1` o `2`, no semestre curricular |
| `number` | Número del documento |

Los accesos por semestre conservan los otros criterios. El botón para limpiar
restablece todos. Parámetros inválidos muestran una indicación para corregirlos;
no se reinterpretan como metadatos ni provocan errores del servidor.

## Pruebas manuales

- `/`: aviso de prototipo, portada, semestres de ejemplo, materiales aprobados y
  presentación del proyecto; enlaces de navegación a secciones existentes.
- `/?q=calculo`: encuentra Cálculo I sin escribir el acento.
- `/?q=Certamen+2+-+2024-2`: encuentra el nombre público normalizado.
- `/?q=calculo&curricularSemester=1&category=certamen&year=2024&term=2&number=2`:
  aparece **Certamen 2 - 2024-2**, Cálculo I permanece en semestre curricular 1.
- Cambiar `curricularSemester=2` en esa URL: estado sin resultados.
- `/?q=sin-coincidencias`: vacío útil, con enlace para limpiar.
- `/?term=7`: advertencia de criterio inválido, sin fallo de aplicación.
- Atrás/adelante y recarga conservan consulta y selección de filtros.
- Menú móvil: abrir con Enter, navegar con Tab, cerrar con Escape; foco devuelto
  al disparador. Ningún enlace a otra pantalla del hito siguiente.
- Tema: sin preferencia sigue el sistema; cambiar, recargar y verificar.
  Repetir con almacenamiento bloqueado o valor persistido inválido.
- A 375 y 1280 px, ambos temas: sin scroll horizontal, títulos completos,
  contraste y foco visibles. Repetir a zoom 200 % y con movimiento reducido.

La comprobación visual con navegador y sus limitaciones se informan al entregar;
la inspección de código o una respuesta HTTP no equivalen a una captura visual.

## Validación de esta entrega

- `pnpm lint`: correcto.
- `pnpm build`: correcto; portada con prerenderizado parcial, más 404 e icono.
  Se conservó la configuración de Next.js y se añadió un límite Suspense para
  acceder a `searchParams`, con carga accesible y sin espera artificial.
- `pnpm test`: 27 pruebas correctas; la prueba HTTP queda omitida sin URL base.
- Con `pnpm start --hostname 127.0.0.1 --port 3100`:
  `WIKI_TEST_BASE_URL=http://127.0.0.1:3100 pnpm test`: **40 correctas, 0 fallos,
  0 omitidas**. Incluye búsquedas, filtros, vacíos, errores de parámetros,
  respuestas 404 de pantallas fuera de alcance y disponibilidad de CSS/JS/icono.
- Contraste calculado desde los tokens reales: texto normal >= 4.5:1 y bordes de
  campos/foco >= 3:1 en los pares comprobados de ambos temas. No es una auditoría
  completa de la composición renderizada.
- Tema probado con APIs simuladas: preferencia válida/inválida, sistema,
  almacenamiento bloqueado, sincronización y limpieza de listeners.
- `git diff --check`: correcto.

**Limitación:** no se encontró navegador ni Playwright/Puppeteer instalado. No
se realizaron capturas ni revisión visual/teclado real a 375 o 1280 px en ninguno
de los temas. El diseño se implementó mobile-first; esa revisión manual queda
pendiente según la lista anterior. No se instalaron dependencias para suplirla.

Node emite un aviso informativo `MODULE_TYPELESS_PACKAGE_JSON` al detectar los
módulos TS en las pruebas nativas; no es un fallo. Se conserva el formato de
paquete existente, sin forzar una migración ESM ni ocultar advertencias.
