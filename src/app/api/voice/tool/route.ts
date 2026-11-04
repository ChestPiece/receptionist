// Web voice call: run one tool call the realtime model asked for. Same trust as the typed chat: the visitor id picks the
// patient row, and the tool only ever touches that patient (clinic and patient never come from the model's arguments).
import { z } from "zod";
import { clinicBySlug } from "@/lib/clinics";
import { allow } from "@/lib/db";
import { runTool } from "@/lib/sara";
import { findVisitor, inCall, sameOrigin } from "@/lib/visitor";

export const maxDuration = 30;

const Body = z.object({ slug: z.string().max(64), visitorId: z.uuid(), name: z.string().max(64), args: z.string().max(4_000) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("forbidden", { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const { slug, visitorId, name, args } = parsed.data;
  const clinic = await clinicBySlug(slug);
  if (!clinic?.active) return new Response("not found", { status: 404 });
  const patient = await findVisitor(clinic, visitorId);
  if (!patient || !(await inCall(patient.id))) return new Response("no call", { status: 404 });
  if (!(await allow(`voice:${patient.id}`, 150, 600))) return new Response("busy", { status: 429 }); // one call is about 60 posts
  try {
    return Response.json({ output: await runTool(clinic, patient, name, args) });
  } catch (e) {
    console.error("[voice tool]", name, (e as Error).message);
    return Response.json({ output: "That did not work. Say sorry, and offer handoff_to_staff so the front desk calls back." });
  }
}
