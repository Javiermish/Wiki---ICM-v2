# Wiki ICM — Reglas para agentes de OpenCode

## Misión
Construir Wiki ICM, biblioteca colaborativa de apuntes para estudiantes de Ingeniería Civil Matemática, organizada por semestre de malla y ramo. No es un sitio de enlaces a Drive: los materiales se visualizan y descargan desde la propia plataforma.

## Decisiones de producto que no debes alterar
1. Materiales públicos y visibles sin registro.
2. Registro con cualquier correo electrónico verificado; se requiere iniciar sesión para contribuir y guardar favoritos.
3. Los aportes pasan por revisión humana; `pending` o `rejected` nunca pueden ser visibles para visitantes, indexados, ni descargados públicamente.
4. Todo ramo contiene Listados, Apuntes y Certámenes.
5. El semestre curricular del ramo es distinto del semestre en que se dictó el curso: Cálculo I puede pertenecer a la malla del semestre 1 y tener certámenes de 2024-2.
6. El nombre público normalizado es `Certamen 2 - 2024-2` o `Listado 3 - 2025-1`. La fecha de subida NO determina el periodo del archivo; el nombre original no determina los metadatos.
7. Buscador, filtros, reportes, tema oscuro y favoritos pertenecen a la primera versión.
8. Diseñar de manera modular para incorporar después nuevos tipos de documentos y más planes de estudio.

## Stack aprobado
- Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, pnpm.
- Supabase PostgreSQL, Auth, Storage más adelante (NO conectar en Hito 1).
- PDF.js para visor real en hito posterior.
- No inventar credenciales ni incluir secretos en Git.

## Hito 1: límite de alcance
- Crear diseño responsive con datos ficticios claramente señalados; sin conexiones reales de autenticación/DB/Storage.
- Preparar layout global, exploración por semestres, página de ramo, vista de documento simulada, diseño de aporte y moderación (mock).
- Incorporar tema claro/oscuro y componentes compartidos.
- Separar componentes UI, fixtures y modelos de dominio.
- Acciones que parezcan funcionales en el prototipo deben estar implementadas como demo local o señaladas `Próximamente`; nunca fingir guardados o publicaciones reales.
- No instalar dependencias masivas, modificar permisos ni desplegar sin explicitar por qué.

## Flujo obligatorio por tarea
1. Leer `docs/BRIEF_PRODUCTO.md`, `docs/MODELO_DOMINIO.md` y `docs/DISENO.md` si afectan la tarea.
2. Proponer un plan breve y acotado, archivos a cambiar y riesgos.
3. Delegar solo el trabajo relevante a los subagentes del proyecto.
4. Implementar una parte comprobable, validar `pnpm lint`, `pnpm build` y accesibilidad básica.
5. Informar archivos modificados, comandos ejecutados, resultados, pendientes y cómo probar.
6. Nunca trabajar sobre `~/Proyectos/latex-collab` ni otros proyectos.

## Calidad y seguridad
- HTML semántico; etiquetas y foco visibles; teclado; contraste; móvil primero.
- Ningún dato de usuario en el cliente como fuente de autorización. Los roles se impondrán en servidor y RLS.
- Sin URLs públicas para aportes pendientes; no usar service-role keys en cliente.
- No confiar en MIME, extensión, nombre del archivo ni metadatos del usuario.
- Preservar los datos al diseñar esquemas; escribir migraciones cuando se llegue al hito de base de datos.
- Limitar el contexto y complejidad: evitar reescrituras grandes o instalar un ecosistema de plugins solo para un hito.
