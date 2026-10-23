# Hito 2.1 — Autenticación, cuentas y roles

## Alcance

Autenticación real mediante Supabase Auth, cookies SSR, perfiles PostgreSQL y roles `student`, `moderator`, `admin`. El catálogo continúa siendo público y ficticio. Aportar, gestión académica, reportes y revisión siguen siendo demos; no se publican materiales ni se crean tablas académicas. Favoritos permanecen exclusivamente en este navegador, sin vinculación ni sincronización con cuentas.

Arquitectura definitiva: Next.js 16/React/TypeScript; Supabase Free para Auth/PostgreSQL; Vercel Hobby y Cloudflare R2 futuros. **No se utiliza Supabase Storage para documentos**, no se implementa R2 y no se despliega.

## Configuración manual requerida

1. Crear o seleccionar el proyecto Supabase. No se han aplicado migraciones remotas desde esta tarea.
2. Aplicar la migración versionada en `supabase/migrations` mediante SQL Editor, tras revisar y respaldar cualquier esquema existente. No ejecutar scripts de reset. Ver [AUTH_SQL.md](AUTH_SQL.md) para el contrato y procedimiento administrativo.
3. Copiar las variables de `.env.example` a `.env.local` sin publicar valores:
   - `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: clave publicable, nunca `service_role` ni clave secreta.
   - `SITE_URL`: origen exacto de esta aplicación, por ejemplo `http://localhost:3000` en desarrollo; HTTPS para un dominio público. Sin rutas, query ni fragmentos. Solo desarrollo tiene localhost por defecto. Reiniciar Next tras modificar variables; en producción reconstruir también (`pnpm build`), pues las variables públicas se incorporan al bundle.
4. Supabase → Authentication → Providers → Email: habilitar email/password y **Confirm email**. Deshabilitar inicio anónimo si no se usa. Configurar contraseña mínima de 12 caracteres y protección contra contraseñas comprometidas si está disponible en el plan.
5. Authentication → URL Configuration: `Site URL` igual a `SITE_URL`; permitir explícitamente `${SITE_URL}/auth/confirm` y `${SITE_URL}/auth/confirm?next=/restablecer-contrasena`. No usar comodines de dominios en producción.
6. Authentication → Email Templates: se recomiendan los siguientes enlaces SSR directos de un solo uso. El tipo OTP determina el destino; no se admiten redirecciones arbitrarias. La alternativa `ConfirmationURL`/PKCE y sus requisitos se describen en la corrección de confirmación al final.

### Plantilla Confirm signup

```html
<h2>Confirma tu correo para Wiki ICM</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirmar correo</a></p>
<p>Si no solicitaste esta cuenta, ignora este correo.</p>
```

### Plantilla Reset password

```html
<h2>Restablecer contraseña de Wiki ICM</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Elegir nueva contraseña</a></p>
<p>Si no solicitaste el cambio, ignora este correo.</p>
```

`.SiteURL` debe corresponder al entorno que se está probando. Si varios entornos comparten proyecto, usar proyectos separados o revisar cuidadosamente plantillas y redirect allowlist; no asumir que cambiar `.env.local` cambia las plantillas remotas.

El SMTP predeterminado de Supabase tiene destinatarios y cuotas limitados: **no es apto para registro público definitivo**. Configurar SMTP propio, remitente verificado, SPF/DKIM/DMARC y límites de envío antes de apertura pública. No colocar credenciales SMTP en código ni variables públicas. Los enlaces consumidos por escáneres de correo pueden expirar antes del clic; probar con el proveedor real.

## Seguridad y decisiones

- `proxy.ts` renueva con `getClaims()`, propaga cookies al request y response y conserva cabeceras de cache del SDK. Todas las respuestas de páginas son `private, no-store` por la cabecera personalizada; no configurar ISR/CDN que lo reemplace.
- Clientes browser/server separados; no singleton de usuario en servidor. Cookies `SameSite=Lax`, `Secure` con endpoint HTTPS. El SDK SSR necesita cookies accesibles al navegador; no se afirma que sean HttpOnly. No almacenar contraseñas fuera de Supabase Auth.
- `getClaims()` verifica identidad; `getUser()` comprueba confirmación actual y las consultas autorizadas obtienen perfil/rol actual. Metadata editable y estado React no autorizan.
- Las páginas privadas y cada acción sensible vuelven a autorizar en servidor. Next Server Actions mantiene protección de origen; no ampliar `allowedOrigins` indiscriminadamente.
- Perfil actualiza únicamente `display_name` y fuerza ID de sesión. Los roles están separados y protegidos en SQL. Administración usa RPC con JWT del administrador, no claves privilegiadas.
- La UI no ofrece asignar o revocar administradores. El primer administrador se inicializa manualmente desde SQL Editor con una cuenta existente verificada y evento de auditoría (ver AUTH_SQL). No hay administradores automáticos ni correos personales en migraciones.
- Redirecciones posteriores a login usan una allowlist exacta. Confirmación acepta OTP `email`, `signup` y `recovery`, o un código PKCE exclusivo; ignora destinos arbitrarios. Recuperación no afirma si existe una cuenta.
- Revocar un rol se aplica en la siguiente consulta DB sin esperar a renovar JWT. Una revocación de sesión puede depender de la vigencia del access token en Supabase; no equivale a revocar un rol.
- Protección antiabuso adicional se configura en Supabase (rate limits/CAPTCHA/SMTP); no se sustituye por validaciones visuales.

## Cómo probar con Supabase configurado

1. `pnpm dev`; abrir `/` sin sesión y comprobar exploración/archivos/favoritos locales.
2. `/registro`: probar correo inválido, contraseña corta y confirmación distinta; registrar una cuenta propia válida. Antes del correo no debe permitir acceso privado. Confirmar enlace y comprobar perfil `student` y `/mi-cuenta`.
3. Cerrar sesión; `/mi-cuenta`, `/moderacion` y `/admin/usuarios` deben redirigir a login. Login incorrecto muestra error; correcto persiste al recargar.
4. Cambiar nombre en perfil. Desde REST/SDK con JWT de estudiante, intentar modificar otro perfil, roles, auditoría o insertar perfiles: debe denegarse por RLS/grants. Ejecutar pruebas SQL locales para matriz reproducible.
5. `/recuperar-contrasena`: solicitar correo; enlace de recovery abre `/restablecer-contrasena`. Validar confirmación, actualizar y probar login con nueva contraseña. Reutilizar enlace debe fallar sin mostrar tokens en errores.
6. Inicializar primer admin según AUTH_SQL. `/admin/usuarios` permite consultar usuarios/historial y otorgar/revocar moderación a una cuenta verificada, con motivo. Comprobar evento y rechazo de cambios sobre admin. Estudiante no accede ni llamando directamente a RPC.
7. Moderador accede a `/moderacion` pero no a usuarios. La revisión sigue DEMO y aprobar no publica. Revocar moderación y comprobar bloqueo al navegar o recargar.
8. Con sesión expirada, navegar y comprobar renovación mediante cookies y `Cache-Control: private, no-store`. No compartir cookies ni adjuntarlas a informes.
9. Probar móvil/escritorio, claro/oscuro, tabulación, errores anunciados y ausencia de desbordes.

## Evidencia y límites

Los tests `auth*.test.mjs` distinguen validación real de orquestación con dobles SDK. **No constituyen pruebas reales de envío de correo, login ni renovación contra Supabase**. Los tests SQL prueban PostgreSQL si existe motor local; no sustituyen probar Auth/RLS dentro del proyecto Supabase configurado. Los resultados ejecutados y pendientes se actualizarán al finalizar la verificación.

La revisión estática especializada no detectó bloqueos de seguridad. Los errores de perfil/rol conservan el fallo cerrado, pero ahora se distinguen de correo sin confirmar y no cierran una sesión válida de Auth; ver la corrección de aprovisionamiento al final.

Con Cache Components, una ruta privada puede responder HTTP 200 con un shell público y el redirect de Next (`__next-page-redirect`) en el stream, en lugar de 307. La autorización precede siempre a los datos privados; el navegador termina en login y las respuestas son `private, no-store`. Las pruebas comprueban ambos modos y ausencia de datos protegidos.

## Archivos del hito

Nuevos:
- `.env.example`; `src/proxy.ts`; `src/domain/auth.ts`.
- `src/lib/supabase/{config,client,server}.ts` y `src/lib/auth/{session,flows,actions}.ts`.
- `src/components/auth/{auth-form,auth-shell,logout-button}.tsx`.
- `src/app/{registro,login,recuperar-contrasena,restablecer-contrasena,mi-cuenta,mis-aportes}/page.tsx`, `src/app/auth/confirm/route.ts`, `src/app/admin/usuarios/page.tsx`.
- `supabase/migrations/202610220001_profiles_roles.sql`: esquema inicial, perfiles, roles, eventos, triggers, backfill, RLS, grants y RPC. `supabase/migrations/202610220002_backfill_existing_accounts.sql`: reparación aditiva e idempotente de perfiles/roles ausentes. Pruebas SQL en `supabase/tests/`; orden y verificaciones en AUTH_SQL.
- `tests/auth.test.mjs`, `auth-actions.test.mjs`, `auth-confirm-route.test.mjs`, `auth-flows.test.mjs`, `auth-session.test.mjs`, `auth-ui.test.mjs`, `auth-routes.test.mjs`, `browser-auth.mjs`.
- Esta guía, `docs/AUTH_SQL.md`, `docs/QA_HITO_2_1.md` y plan `docs/superpowers/plans/2026-10-22-hito-2-1.md`.

Modificados:
- `.gitignore`, `package.json`, `pnpm-lock.yaml`, `README.md`.
- Cabecera, navegación móvil, pie y aviso de prototipo en `src/components/layout/`; copy de `src/components/catalog/home-content.tsx`; `src/app/moderacion/page.tsx`.
- `docs/{BRIEF_PRODUCTO,MODELO_DOMINIO,DISENO}.md` para distinguir alcance histórico del vigente.
- Tests HTTP `tests/{routes,course-routes,contribution-routes,moderation-routes}.test.mjs`: moderación ya no es pública; no se relajan comprobaciones de aislamiento. `tests/browser-driver.mjs` y `tests/browser-catalog.mjs` esperan hidratación/controles visibles para manejar streaming.

## Resultados finales

- `pnpm lint`: correcto.
- `pnpm build`: correcto con Next.js 16.4.2.
- `WIKI_TEST_BASE_URL=http://127.0.0.1:3103 pnpm test`: **163/163**, sin fallos ni omisiones.
- Chromium, mismo build: auth **20/20**, catálogo **26/26**, favoritos **7/7**, gestión **62/62**, materiales **41/41**, aportes **26/26**. Incluye móvil/escritorio y temas claro/oscuro. Capturas/informes ignorados por Git en `.next/qa-*-evidence/`; historial de incidencias y cobertura en [QA_HITO_2_1.md](QA_HITO_2_1.md).
- PostgreSQL real 18.4 local: migración/backfill y pruebas SQL transaccionales correctas. Auth fue un esquema mínimo de prueba, no el servicio Supabase. Detalles en AUTH_SQL.
- Revisión de seguridad especializada: sin blockers; `git diff --check` correcto. Advertencias de Node sobre módulos TS sin `type` y warning esperado del PDF corrupto no son fallos de assertions.
- No se ejecutó `browser-moderation.mjs`: asume la antigua demo pública y necesita adaptar una sesión QA autorizada; las pruebas de dominio de moderación y acceso anónimo sí pasan. No se hizo pública la ruta para probarla.

**Pendiente de configuración/validación externa:** añadir `SITE_URL` (ausente en la inspección inicial, sin revelar valores de las otras variables), revisar/aplicar manualmente migración, confirmar correo y configurar URLs/plantillas/SMTP en Supabase, inicializar admin con el procedimiento SQL y probar extremo a extremo los tres roles con cuentas verificadas. Las vistas autenticadas (cuenta, cambio de contraseña, usuarios y moderación) no tienen evidencia visual con sesiones reales. No se ha aplicado SQL remoto ni se ha enviado correo de prueba real; no confundir dobles SDK con integración real.

Cambios sin commit/push, sin ramas/worktrees, sin despliegue, sin R2 ni Hito 2.2.

## Corrección de confirmación SSR — diagnóstico y comprobación

Síntoma informado: cuenta confirmada en Supabase, error de enlace en Wiki ICM y logs `One-time token not found` posteriores. **No se inspeccionó ni cambió la plantilla remota**, por lo que los logs por sí solos no prueban qué petición consumió primero el token.

Hallazgos locales:
- `signUp` envía una sola solicitud de registro y `emailRedirectTo`; no verifica el token. El cliente instalado `@supabase/ssr` usa `flowType: pkce` y `detectSessionInUrl: false`. Había una sola llamada explícita a `verifyOtp` por petición, no dos verificaciones internas consecutivas.
- El callback original solo entendía `token_hash` con `type=signup/recovery`. Rechazaba `type=email` y el `?code=…` que puede devolver Supabase después de verificar mediante `ConfirmationURL`. Este último caso explica una cuenta ya confirmada con un error local de callback; **no demuestra por sí solo el origen del error OTP en logs**.
- Reabrir/recargar el enlace, peticiones repetidas o escáneres pueden consumir/reintentar un OTP. Además, Next deriva HEAD de GET si no existe handler HEAD: ahora HEAD responde 204 sin verificar. Un escáner que hace GET sigue pudiendo consumir un OTP; evitarlo completamente requeriría un paso de confirmación interactivo, no implementado en esta corrección.
- Las pruebas HTTP reprodujeron otro fallo concreto: `request.nextUrl.clone()` normalizaba `127.0.0.1` a `localhost` al construir el redirect absoluto. Esto cambia de host y deja atrás cookies de sesión/PKCE. El callback ahora devuelve `Location` relativo y fijo, conservando exactamente el origen del navegador. La primera pasada HTTP de regresión falló por esa diferencia de host; tras corregirla pasó completa.

Flujos compatibles, mutuamente excluyentes:
1. **Preferido, SSR directo:** la plantilla Confirm signup mostrada arriba enlaza directamente a `${SITE_URL}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`. También se admite `type=email` usado en ejemplos SSR de Supabase. Se llama una vez a `verifyOtp`. Para recovery usar explícitamente `type=recovery`.
2. **Plantilla con `{{ .ConfirmationURL }}`:** Supabase verifica el OTP primero y redirige a `emailRedirectTo` con `code`. Wiki ICM llama una vez a `exchangeCodeForSession`, **no** vuelve a verificar el OTP. Requiere la cookie PKCE del navegador que inició registro/recuperación; otro navegador o cambiar `localhost` por `127.0.0.1` puede impedir el intercambio. Para recovery se conserva únicamente el destino exacto `/restablecer-contrasena` preparado por el servidor.

No concatenar `ConfirmationURL` con `TokenHash`, no dirigir `/auth/v1/verify` de vuelta al mismo token y no mezclar `code` con `token_hash/type`. Los formatos ambiguos o repetidos y errores del proveedor se rechazan. No hay reintentos con otro `type`, ni fallback de código a OTP. Un error de token **sigue siendo error**, aunque exista una cuenta confirmada en la DB. En login, solo una sesión comprobada con `getAccount()` permite ofrecer «Continuar a mi cuenta», con aviso explícito de que el enlace no se validó; no se autoriza nada por el token fallido ni por parámetros de query.

Las redirecciones eliminan todos los tokens/códigos/parámetros y mantienen `private, no-store` y `no-referrer`. No se registran tokens en diagnósticos propios.

Comprobación manual sin alterar configuración desde el agente: revisar el `href` de la plantilla actual en Supabase y elegir **un** flujo de los anteriores. Usar un correo/enlace nuevo, abrir una vez y comprobar el destino limpio y la sesión. No compartir el token ni pegarlo en informes. Reabrir el enlace debe fallar como enlace usado, no confirmar otra vez; si la sesión válida persiste se ofrece continuar por esa sesión. Sin sesión se ofrece login y no se concede acceso. Correo ya confirmado no necesita consumir el enlace antiguo para iniciar sesión con contraseña.

Pruebas de regresión: `tests/auth-flows.test.mjs` y `tests/auth-confirm-route.test.mjs` cubren ambos formatos, verificación única, credenciales ambiguas, OTP consumido, código sin verifier, HEAD inocuo, redirecciones limpias y mensaje según sesión verificada. Son pruebas locales con límites SDK/Next sustituidos, **no** pruebas reales de entrega/verificación en Supabase.

Verificación de la corrección: `pnpm lint` y `pnpm build` correctos; `WIKI_TEST_BASE_URL=http://127.0.0.1:3105 pnpm test` **176/176**, sin omitidos; `browser-auth.mjs` **20/20** en el mismo build (móvil/escritorio y claro/oscuro). `auth-routes.test.mjs` también ejercita HEAD y entradas malformadas vía HTTP real sin enviar tokens válidos al proveedor. Revisión de seguridad sin blockers. La persistencia de cookies y confirmación con correos reales sigue pendiente de prueba en Supabase; no se tocó configuración remota ni DB.

## Corrección de aprovisionamiento: Auth correcto y `public` vacío

**Diagnóstico:** según la comprobación remota aportada por el usuario, existe un usuario confirmado y un login exitoso del 22-10-2026 a las 18:36:35 UTC, pero no existen tablas públicas ni migraciones aplicadas. No se volvió a consultar ni modificar ese proyecto remoto desde el agente. Supabase Auth y las tablas de aplicación son sistemas separados: tener `auth.users` no crea automáticamente `public.profiles` o `public.user_roles`.

La implementación anterior completaba `signInWithPassword`, luego `getAccount()` consultaba esas tablas inexistentes. Descartaba los errores de consulta y devolvía `null`; `loginAction` interpretaba ese `null` como correo sin confirmar y ejecutaba `signOut`. Era un fallo de diagnóstico/aprovisionamiento, no evidencia de contraseña incorrecta o necesidad de confirmar de nuevo.

Cambios de servidor:
- `getAccountResult()` distingue identidad/sesión no comprobada, correo no confirmado, configuración Auth ausente, error de perfil/rol y servicio temporalmente no disponible. Se inspeccionan errores y ausencia de ambas filas.
- `getAccount()` mantiene su contrato para cabecera/UI: entrega cuenta solo si identidad, correo, perfil y rol son válidos. No inventa rol `student`, no autoriza desde metadata y no crea datos desde el cliente.
- Login conserva una sesión Auth válida ante errores de perfil y explica que se deben revisar migraciones/datos/permisos. Credenciales incorrectas y correo sin confirmar mantienen mensajes separados.
- Las rutas/acciones privadas siguen bloqueadas si falta el perfil o rol. La redirección a login conserva el motivo para no presentar un error de confirmación de correo por una DB incompleta.

**Reparación manual:** aplicar primero `202610220001_profiles_roles.sql` y después `202610220002_backfill_existing_accounts.sql` como operador autorizado. La primera prepara tablas, RLS, permisos, RPC y trigger; la segunda puede repetirse y completa únicamente filas ausentes con nombre vacío/rol `student`, preservando datos y roles previos. No se borra ningún usuario ni se crea admin automáticamente. Instrucciones SQL exactas de aplicación y comprobación: [AUTH_SQL.md](AUTH_SQL.md).

Pruebas nuevas en `auth-actions.test.mjs`/`auth-session.test.mjs`: login Auth exitoso con tablas inexistentes, filas ausentes o permisos insuficientes, ausencia de rol de respaldo, conservación de sesión, fallos de identidad y mensajes distintos. El navegador prueba los avisos de DB y correo por separado en móvil/escritorio y ambos temas; no equivale a iniciar sesión real contra el proyecto remoto.

Resultados de esta corrección: `pnpm lint` y `pnpm build` correctos; `WIKI_TEST_BASE_URL=http://127.0.0.1:3106 pnpm test` **178/178**, sin omitidos; `browser-auth.mjs` **24/24**, con avisos de perfil y correo separados en 375/1440 px y claro/oscuro. Captura `profile-error-375-light.png` inspeccionada. PostgreSQL local 18.4: backfill real ejecutado dos veces, **12 aserciones y 2 operaciones denegadas**, más suite original RLS/grants completa; sin borrar usuarios preexistentes. Esquema Auth mínimo como doble, no Supabase completo. Revisión de seguridad sin blockers. Detalles SQL/logs en AUTH_SQL.

Archivos de esta corrección: `src/lib/auth/session.ts`, `src/lib/auth/actions.ts`, `src/app/login/page.tsx`; nuevo SQL `supabase/migrations/202610220002_backfill_existing_accounts.sql` y prueba `supabase/tests/backfill_existing_accounts.sql`; pruebas `tests/auth-actions.test.mjs`, `tests/auth-session.test.mjs`, `tests/auth-confirm-route.test.mjs`, `tests/browser-auth.mjs`; guías `docs/AUTH_SQL.md`, `docs/HITO_2_1.md`, `docs/QA_HITO_2_1.md` y enlace de aplicación en README. La migración inicial se revisó y se conserva sin cambios. Sin cambios de dependencias, DB/configuración remota, usuarios reales ni Git commit/push.
