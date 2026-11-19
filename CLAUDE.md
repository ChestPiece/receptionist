@AGENTS.md

# Clinic WhatsApp Bot

WhatsApp AI receptionist for UAE dental clinics (Dubai first), English + Arabic. Original plan: `~/.claude/plans/i-want-to-make-tender-wall.md`. Earlier roadmap ("revenue receptionist", R0-R8): `~/.claude/plans/check-up-the-whatsapp-ethereal-pearl.md`.
**Current roadmap (2026-10-25): white-label multi-clinic platform** with web chat widget, staff dashboard (front-desk CRM) and analytics, phases P0-P5: `~/.claude/plans/load-up-the-superwer-cozy-firefly.md`. Per-phase task plans live in `docs/superpowers/plans/`.

## Decisions
- WhatsApp via **UltraMsg** (owner's decision, no Meta). Unofficial, so the number can be banned: use a spare SIM, pace sends, no WhatsApp buttons. All provider code lives in `src/lib/whatsapp.ts`.
- Next.js route handlers (Vercel Hobby). Webhook: `POST /api/whatsapp?secret=WEBHOOK_SECRET`, returns 200 fast, work runs in `after()`.
- AI (2026-11-18): free Google Gemini everywhere, zero OpenAI calls. Text runs on `@openai/agents` with `OpenAIChatCompletionsModel` pointed at Gemini's OpenAI-compatible endpoint (`src/lib/llm.ts`, default `gemini-3.5-flash-lite`, Groq fallback when Gemini is rate limited, slow (8 s) or down; after one primary failure the fallback goes first for 60 s, so each agent step does not wait out the 8 s again. The reviewer has no fallback, so it never spends Groq's small free quota). Env: `GEMINI_API_KEY`, `GROQ_API_KEY`, `LLM_PROVIDER` (default `gemini`), `LLM_MODEL`, `LLM_FALLBACK_PROVIDER` (`groq`), `LLM_FALLBACK_MODEL`, `LLM_REVIEW_MODEL`, `LLM_TRANSCRIBE_MODEL`, `GEMINI_LIVE_MODEL`, `GEMINI_LIVE_VOICE`. WhatsApp voice notes are transcribed by Gemini (`transcribe` in `agent.ts`). `[timing]` logs carry `model=` and `fallback=`. Free tier: Google may use the data for training, so demo/fake data only; a paying clinic gets a paid key (env swap, no code change). The LLM never invents slots; it only calls booking tools. Vercel Chat SDK was evaluated and skipped: its WhatsApp adapter is Meta Cloud API only.
- Data: Supabase. Schema in `supabase/migrations/`, sample clinic in `supabase/seed.sql`; the owner runs SQL in the Supabase SQL editor. Many clinics per deployment (tenants, since P0). Synthetic/fake clinic data only, labeled sample. No real patient data until a UAE-region host is in place.
- Safety: no medical advice, emergency reply with the UAE emergency number, never confirm insurance coverage, human handoff, no PHI in logs.
- Persona "Sara", the clinic receptionist. She admits she is the clinic's virtual assistant if asked. Clinic topics only; off-topic questions get a one-line kind decline and a steer back to booking, never a handoff.
- No SDK input/output guardrails: each one is an extra model call per message. Scope rules live in the prompt; safety-critical checks are deterministic code.

## Rules
- The owner's phone number and all keys stay in `.env.local` only, never in tracked files.
- Commit only when asked. GitHub: `ChestPiece/receptionist` (private).
- Branches (2026-11-04): only two. `dev` is the working branch: all work and pushes go there. `master` is production: touch it only when the owner asks to release (merge `dev` into `master`). No other branches.
- Vercel deploys every push to `master` to production. Paste a new migration before pushing code that needs it.
- Ask before any Supabase write; the owner runs SQL in the SQL editor.
- Add Vercel env vars from bash (`printf '%s' "$V" | npx vercel env add NAME --environment production`), never piped from Windows PowerShell: it prepends a BOM (U+FEFF), which broke the Gemini key and `LLM_FALLBACK_PROVIDER` in prod on 2026-11-19.

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
- Reviewer (`src/lib/reviewer.ts`, `reviewModel()`: `gemini-3.5-flash` by default, its own free quota apart from chat; 15 s timeout) runs after the reply on risky turns. It gets the last 12 history items (`earlierTurns`), so a time backed by an earlier `find_slots` is not flagged. `ok: true` logs nothing; a timeout or error logs a `review_skipped` warn event on Activity.

## Official WhatsApp (Meta Cloud API, 2026-11-04, `0013_meta_whatsapp.sql`)
- Per clinic `clinics.wa_provider` = `ultramsg` (default, demos/testing) or `meta` (paying clinics). `toClinic` builds `clinic.wa` as a tagged `WaCreds`; the Meta token is `clinic_secrets.meta_token`, the number is `clinics.meta_phone_number_id`.
- `src/lib/whatsapp.ts` keeps chat ids as `9715…@c.us` app-wide; the Meta adapter strips/adds `@c.us`. `markRead` takes the message id (Meta marks by id). Voice notes: Meta gives a media id, `fetchMedia` downloads it with the token, only from Meta hosts (`metaMediaHost`).
- Webhook `/api/whatsapp/meta`: GET verify (`META_VERIFY_TOKEN`), POST checks `X-Hub-Signature-256` with `META_APP_SECRET` (one Meta app for all clinics), payload `phone_number_id` picks the clinic, always 200 once signed.
- Meta only delivers templates outside its 24 h window: reminders and follow-ups use `clinics.meta_templates` (`reminder`: params name, service, clinic, time; `followup`: name, clinic) when set, else free text (fails outside the window). Staff handoff alerts are still free text.
- Not yet: coexistence (Embedded Signup on the clinic's existing number) and staff echo webhooks pausing Sara.

## Web chat (P1, first cut)
- `/chat/[slug]` (shadcn + AI Elements, `useChat`) talks to `POST /api/chat`, which streams the same Sara agent (`streamSara`) through `createAiSdkUiMessageStreamResponse`. History lives server side in `conversations`, like WhatsApp; the client sends only its newest message.
- Visitor = anonymous id in localStorage, stored as `patients.web_visitor_id` (`wa_id` is null). Sara asks for a mobile number before a web booking or handoff; web handoff pauses the chat and alerts staff on WhatsApp (when `staff_whatsapp` is set) with a callback number. While paused, the visitor polls `GET /api/chat` every 4 s and sees staff replies.
- Tool results are structured (`find_slots`, `book`), so the chat draws tappable time buttons and a booking card.
- Quick-reply chips (`src/lib/chips.ts`): Sara ends each web reply with a hidden `[[chips: a | b]]` line, worded per step (service names, Earliest/Tomorrow/…, "Yes, book it | Change time", empty when asking for name/number). `chipsFor` in `chat.tsx` picks, in order: chips for the card a tool just drew (slots: "Other day"; booking: calendar/another/reschedule), then the marker, then fallback chips when the marker is missing entirely. Fixed replies (emergency, rate limit, errors) carry an empty marker, so they get no chips.
- Leads (2026-11-03): the `save_contact` tool writes the visitor's name and number to their patient row the moment they type them, before any booking (`cleanName` strips "its"/"my name is", `cleanPhone` stores a UAE mobile as `9715…` and keeps a foreign number as digits; only empty fields are filled). It logs a `contact` event on Activity. Handoff `callback_phone` is saved the same way. The prompt shows the phone on file so Sara does not ask twice.
- Composer: the AI Elements `PromptInputBody` wraps the textarea in `display: contents`, so the shadcn `has-[>textarea]:h-auto` never matches; `chat.tsx` forces `h-auto` on the input group so it grows (max 192 px).
- Messages typed while Sara is still replying are held (`queued` in `chat.tsx`) and sent as one message when she finishes, so none are lost and she answers them together.
- Chat history comes back after a reload (`GET /api/chat`). Not yet: embeddable `widget.js` + `allowed_origins` check, per-IP rate limit, reminders for web patients.
- UI components are vendored by the shadcn (`new-york`, Radix) and AI Elements CLIs in `src/components/{ui,ai-elements}` and skipped by ESLint.

## Starter kit (2026-11-04)
- `../agent-starter` (own git repo, local only so far) is a generic copy of the chat + voice agent for other projects: edit `src/agent/brand.ts` and `src/agent/config.ts`. It is a copy, not a dependency: this app does not import it, and fixes are ported by hand.

## Public demo (`/demo`, 2026-11-04)
- The landing's "Try Sara" CTAs open `/demo`: the real `Chat` (`embedded`, demo `starters`) on the left and a live "front desk view" (`src/app/demo/desk.tsx`, polls `GET /api/demo/desk` every 3 s) on the right; tabs on phones. Sandbox clinic slug `demo` (`DEMO_SLUG`, `src/lib/demo.ts`), created from `scripts/demo-clinic.json` with `scripts/new-clinic.ts`; no `staff_whatsapp`, no WhatsApp creds.
- The desk shows only the visitor's own lead, visits and events; everyone else's visits are anonymous "Booked" blocks (`deskView`). After a handoff the visitor can reply as the front desk and hand back (`POST /api/demo/reply`, demo clinic + own paused chat only).
- The 15-min cron (`runJobs`) runs `purgeDemo` (visitor rows older than 6 h, cascades) and `topUpDemo` (fake "Sample Patient" desk visits for days that have none, next 5 days).
- `replyText` (`sara.ts`): newer models put the reply in "commentary" messages and can end with an empty final answer; web and WhatsApp use the last assistant text of the run, so a reply is never lost.

## Voice call (web, Gemini Live since 2026-11-18)
- "Call Sara" in the web chat header. The server mints a one-use Gemini Live token (v1alpha) with the whole session locked inside (`liveConnectConstraints`: prompt, tools, voice, VAD), so the key, prompt and tool definitions never reach the browser. The browser connects to Google over a WebSocket with `@google/genai` (loaded on demand, preloaded 1.5 s after the chat opens): mic as 16 kHz PCM16 through an AudioWorklet, 24 kHz playback through an echo-safe path so Sara does not interrupt herself. Session in `src/lib/voice.ts`, client hook in `src/app/chat/[slug]/call.tsx`, audio helpers in `src/lib/liveAudio.ts`.
- Model `GEMINI_LIVE_MODEL` (default `gemini-3.8-live`), voice `GEMINI_LIVE_VOICE` (default `Sulafat`). Server VAD (2026-11-19): start sensitivity high with 20 ms prefix (low + 200 ms dropped short "yes"/digits, so Sara went silent or said she missed it), end high, 700 ms silence (callers pause inside phone numbers). Proactive audio is always on in `gemini-3.8-live`, so the config sets no `proactivity`; affective dialog is refused on v1alpha tokens.
- Reads (`find_slots`, `my_appointments`) are NON_BLOCKING and answered `WHEN_IDLE`, so Sara says "Let me check Saturday" while slots load; writes are BLOCKING, so she never says "booked" before the DB does. `end_call` hangs up after her goodbye audio. The prompt carries the earliest free times per service (`quickOptions`) for an instant "when is the earliest".
- Routes (same trust as `/api/chat`: clinic by slug, patient by `visitorId`; helpers in `src/lib/visitor.ts`):
  - `POST /api/voice`: mints the token with the voice prompt (`buildInstructions(..., "voice")`), the last chat turns (`spokenHistory`) and the quick options. Refuses a paused chat (409) and over-limit visitors (429 `busy`: `RATE_MAX` messages, 3 calls per hour from `agent_events` kind `call`, `call-ip` 6/h, `call-clinic` 60/h, `call-all` 100/day for the shared free quota). A Google 429 at mint also returns `busy`. `{ resume: handle }` reconnects a live call after a drop (Google resets Live connections about every 10 min): no new call counted, `call-resume` 5/10 min, and the new token ends when the original call's 8 min end (`inCall` returns the call start).
  - `POST /api/voice/tool`: runs one tool via `runTool` (channel `voice`). Voice tools = `voiceTools`: no `save_contact`/`book_many`; `book` needs `read_back_confirmed: true` (else `READ_BACK`) and a UAE mobile unless `foreign_number_confirmed` (else `NOT_UAE`). A tool slower than 8 s answers with a line telling Sara to apologise and offer a callback; for a write (it may still save) she checks `my_appointments` before offering to retry.
  - `POST /api/voice/turn`: saves each finished turn to `messages` (channel `voice`, inbox tag "Call") and Sara's history. A caller turn gets the emergency check; on a hit the browser flushes Sara's audio and makes her say the fixed reply.
  - `POST /api/voice/end`: the browser reports the call's numbers on hang up (keepalive): one `agent_events` row kind `call_metrics` with `connectMs`, `callMs`, `firstAudioMs[]`, `toolMs[]`, `endReason`, `resumes`, `nudges`.
- Never stuck: resume on `goAway` or an unexpected close (up to 3 times, else "The call dropped. You can keep typing here."); a silence watchdog nudges Sara once per caller turn when she stays quiet 4 s after the caller's last words with no tool running (`shouldNudge`, judged on time only: a turn Google never closes is the stuck case), sent as `sendRealtimeInput` text because `sendClientContent` with `turnComplete` interrupts her; the mic goes through a native 7 kHz low-pass before the 16 kHz worklet; the composer stays open during a call, and a typed name or number goes into the call (`call.say`).
- Caps: 8 min per call (the token expires just after), hang up after 45 s without caller speech, after 30 s in a hidden tab, and on page hide. Connect timeout 15 s.
- Latency targets (check `call_metrics`): caller stops to Sara's first audio p50 1.0 s / p90 1.8 s; click to greeting 2.5 s; tool round trip p50 400 ms. Set the Vercel Function Region to the one nearest the Supabase project (Next 16.4 deprecated `preferredRegion`).
- The chat footer says "Calls use Google AI. Please don't share medical details." during a call.
- Needs `0010_voice.sql` (allows `'voice'` in the `messages` and `usage_events` channel checks). Without it, voice transcripts fail to log; the call still works.
- `scripts/live-spike.ts` (untracked) checks a session config against a real v1alpha token.

## Review hardening (2026-11-04, `0011_review.sql`)
- Rate limits use the `hit(key, max, window_s)` RPC (`allow()` in `src/lib/db.ts`, atomic via advisory lock, table `rate_hits`). Keys: `chat-ip` 60/10 min, `chat-v` per visitor `RATE_MAX`/10 min, `call-ip` 6/h, `call-clinic` 60/h, `call-all` 100/day, `call-resume:<patient>` 5/10 min, `call-end:<patient>` 5/10 min, `voice:<patient>` 150 tool+turn posts/10 min, `handoff:<clinic>` 20 staff alerts/h, `emerg:<clinic>:<from>` 3 emergency replies/10 min while flood-limited. `allow()` fails open (logs `[rate]`) until 0011 is pasted.
- `unforge()` (`safety.ts`) strips a leading `[Front desk]` / `[voice note]` from patient text on every channel; only assistant-role `[Front desk]` turns are staff.
- `safeNext()` guards the login and magic-link redirects. 0011 also ties staff message/event inserts to a patient of the same clinic and revokes default grants on the early tables.
- Skipped on purpose: webhook/cron secrets stay in the query string (UltraMsg has no header option), RLS policy perf rewrites (no scale yet).

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
