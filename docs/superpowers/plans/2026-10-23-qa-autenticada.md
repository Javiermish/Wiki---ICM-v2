# Preparación de QA autenticada Hito 2.2

**Objetivo:** conservar cobertura útil, archivar runners DEMO incompatibles y preparar una matriz PostgREST real sin ejecutarla remotamente.
**Diseño:** cuatro cuentas temporales verificadas (student A/B, moderator, admin), SDK existente con sesiones solo en memoria y entrada secreta interactiva. Sin service_role. Plan/runner bloqueado por defecto, IDs exactos en manifiesto sin credenciales. Limpieza separada: las auditorías append-only impiden un DELETE normal.
**Alternativas:** exportar tokens a archivos expone secretos; reutilizar la cuenta principal contradice el aislamiento; login local oculto evita ambos. No cambiar permisos ni esquema de aplicación.
**Archivos:** runners históricos y suites actuales de `tests/`, runner y pruebas de QA autenticada, `docs/QA_HITO_2_2.md` y procedimiento enlazado.

- [x] A. Revisar escenarios históricos contra suites actuales; migrar solo huecos, archivar con motivo y conservar evidencia. Delegación acotada a QA.
- [x] B. Preparar runner opt-in con pruebas offline: guardas de autorización/proyecto, identidad/rol, aislamiento propio/ajeno, solicitudes, administración, revisión, duplicados, auditoría y manifiesto.
- [x] C. Documentar configuración manual, operaciones remotas exactas y limpieza transaccional por IDs. No ejecutar creación de cuentas, login ni PostgREST remoto.
- [x] D. Revisar seguridad, ejecutar tests locales, lint/build y suites públicas relevantes; documentar resultados y límites sin declarar cierre autenticado.

**Riesgos a comprobar:** proyecto incorrecto; cuentas repetidas/principales; secretos en errores/reportes; éxito inesperado de una mutación denegada; respuesta perdida tras escritura; referencias ajenas que bloqueen limpieza. Detenerse ante discrepancias y conservar manifiesto, nunca borrar por prefijo ni usar CASCADE.
**Restricciones:** sin cuentas/datos remotos ahora, sin commits/push/despliegue/worktrees ni Hito 2.3. No instalar dependencias.
