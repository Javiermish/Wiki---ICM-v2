-- Hito 2.3: private R2 objects; this migration never creates public storage.
begin;
-- Pre-body abuse budget. No API table access: identity, clock and counter are DB-owned.
create table private.material_upload_budgets (
  user_id uuid primary key references auth.users(id) on delete restrict,
  window_started_at timestamptz not null default clock_timestamp(),
  attempts int not null default 0 check (attempts between 0 and 20)
);
alter table private.material_upload_budgets enable row level security;
revoke all on private.material_upload_budgets from public,anon,authenticated,service_role;
create function public.authorize_material_upload_attempt() returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); budget private.material_upload_budgets%rowtype; checked_at timestamptz;
begin
 if actor is null or not private.is_verified_catalog_user() then
   raise exception 'Verified account required' using errcode = '42501';
 end if;
 perform 1 from auth.users u where u.id = actor and u.email_confirmed_at is not null for share;
 if not found then raise exception 'Verified account required' using errcode = '42501'; end if;
 insert into private.material_upload_budgets(user_id) values (actor) on conflict (user_id) do nothing;
 select b.* into budget from private.material_upload_budgets b where b.user_id = actor for update;
 checked_at := clock_timestamp();
 if budget.window_started_at <= checked_at - interval '15 minutes' then
   update private.material_upload_budgets set window_started_at = checked_at,attempts = 1 where user_id = actor;
   return true;
 end if;
 if budget.attempts >= 20 then return false; end if;
 update private.material_upload_budgets set attempts = attempts + 1 where user_id = actor;
 return true;
end $$;
create table public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete restrict,
  academic_year int not null check (academic_year between 1900 and 2100),
  academic_term int not null check (academic_term in (1,2)),
  unique(course_id, academic_year, academic_term)
);
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  category text not null check (category in ('listado','apunte','certamen')),
  document_number int check (document_number between 1 and 999),
  title text check (length(title) between 1 and 200),
  description text check (length(description) between 1 and 2000),
  section text check (length(section) between 1 and 80),
  instructor text check (length(instructor) between 1 and 120),
  version text check (length(version) between 1 and 80),
  original_filename text not null check (length(original_filename) between 1 and 255 and original_filename !~ '[[:cntrl:]/\\]'),
  mime_type text not null,
  bytes bigint not null check (bytes between 1 and 26214400),
  extension text not null check (extension in ('pdf','jpg','png','webp')),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  storage_key text not null unique,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default clock_timestamp(),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  upload_state text not null default 'uploading' check (upload_state in ('uploading','ready','failed')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text,
  operation_id uuid not null,
  storage_deleted_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  check (storage_deleted_at is null or upload_state = 'failed'),
  unique(uploaded_by, operation_id),
  check (category = 'apunte' or document_number is not null),
  check ((extension = 'pdf' and mime_type = 'application/pdf') or (extension = 'jpg' and mime_type = 'image/jpeg')
    or (extension = 'png' and mime_type = 'image/png') or (extension = 'webp' and mime_type = 'image/webp')),
  check (storage_key = 'materials/' || uploaded_by::text || '/' || id::text || '.' || extension),
  check ((status = 'pending' and reviewed_by is null and reviewed_at is null and review_notes is null)
    or (status in ('approved','rejected') and upload_state = 'ready' and reviewed_by is not null
      and reviewed_at is not null and review_notes is not null and length(btrim(review_notes)) between 1 and 1000)),
  check (coalesce(title,'') !~ '[[:cntrl:]]' and coalesce(section,'') !~ '[[:cntrl:]]'
    and coalesce(instructor,'') !~ '[[:cntrl:]]' and coalesce(version,'') !~ '[[:cntrl:]]'
    and translate(coalesce(description,''), E'\n\r\t','') !~ '[[:cntrl:]]')
);
-- Same bytes by another owner or another section/professor/version are legitimate.
create unique index materials_owner_content_uq on public.materials
 (uploaded_by,sha256,offering_id,category,coalesce(document_number,0),coalesce(section,''),coalesce(instructor,''),coalesce(version,''))
 where upload_state <> 'failed' and status <> 'rejected';
create index materials_owner_time_idx on public.materials(uploaded_by,submitted_at desc);
create index materials_review_queue_idx on public.materials(submitted_at,id) where status = 'pending' and upload_state = 'ready';
create index materials_upload_cleanup_idx on public.materials(updated_at,id) where upload_state = 'uploading';
create index materials_failed_cleanup_idx on public.materials(updated_at,id)
 where upload_state = 'failed' and storage_deleted_at is null;
create index materials_offering_idx on public.materials(offering_id,category,document_number);
create table public.material_review_events (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null unique references public.materials(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('approved','rejected')),
  notes text not null check (length(btrim(notes)) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create trigger material_review_events_append_only before update or delete or truncate on public.material_review_events
 for each statement execute function private.reject_audit_mutation();
alter table public.course_offerings enable row level security;
alter table public.materials enable row level security;
alter table public.material_review_events enable row level security;
revoke all on public.course_offerings,public.materials,public.material_review_events from public,anon,authenticated,service_role;
grant select on public.course_offerings,public.materials,public.material_review_events to authenticated,service_role;
create policy materials_own_or_reviewer on public.materials for select to authenticated
 using (uploaded_by = (select auth.uid()) or (select private.is_verified_catalog_reviewer()));
create policy offerings_private_read on public.course_offerings for select to authenticated
 using (exists (select 1 from public.materials m where m.offering_id = course_offerings.id));
create policy material_events_private_read on public.material_review_events for select to authenticated
 using (exists (select 1 from public.materials m where m.id = material_id));
-- Owner-rights view deliberately bypasses table RLS: fixed allowlist + fixed publication predicate.
-- Never add private fields or remove this predicate; anon has NO raw table privilege.
create view public.public_materials with (security_barrier = true) as
 select m.id,m.offering_id,o.course_id,o.academic_year,o.academic_term,m.category,m.document_number,
   m.title,m.description,m.section,m.instructor,m.version,m.mime_type,m.bytes,m.extension
 from public.materials m join public.course_offerings o on o.id = m.offering_id
 where m.status = 'approved' and m.upload_state = 'ready';
revoke all on public.public_materials from public,anon,authenticated;
grant select on public.public_materials to anon,authenticated,service_role;

create function public.reserve_material_upload(operation_id uuid, metadata jsonb, filename text,
 file_mime text,file_bytes bigint,file_extension text,file_sha256 text) returns public.materials
language plpgsql security definer set search_path = '' as $$
declare
 actor uuid := auth.uid(); existing public.materials%rowtype; result public.materials%rowtype;
 canonical jsonb; previous jsonb; offering uuid; new_id uuid := gen_random_uuid();
 yr int; term int; num int;
begin
 if actor is null or not private.is_verified_catalog_user() then
   raise exception 'Verified account required' using errcode = '42501';
 end if;
 -- Match existing authority locking order: role before auth row; account lock prevents deconfirmation.
 perform 1 from auth.users u where u.id = actor and u.email_confirmed_at is not null for share;
 if not found then raise exception 'Verified account required' using errcode = '42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('material-upload:' || actor::text,0));
 if operation_id is null or metadata is null or jsonb_typeof(metadata) <> 'object'
   or (metadata - array['courseId','academicYear','academicTerm','category','documentNumber','title','description','section','instructor','version']) <> '{}'::jsonb
   or jsonb_typeof(metadata->'courseId') is distinct from 'string'
   or jsonb_typeof(metadata->'category') is distinct from 'string'
   or jsonb_typeof(metadata->'academicYear') is distinct from 'number'
   or jsonb_typeof(metadata->'academicTerm') is distinct from 'number'
   or (metadata->>'academicYear') !~ '^[0-9]{4}$' or (metadata->>'academicTerm') !~ '^[12]$'
   or (metadata->>'category') not in ('listado','apunte','certamen')
   or length(metadata->>'courseId') not between 1 and 100 then
   raise exception 'Invalid upload metadata' using errcode = '22023';
 end if;
 if exists (select 1 from jsonb_each(metadata) e where e.key in ('title','description','section','instructor','version')
   and jsonb_typeof(e.value) not in ('string','null')) then
   raise exception 'Invalid metadata text' using errcode = '22023';
 end if;
 yr := (metadata->>'academicYear')::int; term := (metadata->>'academicTerm')::int;
 if yr not between 1900 and 2100 or
   (metadata->>'documentNumber' is not null and (jsonb_typeof(metadata->'documentNumber') <> 'number'
     or (metadata->>'documentNumber') !~ '^[0-9]{1,3}$')) then
   raise exception 'Invalid academic period or number' using errcode = '22023';
 end if;
 num := (metadata->>'documentNumber')::int;
 if (num is null and metadata->>'category' <> 'apunte') or (num is not null and num not between 1 and 999) then
   raise exception 'Document number required or invalid' using errcode = '22023';
 end if;
 canonical := jsonb_build_object('courseId',metadata->>'courseId','academicYear',yr,'academicTerm',term,
   'category',metadata->>'category','documentNumber',num,'title',nullif(btrim(metadata->>'title'),''),
   'description',nullif(btrim(metadata->>'description'),''),'section',nullif(btrim(metadata->>'section'),''),
   'instructor',nullif(btrim(metadata->>'instructor'),''),'version',nullif(btrim(metadata->>'version'),''));
 select m.* into existing from public.materials m where m.uploaded_by = actor
   and m.operation_id = reserve_material_upload.operation_id for update;
 if found then
   select jsonb_build_object('courseId',o.course_id,'academicYear',o.academic_year,'academicTerm',o.academic_term,
     'category',existing.category,'documentNumber',existing.document_number,'title',existing.title,'description',existing.description,
     'section',existing.section,'instructor',existing.instructor,'version',existing.version)
     into previous from public.course_offerings o where o.id = existing.offering_id;
   if previous is distinct from canonical or existing.original_filename is distinct from filename
     or existing.mime_type is distinct from file_mime or existing.bytes is distinct from file_bytes
     or existing.extension is distinct from file_extension or existing.sha256 is distinct from file_sha256 then
     raise exception 'Operation payload conflict' using errcode = '55000';
   end if;
   -- Refresh the 24h upload lease only after an identical retry; serialize against expiry.
   if existing.upload_state = 'uploading' then
     update public.materials m set updated_at = clock_timestamp() where m.id = existing.id returning * into existing;
   end if;
   return existing;
 end if;
 if (select count(*) from public.materials m where m.uploaded_by = actor and m.status = 'pending' and m.upload_state <> 'failed') >= 10
   or (select count(*) from public.materials m where m.uploaded_by = actor and m.submitted_at >= clock_timestamp() - interval '24 hours') >= 20 then
   raise exception 'Upload quota exceeded' using errcode = '22023';
 end if;
 perform 1 from public.courses c where c.id = metadata->>'courseId' and c.status = 'active' for share;
 if not found then raise exception 'Active course required' using errcode = '22023'; end if;
 insert into public.course_offerings(course_id,academic_year,academic_term) values (metadata->>'courseId',yr,term)
   on conflict (course_id,academic_year,academic_term) do nothing;
 select o.id into offering from public.course_offerings o where o.course_id = metadata->>'courseId'
   and o.academic_year = yr and o.academic_term = term;
 insert into public.materials(id,offering_id,category,document_number,title,description,section,instructor,version,
   original_filename,mime_type,bytes,extension,sha256,storage_key,uploaded_by,operation_id)
 values (new_id,offering,canonical->>'category',num,canonical->>'title',canonical->>'description',canonical->>'section',
   canonical->>'instructor',canonical->>'version',filename,file_mime,file_bytes,file_extension,file_sha256,
   'materials/' || actor::text || '/' || new_id::text || '.' || file_extension,actor,operation_id)
 returning * into result;
 return result;
end $$;

create function public.finalize_material_upload(material_id uuid, owner_id uuid) returns public.materials
language plpgsql security definer set search_path = '' as $$
declare result public.materials%rowtype;
begin
 select m.* into result from public.materials m where m.id = material_id and m.uploaded_by = owner_id for update;
 if not found then raise exception 'Upload not found' using errcode = '22023'; end if;
 if result.upload_state = 'failed' then raise exception 'Upload failed or expired' using errcode = '55000'; end if;
 if result.upload_state = 'uploading' then
   update public.materials m set upload_state = 'ready',updated_at = clock_timestamp() where m.id = material_id returning * into result;
 end if;
 return result;
end $$;
create function public.fail_material_upload(material_id uuid, owner_id uuid) returns public.materials
language plpgsql security definer set search_path = '' as $$
declare result public.materials%rowtype;
begin
 select m.* into result from public.materials m where m.id = material_id and m.uploaded_by = owner_id for update;
 if not found then raise exception 'Upload not found' using errcode = '22023'; end if;
 if result.upload_state = 'ready' then raise exception 'Ready uploads cannot fail' using errcode = '55000'; end if;
 if result.upload_state = 'uploading' then
   update public.materials m set upload_state = 'failed',updated_at = clock_timestamp() where m.id = material_id returning * into result;
 end if;
 return result;
end $$;
create function public.mark_material_storage_deleted(material_id uuid) returns public.materials
language plpgsql security definer set search_path = '' as $$
declare result public.materials%rowtype;
begin
 select m.* into result from public.materials m where m.id = material_id for update;
 if not found then raise exception 'Upload not found' using errcode = '22023'; end if;
 if result.upload_state <> 'failed' then
   raise exception 'Only failed upload storage can be marked deleted' using errcode = '55000';
 end if;
 if result.storage_deleted_at is null then
   update public.materials m set storage_deleted_at = clock_timestamp(),updated_at = clock_timestamp()
     where m.id = material_id returning * into result;
 end if;
 return result;
end $$;
create function public.review_material(material_id uuid,decision text,notes text) returns public.materials
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result public.materials%rowtype;
begin
 if actor is null or not private.is_verified_catalog_reviewer() then
   raise exception 'Verified reviewer required' using errcode = '42501';
 end if;
 perform 1 from public.user_roles r where r.user_id = actor and r.role in ('admin','moderator') for share;
 if not found then raise exception 'Reviewer role changed' using errcode = '42501'; end if;
 perform 1 from auth.users u where u.id = actor and u.email_confirmed_at is not null for share;
 if not found then raise exception 'Verified reviewer required' using errcode = '42501'; end if;
 if material_id is null or decision is null or decision not in ('approved','rejected') or notes is null
   or length(btrim(notes)) not between 1 and 1000 then
   raise exception 'Decision and notes required' using errcode = '22023';
 end if;
 select m.* into result from public.materials m where m.id = material_id for update;
 if not found then raise exception 'Material not found' using errcode = '22023'; end if;
 if result.status <> 'pending' or result.upload_state <> 'ready' then
   raise exception 'Material is not pending and ready' using errcode = '55000';
 end if;
 update public.materials m set status = decision,reviewed_by = actor,reviewed_at = clock_timestamp(),
   review_notes = btrim(notes),updated_at = clock_timestamp() where m.id = material_id returning * into result;
 insert into public.material_review_events(material_id,actor_id,action,notes) values (material_id,actor,decision,btrim(notes));
 return result;
end $$;
create function public.expire_material_uploads() returns table(material_id uuid,storage_key text)
language sql security definer set search_path = '' as $$
 with abandoned as (
   select m.id from public.materials m where m.upload_state = 'uploading' and m.status = 'pending'
     and m.updated_at < clock_timestamp() - interval '24 hours'
   order by m.updated_at,m.id limit 100 for update skip locked
 )
 update public.materials m set upload_state = 'failed',updated_at = clock_timestamp()
 from abandoned a where m.id = a.id and m.upload_state = 'uploading' and m.status = 'pending'
 returning m.id,m.storage_key;
$$;
revoke all on function public.authorize_material_upload_attempt(),public.reserve_material_upload(uuid,jsonb,text,text,bigint,text,text),
 public.finalize_material_upload(uuid,uuid),public.fail_material_upload(uuid,uuid),
 public.mark_material_storage_deleted(uuid),public.review_material(uuid,text,text),public.expire_material_uploads()
 from public,anon,authenticated,service_role;
grant execute on function public.authorize_material_upload_attempt(),public.reserve_material_upload(uuid,jsonb,text,text,bigint,text,text),
 public.review_material(uuid,text,text) to authenticated;
grant execute on function public.finalize_material_upload(uuid,uuid),public.fail_material_upload(uuid,uuid),
 public.mark_material_storage_deleted(uuid),public.expire_material_uploads() to service_role;
commit;
