# Hito 1.3 — Lectura integrada y descarga

## Alcance

Lectura y descarga reales de muestras originales, sin Supabase, autenticación, subidas, publicaciones o reportes de backend. Se preservan catálogo, filtros y diseño de los hitos 1.1/1.2. **No se inicia el Hito 1.4.**

## Probar en localhost

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Abrir `http://localhost:3000`:

| Ruta | Caso |
| --- | --- |
| `/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2` | Catálogo con filtros y secciones A/B; abrir sección 1 |
| `/materiales/demo-certamen-calculo-2` | PDF real de 3 páginas, texto seleccionable; buscar `continuidad` |
| `/materiales/demo-listado-calculo-3` | PNG original |
| `/materiales/demo-apuntes-calculo` | WebP original |
| `/materiales/demo-certamen-calculo-1` | JPEG original |
| `/materiales/demo-listado-algebra-1` | Ficha sin archivo, sin descarga ficticia |
| `/materiales/demo-certamen-calculo-2-seccion-2` | Otra versión del certamen sin archivo asignado |
| `/materiales/demo-pending-calculo` o `/materiales/demo-rejected-calculo` | 404 sin metadatos privados |

Cálculo I conserva semestre curricular **1**. `Certamen 2 - 2024-2.pdf` corresponde a año 2024 / semestre académico 2, independientemente de su subida.

La categoría en breadcrumbs y «Volver» conserva los filtros del ramo cuando la ficha se abre desde allí. No se aceptan URLs externas de retorno.

## Arquitectura

- `src/domain/material-file.ts`: contrato `MaterialFileSource` y DTO público `PublicMaterialFile`.
- `src/fixtures/material-files.ts`: mapa cerrado ID → muestra autorizada; no se altera el catálogo ni se deducen metadatos del nombre original.
- `src/lib/materials/local-source.ts`: módulo `server-only`; comprueba aprobación, archivo existente, confinamiento de ruta real, límite de 20 MiB y firma mínima de formato.
- `/materiales/[id]/archivo`: entrega bytes con MIME explícito y `nosniff`; `?descargar=1` añade `attachment` y nombre normalizado, sin redirección a URLs arbitrarias.
- `src/components/materials/`: cliente aislado; React-PDF solo se importa dinámicamente sin SSR. La ficha y comprobación pública permanecen en servidor.
- `scripts/prepare-pdfjs.mjs`: prepara recursos de PDF.js en desarrollo/build. Worker local empaquetado por Next, nunca CDN.
- `public/demo/`: PDF e imágenes originales versionados; `scripts/generate-demo.py` permite regenerarlos opcionalmente con Python/Pillow, sin dependencia durante build.

React-PDF 11.0.0 exige React 19+ y Node 22.13+. PDF.js 6.3.289 se declara directamente y con versión exacta para que el worker use el mismo motor con pnpm. Proyecto probado en Node 26.11.1 / pnpm 12.14.0; las pruebas TS requieren Node 22.18+.

## Uso y accesibilidad

- Navegación mediante controles nativos con etiquetas y foco visible. Controles del lector de al menos 44 px; toolbar adaptable, sin patrón ARIA incompleto.
- Solo una página renderizada a la vez. La selección depende de la capa de texto del PDF; no hay OCR ni garantía de accesibilidad para documentos de origen mal estructurados.
- Búsqueda de texto dentro del PDF sin interpretar contenido como HTML de aplicación.
- La búsqueda se cancela cooperativamente y limita resultados a 1.000 coincidencias, 500 páginas y 2 millones de caracteres procesados; avisa explícitamente cuando el resultado es parcial. No interrumpe una extracción de página ya iniciada ni limita por sí sola toda la memoria interna de PDF.js.
- El zoom se limita para evitar consumo excesivo; el desplazamiento de contenido ampliado queda dentro del lector.
- Zoom relativo al ajuste al ancho: 50–300 %, pasos de 25 %. «Ajustar» vuelve al ancho disponible; «Restablecer zoom y posición» vuelve a 100 % y al inicio de la página actual. El canvas tiene además un límite de 8 millones de píxeles y 4096 px por lado; si se alcanza, se informa sin seguir aumentando su memoria.
- Pantalla completa usa la API del navegador. Su disponibilidad depende del navegador/dispositivo y se informa si no está soportada.
- No se implementan contraseña de PDF, OCR ni enlaces/anotaciones interactivos del documento. Un PDF protegido muestra un error recuperable; las anotaciones están deshabilitadas intencionalmente.
- Los colores del archivo se conservan también en oscuro; los tokens de la aplicación se mantienen.
- Reporte: motivos predefinidos y descripción adicional, aviso explícito de simulación, confirmación que dice que no se envió información. Sin red ni persistencia del reporte.

## Seguridad y límites

No existe sistema de cuentas/roles real en esta demo. El filtro del catálogo **no sustituye** autorización de servidor/RLS.

La ficha y endpoint de bytes comparten una resolución `approved-only`. Los IDs no aprobados/inexistentes o sin archivo no producen URLs útiles ni descargas exitosas. No se envían nombres originales, fecha de subida, rutas de disco ni claves privadas al lector.

**`public/demo/` es intencionalmente público por URL directa.** No es almacenamiento privado ni permite revocar un asset retirando su ficha. Nunca guardar allí archivos pendientes, rechazados, sensibles o de terceros sin permiso. Las firmas mínimas de las muestras no son un escáner ni una validación suficiente para subidas.

Solo se admiten PDF/PNG/JPEG/WebP en esta capa. No se crean visores de HTML/SVG arbitrario ni se infieren MIME/metadatos desde nombres proporcionados por usuarios. No hay secretos, claves de Storage ni conexiones externas.

### Conexión futura con Supabase (no implementada)

1. Mantener el contrato de fuente y reemplazar implementación en servidor; no pasar claves de objetos privados a componentes públicos.
2. Guardar originales en buckets privados. Comprobar aprobación y RLS en servidor antes de firmar una URL de corta duración o servir bytes, también para HEAD y rangos HTTP. Mantener lectura anónima de aprobados; comprobar sesión/rol solo para accesos privados autorizados, contribuciones y favoritos.
3. Separar contribuciones pendientes/rechazadas de publicación aprobada; revocación, cachés y copias descargadas requieren política explícita.
4. Validar firmas, tamaño, páginas/dimensiones, contenido activo y procedencia; analizar archivos y revisión humana antes de publicar. No confiar en extensión ni MIME declarado.
5. Aplicar autorización a la consulta de metadatos, RSC, lectura y descarga; registrar moderación/reportes con controles antiabuso y sin secretos en cliente.

## Validación

```bash
pnpm lint
pnpm test
pnpm build
pnpm start --hostname 127.0.0.1 --port 3100
```

En otra terminal, con servidor iniciado:

```bash
WIKI_TEST_BASE_URL=http://127.0.0.1:3100 pnpm test
WIKI_TEST_BASE_URL=http://127.0.0.1:3100 node tests/browser-catalog.mjs
WIKI_TEST_BASE_URL=http://127.0.0.1:3100 node tests/browser-materials.mjs
```

Los runners de navegador reutilizan Chrome/Chromium existente mediante CDP; no instalan navegadores. Si no se detecta, indicar `WIKI_CHROME_PATH`. Los artefactos permanecen en `.next/`, ignorados en Git. Revisar 375/768/1280/1440 px en claro/oscuro, teclado, PDF/worker, errores, búsqueda, imágenes y descarga.

### Recorrido manual de aceptación
1. Abrir Cálculo I con los filtros de la tabla, entrar a sección 1 y comprobar que el breadcrumb y «Volver» conservan `tipo`, `anio`, `periodo` y `numero`.
2. Seleccionar/copiar texto del PDF; avanzar a página 3 y volver a página 1. Los botones de los extremos quedan deshabilitados.
3. Buscar `continuidad`, recorrer coincidencias de distintas páginas y probar un término inexistente.
4. Ampliar/reducir hasta sus límites, ajustar al ancho y restablecer; comprobar que el scroll horizontal queda dentro del lector.
5. Entrar/salir de pantalla completa con botón/Escape; si no está disponible, debe aparecer un aviso explícito.
6. Descargar: el archivo del certamen debe llamarse `Certamen 2 - 2024-2.pdf` y contener las tres páginas originales. Probar también cada formato de imagen.
7. Abrir reporte con teclado, elegir un motivo y escribir descripción; probar el formulario. La confirmación debe indicar que no envió ni guardó nada. Cerrar con Escape y comprobar retorno del foco.
8. Abrir la ficha sin archivo y los IDs privados: no deben ofrecer descargas ficticias ni metadatos privados. El documento inexistente devuelve 404.
9. Repetir en móvil, claro/oscuro y con zoom del navegador al 200 %. Esto no sustituye pruebas con lector de pantalla ni dispositivos reales.

Los resultados de ejecución se registrarán al completar la validación de esta entrega.

La suite de navegador incluye regresiones encontradas durante la implementación: navegación de historial con páginas retenidas por Next/React Activity (sin reutilizar un transporte PDF destruido) e imágenes que terminan o fallan antes de hidratar React (no deben quedar «Cargando imagen…» indefinidamente).

## Archivos de la entrega

### Creados
- `src/app/materiales/[id]/{page.tsx,loading.tsx,archivo/route.ts}`.
- `src/components/materials/{document-reader.tsx,pdf-reader.tsx,reader-frame.tsx,reader-feedback.tsx,pdf-search.ts,reader.module.css,demo-report-dialog.tsx}`.
- `src/domain/material-file.ts`, `src/fixtures/material-files.ts`.
- `src/lib/materials/{local-source.ts,file-metadata.ts,navigation.ts}`.
- `public/demo/{README.md,calculo-certamen-demo.pdf,calculo-listado-demo.png,calculo-apuntes-demo.webp,calculo-funciones-demo.jpg}`.
- `scripts/{prepare-pdfjs.mjs,generate-demo.py}`.
- `tests/{materials.test.mjs,demo-pdf.test.mjs,pdf-search.test.mjs,browser-materials.mjs}` y esta documentación.

### Modificados
- `package.json`, `pnpm-lock.yaml`, `.gitignore`, `eslint.config.mjs`.
- `src/app/{page.tsx,globals.css}`, `src/app/ramos/[slug]/page.tsx`.
- `src/components/catalog/material-card.tsx` y `src/components/layout/{prototype-notice.tsx,site-footer.tsx}`.
- `tests/{routes.test.mjs,academic-routes.test.mjs}`: se actualiza únicamente el alcance ahora autorizado de materiales; se conservan negativas privadas y de hitos futuros.
- `README.md`, `docs/{BRIEF_PRODUCTO.md,MODELO_DOMINIO.md,DISENO.md}`.

### Auditoría de dependencias

`pnpm audit --prod` detectó un aviso alto preexistente: `braces <=3.0.3`, GHSA-vfj7-8cjw-p6xm, por las dependencias transitivas de `shadcn` (sin versión corregida publicada según el registro consultado). No procede de React-PDF/PDF.js. Se deja registrado para seguimiento; esta entrega no elimina herramientas existentes ni hace actualizaciones masivas fuera del alcance.

### Revisión de seguridad

`@security-reviewer` no confirmó bloqueantes nuevos de acceso/bytes para la demo. Verificó worker local de la misma versión, desactivación de anotaciones/evaluación, ausencia de HTML arbitrario en resaltado, exclusión de IDs privados y respuesta segura de HEAD/Range/RSC. Range se ignora legítimamente devolviendo 200 con el archivo completo; no se implementan rangos parciales aún.

Se corrigieron dos observaciones preventivas: lectura de disco acotada antes de asignar memoria y límite de texto/resultados de búsqueda. Un test de inventario impide añadir binarios a `public/demo` sin asociación aprobada explícita. La revisión se limita a las muestras originales: no es certificación para subidas no confiables, ni análisis antivirus ni garantía de que toda la memoria interna del lector quede limitada a 32 MB.
