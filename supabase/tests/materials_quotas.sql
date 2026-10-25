\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.reserve(n int) returns public.materials language sql as $$
 select public.reserve_material_upload(gen_random_uuid(),jsonb_build_object('courseId','demo-calculo-i','academicYear',2024,'academicTerm',2,'category','certamen','documentNumber',n),
 'x.pdf','application/pdf',1,'pdf',repeat('a',64));
$$;
insert into auth.users(id,email,email_confirmed_at) values
 ('26000000-0000-0000-0000-000000000001','material-quota@example.invalid',now()),
 ('26000000-0000-0000-0000-000000000002','material-independent@example.invalid',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select pg_temp.reserve(n) from generate_series(1,10) n;
do $$begin
 begin perform pg_temp.reserve(11); raise exception 'Quota not enforced';
 exception when sqlstate '22023' then null; end;
end $$;
reset role;
-- Failed uploads release pending quota but still consume the daily allowance.
set local role service_role;
select public.fail_material_upload(id,uploaded_by) from public.materials where uploaded_by = '26000000-0000-0000-0000-000000000001';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select pg_temp.reserve(n) from generate_series(11,20) n;
reset role;
set local role service_role;
select public.fail_material_upload(id,uploaded_by) from public.materials where uploaded_by = '26000000-0000-0000-0000-000000000001';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
do $$begin
 begin perform pg_temp.reserve(21); raise exception 'Daily quota not enforced';
 exception when sqlstate '22023' then null; end;
end $$;
select pg_temp.assert_true((select count(*) = 20 from public.materials),'daily count includes failures');
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000002',true);
select pg_temp.reserve(1);
select pg_temp.assert_true((select count(*) = 1 from public.materials),'quota independent and RLS isolates');
reset role;
update public.materials set submitted_at = now() - interval '25 hours' where uploaded_by = '26000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select pg_temp.reserve(21);
select pg_temp.assert_true((select count(*) = 21 from public.materials),'rolling daily window recovers');
rollback;
