-- Hito 2.2. Apply as postgres after 202610220001/0002; no remote execution implied.
begin;

-- V1: explicit Latin/ASCII identity, independent of PostgreSQL locale/Unicode casing.
-- Keep this algorithm aligned with normalizeCourseText; changing it needs collision analysis.
create function private.course_name_key(value text) returns text
language sql immutable strict set search_path = '' as $$
  select btrim(regexp_replace(translate(regexp_replace(normalize(value, NFD), U&'[\0300-\036f]', '', 'g'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', ' ', 'g'));
$$;
create function private.course_name_supported(value text) returns boolean
language sql immutable strict set search_path = '' as $$
  select regexp_replace(normalize(value,NFD), U&'[\0300-\036f]', '', 'g') !~ '[^ -~–—‘’“”¿¡·]';
$$;
create function private.course_code_key(value text) returns text
language sql immutable strict set search_path = '' as $$
  select nullif(upper(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g'))), '');
$$;
create function private.is_verified_catalog_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r join auth.users u on u.id = r.user_id
    where r.user_id = (select auth.uid()) and r.role in ('admin','moderator')
      and u.email_confirmed_at is not null);
$$;
create function private.is_verified_catalog_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = (select auth.uid()) and u.email_confirmed_at is not null);
$$;

create table public.curricula (
  id text primary key check (length(id) between 1 and 100),
  name text not null check (length(btrim(name)) between 2 and 160),
  status text not null default 'active' check (status in ('active','archived'))
);
create table public.elective_areas (
  id text primary key check (length(id) between 1 and 100),
  name text not null check (length(btrim(name)) between 2 and 160),
  position integer not null default 0 check (position >= 0),
  status text not null default 'active' check (status in ('active','archived'))
);
create table public.courses (
  id text primary key default gen_random_uuid()::text check (length(id) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 160),
  curriculum_id text not null references public.curricula(id) on delete restrict,
  name text not null check (length(name) between 2 and 160 and name !~ '[[:cntrl:]]'),
  code text check (code is null or (length(code) between 1 and 40 and code ~ '^[A-Z0-9][A-Z0-9 ._/-]*$')),
  description text check (description is null or (length(description) between 1 and 2000 and translate(description,E'\t\n\r','') !~ '[[:cntrl:]]')),
  kind text not null check (kind in ('regular','elective')),
  curricular_semester integer,
  elective_area_id text references public.elective_areas(id) on delete restrict,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  name_key text not null check (name_key <> ''),
  code_key text,
  constraint courses_variant_check check (
    (kind = 'regular' and curricular_semester is not null and curricular_semester between 1 and 12 and elective_area_id is null)
    or (kind = 'elective' and curricular_semester is null and elective_area_id is not null)
  ),
  constraint courses_plan_name_key_uq unique (curriculum_id,name_key)
);
create unique index courses_plan_code_key_uq on public.courses(curriculum_id,code_key) where code_key is not null;
create index courses_active_regular_idx on public.courses(curriculum_id,curricular_semester,id) where status = 'active' and kind = 'regular';
create index courses_active_elective_idx on public.courses(curriculum_id,elective_area_id,id) where status = 'active' and kind = 'elective';

create table public.course_creation_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 160 and name !~ '[[:cntrl:]]'),
  code text check (code is null or (length(code) between 1 and 40 and code ~ '^[A-Z0-9][A-Z0-9 ._/-]*$')),
  description text check (description is null or (length(description) between 1 and 2000 and translate(description,E'\t\n\r','') !~ '[[:cntrl:]]')),
  kind text not null check (kind in ('regular','elective')),
  curricular_semester integer,
  elective_area_id text references public.elective_areas(id) on delete restrict,
  curriculum_id text not null references public.curricula(id) on delete restrict,
  justification text not null check (length(btrim(justification)) between 10 and 2000 and translate(justification,E'\t\n\r','') !~ '[[:cntrl:]]'),
  requested_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text check (review_notes is null or length(btrim(review_notes)) between 1 and 1000),
  resulting_course_id text references public.courses(id) on delete restrict,
  constraint course_requests_variant_check check (
    (kind = 'regular' and curricular_semester is not null and curricular_semester between 1 and 12 and elective_area_id is null)
    or (kind = 'elective' and curricular_semester is null and elective_area_id is not null)
  ),
  constraint course_requests_review_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null and review_notes is null and resulting_course_id is null)
    or (status in ('approved','rejected') and reviewed_by is not null and reviewed_at is not null and review_notes is not null
      and ((status = 'approved' and resulting_course_id is not null) or (status = 'rejected' and resulting_course_id is null)))
  )
);
create index course_requests_owner_idx on public.course_creation_requests(requested_by,created_at desc,id);
create index course_requests_queue_idx on public.course_creation_requests(status,created_at,id);
create unique index course_requests_pending_name_uq on public.course_creation_requests
  (requested_by,curriculum_id,private.course_name_key(name)) where status = 'pending';

create table public.course_admin_events (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete restrict,
  action text not null check (action in ('created','updated')),
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
create index course_admin_events_course_idx on public.course_admin_events(course_id,created_at desc,id);
create table public.course_request_review_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.course_creation_requests(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('approved','rejected')),
  notes text not null check (length(btrim(notes)) between 1 and 1000),
  resulting_course_id text references public.courses(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (request_id),
  check ((action = 'approved' and resulting_course_id is not null) or (action = 'rejected' and resulting_course_id is null))
);
create trigger course_admin_events_append_only before update or delete or truncate on public.course_admin_events
for each statement execute function private.reject_audit_mutation();
create trigger course_request_events_append_only before update or delete or truncate on public.course_request_review_events
for each statement execute function private.reject_audit_mutation();

create function private.normalize_course_proposal() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := btrim(regexp_replace(normalize(new.name,NFC), '[[:space:]]+', ' ', 'g'));
  new.code := private.course_code_key(new.code);
  new.description := nullif(btrim(normalize(new.description,NFC)), '');
  if not private.course_name_supported(new.name) or private.course_name_key(new.name) = '' then
    raise exception 'Course name requires Latin letters, ASCII digits and supported punctuation' using errcode = '23514';
  end if;
  if tg_table_name = 'courses' then
    if tg_op = 'UPDATE' then
      if new.id is distinct from old.id or new.slug is distinct from old.slug or new.created_at is distinct from old.created_at then
        raise exception 'Course identity is immutable' using errcode = '42501';
      end if;
      new.version := old.version + 1;
      new.updated_at := clock_timestamp();
    else
      new.slug := coalesce(new.slug, 'ramo-' || new.id);
      new.version := 1;
      new.created_at := clock_timestamp();
      new.updated_at := new.created_at;
    end if;
    new.name_key := private.course_name_key(new.name);
    new.code_key := private.course_code_key(new.code);
  else
    new.justification := btrim(new.justification);
    -- API only has INSERT on proposal columns; identity/status/dates are defaults.
    new.created_at := clock_timestamp();
  end if;
  return new;
end $$;
create trigger courses_normalize before insert or update on public.courses
for each row execute function private.normalize_course_proposal();
create trigger course_requests_normalize before insert on public.course_creation_requests
for each row execute function private.normalize_course_proposal();

-- Serialize quotas per authenticated requester, including concurrent API inserts.
create function private.limit_course_requests() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.requested_by is distinct from auth.uid()
     or not private.is_verified_catalog_user() then
    raise exception 'Verified request owner required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('course-request:' || new.requested_by::text, 0));
  if (select count(*) from public.course_creation_requests r where r.requested_by = new.requested_by and r.status = 'pending') >= 10 then
    raise exception 'Maximum 10 pending course requests' using errcode = '22023';
  end if;
  if (select count(*) from public.course_creation_requests r where r.requested_by = new.requested_by
      and r.created_at >= clock_timestamp() - interval '24 hours') >= 20 then
    raise exception 'Maximum 20 course requests per 24 hours' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger course_requests_limit before insert on public.course_creation_requests
for each row execute function private.limit_course_requests();

create function private.audit_course_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.course_admin_events(course_id,actor_id,action,before_data,after_data)
  values (new.id,auth.uid(),case when tg_op = 'INSERT' then 'created' else 'updated' end,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end $$;
create trigger courses_audit after insert or update on public.courses
for each row execute function private.audit_course_change();

-- API cannot UPDATE requests. Even privileged operations cannot rewrite a resolution.
create function private.audit_course_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'pending' or new.status not in ('approved','rejected') then
    raise exception 'Request already resolved or invalid transition' using errcode = '55000';
  end if;
  if (to_jsonb(new) - array['status','reviewed_by','reviewed_at','review_notes','resulting_course_id'])
       is distinct from (to_jsonb(old) - array['status','reviewed_by','reviewed_at','review_notes','resulting_course_id']) then
    raise exception 'Original proposal is immutable' using errcode = '42501';
  end if;
  if new.reviewed_by is distinct from auth.uid() then
    raise exception 'Review actor must match session' using errcode = '42501';
  end if;
  insert into public.course_request_review_events(request_id,actor_id,action,notes,resulting_course_id)
  values (new.id,auth.uid(),new.status,new.review_notes,new.resulting_course_id);
  return new;
end $$;
create trigger course_requests_review_audit after update on public.course_creation_requests
for each row execute function private.audit_course_review();

alter table public.curricula enable row level security;
alter table public.elective_areas enable row level security;
alter table public.courses enable row level security;
alter table public.course_creation_requests enable row level security;
alter table public.course_admin_events enable row level security;
alter table public.course_request_review_events enable row level security;
revoke all on public.curricula, public.elective_areas, public.courses, public.course_creation_requests,
 public.course_admin_events, public.course_request_review_events from public, anon, authenticated;
grant select on public.curricula, public.elective_areas, public.courses to anon, authenticated;
grant select on public.course_creation_requests, public.course_admin_events, public.course_request_review_events to authenticated;
grant insert (name,code,description,kind,curricular_semester,elective_area_id,curriculum_id,status) on public.courses to authenticated;
grant update (name,code,description,kind,curricular_semester,elective_area_id,curriculum_id,status) on public.courses to authenticated;
grant insert (id,name,code,description,kind,curricular_semester,elective_area_id,curriculum_id,justification) on public.course_creation_requests to authenticated;
-- Separate anon policy avoids granting anonymous EXECUTE on authority helpers.
create policy curricula_public on public.curricula for select to anon using (status = 'active');
create policy curricula_authenticated on public.curricula for select to authenticated using (status = 'active' or (select private.is_verified_admin()));
create policy areas_public on public.elective_areas for select to anon using (status = 'active');
create policy areas_authenticated on public.elective_areas for select to authenticated using (status = 'active' or (select private.is_verified_admin()));
create policy courses_public on public.courses for select to anon using (status = 'active');
create policy courses_authenticated on public.courses for select to authenticated using (status = 'active' or (select private.is_verified_admin()));
create policy courses_admin_insert on public.courses for insert to authenticated with check ((select private.is_verified_admin()));
create policy courses_admin_update on public.courses for update to authenticated using ((select private.is_verified_admin())) with check ((select private.is_verified_admin()));
create policy requests_read on public.course_creation_requests for select to authenticated
 using (requested_by = (select auth.uid()) or (select private.is_verified_catalog_reviewer()));
create policy requests_submit on public.course_creation_requests for insert to authenticated
 with check (requested_by = (select auth.uid()) and (select private.is_verified_catalog_user()) and status = 'pending'
   and reviewed_by is null and reviewed_at is null and review_notes is null and resulting_course_id is null
   and exists (select 1 from public.curricula p where p.id = curriculum_id and p.status = 'active')
   and (elective_area_id is null or exists (select 1 from public.elective_areas a where a.id = elective_area_id and a.status = 'active')));
create policy course_events_admin on public.course_admin_events for select to authenticated using ((select private.is_verified_admin()));
create policy review_events_read on public.course_request_review_events for select to authenticated
 using ((select private.is_verified_catalog_reviewer()) or exists (
   select 1 from public.course_creation_requests r where r.id = request_id and r.requested_by = (select auth.uid())));

create function public.review_course_request(request_id uuid, decision text, notes text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  proposal public.course_creation_requests%rowtype;
  course_id text;
begin
  if actor is null or not private.is_verified_catalog_reviewer() then
    raise exception 'Verified reviewer required' using errcode = '42501';
  end if;
  perform 1 from public.user_roles r where r.user_id = actor and r.role in ('admin','moderator') for share;
  if not found then raise exception 'Reviewer role changed' using errcode = '42501'; end if;
  perform 1 from auth.users u where u.id = actor and u.email_confirmed_at is not null for share;
  if not found then raise exception 'Verified reviewer required' using errcode = '42501'; end if;
  if request_id is null or decision is null or decision not in ('approved','rejected') or notes is null
    or length(btrim(notes)) not between 1 and 1000 then
    raise exception 'Request, decision and notes (1-1000) required' using errcode = '22023';
  end if;
  select r.* into proposal from public.course_creation_requests r where r.id = request_id for update;
  if not found then raise exception 'Request not found' using errcode = '22023'; end if;
  if proposal.status <> 'pending' then raise exception 'Request already resolved' using errcode = '55000'; end if;
  if decision = 'approved' then
    perform 1 from public.curricula p where p.id = proposal.curriculum_id and p.status = 'active' for share;
    if not found then raise exception 'Active curriculum required' using errcode = '22023'; end if;
    if proposal.elective_area_id is not null then
      perform 1 from public.elective_areas a where a.id = proposal.elective_area_id and a.status = 'active' for share;
      if not found then raise exception 'Active elective area required' using errcode = '22023'; end if;
    end if;
    -- No corrected proposal parameters: moderator creates only this locked original.
    insert into public.courses(name,code,description,kind,curricular_semester,elective_area_id,curriculum_id)
    values (proposal.name,proposal.code,proposal.description,proposal.kind,proposal.curricular_semester,proposal.elective_area_id,proposal.curriculum_id)
    returning id into course_id;
  end if;
  update public.course_creation_requests r set status = decision, reviewed_by = actor,
    reviewed_at = clock_timestamp(), review_notes = btrim(notes), resulting_course_id = course_id
    where r.id = request_id;
  return course_id;
end $$;

revoke all on function private.course_name_key(text), private.course_name_supported(text), private.course_code_key(text),
 private.is_verified_catalog_reviewer(), private.is_verified_catalog_user(), private.normalize_course_proposal(),
 private.limit_course_requests(), private.audit_course_change(), private.audit_course_review(), public.review_course_request(uuid,text,text)
 from public, anon, authenticated;
-- Invoker trigger normalizer uses these two private pure functions.
grant execute on function private.course_name_key(text), private.course_name_supported(text), private.course_code_key(text),
 private.is_verified_catalog_reviewer(), private.is_verified_catalog_user(), public.review_course_request(uuid,text,text)
 to authenticated;
commit;
