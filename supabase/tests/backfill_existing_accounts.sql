-- LOCAL DISPOSABLE DB ONLY, as postgres, after 0001. Requires psql.
-- Migration COMMITs are intentional: fixtures are cleaned up at the end, not
-- rolled back. On failure discard the disposable DB; never run against remote.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.denied(statement text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when insufficient_privilege then return;
  end;
  raise exception 'Statement unexpectedly allowed: %', statement;
end $$;

-- Trigger stays enabled: these also exercise new-account initialization.
insert into auth.users(id, email, email_confirmed_at, created_at, raw_user_meta_data) values
 ('23000000-0000-0000-0000-000000000001', 'profile-only@example.invalid', now(), '2020-01-01Z', '{"role":"admin","display_name":"Untrusted"}'),
 ('23000000-0000-0000-0000-000000000002', 'role-only@example.invalid', now(), '2020-01-02Z', '{"role":"admin","display_name":"Untrusted"}'),
 ('23000000-0000-0000-0000-000000000003', 'neither@example.invalid', null, '2020-01-03Z', '{"role":"admin","display_name":"Untrusted"}'),
 ('23000000-0000-0000-0000-000000000004', 'admin-backfill@example.invalid', now(), '2020-01-04Z', '{}'),
 ('23000000-0000-0000-0000-000000000005', 'moderator-backfill@example.invalid', now(), '2020-01-05Z', '{}');
select pg_temp.assert_true((select count(*) = 5 from public.user_roles where user_id::text like '23000000-%' and role = 'student'), 'trigger initializes every new account as student');
select pg_temp.assert_true((select count(*) = 5 from public.profiles where id::text like '23000000-%' and display_name = ''), 'trigger ignores display-name metadata');
delete from public.profiles where id in ('23000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000003');
delete from public.user_roles where user_id in ('23000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000003');
update public.profiles set display_name = 'Preserved name', created_at = '2019-01-01Z' where id::text like '23000000-%';
-- Trusted SQL-only fixtures, not automatic administrator bootstrap.
update public.user_roles set role = 'admin' where user_id = '23000000-0000-0000-0000-000000000004';
update public.user_roles set role = 'moderator' where user_id in ('23000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000005');
create temporary table auth_before as select * from auth.users;
create temporary table profiles_before as select * from public.profiles;
create temporary table roles_before as select * from public.user_roles;
commit;

\ir ../migrations/202610220002_backfill_existing_accounts.sql

begin;
select pg_temp.assert_true(not exists (table auth_before except table auth.users) and not exists (table auth.users except table auth_before), 'first run preserves every auth user and field');
select pg_temp.assert_true(not exists (table profiles_before except table public.profiles), 'existing profiles, names and both timestamps unchanged');
select pg_temp.assert_true(not exists (table roles_before except table public.user_roles), 'existing student/moderator/admin roles unchanged');
select pg_temp.assert_true(not exists (select 1 from auth.users u left join public.profiles p on p.id = u.id left join public.user_roles r on r.user_id = u.id where p.id is null or r.user_id is null), 'no account missing either row');
select pg_temp.assert_true((select count(*) = 2 from public.user_roles where user_id in ('23000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000003') and role = 'student'), 'missing roles become student regardless of metadata or verification');
select pg_temp.assert_true((select count(*) = 2 from public.profiles p join auth.users u on u.id = p.id where p.id in ('23000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000003') and p.display_name = '' and p.created_at = u.created_at), 'missing profiles ignore metadata and preserve Auth creation date');
create temporary table profiles_once as select * from public.profiles;
create temporary table roles_once as select * from public.user_roles;
commit;

\ir ../migrations/202610220002_backfill_existing_accounts.sql

begin;
select pg_temp.assert_true(not exists (table profiles_once except table public.profiles) and not exists (table public.profiles except table profiles_once), 'second run leaves all profile fields unchanged');
select pg_temp.assert_true(not exists (table roles_once except table public.user_roles) and not exists (table public.user_roles except table roles_once), 'second run leaves all roles unchanged');
select pg_temp.assert_true(not exists (table auth_before except table auth.users) and not exists (table auth.users except table auth_before), 'second run preserves every auth user and field');
set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true((select role = 'student' from public.user_roles), 'backfilled student reads own role only');
select pg_temp.denied($q$update public.user_roles set role = 'admin' where user_id = auth.uid()$q$);
select pg_temp.denied($q$select public.set_moderator(auth.uid(), true, 'self escalation')$q$);
reset role;
-- Remove only these synthetic fixtures; no audit events were created.
delete from auth.users where id in (
 '23000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000002',
 '23000000-0000-0000-0000-000000000003', '23000000-0000-0000-0000-000000000004',
 '23000000-0000-0000-0000-000000000005');
commit;
