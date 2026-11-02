# Front-desk CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the staff dashboard into a front-desk CRM on a multi-dentist booking engine shared with Sara, in a new cream + sage layout, and seed a Good Shine Dental test clinic.

**Architecture:** One migration adds services, dentists, time off and per-dentist double-booking protection. A new `src/lib/booking.ts` (pure core + thin DB layer taking any Supabase client) is the only place visits are computed, booked, moved and cancelled; Sara's tools, the dashboard's server actions and the cron jobs all call it. The dashboard moves to a shadcn sidebar shell with fixed-height panes.

**Tech Stack:** Next.js 16 route handlers + server actions, React 19, Tailwind v4, shadcn new-york (Radix), Supabase (RLS), `@openai/agents`, Vitest, npm.

**Spec:** `docs/superpowers/specs/2026-11-01-front-desk-crm-design.md`

## Global Constraints

- Read `CLAUDE.md`, `AGENTS.md` (Next 16 docs in `node_modules/next/dist/docs/`) and `.tastemaker/style-lock.md` before any code.
- Supabase is live. Anas pastes SQL in the SQL editor: `0006_speed.sql` first, then `0007_dentists.sql`. Ask before any other DB write (including the seed script).
- Commit only when Anas asks. Branch `dev`. Never push.
- Synthetic data only, labeled "(sample data)". No PHI in logs. Keys and passwords only in `.env.local`, never printed.
- UI only from shadcn / AI Elements pieces in `src/components/{ui,ai-elements}`; no form or table library; no GSAP in the dashboard; motion 150-250 ms ease-out.
- No en/em dashes in patient-facing text (`tidy`). EN + AR service names.
- Booking caps: `MAX_UPCOMING = 3` on Sara's path only; horizon 60 days; slot step 15 min.
- Sara's static prompt prefix (everything before "Today is") must stay byte-stable for a given clinic config.
- Every dashboard route: `document.scrollingElement.scrollHeight <= innerHeight` at 1366x768, 1440x900, 768x1024, 375x812.

## Review Focus

1. A service no active dentist does (or a dentist with no services): Sara and the dialog say "no dentist offers this right now", never crash or offer empty days silently. Test in Task 2.
2. Date boundaries in UTC+4: a 23:30 local `now` and a visit that crosses local midnight must land on the right local day. Test in Task 2.
3. Two bookings racing for the same dentist slot (Sara + desk): the second gets TAKEN (`23P01`), not a 500. Covered by `bookVisit` mapping in Task 3; checked live in Task 13.
4. UAE phone input variants (`050 123 4567`, `+971 50 123 4567`, `971501234567`, `0501234567`) all normalise to one `wa_id`; junk returns null. Test in Task 8.
5. Owner with clinic A membership editing clinic B rows by id: blocked by RLS FK-ownership checks. Checked with SQL in Task 1.

---

## Group A: data and engine (main session)

### Task 1: Migration 0007

**Files:**
- Create: `supabase/migrations/0007_dentists.sql`

**Interfaces:**
- Produces: tables `services`, `dentists`, `dentist_services`, `time_off`; columns `appointments.dentist_id` (not null), `appointments.service_id`; functions `is_owner(uuid)`; constraint `appointments_dentist_no_overlap`.

- [ ] **Step 1: Write the migration** exactly as spec section 1 lists, in one `begin; … commit;`. Order: tables → backfill (`where not exists`, dentist named after the clinic, `service_id` by name) → `dentist_id set not null` → `BEFORE INSERT` trigger `appointments_default_dentist` (comment: drop once new code is on `master`) → `DO` block dropping the unnamed `contype='x'` constraint → add `appointments_dentist_no_overlap` → `patients_identity` check now `wa_id is not null or web_visitor_id is not null or phone is not null` → `is_owner()` (`security definer`, `stable`, owner membership or `platform_admins`) → RLS + grants (`revoke update on clinics from authenticated` before the owner column grant) → `alter publication supabase_realtime add table time_off`. Header comment says what it does and that 0006 must be applied first.
- [ ] **Step 2: Hand to Anas to paste.** Then run these read-only checks with him (SQL editor):

```sql
select count(*) from appointments where dentist_id is null;            -- 0
select conname from pg_constraint where contype='x' and conrelid='appointments'::regclass; -- appointments_dentist_no_overlap only
select c.slug, count(d.*) from clinics c join dentists d on d.clinic_id=c.id group by 1; -- 1 per existing clinic
```

Expected: as commented.

### Task 2: Booking engine, pure core

**Files:**
- Create: `src/lib/booking.ts` (pure part), `src/lib/booking.test.ts`
- Modify: `src/lib/clinics.ts` (types only in this task)

**Interfaces:**
- Consumes: `freeSlots`, `toUtc`, `localDate`, `Hours` from `src/lib/slots.ts`.
- Produces (in `clinics.ts`):
  - `Service = { id: string; name: string; name_ar: string; minutes: number; price_aed: number; active: boolean; sort: number }`
  - `Dentist = { id: string; name: string; name_ar: string | null; title: string | null; color: string | null; hours: Hours; active: boolean; sort: number; service_ids: string[] }`
  - `Clinic.dentists: Dentist[]`
- Produces (in `booking.ts`):
  - `type Busy = { dentistId: string; start: Date; end: Date }`
  - `type Free = { time: string; dentistIds: string[] }`
  - `dentistsFor(c: Pick<Clinic, "dentists">, serviceId: string, dentistId?: string | null): Dentist[]` — active, doing the service, sorted by `sort`.
  - `freeByDentist(dentists: Dentist[], busy: Busy[], minutes: number, date: string, now: Date, offsetMin: number): Free[]` — times ascending, `dentistIds` in dentist sort order.
  - `pickDentist(ids: string[], load: Record<string, number>): string` — fewest visits that day; tie keeps `ids` order.
  - `HORIZON_DAYS = 60`, `tooFar(date: string, today: string): boolean` (moved from `sara.ts:394`).
  - `bookingSource(followupSentAt: string | null, now: Date)` (moved from `jobs.ts:82`; `jobs.ts` re-exports it so `jobs.test.ts` keeps passing).

- [ ] **Step 1: Write failing tests** in `src/lib/booking.test.ts`:

```ts
const H = { sat: [["09:00","12:00"]] } as Hours;          // 2026-11-07 is a Saturday
const amal = dentist("a", H, ["s1"]), lina = dentist("l", { sat: [["10:00","12:00"]] }, ["s1","s2"]);
const now = new Date("2026-11-06T20:00:00Z");              // Fri 00:00 local, UTC+4

test("dentistsFor filters by service, active and pick", () => {
  expect(dentistsFor({ dentists: [amal, lina] }, "s2").map(d => d.id)).toEqual(["l"]);
  expect(dentistsFor({ dentists: [{ ...amal, active: false }, lina] }, "s1").map(d => d.id)).toEqual(["l"]);
  expect(dentistsFor({ dentists: [amal, lina] }, "s1", "a").map(d => d.id)).toEqual(["a"]);
  expect(dentistsFor({ dentists: [amal] }, "nope")).toEqual([]);
});

test("freeByDentist unions dentists and subtracts busy and time off per dentist", () => {
  const busy = [{ dentistId: "a", start: toUtc("2026-11-07","10:00",240), end: toUtc("2026-11-07","11:00",240) }];
  const free = freeByDentist([amal, lina], busy, 60, "2026-11-07", now, 240);
  expect(free.find(f => f.time === "09:00")?.dentistIds).toEqual(["a"]);
  expect(free.find(f => f.time === "10:00")?.dentistIds).toEqual(["l"]);   // Amal busy
  expect(free.find(f => f.time === "11:00")?.dentistIds).toEqual(["a","l"]);
});

test("freeByDentist uses local day across UTC midnight", () => {
  const late = new Date("2026-11-07T07:30:00Z");           // 11:30 local Sat
  expect(freeByDentist([amal], [], 15, "2026-11-07", late, 240).map(f => f.time)).toEqual(["11:45"]);
});

test("pickDentist prefers lighter day, ties keep order", () => {
  expect(pickDentist(["a","l"], { a: 3, l: 1 })).toBe("l");
  expect(pickDentist(["a","l"], {})).toBe("a");
});
```

(`dentist(id, hours, serviceIds)` is a small factory at the top of the test file.)

- [ ] **Step 2: Run** `npx vitest run src/lib/booking.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the types and pure functions. `freeByDentist` calls `freeSlots(d.hours, busy.filter(b => b.dentistId === d.id), …)` per dentist and merges into a `Map<time, ids[]>`.
- [ ] **Step 4: Run** `npx vitest run src/lib/booking.test.ts src/lib/jobs.test.ts` — Expected: PASS.

### Task 3: Booking engine, DB layer + clinic loader

**Files:**
- Modify: `src/lib/booking.ts`, `src/lib/clinics.ts`, `src/lib/clinics.test.ts`

**Interfaces:**
- Consumes: Task 2 pure core.
- Produces (`booking.ts`, `sb: SupabaseClient` is any client):
  - `availability(sb, c: Clinic, q: { serviceId: string; from: string; days: number; dentistId?: string | null; ignoreId?: string }): Promise<Record<string, Free[]>>` — one appointments query and one `time_off` query for the whole range, `dentist_id in (…)`.
  - `type BookResult = { ok: true; id: string; dentistId: string; date: string; time: string } | { ok: false; reason: "taken" | "unavailable" | "too_far" | "unknown_service" | "no_dentist"; free?: string[] }`
  - `bookVisit(sb, c, v: { patientId: string; serviceId: string; date: string; time: string; dentistId?: string | null; source: string }): Promise<BookResult>` — picks the dentist with `pickDentist` when none given; writes `service` (name), `service_id`, `dentist_id`; maps `23P01` → `taken`.
  - `moveVisit(sb, c, v: { id: string; date: string; time: string; dentistId?: string | null }): Promise<BookResult>` — keeps the current dentist when free, else picks; resets `reminded_24h_at`, `reminded_2h_at`, `confirmed_at`.
  - `cancelVisit(sb, id: string): Promise<void>`
  - `clashes(sb, c, dentistId: string): Promise<{ id: string; starts_at: string; service: string; patient: string | null }[]>` — future booked visits of that dentist outside their hours, inside time off, or any if inactive.
- Produces (`clinics.ts`): `SELECT` with `service_rows:services(*), dentists(*, dentist_services(service_id))`; `toClinic` maps active-sorted services onto `Clinic.services`, dentists sorted by `sort, name` with `service_ids`; `forgetClinic(id: string): void`; `TTL = 60_000` with the `ponytail:` comment from the spec.

- [ ] **Step 1: Write failing test** in `src/lib/clinics.test.ts`: `toClinic` (export it) sorts `service_rows` by `sort, name`, drops inactive services, flattens `dentist_services` into `service_ids`, and ignores the legacy `services` jsonb.
- [ ] **Step 2: Run** `npx vitest run src/lib/clinics.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** loader changes and the DB layer.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit` — Expected: tests PASS; type errors only in `sara.ts`/`jobs.ts` callers (fixed in Task 4).

### Task 4: Sara and jobs on the new engine

**Files:**
- Modify: `src/lib/sara.ts`, `src/lib/sara.test.ts`, `src/lib/jobs.ts`, `src/lib/jobs.test.ts`

**Interfaces:**
- Consumes: Task 3 `availability`, `bookVisit`, `moveVisit`, `cancelVisit`, `dentistsFor`, `tooFar`, `HORIZON_DAYS`.
- Produces: tool shapes the web chat reads (Task 12):
  - `find_slots` → `{ service: string; dentist?: string; days: { date: string; times: string[]; note?: string }[] }`
  - `book` → `{ booked: true; id; service; date; time; dentist?: string; address; maps_url }`
  - `my_appointments` items gain `dentist?: string`.
  - `dentist` keys appear only when the clinic has more than one active dentist.

- [ ] **Step 1: Write failing tests** in `sara.test.ts`: (a) existing prefix-stability test with fixtures that now include `dentists` and `services` with ids; (b) with two dentists, the prefix contains `"dentists":[{"name":"Dr. Amal Haddad"` and the dentist rule line; (c) with one dentist, the prefix contains no `"dentists"` key.
- [ ] **Step 2: Run** `npx vitest run src/lib/sara.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Remove `bookedOn`, `slotsOn`, `checkSlot`, local `tooFar`. `findService` matches name or `name_ar`. Tools take `dentist: z.string().nullable()` (matched by name, case-insensitive, "Dr." optional). `find_slots` on an off day for a named dentist adds `note: "Dr. X is away on this day"` when a `time_off` row covers it (`availability` returns that day empty; check `time_off` only in that case). Prompt rule (static part): "Ask which dentist only if the patient names one or only one dentist does the service. If a named dentist is away, say so and offer other days or another dentist." `handoff_to_staff`: upsert `bot_paused: true, updated_at: now` first for both channels; then alert on WhatsApp only if `clinic.wa && clinic.staff_whatsapp` (web text includes callback phone if known); return "Staff notified. Tell the patient a team member will reply in this chat soon." `jobs.ts` `nextFree` → one `availability(db(), clinic, { serviceId, from: today, days: 7 })`.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npm run lint` — Expected: all PASS, no type errors.

### Task 5: Web chat API pause + polling

**Files:**
- Modify: `src/app/api/chat/route.ts`

**Interfaces:**
- Produces: `GET /api/chat?slug&visitorId[&after=<messages.id>]` → `{ paused: boolean, messages: { id: string; role: "patient"|"assistant"|"staff"; text: string; at: string }[] }` (with `after`, only newer rows). POST while paused: history append without `updated_at`, no model run, stream one fixed assistant text "Our front desk has your chat and will reply here shortly."

- [ ] **Step 1: Implement** using `stillPaused` (same import `agent.ts` uses). Remove the `updated_at` bump at `route.ts:69` on the paused path only.
- [ ] **Step 2: Verify** `npx tsc --noEmit && npm run lint` — PASS. Live check happens in Task 13.

---

## Group B: tokens and shell (may run in its own session, worktree branch)

### Task 6: Cream + sage tokens, style-lock, shadcn pieces

**Files:**
- Modify: `src/app/globals.css`, `.tastemaker/style-lock.md`
- Create (CLI): `src/components/ui/{sidebar,table,tabs,popover,calendar,label,switch,checkbox,avatar,toggle-group,sonner}.tsx`

- [ ] **Step 1: Tokens.** Light: cream background, warmer card, sage `--primary`, sand `--muted`, warm `--border`; dark: deep olive-charcoal surfaces with the same sage. Keep every token name, `--web`, `--alert`, `--night*`, `--dawn*`. Record values and rules (fixed-height shell, inner-pane scroll only, no `calc(100dvh-…)`, row height 44px, stat strip) in the style-lock with a dated amendment.
- [ ] **Step 2: Add pieces** `npx shadcn@latest add sidebar table tabs popover calendar label switch checkbox avatar toggle-group sonner`. Verify `npm run build` compiles.

### Task 7: Sidebar shell and role

**Files:**
- Modify: `src/app/dashboard/layout.tsx`, `src/app/dashboard/shell.tsx`, `src/lib/dashboard.ts`
- Create: `src/components/page-header.tsx`

**Interfaces:**
- Produces: `DeskClinic.role: "owner" | "staff"`; `<PageHeader title actions? />`; layout contract: page component returns `<><PageHeader/><div className="flex-1 min-h-0 …">…</div></>`.

- [ ] **Step 1: Implement** shell per spec section 4 (sidebar `collapsible="icon"`, sheet on phones, Settings link only when `role === "owner"`, switcher in header, user + `ThemeToggle` in footer, `Toaster` from sonner, `⌘K` command menu over pages + patient search).
- [ ] **Step 2: Fit existing pages** to the contract (remove `calc(100dvh-180px)`, `py-8`, `pb-16`).
- [ ] **Step 3: Verify** with the `ego-browser` skill at the four sizes, light and dark: scroll check from Global Constraints passes on Today, Inbox, Calendar, Patients, a patient profile. `npm run lint && npx tsc --noEmit` PASS.

---

## Group C: CRM pages (main session, after A and B)

### Task 8: Desk server actions

**Files:**
- Modify: `src/app/dashboard/actions.ts`
- Create: `src/lib/phone.ts`, `src/lib/phone.test.ts`

**Interfaces:**
- Consumes: Task 3 engine, `desk()`, `DeskClinic.role` (Task 7).
- Produces: `normUaePhone(raw: string): string | null` → digits like `"971501234567"`; `waIdOf(digits: string) => \`${digits}@c.us\``.
- Produces (all `"use server"`, user RLS client, return `{ error?: string }` shapes for `useActionState`):
  - `freeTimes(q: { serviceId; date; dentistId?: string | null; ignoreId?: string }): Promise<Free[]>`
  - `bookForPatient(v: { patientId; serviceId; date; time; dentistId?: string | null }): Promise<BookResult>` (`source: "staff"`)
  - `moveForPatient(v: { id; date; time; dentistId?: string | null }): Promise<BookResult>`
  - `cancelForPatient(id: string): Promise<void>`
  - `addPatient(v: { name: string; phone: string }): Promise<{ id: string; existing: boolean } | { error: string }>` — looks up by `wa_id`/`phone` first.
  - `staffReply(patientId, form)` branches on channel: WhatsApp as today; web inserts `messages` (`role: "staff", channel: "web"`) and appends to history via `appendToChat` (`jobs.ts:93`).
- `revalidatePath("/dashboard", "layout")` after writes.

- [ ] **Step 0: Failing test** `phone.test.ts`: `"050 123 4567"`, `"+971 50 123 4567"`, `"971501234567"`, `"0501234567"` → `"971501234567"`; `"12"`, `"abc"`, `""` → `null`. Run `npx vitest run src/lib/phone.test.ts` — FAIL; implement; PASS.
- [ ] **Step 1: Implement.** Map `BookResult.reason` to staff copy: taken → "Someone just took that time. Pick another.", unavailable → "That time isn't free anymore.", no_dentist → "No dentist offers this service right now."
- [ ] **Step 2: Verify** `npx tsc --noEmit && npm run lint` PASS.

### Task 9: Schedule component + Calendar page + booking dialog

**Files:**
- Modify: `src/components/ledger.tsx` (replace `WeekCalendar` with `Schedule`; delete `Line`, `Typed`; `Tally` → `Stat`), `src/lib/dashboard.ts` (`week()` → `schedule()`), `src/app/dashboard/calendar/page.tsx`
- Create: `src/app/dashboard/booking-dialog.tsx`, `src/app/dashboard/visit-sheet.tsx`

**Interfaces:**
- Produces:
  - `schedule(sb, clinic, q: { view: "day" | "week"; date: string; dentistId?: string }): Promise<{ columns: { key: string; label: string; sub?: string }[]; blocks: Block[]; off: { column: string; from: number; to: number }[]; range: [number, number] }>`
  - `Block` gains `column: string; dentistColor: string | null`.
  - `<Schedule columns blocks off range onEmpty?(column, hour) onBlock?(id) />`
  - `<BookingDialog clinic services dentists mode="book" | "move" visit? prefill?: { dentistId?; date?; time?; patientId? } />`
- URL state on Calendar: `?v=day|week&d=YYYY-MM-DD&dentist=<id>&a=<visitId>`.

- [ ] **Step 1: Implement** per spec section 5 (day = column per dentist, week = column per day, rows 44px, range from opening hours, shaded closed hours + time off, opens scrolled to now).
- [ ] **Step 2: Verify in browser** (Sample Smile after backfill = one column): click empty cell opens dialog prefilled; booking shows a block; move and cancel update it; scroll check passes.

### Task 10: Today, Inbox, Patients

**Files:**
- Modify: `src/app/dashboard/page.tsx`, `src/app/dashboard/inbox/page.tsx`, `src/app/dashboard/inbox/reply-box.tsx`, `src/app/dashboard/patients/page.tsx`, `src/app/dashboard/patients/[id]/page.tsx`
- Create: `src/app/dashboard/add-patient-dialog.tsx`, `src/app/dashboard/inbox/patient-panel.tsx`

- [ ] **Step 1: Today** — `Stat` row (visits today, booked by Sara this week, needs staff, no-shows this week) + Needs staff queue + Today agenda by dentist with Arrived / No-show.
- [ ] **Step 2: Inbox** — tabs All / Needs staff / WhatsApp / Website (`?f=`); 3 panes at `xl`, 2 at `lg`, one at a time on phones; patient panel with upcoming visits + Book visit; reply box for both channels; remove the web block at `inbox/page.tsx:102-108`.
- [ ] **Step 3: Patients** — shadcn `Table`, search, tag filter, channel, last / next visit, Add patient dialog; profile two-column with visits Book / Move / Cancel.
- [ ] **Step 4: Verify** scroll check on each route at four sizes; take over → reply on a web chat writes a `staff` message.

---

## Group D: Settings (main session)

### Task 11: Owner Settings

**Files:**
- Create: `src/app/dashboard/settings/{page.tsx,loading.tsx,actions.ts,hours-editor.tsx,clash-dialog.tsx}`
- Test: `src/lib/booking.test.ts` (add `hoursInside`)

**Interfaces:**
- Produces: `hoursInside(inner: Hours, outer: Hours): boolean` in `booking.ts`; actions `saveClinic`, `saveService`, `saveDentist`, `saveTimeOff`, `deleteTimeOff`, `saveBranding` — each calls `forgetClinic(id)` and returns `{ error?: string; clashes?: Awaited<ReturnType<typeof clashes>> }`.

- [ ] **Step 1: Failing test** `hoursInside`: `{sat:[["10:00","12:00"]]}` inside `{sat:[["09:00","13:00"]]}` → true; `{fri:[["09:00","10:00"]]}` inside `{fri:[["16:00","21:00"]]}` → false; a day missing in outer → false.
- [ ] **Step 2: Run** FAIL → implement → PASS.
- [ ] **Step 3: Implement pages** per spec section 5 Settings (tabs `?t=clinic|services|dentists|timeoff|widget`; staff see disabled inputs and no save buttons; accent color input rejects contrast below 4.5:1 against white text).
- [ ] **Step 4: Verify** as owner: change a price, Sara quotes it within 60 s on the same server; shrink a dentist's hours over a booked visit → clash dialog lists it. As staff: no save buttons, direct action call returns an RLS error.

---

## Group E: patient web chat

### Task 12: White-label chat + staff replies

**Files:**
- Modify: `src/app/chat/[slug]/page.tsx`, `src/app/chat/[slug]/chat.tsx`, `src/components/chat-cards.tsx`

- [ ] **Step 1: Implement** accent from `branding.accent` as `--primary` on the chat root (fallback sage), logo from `branding.logo`; `SlotPicker` / `BookedCard` / `AppointmentList` show `dentist` when present; polling per spec section 6 using Task 5's `GET` shape (`after` = last staff message id seen), "You're chatting with the front desk" / "Sara is back" notes.
- [ ] **Step 2: Verify** `npx tsc --noEmit && npm run lint`; live check in Task 13.

---

## Group F: Good Shine and end-to-end

### Task 13: Seed and end-to-end

**Files:**
- Create: `scripts/seed-good-shine.ts`
- Modify: `docs/testing.md` (how to run the seed, which logins exist; no passwords), `CLAUDE.md` (multi-dentist + CRM notes)

- [ ] **Step 1: Write the seed** per spec section 7, pattern of `scripts/create-test-users.ts` (idempotent by slug; visit times computed from today in UTC+4 and only inside each dentist's hours; history visits `completed` / `no_show` / `cancelled`; 2 paused conversations with `updated_at = now()`; `GOODSHINE_OWNER_PASSWORD` / `GOODSHINE_STAFF_PASSWORD` into `.env.local`).
- [ ] **Step 2: Ask Anas for go**, then `bun scripts/seed-good-shine.ts`. Expected: prints counts only.
- [ ] **Step 3: Run the six end-to-end checks** from the spec's Verification section with `ego-browser`, plus the scroll check at four sizes in light and dark. Record results (pass/fail with one-line evidence) in the session report.
- [ ] **Step 4: Full suite** `npm test && npm run lint && npx tsc --noEmit` — PASS.
