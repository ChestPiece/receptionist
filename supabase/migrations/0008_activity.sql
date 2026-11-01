-- Activity log + test chats + race-free chat history (round 2).
-- Apply 0007_dentists.sql first (this file uses is_member()). Paste into the Supabase SQL editor.
-- Safe to rerun: if not exists, create or replace, policies dropped then created.
-- The service role (agent, webhooks, cron) bypasses RLS, so the bot is not affected by the policies below.

begin;

-- ---------------------------------------------------------------- test patients (set by the dashboard test chat)

alter table patients add column if not exists is_test boolean not null default false;
create index if not exists patients_clinic_real_idx on patients (clinic_id) where not is_test;

-- ---------------------------------------------------------------- activity log

create table if not exists agent_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  patient_id uuid references patients on delete set null,
  appointment_id uuid references appointments on delete set null,
  actor text not null check (actor in ('sara', 'staff', 'system', 'reviewer')),
  kind text not null,
  level text not null default 'info' check (level in ('info', 'warn')),
  summary text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_events_clinic_created_idx on agent_events (clinic_id, created_at desc);
create index if not exists agent_events_patient_created_idx on agent_events (patient_id, created_at desc);

alter table agent_events enable row level security;
drop policy if exists "members read events" on agent_events;
create policy "members read events" on agent_events for select to authenticated using (is_member(clinic_id));
-- Staff may log their own actions; Sara, the reviewer and cron write with the service role.
drop policy if exists "members insert staff events" on agent_events;
create policy "members insert staff events" on agent_events for insert to authenticated
  with check (actor = 'staff' and is_member(clinic_id));

revoke all on agent_events from anon;
revoke update, delete on agent_events from authenticated;

-- The Activity page and its sidebar badge refresh live. Guarded so a rerun does not fail.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_events'
  ) then
    alter publication supabase_realtime add table agent_events;
  end if;
end $$;

-- ---------------------------------------------------------------- append_history

-- Add turns to a chat's history in one statement and keep the last `max` items.
-- Replaces read-modify-write in the app, which lost a message when two arrived together.
-- updated_at is left alone: it times a staff pause.
create or replace function append_history(conv uuid, items jsonb, max int) returns void
language sql security definer set search_path = public as $$
  insert into conversations (patient_id, history)
  values (conv, (select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
                 from (select e, n from jsonb_array_elements(items) with ordinality t(e, n) order by n desc limit max) x))
  on conflict (patient_id) do update set history = (
    select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
    from (select e, n from jsonb_array_elements(conversations.history || items) with ordinality t(e, n) order by n desc limit max) x
  );
$$;
revoke execute on function append_history(uuid, jsonb, int) from public, anon, authenticated;
grant execute on function append_history(uuid, jsonb, int) to service_role;

commit;

-- Checks (read-only, run after pasting):
--   select count(*) from agent_events;                                             -- 0
--   select column_name from information_schema.columns where table_name='patients' and column_name='is_test'; -- 1 row
--   select proname from pg_proc where proname='append_history';                    -- 1 row
