-- Disposable LOCAL PostgreSQL/Supabase only; run after all four migrations.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.denied(statement text, expected text default '42501') returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlstate = expected then return; end if;
    raise exception 'Expected %, got %: %', expected, sqlstate, sqlerrm;
  end;
  raise exception 'Unexpectedly allowed: %', statement;
end $$;
select pg_temp.assert_true((select count(*) = 9 from public.courses), 'exact nine fixture courses');
select pg_temp.assert_true((select count(*) = 5 from public.elective_areas), 'five areas');
select pg_temp.assert_true(private.course_name_key(U&'A\0301lgebra... I') = 'algebra i', 'decomposed accent normalization');
select pg_temp.assert_true(private.course_name_key(U&'An\1AB0lisis') = 'an lisis', 'extended mark is separator in normalization v1');
select pg_temp.assert_true(not private.course_name_supported('ΟΣ') and not private.course_name_supported('ος'), 'Greek names outside explicit V1 alphabet');
select pg_temp.assert_true(not private.course_name_supported('A²B'), 'superscript outside explicit V1 alphabet');
select pg_temp.assert_true(private.course_name_supported('Álgebra – Métodos'), 'accented Latin and editorial punctuation supported');
insert into auth.users(id,email,email_confirmed_at) values
 ('22000000-0000-0000-0000-000000000001','catalog-student@example.invalid',now()),
 ('22000000-0000-0000-0000-000000000002','catalog-admin@example.invalid',now()),
 ('22000000-0000-0000-0000-000000000003','catalog-mod@example.invalid',now()),
 ('22000000-0000-0000-0000-000000000004','catalog-unverified@example.invalid',null);
update public.user_roles set role = 'admin' where user_id in ('22000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000004');
update public.user_roles set role = 'moderator' where user_id = '22000000-0000-0000-0000-000000000003';
set local role anon;
select pg_temp.assert_true((select count(*) = 9 from public.courses), 'anonymous active catalog');
select pg_temp.denied('select * from public.course_creation_requests');
select pg_temp.denied($q$select public.review_course_request(gen_random_uuid(),'approved',null)$q$);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','22000000-0000-0000-0000-000000000001',true);
select pg_temp.denied($q$insert into public.courses(name,kind,curricular_semester,curriculum_id) values ('Intruso','regular',1,'plan-ilustrativo')$q$);
insert into public.course_creation_requests(id,name,kind,curricular_semester,curriculum_id,justification)
 values ('22000000-0000-0000-0000-000000000011','Análisis solicitado','regular',4,'plan-ilustrativo','Falta en catálogo');
select pg_temp.assert_true((select requested_by = auth.uid() and status = 'pending' from public.course_creation_requests), 'identity and status imposed');
select pg_temp.denied($q$select public.review_course_request('22000000-0000-0000-0000-000000000011','approved',null)$q$);
select pg_temp.denied('update public.course_creation_requests set status = ''approved''');
select set_config('request.jwt.claim.sub','22000000-0000-0000-0000-000000000004',true);
select pg_temp.assert_true((select count(*) = 0 from public.course_creation_requests), 'unverified admin not privileged');
select pg_temp.denied($q$insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification) values ('No confirmado','regular',1,'plan-ilustrativo','Motivo')$q$);
select set_config('request.jwt.claim.sub','22000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true((select count(*) = 1 from public.course_creation_requests), 'moderator reads queue');
select pg_temp.denied($q$insert into public.courses(name,kind,curricular_semester,curriculum_id) values ('Intruso mod','regular',1,'plan-ilustrativo')$q$);
select pg_temp.denied($q$select public.review_course_request('22000000-0000-0000-0000-000000000011','rejected',' ')$q$,'22023');
select pg_temp.assert_true(public.review_course_request('22000000-0000-0000-0000-000000000011','approved','Propuesta original') is not null, 'controlled moderator approval');
select pg_temp.assert_true((select slug = 'ramo-' || id and version = 1 from public.courses where name = 'Análisis solicitado'), 'new course UUID and stable default slug');
select pg_temp.denied($q$select public.review_course_request('22000000-0000-0000-0000-000000000011','approved','Reintento')$q$,'55000');
select pg_temp.denied('delete from public.courses');
select pg_temp.denied($q$insert into public.course_admin_events(course_id,action) values ('demo-calculo-i','created')$q$);
select set_config('request.jwt.claim.sub','22000000-0000-0000-0000-000000000002',true);
select pg_temp.denied($q$insert into public.courses(name,kind,curricular_semester,curriculum_id) values ('ΟΣ','regular',2,'plan-ilustrativo')$q$,'23514');
select pg_temp.denied($q$insert into public.courses(name,kind,curricular_semester,curriculum_id) values ('A²B','regular',2,'plan-ilustrativo')$q$,'23514');
select pg_temp.denied($q$insert into public.courses(name,kind,curricular_semester,curriculum_id) values ('CÁLCULO... I','regular',2,'plan-ilustrativo')$q$,'23505');
select pg_temp.denied($q$insert into public.courses(name,code,kind,curricular_semester,curriculum_id) values ('Otro nombre',' demo-c1 ','regular',2,'plan-ilustrativo')$q$,'23505');
select pg_temp.denied($q$insert into public.courses(name,kind,curriculum_id) values ('Sin semestre','regular','plan-ilustrativo')$q$,'23514');
select pg_temp.denied($q$insert into public.courses(name,kind,curricular_semester,elective_area_id,curriculum_id) values ('Mezclado','elective',1,'otro','plan-ilustrativo')$q$,'23514');
insert into public.courses(name,code,kind,curricular_semester,curriculum_id)
 values ('Curso de prueba regular','SQL-R','regular',5,'plan-ilustrativo');
update public.courses set curricular_semester = 6 where code = 'SQL-R' and version = 1;
select pg_temp.assert_true((select curricular_semester = 6 and version = 2 and slug = 'ramo-' || id from public.courses where code = 'SQL-R'), 'regular creation and semester change preserve identity');
with changed as (update public.courses set curricular_semester = 7 where code = 'SQL-R' and version = 1 returning id)
 select pg_temp.assert_true((select count(*) = 0 from changed), 'stale version changes no rows');
insert into public.courses(name,code,kind,elective_area_id,curriculum_id)
 values ('Curso de prueba electivo','SQL-E','elective','numerico','plan-ilustrativo');
update public.courses set elective_area_id = 'estadistica' where code = 'SQL-E' and version = 1;
select pg_temp.assert_true((select elective_area_id = 'estadistica' and curricular_semester is null and version = 2 and slug = 'ramo-' || id from public.courses where code = 'SQL-E'), 'elective creation and area change preserve identity');
update public.courses set kind = 'elective', curricular_semester = null, elective_area_id = 'otro', status = 'archived' where code = 'SQL-R';
select pg_temp.assert_true((select kind = 'elective' and curricular_semester is null and elective_area_id = 'otro' and status = 'archived' and slug = 'ramo-' || id from public.courses where code = 'SQL-R'), 'reclassification and archive preserve identity');
reset role;
set local role anon;
select pg_temp.assert_true((select count(*) = 0 from public.courses where code = 'SQL-R'), 'new archived course hidden publicly');
reset role;
set local role authenticated;
update public.courses set status = 'active' where code = 'SQL-R';
select pg_temp.assert_true((select status = 'active' and version = 4 and slug = 'ramo-' || id from public.courses where code = 'SQL-R'), 'restoration retains stable identity');
select pg_temp.denied($q$update public.courses set slug = 'otra-ruta' where id = 'demo-calculo-i'$q$);
update public.courses set status = 'archived' where id = 'demo-calculo-i' and version = 1;
select pg_temp.assert_true((select version = 2 and slug = 'calculo-i' from public.courses where id = 'demo-calculo-i'), 'version increment and stable identity');
select pg_temp.denied($q$insert into public.courses(name,kind,curricular_semester,curriculum_id) values ('cálculo! i','regular',3,'plan-ilustrativo')$q$,'23505');
select pg_temp.assert_true((select count(*) = 1 from public.course_request_review_events), 'one review event');
select pg_temp.assert_true((select count(*) = 1 from public.course_admin_events where course_id = 'demo-calculo-i' and actor_id = auth.uid() and action = 'updated'), 'direct admin update audited');
select pg_temp.denied('update public.course_admin_events set action = ''created''');
reset role;
select pg_temp.denied($q$update public.courses set id = 'changed-id' where id = 'demo-calculo-i'$q$);
select pg_temp.denied($q$update public.courses set slug = 'changed-slug' where id = 'demo-calculo-i'$q$);
select pg_temp.denied('delete from public.course_admin_events','55000');
select pg_temp.denied('truncate public.course_request_review_events','55000');
-- An audit failure must roll back both publication and the request transition.
select set_config('request.jwt.claim.sub','22000000-0000-0000-0000-000000000001',true);
insert into public.course_creation_requests(id,name,kind,curricular_semester,curriculum_id,justification,requested_by) values
 ('22000000-0000-0000-0000-000000000012','Prueba transaccional','regular',5,'plan-ilustrativo','Justificación transaccional','22000000-0000-0000-0000-000000000001'),
 ('22000000-0000-0000-0000-000000000013','Cálculo I','regular',5,'plan-ilustrativo','Duplicado a revisar explícitamente','22000000-0000-0000-0000-000000000001');
create function pg_temp.fail_review_audit() returns trigger language plpgsql as $$ begin raise exception 'Injected audit failure'; end $$;
create trigger injected_failure before insert on public.course_request_review_events for each row execute function pg_temp.fail_review_audit();
set local role authenticated;
select set_config('request.jwt.claim.sub','22000000-0000-0000-0000-000000000003',true);
select pg_temp.denied($q$select public.review_course_request('22000000-0000-0000-0000-000000000012','approved','Revisado')$q$,'P0001');
select pg_temp.assert_true((select status = 'pending' from public.course_creation_requests where id = '22000000-0000-0000-0000-000000000012'), 'failed audit keeps pending');
select pg_temp.assert_true((select count(*) = 0 from public.courses where name = 'Prueba transaccional'), 'failed audit creates no course');
reset role;
select pg_temp.assert_true((select count(*) = 0 from public.course_admin_events where after_data->>'name' = 'Prueba transaccional'), 'failed audit leaves no admin event');
drop trigger injected_failure on public.course_request_review_events;
set local role authenticated;
select pg_temp.denied($q$select public.review_course_request('22000000-0000-0000-0000-000000000013','approved','Duplicado')$q$,'23505');
select pg_temp.assert_true((select status = 'pending' from public.course_creation_requests where id = '22000000-0000-0000-0000-000000000013'), 'duplicate approval keeps pending');
select pg_temp.assert_true(public.review_course_request('22000000-0000-0000-0000-000000000013','rejected','Ya existe') is null, 'rejection returns null');
select pg_temp.assert_true((select status = 'rejected' and resulting_course_id is null from public.course_creation_requests where id = '22000000-0000-0000-0000-000000000013'), 'rejection consistent');
reset role;
set local role anon;
select pg_temp.assert_true((select count(*) = 0 from public.courses where id = 'demo-calculo-i'), 'archived hidden by RLS');
reset role;
rollback;
