-- Speed pass (0006): indexes for the dashboard, RLS initplan fixes, and inbox_list().
-- Safe to rerun: every statement uses if [not] exists, create or replace, or drop-then-create.
-- The owner pastes this into the Supabase SQL editor. It changes no data.

begin;

-- Inbox: latest message per patient, and a patient's thread, both newest id first.
create index if not exists messages_clinic_patient_id_idx on messages (clinic_id, patient_id, id desc);
create index if not exists messages_patient_id_desc_idx on messages (patient_id, id desc);
-- Nothing reads messages by created_at any more.
drop index if exists messages_clinic_id_created_at_idx;

-- Calendar reads a week of visits of every status but cancelled; the old index covered only status = 'booked'.
create index if not exists appointments_clinic_starts_idx on appointments (clinic_id, starts_at);
drop index if exists appointments_clinic_id_starts_at_idx;

-- RLS initplan: (select auth.uid()) is evaluated once per query instead of once per row.
create or replace function is_member(clinic uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where user_id = (select auth.uid()) and clinic_id = clinic)
      or exists (select 1 from platform_admins where user_id = (select auth.uid()));
$$;

drop policy if exists "own memberships" on memberships;
create policy "own memberships" on memberships for select to authenticated using (user_id = (select auth.uid()));

-- Inbox list: the newest message of each patient chat in a clinic, newest chat first.
-- security invoker: RLS on messages, patients and conversations still applies, so a member of
-- another clinic gets no rows.
create or replace function inbox_list(clinic uuid, max_rows int default 200)
returns table (
  patient_id uuid, name text, phone text, wa_id text,
  channel text, role text, body text, created_at timestamptz,
  last_id bigint, bot_paused boolean, updated_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select l.patient_id, p.name, p.phone, p.wa_id,
         l.channel, l.role, l.body, l.created_at,
         l.id, coalesce(c.bot_paused, false), c.updated_at
  from (
    select distinct on (m.patient_id) m.id, m.patient_id, m.channel, m.role, m.body, m.created_at
    from messages m
    where m.clinic_id = clinic
    order by m.patient_id, m.id desc
  ) l
  join patients p on p.id = l.patient_id
  left join conversations c on c.patient_id = l.patient_id
  order by l.id desc
  limit max_rows;
$$;
revoke execute on function inbox_list(uuid, int) from public, anon;
grant execute on function inbox_list(uuid, int) to authenticated;

commit;
