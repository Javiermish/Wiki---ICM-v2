# Prompt para OpenCode — ejecutar en el agente Plan

Lee AGENTS.md, docs/BRIEF_PRODUCTO.md, docs/MODELO_DOMINIO.md, docs/DISENO.md y docs/HITO_1.md.

Quiero ejecutar SOLO el Hito 1 de Wiki ICM.

Antes de implementar, revisa estructura actual del repositorio, identifica versiones de Next.js y OpenCode y comprueba que los subagentes locales y skills estén disponibles. No cambies el stack ni introduzcas una base de datos real todavía.

Solicita al subagente @ui-designer una propuesta de sistema visual coherente con el brief, y al @security-reviewer una revisión de posibles confusiones entre UI simulada y permisos reales.

Prepara un plan acotado de implementación con archivos a crear/modificar y criterios de aceptación; destaca el caso de Cálculo I, semestre curricular 1, con Certamen 2 - 2024-2. Incluye home, navegación por semestres, ramo con tabs, ficha de documento, formulario de aportes (mock), cola moderación (mock), favoritos (mock), modo oscuro, búsqueda y filtros.

No implementes nada todavía ni instales paquetes adicionales. Presenta el plan para revisión antes de continuar con Build. Después de la aprobación, implementaremos una pantalla a la vez y comprobaremos `pnpm lint` y `pnpm build`.
