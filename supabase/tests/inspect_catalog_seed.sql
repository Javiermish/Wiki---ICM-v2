-- Generated read-only verification of INITIAL seed. Run before administrative edits.
-- Existing edits are reported, never overwritten. Not a migration or a destructive test.
with expected(id,slug,curriculum_id,name,code,description,kind,curricular_semester,elective_area_id,status) as (values
  ('demo-calculo-i', 'calculo-i', 'plan-ilustrativo', 'Cálculo I', 'DEMO-C1', null, 'regular', 1, null, 'active'),
  ('demo-algebra-i', 'algebra-i', 'plan-ilustrativo', 'Álgebra I', 'DEMO-A1', null, 'regular', 1, null, 'active'),
  ('demo-fisica-i', 'fisica-i', 'plan-ilustrativo', 'Física I', 'DEMO-F1', null, 'regular', 2, null, 'active'),
  ('demo-programacion', 'programacion', 'plan-ilustrativo', 'Programación', 'DEMO-P1', null, 'regular', 2, null, 'active'),
  ('demo-ecuaciones', 'ecuaciones-diferenciales', 'plan-ilustrativo', 'Ecuaciones Diferenciales', 'DEMO-ED', null, 'regular', 3, null, 'active'),
  ('demo-geometria', 'geometria', 'plan-ilustrativo', 'Geometría', null, null, 'regular', 3, null, 'active'),
  ('demo-electivo-numerico', 'electivo-numerico', 'plan-ilustrativo', 'Taller de Simulación Numérica', 'DEMO-EN', 'Electivo ficticio para explorar métodos de simulación.', 'elective', null, 'numerico', 'active'),
  ('demo-electivo-discreta', 'electivo-discreta', 'plan-ilustrativo', 'Grafos y Redes', null, 'Electivo ilustrativo; no representa una oferta académica oficial.', 'elective', null, 'discreta', 'active'),
  ('demo-electivo-estadistica', 'electivo-estadistica', 'plan-ilustrativo', 'Laboratorio de Datos', 'DEMO-EE', null, 'elective', null, 'estadistica', 'active')
)
select e.id, case when c.id is null then 'MISSING'
  when (c.slug,c.curriculum_id,c.name,c.code,c.description,c.kind,c.curricular_semester,c.elective_area_id,c.status)
    is distinct from (e.slug,e.curriculum_id,e.name,e.code,e.description,e.kind,e.curricular_semester,e.elective_area_id,e.status)
  then 'DIFFERS' else 'MATCH' end as verification
from expected e left join public.courses c on c.id=e.id order by e.id;
with expected(id,name,position) as (values
  ('numerico', 'Numérico', 0),
  ('discreta', 'Discreta', 1),
  ('optimizacion', 'Optimización', 2),
  ('estadistica', 'Estadística', 3),
  ('otro', 'Otro', 4)
)
select e.id, case when a.id is null then 'MISSING'
  when (a.name,a.position) is distinct from (e.name,e.position) then 'DIFFERS' else 'MATCH' end as verification
from expected e left join public.elective_areas a on a.id=e.id order by e.position;
