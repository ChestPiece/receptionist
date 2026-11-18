// Web voice call: run one tool call the realtime model asked for. Same trust as the typed chat: the visitor id picks the
// patient row, and the tool only ever touches that patient (clinic and patient never come from the model's arguments).
import { z } from "zod";
import { clinicBySlug } from "@/lib/clinics";
import { allow } from "@/lib/db";
import { READ_TOOLS } from "@/lib/liveAudio";
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
    // A stalled tool must not leave the caller in silence: after 8 s Sara gets a line to say instead. A write keeps
    // running and may still save, so she checks before trying again (a blind retry could book twice or hit "taken").
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<string>((res) => {
      timer = setTimeout(
        () =>
          res(
            READ_TOOLS.has(name)
              ? "This is taking longer than expected. Say sorry, and offer to try again or have the front desk call back (handoff_to_staff)."
              : "This is taking longer than expected and may still go through. Say sorry, call my_appointments to see if it saved, and only then offer to do it again or have the front desk call back (handoff_to_staff).",
          ),
        8_000,
      );
    });
    return Response.json({ output: await Promise.race([runTool(clinic, patient, name, args), slow]).finally(() => clearTimeout(timer)) });
  } catch (e) {
    console.error("[voice tool]", name, (e as Error).message);
    return Response.json({ output: "That did not work. Say sorry, and offer handoff_to_staff so the front desk calls back." });
  }
}
