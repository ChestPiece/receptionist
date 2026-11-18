// Web voice call: the browser reports how the call went when it hangs up (sent with keepalive, so it survives pagehide).
// One agent_events row per call (kind call_metrics): the numbers behind the latency targets in CLAUDE.md.
import { z } from "zod";
import { clinicBySlug } from "@/lib/clinics";
import { allow, db } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { findVisitor, inCall, sameOrigin } from "@/lib/visitor";

const ms = z.number().min(0).max(600_000);
const Body = z.object({
  slug: z.string().max(64),
  visitorId: z.uuid(),
  connectMs: ms,
  callMs: ms,
  firstAudioMs: z.array(ms).max(200),
  toolMs: z.array(ms).max(200),
  endReason: z.string().max(32),
  resumes: z.number().int().min(0).max(10),
  nudges: z.number().int().min(0).max(100),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("forbidden", { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const { slug, visitorId, ...m } = parsed.data;
  const clinic = await clinicBySlug(slug);
  if (!clinic?.active) return new Response("not found", { status: 404 });
  const patient = await findVisitor(clinic, visitorId);
  if (!patient || !(await inCall(patient.id)) || !(await allow(`call-end:${patient.id}`, 5, 600))) return new Response("no call", { status: 404 });
  const s = Math.round(m.callMs / 1000);
  await logEvent(db(), { clinicId: clinic.id, patientId: patient.id, actor: "sara", kind: "call_metrics", summary: `Web call ended (${m.endReason}, ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")})`, data: m });
  return new Response(null, { status: 204 });
}
