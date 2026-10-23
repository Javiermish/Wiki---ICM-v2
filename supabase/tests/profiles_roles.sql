-- Run as postgres against a disposable LOCAL Supabase DB after the migration.
-- All fixtures are synthetic and rolled back. No pgTAP extension required.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.denied(statement text, expected_state text default '42501') returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Unexpected SQLSTATE %, expected %: %', sqlstate, expected_state, sqlerrm;
  end;
  raise exception 'Statement unexpectedly allowed: %', statement;
end $$;

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
 ('21000000-0000-0000-0000-000000000001', 'student-sql-test@example.invalid', now(), '{"role":"admin","display_name":"Student"}'),
 ('21000000-0000-0000-0000-000000000002', 'admin-sql-test@example.invalid', now(), '{}'),
 ('21000000-0000-0000-0000-000000000003', 'unverified-sql-test@example.invalid', null, '{"role":"admin"}'),
 ('21000000-0000-0000-0000-000000000004', 'other-sql-test@example.invalid', now(), '{}');
select pg_temp.assert_true((select count(*) = 4 from public.user_roles where user_id::text like '21000000-%' and role = 'student'), 'metadata never grants privileges');
-- Trusted SQL-only setup, identical to bootstrap documented in AUTH_SQL.md.
update public.user_roles set role = 'admin' where user_id = '21000000-0000-0000-0000-000000000002';
insert into public.role_change_events(target_user_id, actor_id, old_role, new_role, reason)
values ('21000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'student', 'admin', 'SQL test bootstrap');

set local role anon;
select pg_temp.denied('select * from public.profiles');
select pg_temp.denied('select * from public.user_roles');
select pg_temp.denied('select * from public.role_change_events');
select pg_temp.denied('select * from public.list_account_users()');
select pg_temp.denied($q$select public.set_moderator('21000000-0000-0000-0000-000000000001', true, 'bad')$q$);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'own profile only');
select pg_temp.assert_true((select count(*) = 1 from public.user_roles), 'own role only');
select pg_temp.assert_true((select role = 'student' from public.user_roles), 'student role');
update public.profiles set display_name = 'New name' where id = auth.uid();
select pg_temp.assert_true((select display_name = 'New name' from public.profiles), 'own display name update');
with changed as (update public.profiles set display_name = 'Cross account' where id = '21000000-0000-0000-0000-000000000004' returning *)
select pg_temp.assert_true((select count(*) = 0 from changed), 'cross profile update blocked');
select pg_temp.denied('update public.profiles set created_at = now()');
select pg_temp.denied('update public.profiles set updated_at = now()');
select pg_temp.denied('update public.profiles set id = gen_random_uuid()');
select pg_temp.denied($q$update public.user_roles set role = 'admin'$q$);
select pg_temp.denied('delete from public.user_roles');
select pg_temp.denied('insert into public.profiles(id) values (auth.uid())');
select pg_temp.denied('select * from public.list_account_users()');
select pg_temp.denied($q$select public.set_moderator(auth.uid(), true, 'self escalation')$q$);
select pg_temp.assert_true((select count(*) = 0 from public.role_change_events), 'audit hidden from student');
select pg_temp.denied('delete from public.role_change_events');
select pg_temp.denied($q$insert into public.role_change_events(target_user_id,actor_id,old_role,new_role,reason) values (auth.uid(),auth.uid(),'student','admin','bad')$q$);

-- Confirmed email is checked in DB, not in JWT claims.
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.denied('select * from public.list_account_users()');
reset role;
update public.user_roles set role = 'admin' where user_id = '21000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000003', true);
select pg_temp.denied('select * from public.list_account_users()');
select pg_temp.denied($q$select public.set_moderator('21000000-0000-0000-0000-000000000001', true, 'unconfirmed admin')$q$);
reset role;
update public.user_roles set role = 'student' where user_id = '21000000-0000-0000-0000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true((select count(*) >= 4 from public.user_roles), 'admin reads roles');
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'even admin has own-profile table policy');
select pg_temp.assert_true((select count(*) = 1 from public.list_account_users(1,0)), 'bounded admin listing');
select pg_temp.assert_true((select email = 'student-sql-test@example.invalid' from public.list_account_users() where user_id = '21000000-0000-0000-0000-000000000001'), 'admin RPC returns email');
select pg_temp.denied('select * from public.list_account_users(201,0)', '22023');
select pg_temp.denied('select * from public.list_account_users(1,-1)', '22023');
select pg_temp.denied('select * from public.list_account_users(null,0)', '22023');
select pg_temp.denied($q$select public.set_moderator('21000000-0000-0000-0000-000000000003', true, 'unverified target')$q$, '22023');
select pg_temp.denied($q$select public.set_moderator('21000000-0000-0000-0000-000000000099', true, 'missing target')$q$, '22023');
select pg_temp.denied($q$select public.set_moderator('21000000-0000-0000-0000-000000000001', true, ' ')$q$, '22023');
select pg_temp.denied($q$select public.set_moderator('21000000-0000-0000-0000-000000000001', null, 'null flag')$q$, '22023');
select pg_temp.denied($q$select public.set_moderator(auth.uid(), false, 'protect admin')$q$);
select public.set_moderator('21000000-0000-0000-0000-000000000001', true, 'Promote test');
select public.set_moderator('21000000-0000-0000-0000-000000000001', true, 'Idempotent retry');
select pg_temp.assert_true((select count(*) = 1 from public.role_change_events where target_user_id = '21000000-0000-0000-0000-000000000001'), 'one promotion event despite retry');
select pg_temp.assert_true((select actor_id = auth.uid() and old_role = 'student' and new_role = 'moderator' and reason = 'Promote test' from public.role_change_events where target_user_id = '21000000-0000-0000-0000-000000000001'), 'event contents');
select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);
select pg_temp.denied('select * from public.list_account_users()');
select pg_temp.denied($q$select public.set_moderator('21000000-0000-0000-0000-000000000004', true, 'moderator escalation')$q$);
select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
select public.set_moderator('21000000-0000-0000-0000-000000000001', false, 'Demote test');
select pg_temp.assert_true((select role = 'student' from public.user_roles where user_id = '21000000-0000-0000-0000-000000000001'), 'demotion effective immediately');
select pg_temp.assert_true((select count(*) = 2 from public.role_change_events where target_user_id = '21000000-0000-0000-0000-000000000001'), 'demotion audited');
select pg_temp.denied('update public.role_change_events set reason = reason');
reset role;

-- Inject an audit failure and prove the role update rolls back with its event.
create function pg_temp.fail_audit_insert() returns trigger language plpgsql as $$
begin raise exception 'Synthetic audit failure'; end $$;
create trigger test_fail_audit before insert on public.role_change_events
for each row execute function pg_temp.fail_audit_insert();
set local role authenticated;
select pg_temp.denied($q$select public.set_moderator('21000000-0000-0000-0000-000000000004', true, 'Atomic failure test')$q$, 'P0001');
select pg_temp.assert_true((select role = 'student' from public.user_roles where user_id = '21000000-0000-0000-0000-000000000004'), 'role rollback on audit failure');
select pg_temp.assert_true((select count(*) = 0 from public.role_change_events where target_user_id = '21000000-0000-0000-0000-000000000004'), 'no event on failed transition');
reset role;
drop trigger test_fail_audit on public.role_change_events;

-- Even a trusted SQL session cannot rewrite/truncate the append-only log accidentally.
select pg_temp.denied('update public.role_change_events set reason = reason', '55000');
select pg_temp.denied('delete from public.role_change_events', '55000');
select pg_temp.denied('truncate public.role_change_events', '55000');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anonymous grants revoked');
select pg_temp.assert_true(not has_column_privilege('authenticated','public.profiles','updated_at','UPDATE'), 'timestamp update grant absent');
select pg_temp.assert_true(not has_function_privilege('anon','public.set_moderator(uuid,boolean,text)','EXECUTE'), 'RPC anon execution revoked');
select pg_temp.assert_true(not has_function_privilege('anon','public.list_account_users(integer,integer)','EXECUTE'), 'listing anon execution revoked');
select pg_temp.assert_true(not has_function_privilege('authenticated','private.handle_new_account()','EXECUTE'), 'trigger not callable');
select pg_temp.assert_true((select bool_and(proconfig @> array['search_path=""']) from pg_proc where oid in ('public.set_moderator(uuid,boolean,text)'::regprocedure, 'public.list_account_users(integer,integer)'::regprocedure)), 'empty definer search paths');
rollback;
