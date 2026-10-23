-- Hito 2.1 only. No catalog, materials, or storage changes.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'moderator', 'admin'))
);
create table public.role_change_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  old_role text not null check (old_role in ('student', 'moderator', 'admin')),
  new_role text not null check (new_role in ('student', 'moderator', 'admin')),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (old_role <> new_role)
);
create index role_change_events_target_created_idx on public.role_change_events(target_user_id, created_at desc, id);
create index role_change_events_created_idx on public.role_change_events(created_at desc, id);

create function private.touch_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger profiles_updated_at before update on public.profiles
for each row execute function private.touch_profile();

create function private.reject_audit_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Role history is append-only' using errcode = '55000';
end;
$$;
create trigger role_change_events_append_only
before update or delete or truncate on public.role_change_events
for each statement execute function private.reject_audit_mutation();

create function private.handle_new_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Editable Auth metadata is not an authority, including for display names.
  insert into public.profiles(id) values (new.id);
  insert into public.user_roles(user_id, role) values (new.id, 'student');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_account();

-- Conservative backfill: no role/profile imported from metadata; preserve any
-- existing row and never infer privileged accounts from email or claims.
insert into public.profiles(id, created_at)
select id, coalesce(created_at, now()) from auth.users on conflict (id) do nothing;
insert into public.user_roles(user_id, role)
select id, 'student' from auth.users on conflict (user_id) do nothing;

create function private.is_verified_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r join auth.users u on u.id = r.user_id
    where r.user_id = (select auth.uid()) and r.role = 'admin'
      and u.email_confirmed_at is not null
  );
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_change_events enable row level security;
revoke all on public.profiles, public.user_roles, public.role_change_events from public, anon, authenticated;
grant select on public.profiles, public.user_roles, public.role_change_events to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_read_own on public.profiles for select to authenticated
using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy roles_read_own_or_admin on public.user_roles for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_verified_admin()));
create policy role_events_read_admin on public.role_change_events for select to authenticated
using ((select private.is_verified_admin()));

create function public.set_moderator(target_user_id uuid, enabled boolean, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  previous_role text;
  desired_role text;
begin
  if actor is null or not private.is_verified_admin() then
    raise exception 'Verified administrator required' using errcode = '42501';
  end if;
  -- Hold the current authority until commit, including against SQL-only role changes.
  perform 1 from public.user_roles r where r.user_id = actor and r.role = 'admin' for share;
  if not found then
    raise exception 'Administrator role changed' using errcode = '42501';
  end if;
  perform 1 from auth.users u where u.id = actor and u.email_confirmed_at is not null for share;
  if not found then
    raise exception 'Verified administrator required' using errcode = '42501';
  end if;
  if target_user_id is null or enabled is null or reason is null
     or char_length(btrim(reason)) not between 1 and 1000 then
    raise exception 'Target, enabled flag and reason (1-1000 characters) required' using errcode = '22023';
  end if;
  perform 1 from auth.users u where u.id = target_user_id and u.email_confirmed_at is not null for share;
  if not found then
    raise exception 'Target must be an existing confirmed account' using errcode = '22023';
  end if;
  select r.role into previous_role from public.user_roles r
    where r.user_id = target_user_id for update;
  if not found then
    raise exception 'Target role missing' using errcode = '22023';
  end if;
  if previous_role = 'admin' then
    raise exception 'Administrator accounts cannot be changed by this RPC' using errcode = '42501';
  end if;
  desired_role := case when enabled then 'moderator' else 'student' end;
  if previous_role = desired_role then return; end if;
  update public.user_roles r set role = desired_role where r.user_id = target_user_id;
  insert into public.role_change_events(target_user_id, actor_id, old_role, new_role, reason)
  values (target_user_id, actor, previous_role, desired_role, btrim(reason));
end;
$$;

create function public.list_account_users(page_size integer default 50, page_offset integer default 0)
returns table (user_id uuid, email text, display_name text, role text, email_confirmed_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_verified_admin() then
    raise exception 'Verified administrator required' using errcode = '42501';
  end if;
  if page_size is null or page_size not between 1 and 200 or page_offset is null or page_offset < 0 then
    raise exception 'page_size must be 1-200 and page_offset nonnegative' using errcode = '22023';
  end if;
  return query select u.id, u.email::text, p.display_name, r.role, u.email_confirmed_at, u.created_at
    from auth.users u join public.profiles p on p.id = u.id
    join public.user_roles r on r.user_id = u.id
    order by u.created_at desc nulls last, u.id
    limit page_size offset page_offset;
end;
$$;

-- Supabase may default new functions to PUBLIC or API-role execution.
revoke all on function private.touch_profile(), private.reject_audit_mutation(),
  private.handle_new_account(), private.is_verified_admin(),
  public.set_moderator(uuid, boolean, text), public.list_account_users(integer, integer)
  from public, anon, authenticated;
grant execute on function private.is_verified_admin(), public.set_moderator(uuid, boolean, text),
  public.list_account_users(integer, integer) to authenticated;
commit;
