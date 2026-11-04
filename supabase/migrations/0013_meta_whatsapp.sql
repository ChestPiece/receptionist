-- Official WhatsApp (Meta Cloud API) as a second provider, chosen per clinic. UltraMsg stays the default.
-- Paste into the Supabase SQL editor after 0012. Code that reads these columns needs this first.
--
-- One Meta app (ours) receives the webhooks of every clinic: its app secret and verify token live in env
-- (META_APP_SECRET, META_VERIFY_TOKEN). Per clinic: the phone number id (public, picks the clinic from the
-- payload) and the access token (secret, service role only, like the UltraMsg token).

alter table clinics
  add column wa_provider text not null default 'ultramsg' check (wa_provider in ('ultramsg', 'meta')),
  add column meta_phone_number_id text unique,
  -- Approved message templates for sends outside Meta's 24 h window, e.g.
  -- {"reminder":{"name":"visit_reminder","lang":"en"},"followup":{"name":"booking_nudge","lang":"en"}}
  -- reminder body params, in order: {{1}} first name, {{2}} service, {{3}} clinic, {{4}} date and time
  -- followup body params, in order: {{1}} first name, {{2}} clinic
  add column meta_templates jsonb not null default '{}';

alter table clinic_secrets
  alter column ultramsg_token drop not null,
  add column meta_token text;

-- Connect a clinic to Meta (run by hand, values from .env.local / Meta Business Manager, never committed):
-- update clinics set wa_provider = 'meta', meta_phone_number_id = '<PHONE_NUMBER_ID>' where slug = '<slug>';
-- update clinic_secrets set meta_token = '<ACCESS_TOKEN>' where clinic_id = (select id from clinics where slug = '<slug>');
-- (no clinic_secrets row yet: insert into clinic_secrets (clinic_id, webhook_secret, meta_token) values (..., gen_random_uuid()::text, '<ACCESS_TOKEN>');)
