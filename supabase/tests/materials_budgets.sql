-- Disposable local PostgreSQL only. Failed validation/retries consume the same budget.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$
begin
 begin execute statement; exception when insufficient_privilege then return; end;
 raise exception 'Unexpectedly allowed: %',statement;
end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('28000000-0000-0000-0000-000000000001','upload-budget-owner@example.invalid',now()),
 ('28000000-0000-0000-0000-000000000002','upload-budget-stranger@example.invalid',now()),
 ('28000000-0000-0000-0000-000000000003','upload-budget-unverified@example.invalid',null);
set local role anon;
select pg_temp.denied('select public.authorize_material_upload_attempt()');
select pg_temp.denied('select * from private.material_upload_budgets');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.denied('select public.authorize_material_upload_attempt()');
select set_config('request.jwt.claim.sub','28000000-0000-0000-0000-000000000003',true);
select pg_temp.denied('select public.authorize_material_upload_attempt()');
select set_config('request.jwt.claim.sub','28000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true(public.authorize_material_upload_attempt(),'first attempt allowed');
-- No materials need to exist: each call is independently charged before parsing.
select pg_temp.assert_true(public.authorize_material_upload_attempt(),'validation failure/retry charged') from generate_series(2,20);
select pg_temp.assert_true(not public.authorize_material_upload_attempt(),'21st attempt denied');
select pg_temp.assert_true(not public.authorize_material_upload_attempt(),'subsequent attempt denied');
select pg_temp.denied('select * from private.material_upload_budgets');
select pg_temp.denied('update private.material_upload_budgets set attempts=0');
select set_config('request.jwt.claim.sub','28000000-0000-0000-0000-000000000002',true);
select pg_temp.denied('select * from private.material_upload_budgets');
select pg_temp.assert_true(public.authorize_material_upload_attempt(),'independent account budget');
reset role;
select pg_temp.assert_true((select attempts = 20 from private.material_upload_budgets where user_id = '28000000-0000-0000-0000-000000000001'),'denials do not increment beyond 20');
select pg_temp.assert_true((select count(*) = 2 from private.material_upload_budgets),'unauthorized calls never create budget rows');
update private.material_upload_budgets set window_started_at = clock_timestamp() - interval '16 minutes'
 where user_id = '28000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','28000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true(public.authorize_material_upload_attempt(),'new window allowed');
reset role;
select pg_temp.assert_true((select attempts = 1 and window_started_at >= clock_timestamp() - interval '1 minute'
 from private.material_upload_budgets where user_id = '28000000-0000-0000-0000-000000000001'),'rollover sets DB clock and resets count');
select pg_temp.assert_true((select attempts = 1 from private.material_upload_budgets where user_id = '28000000-0000-0000-0000-000000000002'),'rollover does not alter stranger budget');
rollback;
