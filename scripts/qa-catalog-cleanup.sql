-- MAINTENANCE TEMPLATE ONLY. Never invoked by the QA runner or migrations.
-- Requires separate authorization, SQL owner, reviewed exact manifest and backup.
-- Replace the EMPTY value with the reconciled manifest JSON (contains NO secrets).
-- Do not weaken these checks. Use ROLLBACK first; COMMIT requires manual approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select set_config('wiki.qa_manifest', '', true);

lock table public.courses, public.course_creation_requests,
  public.course_admin_events, public.course_request_review_events,
  public.role_change_events in share row exclusive mode;

create temporary table qa_courses(id text primary key) on commit drop;
create temporary table qa_requests(id uuid primary key) on commit drop;
create temporary table qa_admin_events(id uuid primary key) on commit drop;
create temporary table qa_review_events(id uuid primary key) on commit drop;
create temporary table qa_accounts(id uuid primary key) on commit drop;

do $$
declare m jsonb := nullif(current_setting('wiki.qa_manifest', true), '')::jsonb;
  prefix text; started timestamptz; finished timestamptz;
begin
  if m is null or m->>'status' is distinct from 'PASS'
    or coalesce(m->>'runId' !~ '^qa-[0-9]{8}-[0-9a-f]{8}$', true)
    or m->>'finished' is null or m->>'started' is null then
    raise exception 'Reviewed complete QA manifest required; no cleanup executed';
  end if;
  prefix := 'QA ' || (m->>'runId') || ' ';
  started := (m->>'started')::timestamptz; finished := (m->>'finished')::timestamptz;
  if finished < started then raise exception 'Invalid QA time window'; end if;
  insert into qa_accounts select value::uuid from jsonb_each_text(m->'accounts');
  insert into qa_courses select jsonb_array_elements_text(m->'courseIds');
  insert into qa_requests select jsonb_array_elements_text(m->'requestIds')::uuid;
  insert into qa_admin_events select jsonb_array_elements_text(m->'adminEventIds')::uuid;
  insert into qa_review_events select jsonb_array_elements_text(m->'reviewEventIds')::uuid;
  if (select count(*) from qa_accounts) <> 4 or (select count(*) from qa_courses) <> 2
    or (select count(*) from qa_requests) <> 3 or (select count(*) from qa_review_events) <> 3
    or (select count(*) from qa_admin_events) <> 7 then
    raise exception 'Unexpected matrix row counts; reconcile manually, do not widen cleanup';
  end if;
  if (select count(*) from public.courses c join qa_courses q using(id)
       where c.name like prefix || '%' and c.status = 'archived'
         and c.created_at between started and finished) <> 2
    or (select count(*) from public.course_creation_requests r join qa_requests q using(id)
        where r.name like prefix || '%' and r.requested_by in (select id from qa_accounts)
          and r.reviewed_by in (select id from qa_accounts)
          and (r.resulting_course_id is null or r.resulting_course_id in (select id from qa_courses))
         and r.status in ('approved','rejected') and r.created_at between started and finished) <> 3 then
    raise exception 'QA identity, owner, prefix, status or timestamp mismatch';
  end if;
  if (select count(*) from public.course_admin_events e join qa_admin_events q using(id)
       where e.course_id in (select id from qa_courses) and e.actor_id in (select id from qa_accounts)
         and e.created_at between started and finished) <> 7
    or (select count(*) from public.course_request_review_events e join qa_review_events q using(id)
        where e.request_id in (select id from qa_requests) and e.actor_id in (select id from qa_accounts)
          and (e.resulting_course_id is null or e.resulting_course_id in (select id from qa_courses))
         and e.created_at between started and finished) <> 3 then
    raise exception 'QA audit IDs, actors or timestamps mismatch';
  end if;
  if exists (select 1 from public.course_creation_requests r where
      (r.requested_by in (select id from qa_accounts) or r.reviewed_by in (select id from qa_accounts)
       or r.resulting_course_id in (select id from qa_courses)) and r.id not in (select id from qa_requests))
    or exists (select 1 from public.course_admin_events e where
      (e.course_id in (select id from qa_courses) or e.actor_id in (select id from qa_accounts))
      and e.id not in (select id from qa_admin_events))
    or exists (select 1 from public.course_request_review_events e where
      (e.request_id in (select id from qa_requests) or e.actor_id in (select id from qa_accounts)
       or e.resulting_course_id in (select id from qa_courses)) and e.id not in (select id from qa_review_events))
    or exists (select 1 from public.role_change_events e where
      e.actor_id in (select id from qa_accounts) or e.target_user_id in (select id from qa_accounts)) then
    raise exception 'Unplanned dependencies: preserve rows, investigate, no cascade';
  end if;
end $$;

-- Narrow, transactional exception for the two catalog audit tables ONLY.
-- RLS/other triggers/FKs remain enabled; no session_replication_role or CASCADE.
alter table public.course_request_review_events disable trigger course_request_events_append_only;
alter table public.course_admin_events disable trigger course_admin_events_append_only;
delete from public.course_request_review_events where id in (select id from qa_review_events);
delete from public.course_admin_events where id in (select id from qa_admin_events);
delete from public.course_creation_requests where id in (select id from qa_requests);
delete from public.courses where id in (select id from qa_courses);
alter table public.course_request_review_events enable trigger course_request_events_append_only;
alter table public.course_admin_events enable trigger course_admin_events_append_only;

-- Accounts are deliberately NOT deleted here: Auth cleanup is separately reviewed.
-- SQL errors abort the whole transaction, including trigger state changes.
rollback;
