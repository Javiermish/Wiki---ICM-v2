# Regresiones Hito 2.3 — plan de ejecución

- [x] Diagnóstico: revisar documentación/runners; reproducir HTTP y navegador sin servicios remotos; conservar errores exactos y clasificar por causa.
- [x] Corregir causas confirmadas con pruebas de regresión, sin abrir rutas privadas ni modificar migraciones aplicadas.
- [x] Preparar fixtures loopback reproducibles y runner que ejecute todas las suites vigentes, incluida Tareas.
- [x] Verificar unitarias, HTTP, todos los navegadores, SQL/concurrencia local, lint y build.
- [x] Informar causas individuales, archivos, resultados, omisiones y límites en `docs/QA_REGRESIONES_2_3.md`.

Alcance previsto: `tests/`, runner local en `scripts/`, `package.json`, documentación QA y `src/proxy.ts` si se confirma el 200 de páginas ausentes tras streaming.
Riesgos: mezclar build con configuración remota; contratos DEMO anteriores; afirmar integración real a partir de dobles. Mitigación: variables explícitas locales sin secretos, fixtures REST solo de lectura, separar evidencia HTTP/browser de PostgreSQL nativo y R2 simulado. Conservar todo el trabajo preexistente sin commit/push.
