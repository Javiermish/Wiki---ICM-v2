-- Read-only operational inspection, NOT a migration/test fixture.
-- Compare all output with 202610220001 and AUTH_SQL.md BEFORE migration repair.
select current_database(), current_user;
select to_regclass('supabase_migrations.schema_migrations') as cli_history;
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','user_roles','role_change_events');
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('profiles','user_roles','role_change_events') order by table_name,ordinal_position;
select conrelid::regclass as relation, conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in (to_regclass('public.profiles'),to_regclass('public.user_roles'),to_regclass('public.role_change_events')) order by 1,2;
select tablename,indexname,indexdef from pg_indexes where schemaname='public'
and tablename in ('profiles','user_roles','role_change_events') order by 1,2;
select * from pg_policies where schemaname='public' and tablename in ('profiles','user_roles','role_change_events') order by tablename,policyname;
select table_name,grantee,privilege_type from information_schema.table_privileges where table_schema='public'
and table_name in ('profiles','user_roles','role_change_events') order by 1,2,3;
select table_name,column_name,grantee,privilege_type from information_schema.column_privileges where table_schema='public'
and table_name in ('profiles','user_roles','role_change_events') order by 1,2,3,4;
select n.nspname,p.proname,pg_get_functiondef(p.oid),p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='private' and p.proname in ('touch_profile','reject_audit_mutation','handle_new_account','is_verified_admin'))
or (n.nspname='public' and p.proname in ('set_moderator','list_account_users')) order by 1,2;
select t.tgrelid::regclass,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)
from pg_trigger t where not t.tgisinternal and (t.tgrelid=to_regclass('auth.users') or t.tgrelid in
 (to_regclass('public.profiles'),to_regclass('public.role_change_events'))) order by 1,2;
-- Run this last query only once all application tables are confirmed present.
select count(*) filter(where p.id is null) as missing_profiles, count(*) filter(where r.user_id is null) as missing_roles
from auth.users u left join public.profiles p on p.id=u.id left join public.user_roles r on r.user_id=u.id;
