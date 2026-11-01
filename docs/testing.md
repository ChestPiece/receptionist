# Testing the app by hand

## Test logins
Run once (and again any time to reset the passwords):

```bash
bun scripts/create-test-users.ts
```

It creates two Supabase Auth users on the sample clinic (`sample-smile`) and writes their passwords to `.env.local` as `TEST_OWNER_PASSWORD` and `TEST_STAFF_PASSWORD`. The script writes to the live Supabase project.

| Login | Role | Sees |
|---|---|---|
| `owner@frontdesk.test` | owner + platform admin | every clinic |
| `staff@frontdesk.test` | staff | sample clinic |

## Good Shine Dental (multi-dentist test clinic)
```bash
bun scripts/seed-good-shine.ts
```

Builds (or rebuilds, wiping only its own data) the sample clinic `good-shine`: 3 dentists with their own hours (Dr. Omar off next Tuesday), 8 services, 25 patients, 4 weeks of history plus this and next week, 8 chats of which 2 wait for staff. Logins `owner@goodshine.test` (owner) and `staff@goodshine.test` (staff), passwords in `.env.local` as `TEST_GS_OWNER_PASSWORD` / `TEST_GS_STAFF_PASSWORD`. `owner@frontdesk.test` also gets Good Shine, so the clinic switcher shows both. Waiting chats lapse 30 min after seeding: re-run to refresh. Writes to the live Supabase project.

Log in at `http://localhost:3000/login` (`bun run dev`) or on prod at `/login`.

## What to try
- **Today** (`/dashboard`): 4 tallies, Needs staff queue, today's visits per dentist with Arrived / No-show.
- **Web chat** (`/chat/sample-smile`, no login): book, move and cancel a visit in English and Arabic; ask an off-topic question; type an emergency ("I can't breathe") to see the fixed reply; ask for a human to trigger a handoff.
- **Inbox** (`/dashboard/inbox`): the chat you just had shows up; filter Needs staff; Take over / Hand back; reply on WhatsApp or the website chat (the web visitor sees it within about 4 s while the chat is paused).
- **Calendar** (`/dashboard/calendar`): Day view = one column per dentist, Week view = one column per day. Click an empty cell to book, a visit to Move / Arrived / No-show / Cancel.
- **Patients** (`/dashboard/patients`): search, tags, add patient, profile, notes, transcript, book.
- **Settings** (`/dashboard/settings`, owner edits, staff read only): clinic, services, dentists, time off, chat widget accent. Sara picks up changes within a minute.

## Resetting
- New web chat: "New chat" in the chat sidebar, or clear the site's localStorage.
- Reset a WhatsApp test chat: delete its `conversations` row in Supabase.
