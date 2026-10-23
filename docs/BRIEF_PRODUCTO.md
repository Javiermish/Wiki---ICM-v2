# Wiki ICM — Brief de producto

## Propósito
Biblioteca colaborativa de Ingeniería Civil Matemática (UdeC) para encontrar, consultar, descargar y aportar material académico confiable.

## Usuarios
- Visitante: explora por semestre de malla y ramo; filtra por tipo, número, año y semestre real; visualiza y descarga material aprobado.
- Colaborador: cuenta con correo verificado; envía PDF/imágenes; consulta estado de sus aportes; guarda favoritos; reporta material.
- Moderador: revisa/acepta/rechaza aportes; corrige metadatos; atiende reportes; requiere rol comprobado por servidor.

## Funciones no negociables (v1)
- Índice por semestres curriculares y ramos, con electivos agrupados por área sin semestre curricular obligatorio.
- Listados, Apuntes y Certámenes dentro de cada ramo.
- Etiquetas públicas normalizadas, con número y periodo académico real (`Certamen 2 - 2024-2`).
- Visor PDF/imagen incorporado y botón de descarga.
- Formulario de aportes con verificación humana previa a publicación.
- Buscador y filtros; reportes; modo oscuro; favoritos para cuentas.
- Lectura libre sin login; cualquier correo verificado puede registrarse para colaborar.

## Principios de UX
Tres clics aproximados desde inicio a un material relevante (no regla técnica rígida). Buscador siempre identificable. Fecha académica visible en todas las tarjetas. Previsualización es acción principal en documentos. Estados vacíos útiles, nunca errores silenciosos.

## Límite inicial de Hito 1 y ampliaciones autorizadas
El alcance inicial excluía autenticación real, base de datos real, upload real, visor PDF real, moderación real y deploy; los representaba con pantallas estáticas/mocks y componentes accesibles. Las ampliaciones siguientes detallan las excepciones autorizadas. Autenticación, DB, Storage, subida, moderación y despliegue reales continúan fuera del alcance vigente.

**Ampliación autorizada en Hito 1.3:** lectura PDF e imágenes y descarga reales, exclusivamente con archivos locales originales de demostración. Reportes explícitamente simulados. No se habilitan servicios de autenticación, DB, Storage, subidas, moderación ni despliegue. El Hito 1.4 requiere aprobación independiente.

**Ampliación autorizada en Hito 1.4:** formulario `/aportar` completo, con metadatos estructurados, selección de un archivo local PDF/JPEG/PNG/WebP de hasta 25 MiB y previsualización con el lector existente. Solo estado en memoria y confirmación explícita de simulación; ningún archivo se envía, persiste, publica ni ingresa a moderación. La ampliación no autoriza Hito 1.5 ni servicios reales.

**Ampliación vigente Hito 1.4.1:** electivos por área (`/electivos?area=…`), gestión de asignaturas (`/gestion/asignaturas`) y favoritos DEMO locales (`/favoritos`), integrados con catálogo, aportes y documentos. Gestión pública sin login ni permisos efectivos: crear, editar, reclasificar, archivar y reabrir solo en memoria de la pestaña. Los favoritos son una selección de demostración, no guardado en una cuenta. La navegación cliente comparte estado; recargar/cerrar u otra pestaña parte del catálogo inicial. No se persisten ni comparten cambios y no se habilitan auth/DB/Storage, envío de solicitudes ni revisión real.

Reclasificar conserva ID/slug, documentos y periodos académicos; archivar no despublica materiales aprobados. Todas las asignaturas, regulares o electivas, presentan Listados, Apuntes y Certámenes aunque estén vacías. Los datos siguen siendo ficticios, no una malla oficial. Contratos asíncronos preparan una integración futura de servidor con correo verificado, roles/RLS y solicitudes revisadas, sin implementarla. Alcance histórico: [HITO_1_4_1.md](HITO_1_4_1.md).

**Ampliación vigente Hito 1.5:** `/moderacion` pública y explícitamente DEMO, con aportes sintéticos, solicitudes regulares/electivas y reportes integrados. Validación, corrección académica, decisiones confirmadas e historial solo en memoria; aprobación nunca publica archivos ni incorpora solicitudes al catálogo. Favoritos de ramos y documentos aprobados persisten como referencias locales en este navegador, sin cuenta ni sincronización entre dispositivos. Recuperación de datos inválidos y fallback en memoria cuando falla almacenamiento. No hay permisos reales, backend ni Supabase; no se inicia Hito 2.1. Ver [HITO_1_5.md](HITO_1_5.md).

## Restricciones
No afirmar que los ramos de ejemplo conforman la malla oficial. No almacenar ni publicar documentos de terceros sin permiso. Moderación y políticas de acceso deben estar del lado del servidor en versión funcional.

## Ampliación autorizada Hito 2.1

Auth Supabase real con correo confirmado, perfiles propios y roles student/moderator/admin, administración de moderadores e historial. `/moderacion` requiere ahora moderador/admin verificado en servidor, pero conserva sus operaciones sintéticas: ninguna aprobación publica contenido. Catálogo público, gestión académica y aportes permanecen demo. Favoritos siguen locales, sin sincronización con cuentas. La arquitectura definitiva reserva Supabase para Auth/PostgreSQL, Cloudflare R2 para futuros archivos y Vercel Hobby para alojamiento futuro; no Supabase Storage para documentos. Sin despliegue ni Hito 2.2. Configuración, pruebas y límites: [HITO_2_1.md](HITO_2_1.md).
