-- Precondition: 202610220001_profiles_roles.sql applied once, as postgres.
-- Safe to rerun: only missing rows; metadata never grants privileges.
begin;
insert into public.profiles(id, created_at)
select id, coalesce(created_at, now()) from auth.users
on conflict (id) do nothing;

insert into public.user_roles(user_id, role)
select id, 'student' from auth.users
on conflict (user_id) do nothing;
commit;
