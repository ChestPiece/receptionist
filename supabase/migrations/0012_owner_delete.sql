-- Owners delete patients (any, not only test ones), visits, services and dentists. Staff cannot delete.
-- Apply after 0011. Paste into the Supabase SQL editor.
-- A patient delete cascades to their visits, messages, conversation and events (all on delete cascade).
-- A dentist with visits cannot be deleted (appointments.dentist_id is on delete restrict): the app says to deactivate instead.
-- A service delete keeps past visits: appointments.service_id is on delete set null and appointments.service keeps the name.

grant delete on patients, appointments, services, dentists to authenticated;

drop policy if exists "owners delete patients" on patients;
create policy "owners delete patients" on patients for delete to authenticated using (is_owner(clinic_id));
drop policy if exists "owners delete appointments" on appointments;
create policy "owners delete appointments" on appointments for delete to authenticated using (is_owner(clinic_id));
drop policy if exists "owners delete services" on services;
create policy "owners delete services" on services for delete to authenticated using (is_owner(clinic_id));
drop policy if exists "owners delete dentists" on dentists;
create policy "owners delete dentists" on dentists for delete to authenticated using (is_owner(clinic_id));
