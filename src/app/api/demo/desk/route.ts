// Public demo: the "front desk view" next to the chat. Same trust as /api/chat (clinic fixed to the demo, visitor by id),
// and it only ever shows this visitor's own details: everyone else's visits are anonymous "Booked" blocks.
import { z } from "zod";
import { stillPaused } from "@/lib/agent";
import { clinicBySlug } from "@/lib/clinics";
import { allow, db } from "@/lib/db";
import { DEMO_SLUG, demoDates, deskView } from "@/lib/demo";
import { toUtc } from "@/lib/slots";
import { findVisitor, ipOf, sameOrigin } from "@/lib/visitor";

const VisitorId = z.uuid();

export async function GET(request: Request) {
  if (!sameOrigin(request)) return new Response("forbidden", { status: 403 });
  if (!(await allow(`demo-desk:${ipOf(request)}`, 400, 600))) return new Response("slow down", { status: 429 });
  const clinic = await clinicBySlug(DEMO_SLUG);
  if (!clinic?.active) return new Response("not found", { status: 404 });
  const id = VisitorId.safeParse(new URL(request.url).searchParams.get("visitorId"));
  const visitor = id.success ? await findVisitor(clinic, id.data) : null;

  const off = clinic.utc_offset_minutes;
  const dates = demoDates(new Date(), off);
  const from = toUtc(dates[0], "00:00", off).toISOString();
  const to = new Date(toUtc(dates.at(-1)!, "00:00", off).getTime() + 86_400_000).toISOString();
  const sb = db();
  const [{ data: visits }, convo, events] = await Promise.all([
    sb.from("appointments").select("id, starts_at, ends_at, status, service, dentist_id, patient_id").eq("clinic_id", clinic.id).neq("status", "cancelled").gte("starts_at", from).lt("starts_at", to),
    visitor ? sb.from("conversations").select("bot_paused, updated_at").eq("patient_id", visitor.id).maybeSingle().then((r) => r.data) : null,
    visitor ? sb.from("agent_events").select("id, kind, level, summary, created_at").eq("patient_id", visitor.id).order("created_at", { ascending: false }).limit(8).then((r) => r.data ?? []) : [],
  ]);

  const mine = (visits ?? []).filter((v) => visitor && v.patient_id === visitor.id);
  return Response.json({
    days: dates.map((d, i) => ({ date: d, today: i === 0 })),
    blocks: deskView(visits ?? [], visitor?.id ?? null, dates, off, clinic.dentists),
    lead: visitor && (visitor.name || visitor.phone) ? { name: visitor.name, phone: visitor.phone } : null,
    booked: mine.length,
    paused: stillPaused(convo),
    events: (events as { id: number; kind: string; level: string; summary: string; created_at: string }[]).map(({ id, kind, level, summary, created_at }) => ({ id, kind, level, summary, at: created_at })),
  });
}
