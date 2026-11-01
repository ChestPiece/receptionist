// The web chat channel: streams Sara's reply (text plus tool calls) to the AI SDK useChat client.
import { assistant, user, type AgentInputItem } from "@openai/agents";
import { createAiSdkUiMessageStreamResponse } from "@openai/agents-extensions/ai-sdk-ui";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { capText, RATE_MAX, RATE_WINDOW_MS, slowDown, sorry, stillPaused, trimHistory } from "@/lib/agent";
import { clinicBySlug } from "@/lib/clinics";
import { db, logMessages, logUsage } from "@/lib/db";
import { reviewAndLog } from "@/lib/reviewer";
import { emergencyReply, isEmergency } from "@/lib/safety";
import { streamSara } from "@/lib/sara";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 60;

// The client sends only its newest message; the history lives server side (conversations.history), like WhatsApp.
const Body = z.object({
  slug: z.string().max(64),
  visitorId: z.uuid(),
  test: z.boolean().optional(),
  message: z.object({ role: z.literal("user"), parts: z.array(z.object({ type: z.string(), text: z.string().optional() })) }),
});

// A fixed reply in the same stream format, for answers the model must not write (emergency, rate limit, errors).
const fixed = (text: string) =>
  createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "text-start", id: "fixed" });
        writer.write({ type: "text-delta", id: "fixed", delta: text });
        writer.write({ type: "text-end", id: "fixed" });
      },
    }),
  });

// ?test=1 counts only for a signed-in member of this clinic or a platform admin (RLS lets them read the clinic row); anyone else is a normal visitor.
async function isStaffOf(clinicId: string) {
  try {
    const { data } = await (await supabaseServer()).from("clinics").select("id").eq("id", clinicId).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

const HELD = "Our front desk has your chat and will reply here shortly.";

export async function POST(req: Request) {
  // ponytail: same-origin only while the chat page is ours; the embeddable widget (P1) checks clinic.allowed_origins.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return new Response("forbidden", { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const { slug, visitorId, message, test } = parsed.data;
  const text = capText(message.parts.map((p) => (p.type === "text" ? (p.text ?? "") : "")).join("\n").trim());
  if (!text) return new Response("empty message", { status: 400 });

  const clinic = await clinicBySlug(slug);
  if (!clinic?.active) return new Response("not found", { status: 404 });

  const sb = db();
  const { data: patient, error } = await sb
    .from("patients")
    .upsert({ clinic_id: clinic.id, web_visitor_id: visitorId, ...(test && (await isStaffOf(clinic.id)) ? { is_test: true } : {}) }, { onConflict: "clinic_id,web_visitor_id" })
    .select("id, name, phone")
    .single();
  if (error) throw error;

  // ponytail: per visitor id only; a script rotating ids gets past it. Add a per-IP limit before the widget goes on real sites.
  const { count } = await sb
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patient.id)
    .eq("role", "patient")
    .gt("created_at", new Date(Date.now() - RATE_WINDOW_MS).toISOString());
  if ((count ?? 0) >= RATE_MAX) return fixed(slowDown(clinic.phone));

  const { data: convo } = await sb.from("conversations").select("history, bot_paused, updated_at").eq("patient_id", patient.id).maybeSingle();
  const saved = (convo?.history ?? []) as AgentInputItem[];
  const paused = stillPaused(convo);
  // While staff own the chat, updated_at stays put so the 30-min pause can lapse (same as agent.ts).
  const save = async (history: AgentInputItem[], reply: string | undefined) => {
    await logMessages(clinic.id, patient.id, "web", [{ role: "patient", body: text }, ...(reply ? [{ role: "assistant" as const, body: reply }] : [])]);
    const { error } = await sb.from("conversations").upsert({ patient_id: patient.id, history: trimHistory(history), ...(paused ? {} : { updated_at: new Date().toISOString() }) });
    if (error) console.error("[history]", error.message);
  };

  // Safety first, same as WhatsApp: a fixed reply, the model does not run.
  if (isEmergency(text)) {
    const reply = emergencyReply(text, clinic.phone);
    after(() => save([...saved, user(text), assistant(reply)], reply));
    return fixed(reply);
  }

  // Staff own the chat: keep the message for them, Sara stays quiet.
  if (paused) {
    after(() => save([...saved, user(text)], undefined));
    return fixed(HELD);
  }

  try {
    const result = await streamSara(clinic, patient, [...saved, user(text)]);
    after(async () => {
      try {
        await result.completed;
        await logUsage(clinic.id, "web", result.state.usage);
        await save(result.history, result.finalOutput);
        await reviewAndLog({ clinic, patientId: patient.id, channel: "web", userText: text, reply: result.finalOutput, items: result.newItems });
      } catch (e) {
        console.error("[chat]", (e as Error).message);
      }
    });
    return createAiSdkUiMessageStreamResponse(result);
  } catch (e) {
    console.error("[chat]", (e as Error).message);
    return fixed(sorry(clinic.phone, null));
  }
}

// Transcript after a reload, and polling while staff own the chat: { paused, messages }, only rows newer than `after` if given.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const visitorId = z.uuid().safeParse(q.get("visitorId"));
  const after = Number(q.get("after")) || 0;
  const empty = { paused: false, messages: [] };
  const clinic = await clinicBySlug(q.get("slug") ?? "");
  if (!visitorId.success || !clinic?.active) return Response.json(empty);
  const sb = db();
  const { data: patient } = await sb.from("patients").select("id, conversations(bot_paused, updated_at)").eq("clinic_id", clinic.id).eq("web_visitor_id", visitorId.data).maybeSingle();
  if (!patient) return Response.json(empty);
  const convo = patient.conversations as unknown as { bot_paused: boolean; updated_at: string } | null;
  let query = sb
    .from("messages")
    .select("id, role, body, created_at")
    .eq("patient_id", patient.id)
    .in("role", ["patient", "assistant", "staff"])
    .order("id", { ascending: !!after }) // one save writes patient + reply in the same instant, so order by id; polls read oldest-new first so none are skipped
    .limit(30);
  if (after) query = query.gt("id", after);
  const { data: rows } = await query;
  const data = after ? rows : rows?.reverse();
  return Response.json({
    paused: stillPaused(convo),
    messages: (data ?? []).map((m) => ({ id: String(m.id), role: m.role, text: m.body, at: m.created_at })),
  });
}
