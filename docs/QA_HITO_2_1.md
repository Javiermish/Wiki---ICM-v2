# QA Hito 2.1 — cuentas y rutas protegidas

## Corrección de prerenderizado Auth (2026-10-23)

**Causa:** con `cacheComponents: true`, las páginas protegidas ejecutaban `requireAccount`/`requireRole` → `getAccountResult` → Supabase Auth durante el intento de prerenderizado. El SDK utiliza `Date.now()` para gestionar sesiones; `Suspense` por sí solo no establece que esa lectura deba esperar una petición. La cabecera ya tenía `connection()`, pero su frontera no protege los árboles hermanos de las páginas. El `catch` general del helper tampoco debe interceptar las señales de control de Next.

**Cambio mínimo:** `src/lib/auth/session.ts` espera `await connection()` antes de crear el SDK y fuera de `try/catch`. Así cubre moderación, usuarios, cuenta, mis aportes, restablecimiento y demás consumidores del helper, sin repetir cambios en cada página. Se conservan sus fronteras `Suspense` con estados accesibles, verificación Auth/correo, rol actual de DB y denegación cerrada ante errores. No hay `use cache` privado, cambios RLS, migraciones, configuración Supabase ni modificaciones remotas. `/favoritos` no consulta sesión: sigue pública/local. Las páginas públicas conservan el shell parcialmente prerenderizado; solo la cabecera personalizada espera sesión.

### Resultados comprobados

Producción local `http://127.0.0.1:3110`:

| Comando | Resultado |
| --- | --- |
| `node --test tests/auth-session.test.mjs` antes del arreglo | Regresión roja: el SDK se inicializaba antes de recibir la petición (`1 !== 0`) |
| `node --test tests/auth-session.test.mjs tests/header-navigation.test.mjs` después | 13/13; incluye cuatro subcasos de roles |
| `pnpm lint` | PASS |
| `pnpm build` | PASS; 40 páginas generadas, sin error de prerenderizado; shell público parcial conservado |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3110 pnpm test` | **189/189**, cero fallos/omisiones |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3110 node tests/browser-auth.mjs` | **26/26**, cero omisiones; Chromium con sandbox |
| `git diff --check` | PASS para cambios versionados; los archivos Auth previamente no versionados también pasan lint/build |

Pruebas nuevas: espera antes de inicialización SDK y propagación intacta de interrupción de Next; matriz de permisos representativa con SDK/DB dobles sobre los helpers reales:

| Actor | `/moderacion` | `/admin/usuarios` | Cuenta / mis aportes / restablecer |
| --- | --- | --- | --- |
| Visitante | Login con `next` | Login con `next` | Login con `next` |
| Estudiante | Cuenta con acceso denegado | Cuenta con acceso denegado | Permitido |
| Moderador | Permitido | Cuenta con acceso denegado | Permitido |
| Administrador | Permitido | Permitido | Permitido |

HTTP comprueba ausencia de contenido protegido en HTML/RSC anónimo. Chromium verifica URLs privadas directas, redirección y recarga del destino login; además, clic en el `Next Link` real del footer a moderación conserva el documento y redirige a login sin mostrar colas. Se mantienen los checks de validación, contraste muestreado, foco, navegación móvil y 375/1440 px en ambos temas. **Cero errores JS, avisos de consola/Blocking Route, fallos de red o solicitudes inesperadas en producción.** Captura `login-375-light.png` abierta e inspeccionada. Evidencia: `.next/qa-auth-evidence/report.json` y PNG. Revisión especializada de seguridad sin bloqueantes.

### Límites y fallo adicional no ocultado

- Los cuatro roles se verificaron con dobles representativos; **no se usaron sesiones reales student/moderator/admin**. Su navegación autenticada, recargas, cookies y RLS remotos siguen pendientes de comprobar con cuentas autorizadas. No se enviaron logins/registros ni se modificó la DB remota.
- Intento adicional sobre el servidor de desarrollo existente `:3000`: cinco URLs privadas redirigieron correctamente y favoritos siguió público, sin diagnóstico `Date.now`/Blocking Route observado. La comprobación de navegación interna **no terminó**: timeout esperando hidratación del enlace y 14 errores WebSocket HMR `ERR_INVALID_HTTP_RESPONSE`. Evidencia `/tmp/opencode/wiki-auth-dev-evidence/report.json`. No se certifica esa pasada ni se reinició/configuró el servidor ajeno; producción local completó el recorrido equivalente.
- Persisten advertencias preexistentes Node `MODULE_TYPELESS_PACKAGE_JSON` en las pruebas y la advertencia esperada PDF.js de la muestra corrupta; no fallan assertions. No se amplía a Hito 2.2 ni se realizan commits/push.

Archivos de esta corrección: `src/lib/auth/session.ts`, `tests/auth-session.test.mjs`, `tests/browser-auth.mjs`, `docs/PLAN_PRERENDER_AUTH.md` y este informe. Se preservan los demás cambios previos sin commit.

## Última corrección: Auth confirmado con tablas de aplicación ausentes

Producción local **3106**: `pnpm lint`/`pnpm build` correctos; **178/178** tests con HTTP, sin omisiones; **24/24** checks browser auth, incluidos mensajes distintos de perfil/DB y correo sin confirmar en 375/1440 px y ambos temas. Captura `profile-error-375-light.png` abierta e inspeccionada; sin desbordes ni errores inesperados de runtime/red. Las nuevas pruebas de login usan dobles SDK/DB para reproducir Auth correcto con `PGRST205`, `42P01`, `42501`, filas ausentes o rol inválido; no conceden rol de respaldo y no hacen logout de sesión válida por error de perfil. Revisión de seguridad sin blockers.

SQL local: `0002` se ejecutó dos veces sobre PostgreSQL real 18.4, con 12 aserciones y 2 denegaciones esperadas; suite original completa también correcta. Triggers/grants/RLS reales; Auth fue esquema mínimo doble, no servicio Supabase. Se preservó la cuenta local preexistente y todos sus campos. Ver `AUTH_SQL.md` y `.next/sql-backfill/run.log`.

**Pendiente remoto:** el usuario debe revisar y aplicar manualmente `0001` una sola vez y `0002` después; verificar conteos/RLS/grants/trigger y login real del usuario confirmado. No se ejecutaron migraciones ni se accedió a usuarios/configuración remotos. El diagnóstico sobre `public` vacío proviene de la comprobación comunicada por el usuario. Los bloques siguientes conservan evidencia histórica, no sustituyen esta validación externa pendiente.

## Corrección posterior: callback de confirmación SSR

Producción local 3105: `pnpm lint` y `pnpm build` correctos; suite con HTTP **176/176** y navegador auth **20/20**. Se añadieron pruebas OTP `type=email`, PKCE exclusivo (sin segunda verificación OTP), rechazo de entradas ambiguas/tokens consumidos, HEAD sin consumo y mensaje de sesión ya verificada sin aceptar enlace inválido. Se reprodujo y corrigió un redirect de `127.0.0.1` a `localhost` que separaba cookies: ahora `Location` relativo conserva origen. La evidencia auth en `.next/qa-auth-evidence` corresponde a esta pasada; otras suites visuales no se repitieron para esta corrección acotada. Sin pruebas de OTP/correo real contra Supabase ni modificaciones remotas. El resultado 3103 siguiente queda como evidencia histórica del hito completo.

## Resultado final integrado: producción 3103 (2026-10-22)

Ejecutado por el coordinador tras estabilizar la cabecera (tema/navegación fuera del Suspense de cuenta):

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm build` | PASS |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3103 pnpm test` | **163/163**, sin omitidos |
| `node tests/browser-auth.mjs` (misma base) | **20/20**, 37 capturas |
| `node tests/browser-catalog.mjs` | **26/26** |
| `node tests/browser-favorites.mjs` | **7/7** |
| `node tests/browser-courses.mjs` | **62/62** |
| `node tests/browser-materials.mjs` | **41/41** |
| `node tests/browser-contributions.mjs` | **26/26** |
| `git diff --check` | PASS |

Navegador: **182 comprobaciones finales correctas**, sin errores inesperados JS/red. Los artefactos en `.next/qa-*-evidence` corresponden ahora a 3103. Se abrió la captura final `registro-1440-dark.png` y se revisaron previamente móvil claro y escritorio oscuro. No se verificaron pantallas autenticadas con cuentas reales.

Hubo fallos intermedios reales que no se ocultan: en 3102 courses 60/62 y luego 59/62 (cambio de tema durante sustitución de cabecera y fallos en cascada); materials 40/41 (medición transitoria de control). Se mantuvo el tema fuera de la región de sesión y se esperó hidratación visible en el driver, sin relajar tamaños/roles/autorización. Las repeticiones finales 3103 anteriores están verdes; materials se repitió sin cambiar sus assertions.

SQL: migración y pruebas ejecutadas por backend en PostgreSQL real 18.4 local con esquema Auth mínimo de prueba, **no Supabase completo**; ver `AUTH_SQL.md`. Dos revisiones estáticas de seguridad sin blockers. Continúan pendientes los flujos con correo/sesiones reales, configuración remota y evaluación de las vistas autenticadas.

## Histórico: pasada de producción 3102

**Auth 20/20, favoritos 7/7 y catálogo 26/26**, todos contra `http://127.0.0.1:3102`; 37 + 19 + 17 capturas respectivamente. Sin errores JS ni fallos de red en auth/catálogo, sin llamadas externas o mutaciones observadas por auth/favoritos. Auth ejercitó las 12 combinaciones y 12 casos de validación sin skips. Contraste de texto muestreado: mínimo auth 5.75:1, sin incumplimientos.

- Auth: `17:55:20–17:55:31 UTC`; catálogo: `17:56:18–17:56:30 UTC`. Los JSON/PNG en `.next` ahora corresponden a **3102**, reemplazando los de 3101.
- Abiertas con `read` las nuevas capturas `login-375-light.png`, `registro-1440-dark.png`, `registro-1440-dark-invalid.png` y `semestre-375-light.png`. Sin recortes/desbordes apreciados; footer ya dice `Moderación · acceso restringido` y `Hito 2.1`; registro visible en cabecera de escritorio. Hallazgo P2 de copy del footer **resuelto en 3102**.
- Primer intento 3102 auth: 8/20 fallidos por carreras SSR/hidratación o contrato actualizado de login. El intento inicial de catálogo agotó el timeout de la invocación conjunta tras fallar el cambio de tema; no se presenta como ejecución completa. Tras preparación condicional, la repetición aislada terminó 26/26.
- `browser-auth.mjs` y `browser-catalog.mjs` ahora esperan un único botón de tema visible con handler React instalado, `aria-pressed` sincronizado y sin contenedores de reemplazo Suspense pendientes. Evita clicar el fallback que aún carece de handlers o está a punto de sustituirse. La espera usa las propiedades de hidratación de la versión React instalada; al actualizar React, revisar este detalle interno si cambia. No es evidencia de que clicar durante hidratación sea infalible: se evalúa la página interactiva estable.
- Único conteo ajustado del legado: categorías **visibles** exactamente tres (antes incluía duplicados ocultos de streaming). Se conservan conteos de resultados, filtros, estados vacíos y assertions de seguridad. No se modificó app/SQL ni `browser-driver.mjs` desde QA.
- Login ya permite contraseñas existentes de un carácter; la prueba usa contraseña **vacía** para el error nativo, y registro conserva el caso de contraseña corta. Nunca se intenta login válido. El guard anti-submit sigue activo y cada caso comprueba cero eventos submit.
- Lint final de los tres runners tocados: `pnpm exec eslint tests/browser-auth.mjs tests/auth-routes.test.mjs tests/browser-catalog.mjs`, correcto; sintaxis y `git diff --check` del legado correctos.

**Límite histórico:** esta pasada no incluía la cabecera final. La repetición 3103 ya se realizó y figura al comienzo. Los resultados 3101 siguientes son históricos, no el estado actual de la batería.

## Histórico: primera ejecución 3101 (2026-10-22)

**Evaluación parcial, no certificación de Auth/Supabase ni del build final.** Se probó el servidor de producción existente `http://127.0.0.1:3101`. El responsable informó después cambios de cabecera SSR/menú por rol y paginación; estas modificaciones **no estaban en ese build**. Repetir la batería contra el nuevo servidor 3102 antes de cerrar el hito. No se inició/reinició ningún servidor ni se ejecutó build desde QA. 3100 se descartó por aviso del responsable (build previo incompatible con sus chunks).

Archivos creados por QA: `tests/browser-auth.mjs`, `tests/auth-routes.test.mjs` y este informe. En la pasada 3102 se modificó además únicamente el runner legado `tests/browser-catalog.mjs`. Sin cambios de app, SQL, dependencias, permisos o Git commits.

## Pruebas ejecutadas

| Comando (base 3101) | Resultado real | Alcance |
| --- | --- | --- |
| `node --check tests/browser-auth.mjs` y `node --check tests/auth-routes.test.mjs` | Correcto | Sintaxis de runners |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3101 node --test tests/auth-routes.test.mjs` | 13/13 | GET HTTP reales anónimos; páginas públicas y cinco destinos privados |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3101 node tests/browser-auth.mjs` | 20/20; 37 capturas | Chromium real, sandbox habilitado; sin errores JS, fallos de red, llamadas externas ni mutaciones observadas |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3101 node tests/browser-favorites.mjs` | 7/7; 19 capturas | Favoritos DEMO locales, persistencia, teclado, datos corruptos y almacenamiento bloqueado |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3101 node tests/browser-catalog.mjs` | **16/26; 10 fallos** | Regresión legado: resultados detallados abajo, no declarar verde |
| `WIKI_TEST_BASE_URL=http://127.0.0.1:3101 node --test tests/auth*.test.mjs` | 25/25 | Incluye los 13 HTTP; el resto mezcla funciones reales, dobles SDK y lectura estática de fuentes |
| `pnpm exec eslint tests/browser-auth.mjs tests/auth-routes.test.mjs` | Correcto | Lint acotado a archivos nuevos |

No se repitieron `pnpm lint` global ni `pnpm build`: el responsable coordina el build y pidió no reconstruir durante QA. Node emitió advertencias `MODULE_TYPELESS_PACKAGE_JSON` en tests TypeScript existentes; no son fallos de assertions.

### Evidencia reproducible

- Auth: `.next/qa-auth-evidence/report.json` y PNG. La ejecución histórica contra 3101 fue 17:47:30–17:47:42 UTC; sus artefactos fueron reemplazados por la pasada 3102 descrita arriba.
- Catálogo legado: `.next/qa-evidence/browser-report.json`, capturas y estados en el momento de fallo.
- Favoritos: `.next/qa-favorites-evidence/report.json` y capturas.
- Abiertas e inspeccionadas visualmente: `login-375-light.png`, `registro-375-dark.png`, `recuperar-contrasena-1440-light.png`, `registro-1440-dark-invalid.png` y `login-confirmation-error.png` (esta última se regeneró tras añadir espera de cabecera).

### Cobertura auth nueva

- `/login`, `/registro`, `/recuperar-contrasena`: 375 y 1440 CSS px × claro/oscuro (12 combinaciones). No overflow horizontal ni elementos de `main` fuera del viewport; etiquetas asociadas, IDs únicos, autocomplete y foco visible por Tab. Emulación de viewport en Chromium, no dispositivo físico.
- 12 ejercicios de validación nativa: vacío, correo mal formado y contraseña corta cuando corresponde; Enter lleva al primer campo inválido. Se comprueba `validity`/`validationMessage`, no se finge respuesta del servidor.
- Un listener de seguridad en captura impide que cualquier evento `submit` llegue a React/servidor. Los casos inválidos ni siquiera dispararon `submit` (contador cero). No se enviaron registros, recuperaciones o login válidos. El único correo sintético usado para probar longitud de contraseña está en el dominio reservado `.invalid`.
- Estado visual genérico `/login?error=confirmation` con `role=alert`. Esto prueba la representación del mensaje, **no** consumo de OTP real ni anuncio mediante lector de pantalla.
- Contraste de muestras opacas de texto calculadas con estilos renderizados (canvas interpreta colores modernos): todas cumplen AA, mínimo observado 5.75:1. No cubre contraste de todos los bordes/iconos, globos de validación del navegador ni tecnologías asistivas.
- `/restablecer-contrasena`, `/mi-cuenta`, `/mis-aportes`, `/moderacion`, `/admin/usuarios`: navegación anónima termina en `/login?next=…`, sin controles/contenido privado seleccionado en DOM. HTTP acepta Location 303/307/308 o HTTP 200 con **meta refresh ejecutable a login**, no un 200 arbitrario. Se comprueban marcadores privados ausentes también del HTML/RSC recibido.
- Inicio → semestre → ramo siguen disponibles sin sesión. Favoritos siguen demostración local, no persistencia de cuentas.
- Si falta configuración de Auth, el runner verifica aviso honesto y controles deshabilitados, y registra la validación como omitida. En 3101 **los campos estaban habilitados y no hubo skips**; esto no demuestra que Supabase remoto esté operativo.

## Hallazgos priorizados y reproducción

### P2 histórico — Copy del footer contradice protección de moderación (resuelto en 3102)

1. Abrir `/login` o `/registro`, desplazarse al footer.
2. Leer `Moderación · demo pública` y `Prototipo · Hito 1.5`.
3. Abrir moderación: exige login correctamente.

Esperado: diferenciar workspace de moderación DEMO de **acceso restringido**; actualizar la referencia histórica si describe el estado actual. No se observó acceso privado sin sesión. Evidencia: capturas móvil/escritorio de auth. Fuente no modificada por QA; corregido por el responsable y verificado visualmente en 3102.

### P2 — Batería browser-catalog legado no es compatible con todos los estados de streaming actuales

Reproducir: `WIKI_TEST_BASE_URL=http://127.0.0.1:3101 node tests/browser-catalog.mjs`.

10 fallos observados:

- Estado vacío Geometría: la assertion exige exactamente tres enlaces de categoría mediante `querySelectorAll` sin filtrar visibilidad. Estado de fallo ya muestra cero tarjetas y texto de categoría vacía, pero hay controles duplicados transitorios en streaming. **No confirmado como regresión funcional**; requiere esperar fin de sustitución de Suspense y contar controles visibles.
- Menú móvil: intenta enfocar `Tema oscuro` mientras la cabecera dice `Cargando navegación…`.
- Cinco fallos de tema por `visible click target button[aria-label="Tema oscuro"]` ausente durante fallback SSR (375 oscuro semestre/ramo, 768 oscuro semestre, 1440 claro semestre/ramo; más el menú descrito arriba).
- Tres fallos de visibilidad del menú en medición responsive: semestre 375 claro y semestre/ramo 768 claro (espera `menuVisible=true`, observa false durante transición). No falló la assertion previa de overflow en esos casos.

La lista equivale a 1 vacío + 1 menú + 5 cambios de tema + 3 responsive = 10. El runner auth nuevo espera a que el botón de tema esté visible y sincronizado con el tema antes de interactuar; tras añadir esa espera pasó 20/20. En esta pasada histórica aún no se había modificado el runner legado; luego se ajustaron solo sus esperas/conteo visible, sin suavizar controles de autorización. Se deben separar fallos de espera del runner de defectos reales de UI y repetir después del build coordinado.

### P3 — Evaluación visual de mensajes nativos oscura incompleta

El foco y `validationMessage` existen; la captura headless del globo nativo de contraseña corta en oscuro no permite certificar legibilidad. Confirmar interactivamente en navegador normal/lector de pantalla. No clasificar el globo del user-agent como contraste AA de los mensajes de servidor propios.

## Dobles vs sistemas reales

- **Reales:** GETs al servidor Next, redirects ejecutados por Chromium, inputs nativos, Tab/Enter, layout/tema, catálogo fixtures y localStorage. El guard anti-submit es instrumentación de seguridad, no un backend de autenticación simulado.
- **Dobles:** `auth-flows.test.mjs` y `auth-session.test.mjs` comprueban orquestación mediante SDK sustituido. Su éxito no demuestra entrega de correo, cookies emitidas por Supabase, confirmación, renovación o permisos PostgreSQL reales.
- **Estáticos:** `auth-ui.test.mjs` inspecciona fuentes. Los helpers de `auth.test.mjs` prueban validaciones/allowlist locales. No son login real ni RLS.

## Pendiente antes del cierre

1. Repetición del build 3103 completada; no usar evidencia del viejo 3100. Mantener las comprobaciones externas siguientes pendientes.
2. Cuenta propia verificada y sesiones reales student/moderator/admin: login/logout, recarga/renovación, perfil propio, autorización negativa de estudiante y revocación de moderador. No proporcionar cookies/tokens en informes.
3. Registro, confirmación única/expirada, recuperación sin enumeración, actualización de contraseña, SMTP y rate limits con configuración externa autorizada. Ningún envío real se hizo aquí.
4. Políticas/RLS/RPC en PostgreSQL/Supabase real y acciones directas maliciosas; no se ejecutó SQL ni se alteraron roles. No se probaron subida, validación de archivos o enlaces privados de documentos: siguen fuera del alcance implementado.
5. Lector de pantalla, navegación completa y dispositivos físicos; contraste no textual y mensajes nativos de validación.
6. **`browser-moderation.mjs` legado requiere sesión moderador/admin verificada en servidor**. Actualmente crea un perfil Chrome fresco y asume `/moderacion` pública (`Public demo…`). No se ejecutó ni se debilitó la protección para hacerlo pasar. Necesita un mecanismo autorizado y seguro de sesión de QA, sin adjuntar cookies/credenciales a artefactos; probar luego únicamente operaciones sintéticas. Un visitante redirigido a login es el resultado esperado, no una regresión a corregir haciendo pública la ruta.

## Repetición sin administrar servidores

```sh
WIKI_TEST_BASE_URL=http://127.0.0.1:3103 node --test tests/auth-routes.test.mjs
WIKI_TEST_BASE_URL=http://127.0.0.1:3103 node tests/browser-auth.mjs
WIKI_TEST_BASE_URL=http://127.0.0.1:3103 node tests/browser-favorites.mjs
WIKI_TEST_BASE_URL=http://127.0.0.1:3103 node tests/browser-catalog.mjs
```

`auth-routes.test.mjs` se omite por defecto si no hay `WIKI_TEST_BASE_URL`; browser-auth exige URL explícita y el driver solo admite loopback. Ningún runner nuevo inicia servidores o instala navegadores. No usar evidencia anónima para afirmar seguridad completa de cuentas autenticadas.
