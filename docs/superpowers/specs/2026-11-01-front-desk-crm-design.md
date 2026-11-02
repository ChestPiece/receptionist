# Front-desk CRM: multi-dentist booking, dashboard redesign, Good Shine test clinic

Repo: `clinic-whatsapp-bot` (branch `dev`). Read `CLAUDE.md`, `AGENTS.md` (Next 16 docs in `node_modules/next/dist/docs/`) and `.tastemaker/style-lock.md` first.

## Context

The staff dashboard (Today / Inbox / Calendar / Patients) is a read-mostly viewer with layout bugs: `main` has no fixed height, so the 09:00-21:00 calendar pushes the page into a long scroll, and the inbox guesses its height (`calc(100dvh-180px)`), giving scroll-in-scroll and an empty thread pane. Clinic setup (hours, services, FAQ) lives as JSON on the `clinics` row and changes only by SQL. Booking assumes one chair per clinic. Staff can't book, move, or add patients, and can't reply to website chats.

Anas wants the dashboard to be a real front-desk CRM tied to Sara: what the owner sets up is what Sara books against, and what Sara books is what the desk sees. He wants a clean, compact, fully responsive layout with no stray scroll, built on shadcn, in a new warm cream + sage look. He'll test it on a new clinic, **Good Shine Dental**, with seeded realistic data and owner + staff logins.

### Decisions (Anas)
- Clinics have 2-3 dentists, each with their own weekly hours. Sara books per dentist.
- The owner edits setup in dashboard Settings; staff see it read-only.
- The front desk can book / move / cancel visits, add / edit patients, mark arrived / no-show, and reply in WhatsApp **and** website chats.
- Look: warm cream + sage (Capacities / Alma references), replacing the stone look in the app. The landing night scenes stay as they are.

### Calls I made (Anas said "decide the best option")
- One design for both chats, split by owner: the dashboard inbox uses the product look; the patient web chat is white-label (structure is ours, accent color + logo come from the clinic's `branding`).
- Sara asks which dentist only when the patient names one or when only one dentist does that service. Otherwise she offers the earliest free times across all dentists who do the service and assigns the dentist on booking (least-booked that day wins ties).
- Good Shine seed: a busy current + next week, plus 4 weeks of history. Sample Smile stays untouched beside it (also tests the clinic switcher).
- Light theme is the dashboard default; dark stays as a toggle.

### Answers after the builder check (Anas)
- A desk-entered mobile number is also saved as the patient's WhatsApp id (`<digits>@c.us`), so reminders go out and a later WhatsApp message matches the same patient. Look up by `wa_id` / `phone` before insert to avoid duplicates.
- A web chat handed to staff pauses Sara; the pause lapses after 30 min like WhatsApp, and the visitor sees a "Sara is back" note.
- Owner changes that clash with booked visits (shorter hours, time off, deactivating a dentist) are saved, then a dialog lists the clashing visits with Move / Cancel. Nothing changes silently.

### Non-goals
- No clinical notes or charts (front-desk CRM only). No rooms/chairs separate from dentists (dentist = bookable column). No payments, no analytics page (Today tallies only). No new WhatsApp instance for Good Shine (it's tested on web chat; WhatsApp stays on the Sample Smile instance unless Anas moves it).
- No drag-and-drop calendar in this round (moving a visit = dialog).

## 1. Data model: `supabase/migrations/0007_dentists.sql`

**Prerequisite:** `0006_speed.sql` is still not applied. Anas pastes 0006 then 0007 in the SQL editor. Ask before any Supabase write.

- `services(id, clinic_id, name, name_ar, minutes, price_aed, active, sort, unique(clinic_id, name))`.
- `dentists(id, clinic_id, name, name_ar, title, color, hours jsonb, active, sort)`. `hours` uses the same `Hours` shape as `clinics.hours` (reuse `src/lib/slots.ts` types). FKs to dentists are `on delete restrict`; owners deactivate (`active=false`), never delete.
- `dentist_services(clinic_id, dentist_id, service_id)` and `time_off(id, clinic_id, dentist_id, starts_at timestamptz, ends_at timestamptz, reason)`: both carry `clinic_id` for `is_member()` policies and the Realtime filter. Whole-day UI ranges convert with the clinic offset.
- `appointments`: add `dentist_id` (FK) and `service_id` (FK, nullable; keep `service text` as the display name). Index `(dentist_id, starts_at)`.
- `patients_identity` check (`0004:32`): also allow `phone is not null` so desk-only patients can exist (desk patients normally get `wa_id` too, per Anas's answer).
- **Backfill (idempotent, `where not exists`):** per clinic, copy `clinics.services` JSON into `services`; create one dentist named after the clinic with the clinic's hours doing every service; set every appointment's `dentist_id` to it and `service_id` by name match (null if none). Then `dentist_id set not null`.
- **Old code safety:** prod (`master`) runs old code that inserts without `dentist_id`. Add a `BEFORE INSERT` trigger that fills a null `dentist_id` with the clinic's first active dentist (by `sort`). Drop it in a later migration once new code is on `master`.
- Swap the exclusion constraint from `clinic_id` to `dentist_id` in one transaction: the 0001 constraint is unnamed, so find it in a `DO` block via `pg_constraint` (`contype='x'`, `conrelid='appointments'::regclass`) and drop it, then add `appointments_dentist_no_overlap exclude using gist (dentist_id with =, tstzrange(starts_at, ends_at) with &&) where (status='booked')`. `btree_gist` is already installed (0001:4). The `23P01` → TAKEN mapping keeps working.
- `clinics.services` JSON stays for now (read by nothing after this change; drop in a later migration). `clinics.hours` stays as opening hours (after-hours tally, outer bound, web chat sidebar).
- `clinics.branding jsonb` (exists) holds `{accent, logo_url}`.
- **RLS** (helpers `is_member()`, new `is_owner(clinic_id)` = `memberships.role='owner'` **or** `platform_admins`):
  - Members: select on all new tables.
  - Members insert `appointments` with check `is_member(clinic_id) and source='staff' and status='booked'` and that `patient_id`, `dentist_id`, `service_id` all belong to `clinic_id` (cross-tenant guard). Same FK-ownership check on the update policy.
  - Column grants (0005 revoked table-level update): `appointments (starts_at, ends_at, dentist_id, service, service_id, status, confirmed_at, reminded_24h_at, reminded_2h_at)`; patients insert `(clinic_id, name, phone, wa_id, email, notes, tags)` and add `wa_id` to the update grant. `conversations (bot_paused, updated_at)` already exists.
  - Owners: insert/update on `services`, `dentists`; insert/update/delete on `dentist_services`, `time_off`.
  - `clinics`: **first `revoke update on clinics from authenticated`**, then grant only `(name, phone, address, maps_url, hours, insurers, faq, branding)` under an owner update policy. Never `staff_whatsapp`, `ultramsg_instance_id`, `slug`, `active`, or `clinic_secrets`.
  - Realtime publication: add `time_off`.

## 2. One booking engine: new `src/lib/booking.ts`

Move booking logic out of the Sara tools so Sara, the dashboard, and `jobs.ts` share it. Every function takes a Supabase client (Sara passes the service client; the dashboard passes the user's RLS client), so the DB constraint + RLS guard both paths.

- `availability(sb, clinic, {serviceId, from, days, dentistId?, ignoreId?})` → `{[date]: [{time, dentistIds[]}]}`. Prefetch booked visits and time off for the whole range once (one query each, filtered `dentist_id in (...)`, which also fixes today's clinic-wide block). Per active dentist doing the service: `freeSlots(dentist.hours, booked ∪ time_off, minutes, date, now, offset)` from `slots.ts`, then union by time. Dentist hours are validated inside clinic opening hours at Settings save (no runtime intersection).
- `pickDentist(...)` → least-booked dentist that day among those free at that time (pure, unit-tested).
- `bookVisit(sb, clinic, {patientId, serviceId, date, time, dentistId?, source})`, `moveVisit(sb, clinic, {id, date, time, dentistId?})` (resets `reminded_*` and `confirmed_at` like `sara.ts:167`), `cancelVisit(sb, id)`. Caps: `MAX_UPCOMING = 3` on the Sara path only, 60-day horizon (`tooFar`). Map `23P01` → TAKEN.
- `clashes(sb, clinic, dentistId)` → booked future visits outside the dentist's new hours / inside time off / for an inactive dentist (Settings conflict dialog).
- `jobs.ts` `nextFree` (`jobs.ts:149-158`, 7 sequential `slotsOn` queries) switches to one `availability` call over 7 days. `jobs.ts` and `sara.ts` already import each other: `booking.ts` imports neither; move `bookingSource` into `booking.ts`.
- **Clinic config load:** `src/lib/clinics.ts` `SELECT` adds `service_rows:services(*), dentists(*, dentist_services(service_id))` (alias, because `clinics.services` jsonb already exists); `toClinic` maps `service_rows` onto `Clinic.services` (now with `id`) sorted by `sort, name`, and dentists sorted the same way so the prompt prefix is deterministic. Add exported `forgetClinic(id)`; Settings actions call it. Lower `TTL` to 60 s. `ponytail:` per-instance cache, other Vercel instances may be up to 60 s stale; upgrade path is a `config_version` check. Dashboard reads config uncached through the RLS client, so it is never stale.
- Update the typed `Clinic` fixtures in `sara.test.ts`, `clinics.test.ts`, `jobs.test.ts`.

## 3. Sara changes: `src/lib/sara.ts`

- `find_slots(service, dates, dentist: string|null)` returns `{service, dentist?, days:[{date, times[], note?}]}` (shape the web `SlotPicker` already reads; add optional `dentist` label).
- `book(service, date, time, patient_name, patient_phone, dentist: string|null)` returns the booked card plus `dentist` name.
- `reschedule` keeps the dentist unless the patient asks for another.
- `my_appointments` adds the dentist name.
- `buildInstructions`: static "Clinic info" JSON gains `dentists: [{name, title, services[]}]` and services from the table, sorted; no time off or anything date-based there. It stays before "Today is" (the cache-prefix test in `sara.test.ts` must still pass). With only one active dentist (Sample Smile after backfill), omit dentist names from the prompt and tool results. Add one prompt rule: ask about a dentist only if the patient names one or only one dentist does the service; if the named dentist is on time off, say so and offer other days or dentists.
- `handoff_to_staff`: today it returns early when `!clinic.wa` (`sara.ts:200`), so web handoff never pauses for a clinic without WhatsApp (Good Shine). New order: pause the conversation first (both channels), then send the staff WhatsApp alert only if `wa` and `staff_whatsapp` exist.
- `src/app/api/chat/route.ts`: check `stillPaused` (as `agent.ts` does). While paused, save the patient message to history **without** touching `updated_at` (mirror `agent.ts:207`; `route.ts:69` currently bumps it on every message, which would keep the 30-min lapse from ever firing), skip the model, and return a fixed short "front desk has your chat" stream.

## 4. Dashboard shell and look

- **Tokens:** rewrite the light + dark app tokens in `src/app/globals.css` to warm cream surfaces + sage `--primary` (keep token names so shadcn pieces follow; keep `--web` blue, `--alert` coral-red as meaning colors; landing `--night*`/`--dawn*` untouched). Remove the dead `slip` / `torn-top` / `label` classes after their last uses are replaced. Update `.tastemaker/style-lock.md` with the new palette, density, and layout rules (Anas asked for the new look, so the lock changes).
- **Add shadcn pieces** via the CLI: `sidebar`, `table`, `tabs`, `popover`, `calendar` (pulls `react-day-picker` + `date-fns`), `label`, `switch`, `checkbox`, `avatar`, `toggle-group`, `sonner`. No form or table library: server actions + `useActionState`, server-side filters.
- **Shell (`src/app/dashboard/layout.tsx`):** shadcn `SidebarProvider` + `Sidebar collapsible="icon"` (sheet on phones) with Today, Inbox (needs-staff badge), Calendar, Patients, Settings (owner only), clinic switcher in the sidebar header, user + theme in the footer. Root is `h-dvh overflow-hidden`; `SidebarInset` is `flex min-h-0 flex-col`; each page gets a compact header row (title + actions, ~56px) and a body that is `flex-1 min-h-0` where only inner panes scroll (`ScrollArea`). No `calc(100dvh-…)` guesses anywhere.
- Global "New booking" button in the page header (dialog, see 5) and a `⌘K` command menu (patients + pages; `command` is installed).
- Drop the `ledger.tsx` leftovers (`Line`, `Typed`, `Tally` restyled into a `Stat` piece). Keep `Live` realtime refresh.

## 5. Pages

- **Today:** one row of 4 compact stats (visits today, booked by Sara this week, needs staff, no-shows this week). Below, two panes side by side (stacked on phones): "Needs staff" queue (click → inbox thread) and "Today" agenda grouped by dentist with arrive / no-show buttons inline. No full week grid here.
- **Calendar:** toolbar with Day / Week toggle, date picker, today button, dentist filter. **Day view = one column per dentist**, **week view = one column per day** (dentist color stripe on each block). Generalise `WeekCalendar` in `ledger.tsx` into a `Schedule` component taking `columns[]` + `blocks[]`; hour range comes from the clinic's opening hours; ~44px rows; the grid scrolls inside its pane and opens scrolled to now; time off and closed hours shaded. Click an empty cell → booking dialog prefilled (dentist, date, time). Click a block → side sheet with patient, service, dentist, channel, and Move / Cancel / Arrived / No-show.
- **Booking dialog (`booking-dialog.tsx`):** patient combobox (search by name/phone, or "New patient" inline: name + phone), service, dentist ("Any"), date (shadcn Calendar), free times from `availability` (server action), confirm → `bookVisit` with `source='staff'`. Same dialog in move mode.
- **Inbox:** 3 panes on `xl` (list 320px | thread | patient context 300px: upcoming visits, tags, "Book visit", link to profile); 2 panes on `lg`; list-or-thread on phones. Tabs: All / Needs staff / WhatsApp / Website. Thread shows Sara's booking cards as compact system rows. Reply box works for **both channels**: `staffReply` (`actions.ts:36-47`) branches on the patient's channel instead of returning on `!wa_id` and hard-coding `channel: "whatsapp"`; web writes a `staff` message (channel `web`) + appends to history, no send. Remove the UI block at `inbox/page.tsx:102-108`. Take over / Hand back for both.
- **Role gating:** add `role` to `DeskClinic` (`src/lib/dashboard.ts:8`, from `memberships`, `owner` if platform admin) so the sidebar and Settings know who can edit.
- **Patients:** shadcn `Table` with search, tag filter, channel column, last visit, next visit, "Add patient" dialog. Profile page: details form, visits (with Book / Move / Cancel), tags, notes, transcript, in a two-column layout that fits the viewport.
- **Settings (owner; staff read-only):** tabs Clinic (name, phone, address, maps, opening hours editor, insurers, FAQ), Services (table + dialog: EN/AR name, minutes, price, active, which dentists), Dentists (list + dialog: name, title, color, services, weekly hours editor reusing the opening-hours editor; hours must sit inside opening hours), Time off (per dentist, date range), Chat widget (accent color with contrast check, logo URL, live preview link to `/chat/[slug]`). Every save calls `forgetClinic`. Saves that touch dentist hours, time off, or `active` then run `clashes()` and, if any, open a dialog listing the clashing visits with Move / Cancel.
- **Add patient** (dialog, also inline in the booking dialog): name + mobile (UAE format, normalised to digits). Look up by `wa_id` / `phone` first; if found, use that patient. New patients get `phone` and `wa_id = <digits>@c.us`.

## 6. Patient web chat: `src/app/chat/[slug]/*`

- Restyle to the new tokens; set `--primary` from `clinic.branding.accent` on the chat root (fallback: sage), logo from the existing `branding.logo` key (`clinics.ts:20`), else clinic name.
- Slot picker + booked card show the dentist (only when the clinic has more than one).
- Staff replies reach the patient: `GET /api/chat` returns `{paused, messages}` and accepts `?after=<message id>`. While paused the client polls every 4 s (tab visible only), appends only new staff messages (no id merge with streamed messages, whose ids differ), and shows "You're chatting with the front desk". When the pause lapses or staff hand back, it shows "Sara is back" and stops polling. `ponytail:` polling, not realtime, because anonymous visitors can't pass RLS; upgrade path is a signed per-visitor realtime channel.

## 7. Good Shine Dental test clinic: `scripts/seed-good-shine.ts`

Same pattern as `scripts/create-test-users.ts` (service role, idempotent upserts by slug, passwords into `.env.local` only, never printed). **Writes to the live DB: run only after Anas says go.** All data synthetic and labeled "(sample data)".

- Clinic `good-shine`, "Good Shine Dental Clinic (sample data)", Jumeirah address (sample), UTC+4, opening hours Sat-Thu 09:00-21:00, Fri 16:00-21:00, insurers Daman / AXA / NextCare / Thiqa, 6 FAQs, branding accent (a teal-green distinct from our sage, to prove white-label).
- Dentists: Dr. Amal Haddad (General, Sat-Thu 09:00-14:00 + 17:00-21:00), Dr. Omar Siddiqui (Orthodontist, Sun/Tue/Thu 10:00-18:00), Dr. Lina Farouk (Cosmetic + hygiene, Sat-Wed 13:00-21:00, Fri 16:00-21:00). Dr. Omar on leave next Tuesday.
- 8 services with EN/AR names, minutes, AED prices, mapped to dentists (e.g. braces consult only Omar, whitening + veneers consult only Lina, check-up / cleaning / filling / toothache across two or three).
- ~25 patients (fake names, `+971 50 000 xxxx` style numbers), mixed WhatsApp-style / web / desk-only, tags (VIP, Insurance, Kids).
- Visits: ~40 across this week and next (sources sara-whatsapp / web / staff), 4 weeks of history (completed + 3 no-shows + cancellations).
- Conversations with transcripts for ~8 patients; 2 paused (needs staff): one insurance question, one complaint.
- Logins: `owner@goodshine.test` (owner) and `staff@goodshine.test` (staff); Anas's existing owner login also gets a Good Shine membership so the switcher shows both clinics.

## 8. Order of work

1. Migration 0007 + `booking.ts` + Sara changes + tests (Anas pastes 0006, 0007).
2. Tokens, style-lock update, shadcn pieces, new shell.
3. Calendar + booking dialog, then Today, Inbox (incl. web reply), Patients.
4. Settings.
5. Web chat white-label + staff replies.
6. Good Shine seed (after Anas's go) and end-to-end check.

Write the approved design to `docs/superpowers/specs/2026-11-01-front-desk-crm-design.md`, then the task plan via superpowers:writing-plans in `docs/superpowers/plans/`. Commit only when asked.

## Verification

- `npm test`: new `booking.test.ts` for the pure parts (union of dentist availability, time-off subtraction, `pickDentist` tie-break, service-dentist filter); existing `slots.test.ts` and the `sara.test.ts` cache-prefix test still pass. `npm run lint`, `npx tsc --noEmit`.
- After the seed, in the browser (ego lite) at 1366x768, 1440x900, 768x1024 and 375x812, light and dark: no page-level scroll on any dashboard route (`document.scrollingElement.scrollHeight <= innerHeight`), only inner panes scroll; sidebar collapses / becomes a sheet.
- End-to-end on Good Shine:
  1. Owner changes a price and Dr. Lina's Monday hours in Settings; web chat at `/chat/good-shine` quotes the new price and offers only her new times within 60 s.
  2. Patient books "whitening" on web chat → Sara assigns Dr. Lina → block appears in Calendar day view under her column (realtime).
  3. Staff books the same slot from the dialog → refused as taken. Staff adds a walk-in with a mobile number and books a check-up → patient record has `wa_id`, visit shows in the calendar, and the reminder job picks it up (check `jobs.test.ts` / cron logs; a live WhatsApp check only works on the Sample Smile instance).
  4. Ask Sara for Dr. Omar next Tuesday → she says he's away and offers other days.
  5. Web chat asks for a human → appears under Needs staff; staff takes over, replies; the reply shows in the web chat within ~4 s; hand back → Sara answers again.
  6. Staff login can't open Settings edit actions (read-only); owner can.
