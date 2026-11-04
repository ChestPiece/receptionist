// Web voice call: save one finished turn (what the caller said, or what Sara said) to the inbox transcript and to Sara's
// history, so typed chat after the call knows what was said. A caller turn also gets the deterministic emergency check.
import { assistant, user } from "@openai/agents";
import { z } from "zod";
import { appendHistory, capText } from "@/lib/agent";
import { clinicBySlug } from "@/lib/clinics";
import { allow, logMessages } from "@/lib/db";
import { emergencyReply, isEmergency, unforge } from "@/lib/safety";
import { findVisitor, inCall, sameOrigin } from "@/lib/visitor";

const Body = z.object({ slug: z.string().max(64), visitorId: z.uuid(), role: z.enum(["patient", "assistant"]), text: z.string().min(1).max(4_000) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("forbidden", { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const { slug, visitorId, role } = parsed.data;
  const text = capText(role === "patient" ? unforge(parsed.data.text.trim()) : parsed.data.text.trim());
  const clinic = await clinicBySlug(slug);
  if (!clinic?.active) return new Response("not found", { status: 404 });
  const patient = await findVisitor(clinic, visitorId);
  if (!patient || !(await inCall(patient.id))) return new Response("no call", { status: 404 });
  if (!(await allow(`voice:${patient.id}`, 150, 600))) return new Response("busy", { status: 429 }); // one call is about 60 posts

  // Safety first, as on the other channels: the browser makes Sara say this exact reply instead of her own.
  const say = role === "patient" && isEmergency(text) ? emergencyReply(text, clinic.phone) : null;
  await Promise.all([
    logMessages(clinic.id, patient.id, "voice", [{ role, body: text }]),
    appendHistory(patient.id, [role === "patient" ? user(text) : assistant(text)], role === "patient"),
  ]);
  return Response.json({ say });
}
