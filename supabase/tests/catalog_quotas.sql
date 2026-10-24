-- Disposable LOCAL DB only; after all migrations. Authenticated API semantics.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(statement text,expected text default '22023') returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if sqlstate=expected then return; end if;
  raise exception 'Expected %, got %: %',expected,sqlstate,sqlerrm;
 end;
 raise exception 'Unexpectedly allowed: %',statement;
end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('23000000-0000-0000-0000-000000000001','quota-owner@example.invalid',now()),
 ('23000000-0000-0000-0000-000000000002','quota-other@example.invalid',now()),
 ('23000000-0000-0000-0000-000000000003','quota-moderator@example.invalid',now());
update public.user_roles set role='moderator' where user_id='23000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','23000000-0000-0000-0000-000000000001',true);
insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification)
 values ('Propuesta única','regular',1,'plan-ilustrativo','Justificación de prueba');
select pg_temp.denied($q$insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification)
 values ('PROPUESTA... ÚNICA','regular',2,'plan-ilustrativo','Justificación de prueba')$q$,'23505');
insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification)
 select 'Propuesta límite '||n,'regular',1,'plan-ilustrativo','Justificación de prueba' from generate_series(1,9) n;
select pg_temp.assert_true((select count(*)=10 from public.course_creation_requests),'ten pending allowed');
select pg_temp.denied($q$insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification)
 values ('Undécima propuesta','regular',1,'plan-ilustrativo','Justificación de prueba')$q$);
select set_config('request.jwt.claim.sub','23000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.course_creation_requests),'other user cannot see quota owner');
insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification)
 values ('PROPUESTA... ÚNICA','regular',1,'plan-ilustrativo','Justificación de prueba');
select pg_temp.assert_true((select count(*)=1 from public.course_creation_requests),'independent user quota and pending dedup scope');
select pg_temp.denied($q$insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification,requested_by)
 values ('Actor falso','regular',1,'plan-ilustrativo','Justificación de prueba','23000000-0000-0000-0000-000000000001')$q$,'42501');
-- Sequential submission/rejection keeps pending below 10 but must stop at 20/day.
do $$ declare n integer; request uuid; begin
 for n in 1..19 loop
  insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification)
   values ('Otra propuesta '||n,'regular',1,'plan-ilustrativo','Justificación de prueba') returning id into request;
  perform set_config('request.jwt.claim.sub','23000000-0000-0000-0000-000000000003',true);
  perform public.review_course_request(request,'rejected','Solicitud de prueba');
  perform set_config('request.jwt.claim.sub','23000000-0000-0000-0000-000000000002',true);
 end loop;
end $$;
select pg_temp.assert_true((select count(*)=20 from public.course_creation_requests),'twenty daily submissions including resolved');
select pg_temp.denied($q$insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification)
 values ('Vigésima primera','regular',1,'plan-ilustrativo','Justificación de prueba')$q$);
reset role;
-- Even privileged insertion cannot attribute a request to another session's actor.
select pg_temp.denied($q$insert into public.course_creation_requests(name,kind,curricular_semester,curriculum_id,justification,requested_by)
 values ('Otro actor SQL','regular',1,'plan-ilustrativo','Justificación de prueba','23000000-0000-0000-0000-000000000001')$q$,'42501');
rollback;
