// The web chat channel: streams Sara's reply (text plus tool calls) to the AI SDK useChat client.
import { assistant, user, type AgentInputItem } from "@openai/agents";
import { createAiSdkUiMessageStreamResponse } from "@openai/agents-extensions/ai-sdk-ui";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { appendHistory, capText, lapseMarker, slowDown, sorry, stillPaused, trimHistory } from "@/lib/agent";
import { markerOf, splitChips } from "@/lib/chips";
import { clinicBySlug } from "@/lib/clinics";
import { db, logMessages, logUsage } from "@/lib/db";
import { reviewAndLog } from "@/lib/reviewer";
import { emergencyReply, isEmergency } from "@/lib/safety";
import { streamSara } from "@/lib/sara";
import { overRateLimit, sameOrigin, upsertVisitor } from "@/lib/visitor";

export const maxDuration = 60;

// The client sends only its newest message; the history lives server side (conversations.history), like WhatsApp.
const Body = z.object({
  slug: z.string().max(64),
  visitorId: z.uuid(),
  test: z.boolean().optional(),
  message: z.object({ role: z.literal("user"), parts: z.array(z.object({ type: z.string(), text: z.string().optional() })) }),
});

// Fixed replies carry an empty chips marker, so the chat shows no fallback chips under them (e.g. after an emergency reply).
const quiet = (text: string) => `${text}\n[[chips: ]]`;

// A fixed reply in the same stream format, for answers the model must not write (emergency, rate limit, errors).
const fixed = (text: string) =>
  createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "text-start", id: "fixed" });
        writer.write({ type: "text-delta", id: "fixed", delta: quiet(text) });
        writer.write({ type: "text-end", id: "fixed" });
      },
    }),
  });

const HELD = "Our front desk has your chat and will reply here shortly.";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("forbidden", { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const { slug, visitorId, message, test } = parsed.data;
  const text = capText(message.parts.map((p) => (p.type === "text" ? (p.text ?? "") : "")).join("\n").trim());
  if (!text) return new Response("empty message", { status: 400 });

  const clinic = await clinicBySlug(slug);
  if (!clinic?.active) return new Response("not found", { status: 404 });

  const sb = db();
  const patient = await upsertVisitor(clinic, visitorId, test);
  if (await overRateLimit(patient.id)) return fixed(slowDown(clinic.phone));

  const { data: convo } = await sb.from("conversations").select("history, bot_paused, updated_at").eq("patient_id", patient.id).maybeSingle();
  const saved = trimHistory((convo?.history ?? []) as AgentInputItem[]);
  const paused = stillPaused(convo);
  // While staff own the chat, updated_at stays put so the 30-min pause can lapse (same as agent.ts).
  // The transcript staff read never shows the hidden chips line; conversations.history keeps it so a reload can rebuild the chips.
  const save = async (items: AgentInputItem[], reply: string | undefined) => {
    const shown = reply && splitChips(reply).text;
    await logMessages(clinic.id, patient.id, "web", [{ role: "patient", body: text }, ...(shown ? [{ role: "assistant" as const, body: shown }] : [])]);
    await appendHistory(patient.id, items, !paused);
  };

  // Safety first, same as WhatsApp: a fixed reply, the model does not run.
  if (isEmergency(text)) {
    const reply = emergencyReply(text, clinic.phone);
    after(() => save([user(text), assistant(quiet(reply))], reply)); // the marker survives a reload
    return fixed(reply);
  }

  // Staff own the chat: keep the message for them, Sara stays quiet.
  if (paused) {
    after(() => save([user(text)], undefined));
    return fixed(HELD);
  }

  try {
    // Staff paused the chat, never handed back, and 30 min passed: tell Sara they are gone (same as handleMessage).
    const lapsed = lapseMarker(convo);
    if (convo?.bot_paused) await sb.from("conversations").update({ bot_paused: false }).eq("patient_id", patient.id);
    const result = await streamSara(clinic, patient, [...saved, ...lapsed, user(text)]);
    after(async () => {
      try {
        await result.completed;
        await logUsage(clinic.id, "web", result.state.usage);
        await save(result.history.slice(saved.length), result.finalOutput);
        await reviewAndLog({ clinic, patientId: patient.id, channel: "web", userText: text, reply: result.finalOutput && splitChips(result.finalOutput).text, items: result.newItems, earlier: saved });
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
  const messages = (data ?? []).map((m) => ({ id: String(m.id), role: m.role, text: m.body as string, at: m.created_at }));
  // A reload: hand the newest reply back with its hidden chips line (kept in history, not in the transcript), so the client can show the chips again.
  const lastRow = messages.at(-1);
  if (!after && lastRow?.role === "assistant") {
    const { data: h } = await sb.from("conversations").select("history").eq("patient_id", patient.id).maybeSingle();
    const marker = markerOf((h?.history ?? []) as unknown[]);
    if (marker) lastRow.text = [lastRow.text, marker].join("\n");
  }
  return Response.json({ paused: stillPaused(convo), messages });
}
