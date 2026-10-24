-- LOCAL disposable DB only. Seed migrations intentionally commit.
\set ON_ERROR_STOP on
create temp table catalog_snapshot as select * from public.courses;
create temp table areas_snapshot as select * from public.elective_areas;
create temp table plans_snapshot as select * from public.curricula;
create temp table event_snapshot as select * from public.course_admin_events;
\ir ../migrations/202610230002_catalog_seed.sql
\ir ../migrations/202610230002_catalog_seed.sql
do $$ begin
 if exists (select * from public.courses except select * from catalog_snapshot)
   or exists (select * from catalog_snapshot except select * from public.courses)
   or exists (select * from public.course_admin_events except select * from event_snapshot)
   or exists (select * from public.elective_areas except select * from areas_snapshot)
   or exists (select * from public.curricula except select * from plans_snapshot)
 then raise exception 'Seed replay changed data or audit'; end if;
end $$;
-- Real subsequent operator edits must survive replay too.
update public.courses set name = 'Nombre editado por administración', status = 'archived' where id = 'demo-calculo-i';
update public.elective_areas set name = 'Área editada' where id = 'otro';
update public.curricula set name = 'Plan editado' where id = 'plan-ilustrativo';
truncate catalog_snapshot, areas_snapshot, plans_snapshot, event_snapshot;
insert into catalog_snapshot select * from public.courses;
insert into areas_snapshot select * from public.elective_areas;
insert into plans_snapshot select * from public.curricula;
insert into event_snapshot select * from public.course_admin_events;
\ir ../migrations/202610230002_catalog_seed.sql
do $$ begin
 if exists (select * from public.courses except select * from catalog_snapshot)
   or exists (select * from catalog_snapshot except select * from public.courses)
   or exists (select * from public.course_admin_events except select * from event_snapshot)
   or exists (select * from public.elective_areas except select * from areas_snapshot)
   or exists (select * from public.curricula except select * from plans_snapshot)
 then raise exception 'Seed replay overwrote edits'; end if;
end $$;
