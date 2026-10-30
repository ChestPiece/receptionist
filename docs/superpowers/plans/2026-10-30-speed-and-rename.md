# Speed Pass + "Receptionist Agent" Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut sequential network waits in the WhatsApp, web chat and dashboard paths, shrink the web chat bundle, and rename the brand to "Receptionist Agent".

**Architecture:** No new layers. Independent awaits become `Promise.all`; work that does not shape the reply runs after the send. The prompt gets a stable prefix (dynamic lines at the end). The dashboard gets `loading.tsx` boundaries and one RPC for the inbox list. One migration (`0006_speed.sql`) adds matching indexes, the RPC and an RLS fix.

**Tech Stack:** Next.js 16.4 (cacheComponents, partialPrefetching), React 19.3, `@openai/agents` 0.21, Supabase (`@supabase/ssr`, supabase-js), AI SDK `useChat`, Streamdown, shadcn, Vitest, bun.

**Spec:** `docs/superpowers/specs/2026-10-30-speed-and-rename-design.md`

## Global Constraints

- Bot behavior, safety rules, booking rules, persona "Sara" and reply text do not change.
- No commits unless Anas asks (project rule). Vercel deploys every push to `master`; `0006_speed.sql` must be applied before code that calls `inbox_list` is pushed.
- Anas pastes all SQL in the Supabase SQL editor. No writes through the Supabase MCP. Read-only MCP checks (advisors, `explain`) are fine.
- Read the matching guide in `node_modules/next/dist/docs/` before touching rendering. Keep `export const instant = false` in `src/app/dashboard/layout.tsx` (it only opts out of validation).
- UI only from shadcn / AI Elements. Brand rules in `.tastemaker/style-lock.md`; only the name changes.
- Rename is brand only: domain `sara-clinic-bot.vercel.app`, the Vercel project, the GitHub repo, the folder and the test logins `owner@frontdesk.test` / `staff@frontdesk.test` stay.
- Applied migrations are never edited.
- Baseline numbers to beat (2026-10-30): prod `GET /api/chat` 5.0 s cold / 1.0–1.4 s warm; gzipped JS `/chat/sample-smile` 857 KB, `/` 303 KB, `/login` 257 KB; local landing TTFB 2.6 s.

## Review Focus

1. A patient sends a split message ("can you" / "book" / "tomorrow") — exactly one reply, covering all pieces (debounce + `newestPiece` still gate the run after parallelizing).
2. A run that books while a newer piece arrives — the booking reply is still sent and the history keeps both runs' turns (`wroteData`, `mergeHistory` after the send).
3. A web visitor types before the old history finishes loading — the typed message is not lost or overwritten by the late history.
4. A staff user of clinic A calls `inbox_list` with clinic B's id — gets zero rows (RLS through `security invoker`).
5. The WhatsApp model run throws after the patient row exists — the patient still gets the SORRY reply once, and the pieces are marked answered (catch path unchanged).

Tests: 1, 2 and 5 are pinned by the live replay in Task 7; 3 by a manual step in Task 3; 4 by the isolation check in Task 4.

---

### Task 1: Cache-friendly prompt order

**Files:**
- Modify: `src/lib/sara.ts:213-264` (`instructions`)
- Test: `src/lib/sara.test.ts` (create)

**Interfaces:**
- Produces: `export function buildInstructions(c: Clinic, patientName: string | null, waId: string | null, now: Date): string` in `src/lib/sara.ts`. The `Agent`'s `instructions` callback becomes `({ context }) => buildInstructions(context.clinic, context.patientName, context.waId, new Date())`.

- [ ] **Step 1: Write the failing test** in `src/lib/sara.test.ts`, with a minimal `Clinic` fixture (`utc_offset_minutes: 240`, one service, `persona: {}`, `branding: {}`, `wa: null`):

```ts
test("the prompt prefix is the same at any time of day and for any patient", () => {
  const a = buildInstructions(clinic, null, "971500000000@c.us", new Date("2026-10-30T05:00:00Z"));
  const b = buildInstructions(clinic, "Anas Altaf", "971500000000@c.us", new Date("2026-10-31T17:42:00Z"));
  const cut = a.indexOf("Today is");
  expect(cut).toBeGreaterThan(a.indexOf("Clinic info"));
  expect(b.slice(0, cut)).toBe(a.slice(0, cut));
  expect(b).toContain("Anas Altaf (name on file, do not ask again)");
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/sara.test.ts`. Expected: FAIL, `buildInstructions` is not exported.

- [ ] **Step 3: Implement `buildInstructions`.** Same text as today, reordered: the first line keeps name, clinic and channel. Then "How you talk" through "Clinic info" + JSON, unchanged. Then, last, the two dynamic lines: `Today is … local time …` and `Patient: …`. Keep every rule's wording.

- [ ] **Step 4: Run** `npm test`. Expected: all tests pass.

### Task 2: Fewer sequential waits on WhatsApp and in `book`

**Files:**
- Modify: `src/lib/agent.ts:117-234` (`handleMessage`)
- Modify: `src/lib/sara.ts:96-127` (`book` tool)

**Interfaces:**
- Consumes: nothing new. `handleMessage(clinic, msg)` keeps its signature and every behavior in `CLAUDE.md` "How handleMessage works".

- [ ] **Step 1: Regroup awaits in `handleMessage`**, in this order (each line is one `await`):
  1. Dedupe insert (alone, unchanged).
  2. `Promise.all([rate count, patient upsert])`. `markRead` stays fire-and-forget after the rate check.
  3. `toText(msg)`, then the emergency / STOP branches (unchanged, so a rate-limited flood never pays for a transcription).
  4. Body update, then the 1.5 s debounce (`DEBOUNCE_MS` unchanged).
  5. `Promise.all([newestPiece, unanswered pieces, loadHistory()])`; return if not newest, or if there are no pieces.
  6. Paused branch unchanged. A lapsed pause's `bot_paused: false` update runs in `Promise.all` with `runSara`.
  7. `Promise.all([logUsage, newestPiece])`; keep the drop rule `newest !== msg.id && !wroteData(...)`.
  8. `Promise.all([answered(), reply && send(reply)])`, then log `[timing]`.
  9. `Promise.all([logMessages(...), reload history + upsert with mergeHistory])`. Errors are logged, not rethrown (the reply is already out).

- [ ] **Step 2: Regroup the `book` tool.** `Promise.all([upcoming(ctx), checkSlot(...), conversations.followup_sent_at])`; then one `patients` update with only the fields to fill (name if none on file, phone if none on file), skipped when empty; then the insert. Error strings unchanged.

- [ ] **Step 3: Run** `npm test` and `npm run lint`. Expected: pass, no new warnings.

### Task 3: Light, instant web chat

**Files:**
- Modify: `src/components/ai-elements/message.tsx:324-333` (plugins)
- Modify: `src/app/chat/[slug]/chat.tsx:244-260` (`Chat`, `ChatView`)
- Modify: `src/app/chat/[slug]/page.tsx` (one clinic lookup)
- Modify: `package.json`

- [ ] **Step 1: Drop the Streamdown plugins.** Remove the `cjk`, `code`, `math` and `mermaid` imports and the `plugins` prop from `MessageResponse`. Then run `bun remove @streamdown/cjk @streamdown/code @streamdown/math @streamdown/mermaid`. `**bold**` still renders (core Streamdown).

- [ ] **Step 2: Render the chat at once.** `Chat` renders `ChatView` immediately with `initial = []` and starts the history `GET`. When the history arrives, `ChatView` calls `setMessages(history)` from `useChat` only if `messages.length === 0` and `status === "ready"`. A visitor who already typed keeps their chat. A non-empty history sets `greeted` to true.

- [ ] **Step 3: One lookup per request.** In `page.tsx`, `const getClinic = cache(clinicBySlug)` (React `cache`), used by both `generateMetadata` and `ClinicChat`.

- [ ] **Step 4: Verify locally.** Run `bun run dev` and open `/chat/sample-smile`:
  - the greeting shows without waiting for history;
  - reload: the old messages come back;
  - throttle the network to Slow 4G in devtools, type before the history lands, and check that the typed message stays (Review Focus 3);
  - booking buttons and the booking card still work.

- [ ] **Step 5: Measure** with `bun run build && bun run start`: gzipped JS for `/chat/sample-smile` with the same curl loop as the spec. Target: under 300 KB. Record the number.

### Task 4: Migration `0006_speed.sql` (Anas applies it)

**Files:**
- Create: `supabase/migrations/0006_speed.sql`
- Modify: `supabase/checks/0005_isolation.sql` (add the `inbox_list` case)

**Interfaces:**
- Produces: `inbox_list(clinic uuid, max_rows int default 200)` returning `(patient_id uuid, name text, phone text, wa_id text, channel text, role text, body text, created_at timestamptz, last_id bigint, bot_paused boolean, updated_at timestamptz)`, newest chat first. `language sql stable security invoker`, `grant execute … to authenticated`.

- [ ] **Step 1: Write the migration**, with a header comment saying what it does and that it is safe to rerun (`if not exists` / `create or replace`):
  - `create index if not exists messages_clinic_patient_id_idx on messages (clinic_id, patient_id, id desc);`
  - `create index if not exists messages_patient_id_desc_idx on messages (patient_id, id desc);`
  - `drop index if exists messages_clinic_id_created_at_idx;`
  - `create index if not exists appointments_clinic_starts_idx on appointments (clinic_id, starts_at);` then `drop index if exists appointments_clinic_id_starts_at_idx;` (the old partial index, which is never used).
  - `create or replace function is_member(...)`: same body with `(select auth.uid())`. Recreate the `own memberships` policy with `user_id = (select auth.uid())`.
  - `inbox_list`: `distinct on (m.patient_id)` over `messages` where `clinic_id = clinic`, ordered by `patient_id, id desc`; join `patients`, left join `conversations`; final `order by last_id desc limit max_rows`; `coalesce(bot_paused, false)`.

- [ ] **Step 2: Add the isolation case** to `0005_isolation.sql`: as the staff user of the sample clinic, `select count(*) from inbox_list('<other clinic id>')` returns 0 (Review Focus 4).

- [ ] **Step 3: Hand the SQL to Anas** to paste. After he confirms, run (read-only) the Supabase performance and security advisors and the isolation check. Expected: no `auth_rls_initplan` warning, and the isolation check passes.

### Task 5: Dashboard that answers at once

**Files:**
- Create: `src/components/ui/skeleton.tsx` (via `npx shadcn@latest add skeleton`)
- Create: `src/app/dashboard/loading.tsx`, `src/app/dashboard/inbox/loading.tsx`, `src/app/dashboard/calendar/loading.tsx`, `src/app/dashboard/patients/loading.tsx`
- Modify: `src/app/dashboard/layout.tsx`, `src/app/dashboard/shell.tsx`, `src/app/dashboard/inbox/page.tsx`

**Interfaces:**
- Consumes: `inbox_list` from Task 4 (`sb.rpc("inbox_list", { clinic: clinic.id })`).
- Produces: `Nav({ inboxBadge }: { inboxBadge?: ReactNode })` in `shell.tsx`; the layout passes a `<Suspense fallback={null}><NeedsStaffBadge /></Suspense>` element.

- [ ] **Step 1: Loading skeletons.** Each `loading.tsx` copies its page's header (the same `h1` text and classes) plus `Skeleton` blocks shaped like the page body: tallies + calendar; list + thread; calendar; table rows.

- [ ] **Step 2: Static sidebar.** The layout renders the logo and `Nav` at once. The clinic name or picker, `Live` and the "No clinic yet" panel move into an async `DeskSide` component behind `<Suspense>` (fallback: a one-line `Skeleton`). The Inbox count moves to `NeedsStaffBadge` (the current query and `stillPaused` filter), passed as `inboxBadge`. Pages still return `null` without a clinic.

- [ ] **Step 3: `Live`.** Remove the unfiltered `conversations` subscription. Pause changes from staff already call `refresh()`, and a bot handoff always logs a message. Raise the refresh debounce from 300 ms to 1000 ms.

- [ ] **Step 4: Inbox on the RPC.**
  - `recent`, `people` and `convos` become one `inbox_list` call.
  - When `p` is set, the thread query runs in `Promise.all` with it. Without `p`, the thread loads after it for `list[0]`.
  - Waiting = `stillPaused({ bot_paused, updated_at })` per row.
  - Remove the `ponytail:` 500-row comment.
  - Markup unchanged.

- [ ] **Step 5: Verify locally.** Log in as `staff@frontdesk.test` (`docs/testing.md`) and click Today, Inbox, Calendar and Patients:
  - the sidebar and a skeleton show at once on every click;
  - the inbox lists the same chats as before, with the Needs staff filter and count;
  - send a web chat message in another tab: the inbox updates within about 1 s.

- [ ] **Step 6: Run** `npm test` and `npm run lint`. Expected: pass.

### Task 6: Rename to "Receptionist Agent"

**Files:**
- Modify: `src/components/logo.tsx`, `src/app/layout.tsx:29-32`, `src/app/dashboard/layout.tsx:11`, `src/app/page.tsx:8`, `src/components/landing.tsx:44`, `src/app/chat/[slug]/chat.tsx:158`, `src/app/layout.tsx` (Readex `preload: false`)
- Modify: `package.json` (`"name": "receptionist-agent"`; let `bun install` update `bun.lock`), `CLAUDE.md`, `README.md`, `.tastemaker/style-lock.md`
- Modify: `C:\Users\Anas Altaf\Desktop\Development\CLAUDE.md` and `AGENTS.md` (project map row: product name "Receptionist Agent", folder unchanged)

- [ ] **Step 1: Replace the brand text.**
  - Wordmark: `Receptionist Agent<span className="text-alert">.</span>`, with the logo comment updated.
  - Metadata: title `"Receptionist Agent"`, and the dashboard template `"%s · Receptionist Agent"`.
  - `aria-label="Receptionist Agent home"`.
  - Delete the `ponytail:` placeholder-name comment in `page.tsx`.
  - Leave the generic words "front desk" in the Sara prompt and the staff-notes hint alone: they describe a role, not the brand.
  - `rg -i "front desk"` over `src/`, `docs/`, `CLAUDE.md`, `README.md` and `.tastemaker/` must show only those generic uses and the `@frontdesk.test` logins.

- [ ] **Step 2: Arabic font.** Set `preload: false` on `Readex_Pro` in `src/app/layout.tsx` (it is only needed for Arabic text).

- [ ] **Step 3: Verify.** Run `bun run dev` and check `/`, `/login`, `/chat/sample-smile` and `/dashboard` at 375 px and desktop width:
  - the wordmark fits on one line in the dashboard sidebar;
  - tab titles read "… · Receptionist Agent".

- [ ] **Step 4: Update memory** `clinic-whatsapp-bot.md`: brand renamed 2026-10-30, and the region gap is an open item.

### Task 7: Measure and replay

**Files:** none (this task reports results)

- [ ] **Step 1: Run** `npm test`, `npm run lint` and `bun run build`. Expected: all pass with zero type errors.
- [ ] **Step 2: Local numbers.** Run the spec's curl loops against `bun run start`:
  - `GET /api/chat` TTFB;
  - gzipped JS for `/`, `/chat/sample-smile` and `/login`;
  - the `[timing]` line for one WhatsApp message over the cloudflared tunnel (then point UltraMsg back to prod).
- [ ] **Step 3: Live replay** on WhatsApp (and the web chat where it applies):
  - split message in 3 pieces, expecting one reply (Review Focus 1);
  - "hello?" mid-chat;
  - emergency, then "just joking";
  - a booking sent while a second piece arrives during the model run, expecting the booking reply plus one more reply and both turns in `conversations.history` (Review Focus 2);
  - one forced error: set `OPENAI_DEFAULT_MODEL=bad-model` locally, expecting one SORRY reply (Review Focus 5). Then restore it.
- [ ] **Step 4: Report** a before/after table to Anas, and ask whether to commit, and whether to set Vercel `regions: ["icn1"]` before the next deploy (spec open item 1).

## Dropped from the spec, with reason

- Making the Today thread load in parallel: the thread needs the first waiting patient's id, so it stays one extra query, and only when someone is waiting.
- Calendar animation "first render only": blocks keep their React keys across `router.refresh()`, so motion does not replay on refresh. It replays only on navigation, which is intended.
- One animation library on the landing page, and a smaller login bundle: `motion` comes from `chat-cards.tsx`, which the chat needs anyway. Removing it from the landing page means rewriting the demo components, which the "no redesign" rule rules out. Task 7 records the numbers. A follow-up can target them if they still matter after Tasks 1–6.
