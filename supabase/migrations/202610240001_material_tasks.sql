-- Incremental only: the applied materials migration and existing rows stay intact.
begin;
alter table public.materials drop constraint materials_category_check;
alter table public.materials add constraint materials_category_check
  check (category in ('listado','apunte','certamen','tarea'));
-- Existing number CHECKs already require 1..999 for every non-apunte, including tarea.
-- RLS, public_materials (approved AND ready), audit and grants are category-independent.
-- Preserve them: no new publication path, storage access, or category/number uniqueness.
-- CREATE OR REPLACE retains the function identity and its existing EXECUTE ACL.
create or replace function public.reserve_material_upload(operation_id uuid, metadata jsonb, filename text,
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
   or (metadata->>'category') not in ('listado','apunte','certamen','tarea')
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
commit;
