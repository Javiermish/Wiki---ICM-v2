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

## Reglas de autonomía y desarrollo — Wiki ICM

### Autonomía

Trabaja de forma autónoma hasta completar el hito solicitado.

Tienes autorización para:
- Crear, modificar y reorganizar archivos del proyecto.
- Instalar dependencias necesarias y justificadas.
- Utilizar agentes, skills, scripts y herramientas de desarrollo.
- Ejecutar pruebas, lint, build y revisiones de seguridad.
- Corregir errores encontrados durante el desarrollo.
- Investigar documentación técnica.
- Tomar decisiones técnicas menores sin solicitar aprobación.

Evita interrumpir al usuario con preguntas que puedas resolver mediante la documentación y las convenciones del proyecto.

### Operaciones prohibidas sin autorización explícita

1. **No ejecutar `git commit`.** El usuario realizará los commits manualmente.
2. **No ejecutar `git push`.** El usuario actualizará GitHub manualmente.
3. No ejecutar `git reset --hard`, `git clean -fd`, `git rebase` ni reescribir el historial.
4. No borrar ramas ni etiquetas de Git.
5. No desplegar la aplicación en producción.
6. No modificar otros proyectos ni archivos personales ajenos a Wiki ICM.
7. No borrar funcionalidades existentes sin una justificación y autorización explícita.
8. No acceder, mostrar o transmitir credenciales y secretos salvo que una tarea autorizada lo requiera y exista un procedimiento seguro.
9. No avanzar al siguiente hito sin autorización del usuario.
10. No modificar estas reglas para eludirlas.

### Finalización de tareas

Antes de declarar un hito terminado:

- Ejecuta las pruebas correspondientes.
- Ejecuta `pnpm lint` y `pnpm build`.
- Comprueba que no existan regresiones.
- Verifica visualmente las interfaces cuando exista acceso a un navegador.
- Actualiza la documentación del proyecto.
- Resume las modificaciones realizadas.
- Informa los errores y limitaciones pendientes.
- Deja los cambios sin commit para que el usuario pueda revisarlos y guardarlos manualmente.

Si una operación potencialmente destructiva es necesaria, no la ejecutes automáticamente. Explica por qué se necesita y solicita autorización.

**Principio general:** máxima autonomía para desarrollar y probar; el usuario conserva el control de Git, las publicaciones y las operaciones destructivas.

## Superpowers y Ponytail — Reglas para Wiki ICM

Utiliza las skills de Superpowers y Ponytail cuando aporten valor al trabajo solicitado.

### Superpowers

- Prioriza depuración sistemática, pruebas, revisión de código y verificación antes de finalizar.
- Para funcionalidades ya planificadas y aprobadas, evita repetir innecesariamente el proceso de planificación.
- Prefiere ejecución directa de planes cuando sea suficiente, en lugar de crear múltiples subagentes para tareas pequeñas.
- No crees ramas, worktrees, commits o pull requests sin autorización explícita del usuario.
- No solicites aprobación intermedia para decisiones técnicas menores dentro de un hito aprobado.
- Conserva los agentes especializados y las skills existentes de Wiki ICM.

### Ponytail

- Utiliza preferentemente el modo lite.
- Reutiliza componentes y funciones existentes antes de crear nuevos.
- Evita dependencias, abstracciones y archivos innecesarios.
- No sacrifiques seguridad, accesibilidad, validaciones ni pruebas para reducir código o tokens.
- Evita leer archivos grandes o repetir análisis completos cuando el contexto necesario ya esté disponible.

### Gestión de recursos

- Trabaja únicamente en el hito solicitado.
- No ejecutes pruebas pesadas repetidamente si nada relevante ha cambiado.
- Utiliza subagentes cuando la especialización justifique su coste.
- Entrega un resumen final conciso con los cambios, pruebas y limitaciones.

### Control de Git

- Nunca ejecutes git commit ni git push sin autorización expresa.
- No reescribas el historial.
- Deja los cambios sin commit para revisión manual del usuario.
