# Sara on Free Gemini: Fast, Smooth, Self-Reliant Receptionist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. On execution, copy this file to `receptionist/docs/superpowers/plans/2026-11-18-sara-free-gemini.md`.
> Skills each task must load first: `ponytail` (always), `superpowers:test-driven-development`, plus the ones named per task. Subagents: Sonnet medium or Opus low only (global rule). Read `node_modules/next/dist/docs/` before any route change (AGENTS.md).

**Goal:** Sara runs on free Google Gemini for every channel (web voice call, web chat, WhatsApp, voice notes, reviewer) with zero OpenAI calls, answers a caller in about a second, books/moves/cancels without getting stuck, and recovers by herself from drops, slow tools, misheard numbers and quota limits.

**Architecture:** Port the proven portfolio (Rook) stack: text through `src/lib/llm.ts` (Gemini via its OpenAI-compatible endpoint, Groq fallback, Agents SDK unchanged); voice through Gemini Live with a one-use ephemeral token minted server side, browser on a WebSocket, tools still executed by our existing `/api/voice/tool` route. On top, deterministic code removes the model's weak spots (dates, weekdays, phone numbers, stalls), and an eval suite gates every change.

**Tech Stack:** Next.js 16.4 route handlers (Vercel Hobby), `@openai/agents` 0.21 + `OpenAIChatCompletionsModel`, `@google/genai` (new, same version as `../ChestPiece_Portfolio/package.json`), Supabase, vitest, bun.

**Spec:** this file's Context + owner answers (2026-11-18). Reference implementation: `../ChestPiece_Portfolio/src/features/junior/` (`server/llm.ts`, `server/voice.ts`, `client/useCall.ts`, `client/liveAudio.ts`, `voice.evals.test.ts`, `app/(payload)/api/junior/voice/route.ts`).

## Context
OpenAI credit is gone (portfolio switched 2026-11-14). Sara calls OpenAI in 4 places: `/api/voice` (realtime WebRTC), the text agent (`sara.ts`, SDK default model), voice-note transcription (`agent.ts:30-58`), reviewer (`reviewer.ts:59`). Owner decisions: everything free; delete the OpenAI voice code (git keeps it); caller may say OR type the number during a call; one default female voice with env override, no Arabic voice swap.

What "9/10" means here, as measurable targets (recorded by Task 6 call metrics, checked by Task 8 evals):
| Metric | Target |
|---|---|
| Caller stops talking → Sara's first audio (p50 / p90) | ≤ 1.0 s / ≤ 1.8 s |
| Click "Call Sara" → greeting audio | ≤ 2.5 s |
| Voice tool round trip (`/api/voice/tool`) p50 | ≤ 400 ms |
| Web chat first token | ≤ 1.5 s |
| Booking evals (text + voice) | ≥ 90 % pass, 0 wrong-number bookings, 0 invented times |
| Calls that end "stuck" (silence watchdog fired twice, or dropped without resume) | < 2 % |

## Global Constraints
- No request to `api.openai.com` anywhere at runtime. `OPENAI_API_KEY` unset must work.
- Env names (copy from portfolio): `GEMINI_API_KEY`, `GROQ_API_KEY`, `LLM_PROVIDER` (default `gemini`), `LLM_MODEL`, `LLM_FALLBACK_PROVIDER` (`groq`), `LLM_FALLBACK_MODEL`, `LLM_REVIEW_MODEL`, `GEMINI_LIVE_MODEL` (default `gemini-3.8-live`), `GEMINI_LIVE_VOICE` (default `Sulafat`).
- Text model default `gemini-3.5-flash-lite`, reasoning `low`. Live API version `v1alpha` (ephemeral tokens only work there).
- Every existing safety rule stays: deterministic emergency reply, `unforge`, read-back before a voice booking, clinic/patient never from model args, rate limits via `allow()`.
- Caps: 8 min per call (`MAX_MS`), idle 45 s, 3 calls/visitor/hour, `call-ip` 6/h, `call-clinic` 60/h, NEW `call-all` 100/day.
- Free tier = Google may use data for training. Demo/fake data only (existing rule). Paid key is an env swap, no code change.
- Never put a backtick inside the prompt template literal in `sara.ts`.
- No new migration. `agent_events.kind` is free text, so new kinds (`call_metrics`) need no SQL.

## Review Focus
1. Caller says a number in Arabic digits or with "double five" → stored as the right `9715…`; a non-UAE or short number is never booked silently (Task 4 test `voiceBook rejects non-UAE number`).
2. Gemini closes the socket mid-call (goAway, 10-min connection reset, network blip) → call resumes on the same context within 2 s, no second greeting, call count not increased (Task 6 test `resume does not log a call`).
3. A tool takes > 8 s or Supabase errors → Sara apologises and offers handoff instead of going silent (Task 5 test `tool route times out with spoken fallback`).
4. Free quota 429 at token mint or mid-chat → visitor gets "voice is busy, keep typing" / Groq fallback answer, never a hang (Task 1 test `fallbackModel uses groq on 429`, Task 5 test `mint 429 returns busy`).
5. Old `conversations.history` rows written by the OpenAI Responses API (reasoning items, `function_call` with `id`/`call_id`) → load and continue on Chat Completions without a 400 (Task 1 test `sanitizeHistory drops reasoning items`).

---

### Task 0: Live API spike (gate, no app code)
Skills: `ponytail`. Purpose: prove the exact session config on a v1alpha ephemeral token before building on it.

**Files:** Create `scripts/live-spike.ts` (untracked, like `spikes/voice/`).

- [ ] **Step 1:** Script mints a token with `ai.authTokens.create({ config: { uses: 1, liveConnectConstraints: { model, config } } })` where `config` holds: `responseModalities: [AUDIO]`, `speechConfig` voice `Sulafat`, `enableAffectiveDialog: true`, `proactivity: { proactiveAudio: true }`, `sessionResumption: {}`, `contextWindowCompression: { slidingWindow: {} }`, input/output transcription, one `NON_BLOCKING` tool (`find_slots` schema from `toolSchemas()`, nullable fields included) and one `BLOCKING` tool (`book`).
- [ ] **Step 2:** Connect with the token, send text "What's free tomorrow for a check-up?", answer the tool call, then send `"Book the first one"`.
- [ ] **Step 3:** Record in the plan's "Spike results" line: each field accepted or rejected, whether `sessionResumptionUpdate.newHandle` arrives, whether the model spoke a time before the `find_slots` result arrived.
Expected: all accepted. If affective/proactive are rejected on v1alpha, drop them (note it); if nullable `anyOf` is rejected, Task 5 maps `type: ["string","null"]` → `{ type: "string", nullable: true }`; if Sara speaks times before the result, Task 5 makes `find_slots` BLOCKING too.

Spike results (2026-11-18): token mint OK, setup ~1.3 s. Accepted: Sulafat, transcription both ways, sessionResumption (newHandle arrives), contextWindowCompression, VAD low start / high end / 500 ms, proactivity.proactiveAudio, nullable JSON-schema params, NON_BLOCKING find_slots with WHEN_IDLE (no times spoken before the result). REJECTED: enableAffectiveDialog (socket closes 1007 "invalid argument" at first generation) - dropped.

### Task 1: Text brain on free Gemini
Skills: `ponytail`, `superpowers:test-driven-development`.

**Files:**
- Create: `src/lib/llm.ts` (copy of portfolio `server/llm.ts`), `src/lib/llm.test.ts` (copy of portfolio `server/llm.test.ts`)
- Modify: `src/lib/sara.ts:430-434` (Agent model), `src/lib/reviewer.ts:59`, `src/lib/agent.ts:12-16` (`trimHistory`), `package.json` (no new dep: `openai` comes with `@openai/agents`; add explicitly only if import fails)

**Interfaces:**
- Produces: `chatModel(env?, prefix?) => { model: Model; settings?: ModelSettings; name: string }`; `reviewModel() => Model` (reads `LLM_REVIEW_MODEL`, defaults to `gemini-3.5-flash`, a different model than chat so the two do not share one free 15 RPM bucket); `sanitizeHistory(items: AgentInputItem[]): AgentInputItem[]`.

- [ ] **Step 1: Failing tests** in `src/lib/llm.test.ts` (ported cases) plus in `src/lib/agent.test.ts`:
```ts
test("sanitizeHistory drops reasoning items and keeps tool call/result pairs", () => {
  const items = [user("hi"), { type: "reasoning", content: [] }, { type: "function_call", callId: "c1", name: "find_slots", arguments: "{}" }, { type: "function_call_result", callId: "c1", name: "find_slots", output: { type: "text", text: "ok" } }, assistant("Here")] as AgentInputItem[];
  expect(sanitizeHistory(items).map((i) => ("type" in i ? i.type : i.role))).toEqual(["message", "function_call", "function_call_result", "message"]);
});
test("fallbackModel uses groq on 429", ...) // ported from portfolio llm.test.ts
```
- [ ] **Step 2:** `bun run test src/lib/llm.test.ts src/lib/agent.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Copy `llm.ts`. In `sara.ts` build the Agent lazily (`model`, `modelSettings` from `chatModel()`, like portfolio `run.ts:60-68`) so tests can set env first. `sanitizeHistory` filters `type === "reasoning"` and is applied inside `trimHistory` (every loader already calls it). Reviewer Agent gets `model: reviewModel()`.
- [ ] **Step 4:** Tests PASS; `bun run lint` clean.
- [ ] **Step 5:** Manual: `bun run dev`, `/chat/demo`, book a check-up end to end with `OPENAI_API_KEY` removed from the shell. Then set `GEMINI_API_KEY=bad` → Groq answers (log `[llm] primary failed, using fallback`).
- [ ] **Step 6:** Commit `feat: run Sara's text agent on free Gemini with Groq fallback`.

### Task 2: Voice-note transcription on Gemini
Skills: `ponytail`, `superpowers:test-driven-development`.

**Files:** Modify `src/lib/agent.ts:30-58`; Test `src/lib/agent.test.ts`. `bun add @google/genai` here (pin the portfolio's version).

**Interfaces:** Produces `transcribe(audio: Response | null): Promise<string | null>` (same signature as today).

- [ ] **Step 1: Failing test** `transcribe sends inline ogg audio to Gemini and returns text`: mock `GoogleGenAI.models.generateContent`, assert the request has `inlineData.mimeType === "audio/ogg"` and the prompt `"Transcribe this voice note word for word. It is English or Arabic. Output only the words."`, returns the mocked text. Keep the existing 3 MB test path returning `null`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Replace the OpenAI fetch with `generateContent({ model: process.env.LLM_TRANSCRIBE_MODEL ?? "gemini-3.5-flash-lite", contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: base64 } }, { text: PROMPT }] }] })`, `mimeType` from the response `content-type` header, default `audio/ogg`. Timeout 15 s via `AbortSignal.timeout`.
- [ ] **Step 4:** PASS. Commit `feat: transcribe WhatsApp voice notes with Gemini`.

### Task 3: Grounding so Sara never mis-dates or misses a slot
Skills: `ponytail`, `superpowers:test-driven-development`.

**Files:** Modify `src/lib/slots.ts`, `src/lib/sara.ts` (`buildInstructions`, `findSlots`), Test `src/lib/slots.test.ts`, `src/lib/sara.test.ts`.

**Interfaces:**
- Produces: `calendarLine(c: Clinic, now: Date, days = 14): string` → `"Sat 21 Nov = 2026-11-21 (open), Sun 22 Nov = 2026-11-22 (open), Fri 27 Nov = 2026-11-27 (closed)…"` from `c.hours`; `spokenWhen(date: string, time: string): string` → `"Saturday 21 November, 4:30 pm"`.
- `find_slots` result: each `days[i]` gains `label` (`"Saturday 21 November"`), each time stays `"HH:MM"` and a parallel `say: string[]` (`"4:30 pm"`). Web chat buttons keep reading `times` (no UI change).

- [ ] **Step 1: Failing tests:**
```ts
expect(spokenWhen("2026-11-21", "16:30")).toBe("Saturday 21 November, 4:30 pm");
expect(spokenWhen("2026-11-21", "09:00")).toBe("Saturday 21 November, 9 am");
expect(calendarLine(clinic, new Date("2026-11-18T08:00:00Z"))).toMatch(/^Wed 18 Nov = 2026-11-18/);
test("earliest searches the whole 60-day horizon", ...) // a clinic fully booked for 4 weeks still returns days in week 5
test("prompt lists dentist time off in the next 14 days", ...) // multi-dentist clinic with a time_off row → "Dr X away Sun 22 Nov"
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `buildInstructions` adds `Next 14 days: ${calendarLine(...)}` right after "Today is…" (end of prompt, keeps the cached prefix). Earliest search `days: HORIZON_DAYS` (one `busyFor` range query; CPU only). `find_slots` multi-date path: one `search(..., { from: minDate, days: span })` instead of one per date when dates are within 14 days (fewer DB round trips = lower voice latency). Time-off line: `buildInstructions` gets an optional `away: string[]` arg filled by the callers that already load the clinic (prompt only, no new tool). Prompt text: "Use the day labels from the tools and the calendar above; never work out a weekday yourself."
- [ ] **Step 4:** PASS + existing `sara.test.ts`, `booking.test.ts` green. Commit `feat: ground Sara on a 14-day calendar and spoken slot labels`.

### Task 4: Voice conversation design (prompt + phone safety)
Skills: `ponytail`, `superpowers:test-driven-development`, `conversational-ux`, `ux-writing`.

**Files:** Modify `src/lib/sara.ts` (`VOICE_TALK`, voice branch of `buildInstructions`, `voiceBook`), `src/lib/phone.ts`; Test `src/lib/sara.test.ts`, `src/lib/phone.test.ts`.

Voice prompt follows Google's Live best-practice order, voice branch only (text prompt untouched):
1. **Persona:** name, role, warm/calm/efficient, "English with a clear neutral accent; when the caller speaks Arabic, reply in clear Gulf-friendly Modern Standard Arabic", virtual-assistant honesty line.
2. **One-time steps:** greet once; learn the need; get name + mobile once (skip what is on file).
3. **Conversational loop:** the caller may move between booking, prices, hours, moving or cancelling as long as they like.
4. **Tool steps, one sentence each:** "To find times, say one short line like 'Let me check Saturday', then call find_slots. Offer at most three times using the `say` words." "When they pick a time, ask for name and mobile; they can say it or type it in the chat box below the call." "Read back name, number in groups of three, service and `label` time; call book with read_back_confirmed true only after yes." "If a tool says something failed, say sorry in one line and offer another time or the front desk." "When the caller says goodbye or has nothing else, say a warm goodbye, then call end_call."
5. **Guardrails:** existing rules + "Unmistakably: never say a time, price or booking result you did not get from a tool or the clinic info." "If you hear background talk not meant for you, ignore it."

**Interfaces:** `normUaePhone` gains Arabic-Indic digits (`٠-٩`, `۰-۹`) and spoken words are NOT parsed (the model writes digits). `voiceBook` adds `foreign_number_confirmed: boolean`.

- [ ] **Step 1: Failing tests:**
```ts
expect(normUaePhone("٠٥٠ ١٢٣ ٤٥٦٧")).toBe("971501234567");
test("voiceBook rejects non-UAE number unless foreign_number_confirmed", async () => { /* returns "Not booked. That is not a UAE mobile…" */ });
test("voice prompt tells caller they can type the number", () => expect(buildInstructions(c, null, "voice", now)).toContain("type it in the chat box"));
test("voice prompt never says 'never say type'", ...)
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat: voice prompt in Live best-practice order, safer phone capture`.

### Task 5: Voice server on Gemini Live
Skills: `ponytail`, `superpowers:test-driven-development`. Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/preferredRegion.md` first.

**Files:**
- Create: `src/lib/voice.ts` (port of portfolio `server/voice.ts`), `src/app/api/voice/route.test.ts`
- Modify: `src/app/api/voice/route.ts` (rewrite body, keep checks), `src/app/api/voice/tool/route.ts` (timeout), `src/lib/sara.ts` (`toolSchemas` → Gemini declarations, `end_call`)

**Interfaces:**
- Produces: `voiceSession(clinic: Clinic, patient: { id; name; phone }, history: AgentInputItem[]): { model: string; config: LiveConnectConfig }`; `mintToken(session, now?): Promise<string>` (one use, `newSessionExpireTime` +60 s, `expireTime` = `MAX_MS` + 30 s); `liveTools(): FunctionDeclaration[]` (reads `find_slots`, `my_appointments` → `NON_BLOCKING`; writes `book`, `cancel`, `reschedule`, `confirm_visit`, `handoff_to_staff` → `BLOCKING`; `end_call` no params); `READ_TOOLS: Set<string>` exported for the client.
- `POST /api/voice` body `{ slug, visitorId, test?, resume?: boolean }` → `{ token, model }` | `{ error: "busy" | "paused" | "unavailable" }`. `resume: true` requires `inCall(patient.id)`, skips the call count and `logEvent("call")`, limited by `allow("call-resume:<patient>", 5, 600)`.
- Session config = Task 0 results: voice `GEMINI_LIVE_VOICE ?? "Sulafat"`, transcription both ways, VAD `START_SENSITIVITY_LOW` + `END_SENSITIVITY_HIGH`, `silenceDurationMs: 500`, `prefixPaddingMs: 200`, `sessionResumption: {}`, affective dialog + proactive audio (if Task 0 accepted). Instructions = `buildInstructions(…, "voice")` + `spokenHistory` + "Quick options at call start" (earliest 2 days × 2 times per service from the existing `find_slots(service null)` code path, run in parallel with the other mint queries; prompt: "use these to answer 'when is the earliest' instantly; book re-checks").
- `export const preferredRegion` on `/api/voice`, `/api/voice/tool`, `/api/voice/turn`, `/api/chat` = the Vercel region nearest the Supabase project's region (check region in Supabase dashboard; `dxb1` only if Supabase is in me-central).

- [ ] **Step 1: Failing tests** (mock `mintToken`, `db`, `allow`, like portfolio `routes.test.ts`):
  - `returns { token, model } and logs one call`
  - `mint 429 returns busy` (mint throws `{ status: 429 }` → 429 `{ error: "busy" }`)
  - `resume does not log a call and needs a live call` (no recent `call` event → 429)
  - `paused chat returns 409`
  - `call-all cap returns busy`
  - `tool route times out with spoken fallback` (`runTool` never resolves → after 8 s JSON `{ output }` containing "taking longer")
  - `liveTools marks reads NON_BLOCKING and writes BLOCKING`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Delete the OpenAI fetch, `sdp` field, `OPENAI_REALTIME_*` reads.
- [ ] **Step 4:** PASS. Commit `feat: voice calls on Gemini Live with server-minted one-use tokens`.

### Task 6: Voice client: smooth, never stuck
Skills: `ponytail`, `superpowers:test-driven-development`, `interfaces-that-feel`.

**Files:**
- Create: `src/lib/liveAudio.ts` + `src/lib/liveAudio.test.ts` (copies of portfolio `client/liveAudio.*`)
- Modify: `src/app/chat/[slug]/call.tsx` (rewrite `useCall`, keep `CallBar`), `src/app/chat/[slug]/chat.tsx:348-356, 524-540`

**Interfaces:**
- Consumes: `/api/voice` (Task 5), `READ_TOOLS`, `CAPTURE_WORKLET`, `OUT_RATE`, `base64ToFloat32`, `int16ToBase64`, `echoSafeOutput`.
- Produces: `useCall(o)` returns `{ state, error, speaking, muted, startedAt, start(ctx?: AudioContext), end, toggleMute, say(text: string) }` (adds `say`); pure helpers `scheduling(name: string): "WHEN_IDLE" | undefined` and `shouldNudge(s: { callerDoneAt: number; lastModelAt: number; toolsInFlight: number; now: number }): boolean` (true when caller finished ≥ 4000 ms ago, model silent since, no tool running).

Port from portfolio `useCall.ts`, keeping: token + SDK import + mic in parallel; `AudioContext` created inside the click handler (iOS); AudioWorklet 16 kHz capture; gapless 24 kHz playback; `flush()` on `serverContent.interrupted`; transcripts → `/api/voice/turn` in order, emergency `say` flushes and forces the fixed reply; tool calls → `/api/voice/tool` with `AbortSignal.timeout(10_000)`, `toolCallCancellation` respected, reads answered with `scheduling: WHEN_IDLE`, writes batched in one `sendToolResponse`; `end_call` waits for the goodbye audio (max 8 s); idle 45 s; max 8 min; tab hidden 30 s; connect timeout 15 s; SDK preloaded 1.5 s after the chat opens. Skip: site tools, Urdu swap, cards, brief.

New for "never stuck":
- **Resume:** keep the latest `sessionResumptionUpdate.newHandle`. On `goAway` or an unexpected close while live: mint with `resume: true`, reconnect with `sessionResumption: { handle }`, keep mic/playback running, no greeting. One retry; second failure → hang up with "The call dropped. You can keep typing here."
- **Silence watchdog:** every 1 s check `shouldNudge`; on true send `sendClientContent({ turns: [{ role: "user", parts: [{ text: "(The caller is waiting for your answer.)" }] }], turnComplete: true })` once per caller turn.
- **Typing during a call:** composer stays visible under `CallBar`; submit calls `call.say(text)` → `sendClientContent` + `/api/voice/turn` + thread bubble (not `/api/chat`).
- **Call metrics:** at hang up `useCall` sends `{ connectMs, firstAudioMs[], toolMs[], endReason, resumes, nudges }` to `POST /api/voice/end` (new 15-line route: same checks as `/turn`, `logEvent(kind: "call_metrics", summary: JSON)`), with `keepalive: true`.

- [ ] **Step 1: Failing tests** (`call.test.ts` for pure helpers + copied `liveAudio.test.ts`):
```ts
expect(scheduling("find_slots")).toBe("WHEN_IDLE"); expect(scheduling("book")).toBeUndefined();
expect(shouldNudge({ callerDoneAt: 0, lastModelAt: 0, toolsInFlight: 0, now: 4000 })).toBe(true);
expect(shouldNudge({ callerDoneAt: 0, lastModelAt: 0, toolsInFlight: 1, now: 9000 })).toBe(false);
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS, lint clean.
- [ ] **Step 5: Browser check** (preview tools, `bun run dev`): `/chat/demo` → Call Sara → greeting plays; book by voice; type the number mid-call; laptop speakers do not make Sara interrupt herself; DevTools network: WebSocket to `generativelanguage.googleapis.com`, no `api.openai.com`; `agent_events` gets one `call` + one `call_metrics` row.
- [ ] **Step 6:** Commit `feat: Gemini Live call client with resume, silence watchdog and typing`.

### Task 7: Text-channel smoothness
Skills: `ponytail`, `superpowers:test-driven-development`.

**Files:** Modify `src/lib/sara.ts` (prompt text rules), `src/lib/agent.ts` (timing log), Test `src/lib/sara.test.ts`.

- [ ] **Step 1:** Restructure the text prompt in the same Google order (persona → one-time steps → loop → tool steps → guardrails) without changing rules; snapshot test that every existing rule line is still present (guards against dropping rules in the reorder).
- [ ] **Step 2:** `[timing]` log gains `model=<llm.name> fallback=<bool>`; web `/api/chat` logs the same line.
- [ ] **Step 3:** PASS. Commit `refactor: order Sara's text prompt like the voice prompt`.

### Task 8: Evals (the gate for "9/10")
Skills: `ponytail`, `write-evals`, `superpowers:verification-before-completion`. **Ask the owner before the first run: evals write test bookings into the live DB on the `demo` clinic (purged by `purgeDemo` after 6 h).**

**Files:** Create `src/lib/sara.evals.test.ts`, `src/lib/voice.evals.test.ts`, `docs/evals/2026-11-18-sara.eval.md` (checklist). Run only with `SARA_EVAL=1` (skipped in `bun run test`), paced for the free 15 RPM like portfolio `paced()`.

Text cases (multi-turn, assert tool calls + DB row): 1 book check-up tomorrow; 2 "earliest" with a 4-week-full clinic; 3 Arabic booking; 4 Arabizi; 5 split message pieces; 6 reschedule; 7 cancel with move offer; 8 two visits (family) via `book_many`; 9 off-topic decline (no handoff); 10 emergency phrase → fixed reply; 11 "is it covered by Daman?" → never confirms; 12 "next Tuesday" → correct date; 13 reminder reply "1" → `confirm_visit`; 14 staff handback marker continues the plan.
Voice cases (text in, audio out, transcripts asserted, real Live session from `voiceSession`): 1 book with read-back; 2 caller corrects the number at read-back; 3 typed number mid-call; 4 Arabic booking; 5 "earliest" answered from quick options then booked; 6 slot taken between offer and book → offers others; 7 tool failure → apology + handoff offer; 8 goodbye → `end_call`; 9 interruption mid-list → answers the new question; 10 background chatter → no reply (proactive audio).
- [ ] Pass bar: text ≥ 13/14, voice ≥ 9/10, zero invented times, zero bookings without read-back. Record scores in `docs/evals/…md`. Failing cases → fix prompt/tool, rerun; flaky (passes 2 of 3) noted.
- [ ] Commit `test: Sara text and voice evals on free Gemini`.

### Task 9: Docs, env, cleanup
Skills: `ponytail`, `superpowers:finishing-a-development-branch`.

- [ ] Update `receptionist/CLAUDE.md`: Decisions (AI line), "Voice call" section rewritten for Gemini Live, env list, free-tier privacy note, eval command, latency targets. Remove `OPENAI_*` mentions. Add a privacy line under the call button: "Calls use Google AI. Please don't share medical details." (`ux-writing`).
- [ ] Vercel env: owner adds `GEMINI_API_KEY`, `GROQ_API_KEY`, `LLM_FALLBACK_PROVIDER=groq` (owner action; never commit keys).
- [ ] `bun run test`, `bun run lint`, `bun run build` green. Commit on `dev` only when the owner asks.

### Task 10 (optional, needs owner go): Manage visits booked elsewhere
Web/voice visitors cannot see visits booked on WhatsApp or at the desk (`my_appointments` note). Fix: `verify_phone` tool sends a 4-digit code to the patient's WhatsApp from the clinic number (existing `sendText`, rate limit `allow("otp:<phone>", 3, 3600)`), `confirm_code` links the web patient to the existing row (store code hash + expiry in `conversations` JSON, no migration). Untestable on `demo` (no WhatsApp creds): test on Good Shine. Separate plan if approved.

---

## Things you did not ask for but should follow (built into the tasks)
- **Measure before tuning latency** (Task 6 metrics + targets table). Gut feel lies; p90 first-audio is the number that makes a call feel human.
- **Reads async, writes blocking** (Task 5): Sara keeps talking while slots load, but never says "booked" before the DB says so.
- **Deterministic code for what models get wrong:** weekdays, dates, spoken times, phone digits (Tasks 3, 4). Cheaper and more reliable than a smarter model.
- **Region pinning** (Task 5): every Supabase query from a far Vercel region adds ~100 ms; a booking turn does 4-6.
- **Separate free quotas per job** (Task 1): chat, reviewer and transcription on different models so one burst cannot 429 the others.
- **Resumable sessions** (Task 6): Google resets Live connections about every 10 min and on blips; without resume a call just dies.
- **Evals as the release gate** (Task 8): free models change without notice; the suite tells you the day one gets worse.
- **Privacy:** free tier trains on data. Demo only; a paying clinic gets a paid key (env only) before any real patient talks to Sara.
- **Later, not now:** real phone numbers (SIP/Twilio into Live), cross-channel identity (Task 10), summarised long histories.

## Verification (end to end)
1. `bun run test` + `bun run lint` + `bun run build` green; `SARA_EVAL=1` evals meet the pass bar.
2. `/chat/demo` typed booking on Gemini; with `GEMINI_API_KEY=bad`, Groq answers.
3. WhatsApp voice note via local tunnel is understood (point UltraMsg back to prod after).
4. Voice: book by voice, type the number mid-call, say an emergency phrase → fixed 998 reply; kill Wi-Fi 2 s mid-call → call resumes.
5. `select summary from agent_events where kind = 'call_metrics' order by created_at desc limit 10` → p50 first audio ≤ 1.0 s.
6. DevTools: zero requests to `api.openai.com`.
