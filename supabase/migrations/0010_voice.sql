-- Voice calls from the web chat (/api/voice): transcripts and usage carry channel 'voice'.
-- Until this runs, voice transcripts fail to log (the call itself still works). Safe to rerun.

begin;
alter table messages drop constraint if exists messages_channel_check;
alter table messages add constraint messages_channel_check check (channel in ('whatsapp', 'web', 'voice'));
alter table usage_events drop constraint if exists usage_events_channel_check;
alter table usage_events add constraint usage_events_channel_check check (channel in ('whatsapp', 'web', 'voice'));
commit;
