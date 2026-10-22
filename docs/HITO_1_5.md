# Hito 1.5 — Moderación, reportes y favoritos

**Estado:** completado en alcance frontend y lógica demostrativa. Verificación: 136 pruebas automatizadas y seis runners de navegador aprobados. Sin autorización ni inicio de Hito 2.1.

## Alcance y diseño

Autorizado por la solicitud del Hito 1.5. Se reutilizan catálogo público, lector, formularios y tokens actuales. No se rediseña la portada. Sin Supabase, autenticación, permisos efectivos, publicación ni archivos privados. `/moderacion` es una demo pública; sus semillas sintéticas son distintas de los fixtures internos excluidos del catálogo.

La opción mínima es conservar el provider de catálogo, añadir un servicio local independiente de moderación y ampliar el provider de favoritos con un adaptador de almacenamiento versionado. No se añade una biblioteca de estado ni dependencias. Aprobaciones locales nunca mutan el catálogo público. Reportes comparten formulario y servicio; solo memoria de la pestaña. Favoritos guardan referencias tipadas, nunca archivos ni datos sensibles.

## Plan de ejecución

- [x] Moderación y reportes: pruebas de transiciones `pending → approved/rejected`, rechazo con motivo, metadatos corregidos, solicitudes regulares/electivas, duplicados e historial. Dominio, servicio demo aislado, provider y `/moderacion`; diálogo existente y gestión dinámica integrados.
- [x] Favoritos: pruebas de referencias de ramos/materiales aprobados, deduplicación, persistencia, entradas corruptas y almacenamiento bloqueado. Dominio/adaptador, provider, botón compartido, tarjetas/fichas y `/favoritos` agrupados; navegador 7/7.
- [x] Verificar aislamiento por ID, HTML/RSC/chunks, catálogo, búsquedas, conteos y archivos; revisar seguridad y accesibilidad. Suites existentes, runners de navegador, matriz 375/768/1280/1440 claro/oscuro, lint y build ejecutados.
- [x] Documentar resultados reales, requisitos backend, limitaciones e instrucciones. Sin commit/push, sin ramas/worktrees ni Hito 2.

## Riesgos a comprobar

- Datos locales manipulados no autorizan ni hacen público un recurso.
- Almacenamiento bloqueado/cuota/datos corruptos: interfaz utilizable, aviso honesto y recuperación.
- Recargar restablece moderación y catálogo dinámico; favoritos persistidos de ramos solo en memoria pueden quedar sin recurso disponible.
- Decisiones repetidas y solicitudes duplicadas no producen eventos/publicaciones adicionales.
- Foco tras decisiones, retirada de favoritos, diálogos, errores y teclado; contraste en ambos temas.

## Verificación

Producción local en `http://127.0.0.1:3100`, Node 26.11.1/pnpm 12.14.0. Sin dependencias nuevas. Comandos efectivamente ejecutados:

| Comprobación | Resultado |
| --- | --- |
| `pnpm lint` | Pasa, sin errores |
| `pnpm build` | Pasa, incluidas `/moderacion` y `/favoritos` |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3100 pnpm test` | 136/136 pasan, 0 omitidas |
| `node --test tests/favorites.test.mjs tests/moderation.test.mjs` | 16/16 pasan |
| `WIKI_TEST_BASE_URL=… node tests/browser-catalog.mjs` | 26 checks pasan |
| `WIKI_TEST_BASE_URL=… node tests/browser-courses.mjs` | 62 checks pasan |
| `WIKI_TEST_BASE_URL=… node tests/browser-materials.mjs` | 41 checks pasan |
| `WIKI_TEST_BASE_URL=… node tests/browser-contributions.mjs` | 26 checks pasan |
| `WIKI_TEST_BASE_URL=… node tests/browser-favorites.mjs` | 7 checks pasan |
| `WIKI_TEST_BASE_URL=… node tests/browser-moderation.mjs` | 6 checks pasan |
| `git diff --check` | Pasa |

Todos los runners de navegador usan Chromium existente vía CDP, no instalan navegador. Matriz a 375/768/1280/1440 claro/oscuro para moderación y favoritos; gestión incluye también 365 px. Revisión visual de capturas móviles/escritorio y revisión QA de 768/1280 ambos temas. Sin desbordes observados. Favoritos cubre agrupación, regular/electivo/documento, `aria-pressed`, navegación, foco al quitar, recarga, lectura en otra pestaña, corrupción y storage bloqueado. Moderación cubre filtros, decisiones confirmadas, explicación, historial, metadatos, lector público y flujo integrado gestión/reporte. El visor anterior comprueba descargas reales, teclado, diálogo, errores recuperables y contraste medido en sus superficies; aportes verifica no subida/persistencia ni regresiones del lector.

Suites HTTP incluyen comprobación de HTML/RSC/chunks de `/moderacion` y rutas públicas, sin fixtures privados ni sus marcadores/campos. IDs sintéticos de revisión (incluidos aprobados localmente) no tienen ficha ni endpoint de bytes/descarga públicos. Catálogo/búsquedas/conteos y favoritos conservan su filtro de aprobación independiente.

Evidencia reproducible ignorada por Git: `.next/qa-favorites-evidence/`, `.next/qa-moderation-evidence/`, `.next/qa-evidence/`, `.next/qa-courses-evidence/`, `.next/qa-materials-evidence/`, `.next/qa-contributions-evidence/`. Los informes JSON contienen checks, capturas y errores. No se añaden binarios de QA al repositorio.

Ejecuciones iniciales (no sustituyen la verificación final):
- `node --test tests/favorites.test.mjs`: 6 pasan.
- `pnpm test` sin servidor: 90 pasan, 5 suites HTTP omitidas.
- Primer navegador contra desarrollo `:3000`: falló por conexión HMR WebSocket y falta de hidratación; no se acredita validación visual/interactiva de esa ejecución. Se verificará con producción local.
- Primera compilación integrada: detectó incompatibilidad `Catalog`/`PublicCatalog` en provider de moderación; corregida reproyectando con allowlist pública antes de cada operación, sin cast de autorización. Compilación final pasa.
- Ajustes de runners: esperas CDP deben retornar booleanos, esperar controles visibles de la ruta de destino y no contar árboles ocultos que Next conserva mediante Activity. Corregidos tras fallos reproducidos; no se cambiaron funcionalidades para ocultarlos.
- El runner del visor detectó una precarga GET de `/moderacion` desde el enlace de confirmación del reporte. Se desactivó `prefetch` en ese enlace: probar el reporte sigue sin provocar peticiones ni almacenamiento; navegar explícitamente sigue operativo. Runner completo del visor repetido: 41/41.
- QA detectó avisos locales repetidos por tarjeta. Unificados en `FavoritesFeedback`, una región de estado global. Prueba de storage bloqueado exige un único aviso: falló contra build anterior (2 vs 1) y pasa contra el final. Nuevas capturas revisadas tras la corrección.
- Una prueba adicional de solicitudes repetidas detectó que las coincidencias reservadas ofrecían un enlace de ramo inexistente. Corregido para enlazar esas coincidencias a la cola de solicitudes, distinguiéndolas de asignaturas públicas. El runner reproduce el rechazo de duplicados y comprueba ausencia de fichas públicas inventadas.

## Favoritos — uso y contratos

1. Abre `/semestres/1` y guarda Cálculo I; en `/electivos` guarda un electivo desde su tarjeta. Ambos pueden guardarse también desde su ficha.
2. Abre `/materiales/demo-certamen-calculo-2` y guarda el documento. En `/favoritos` verás asignaturas y documentos en grupos separados.
3. Navega entre pantallas: los botones comparten estado, `aria-pressed` y etiqueta. Quitar una tarjeta enfocada devuelve el foco al encabezado de la lista. Recarga para comprobar persistencia.
4. No se sincroniza entre dispositivos ni en vivo entre pestañas. Otra pestaña lee la selección local al abrir o recargar. Borrar datos del sitio elimina favoritos.
5. Si bloqueas almacenamiento, la selección sigue funcionando solo en memoria y se muestra un aviso. Las referencias desconocidas/no aprobadas se omiten al cargar; no se proyectan datos desde almacenamiento como contenido del catálogo.

`src/domain/favorites.ts` define referencias tipadas, validación/decodificación y `FavoritesService` asíncrono para integración autenticada futura. `src/lib/favorites/local-store.ts` encapsula almacenamiento y suscripciones con snapshot SSR vacío: sin acceso a `window` en servidor. Esquema `wiki-icm:favorites:v1`: `{version:1,items:[{kind:'course'|'material',id}]}`. Se recuperan elementos válidos, se deduplican y se limitan tamaño/esquema; no se guarda texto libre ni archivos. La interfaz no depende de Supabase y un gateway futuro sustituirá acceso local por operaciones de servidor.

Los fallos/recuperación se anuncian una sola vez mediante `FavoritesFeedback` en el layout, no repitiendo regiones `status` por tarjeta.

El catálogo de gestión continúa solo en memoria: tras recargar, los ramos creados localmente dejan de existir y sus referencias se descartan con aviso, sin inventar fichas persistidas. Archivar/renombrar/reclasificar no cambia IDs ni elimina documentos o favoritos existentes en la sesión.

## Backend futuro, no implementado

Requisitos detallados de Auth, PostgreSQL, transacciones/eventos, RLS por propietario/rol y Storage privado en [MODELO_DOMINIO.md](MODELO_DOMINIO.md#ampliación-hito-15--demo-no-backend). No hay migración aplicada ni credenciales. El guardado local y la ruta pública de moderación no ofrecen seguridad, permisos ni sincronización de cuenta.

## Moderación y reportes — uso y contratos

1. Abre `/moderacion`. Sus tres colas tienen buscador y estado independientes; los registros son sintéticos deliberadamente públicos, no aportes reales ni los fixtures privados del catálogo.
2. En Materiales, consulta metadatos, abre la muestra PDF original **ya pública y distinta del supuesto envío**, o corrige ramo/tipo/número/período y datos opcionales con motivo de corrección. Se actualiza el nombre normalizado sin alterar el semestre curricular.
3. Aprobar/rechazar abre confirmación explícita y cancelable. Rechazar exige explicación. El registro deja la cola pendiente: cambia el filtro para consultar estado e historial. No se publica nada ni existe ficha pública para esos IDs.
4. En `/gestion/asignaturas`, usa el formulario existente con «Solicitar revisión DEMO». Permite regular con semestre 1–12 o electivo en cualquiera de las cinco áreas. Se detectan duplicados del catálogo actual y de solicitudes reservadas; no se crea un ramo. Revisa/corrige/aprueba/rechaza en Solicitudes de moderación, sin incorporación automática al catálogo.
5. En una ficha de documento aprobado, usa el único diálogo «Reportar material». El reporte se añade solo a memoria y puede consultarse por navegación interna en `/moderacion#reportes`. Resolución requiere explicación/confirmación y no retira ni modifica el documento público.
6. Recargar restablece todas las decisiones/reportes/solicitudes. No hay usuarios autenticados, roles, permisos efectivos ni almacenamiento privado.

Dominio `src/domain/moderation.ts`: validación y funciones puras para transición, corrección y resolución; `ModerationEvent` contiene tipo/ID del recurso, anterior/nuevo, acción, motivo, fecha y `actorId: null` en demo. Correcciones conservan antes/después. `ModerationService` asíncrono encapsula lectura/mutaciones, preparado para gateway autenticado futuro. El adaptador `src/lib/moderation/repository.ts` usa snapshots clonados, revalida contra el catálogo dinámico y no expone setters de estado a componentes. `src/components/moderation/moderation-provider.tsx` comparte memoria por árbol/pestaña, nunca un singleton mutable de servidor.

Semillas en `src/fixtures/moderation.ts`, **separadas de `src/fixtures/catalog.ts`**. El layout mantiene la allowlist `PublicCatalog`; la aprobación de revisión no modifica esa fuente ni el manifiesto/endpoint de archivos. Las entradas a reportes solo admiten materiales aprobados con relaciones públicas válidas. Los actores `null` y el reloj del navegador no representan identidad ni auditoría real.

Formularios compartidos: `CourseInputFields` para gestión/corrección de solicitudes; `ContributionField` y validación de aportes para metadatos; `ReviewActions` para confirmación/aprobación/rechazo/resolución; `DemoReportDialog` sigue siendo el único formulario de reportes. Filtros y anuncios accesibles, resúmenes enfocados, errores asociados y controles deshabilitados sin JavaScript.

## Archivos de esta entrega

**Creados:**
- `src/app/moderacion/page.tsx`.
- `src/components/moderation/{moderation-provider,moderation-workspace,metadata-editors,review-actions}.tsx`.
- `src/components/courses/course-input-fields.tsx`.
- `src/domain/{moderation,favorites}.ts`, `src/fixtures/moderation.ts`.
- `src/lib/moderation/repository.ts`, `src/lib/favorites/local-store.ts`.
- `tests/{moderation,favorites,moderation-routes}.test.mjs`, `tests/browser-{moderation,favorites}.mjs`.
- `docs/HITO_1_5.md`.

**Modificados:**
- `src/app/layout.tsx`, `src/app/favoritos/page.tsx`, `src/app/gestion/asignaturas/page.tsx`.
- `src/components/catalog/{course-card,course-content,favorite-button,favorites-content,favorites-provider}.tsx`.
- `src/components/courses/course-manager.tsx`, `src/components/layout/site-footer.tsx`.
- `src/components/materials/{demo-report-dialog,material-content}.tsx`.
- `tests/browser-{courses,materials}.mjs`, `tests/{routes,course-routes,contribution-routes}.test.mjs`: expectativas actualizadas al alcance autorizado, sin eliminar cobertura anterior.
- `README.md`, `docs/{BRIEF_PRODUCTO,MODELO_DOMINIO,DISENO,HITO_1_4_1}.md`.

Los cambios previos del usuario en `AGENTS.md` y `opencode.json` se preservan y no forman parte de esta implementación.

## Límites y pendientes reales

- Sin Auth, cuentas, permisos, DB, RLS o Storage conectados; `/moderacion` es pública. Nada de esta demo acredita seguridad de producción. Sin Hito 2.1.
- Decisiones, reportes y catálogo dinámico solo en memoria; recargar los restablece. Aportes de `/aportar` siguen sin enviar archivos ni crear entradas reales de moderación.
- Favoritos son por navegador/perfil/origen, no por usuario; borrar datos o navegación privada puede eliminarlos. No hay sincronización entre dispositivos ni en vivo entre pestañas, ni garantía concurrente multiusuario.
- El servidor de desarrollo existente en `:3000` presentó un problema HMR/hidratación; se dejó intacto. La evidencia válida es de producción local, no se afirma haber resuelto el entorno de desarrollo.
- No se ejecutó auditoría WCAG completa ni lector de pantalla real. Teclado, etiquetas, foco, temas, overflow y capturas sí se comprobaron; los tests de tokens existentes pasan. No se afirma conformidad total por estas pruebas.
- Sin cambios de dependencias, migraciones, despliegue, ramas, worktrees, commits ni push. Cambios quedan para revisión manual.
