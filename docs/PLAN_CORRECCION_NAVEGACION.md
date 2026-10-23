# Corrección de navegación y prerenderizado — Hito 2.1

## Alcance y riesgos

Conservar los cambios de cuentas existentes, sin modificar Supabase remoto, SQL,
autorización, dependencias ni configuración global. Riesgos: perder enlaces por rol
o ejecutar Auth durante el prerenderizado de la cabecera pública.

## Plan

- [x] Investigar composición de enlaces, llamadas de sesión y recomendaciones Next/Supabase.
- [x] Añadir regresiones ejecutables de navegación por perfil y límite por solicitud.
- [x] Corregir únicamente `src/components/layout/site-header.tsx` en la aplicación.
- [x] Ejecutar suite, lint, build y Chromium disponible; documentar límites.

Archivos previstos: cabecera, `tests/header-navigation.test.mjs`, prueba de navegador
de cuentas existente y documentación de esta corrección. No se necesitan subagentes
de implementación para un cambio localizado; revisión de seguridad independiente al finalizar.

## Causas y solución

1. `navigationLinks` y `accountLinks` incluían `/favoritos`. Su concatenación
   duplicaba el destino para student/moderator/admin, no para visitantes.
   Se elimina la segunda declaración, conservando el enlace público DEMO y
   las claves estables por `href` en `MobileNavigation` (no requiere cambios).
2. `RootLayout → SiteHeader → AccountContent → getAccount → createClient →
   getClaims` alcanzaba el reloj interno de Supabase Auth durante prerenderizado.
   `Suspense` ya existía, pero por sí solo no declara que una operación de terceros
   depende de la solicitud. El adaptador obtiene `cookies()`, pero su lectura
   `store.getAll()` se difiere al callback del SDK; eso no garantiza delimitar
   todo el trabajo interno de Auth antes de leer el reloj.
   Se añade `await connection()` antes de `getAccount()` en `AccountContent`,
   dentro del `Suspense` existente. Marca únicamente esa rama por solicitud;
   logo, navegación pública, tema y contenido público conservan su shell estático.
   No se cachean cuentas, no se cambian permisos ni se desactivan optimizaciones.

El error se reprodujo en el servidor de desarrollo existente (`localhost:3000`);
el build previo no lo detectaba. Después, Chromium comprobó `/`, `/semestres/1`
y `/ramos/calculo-i` en desarrollo sin errores de consola.

Referencias consultadas:
- https://nextjs.org/docs/messages/next-prerender-current-time
- https://nextjs.org/docs/app/api-reference/functions/connection
- https://supabase.com/docs/guides/auth/server-side/nextjs

## Archivos modificados por esta corrección

- `src/components/layout/site-header.tsx`: límite por solicitud y eliminación del enlace redundante.
- `tests/header-navigation.test.mjs`: ejecuta la cabecera con límites Next/SDK
  sustituidos; comprueba destinos de los cuatro perfiles y que Auth espere a la solicitud.
- `tests/browser-auth.mjs`: menú único, Escape/foco y ausencia de avisos React/prerender.
- `tests/browser-favorites.mjs`: esperar contenido visible no ocupado al navegar;
  el test inicial encontraba controles de un árbol oculto durante Suspense y fallaba
  al pulsarlos, con tres fallos posteriores en cascada. Repetición: 7/7.
- Este documento.

## Resultados y reproducción — 2026-10-22

Servidor de producción local de prueba: `pnpm start --hostname 127.0.0.1 --port 3101`.
El servidor de desarrollo del usuario no se detuvo ni reinició.

| Comando | Resultado |
| --- | --- |
| `node --test tests/header-navigation.test.mjs` antes/después | Antes: visitante pasa y cuatro regresiones fallan; después: 5/5 |
| `pnpm lint` | Correcto |
| `pnpm build` | Correcto; 40 páginas, `/` conserva prerenderizado parcial `◐` |
| `pnpm test` | 121 pasan, 9 HTTP omitidas por falta de URL |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3101 pnpm test` | 183 pasan, 0 fallan, 0 omitidas |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3101 node tests/browser-auth.mjs` | 25/25; consola y red sin errores |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3101 node tests/browser-catalog.mjs` | 26/26; consola y red sin errores |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3101 node tests/browser-favorites.mjs` | 7/7 tras corregir la espera del test |

Chromium: formularios públicos, validación nativa sin envíos, catálogo, menú móvil,
rutas privadas anónimas, navegación y filtros, favoritos locales y recarga/otra
pestaña, teclado/foco, contraste y claro/oscuro. Catálogo/favoritos revisados a
375/768/1280/1440 px; formularios a 375/1440 px. Capturas revisadas de portada y
registro móvil oscuro. Evidencia local (ignorada por Git):
`.next/qa-auth-evidence/report.json`, `.next/qa-evidence/browser-report.json`,
`.next/qa-favorites-evidence/report.json` y `.next/qa-navigation-dev/`.

Registro, login, logout, roles actuales y renovación de cookies están probados
con dobles del SDK en la suite. **No se iniciaron sesiones reales ni se registraron
usuarios**: no se proporcionaron cuentas de prueba y no se modificó Supabase remoto.
Persistencia de sesión Auth real y navegación autenticada por rol en Chromium
quedan pendientes de validación manual con cuentas existentes. Los cuatro roles
sí se verifican en la composición real de la cabecera mediante pruebas locales.

Advertencias existentes no bloqueantes de la suite: Node `MODULE_TYPELESS_PACKAGE_JSON`
y PDF.js al probar un archivo corrupto. Revisión independiente de seguridad sin
hallazgos atribuibles al cambio. Sin commits, push, cambios SQL ni avance a Hito 2.2.
