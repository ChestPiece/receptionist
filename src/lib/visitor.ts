// Web chat and web calls: an anonymous visitor is a patients row keyed by (clinic, web_visitor_id).
import type { Clinic } from "./clinics";
import { RATE_MAX, RATE_WINDOW_MS, stillPaused } from "./agent";
import { db } from "./db";
import { supabaseServer } from "./supabase/server";

// ponytail: same-origin only while the chat page is ours; the embeddable widget (P1) checks clinic.allowed_origins.
export const sameOrigin = (req: Request) => {
  const origin = req.headers.get("origin");
  return !origin || new URL(origin).host === req.headers.get("host");
};

// ?test=1 counts only for a signed-in member of this clinic or a platform admin (RLS lets them read the clinic row); anyone else is a normal visitor.
export async function isStaffOf(clinicId: string) {
  try {
    const { data } = await (await supabaseServer()).from("clinics").select("id").eq("id", clinicId).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function upsertVisitor(clinic: Clinic, visitorId: string, test?: boolean) {
  const { data, error } = await db()
    .from("patients")
    .upsert({ clinic_id: clinic.id, web_visitor_id: visitorId, ...(test && (await isStaffOf(clinic.id)) ? { is_test: true } : {}) }, { onConflict: "clinic_id,web_visitor_id" })
    .select("id, name, phone")
    .single();
  if (error) throw error;
  return data as { id: string; name: string | null; phone: string | null };
}

export async function findVisitor(clinic: Clinic, visitorId: string) {
  const { data } = await db().from("patients").select("id, name, phone").eq("clinic_id", clinic.id).eq("web_visitor_id", visitorId).maybeSingle();
  return data as { id: string; name: string | null; phone: string | null } | null;
}

// ponytail: per visitor id only; a script rotating ids gets past it. Add a per-IP limit before the widget goes on real sites.
export async function overRateLimit(patientId: string) {
  const { count } = await db()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("role", "patient")
    .neq("channel", "voice") // spoken turns come fast; calls have their own cap in /api/voice
    .gt("created_at", new Date(Date.now() - RATE_WINDOW_MS).toISOString());
  return (count ?? 0) >= RATE_MAX;
}

// Tool and turn posts only count during a call this visitor started (a call lasts at most 8 min), and never once staff have the chat.
export async function inCall(patientId: string) {
  const sb = db();
  const [{ count }, { data: convo }] = await Promise.all([
    sb.from("agent_events").select("id", { count: "exact", head: true }).eq("patient_id", patientId).eq("kind", "call").gt("created_at", new Date(Date.now() - 9 * 60_000).toISOString()),
    sb.from("conversations").select("bot_paused, updated_at").eq("patient_id", patientId).maybeSingle(),
  ]);
  return (count ?? 0) > 0 && !stillPaused(convo);
}
