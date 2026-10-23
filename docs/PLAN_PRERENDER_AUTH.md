# Corrección acotada de prerenderizado Auth — Hito 2.1

- [x] Inspeccionar consultas de sesión y fronteras Suspense de todas las rutas.
- [x] Añadir regresión: ninguna consulta SDK antes de la petición; propagar señales de Next.
- [x] Esperar `connection()` en `src/lib/auth/session.ts`, fuera del manejo de errores SDK.
- [x] Verificar visitante/student/moderator/admin con dobles representativos, HTTP y Chromium disponible.
- [x] Ejecutar lint, build y suite; registrar resultados y límites en `docs/QA_HITO_2_1.md`.

Alcance: helper servidor, pruebas de sesión/navegación y documentación. Las páginas protegidas ya tienen Suspense. Favoritos no consulta sesión y permanece pública/local; la cabecera conserva su frontera dinámica aislada. Sin caché de datos privados, cambios RLS/configuración Supabase, acceso a secretos ni modificaciones remotas.

Riesgo principal: capturar la señal de suspensión de Next como si fuera un fallo del SDK. La espera debe quedar fuera del `try/catch`. Los dobles no certifican cookies ni RLS remotos; las pruebas de navegador sin credenciales cubren al visitante.
