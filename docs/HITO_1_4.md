# Hito 1.4 — Preparación local de aportes académicos

## Alcance y límites

Formulario completo en `/aportar`, integrado con encabezado, CTA comunitario y enlace desde cada ramo (`/aportar?ramo=calculo-i`). Solo se seleccionan asignaturas existentes en los fixtures, que **no representan una malla oficial**. Un parámetro desconocido o repetido no crea ramos ni autoriza operaciones.

No hay autenticación, API de aportes, Server Actions de subida, base de datos, Storage, registros persistentes, cola de moderación ni publicación. Selección, metadatos y permiso viven exclusivamente en memoria del navegador. No se guardan binarios, nombres personales ni correos en almacenamiento web, disco o servicios. Recargar descarta el formulario; cambiar el tema conserva únicamente la preferencia ya existente.

La confirmación dice exactamente:

> Simulación completada. Ningún archivo fue enviado. El sistema de aportes estará disponible cuando se active la autenticación y el almacenamiento.

**No se inicia el Hito 1.5.**

## Reglas y contratos reutilizables

`src/domain/contribution.ts` separa los datos y reglas de la presentación:

- `ContributionDraft`: campos editables, inicialmente vacíos; no contiene identidad, rol, estado ni semestre curricular editable.
- `ContributionMetadata` y `ContributionValidation`: datos estructurados válidos y errores por campo. Ramo debe existir; año entre 1900 y 2100, término 1/2 y número entero 1–999 (obligatorio para listado/certamen, opcional para apuntes).
- `validateContributionDraft`, `contributionDisplayName`, `contributionDownloadName`: reutilizan la normalización del catálogo y los nombres de descarga. Título, sección, profesor y versión son secundarios; nunca cambian el nombre público.
- `ContributionFileSelection`, `ContributionFilePolicy`, `checkContributionFile`: orientación local configurable, límite predeterminado `25 * 1024 * 1024` bytes inclusive. Un único archivo no vacío PDF/JPEG/PNG/WebP; se rechazan SVG/HTML/ejecutables y discrepancias de tipo/extensión.
- `ContributionSubmission`, `ContributionReceipt`, `ContributionService`: **interfaces sin implementación** para un futuro adaptador de servicios. Incluyen declaración de permiso; el servidor deberá comprobarla y no confiar en el cliente.

El normalizador compartido solo necesita categoría/número y año/término: no se crean materiales o IDs falsos para calcular un nombre. No se consulta unicidad por tipo/número/período: múltiples secciones, docentes o versiones pueden coexistir.

Cálculo I mantiene semestre curricular **1** al preparar un `Certamen 2 - 2024-2.pdf`. Sin número, un apunte se llama `Apuntes - 2024-2.pdf`. El nombre original y la fecha del archivo nunca determinan el período.

## Visor y ciclo de vida

Se reutilizan `DocumentReader`, `PdfReader` y `ReaderFrame`. El contrato mínimo `ReaderFile` contiene solo formato y URL, por lo que una previsualización local no se presenta como material público aprobado. `onStatusChange` informa carga, lectura y fallo para impedir confirmar un documento ilegible.

El visor PDF queda **fuera del formulario de aporte**, evitando anidar su buscador. Conserva paginación, texto, búsqueda sin OCR, zoom, ajuste y pantalla completa del Hito 1.3. Las imágenes se muestran completas, sin inversión de colores en oscuro.

Las URLs `blob:` se crean solo para previsualizar y se revocan al cerrar, reemplazar, quitar y limpiar efectos; al reactivarse la ruta se reconstruyen. La comprobación asíncrona ignora selecciones obsoletas. Un fallo no elimina los otros campos.

Los callbacks tardíos se descartan por revisión de archivo y URL activa. Un error de lectura conocido permanece asociado a la selección aunque otra página se lea correctamente; para comprobar de nuevo se debe reemplazar o volver a seleccionar el archivo. No se promete inspección exhaustiva de todas las páginas.

El conjunto de controles y el botón de simulación llegan deshabilitados en el HTML inicial y se habilitan tras montar los handlers. Sin JavaScript se muestra una explicación y no hay envío GET nativo con los metadatos en la URL.

## Seguridad: requisitos pendientes antes de Supabase

Las comprobaciones de tamaño, MIME declarado, extensión, firma mínima y decodificación son **orientación UX**, no un verificador de seguridad, antivirus ni garantía contra archivos hostiles. El lector limita canvas y búsqueda, pero no toda la memoria de PDF.js o de decodificación de imágenes. PDFs cifrados o dañados pueden rechazarse; no se implementa OCR.

Antes de cualquier servicio real será obligatorio:

1. Autenticación con cualquier correo **verificado**, autorización por roles en servidor y RLS; nunca roles del cliente como fuente de permisos.
2. Storage privado para todo original pendiente/rechazado; nunca `public/` ni URLs públicas automáticas.
3. Revalidación de metadatos contra catálogo/ofertas; identidad, estado, claves y fechas establecidos por servidor.
4. Inspección del contenido real/MIME, límites de bytes/páginas/dimensiones y recursos, escaneo y tratamiento de contenido activo. No confiar en nombre/extensión/tipo del navegador.
5. Protección contra abuso: cuotas, frecuencia, concurrencia, cargas excesivas y comprobación de autorización en cada operación.
6. Registro transaccional como `pending`, revisión humana obligatoria, trazabilidad y política de privacidad/retención.
7. Publicación e indexación exclusivamente de aprobados; pendientes/rechazados nunca aparecen en consultas públicas ni descargas. URLs firmadas solo tras verificar acceso.

`ContributionService` será un puerto para esa integración, no un permiso para conectar servicios en este hito. `MaterialFileSource` seguirá resolviendo lecturas aprobadas en servidor. El catálogo público actual no cambia al usar el formulario.

## Probar localmente

```bash
pnpm dev
```

1. Abrir `http://localhost:3000/aportar?ramo=calculo-i`; comprobar curricular 1.
2. Elegir Certamen, número 2, año 2024 y semestre académico 2.
3. Seleccionar `public/demo/calculo-certamen-demo.pdf`; revisar las tres páginas y `Certamen 2 - 2024-2.pdf`.
4. Intentar confirmar sin autorización; corregir el error sin perder campos y luego marcar la declaración. Solo debe aparecer la simulación citada arriba.
5. Probar Apuntes sin número, reemplazar por cada imagen de `public/demo`, ampliar, cerrar/abrir preview y quitar archivo.
6. Probar archivo vacío, SVG/HTML, formato discordante, corrupto y más de 25 MiB; revisar mensajes y recuperación.
7. Buscar un ramo sin acentos o por código, probar sin resultados y usar exclusivamente Tab/flechas/espacio/Enter. Repetir claro/oscuro y móvil.
8. Volver al catálogo y visor público: filtros, lectura y descargas deben permanecer iguales; ningún archivo seleccionado debe aparecer allí.

## Verificaciones

```bash
pnpm lint
pnpm test
pnpm build
pnpm start --hostname 127.0.0.1 --port 3100
```

Con el servidor iniciado:

```bash
WIKI_TEST_BASE_URL=http://127.0.0.1:3100 pnpm test
WIKI_TEST_BASE_URL=http://127.0.0.1:3100 node tests/browser-contributions.mjs
WIKI_TEST_BASE_URL=http://127.0.0.1:3100 node tests/browser-materials.mjs
```

Los runners usan Chromium existente con sandbox; si el entorno impide su ejecución, registran el bloqueo, no lo desactivan. Las pruebas visuales programadas cubren 375, 768, 1280 y 1440 px en ambos temas. Evidencias en `.next/qa-contributions-evidence/` y `.next/qa-materials-evidence/`, ignoradas por Git. No sustituyen una auditoría WCAG completa ni pruebas en dispositivos y lectores de pantalla reales.

### Resultados y restricciones de esta entrega

- `pnpm lint`: correcto, sin errores ni advertencias. `git diff --check`: correcto.
- `pnpm build`: correcto, incluida la ruta `/aportar` y comprobación TypeScript.
- `pnpm test` sin servidor configurado: **57 aprobadas, 4 suites HTTP omitidas, 0 fallidas**. QA ejecutó además `WIKI_TEST_BASE_URL=http://127.0.0.1:3000 pnpm test` desde su sesión de pruebas y reportó **88 aprobadas, 0 fallidas, 0 omitidas**, incluidas las regresiones HTTP de catálogo y materiales. No se ejecutaron pruebas de navegador.
- Las pruebas de dominio incluyen los cuatro formatos, número obligatorio/opcional, nombres y períodos, límites inclusivos de 25 MiB, errores por campo, profesor opcional, duplicados y exclusión de datos ajenos al contrato. La suite existente también verifica el PDF real de tres páginas, firmas de imágenes, privacidad de fixtures, filtros y tokens de contraste claro/oscuro.
- Se realizaron **51 comprobaciones HTTP** con la herramienta HTTP permitida sobre el servidor de desarrollo ya existente en `http://127.0.0.1:3000`: rutas, preselección segura (incluidos parámetros inválidos/repetidos), controles inicialmente deshabilitados, ausencia de metadatos privados en HTML/RSC, búsqueda/filtros con dos versiones aprobadas, ficha pública, 404 privados y cabeceras de descarga de PDF/PNG/JPEG/WebP. Todas pasaron. Esto no prueba renderizado en navegador ni igualdad binaria de las respuestas.
- `pnpm start --hostname 127.0.0.1 --port 3100` fue denegado por los permisos. El comando permitido `pnpm dev --hostname 127.0.0.1 --port 3100` detectó el servidor existente y salió sin sustituirlo; no se detuvo el proceso del usuario.
- El comando con prefijo `WIKI_TEST_BASE_URL=… pnpm test` fue denegado en la sesión coordinadora; no se reintentó con wrappers ni se cambiaron permisos. El resultado HTTP de 88 pruebas corresponde a la ejecución informada por QA en su sesión. Las cuatro suites opt-in se omiten en `pnpm test` normal; las 51 comprobaciones HTTP del coordinador son adicionales y se ejecutaron por separado.
- **Pendiente por permisos:** ejecutar `node tests/browser-contributions.mjs` y el runner de regresión `node tests/browser-materials.mjs`. La política shell actual no autoriza esos comandos; no se usaron wrappers, cambios de permisos ni dependencias alternativas para eludirla. No se produjeron capturas ni se certifica QA visual/interactivo de esta entrega. La matriz 375/768/1280/1440 en claro/oscuro, teclado real, previews y ciclo de URLs está programada en el runner para ejecutarla cuando esté permitido.
- El runner incorpora también comparación del catálogo antes/después, textos largos sin espacios, rechazo HTML/ejecutables, error de render PDF persistente y carreras A→B/quitar mientras una lectura nativa de firma está demorada. Son pruebas programadas, no resultados de ejecución; la inyección retrasa o provoca fallos explícitos, nunca sustituye bytes ni simula un render correcto.
- Consultados `ui-designer`, `frontend`, `backend`, `security-reviewer` y `qa-tester`. Se corrigieron los hallazgos de profesor desconectado del dominio, errores enlazados a controles ocultos, texto de error, envío nativo sin JS y pérdida de un error de lectura conocido.

### Archivos

**Creados:**
- `src/app/aportar/{page.tsx,loading.tsx}`.
- `src/components/contributions/{contribution-form.tsx,contribution-course-picker.tsx,contribution-field.tsx,contribution-file-picker.tsx,contribution-section.tsx,local-file-preview.tsx}`.
- `src/domain/contribution.ts`.
- `tests/{contribution.test.mjs,contribution-routes.test.mjs,browser-contributions.mjs}`.
- `docs/HITO_1_4.md`.

**Modificados:**
- `src/app/page.tsx`, `src/app/ramos/[slug]/page.tsx`, `src/components/layout/site-header.tsx` (accesos al formulario).
- `src/components/materials/{document-reader.tsx,pdf-reader.tsx,reader-feedback.tsx}` (contrato mínimo, estado opcional y fallo útil también para archivos locales).
- `src/lib/catalog/query.ts` (normalizador con contrato mínimo reutilizable).
- `tests/routes.test.mjs` (alcance autorizado de `/aportar`), `tests/browser-materials.mjs` (no desactivar sandbox).
- `README.md`, `docs/{BRIEF_PRODUCTO.md,DISENO.md,MODELO_DOMINIO.md}`.

Sin dependencias nuevas, cambios de fixtures o archivos públicos, migraciones, despliegue ni push. El cambio previo en `opencode.json` permanece sin modificar por esta tarea.
