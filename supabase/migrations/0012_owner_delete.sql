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

-- Settings > Data: the owner can also clear chats (messages + Sara's conversation memory) and the activity log
-- without deleting patients. A conversation row is recreated by append_history on the next message.
grant delete on messages, conversations, agent_events to authenticated;

drop policy if exists "owners delete messages" on messages;
create policy "owners delete messages" on messages for delete to authenticated using (is_owner(clinic_id));
drop policy if exists "owners delete conversations" on conversations;
create policy "owners delete conversations" on conversations for delete to authenticated
  using (is_owner((select clinic_id from patients where id = patient_id)));
drop policy if exists "owners delete agent events" on agent_events;
create policy "owners delete agent events" on agent_events for delete to authenticated using (is_owner(clinic_id));
