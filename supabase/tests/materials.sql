-- ONLY disposable local DB. Real RLS/grants with synthetic Supabase Auth.
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
 ('25000000-0000-0000-0000-000000000001','material-owner@example.invalid',now()),
 ('25000000-0000-0000-0000-000000000002','material-stranger@example.invalid',now()),
 ('25000000-0000-0000-0000-000000000003','material-reviewer@example.invalid',now()),
 ('25000000-0000-0000-0000-000000000004','material-unverified@example.invalid',null);
update public.user_roles set role = 'moderator' where user_id in
 ('25000000-0000-0000-0000-000000000003','25000000-0000-0000-0000-000000000004');
-- Session-invoker helper calls the real API, never SECURITY DEFINER.
create function pg_temp.reserve(op uuid, changes jsonb default '{}', hash text default repeat('a',64)) returns public.materials
language sql as $$
 select public.reserve_material_upload(op,
   '{"courseId":"demo-calculo-i","academicYear":2024,"academicTerm":2,"category":"certamen","documentNumber":2,"title":"Integrales"}'::jsonb || changes,
   'original.pdf','application/pdf',42,'pdf',hash);
$$;
set local role anon;
select pg_temp.assert_true((select count(*) = 0 from public.public_materials),'empty public material view');
select pg_temp.denied('select * from public.materials');
select pg_temp.denied('select * from public.course_offerings');
select pg_temp.denied('select * from public.material_review_events');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid())$q$);
select pg_temp.denied('select public.expire_material_uploads()');
select pg_temp.denied('select public.mark_material_storage_deleted(gen_random_uuid())');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000004',true);
select pg_temp.denied('select pg_temp.reserve(gen_random_uuid())');
select set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true((pg_temp.reserve('25000000-0000-0000-0000-000000000011')).status = 'pending','reservation pending');
select pg_temp.assert_true((select upload_state = 'uploading' and uploaded_by = auth.uid()
 and storage_key = 'materials/' || auth.uid() || '/' || id || '.pdf' from public.materials),'identity and storage key imposed');
select pg_temp.assert_true((select count(*) = 1 from public.course_offerings where academic_year = 2024 and academic_term = 2),'academic period not curricular semester');
select pg_temp.assert_true((select count(*) = 0 from public.public_materials),'uploading never public');
select pg_temp.assert_true((pg_temp.reserve('25000000-0000-0000-0000-000000000011')).id = (select id from public.materials),'idempotent same operation');
select pg_temp.denied($q$select pg_temp.reserve('25000000-0000-0000-0000-000000000011','{"title":"Different"}')$q$,'55000');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid())$q$,'23505');
reset role;
update public.materials set submitted_at = now() - interval '25 hours';
set local role service_role;
select pg_temp.assert_true((select count(*) = 0 from public.expire_material_uploads()),'old submission with fresh lease never expires');
reset role;
update public.materials set updated_at = now() - interval '25 hours';
select set_config('test.old_lease',(select updated_at::text from public.materials),true);
select set_config('test.original_submission',(select submitted_at::text from public.materials),true);
set local role authenticated;
select pg_temp.denied($q$select pg_temp.reserve('25000000-0000-0000-0000-000000000011','{"title":"Different"}')$q$,'55000');
select pg_temp.assert_true((select updated_at = current_setting('test.old_lease')::timestamptz from public.materials),'payload collision never renews lease');
select pg_temp.reserve('25000000-0000-0000-0000-000000000011');
select pg_temp.assert_true((select updated_at >= clock_timestamp() - interval '1 minute'
 and submitted_at = current_setting('test.original_submission')::timestamptz from public.materials),'identical retry refreshes lease without changing original submission');
reset role;
set local role service_role;
select pg_temp.assert_true((select count(*) = 0 from public.expire_material_uploads()),'renewed retry protected from expiry');
reset role;
set local role authenticated;
select pg_temp.denied('update public.materials set upload_state = ''ready''');
select pg_temp.denied('update public.materials set status = ''approved''');
select pg_temp.denied('delete from public.materials');
select pg_temp.denied('insert into public.course_offerings(course_id,academic_year,academic_term) values (''demo-calculo-i'',2025,1)');
select pg_temp.denied($q$select public.finalize_material_upload(gen_random_uuid(),auth.uid())$q$);
select pg_temp.denied($q$select public.fail_material_upload(gen_random_uuid(),auth.uid())$q$);
select pg_temp.denied('select public.mark_material_storage_deleted(gen_random_uuid())');
select pg_temp.denied('select public.expire_material_uploads()');
select pg_temp.denied($q$select public.review_material((select id from public.materials),'approved','Student forged')$q$);
select pg_temp.reserve('25000000-0000-0000-0000-000000000012','{"section":"B"}');
select pg_temp.reserve('25000000-0000-0000-0000-000000000013','{"instructor":"Another professor"}');
select pg_temp.reserve('25000000-0000-0000-0000-000000000014','{"version":"Solution"}');
select pg_temp.assert_true((select count(*) = 4 from public.materials),'legitimate versions preserved');
-- Constraints and JSON shape, with distinct hash to avoid duplicate interference.
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),'{"academicYear":2101}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),'{"academicTerm":3}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),'{"academicYear":"2024"}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),'{"documentNumber":null}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),'{"documentNumber":0}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),'{"documentNumber":1.5}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),'{"category":"other"}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),'{"uploadedBy":"forged"}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),'{"section":{}}')$q$,'22023');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),jsonb_build_object('title',repeat('x',201)),repeat('b',64))$q$,'23514');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),jsonb_build_object('title',E'a\nb'),repeat('b',64))$q$,'23514');
select pg_temp.denied($q$select public.reserve_material_upload(gen_random_uuid(),'{"courseId":"demo-calculo-i","academicYear":2024,"academicTerm":2,"category":"apunte"}','x.pdf','application/pdf',26214401,'pdf',repeat('b',64))$q$,'23514');
select pg_temp.denied($q$select public.reserve_material_upload(gen_random_uuid(),'{"courseId":"demo-calculo-i","academicYear":2024,"academicTerm":2,"category":"apunte"}','x.pdf','image/png',1,'pdf',repeat('b',64))$q$,'23514');
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),'{}','not-a-sha256')$q$,'23514');
select pg_temp.reserve('25000000-0000-0000-0000-000000000015','{"category":"apunte","documentNumber":null}',repeat('c',64));
select set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*) = 0 from public.materials),'stranger sees no private rows');
select pg_temp.assert_true((select count(*) = 0 from public.course_offerings),'stranger sees no private offering');
select pg_temp.assert_true((select count(*) = 0 from public.material_review_events),'stranger sees no events');
-- Idempotency scope belongs to the account; identical bytes from another account allowed.
select pg_temp.reserve('25000000-0000-0000-0000-000000000011');
select pg_temp.assert_true((select count(*) = 1 from public.materials),'other account independent operation and hash');
select set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true((select count(*) = 6 from public.materials),'reviewer reads all queue');
select pg_temp.denied($q$select public.review_material((select id from public.materials where operation_id = '25000000-0000-0000-0000-000000000012'),'approved','Not ready')$q$,'55000');
reset role;
-- Persist IDs in session settings, then exercise ONLY service_role for readiness.
select set_config('test.material', (select id::text from public.materials where operation_id = '25000000-0000-0000-0000-000000000012'),true);
set local role service_role;
select pg_temp.assert_true((public.finalize_material_upload(current_setting('test.material')::uuid,'25000000-0000-0000-0000-000000000001')).upload_state = 'ready','service finalization');
select pg_temp.assert_true((public.finalize_material_upload(current_setting('test.material')::uuid,'25000000-0000-0000-0000-000000000001')).upload_state = 'ready','finalize retry');
select pg_temp.denied($q$select public.fail_material_upload(current_setting('test.material')::uuid,'25000000-0000-0000-0000-000000000001')$q$,'55000');
select pg_temp.denied($q$select public.mark_material_storage_deleted(current_setting('test.material')::uuid)$q$,'55000');
select pg_temp.denied($q$select public.finalize_material_upload(current_setting('test.material')::uuid,'25000000-0000-0000-0000-000000000002')$q$,'22023');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000004',true);
select pg_temp.denied($q$select public.review_material(current_setting('test.material')::uuid,'approved','Unverified moderator')$q$);
select set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000003',true);
select pg_temp.denied($q$select public.review_material(current_setting('test.material')::uuid,'approved',' ')$q$,'22023');
select pg_temp.assert_true((public.review_material(current_setting('test.material')::uuid,'approved','Verified bytes and rights')).status = 'approved','atomic approval');
select pg_temp.denied($q$select public.review_material(current_setting('test.material')::uuid,'rejected','Second review')$q$,'55000');
select pg_temp.assert_true((select count(*) = 1 from public.material_review_events),'single audit event');
select pg_temp.denied('insert into public.material_review_events(material_id,actor_id,action,notes) values (gen_random_uuid(),auth.uid(),''approved'',''Forged'')');
select pg_temp.denied('update public.material_review_events set notes = ''Rewrite''');
reset role;
select pg_temp.denied('delete from public.material_review_events','55000');
select pg_temp.denied('truncate public.material_review_events','55000');
set local role anon;
select pg_temp.assert_true((select count(*) = 1 from public.public_materials),'anon approved ready only');
select pg_temp.denied('select storage_key from public.public_materials','42703');
select pg_temp.denied('select uploaded_by from public.public_materials','42703');
select pg_temp.denied('select original_filename from public.public_materials','42703');
select pg_temp.denied('select sha256 from public.public_materials','42703');
select pg_temp.denied('select submitted_at from public.public_materials','42703');
select pg_temp.denied('select * from public.materials');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*) = 1 from public.materials),'approved raw rows remain private to strangers');
select pg_temp.assert_true((select count(*) = 1 from public.public_materials),'stranger uses public allowlist');
reset role;
-- Failure and expiration are terminal, retry-safe, never touch ready or reviewed rows.
select set_config('test.failed', (select id::text from public.materials where operation_id = '25000000-0000-0000-0000-000000000013'),true);
set local role service_role;
select pg_temp.assert_true((public.fail_material_upload(current_setting('test.failed')::uuid,'25000000-0000-0000-0000-000000000001')).upload_state = 'failed','mark failed');
select pg_temp.assert_true((public.fail_material_upload(current_setting('test.failed')::uuid,'25000000-0000-0000-0000-000000000001')).upload_state = 'failed','fail retry');
select pg_temp.assert_true((public.mark_material_storage_deleted(current_setting('test.failed')::uuid)).storage_deleted_at is not null,'failed storage deletion marked');
select set_config('test.deletion_timestamp',(select storage_deleted_at::text from public.materials where id = current_setting('test.failed')::uuid),true);
select pg_temp.assert_true((public.mark_material_storage_deleted(current_setting('test.failed')::uuid)).storage_deleted_at = current_setting('test.deletion_timestamp')::timestamptz,'deletion marker retry preserves timestamp');
select pg_temp.assert_true((select count(*) = 0 from public.materials where upload_state = 'failed' and storage_deleted_at is null),'marked failed row excluded from deletion retry queue');
select pg_temp.denied($q$select public.finalize_material_upload(current_setting('test.failed')::uuid,'25000000-0000-0000-0000-000000000001')$q$,'55000');
reset role;
update public.materials set submitted_at = now() - interval '25 hours',updated_at = now() - interval '25 hours';
set local role service_role;
select pg_temp.assert_true((select count(*) = 4 from public.expire_material_uploads()),'only abandoned uploading expire');
select pg_temp.assert_true((select count(*) = 0 from public.expire_material_uploads()),'cleanup retry no changes');
select pg_temp.assert_true((select count(*) = 5 from public.materials where upload_state = 'failed'),'failed keys remain available for deletion retries');
select pg_temp.assert_true((select count(*) = 4 from public.materials where upload_state = 'failed' and storage_deleted_at is null),'only unmarked failed keys remain for deletion retries');
select pg_temp.assert_true((select status = 'approved' and upload_state = 'ready' from public.materials where id = current_setting('test.material')::uuid),'cleanup preserves publication');
reset role;
-- Inject an audit failure: the entire review, including fields and status, must roll back.
set local role authenticated;
select set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000001',true);
select pg_temp.reserve('25000000-0000-0000-0000-000000000016','{}',repeat('d',64));
reset role;
select set_config('test.rollback', (select id::text from public.materials where operation_id = '25000000-0000-0000-0000-000000000016'),true);
set local role service_role;
select public.finalize_material_upload(current_setting('test.rollback')::uuid,'25000000-0000-0000-0000-000000000001');
reset role;
create function pg_temp.fail_audit() returns trigger language plpgsql as $$begin raise exception 'Injected failure' using errcode = 'P0001'; end $$;
create trigger fail_material_audit before insert on public.material_review_events for each row execute function pg_temp.fail_audit();
set local role authenticated;
select set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000003',true);
select pg_temp.denied($q$select public.review_material(current_setting('test.rollback')::uuid,'approved','Audit must succeed')$q$,'P0001');
select pg_temp.assert_true((select status = 'pending' and reviewed_by is null and reviewed_at is null and review_notes is null from public.materials where id = current_setting('test.rollback')::uuid),'rollback review fields');
select pg_temp.assert_true((select count(*) = 1 from public.material_review_events),'rollback audit event');
reset role;
drop trigger fail_material_audit on public.material_review_events;
set local role authenticated;
select pg_temp.assert_true((public.review_material(current_setting('test.rollback')::uuid,'rejected','No permission to distribute')).status = 'rejected','rejection also audited');
select pg_temp.assert_true((select count(*) = 1 from public.public_materials),'rejected never public');
select set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true((pg_temp.reserve('25000000-0000-0000-0000-000000000012','{"section":"B"}')).status = 'approved','idempotent retry after review');
select pg_temp.assert_true((pg_temp.reserve('25000000-0000-0000-0000-000000000013','{"instructor":"Another professor"}')).upload_state = 'failed','idempotent failed retry cannot resurrect');
reset role;
update public.courses set status = 'archived' where id = 'demo-calculo-i';
set local role authenticated;
select pg_temp.denied($q$select pg_temp.reserve(gen_random_uuid(),'{}',repeat('e',64))$q$,'22023');
select pg_temp.assert_true((select count(*) = 1 from public.public_materials),'archival does not unpublish approved materials');
reset role;
select pg_temp.denied($q$insert into public.course_offerings(course_id,academic_year,academic_term) values ('demo-calculo-i',2024,2)$q$,'23505');
select pg_temp.denied($q$insert into public.course_offerings(course_id,academic_year,academic_term) values ('demo-calculo-i',2024,3)$q$,'23514');
select pg_temp.denied($q$insert into public.course_offerings(course_id,academic_year,academic_term) values ('missing-course',2024,1)$q$,'23503');
-- Infrastructure fixture bypasses API quotas to verify the bounded cleanup batch.
insert into public.materials(id,offering_id,category,document_number,original_filename,mime_type,bytes,extension,
 sha256,storage_key,uploaded_by,operation_id,submitted_at,updated_at)
select x.id,(select id from public.course_offerings limit 1),'apunte',n,'x.pdf','application/pdf',1,'pdf',
 repeat('f',64),'materials/25000000-0000-0000-0000-000000000001/' || x.id || '.pdf',
 '25000000-0000-0000-0000-000000000001',gen_random_uuid(),now() - interval '25 hours',now() - interval '25 hours'
from generate_series(100,200) n cross join lateral (select gen_random_uuid() as id where n is not null) x;
set local role service_role;
select pg_temp.assert_true((select count(*) = 100 from public.expire_material_uploads()),'cleanup bounded at 100');
select pg_temp.assert_true((select count(*) = 1 from public.expire_material_uploads()),'cleanup subsequent batch');
select pg_temp.assert_true((select count(*) = 0 from public.expire_material_uploads()),'cleanup drained');
rollback;
