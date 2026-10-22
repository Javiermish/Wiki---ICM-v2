# Kit Hito 1 de Wiki ICM

Este paquete contiene instrucciones, subagentes, skills y una vista previa estática para iniciar Wiki ICM con OpenCode.
**No contiene un proyecto Next.js completo**, ni una base de datos/servicio desplegado; debe copiarse en un repositorio Next.js nuevo.

## Inicio (CachyOS/Arch + fish)
1. Comprueba `node --version`, `pnpm --version`, `opencode --version`. Next.js exige Node >= 20.9.
2. `mkdir -p ~/Proyectos && cd ~/Proyectos`
3. `pnpm create next-app@latest wiki-icm --ts --tailwind --eslint --app --src-dir --use-pnpm`
4. `cd wiki-icm`
5. `pnpm dlx shadcn@latest init`
6. Descomprime el ZIP sobre este directorio: `unzip ~/Descargas/wiki-icm-hito1.zip -d ~/Proyectos/wiki-icm` (ajusta ruta del ZIP).
7. Abre `prototype/index.html` en tu navegador para ver la referencia visual. Es un mockup, NO la app funcional.
8. `opencode` -> Plan -> pega el contenido de `docs/PROMPT_INICIAL.md`.

> Este kit usa rutas/configuración documentadas para OpenCode 1 (archivos Markdown en `.opencode/agents/` y skills). Si usas OpenCode 2, verifica primero sus normas de migración antes de aplicar `opencode.json`.

## Contenido
- `AGENTS.md`: reglas del proyecto (fuente de verdad de producto).
- `opencode.json`: permisos de OpenCode 1.
- `.opencode/agents/*.md`: cinco subagentes.
- `.opencode/skills/*/SKILL.md`: convenciones reusables.
- `docs/`: alcance, dominio, diseño, criterios y prompt inicial.
- `prototype/index.html`: demostración navegable local con datos de ejemplo y diseño light/dark.

## Importante
Los nombres de ramos/documentos del mockup son ilustrativos. La malla oficial debe validarse antes de importar datos reales. No hay autenticación, almacenamiento, aportes ni descargas reales aún.
