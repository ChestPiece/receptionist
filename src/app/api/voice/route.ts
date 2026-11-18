// Web voice call, step 1: mint a one-use Gemini Live token for this visitor. The browser connects to Google with it;
// the API key, Sara's prompt and the tool definitions stay locked inside the token. Tools run in /api/voice/tool.
import type { AgentInputItem } from "@openai/agents";
import { z } from "zod";
import { stillPaused } from "@/lib/agent";
import { clinicBySlug } from "@/lib/clinics";
import { allow, db } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { ipOf, inCall, findVisitor, overRateLimit, sameOrigin, upsertVisitor } from "@/lib/visitor";
import { MAX_MS, mintToken, quickOptions, voiceSession } from "@/lib/voice";

<<<<<<< HEAD
=======
// Full model: better at remembering what the caller said and at tool use. Set OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini to A/B.
const MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1";
>>>>>>> f9d7af60a6f351d80fadeacea13386f8370a0d44
const CALLS_PER_HOUR = 3;

// resume = the session handle Gemini gave the browser; it reconnects to the same call after a drop.
const Body = z.object({ slug: z.string().max(64), visitorId: z.uuid(), test: z.boolean().optional(), resume: z.string().min(1).max(4_096).optional() });

const busy = () => Response.json({ error: "busy" }, { status: 429 });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("forbidden", { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const { slug, visitorId, test, resume } = parsed.data;
  const clinic = await clinicBySlug(slug);
  if (!clinic?.active) return new Response("not found", { status: 404 });

<<<<<<< HEAD
  let session;
  let end: number | undefined;
  let logCall: () => Promise<unknown> = async () => {};
  if (resume) {
    // Same call, new connection: no new call counted or logged, but only inside a live call and a few times.
    // The new token ends when the original call's 8 minutes end, so resuming never stretches a call.
    const patient = await findVisitor(clinic, visitorId);
    const startedAt = patient && (await inCall(patient.id));
    end = startedAt ? Date.parse(startedAt) + MAX_MS : 0;
    if (!patient || end - Date.now() < 10_000 || !(await allow(`call-resume:${patient.id}`, 5, 600))) return busy();
    session = voiceSession(clinic, patient, [], { handle: resume });
  } else {
    // Free Live quota is shared by every clinic: cap per IP, per clinic and for the whole deployment, not only per visitor.
    const caps = await Promise.all([allow(`call-ip:${ipOf(req)}`, 6, 3600), allow(`call-clinic:${clinic.id}`, 60, 3600), allow("call-all", 100, 86_400)]);
    if (caps.includes(false)) return busy();
    const sb = db();
    const patient = await upsertVisitor(clinic, visitorId, test);
    const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const [limited, { count: calls }, { data: convo }, quick] = await Promise.all([
      overRateLimit(patient.id),
      sb.from("agent_events").select("id", { count: "exact", head: true }).eq("patient_id", patient.id).eq("kind", "call").gt("created_at", hourAgo),
      sb.from("conversations").select("history, bot_paused, updated_at").eq("patient_id", patient.id).maybeSingle(),
      quickOptions(clinic, patient),
    ]);
    if (limited || (calls ?? 0) >= CALLS_PER_HOUR) return busy();
    if (stillPaused(convo)) return Response.json({ error: "paused" }, { status: 409 });
    session = voiceSession(clinic, patient, (convo?.history ?? []) as AgentInputItem[], { quick });
    logCall = () => logEvent(sb, { clinicId: clinic.id, patientId: patient.id, actor: "sara", kind: "call", summary: `Web call started with ${patient.name ?? "a visitor"}` });
=======
  // Realtime minutes are the costliest thing here: cap per IP and per clinic too, not only per visitor id.
  const [ipOk, clinicOk] = await Promise.all([allow(`call-ip:${ipOf(req)}`, 6, 3600), allow(`call-clinic:${clinic.id}`, 60, 3600)]);
  if (!ipOk || !clinicOk) return Response.json({ error: "busy" }, { status: 429 });
  const sb = db();
  const patient = await upsertVisitor(clinic, visitorId, test);
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const [limited, { count: calls }, { data: convo }] = await Promise.all([
    overRateLimit(patient.id),
    sb.from("agent_events").select("id", { count: "exact", head: true }).eq("patient_id", patient.id).eq("kind", "call").gt("created_at", hourAgo),
    sb.from("conversations").select("history, bot_paused, updated_at").eq("patient_id", patient.id).maybeSingle(),
  ]);
  if (limited || (calls ?? 0) >= CALLS_PER_HOUR) return Response.json({ error: "busy" }, { status: 429 });
  if (stillPaused(convo)) return Response.json({ error: "paused" }, { status: 409 });

  const earlier = spokenHistory(trimHistory((convo?.history ?? []) as AgentInputItem[]));
  const instructions = buildInstructions(clinic, patient.name, "voice", new Date(), patient.phone) + (earlier ? `\n\nEarlier in this chat (typed or on an earlier call):\n${earlier}` : "");
  const session = {
    type: "realtime",
    model: MODEL,
    instructions,
    tools: toolSchemas(),
    tool_choice: "auto",
    reasoning: { effort: "low" }, // reasoning tokens were the main delay in the spike
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: { model: "gpt-4o-mini-transcribe" }, // for the transcript; the model hears the audio itself
        // semantic_vad waits when the caller sounds unfinished. "auto" (medium) left long gaps before replies; "high" answers sooner.
        // If callers get cut off while saying a phone number, go back to "auto".
        turn_detection: { type: "semantic_vad", eagerness: "high", create_response: true, interrupt_response: true },
      },
      output: { voice: process.env.OPENAI_REALTIME_VOICE ?? "marin" },
    },
  };
  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(session));
  const res = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  if (!res.ok) {
    console.error("[voice]", res.status, (await res.text()).slice(0, 300));
    return Response.json({ error: "unavailable" }, { status: 502 });
>>>>>>> f9d7af60a6f351d80fadeacea13386f8370a0d44
  }
  let token;
  try {
    token = await mintToken(session, Date.now(), end);
  } catch (e) {
    console.error("[voice] mint failed:", (e as Error).message);
    return (e as { status?: number }).status === 429 ? busy() : Response.json({ error: "unavailable" }, { status: 502 });
  }
  await logCall(); // after the mint: a failed mint is not a call, and the tool route's inCall() needs this row
  return Response.json({ token, model: session.model });
}
