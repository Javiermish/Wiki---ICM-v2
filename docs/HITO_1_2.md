# Hito 1.2 — Catálogo académico

## Alcance

Navegación pública local con fixtures: Inicio → semestre curricular → ramo →
categoría y filtros académicos. Se conserva el diseño aprobado del Hito 1.1,
sin cambios de tokens, header, tipografía ni arquitectura de temas.

**Los ejemplos, códigos y ubicaciones son ficticios; no constituyen la malla
oficial de la UdeC.** No se conectan servicios externos ni se añaden archivos.

## Rutas y navegación

- `/semestres/[semestre]`: semestres declarados en `demoSemesters` (1–4).
  Búsqueda local GET `q` por nombre/código, normalizada sin tildes ni mayúsculas.
  Incluye ramos aunque no tengan materiales. Semestre 4 es un vacío válido;
  segmentos desconocidos o inválidos devuelven 404.
- `/ramos/[slug]`: datos del ramo, breadcrumbs al semestre curricular,
  categorías enlazadas, filtros y tarjetas reutilizadas. Slug desconocido: 404.
- Enlaces de categoría con semántica de navegación y `aria-current`; no se
  presentan como tabs ARIA con un patrón de teclado incompleto.
- No hay enlaces de descarga, archivos ficticios ni pantallas de documento.

Los segmentos válidos se enumeran con `generateStaticParams`. En Next.js 16.4.2
con Cache Components se usa `unstable_paramMatching: { parámetro: "not-found" }`
para rechazar los demás **antes** del streaming y devolver HTTP 404 real.
`dynamicParams = false` no es compatible con esa configuración. Las pruebas
HTTP protegen este comportamiento ante futuras actualizaciones de Next.js.

## Contrato URL del ramo

```text
/ramos/calculo-i?tipo=certamenes&anio=2024&periodo=2&numero=2
```

| Parámetro | Valores |
| --- | --- |
| `tipo` | `listados`, `apuntes`, `certamenes`; predeterminado: Listados |
| `anio` | Entero entre 1900 y 2100 |
| `periodo` | Semestre académico `1` o `2` |
| `numero` | Entero entre 1 y 999; opcional |

Los filtros se combinan con AND, se conservan al recargar/compartir y no cambian
el semestre curricular del ramo. Cambiar categoría conserva los demás filtros;
limpiar restaura la categoría actual sin restricciones de período o número.
Por el requisito de este hito, los selectores actualizan resultados al cambiar,
sin mover el scroll; el texto de ayuda lo anuncia. El botón «Aplicar filtros» se
conserva como envío explícito y fallback del formulario GET sin JavaScript.
Las opciones se calculan sobre materiales aprobados del ramo/categoría, no sobre
la combinación actual, para evitar opciones que desaparecen al filtrar.

Parámetros desconocidos se ignoran. Los conocidos repetidos, mal formados o
fuera de rango muestran un resumen de errores sin resultados. Un valor válido
sin coincidencias muestra un estado vacío, no un error del servidor.

La portada conserva sus parámetros anteriores (`category`, `year`, `term`,
`number`, `curricularSemester`, `q`). El adaptador del ramo reutiliza su validación
sin admitir cambios del semestre curricular desde la query.

## Dominio y aislamiento

- `Course.curricularSemester` ubica el ramo; `CourseOffering.academicYear` y
  `academicTerm` describen cuándo se utilizó el material.
- Cálculo I pertenece al curricular 1 y tiene **Certamen 2 - 2024-2**.
- El nombre se genera desde categoría/número/edición, nunca desde el nombre
  original ni la fecha de subida.
- Dos materiales de ese número/período coexisten con IDs distintos y etiquetas
  secundarias de sección y versión. El título público no es clave única.
- `approvedMaterials` excluye estados no aprobados antes de proyectar metadatos.
  Búsqueda, conteos, facetas y `publicMaterialById` comparten esa frontera.
- Los fixtures pendientes/rechazados incluyen año/números y marcadores exclusivos
  para detectar fugas en tests. No se serializan fixtures brutos al cliente.
- La prueba de acceso a IDs privados exige 404 y ausencia de metadatos del
  catálogo. Next.js puede reflejar el propio segmento solicitado en el estado
  del router: eso no implica haber resuelto un material privado.
- El código del ramo puede ser nulo. Geometría ilustra un ramo sin código ni
  materiales; sigue teniendo las tres categorías navegables.

Esto no reemplaza autorización servidor/RLS cuando se conecten datos reales.

## Pruebas reproducibles

```bash
pnpm lint
pnpm test
pnpm build
pnpm start --hostname 127.0.0.1 --port 3100
# En otra terminal:
WIKI_TEST_BASE_URL=http://127.0.0.1:3100 pnpm test
```

Se usa `node:test` existente, sin dependencias nuevas. TypeScript permite imports
con extensión `.ts` para compartir helpers puros entre Next.js y las pruebas
nativas de Node (22.18+), manteniendo `noEmit`.

### Recorridos

1. Inicio → Explorar semestre 1 → Cálculo I → Certámenes.
2. Año 2024 + semestre académico 2 + número 2: dos versiones del mismo nombre;
   curricular 1 no cambia. Recargar y compartir conserva todos los filtros.
3. Cambiar entre categorías; limpiar filtros; atrás/adelante.
4. `/semestres/1?q=DEMO-C1`, `?q=calculo`, `?q=sin-coincidencias`.
5. `/semestres/4`, `/ramos/geometria?tipo=certamenes` y combinación sin coincidencias.
6. `/semestres/abc`, `/semestres/5`, `/ramos/no-existe`: 404.
7. `/ramos/calculo-i?periodo=3`, `?numero=1&numero=2`: errores sin materiales.
8. Buscar texto privado, solicitar IDs privados y comprobar que no hay opciones
   privadas en el HTML/RSC o los bundles del cliente.
9. Teclado: salto al contenido, breadcrumbs, semestres/categorías, filtros,
   búsqueda y limpieza. Todos con nombre accesible y foco visible.
10. Claro/oscuro a 375, 768 y 1280 px: sin desbordes, controles utilizables,
    nombres completos, menú móvil y estado seleccionado reconocible.

## Validación de la entrega

- `pnpm lint`: correcto.
- `pnpm build`: correcto; portada y 10 rutas de ejemplo prerenderizadas parcialmente,
  más 404 e icono. Se conserva la configuración existente de Next.js.
- `pnpm test`: 35 correctas, 2 suites HTTP omitidas sin servidor.
- `WIKI_TEST_BASE_URL=http://127.0.0.1:3101 pnpm test`: **55 correctas, 0 fallos,
  0 omitidas**. Incluye HTML, respuestas 404, estado de selección al volver a
  solicitar una URL, contenido RSC y scripts públicos sin marcadores privados.
- Contraste de tokens y lógica del tema: pruebas existentes pasan en ambos temas.
- `pnpm exec tsc --noEmit --incremental false` y `git diff --check`: correctos.
- Una primera prueba detectó respuestas 200 al renderizar 404 dentro de Suspense;
  se corrigió con el conjunto explícito de parámetros descrito arriba. También se
  ajustó una expectativa textual del estado vacío y se reforzaron los asserts de
  selección por campo y de privacidad de bundles.
- Auditoría final de seguridad: sin hallazgos confirmados; 33 comprobaciones HTTP,
  7 peticiones RSC, 9 scripts públicos y 2 consultas XSS revisadas. Overrides de
  estado/ID no dan acceso a material no aprobado; también hay 404 real en RSC.

QA localizó Chromium en la caché existente de Playwright, aunque no estaba en
PATH ni había un runner instalado. Se añadió `tests/browser-catalog.mjs` con CDP
y WebSocket nativo de Node, **sin dependencias nuevas**. Admite `WIKI_CHROME_PATH`
y descubre instalaciones locales en caché sin hardcodear un usuario o versión.

- Chrome for Testing 156.0.8078.4 con sandbox habilitado: **22/22 comprobaciones**.
- Clicks Inicio → Semestre 1 → Cálculo I → categorías; selectores mediante teclas
  nativas, combinación de filtros, recarga, limpieza, atrás/adelante y cambios rápidos.
- Búsqueda con escritura/Enter; vacíos, alertas y búsqueda privada sin resultados.
- Tab, salto al contenido, foco visible, menú móvil con Enter/Escape y retorno del foco.
- Tema por teclado y persistencia tras recargar.
- Semestre y ramo a **375, 768 y 1280 px en ambos temas**: sin overflow horizontal.
- **13 capturas inspeccionadas**, sin defectos visuales bloqueantes observados.
- Cero errores JS/hidratación y cero fallos de recursos.
- Contraste de texto opaco muestreado en estilos renderizados: sin incumplimientos;
  mínimo observado 5,75:1. No es una certificación WCAG completa.

Reproducir con el servidor iniciado:

```bash
WIKI_TEST_BASE_URL=http://127.0.0.1:3101 node tests/browser-catalog.mjs
```

Informe y capturas en `.next/qa-evidence/`: `browser-report.json`,
`visual-review.md`, `semestre-{375,768,1280}-{light,dark}.png`,
`ramo-{375,768,1280}-{light,dark}.png` y `mobile-menu-keyboard-focus.png`.
Es evidencia local ignorada por Git: el runner regenera JSON y capturas; la nota
visual se mantiene manualmente. Un nuevo build limpia esta evidencia. Perfiles, HOME,
XDG y temporales del navegador permanecen dentro de `.next/qa-browser-profile/`;
se cierra solo el proceso Chrome propio, nunca el servidor ni perfiles del usuario.

**Límites conocidos:** un motor Chromium; no se probaron Safari/Firefox, lector
de pantalla ni dispositivos táctiles reales. La política `unstable_paramMatching`
es específica de la versión actual de Next.js y debe revalidarse al actualizar.

Node conserva el aviso informativo `MODULE_TYPELESS_PACKAGE_JSON` de las pruebas
TS nativas. No es un fallo ni se cambió el formato del paquete para ocultarlo.

## Archivos de esta entrega

### Creados
- `src/app/semestres/[semestre]/page.tsx` y `loading.tsx`.
- `src/app/ramos/[slug]/page.tsx` y `loading.tsx`.
- `src/app/not-found.tsx`.
- `src/components/catalog/category-navigation.tsx`.
- `src/components/catalog/course-card.tsx`.
- `src/components/catalog/course-filters.tsx`.
- `src/components/catalog/local-course-search.tsx`.
- `src/components/catalog/semester-navigation.tsx`.
- `src/lib/catalog/course-filters.ts`.
- `tests/academic-catalog.test.mjs` y `tests/academic-routes.test.mjs`.
- `tests/browser-catalog.mjs`: recorrido CDP reproducible y capturas sin dependencias.
- `docs/HITO_1_2.md`.

### Modificados
- `src/domain/catalog.ts`: código nullable, sección/versión públicas opcionales.
- `src/fixtures/catalog.ts`: duplicados, ramo sin documentos y casos no aprobados.
- `src/lib/catalog/query.ts`: consulta local de ramos, materiales/facetas por ramo y lookup público por ID.
- `src/components/catalog/semester-section.tsx` y `material-card.tsx`: navegación real a las nuevas rutas y distinción de versiones.
- `src/components/layout/site-footer.tsx`: solo rótulo de versión «Hito 1.2», sin cambios de diseño.
- `tests/catalog.test.mjs` y `tests/routes.test.mjs`: fixtures ampliados y nuevo alcance.
- `tsconfig.json`: imports TS para pruebas nativas compartidas.
- `README.md`, `docs/MODELO_DOMINIO.md` y nota histórica en `docs/HITO_1_1.md`.

Se preservan los cambios previos del Hito 1.1. No se modifican header, layout,
tokens, tipografía, configuración de Next.js, dependencias ni lockfile de ese hito.

## Fuera de alcance

Supabase, autenticación, Storage, aportes, moderación, favoritos, visor PDF y
descargas reales. **No se inicia el Hito 1.3 sin aprobación.**
