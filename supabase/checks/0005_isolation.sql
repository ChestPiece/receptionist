  -- Two-user isolation check for 0005_dashboard.sql. Read-only: everything runs in a transaction that rolls back.
  -- Replace <USER_A>, <USER_B> (auth user ids) and <CLINIC_A>, <CLINIC_B> (their clinics, one membership each).
  -- Expected: each user sees only rows of their own clinic; "other_clinic" counts are all 0.

  begin;
  set local role authenticated;

  set local request.jwt.claims = '{"sub":"<USER_A>","role":"authenticated"}';
  select 'A' as as_user,
    (select count(*) from clinics where id = '<CLINIC_B>') as other_clinic_clinics,
    (select count(*) from patients where clinic_id = '<CLINIC_B>') as other_clinic_patients,
    (select count(*) from appointments where clinic_id = '<CLINIC_B>') as other_clinic_appointments,
    (select count(*) from messages where clinic_id = '<CLINIC_B>') as other_clinic_messages,
    (select count(*) from conversations c join patients p on p.id = c.patient_id where p.clinic_id = '<CLINIC_B>') as other_clinic_conversations,
    (select count(*) from clinic_secrets) as secrets_visible,
    (select count(*) from clinics where id = '<CLINIC_A>') as own_clinic;

  set local request.jwt.claims = '{"sub":"<USER_B>","role":"authenticated"}';
  select 'B' as as_user,
    (select count(*) from clinics where id = '<CLINIC_A>') as other_clinic_clinics,
    (select count(*) from patients where clinic_id = '<CLINIC_A>') as other_clinic_patients,
    (select count(*) from appointments where clinic_id = '<CLINIC_A>') as other_clinic_appointments,
    (select count(*) from messages where clinic_id = '<CLINIC_A>') as other_clinic_messages,
    (select count(*) from conversations c join patients p on p.id = c.patient_id where p.clinic_id = '<CLINIC_A>') as other_clinic_conversations,
    (select count(*) from clinic_secrets) as secrets_visible,
    (select count(*) from clinics where id = '<CLINIC_B>') as own_clinic;

  -- own_clinic should be 1; everything else 0.

  -- inbox_list (0006_speed.sql) is security invoker: a member of one clinic reading another clinic's inbox gets 0 rows.
  set local request.jwt.claims = '{"sub":"<USER_A>","role":"authenticated"}';
  select 'A' as as_user, (select count(*) from inbox_list('<CLINIC_B>')) as other_clinic_inbox;
  set local request.jwt.claims = '{"sub":"<USER_B>","role":"authenticated"}';
  select 'B' as as_user, (select count(*) from inbox_list('<CLINIC_A>')) as other_clinic_inbox;
  -- other_clinic_inbox should be 0 for both.
  rollback;
