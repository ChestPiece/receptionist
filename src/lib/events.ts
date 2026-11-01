// Activity log: one row per thing Sara, staff or the system did, shown on the dashboard Activity page.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAYS } from "./slots";

export type Actor = "sara" | "staff" | "system" | "reviewer";
export type EventInput = {
  clinicId: string;
  patientId?: string | null;
  appointmentId?: string | null;
  actor: Actor;
  kind: string;
  level?: "info" | "warn";
  summary: string;
  data?: Record<string, unknown>;
};
export type VisitInfo = { patient: string | null; service: string; date: string; time: string; dentist?: string | null };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Booked Ali Khan · Cleaning · Tue 4 Nov 10:00 · Dr. Amal". Pass the dentist only when the clinic has more than one.
export function visitSummary(verb: string, v: VisitInfo, note?: string) {
  const day = new Date(`${v.date}T00:00:00Z`);
  const when = `${DAYS[day.getUTCDay()].replace(/^./, (c) => c.toUpperCase())} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} ${v.time}`;
  return [`${verb} ${v.patient ?? "a patient"}`, v.service, when, v.dentist].filter(Boolean).join(" · ") + (note ? `: ${note}` : "");
}

// Best-effort: a failed log write must never fail the booking or the reply.
export async function logEvent(sb: SupabaseClient, e: EventInput) {
  try {
    const { error } = await sb.from("agent_events").insert({
      clinic_id: e.clinicId, patient_id: e.patientId ?? null, appointment_id: e.appointmentId ?? null,
      actor: e.actor, kind: e.kind, level: e.level ?? "info", summary: e.summary, data: e.data ?? null,
    });
    if (error) console.error("[events]", error.message);
  } catch (err) {
    console.error("[events]", (err as Error).message);
  }
}
