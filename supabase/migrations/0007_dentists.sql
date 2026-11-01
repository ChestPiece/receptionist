-- Multi-dentist booking (front-desk CRM): services, dentists, time off, and a per-dentist no-overlap guard.
-- Apply 0006_speed.sql first (this file assumes its is_member() and indexes). Paste into the Supabase SQL editor.
-- Safe to rerun: tables use if not exists, the backfill uses where not exists, policies are dropped then created.
-- The service role (agent, webhooks, cron) bypasses RLS, so the bot is not affected by the policies below.
-- Verification queries are at the bottom.

begin;

-- ---------------------------------------------------------------- tables

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  name text not null,
  name_ar text,
  minutes int not null check (minutes > 0),
  price_aed numeric(10, 2),
  active boolean not null default true,
  sort int not null default 0,
  unique (clinic_id, name)
);

-- hours: same shape as clinics.hours, e.g. {"sat":[["09:00","13:00"],["16:00","21:00"]]}.
-- Owners deactivate a dentist (active = false), never delete: appointments.dentist_id is on delete restrict.
create table if not exists dentists (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  name text not null,
  name_ar text,
  title text,
  color text not null default '#6b8f71',
  hours jsonb not null default '{}',
  active boolean not null default true,
  sort int not null default 0
);

-- Both link tables carry clinic_id for is_member() policies and the Realtime filter.
create table if not exists dentist_services (
  clinic_id uuid not null references clinics on delete cascade,
  dentist_id uuid not null references dentists on delete cascade,
  service_id uuid not null references services on delete cascade,
  primary key (dentist_id, service_id)
);

create table if not exists time_off (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  dentist_id uuid not null references dentists on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text
);

create index if not exists services_clinic_idx on services (clinic_id);
create index if not exists dentists_clinic_idx on dentists (clinic_id, sort);
create index if not exists dentist_services_clinic_idx on dentist_services (clinic_id);
create index if not exists dentist_services_service_idx on dentist_services (service_id);
create index if not exists time_off_dentist_idx on time_off (dentist_id, starts_at);
create index if not exists time_off_clinic_idx on time_off (clinic_id);

alter table services enable row level security;
alter table dentists enable row level security;
alter table dentist_services enable row level security;
alter table time_off enable row level security;

alter table appointments
  add column if not exists dentist_id uuid references dentists on delete restrict,
  add column if not exists service_id uuid references services on delete set null; -- appointments.service stays as the display name
create index if not exists appointments_dentist_starts_idx on appointments (dentist_id, starts_at);
create index if not exists appointments_service_idx on appointments (service_id);

-- ---------------------------------------------------------------- backfill

-- Services: copy clinics.services JSON (clinics.services stays for now, nothing reads it after this change).
insert into services (clinic_id, name, name_ar, minutes, price_aed, sort)
select c.id, s.item->>'name', s.item->>'name_ar', (s.item->>'minutes')::int, (s.item->>'price_aed')::numeric, (s.ord - 1)::int
from clinics c
cross join lateral jsonb_array_elements(c.services) with ordinality as s(item, ord)
where not exists (select 1 from services x where x.clinic_id = c.id and x.name = s.item->>'name');

-- One dentist per clinic that has none, named after the clinic, with the clinic's hours, doing every service.
with new_dentists as (
  insert into dentists (clinic_id, name, hours)
  select c.id, c.name, c.hours
  from clinics c
  where not exists (select 1 from dentists d where d.clinic_id = c.id)
  returning id, clinic_id
)
insert into dentist_services (clinic_id, dentist_id, service_id)
select nd.clinic_id, nd.id, s.id
from new_dentists nd
join services s on s.clinic_id = nd.clinic_id;

-- Every visit gets its clinic's first dentist, and the service row matching its name (null if none).
update appointments a
set dentist_id = (select d.id from dentists d where d.clinic_id = a.clinic_id order by d.sort, d.name limit 1)
where a.dentist_id is null;

update appointments a
set service_id = s.id
from services s
where a.service_id is null and s.clinic_id = a.clinic_id and s.name = a.service;

alter table appointments alter column dentist_id set not null;

-- Old code safety: prod (master) inserts appointments without dentist_id.
-- Fill a null one with the clinic's first active dentist. Drop this trigger once the new code is on master.
create or replace function appointments_default_dentist() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.dentist_id is null then
    select d.id into new.dentist_id
    from dentists d
    where d.clinic_id = new.clinic_id and d.active
    order by d.sort, d.name
    limit 1;
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_default_dentist on appointments;
create trigger appointments_default_dentist before insert on appointments
  for each row execute function appointments_default_dentist();

-- ---------------------------------------------------------------- no double booking, per dentist

-- The 0001 exclusion constraint is unnamed (per clinic): find it and drop it.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where contype = 'x' and conrelid = 'appointments'::regclass and conname <> 'appointments_dentist_no_overlap'
  loop
    execute format('alter table appointments drop constraint %I', c.conname);
  end loop;
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_dentist_no_overlap' and conrelid = 'appointments'::regclass
  ) then
    alter table appointments add constraint appointments_dentist_no_overlap
      exclude using gist (dentist_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'booked');
  end if;
end $$;

-- ---------------------------------------------------------------- patients without WhatsApp or web id

alter table patients drop constraint if exists patients_identity;
alter table patients add constraint patients_identity
  check (wa_id is not null or web_visitor_id is not null or phone is not null);

-- ---------------------------------------------------------------- RLS

-- security definer, like is_member(): policies call this without needing their own policies on memberships.
create or replace function is_owner(clinic uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where user_id = (select auth.uid()) and clinic_id = clinic and role = 'owner')
      or exists (select 1 from platform_admins where user_id = (select auth.uid()));
$$;
revoke execute on function is_owner(uuid) from public, anon;
grant execute on function is_owner(uuid) to authenticated;

-- Members read the new tables.
drop policy if exists "members read services" on services;
create policy "members read services" on services for select to authenticated using (is_member(clinic_id));
drop policy if exists "members read dentists" on dentists;
create policy "members read dentists" on dentists for select to authenticated using (is_member(clinic_id));
drop policy if exists "members read dentist_services" on dentist_services;
create policy "members read dentist_services" on dentist_services for select to authenticated using (is_member(clinic_id));
drop policy if exists "members read time_off" on time_off;
create policy "members read time_off" on time_off for select to authenticated using (is_member(clinic_id));

-- Owners write setup. Link rows must point at a dentist/service of the same clinic (cross-tenant guard).
drop policy if exists "owners insert services" on services;
create policy "owners insert services" on services for insert to authenticated with check (is_owner(clinic_id));
drop policy if exists "owners update services" on services;
create policy "owners update services" on services for update to authenticated
  using (is_owner(clinic_id)) with check (is_owner(clinic_id));

drop policy if exists "owners insert dentists" on dentists;
create policy "owners insert dentists" on dentists for insert to authenticated with check (is_owner(clinic_id));
drop policy if exists "owners update dentists" on dentists;
create policy "owners update dentists" on dentists for update to authenticated
  using (is_owner(clinic_id)) with check (is_owner(clinic_id));

drop policy if exists "owners insert dentist_services" on dentist_services;
create policy "owners insert dentist_services" on dentist_services for insert to authenticated
  with check (
    is_owner(clinic_id)
    and exists (select 1 from dentists d where d.id = dentist_id and d.clinic_id = dentist_services.clinic_id)
    and exists (select 1 from services s where s.id = service_id and s.clinic_id = dentist_services.clinic_id)
  );
drop policy if exists "owners update dentist_services" on dentist_services;
create policy "owners update dentist_services" on dentist_services for update to authenticated
  using (is_owner(clinic_id))
  with check (
    is_owner(clinic_id)
    and exists (select 1 from dentists d where d.id = dentist_id and d.clinic_id = dentist_services.clinic_id)
    and exists (select 1 from services s where s.id = service_id and s.clinic_id = dentist_services.clinic_id)
  );
drop policy if exists "owners delete dentist_services" on dentist_services;
create policy "owners delete dentist_services" on dentist_services for delete to authenticated using (is_owner(clinic_id));

drop policy if exists "owners insert time_off" on time_off;
create policy "owners insert time_off" on time_off for insert to authenticated
  with check (
    is_owner(clinic_id)
    and exists (select 1 from dentists d where d.id = dentist_id and d.clinic_id = time_off.clinic_id)
  );
drop policy if exists "owners update time_off" on time_off;
create policy "owners update time_off" on time_off for update to authenticated
  using (is_owner(clinic_id))
  with check (
    is_owner(clinic_id)
    and exists (select 1 from dentists d where d.id = dentist_id and d.clinic_id = time_off.clinic_id)
  );
drop policy if exists "owners delete time_off" on time_off;
create policy "owners delete time_off" on time_off for delete to authenticated using (is_owner(clinic_id));

-- Appointments: staff book from the dashboard. patient, dentist and service must belong to the clinic.
drop policy if exists "members insert appointments" on appointments;
create policy "members insert appointments" on appointments for insert to authenticated
  with check (
    is_member(clinic_id) and source = 'staff' and status = 'booked'
    and exists (select 1 from patients p where p.id = patient_id and p.clinic_id = appointments.clinic_id)
    and exists (select 1 from dentists d where d.id = dentist_id and d.clinic_id = appointments.clinic_id)
    and (service_id is null or exists (select 1 from services s where s.id = service_id and s.clinic_id = appointments.clinic_id))
  );
drop policy if exists "members update appointments" on appointments;
create policy "members update appointments" on appointments for update to authenticated
  using (is_member(clinic_id))
  with check (
    is_member(clinic_id)
    and exists (select 1 from dentists d where d.id = dentist_id and d.clinic_id = appointments.clinic_id)
    and (service_id is null or exists (select 1 from services s where s.id = service_id and s.clinic_id = appointments.clinic_id))
  );

-- Desk-added patients.
drop policy if exists "members insert patients" on patients;
create policy "members insert patients" on patients for insert to authenticated with check (is_member(clinic_id));

-- Clinic setup: owners edit a fixed set of columns. Never staff_whatsapp, ultramsg_instance_id, slug, active, clinic_secrets.
drop policy if exists "owners update clinics" on clinics;
create policy "owners update clinics" on clinics for update to authenticated
  using (is_owner(id)) with check (is_owner(id));

-- Column grants. Supabase grants authenticated every column by default, so revoke first, then grant the list.
revoke update on clinics from authenticated;
grant update (name, phone, address, maps_url, hours, insurers, faq, branding) on clinics to authenticated;

revoke insert on appointments from authenticated;
grant insert (clinic_id, patient_id, dentist_id, service, service_id, starts_at, ends_at, status, source)
  on appointments to authenticated;
revoke update on appointments from authenticated;
grant update (starts_at, ends_at, dentist_id, service, service_id, status, confirmed_at, reminded_24h_at, reminded_2h_at)
  on appointments to authenticated;

revoke insert on patients from authenticated;
grant insert (clinic_id, name, phone, wa_id, email, notes, tags) on patients to authenticated;
revoke update on patients from authenticated;
grant update (name, phone, wa_id, email, notes, tags) on patients to authenticated;

-- The new tables are for signed-in members only.
revoke all on services, dentists, dentist_services, time_off from anon;

-- ---------------------------------------------------------------- Realtime

-- The calendar shades time off live. Guarded so a rerun does not fail.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'time_off'
  ) then
    alter publication supabase_realtime add table time_off;
  end if;
end $$;

commit;

-- Checks (read-only, run after pasting):
--   select count(*) from appointments where dentist_id is null;            -- 0
--   select conname from pg_constraint where contype='x' and conrelid='appointments'::regclass; -- appointments_dentist_no_overlap only
--   select c.slug, count(d.*) from clinics c join dentists d on d.clinic_id=c.id group by 1; -- 1 per existing clinic
