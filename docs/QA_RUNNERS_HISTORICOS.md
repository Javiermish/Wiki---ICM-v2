# Runners DEMO retirados — Hito 2.2

## Decisión

`tests/browser-courses.mjs` y `tests/browser-moderation.mjs` se trasladaron completos a `tests/historical/`. Se conservan sus escenarios como referencia, pero su entrada termina inmediatamente con `RETIRADO`, sin lanzar Chromium, contactar servidores ni sobrescribir evidencia. Esa salida **no es un PASS de escenarios**. No forman parte de `pnpm test:browser`.

Presuponían gestión y moderación públicas, mutaciones de catálogo en memoria y pérdida del catálogo al recargar. Hoy `/gestion/asignaturas`, `/admin/ramos` y `/moderacion` tienen sesión/roles y persistencia. No se deben desproteger para reproducir contratos antiguos.

## Destino de cada grupo de escenarios

| Escenarios históricos | Cobertura vigente / decisión |
| --- | --- |
| Semestre obligatorio regular, electivo sin semestre, validaciones | `course-management.test.mjs`, `persistent-catalog.test.mjs`; la interacción de gestión pública se archiva. |
| Crear/editar conserva ID y slug | Dominio en `course-management.test.mjs`, `persistent-catalog.test.mjs`; PostgREST real preparado en QA autenticada, todavía no ejecutado. |
| Buscar ramo vacío, tres categorías, selección en Aportes | `dynamic-catalog.test.mjs`, `academic-catalog.test.mjs`, `course-routes.test.mjs`, `contribution-routes.test.mjs`, `browser-catalog.mjs`. |
| Crear regular en nuevo semestre | `dynamic-catalog.test.mjs`; se retira la creación anónima DEMO. |
| Archivar/restaurar/reclasificar conservando identidad y materiales | `course-management.test.mjs`, `dynamic-catalog.test.mjs`, `favorites.test.mjs`, `persistent-catalog.test.mjs`. Gestión autenticada no se presenta como cubierta por estas pruebas de dominio. |
| Aislamiento de catálogo por pestaña y pérdida al recargar | Obsoleto: catálogo compartido persistente. No trasladar esa expectativa. |
| Favoritos, recarga/otra pestaña, quitar con teclado/foco | `browser-favorites.mjs`. |
| Electivos: **Todas** conserva `q` y elimina `area` | Único hueco público detectado: migrado a `browser-catalog.mjs` con clic real y comprobación de URL y campo de búsqueda. |
| PDF real, descargas, teclado, temas, responsive públicos | `browser-materials.mjs`, `browser-catalog.mjs`, `browser-favorites.mjs`, `browser-contributions.mjs`. |
| Responsive y foco de formularios privados de gestión | No sustituir por pruebas públicas. Pendiente sesión real de navegador; no se migra a una ruta abierta. |
| Colas sintéticas, filtros, errores, rechazo/corrección, confirmaciones/historial | Dominio en `moderation.test.mjs` e integración de UI en `persistent-ui.test.mjs`; los recorridos de navegador privados quedan pendientes. |
| Aprobar solicitud DEMO nunca crea ramo | Válido solo para el servicio sintético de `moderation.test.mjs`. La RPC real sí crea ramo; no copiar la aserción antigua. |
| Reportar documento y resolver reporte DEMO | Reporte público: `browser-materials.mjs`; resolución sintética: `moderation.test.mjs`. Archivar navegación privada pública antigua. |
| Bloqueo anónimo de gestión/moderación | `browser-auth.mjs`, `moderation-routes.test.mjs`, `course-routes.test.mjs`. |
| Catálogo persistente disponible/error sin fixtures | `browser-persistent-catalog.mjs`, pruebas `persistent-*`. |

## Ejecución habitual

Con servidor **local** ya iniciado y catálogo público disponible:

```sh
WIKI_TEST_BASE_URL=http://127.0.0.1:3103 pnpm test:browser
```

Enumera explícitamente las seis suites vigentes: Auth, materiales, catálogo, favoritos, aportes y catálogo persistente en modo `public`. No usa `browser-*.mjs`, no incluye runners históricos ni QA autenticada. Se detiene ante el primer runner fallido.

El modo de caída se ejecuta por separado únicamente en un servidor local deliberadamente sin catálogo; no retirar tablas ni interrumpir Supabase para forzarlo:

```sh
WIKI_CATALOG_QA_MODE=error WIKI_TEST_BASE_URL=http://127.0.0.1:3102 node tests/browser-persistent-catalog.mjs
```

## Evidencia conservada

Las fuentes completas y el resumen duradero se conservan; los logs originales siguen en `/tmp/opencode/wiki-hito22-fix-browser-{courses,moderation}.log`. Los reportes originales estaban en `.next/qa-courses-evidence/browser-report.json` y `.next/qa-moderation-evidence/report.json`: son artefactos efímeros que el build puede limpiar y no se regeneran con los runners retirados. Retirar un runner no convierte esa ejecución fallida en aprobada.

Resultado histórico conservado: **courses 42 PASS/20 FAIL**, sin errores JS/red ni endpoints de envío; **moderation falla antes de checks** en `page ready /moderacion`, por login obligatorio. Los 20 checks fallidos de courses fueron: validación regular, creación/edición electiva, navegación con ramo local recién creado, creación regular en semestre 5, archivo/restauración de Cálculo, reclasificación de Cálculo, aislamiento en otra pestaña, foco de gestión/favoritos, recarga del catálogo local, disposición móvil de acciones, y diez variantes responsive de gestión (365/375/768/1280/1440 px × claro/oscuro). Los fallos de creación provocaron prerrequisitos ausentes en los casos posteriores; no son 20 defectos independientes del producto. El caso público **Todas** y las 40 variantes responsive de electivos/favoritos/semestre/materiales sí pasaron, junto con la comprobación final de errores/solicitudes. `QA_HITO_2_2.md` conserva el contexto y los comandos de esa ejecución.
