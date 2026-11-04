// Public demo: the visitor plays the front desk after a handoff. Demo clinic only, own chat only, only while it is
// paused. Same writes as the inbox's staff reply (src/app/dashboard/actions.ts), with the service role.
import { z } from "zod";
import { capText, stillPaused } from "@/lib/agent";
import { clinicBySlug } from "@/lib/clinics";
import { allow, db } from "@/lib/db";
import { DEMO_SLUG } from "@/lib/demo";
import { logEvent } from "@/lib/events";
import { appendToChat } from "@/lib/jobs";
import { findVisitor, sameOrigin } from "@/lib/visitor";

const Body = z.object({ visitorId: z.uuid(), action: z.enum(["reply", "handback"]), text: z.string().max(1500).optional() });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response("forbidden", { status: 403 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response("bad request", { status: 400 });
  const clinic = await clinicBySlug(DEMO_SLUG);
  if (!clinic?.active) return new Response("not found", { status: 404 });
  const visitor = await findVisitor(clinic, body.data.visitorId);
  if (!visitor) return new Response("not found", { status: 404 });
  if (!(await allow(`demo-reply:${visitor.id}`, 20, 600))) return new Response("slow down", { status: 429 });

  const sb = db();
  const { data: convo } = await sb.from("conversations").select("bot_paused, updated_at").eq("patient_id", visitor.id).maybeSingle();
  if (!stillPaused(convo)) return new Response("not paused", { status: 409 });
  const now = new Date().toISOString();

  if (body.data.action === "handback") {
    await sb.from("conversations").update({ bot_paused: false, updated_at: now }).eq("patient_id", visitor.id);
    await appendToChat(visitor.id, "[Front desk] (handed the chat back to Sara)");
    await logEvent(sb, { clinicId: clinic.id, patientId: visitor.id, actor: "staff", kind: "handback", summary: "Front desk handed the chat back to Sara" });
    return Response.json({ ok: true });
  }

  const text = capText((body.data.text ?? "").trim());
  if (!text) return new Response("empty", { status: 400 });
  const [{ error }] = await Promise.all([
    sb.from("messages").insert({ clinic_id: clinic.id, patient_id: visitor.id, channel: "web", role: "staff", body: text }),
    sb.from("conversations").update({ bot_paused: true, updated_at: now }).eq("patient_id", visitor.id),
    appendToChat(visitor.id, `[Front desk] ${text}`),
    logEvent(sb, { clinicId: clinic.id, patientId: visitor.id, actor: "staff", kind: "staff_reply", summary: "Front desk replied" }),
  ]);
  return error ? new Response("could not save", { status: 500 }) : Response.json({ ok: true });
}
