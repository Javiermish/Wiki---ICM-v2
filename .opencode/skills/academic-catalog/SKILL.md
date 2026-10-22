---
name: academic-catalog
description: Aplica las reglas del catálogo académico para nombres de documentos, semestres, asignaturas, filtros y moderación.
---
# Convenciones del dominio académico
- Semestre curricular: ubicación del ramo en la malla. Ejemplo: Cálculo I = 1.
- Periodo académico: instancia real en que se dictó el ramo, formato `AAAA-S` (S inicialmente 1 o 2). Ejemplo: 2024-2.
- Un ramo puede tener materiales de ambos periodos independientemente del semestre curricular.
- La relación es `Course 1 -> N CourseOffering 1 -> N Material`.
- Cada material registra: edición del ramo, tipo (`listado`, `apunte`, `certamen`), número opcional si corresponde, título opcional, nombre original separado del nombre público normalizado, sección/profesor opcional, estado de moderación y referencia privada/pública al objeto.
- Nombre público para certámenes: `Certamen {n} - {AAAA}-{S}`; para listados: `Listado {n} - {AAAA}-{S}`; para apuntes generales: `Apuntes - {AAAA}-{S}`. No inferir metadatos desde nombre subido.
- Dos materiales del mismo tipo/numero/periodo pueden coexistir si corresponden a secciones o versiones diferentes. Usar ID estable; distinguir con etiqueta secundaria si hace falta.
- Los materiales pendientes no son visibles ni descargables por cuentas públicas.
- La fecha de uso académico no es la fecha de subida.
- No inventar la malla oficial: fixtures de Hito 1 son ejemplos hasta verificar la malla real.
