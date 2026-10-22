# Hito 1 — Fundaciones y diseño

## Objetivo
Dejar un proyecto Next.js funcional y un sistema de diseño de Wiki ICM navegable con fixtures. NO conectar servicios externos ni almacenar material real.

## Entregables
1. Proyecto Next.js TypeScript/Tailwind/shadcn y Git en ruta independiente.
2. Configuración local de OpenCode, subagentes y skills según este kit.
3. Tokens light/dark y componentes reutilizables.
4. Home, semestres, ramo, detalle de material, aporte y moderación como mocks coherentes.
5. Filtros por semestre curricular y periodo académico distintos, funcionales sobre fixtures.
6. Esquema de dominio tipado y convenciones de nombre.
7. Responsive y accesibilidad básica comprobada.

## Criterios de aceptación
- Cálculo I se muestra en semestre curricular 1 y tiene material `Certamen 2 - 2024-2`.
- El filtro `2024-2` encuentra el documento sin mover el ramo a otro semestre de malla.
- Listados, Apuntes y Certámenes tienen vistas/pestañas independientes.
- Modo oscuro funciona y no vuelve ilegibles los datos.
- La UI no simula haber publicado/subido realmente archivos.
- Los favoritos mock están identificados como prototipo (backend real en hito posterior).
- `pnpm lint` y `pnpm build` terminan sin errores.
- Revisiones QA en 375, 768, 1280 y 1440 px; navegación teclado.

## Siguientes hitos
- H2: esquema real PostgreSQL/Supabase + migraciones + controles RLS.
- H3: Storage/visor PDF.js/descarga/buscador contra DB.
- H4: Auth, aportes, verificación, reportes y favoritos persistentes.
- H5: pruebas de seguridad, migración de material autorizado, despliegue.

## Restricciones
No desplegar ni agregar datos privados al repositorio. No ejecutar `git push` ni cambios externos sin autorización. No asignar modelos caros a todos los subagentes: primero Plan y tareas pequeñas.
