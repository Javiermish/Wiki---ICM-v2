-- ONLY disposable local DB: real RPCs/RLS/grants, synthetic Auth, no storage calls.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(statement text,expected text default '42501') returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
   if sqlstate = expected then return; end if;
   raise exception 'Expected %, got %: %',expected,sqlstate,sqlerrm;
 end;
 raise exception 'Unexpectedly allowed: %',statement;
end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('28000000-0000-0000-0000-000000000001','task-owner@example.invalid',now()),
 ('28000000-0000-0000-0000-000000000002','task-stranger@example.invalid',now()),
 ('28000000-0000-0000-0000-000000000003','task-reviewer@example.invalid',now()),
 ('28000000-0000-0000-0000-000000000004','task-unverified@example.invalid',null);
update public.user_roles set role = 'moderator' where user_id = '28000000-0000-0000-0000-000000000003';
-- Invoker, not definer: calls have exactly the tested session's permissions.
create function pg_temp.task(op uuid, changes jsonb default '{}') returns public.materials language sql as $$
 select public.reserve_material_upload(op,
   '{"courseId":"demo-calculo-i","academicYear":2024,"academicTerm":2,"category":"tarea","documentNumber":3}'::jsonb || changes,
   'original.pdf','application/pdf',42,'pdf',repeat('a',64));
$$;
set local role anon;
select pg_temp.denied('select pg_temp.task(gen_random_uuid())');
select pg_temp.denied('select * from public.materials');
select pg_temp.denied('select * from public.material_review_events');
reset role;
set local role service_role;
select pg_temp.denied('select pg_temp.task(gen_random_uuid())');
select pg_temp.denied($q$select public.review_material(gen_random_uuid(),'approved','Server is not reviewer')$q$);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','28000000-0000-0000-0000-000000000004',true);
select pg_temp.denied('select pg_temp.task(gen_random_uuid())');
select set_config('request.jwt.claim.sub','28000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true((pg_temp.task('28000000-0000-0000-0000-000000000011')).category = 'tarea','task reservation accepted');
select set_config('test.task', (select id::text from public.materials),true);
select pg_temp.assert_true((select status = 'pending' and upload_state = 'uploading' and uploaded_by = auth.uid()
 and storage_key = 'materials/' || auth.uid() || '/' || id || '.pdf' from public.materials),'owner/key and initial state imposed');
select pg_temp.assert_true((select academic_year = 2024 and academic_term = 2 from public.course_offerings),'offering uses declared academic period');
select pg_temp.assert_true((select curricular_semester = 1 from public.courses where id = 'demo-calculo-i'),'curricular semester unchanged');
select pg_temp.assert_true((pg_temp.task('28000000-0000-0000-0000-000000000011')).id = current_setting('test.task')::uuid,'same operation returns same task');
select pg_temp.denied($q$select pg_temp.task('28000000-0000-0000-0000-000000000011','{"documentNumber":4}')$q$,'55000');
select pg_temp.denied('select pg_temp.task(gen_random_uuid())','23505');
-- Identical bytes, period, category and number coexist for legitimate alternatives.
select pg_temp.task('28000000-0000-0000-0000-000000000012','{"section":"B"}');
select pg_temp.task('28000000-0000-0000-0000-000000000013','{"version":"Solución"}');
select pg_temp.task('28000000-0000-0000-0000-000000000014','{"instructor":"Otra profesora"}');
select pg_temp.assert_true((select count(*) = 4 and count(distinct offering_id) = 1 from public.materials),'sections/instructors/versions share offering without collision');
-- Missing, null, malformed and out-of-range numbers must never reserve a row.
select pg_temp.denied($q$select public.reserve_material_upload(gen_random_uuid(),'{"courseId":"demo-calculo-i","academicYear":2024,"academicTerm":2,"category":"tarea"}','original.pdf','application/pdf',42,'pdf',repeat('a',64))$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"documentNumber":null}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"documentNumber":0}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"documentNumber":-1}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"documentNumber":1000}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"documentNumber":1.5}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"documentNumber":"3"}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"documentNumber":true}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"documentNumber":{}}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"category":"tareas"}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"category":null}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"academicTerm":3}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.task(gen_random_uuid(),'{"uploadedBy":"forged","status":"approved"}')$q$,'22023');
select pg_temp.task('28000000-0000-0000-0000-000000000015','{"documentNumber":999}');
select pg_temp.assert_true((select count(*) = 5 from public.materials),'invalid metadata never inserts; upper boundary accepted');
select pg_temp.denied('update public.materials set status = ''approved''');
select pg_temp.denied('update public.materials set upload_state = ''ready''');
select pg_temp.denied('delete from public.materials');
select pg_temp.denied('select public.finalize_material_upload(current_setting(''test.task'')::uuid,auth.uid())');
select pg_temp.denied('select public.fail_material_upload(current_setting(''test.task'')::uuid,auth.uid())');
select pg_temp.denied('select public.expire_material_uploads()');
select pg_temp.denied('select public.mark_material_storage_deleted(current_setting(''test.task'')::uuid)');
select pg_temp.denied($q$select public.review_material(current_setting('test.task')::uuid,'approved','Not reviewer')$q$);
select set_config('request.jwt.claim.sub','28000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*) = 0 from public.materials),'stranger cannot read pending task');
select pg_temp.assert_true((select count(*) = 0 from public.course_offerings),'stranger cannot read private offering');
select set_config('request.jwt.claim.sub','28000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true((select count(*) = 5 from public.materials),'reviewer reads task queue');
select pg_temp.denied($q$select public.review_material(current_setting('test.task')::uuid,'approved','Not yet ready')$q$,'55000');
reset role;
select set_config('test.rejected', (select id::text from public.materials where operation_id = '28000000-0000-0000-0000-000000000012'),true);
-- Direct constraint probes are privileged test-only; they cannot be bypassed by RPC callers.
select pg_temp.denied('update public.materials set document_number = null where id = current_setting(''test.task'')::uuid','23514');
select pg_temp.denied('update public.materials set document_number = 0 where id = current_setting(''test.task'')::uuid','23514');
select pg_temp.denied('update public.materials set document_number = 1000 where id = current_setting(''test.task'')::uuid','23514');
select pg_temp.denied('update public.materials set category = ''tareas'' where id = current_setting(''test.task'')::uuid','23514');
set local role anon;
select pg_temp.assert_true((select count(*) = 0 from public.public_materials),'uploading task not public');
reset role;
set local role service_role;
select pg_temp.denied($q$select public.finalize_material_upload(current_setting('test.task')::uuid,'28000000-0000-0000-0000-000000000002')$q$,'22023');
select pg_temp.assert_true((public.finalize_material_upload(current_setting('test.task')::uuid,'28000000-0000-0000-0000-000000000001')).upload_state = 'ready','task finalization only by validator');
select pg_temp.assert_true((public.finalize_material_upload(current_setting('test.task')::uuid,'28000000-0000-0000-0000-000000000001')).upload_state = 'ready','finalization idempotent');
select public.finalize_material_upload(current_setting('test.rejected')::uuid,'28000000-0000-0000-0000-000000000001');
reset role;
set local role anon;
select pg_temp.assert_true((select count(*) = 0 from public.public_materials),'ready but pending tasks remain private');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','28000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true((public.review_material(current_setting('test.task')::uuid,'approved','Reviewed task')).status = 'approved','task approval');
select pg_temp.assert_true((public.review_material(current_setting('test.rejected')::uuid,'rejected','No permission')).status = 'rejected','task rejection');
select pg_temp.denied($q$select public.review_material(current_setting('test.task')::uuid,'approved','Duplicate')$q$,'55000');
select pg_temp.denied($q$select public.review_material(current_setting('test.rejected')::uuid,'approved','Resurrect')$q$,'55000');
select pg_temp.assert_true((select count(*) = 2 from public.material_review_events),'one audit event per reviewed task');
select pg_temp.denied('update public.material_review_events set notes = ''Rewrite''');
select set_config('request.jwt.claim.sub','28000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true((pg_temp.task('28000000-0000-0000-0000-000000000011')).status = 'approved','reservation retry cannot reset approval');
select pg_temp.assert_true((pg_temp.task('28000000-0000-0000-0000-000000000012','{"section":"B"}')).status = 'rejected','reservation retry cannot reset rejection');
select pg_temp.assert_true((select count(*) = 5 from public.materials),'owner still reads own pending/rejected/approved');
select set_config('request.jwt.claim.sub','28000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*) = 0 from public.materials),'stranger cannot read raw approved/rejected/pending tasks');
select pg_temp.assert_true((select count(*) = 0 from public.material_review_events),'stranger cannot read task audit');
select pg_temp.assert_true((select count(*) = 1 from public.public_materials where category = 'tarea'),'authenticated stranger reads approved task allowlist only');
reset role;
set local role anon;
select pg_temp.assert_true((select count(*) = 1 from public.public_materials),'only approved ready task public');
select pg_temp.assert_true((select id = current_setting('test.task')::uuid and category = 'tarea' and document_number = 3
 and academic_year = 2024 and academic_term = 2 from public.public_materials),'public task academic metadata');
select pg_temp.denied('select storage_key from public.public_materials','42703');
select pg_temp.denied('select original_filename from public.public_materials','42703');
select pg_temp.denied('select uploaded_by from public.public_materials','42703');
select pg_temp.denied('select * from public.materials');
select pg_temp.denied('select * from public.course_offerings');
reset role;
rollback;
