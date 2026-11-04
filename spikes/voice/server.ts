// Voice phase 0 spike (throwaway). Compares two ways to give Sara a voice, from a local browser page:
//   A "live":     GPT-Live speaks; every delegation runs the existing text Sara (runSara) on this server.
//   B "realtime": gpt-realtime-2.1-mini speaks and calls Sara's tools itself.
// Run from the repo root: bun spikes/voice/server.ts, then open http://127.0.0.1:8787
// It writes to the LIVE Supabase project (a test patient flagged is_test, plus any visits booked) and makes paid OpenAI calls.
// Each call's events and timings go to spikes/voice/runs/<id>.jsonl.
import { mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assistant, system, user, type AgentInputItem } from "@openai/agents";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { splitChips } from "../../src/lib/chips";
import { clinicBySlug, type Clinic } from "../../src/lib/clinics";
import { db } from "../../src/lib/db";
import { emergencyReply, isEmergency } from "../../src/lib/safety";
import { buildInstructions, runSara, voiceTools, wroteData } from "../../src/lib/sara";

// No @types/bun in this repo, and next build type-checks this folder too.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Bun: any;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const KEY = process.env.OPENAI_API_KEY!;
const AUTH = { Authorization: `Bearer ${KEY}` };
const SLUG = process.env.SPIKE_CLINIC ?? "good-shine";
const VOICE = process.env.SPIKE_VOICE ?? "marin";
const LIVE_MODEL = process.env.OPENAI_LIVE_MODEL ?? "gpt-live-1";
const RT_MODEL = process.env.SPIKE_RT_MODEL ?? "gpt-realtime-2.1-mini";
const RT_EFFORT = (process.env.SPIKE_RT_EFFORT ?? "low") as "minimal" | "low" | "medium";
const MAX_MS = 8 * 60_000;
const SARA_TIMEOUT_MS = 10_000;
const RUNS = fileURLToPath(new URL("./runs/", import.meta.url));
mkdirSync(RUNS, { recursive: true });

// Sara's web prompt says times show as buttons; on a call nothing shows. Sent with each run, not saved to history.
const VOICE_RULES =
  "Voice call: the caller hears you and sees nothing. Always say the free times in words, at most three. No markdown, lists, links or chips. Short spoken sentences. Read back names, dates and phone numbers before booking.";

type Call = { id: string; mode: "live" | "realtime"; t0: number; listeners: Set<(line: string) => void>; close: () => void };
const calls = new Map<string, Call>();

function logger(call: Call) {
  return (kind: string, data: Record<string, unknown> = {}) => {
    const line = JSON.stringify({ t: Math.round(performance.now() - call.t0), kind, ...data });
    appendFileSync(`${RUNS}${call.id}.jsonl`, line + "\n");
    for (const send of call.listeners) send(line);
  };
}

async function testPatient(clinic: Clinic) {
  const { data, error } = await db()
    .from("patients")
    .upsert({ clinic_id: clinic.id, web_visitor_id: crypto.randomUUID(), is_test: true }, { onConflict: "clinic_id,web_visitor_id" })
    .select("id, name, phone")
    .single();
  if (error) throw error;
  return data as { id: string; name: string | null; phone: string | null };
}

const livePrompt = (c: Clinic) => `You are Sara, the receptionist at ${c.name}, a dental clinic in the UAE, on a voice call from the clinic website.
Speak the caller's language: English, or Arabic (Gulf dialect is fine). Switch when they switch.
You know nothing about the clinic yourself. Delegate everything about the clinic: services, prices, hours, location, insurance, free times, booking, cancelling, moving visits, and any name or phone number the caller gives.
Say only what the delegated result tells you. Never invent times, prices or results. Never say a visit is booked, moved or cancelled unless the result says so. Do not guess while waiting; a short "one moment" is fine.
Keep each turn short. No medical advice. If asked, say you are the clinic's virtual assistant.`;

// ---------- A: GPT-Live + client delegation to text Sara ----------
async function startLive(call: Call, clinic: Clinic, sdp: string) {
  const log = logger(call);
  const res = await fetch("https://api.openai.com/v1/live/sessions", {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: { model: LIVE_MODEL, instructions: livePrompt(clinic), audio: { output: { voice: VOICE } }, delegation: { type: "client" } },
      transport: { type: "webrtc", sdp },
    }),
  });
  if (!res.ok) throw new Error(`live session ${res.status}: ${await res.text()}`);
  const created = (await res.json()) as { session: { id: string }; transport: { sdp: string } };
  const sessionId = created.session.id;
  log("session.created", { sessionId });

  let patient = await testPatient(clinic);
  log("patient", { id: patient.id });
  let history: AgentInputItem[] = [];
  let heard = ""; // caller words since the last delegation
  let heardEndMs = 0;
  let latest = 0;
  let speakSentAt = 0; // perf time of the last commentary, to time when GPT-Live starts saying it

  const ws = new WebSocket(`wss://api.openai.com/v1/live/sessions/${sessionId}/attach`, { headers: AUTH } as unknown as string[]);
  const send = (e: Record<string, unknown>) => ws.send(JSON.stringify({ event_id: crypto.randomUUID(), ...e }));
  const speak = (delegationId: string | null, content: string) => {
    send({ type: "session.commentary.append", delegation_id: delegationId, content });
    speakSentAt = performance.now();
  };

  ws.onopen = () => {
    log("sideband.open");
    speak(null, `Greet the caller: "Hi, this is Sara from ${clinic.name}. How can I help?"`);
  };
  ws.onclose = (e) => log("sideband.closed", { code: e.code, reason: e.reason });
  ws.onerror = () => log("sideband.error");

  async function delegate(delegationId: string, offsetMs: number) {
    const seq = ++latest;
    const at = performance.now();
    if (!heard.trim()) await sleep(400); // the transcript can trail the delegation event
    const said = heard.trim();
    heard = "";
    log("delegation", { delegationId, offsetMs, heardEndMs, gapMs: offsetMs - heardEndMs, said });
    if (!said) return speak(delegationId, "You did not catch that. Ask the caller to repeat.");

    if (isEmergency(said)) {
      const reply = emergencyReply(said, clinic.phone);
      history.push(user(said), assistant(reply));
      log("emergency", { reply });
      return speak(delegationId, `Say exactly: ${reply}`);
    }

    const input = [...history, system(VOICE_RULES), user(said)];
    try {
      const result = await Promise.race([
        runSara(clinic, patient, null, input),
        sleep(SARA_TIMEOUT_MS).then(() => null),
      ]);
      const saraMs = Math.round(performance.now() - at);
      if (!result) {
        log("sara.timeout", { delegationId, saraMs });
        return speak(delegationId, "Say you could not check that just now, and offer to have the front desk call back.");
      }
      const reply = splitChips(result.finalOutput ?? "").text;
      const tools = result.newItems.filter((i) => i.type === "tool_call_item").map((i) => ("name" in i.rawItem ? i.rawItem.name : "?"));
      log("sara", { delegationId, saraMs, tools, reply, usage: result.state.usage });
      history = [...history, ...result.history.slice(input.length - 1)]; // keeps user(said) and the run's items, drops VOICE_RULES
      if (seq !== latest && !wroteData(result.newItems)) return log("stale.dropped", { delegationId });
      speak(delegationId, reply);
      const { data } = await db().from("patients").select("id, name, phone").eq("id", patient.id).single(); // save_contact may have filled them
      if (data) patient = data;
    } catch (e) {
      log("sara.error", { delegationId, message: (e as Error).message });
      speak(delegationId, "Say something went wrong on your side and offer a call back from the front desk.");
    }
  }

  ws.onmessage = (m) => {
    const e = JSON.parse(String(m.data));
    switch (e.type) {
      case "session.input_transcript.delta":
        heard += e.delta;
        heardEndMs = e.end_ms ?? heardEndMs;
        log("in", { text: e.delta, start_ms: e.start_ms, end_ms: e.end_ms });
        break;
      case "session.output_transcript.delta":
        if (speakSentAt) {
          log("speaking", { afterCommentaryMs: Math.round(performance.now() - speakSentAt) });
          speakSentAt = 0;
        }
        log("out", { text: e.delta, start_ms: e.start_ms });
        break;
      case "session.delegation.created":
        void delegate(e.delegation.id, e.offset_ms);
        break;
      default:
        log(e.type, e.type === "error" || e.type.startsWith("session.") ? e : {});
    }
  };

  call.close = () => {
    try {
      send({ type: "session.close" });
    } catch {}
    setTimeout(() => ws.close(), 500);
  };
  return { id: call.id, sdp: created.transport.sdp };
}

// ---------- B: Realtime model with Sara's tools ----------
async function startRealtime(call: Call, clinic: Clinic, sdp: string) {
  const log = logger(call);
  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify({ type: "realtime", model: RT_MODEL, audio: { output: { voice: VOICE } } }));
  const res = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: AUTH, body: form });
  if (!res.ok) throw new Error(`realtime call ${res.status}: ${await res.text()}`);
  const callId = res.headers.get("Location")?.match(/calls\/(rtc_[^/?]+)/)?.[1];
  if (!callId) throw new Error("no call id in Location header");
  const answer = await res.text();
  log("call.created", { callId });

  const patient = await testPatient(clinic);
  log("patient", { id: patient.id });
  const agent = new RealtimeAgent({
    name: "Receptionist",
    instructions: buildInstructions(clinic, patient.name, "voice", new Date(), patient.phone),
    tools: voiceTools as never, // same tool objects as text Sara; the context below has the fields they read
  });
  const session = new RealtimeSession(agent, {
    model: RT_MODEL,
    transport: "websocket",
    config: {
      reasoning: { effort: RT_EFFORT }, // reasoning tokens were the main delay in the first run (up to 428 per turn)
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" }, // log only; the model hears the audio itself
          noiseReduction: { type: "near_field" },
          // semantic_vad waits when the caller sounds unfinished, so "hm" or a pause mid-sentence does not trigger a reply
          turnDetection: { type: "semantic_vad", eagerness: "auto", createResponse: true, interruptResponse: true },
        },
        output: { voice: VOICE },
      },
    },
    context: { clinic, channel: "voice", patientId: patient.id, patientName: patient.name, patientPhone: patient.phone, waId: null } as never,
  });

  let stoppedAt = 0;
  session.on("transport_event", (e: { type: string; [k: string]: unknown }) => {
    switch (e.type) {
      case "input_audio_buffer.speech_stopped":
        stoppedAt = performance.now();
        log("speech_stopped");
        break;
      case "conversation.item.input_audio_transcription.completed":
        log("in", { text: e.transcript });
        break;
      case "response.output_audio_transcript.delta":
        if (stoppedAt) {
          log("speaking", { afterSpeechStopMs: Math.round(performance.now() - stoppedAt) });
          stoppedAt = 0;
        }
        break;
      case "response.output_audio_transcript.done":
        log("out", { text: e.transcript });
        break;
      case "response.done":
        log("response.done", { usage: (e.response as { usage?: unknown })?.usage });
        break;
      case "error":
        log("error", e);
        break;
    }
  });
  session.on("agent_tool_start", (_c, _a, tool) => log("tool.start", { name: tool.name }));
  session.on("agent_tool_end", (_c, _a, tool, result) => log("tool.end", { name: tool.name, result: String(result).slice(0, 300) }));
  session.on("error", (e) => log("session.error", { message: String((e as { error?: unknown }).error ?? e) }));
  log("config", { model: RT_MODEL, effort: RT_EFFORT, vad: "semantic_vad auto" });
  session.connect({ apiKey: KEY, callId } as never).then(
    () => log("sideband.open"),
    (e) => log("sideband.error", { message: (e as Error).message }),
  );

  call.close = () => session.close();
  return { id: call.id, sdp: answer };
}

// ---------- HTTP ----------
Bun.serve({
  hostname: "127.0.0.1",
  port: 8787,
  idleTimeout: 0, // SSE streams stay open
  async fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response(Bun.file(new URL("./index.html", import.meta.url)));

    if (url.pathname === "/session" && req.method === "POST") {
      const mode = url.searchParams.get("mode") === "realtime" ? "realtime" : "live";
      const clinic = await clinicBySlug(SLUG);
      if (!clinic) return new Response(`no clinic ${SLUG}`, { status: 404 });
      const call: Call = { id: `${mode}-${Date.now()}`, mode, t0: performance.now(), listeners: new Set(), close: () => {} };
      calls.set(call.id, call);
      try {
        const out = await (mode === "live" ? startLive : startRealtime)(call, clinic, await req.text());
        setTimeout(() => endCall(call.id, "max_minutes"), MAX_MS);
        return Response.json(out);
      } catch (e) {
        calls.delete(call.id);
        console.error("[spike]", (e as Error).message);
        return new Response((e as Error).message, { status: 502 });
      }
    }

    if (url.pathname === "/events") {
      const call = calls.get(url.searchParams.get("id") ?? "");
      if (!call) return new Response("no call", { status: 404 });
      let listener: (line: string) => void;
      const stream = new ReadableStream({
        start(c) {
          listener = (line) => c.enqueue(`data: ${line}\n\n`);
          call.listeners.add(listener);
        },
        cancel: () => void call.listeners.delete(listener),
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    if (url.pathname === "/end" && req.method === "POST") {
      endCall(url.searchParams.get("id") ?? "", "hangup");
      return new Response("ok");
    }
    return new Response("not found", { status: 404 });
  },
});

function endCall(id: string, reason: string) {
  const call = calls.get(id);
  if (!call) return;
  logger(call)("call.end", { reason });
  call.close();
  calls.delete(id);
}

console.log(`voice spike on http://127.0.0.1:8787 (clinic ${SLUG}, voice ${VOICE}); logs in ${RUNS}`);
