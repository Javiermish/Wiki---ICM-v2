# Depuración acotada Hito 2.3 — metadatos de subida

- [x] Rastrear formulario, transporte multipart, validación servidor y RPC histórica/incremental.
- [x] Reproducir con borrador del formato real de `/aportar`, comprobando números JSON y rechazo SQL histórico.
- [x] Corregir respuesta HTTP de reserva sin filtrar errores privados ni relajar validación.
- [x] Verificar incremental existente en PostgreSQL efímero, preservación y seguridad; no aplicar remotamente.
- [x] Ejecutar pruebas, lint y build; documentar causa y repetición manual.

Archivos: ruta API de materiales, pruebas de endpoint, fixture de formulario y runner SQL; documentación Hito 2.3. No modificar UI, dominio ni migraciones históricas. La incremental de Tareas ya preparada es suficiente.

Riesgos: Tareas seguirá rechazada hasta autorizar y aplicar la incremental remotamente. El SQL local utiliza Auth sintética; no demuestra integración Supabase/R2. Preservar cambios previos; sin commit, push, despliegue ni Hito 2.4.
