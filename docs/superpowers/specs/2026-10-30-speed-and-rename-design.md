# Speed pass + rename to "Receptionist Agent"

Date: 2026-10-30. Status: draft, waiting for Anas's approval.

## Why

Anas says the whole app feels slow: WhatsApp replies, web chat, dashboard, and `bun run dev`. He tests locally for now. He also wants the product name changed from "Front Desk" to "Receptionist Agent".

## What was measured (2026-10-30)

- Supabase project `receptionist_chatbot` is in Seoul (ap-northeast-2). Production functions run in Washington (`X-Vercel-Id: bom1::iad1`).
- Production `GET /api/chat` (2 DB queries): 5.0 s cold, 1.0 to 1.4 s warm.
- From Anas's machine: about 100 ms per Supabase request after the connection is open, 400 to 850 ms to OpenAI, 350 to 950 ms to UltraMsg. Local landing page TTFB in `next dev`: 2.6 s.
- The database itself is not the problem: every app query runs in under 6 ms, the biggest table has 64 rows.
- Gzipped JS on production: `/chat/sample-smile` 857 KB, `/` 303 KB, `/login` 257 KB.
- Supabase advisors: `memberships` policy re-evaluates `auth.uid()` per row; `messages_clinic_id_created_at_idx` and `appointments_clinic_id_starts_at_idx` were never used.

Conclusion: the app is slow because it waits on the network many times in a row (about 100 ms locally, about 200 ms in production per query), and because the web chat ships very heavy JS. Fewer, parallel round trips help both local and production.

## Goals

1. WhatsApp: cut the time from the patient's message to the reply by removing sequential DB waits and making the prompt cacheable.
2. Web chat: the page shows the chat at once (no blank screen) and ships far less JS.
3. Dashboard: a click shows a skeleton at once; pages need fewer sequential queries; live updates stop reloading everything.
4. `next dev` feels faster (smaller module graph, fewer heavy client deps).
5. Product name "Receptionist Agent" everywhere a user or reader sees the brand.

## Non-goals

- No change to bot behavior, safety rules, booking rules, persona "Sara", or the reply text.
- No new features. No redesign: `.tastemaker/style-lock.md` stays the rule, only the name changes.
- No database move to another region in this pass (see Open item 1).
- No rename of the GitHub repo, Vercel project, domain `sara-clinic-bot.vercel.app`, or the local folder (Anas chose "brand only"). The UltraMsg webhook and the pg_cron URL stay as they are.

## Anti-goals (a failure even if it is faster)

- Any change in what Sara says, or a lost or doubled reply (the debounce and `wroteData` rules must keep working).
- A patient message missing from `messages` or from the agent history.
- Breaking RLS isolation between clinics (`supabase/checks/0005_isolation.sql` must still pass).

## Constraints

- Next.js 16.4 with `cacheComponents` and `partialPrefetching`. Read `node_modules/next/dist/docs/` before changing rendering (`instant`, Suspense, `loading.tsx`).
- Anas pastes every SQL migration himself in the Supabase SQL editor. No writes through the MCP.
- Commit only when Anas asks. Vercel deploys on every push to `master`, so a migration must be applied before code that needs it is pushed.
- UI components come from shadcn / AI Elements only.

## The work, in order of impact

### 1. WhatsApp path (`src/lib/agent.ts`, `src/lib/sara.ts`, `src/lib/db.ts`)

- Run independent steps in parallel instead of one after another:
  - the dedupe insert first, then the rate-limit count and the patient upsert together;
  - after the model run: `logUsage` does not block the reply.
- Send the reply first. After the send, run the transcript log, the history reload and the history upsert. Keep `mergeHistory`, so a parallel run's turns still survive.
- Keep the 1.5 s debounce (it prevents two replies to a split message). The builder may lower it only with a test that proves split messages still get one reply.
- Make the prompt cacheable: move today's date, the local time and the patient line from the top of `instructions` to the very end, after the clinic info. Static rules and clinic info form a stable prefix.
- `book` tool: run the reads that do not depend on each other in parallel (upcoming visits, conversation follow-up time, slot check). Name and phone updates go in one update call.

### 2. Web chat (`src/app/chat/[slug]`, `src/components/ai-elements/message.tsx`)

- Remove the Streamdown plugins `mermaid`, `math`, `code` and `cjk` from the chat's message renderer. Sara writes plain text with bold only. Remove packages that become unused.
- Render the chat right away. Load the history in the background and put it in when it arrives, without blocking the input. Only the history call is deferred, not the greeting.
- `generateMetadata` and the page share one clinic lookup per request (React `cache`).

### 3. Dashboard (`src/app/dashboard/**`, `src/lib/dashboard.ts`)

- Remove the blocking: follow `02-guides/authentication-with-cache-components.md`. Add `loading.tsx` (shadcn skeletons) for the dashboard routes and Suspense around the data, so navigation shows a shell at once. Remove `instant = false` if the guide's pattern allows it.
- Fewer sequential queries per page:
  - Inbox: one query (a view or RPC) for "latest message per patient, with the name and pause state", in place of 500 messages + patients + conversations. Thread loads in parallel with it when `p` is set.
  - Today: the first waiting thread loads in parallel with the week where possible.
  - Layout "needs staff" count: one cheap count query, run in parallel with the page.
- `Live` (`shell.tsx`): filter the conversations subscription to this clinic (add `clinic_id` to `conversations` or subscribe through `messages` only), and debounce the refresh to about 1 s.
- `WeekCalendar`: the drop-in animation runs on the first render only, not on every refresh.

### 4. Database (one new migration, `0006_speed.sql`, pasted by Anas)

- Indexes that match the real queries:
  - `messages (clinic_id, id desc)` and `messages (patient_id, id desc)`. Drop `messages_clinic_id_created_at_idx`, which is never used.
  - `appointments (clinic_id, starts_at)` without the `booked` filter, for the calendar (`status <> 'cancelled'`).
- RLS: wrap `auth.uid()` in `(select auth.uid())` in `is_member()` and in the `own memberships` policy.
- The view or RPC for the inbox list (see 3). If `conversations` gets `clinic_id`, backfill it from `patients` in the same migration.
- Run the Supabase performance and security advisors after Anas applies it.

### 5. Bundles and `next dev`

- Landing: one animation library. GSAP stays for the landing (style-lock rule: GSAP only via `src/lib/gsap.ts`). `ledger.tsx` and `chat-cards.tsx` stop pulling unneeded code into the dashboard and login.
- Login: check what makes it 257 KB, and remove what the form does not need.
- Fonts: Newsreader (logo only) and Readex Pro (Arabic) keep `display: swap` and do not preload on pages that do not need them.
- Anas's machine, his own action: add the project folder to the Windows Defender exclusions. Real-time scanning of `node_modules` and `.next` is a known cause of slow `next dev` on Windows. Claude does not change security settings.

### 6. Rename to "Receptionist Agent" (brand only)

- `<Logo />` wordmark text: "Receptionist Agent." with the same Newsreader style and red full stop.
- Metadata titles (`src/app/layout.tsx`, dashboard layout template), landing copy (`src/app/page.tsx`, `src/components/landing.tsx`), chat and dashboard places that show "Front Desk".
- `package.json` `name`: `receptionist-agent`.
- Docs: `CLAUDE.md` (and the `AGENTS.md` mirror rules), `.tastemaker/style-lock.md` (Anas asked for this change), `README.md`. The migration comment in `0003_revenue.sql` stays (applied migrations are not edited).
- The root `Development/CLAUDE.md` project map row gets the new product name. The folder name stays.

## How success is checked

- Same measurements as above, before and after:
  - `curl` TTFB of `GET /api/chat` (local and production);
  - gzipped JS per page (chat target: under 300 KB);
  - the `[timing] prep= agent= send=` log line for one WhatsApp test message (local, through the tunnel).
- `npm test` and `npm run lint` pass. New unit tests for the changed helpers (prompt order, history merge after the send).
- Live replay of the stress transcripts: split message, "hello?", emergency then "just joking", booking. Exactly one reply each, same text quality.
- `supabase/checks/0005_isolation.sql` passes after the migration.

## Left to the builder

- Exact skeleton markup (shadcn `Skeleton`), the view or RPC shape, and whether `conversations` gets `clinic_id` or `Live` drops that subscription.
- Order of tasks inside each section, and the test style (Vitest, like the existing tests).

## Open items for Anas

1. Production region. Anas tests locally for now, so this pass does not change it. Cheapest later fix: set Vercel functions to `icn1` (next to the Seoul DB), one line in `vercel.json`. Bigger fix: move the DB near the UAE (Mumbai or Frankfurt) with Vercel in the same region; this also moves toward the UAE-hosting rule for real patient data.
