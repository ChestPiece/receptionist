-- Owners can reset test chats (Settings > Chat widget): delete patients flagged is_test.
-- Apply 0008_activity.sql first (is_test). Their visits, messages and conversations go with them (on delete cascade).
-- Safe to rerun. Real patients stay undeletable from the dashboard: the policy only matches is_test rows.

begin;
grant delete on patients to authenticated;
drop policy if exists "owners delete test patients" on patients;
create policy "owners delete test patients" on patients for delete to authenticated using (is_test and is_owner(clinic_id));
commit;
