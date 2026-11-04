@AGENTS.md

# Clinic WhatsApp Bot

WhatsApp AI receptionist for UAE dental clinics (Dubai first), English + Arabic. Original plan: `~/.claude/plans/i-want-to-make-tender-wall.md`. Earlier roadmap ("revenue receptionist", R0-R8): `~/.claude/plans/check-up-the-whatsapp-ethereal-pearl.md`.
**Current roadmap (2026-10-25): white-label multi-clinic platform** with web chat widget, staff dashboard (front-desk CRM) and analytics, phases P0-P5: `~/.claude/plans/load-up-the-superwer-cozy-firefly.md`. Per-phase task plans live in `docs/superpowers/plans/`.

## Decisions
- WhatsApp via **UltraMsg** (owner's decision, no Meta). Unofficial, so the number can be banned: use a spare SIM, pace sends, no WhatsApp buttons. All provider code lives in `src/lib/whatsapp.ts`.
- Next.js route handlers (Vercel Hobby). Webhook: `POST /api/whatsapp?secret=WEBHOOK_SECRET`, returns 200 fast, work runs in `after()`.
- AI: `@openai/agents` (SDK default model, override with `OPENAI_DEFAULT_MODEL`). The LLM never invents slots; it only calls booking tools. Vercel Chat SDK was evaluated and skipped: its WhatsApp adapter is Meta Cloud API only.
- Data: Supabase. Schema in `supabase/migrations/`, sample clinic in `supabase/seed.sql`; the owner runs SQL in the Supabase SQL editor. Many clinics per deployment (tenants, since P0). Synthetic/fake clinic data only, labeled sample. No real patient data until a UAE-region host is in place.
- Safety: no medical advice, emergency reply with the UAE emergency number, never confirm insurance coverage, human handoff, no PHI in logs.
- Persona "Sara", the clinic receptionist. She admits she is the clinic's virtual assistant if asked. Clinic topics only; off-topic questions get a one-line kind decline and a steer back to booking, never a handoff.
- No SDK input/output guardrails: each one is an extra model call per message. Scope rules live in the prompt; safety-critical checks are deterministic code.

## Rules
- The owner's phone number and all keys stay in `.env.local` only, never in tracked files.
- Commit only when asked. GitHub: `ChestPiece/clinic-whatsapp-bot` (private), branch `master`.
- Vercel deploys every push to `master` to production. Paste a new migration before pushing code that needs it.
- Ask before any Supabase write; the owner runs SQL in the SQL editor.

## Commands
```bash
bun run dev
bun run test    # vitest
bun run lint
```
Package manager is **bun** (`bun.lock` only, no `package-lock.json`). Use `bun install` / `bunx`, not npm.

## Production
- Vercel project `chestpieces-projects/clinic-whatsapp-bot`. Public URL: `https://sara-clinic-bot.vercel.app`, added as a project domain through the Vercel API. The default `*-chestpieces-projects.vercel.app` URLs sit behind Vercel deployment protection, which redirects with a 302, so UltraMsg cannot reach them.
- The UltraMsg webhook points at `https://sara-clinic-bot.vercel.app/api/whatsapp?secret=…`. The GitHub repo is connected, so a push to `master` deploys (`npx vercel deploy --prod` also works). Env vars live in Vercel production and in `.env.local`.
- Local testing takes webhook traffic away from prod. Point UltraMsg back to prod when done.

## Local testing
- Dev server plus a cloudflared quick tunnel. The tunnel URL changes on every restart: update the UltraMsg webhook (`POST /instance/settings`, `webhook_url`) each time.
- UltraMsg settings: only "Webhook on Received" on, `sendDelay=1`, `sendDelayMax=3`.
- To reset a test chat, delete its `conversations` row in Supabase.
- The webhook secret travels in the query string (UltraMsg has no signature header), so it shows in tunnel and Vercel request logs. Rotate it if those logs are ever shared.

## Tenants (P0)
- Each clinic is a `clinics` row: config (`slug`, `persona`, `staff_whatsapp`, `ultramsg_instance_id` as digits only, `active`). Its UltraMsg token and webhook secret live in `clinic_secrets` (service role only, never read by the dashboard).
- New clinic: insert a `clinics` row and a `clinic_secrets` row, then point that UltraMsg instance's webhook at `/api/whatsapp?secret=<its webhook_secret>`. One webhook URL serves every clinic: the payload `instanceId` picks the clinic.
- Env vars `CLINIC_ID`, `ULTRAMSG_INSTANCE_ID`, `ULTRAMSG_TOKEN`, `STAFF_WHATSAPP` and `WEBHOOK_SECRET` are no longer read. `ALLOWED_SENDERS` is still a global env allowlist.
- Code: `src/lib/clinics.ts` (loaders, 60 s cache), `src/lib/sara.ts` (agent brain shared by all channels: tools, prompt, `runSara`), `src/lib/agent.ts` (WhatsApp channel handler).
- Every patient/assistant/outbound turn also goes to `messages` (readable transcript for the inbox); token use per run goes to `usage_events`.
- Sara's context carries an explicit `channel` (`"whatsapp" | "web"`); prompt rules and tools branch on it, never on `waId` being null. The voice phase adds `"voice"` (a caller has a number but no WhatsApp id).
- Reviewer (`src/lib/reviewer.ts`, gpt-5-mini, reasoning effort `low`, 15 s timeout) runs after the reply on risky turns. It gets the last 12 history items (`earlierTurns`), so a time backed by an earlier `find_slots` is not flagged. `ok: true` logs nothing; a timeout or error logs a `review_skipped` warn event on Activity.

## Web chat (P1, first cut)
- `/chat/[slug]` (shadcn + AI Elements, `useChat`) talks to `POST /api/chat`, which streams the same Sara agent (`streamSara`) through `createAiSdkUiMessageStreamResponse`. History lives server side in `conversations`, like WhatsApp; the client sends only its newest message.
- Visitor = anonymous id in localStorage, stored as `patients.web_visitor_id` (`wa_id` is null). Sara asks for a mobile number before a web booking or handoff; web handoff pauses the chat and alerts staff on WhatsApp (when `staff_whatsapp` is set) with a callback number. While paused, the visitor polls `GET /api/chat` every 4 s and sees staff replies.
- Tool results are structured (`find_slots`, `book`), so the chat draws tappable time buttons and a booking card.
- Quick-reply chips (`src/lib/chips.ts`): Sara ends each web reply with a hidden `[[chips: a | b]]` line, worded per step (service names, Earliest/Tomorrow/…, "Yes, book it | Change time", empty when asking for name/number). `chipsFor` in `chat.tsx` picks, in order: chips for the card a tool just drew (slots: "Other day"; booking: calendar/another/reschedule), then the marker, then fallback chips when the marker is missing entirely. Fixed replies (emergency, rate limit, errors) carry an empty marker, so they get no chips.
- Leads (2026-11-03): the `save_contact` tool writes the visitor's name and number to their patient row the moment they type them, before any booking (`cleanName` strips "its"/"my name is", `cleanPhone` stores a UAE mobile as `9715…` and keeps a foreign number as digits; only empty fields are filled). It logs a `contact` event on Activity. Handoff `callback_phone` is saved the same way. The prompt shows the phone on file so Sara does not ask twice.
- Composer: the AI Elements `PromptInputBody` wraps the textarea in `display: contents`, so the shadcn `has-[>textarea]:h-auto` never matches; `chat.tsx` forces `h-auto` on the input group so it grows (max 192 px).
- Chat history comes back after a reload (`GET /api/chat`). Not yet: embeddable `widget.js` + `allowed_origins` check, per-IP rate limit, reminders for web patients.
- UI components are vendored by the shadcn (`new-york`, Radix) and AI Elements CLIs in `src/components/{ui,ai-elements}` and skipped by ESLint.

## Voice call (web, 2026-11-04)
- "Call Sara" in the web chat header. The browser holds a WebRTC call to OpenAI Realtime (`OPENAI_REALTIME_MODEL`, default `gpt-realtime-2.1-mini`; voice `OPENAI_REALTIME_VOICE`, default `marin`; reasoning `low`, `semantic_vad`). Client: `src/app/chat/[slug]/call.tsx`, raw data-channel events, no SDK.
- Routes (same trust as `/api/chat`: clinic by slug, patient by `visitorId`; helpers in `src/lib/visitor.ts`):
  - `POST /api/voice`: creates the call (`/v1/realtime/calls`) with the voice prompt (`buildInstructions(..., "voice")`), the last chat turns (`spokenHistory`) and `toolSchemas()`. Refuses a paused chat (409) and over-limit visitors (429: `RATE_MAX` messages, or 3 calls per hour counted from `agent_events` kind `call`). The key and prompt never reach the browser.
  - `POST /api/voice/tool`: runs one tool via `runTool` (channel `voice`). Voice tools = `voiceTools`: no `save_contact`/`book_many`; `book` needs `read_back_confirmed: true`, else it returns `READ_BACK`.
  - `POST /api/voice/turn`: saves each finished turn to `messages` (channel `voice`, inbox tag "Call") and Sara's history, so typed chat after a call knows what was said. A caller turn gets the emergency check; on a hit the browser cancels Sara's reply and makes her say the fixed one.
- Caps: 8 min per call, hang up after 45 s without caller speech, hang up on page hide.
- Needs `0010_voice.sql` (allows `'voice'` in the `messages` and `usage_events` channel checks). Without it, voice transcripts fail to log; the call still works.
- `spikes/voice/` (untracked) is the A/B test bench on 127.0.0.1:8787.

## Design (clean SaaS, 2026-10-25, replaces "The Ledger")
- **Brand guidelines are locked in `.tastemaker/style-lock.md`. Read it before any UI work and follow it; change it only when Anas asks.**
- Neutral stone palette + sage `--primary`, blue `--web`, red `--alert` (tokens in `src/app/globals.css`). Geist (UI + headings), Geist Mono (sparing), Readex Pro for Arabic. No paper texture. `.slip` now means a plain card; `.torn-top` is a no-op kept for old dashboard markup.
- Logo: the `Receptionist Agent.` wordmark (Newsreader, red full stop). Always use `<Logo />` from `src/components/logo.tsx`; Newsreader is loaded only for it (`.wordmark` utility).
- Landing (2026-10-26): hero with EN/عربي demo replay, pinned "night shift" story (`NightShift` in `src/components/landing.tsx`: chat books a visit, Flip flies it into the calendar), hairline features, safety list. GSAP only via `src/lib/gsap.ts`.
- Landing desk log (2026-11-03, replaces the night hero and night film; rules in the style-lock amendment 2026-11-03): cream hero with the live chat replay (`src/components/landing-hero.tsx`), then `DeskLog` (sticky clock 18:00 to 09:00, five hour entries with real product pieces, sky day/dusk/night/dawn), `Setup`, safety list, `WordReveal` tagline, FAQ (+ FAQPage JSON-LD), night close band and footer. Lenis smooth scroll via `SmoothScroll` (landing only). Main CTA "Book a 15 min demo call" reads `NEXT_PUBLIC_DEMO_CALL_URL` (falls back to the demo chat). `/privacy`, `/terms` and the 404 share `src/components/plain-page.tsx`.
- Chat: left collapsible sidebar (Back to site, New chat, clinic hours/services/location in `<details>`), left sheet on phones; starter questions sit under the greeting in the empty state.
- Login: split layout, form left, static "while you were closed" sample right (desktop only).
- Dashboard: page titles `text-3xl font-semibold`, no GSAP, no uppercase labels. Responsive grids need `grid-cols-1` as the base so wide children (calendar) cannot push past the phone width.
- Shared pieces in `src/components/ledger.tsx`: `WeekCalendar`, `Tally`, `Typed`, `Line`, `ThemeToggle`.

## Staff dashboard (P2)
- `0005_dashboard.sql` (applied 2026-10-25): `memberships`, `platform_admins`, `is_member()`, RLS read/update policies, staff-only message inserts, Realtime on messages/conversations/appointments. Its header says how to add a staff user.
- Auth: `@supabase/ssr`, `src/proxy.ts` guards `/dashboard`, `/login` (password or magic link, no sign-up). Needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` and Vercel.
- Pages read with the user's client (RLS). Helpers in `src/lib/dashboard.ts`, server actions in `src/app/dashboard/actions.ts`. `desk()` calls `await connection()` first: with `cacheComponents`, the Supabase session check reads the clock, which Next refuses during prerender (`blocking-prerender-current-time`). Clinic switcher (cookie) when a user has several clinics.
  - Today: tallies (booked by Sara this week, after hours, need staff), first waiting chat, this week's book.
  - Inbox: one row per chat from the `inbox_list` RPC (`0006_speed.sql`, security invoker), the picked thread loads alongside; Needs staff filter (`stillPaused`), Take over / Hand back, staff reply on WhatsApp (sent with the clinic's creds via the service role, logged as role `staff`, appended to the agent history). Staff can also reply in web chats; the visitor sees it within 4 s.
  - Calendar: Saturday-start. Day view has a column per dentist, Week view a column per day. Blocks by channel (red = chat waiting for staff). The desk can book, move and cancel visits and mark came in / no-show. Patients can be added from the desk.
  - Settings (tabs: clinic, services, dentists, time off, chat widget): the owner edits, staff see it read only. Every save calls `forgetClinic` so the 60 s clinic cache drops at once.
  - Patients: search + tags, profile with details, staff notes, visits, transcript.
- Every dashboard route has a `loading.tsx` skeleton; the sidebar is static and the clinic switcher and Needs staff badge stream in behind Suspense.
- `Live` re-renders pages on Realtime changes to this clinic's messages and appointments, debounced to 1 s (no conversations subscription: a pause flip by another staff member shows on the next event).

## How `handleMessage` works (`src/lib/agent.ts`)
1. Dedupe insert (`processed_messages`, with `patient_wa`) and clinic load (cached 60 s) in parallel.
2. Rate-limit count and patient upsert run in parallel. More than 20 messages from one sender in 10 min gets one "slow down" reply, then silence (emergencies still get the fixed reply). Then `markRead` (blue ticks; UltraMsg has no typing indicator).
3. Input caps: text cut to 1,500 chars; voice notes only from public https URLs and under 3 MB.
4. Emergency (`safety.ts`, deterministic EN/AR regex): fixed 998 reply, appended to history, model does not run. Works even when the chat is paused.
5. Debounce 1.5 s, in the DB so it works across Vercel instances: each piece's text goes in `processed_messages.body`; after the wait, the newest-piece check, the unanswered pieces and the history load run in parallel. Only the newest piece (`seq`) runs the model (a history load error surfaces only there) and answers every unanswered piece from the last 5 min. If a newer piece arrives while the model runs, the older reply is dropped, unless the older run wrote data (`wroteData`: book, cancel, reschedule, handoff).
6. Paused chat (`stillPaused`): staff own it; the patient's messages are still saved to history; the pause lapses after 30 min.
7. Run the agent (the prompt's static rules and clinic info come first, today's date and the patient line last, so OpenAI can cache the prefix). `logUsage` runs alongside the newest-piece recheck. Send `tidy(reply)` (no en/em dashes) first; after the send, log the transcript (`[log]` on failure, no second reply), log `[timing]`, then append this run's turns to the latest saved history (`mergeHistory`) and keep the last 10 turns.

## Outbound jobs (`src/lib/jobs.ts`, `POST /api/cron?secret=CRON_SECRET`)
- pg_cron + pg_net call the cron route every 15 min (job `clinic-jobs`, live since 2026-10-22). The schedule SQL is at the bottom of `0003_revenue.sql`. Check runs in the Vercel logs (`[cron]` lines) or in `cron.job_run_details`.
- Reminders: 24h and 2h before a booked visit, in English and Arabic, with "Reply 1 to confirm or 2 to change it". A visit gets no reminder for a window it was booked inside. Each reminder is claimed (`reminded_*_at`) before it is sent, so it goes out at most once. The reminder text is appended to the chat history, so the agent understands the "1" or "2" reply (`confirm_visit` tool; a reschedule clears `confirmed_at`).
- Follow-up: one nudge when a patient's last message is 3 to 20 h old and they have nothing booked, are not opted out and the chat is not paused. Only one per quiet inquiry (`conversations.followup_sent_at`). The nudge names the last service mentioned in the chat and the next free time. A booking within 48 h of the nudge gets `source='followup'`.
- STOP (or توقف) as a whole message sets `patients.opted_out`: no follow-up, recall or waitlist messages, but reminders still go out. "الغاء" is not a stop word, because it means "cancel".
- Outbound limits: no messages between 21:00 and 09:00 clinic time, and at most 20 per run.

Booking limits: at most 3 upcoming visits per patient, and dates up to 60 days ahead. A stored patient name is never overwritten by a later booking.
Errors: the SORRY reply promises a staff reply only when the clinic's `staff_whatsapp` is set; otherwise it gives the clinic phone.

Handoff always pauses the chat, on both channels. The WhatsApp alert to staff goes out only when the clinic's `staff_whatsapp` is set.
Booking is per dentist (`0007_dentists.sql`, applied 2026-11-01: `services`, `dentists`, `dentist_services`, `time_off`). The shared engine `src/lib/booking.ts` serves Sara, the dashboard and `jobs.ts`.

## Status
- Phase 0: webhook + `parseWebhook` tests done.
- Phase 1 done and tested live (book, cancel) on 2026-10-22.
- Phase 1.5 (natural tone + speed) done and stress-tested live on 2026-10-22: off-topic declines, no dashes, booking with "best one" choice all good. Fixed after that test: double emergency reply, and two replies to a split message.
- Break-test and hardening on 2026-10-22 (`0002_hardening.sql`): rate limit, input caps, voice URL guard, booking caps, wider EN/AR/Arabizi emergency regex without the "accident last year" false alarm, DB debounce for Vercel, history merge, paused-chat history, honest error reply.
- 2026-10-22: `0002_hardening.sql` applied, replays re-verified, deployed to Vercel (R0, R1).
- 2026-10-22: R2 reminders + confirm and R3 follow-up + STOP are live (`0003_revenue.sql` applied, cron scheduled).
- 2026-10-25: P0 multi-tenant foundation done (`0004_tenants.sql` applied with its backfill block, deployed in 7d410b3).
- 2026-10-25: web chat first cut coded (`/chat/sample-smile`). 0004 now also adds `patients.web_visitor_id` and `phone`.
- 2026-10-25: landing page and web chat redesigned ("Stone & Sage": Manrope + Readex Pro, stone background with sage/sand washes, full-screen chat with a clinic info sidebar). Tokens and rules in `.tastemaker/style-lock.md`. Deployed in 7d410b3.
- 2026-10-25: Ledger design on the whole app; P2 dashboard coded (not committed or deployed yet).
- 2026-11-01: front-desk CRM built on branch `dev` (spec `docs/superpowers/specs/2026-11-01-front-desk-crm-design.md`): per-dentist booking, desk booking/moving/cancelling, web-chat replies, Today/Inbox/Patients redesign, owner Settings. Test clinic Good Shine Dental: `scripts/seed-good-shine.ts`, see `docs/testing.md`; seeded on the live DB on 2026-11-01 (owner@goodshine.test / staff@goodshine.test, passwords in `.env.local`). Final review findings fixed in a8256a5.
- Sara gaps found on 2026-11-01 (not built yet): a web visitor who gives a phone number is not linked to their WhatsApp/desk patient row, so they can't manage those visits; no "earliest with anyone over the next weeks" search (`find_slots` takes at most 3 dates) and time off is not in the prompt; staff replies are stored in Sara's history as plain assistant turns (not marked as staff); reminders and follow-ups don't name the dentist, and the follow-up service guess is English only; no family-member or multi-visit booking, no waitlist (R4).
- **Demo freeze (2026-10-22):** the owner judged the current bot enough to demo to leads and gather feedback. R4 onward is on hold until lead feedback comes in.
- On hold:
  - R4 waitlist + recall (`0003` already has the recall columns and `appointments.source`).
  - R5 intake + insurance docs.
  - R6 staff inbox + Sunday owner report.
  - R7 evals. They must include the stress transcripts: off-topic, split messages, "hello?", emergency then "just joking".
  - R8 pitch kit.
- Demo limits to know:
  - The number is UltraMsg on a test SIM, and `ALLOWED_SENDERS` limits who gets answers.
  - Staff and owner alerts go to the test number.
  - Images get a "can't view" reply.
