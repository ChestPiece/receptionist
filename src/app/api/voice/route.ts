// Web voice call, step 1: create the OpenAI realtime call for this visitor. The browser sends its WebRTC offer and gets
// the answer back; the API key, Sara's prompt and the tool definitions stay on the server. Tools run in /api/voice/tool.
import type { AgentInputItem } from "@openai/agents";
import { z } from "zod";
import { spokenHistory, stillPaused, trimHistory } from "@/lib/agent";
import { clinicBySlug } from "@/lib/clinics";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { buildInstructions, toolSchemas } from "@/lib/sara";
import { overRateLimit, sameOrigin, upsertVisitor } from "@/lib/visitor";

const MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1-mini";
const CALLS_PER_HOUR = 3;

const Body = z.object({ slug: z.string().max(64), visitorId: z.uuid(), test: z.boolean().optional(), sdp: z.string().min(1).max(20_000) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("forbidden", { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const { slug, visitorId, test, sdp } = parsed.data;
  const clinic = await clinicBySlug(slug);
  if (!clinic?.active) return new Response("not found", { status: 404 });

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
        // semantic_vad waits when the caller sounds unfinished, so "hm" or a pause mid-sentence does not trigger a reply
        turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true },
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
  }
  await logEvent(sb, { clinicId: clinic.id, patientId: patient.id, actor: "sara", kind: "call", summary: `Web call started with ${patient.name ?? "a visitor"}` });
  return new Response(await res.text(), { headers: { "Content-Type": "application/sdp" } });
}
