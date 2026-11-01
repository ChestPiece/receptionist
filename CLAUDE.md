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
npm run dev
npm test        # vitest
npm run lint
```

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
- Code: `src/lib/clinics.ts` (loaders, 5-min cache), `src/lib/sara.ts` (agent brain shared by all channels: tools, prompt, `runSara`), `src/lib/agent.ts` (WhatsApp channel handler).
- Every patient/assistant/outbound turn also goes to `messages` (readable transcript for the inbox); token use per run goes to `usage_events`.

## Web chat (P1, first cut)
- `/chat/[slug]` (shadcn + AI Elements, `useChat`) talks to `POST /api/chat`, which streams the same Sara agent (`streamSara`) through `createAiSdkUiMessageStreamResponse`. History lives server side in `conversations`, like WhatsApp; the client sends only its newest message.
- Visitor = anonymous id in localStorage, stored as `patients.web_visitor_id` (`wa_id` is null). Sara asks for a mobile number before a web booking or handoff; web handoff alerts staff on WhatsApp with a callback number and does not pause the chat.
- Tool results are structured (`find_slots`, `book`), so the chat draws tappable time buttons and a booking card.
- Chat history comes back after a reload (`GET /api/chat`). Not yet: embeddable `widget.js` + `allowed_origins` check, per-IP rate limit, reminders for web patients.
- UI components are vendored by the shadcn (`new-york`, Radix) and AI Elements CLIs in `src/components/{ui,ai-elements}` and skipped by ESLint.

## Design (clean SaaS, 2026-10-25, replaces "The Ledger")
- **Brand guidelines are locked in `.tastemaker/style-lock.md`. Read it before any UI work and follow it; change it only when Anas asks.**
- Neutral stone palette + sage `--primary`, blue `--web`, red `--alert` (tokens in `src/app/globals.css`). Geist (UI + headings), Geist Mono (sparing), Readex Pro for Arabic. No paper texture. `.slip` now means a plain card; `.torn-top` is a no-op kept for old dashboard markup.
- Logo: the `Receptionist Agent.` wordmark (Newsreader, red full stop). Always use `<Logo />` from `src/components/logo.tsx`; Newsreader is loaded only for it (`.wordmark` utility).
- Landing (2026-10-26): hero with EN/عربي demo replay, pinned "night shift" story (`NightShift` in `src/components/landing.tsx`: chat books a visit, Flip flies it into the calendar), hairline features, safety list. GSAP only via `src/lib/gsap.ts`.
- Landing night redesign (2026-10-31, spec `docs/superpowers/specs/2026-10-30-landing-redesign-design.md`): night hero (`.night` token scope, PatternWaves dots in `src/components/pattern-waves.tsx` loaded lazily through `NightWaves`, CSS glow `Horizon`), lit white hero chat (`.screen` scope) in both themes, pinned night film (`NightFilm`, `FrameSequence`, frames in `public/frames/film/`, source in `motion/night-film/`; replaced the old `Bridge` on 2026-11-01), night close band and footer. Night stays night in both themes; rules in the style-lock amendment.
- Chat: left collapsible sidebar (Back to site, New chat, clinic hours/services/location in `<details>`), left sheet on phones; starter questions sit under the greeting in the empty state.
- Login: split layout, form left, static "while you were closed" sample right (desktop only).
- Dashboard: page titles `text-3xl font-semibold`, no GSAP, no uppercase labels. Responsive grids need `grid-cols-1` as the base so wide children (calendar) cannot push past the phone width.
- Shared pieces in `src/components/ledger.tsx`: `WeekCalendar`, `Tally`, `Typed`, `Line`, `ThemeToggle`.

## Staff dashboard (P2)
- `0005_dashboard.sql` (applied 2026-10-25): `memberships`, `platform_admins`, `is_member()`, RLS read/update policies, staff-only message inserts, Realtime on messages/conversations/appointments. Its header says how to add a staff user.
- Auth: `@supabase/ssr`, `src/proxy.ts` guards `/dashboard`, `/login` (password or magic link, no sign-up). Needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` and Vercel.
- Pages read with the user's client (RLS). Helpers in `src/lib/dashboard.ts`, server actions in `src/app/dashboard/actions.ts`. Clinic switcher (cookie) when a user has several clinics.
  - Today: tallies (booked by Sara this week, after hours, need staff), first waiting chat, this week's book.
  - Inbox: one row per chat from the `inbox_list` RPC (`0006_speed.sql`, security invoker), the picked thread loads alongside; Needs staff filter (`stillPaused`), Take over / Hand back, staff reply on WhatsApp (sent with the clinic's creds via the service role, logged as role `staff`, appended to the agent history). Website chats are read-only.
  - Calendar: Saturday-start week, blocks by channel (red = chat waiting for staff), mark came in / no-show / cancel.
  - Patients: search + tags, profile with details, staff notes, visits, transcript.
- Every dashboard route has a `loading.tsx` skeleton; the sidebar is static and the clinic switcher and Needs staff badge stream in behind Suspense.
- `Live` re-renders pages on Realtime changes to this clinic's messages and appointments, debounced to 1 s (no conversations subscription: a pause flip by another staff member shows on the next event). Not yet: manual booking or moving visits from the dashboard, live replies into web chats.

## How `handleMessage` works (`src/lib/agent.ts`)
1. Dedupe insert (`processed_messages`, with `patient_wa`) and clinic load (cached 5 min) in parallel.
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

Handoff pauses a chat only when the clinic's `staff_whatsapp` is set; without it the bot keeps helping and gives the clinic phone.

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
  - Only one chair per clinic is supported.
