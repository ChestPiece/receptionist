-- Code review fixes (2026-11-04). Safe to rerun. Until this runs, the app's new rate limits fail open (a "[rate]" warning in the logs).

begin;

-- ---------------------------------------------------------------- staff inserts stay inside their clinic
-- The old checks only tested clinic_id, so a member of clinic A could write a "Front desk" line into a clinic B patient's
-- web chat (the visitor polls messages by patient_id). Now the patient (and appointment) must belong to that clinic too.
drop policy if exists "members insert staff messages" on messages;
create policy "members insert staff messages" on messages for insert to authenticated
  with check (
    role = 'staff' and is_member(clinic_id)
    and exists (select 1 from patients p where p.id = patient_id and p.clinic_id = messages.clinic_id)
  );

drop policy if exists "members insert staff events" on agent_events;
create policy "members insert staff events" on agent_events for insert to authenticated
  with check (
    actor = 'staff' and is_member(clinic_id)
    and (patient_id is null or exists (select 1 from patients p where p.id = patient_id and p.clinic_id = agent_events.clinic_id))
    and (appointment_id is null or exists (select 1 from appointments a where a.id = appointment_id and a.clinic_id = agent_events.clinic_id))
  );

-- ---------------------------------------------------------------- default grants on the early tables
-- RLS already blocks these, but they still carry Supabase's default grants. The later tables revoke; do the same here.
revoke all on clinic_secrets, processed_messages from anon, authenticated;
revoke all on usage_events, memberships, platform_admins from anon;
revoke insert, update, delete on usage_events, memberships, platform_admins from authenticated;

-- ---------------------------------------------------------------- rate limiter
-- hit(key, max, window_s): true and counts one hit when the key had fewer than `max` hits in the last window_s seconds,
-- false otherwise. The advisory lock makes check-and-insert atomic per key, so parallel requests can't all slip through.
create table if not exists rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_hits_key_at_idx on rate_hits (key, at);
alter table rate_hits enable row level security; -- no policies: service role only
revoke all on rate_hits from anon, authenticated;

create or replace function hit(k text, max int, window_s int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext(k));
  delete from rate_hits where key = k and at < now() - make_interval(secs => window_s);
  select count(*) into n from rate_hits where key = k;
  if n >= max then return false; end if;
  insert into rate_hits (key) values (k);
  -- ponytail: random sweep of keys nobody hits again; a pg_cron job if the table ever grows.
  if random() < 0.01 then delete from rate_hits where at < now() - interval '1 day'; end if;
  return true;
end $$;
revoke execute on function hit(text, int, int) from public, anon, authenticated;
grant execute on function hit(text, int, int) to service_role;

commit;
