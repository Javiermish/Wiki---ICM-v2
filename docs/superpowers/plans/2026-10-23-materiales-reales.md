# Materiales reales — Hito 2.3 Implementation Plan

> **For agentic workers:** ejecutar por partes comprobables; mantener este checklist. Sin commits, worktrees ni operaciones remotas.

**Goal:** recibir archivos privados, revisarlos y publicar únicamente materiales aprobados.
**Architecture:** reutilizar catálogo, formularios y lector. Subida multipart al servidor con límite 25 MiB, validación estructural PDF/imágenes, reserva idempotente SQL, PUT privado R2 y finalización exclusivamente servidor. Revisión SQL transaccional; acceso a bytes autorizado en cada petición. Muestras DEMO separadas, sin fallback silencioso ante fallos reales.
**Tech Stack:** Next.js/TypeScript, Supabase PostgreSQL/Auth/RLS, SDK S3 para R2.
**Spec:** solicitud del usuario Hito 2.3; docs/BRIEF_PRODUCTO.md, MODELO_DOMINIO.md, DISENO.md, HITO_2_2.md.

## Global Constraints
- No SQL remoto, recursos Cloudflare, usuarios, deploy, commit/push ni Hito 2.4.
- Nombre académico normalizado compartido; período independiente de malla.
- Pendientes/rechazados privados; rol, propietario, estado y revisión impuestos por servidor/SQL.
- Mantener diseño, filtros, favoritos locales y visor.

## Review Focus
- Respuesta perdida después del PUT: reserva idempotente y recuperación sin publicación.
- Limpieza concurrente con finalización: transición SQL excluyente; nunca borrar material listo.
- Archivo con firma válida pero contenido corrupto/activo: parseo estructural y rechazo.
- Segunda decisión concurrente: bloqueo de fila, una auditoría, conflicto recuperable.
- Caída de DB/R2: error explícito y ningún éxito simulado.

## Tasks
- [x] 1. Migración `supabase/migrations/202610230003_materials.sql`, RLS, RPC, auditoría y pruebas SQL locales con permisos, rollback, cuotas, duplicados y carreras.
- [x] 2. `src/lib/materials/`: validación, R2, servicios, rutas y revisión. Pruebas con bytes/parsers reales, dobles DB/R2 y SDK real loopback para aborto HTTP.
- [x] 3. Formulario, panel persistente y `/mis-aportes` conectados; XHR con progreso, errores y preview existente. Pendiente navegador con identidad externa autorizada.
- [x] 4. Proyección aprobada, ficha dinámica UUID y archivo; muestras opt-in explícitas, pruebas de filtros/privacidad y manifiesto de producción.
- [x] 5. Lint/build, suite node, runner SQL, HTTP y navegador disponibles ejecutados; revisiones de seguridad/integración y correcciones con regresiones. Suite browser global no verde por prerrequisitos de catálogo; resultados exactos en HITO_2_3.
- [x] 6. Configuración, limpieza, límites y ciclo manual documentados en `docs/HITO_2_3.md` y `.env.example`.
- [ ] Cierre: proporcionar configuración privada, autorizar/aplicar SQL remoto y verificar ciclo real completo. Bloqueado externamente; no se declara terminado el hito.

## Risks / choices
- El límite 25 MiB requiere hosting que acepte cuerpos de ese tamaño; no asumir compatibilidad con límites de funciones Vercel Hobby. Documentar despliegue fuera de alcance y límite.
- Se agregan solo dependencias necesarias: SDK S3/presigner y parser de imágenes si no existe instalable reutilizable; PDF.js ya existe.
- R2 y PostgreSQL no comparten transacción: reserva duradera, estados de carga y limpieza reintentable compensan errores; aprobar exige archivo listo.
- Credenciales privilegiadas solo servidor para confirmar validación de bytes; no autorizar por datos del navegador.
