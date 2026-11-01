"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { availability, bookVisit, cancelVisit, moveVisit, type BookResult, type Free } from "@/lib/booking";
import { deskConfig, loadClinic } from "@/lib/clinics";
import { CLINIC_COOKIE, desk } from "@/lib/dashboard";
import { appendToChat } from "@/lib/jobs";
import { normUaePhone, waIdOf } from "@/lib/phone";
import { supabaseServer } from "@/lib/supabase/server";
import { sendText } from "@/lib/whatsapp";

// Every action goes through the user's client first, so RLS decides whether the row is theirs.

export async function pickClinic(form: FormData) {
  (await cookies()).set(CLINIC_COOKIE, String(form.get("clinic")), { path: "/dashboard", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  refresh();
}

export async function signOut() {
  await (await supabaseServer()).auth.signOut();
  redirect("/login");
}

// Take over pauses Sara for this chat; the pause lapses 30 min after the last staff activity (stillPaused).
export async function setPaused(patientId: string, paused: boolean) {
  const sb = await supabaseServer();
  const { error } = await sb.from("conversations").update({ bot_paused: paused, updated_at: new Date().toISOString() }).eq("patient_id", patientId);
  if (error) throw new Error("Could not update the chat.");
  refresh();
}

export async function staffReply(patientId: string, form: FormData): Promise<string | null> {
  const text = String(form.get("text") ?? "").trim().slice(0, 1500);
  if (!text) return null;
  const sb = await supabaseServer();
  const { data: patient } = await sb.from("patients").select("id, clinic_id, wa_id").eq("id", patientId).maybeSingle();
  if (!patient) return "Patient not found.";
  // Web chat: the visitor's page polls for staff messages, nothing to send.
  if (patient.wa_id) {
    // Credentials come from clinic_secrets, which only the service role can read.
    const clinic = await loadClinic(patient.clinic_id);
    if (!clinic.wa) return "WhatsApp is not connected for this clinic.";
    try {
      await sendText(clinic.wa, patient.wa_id, text);
    } catch {
      return "WhatsApp did not accept the message. Try again.";
    }
  }
  await Promise.all([
    sb.from("messages").insert({ clinic_id: patient.clinic_id, patient_id: patient.id, channel: patient.wa_id ? "whatsapp" : "web", role: "staff", body: text }),
    // A staff reply keeps the chat paused and tells Sara what was said, for when she takes it back.
    sb.from("conversations").update({ bot_paused: true, updated_at: new Date().toISOString() }).eq("patient_id", patient.id),
    appendToChat(patient.id, text),
  ]);
  refresh();
  return null;
}

const STATUSES = ["booked", "completed", "no_show", "cancelled"];
export async function setVisitStatus(id: string, status: string) {
  if (!STATUSES.includes(status)) return;
  const sb = await supabaseServer();
  const { error } = await sb.from("appointments").update({ status }).eq("id", id);
  // The exclusion constraint refuses moving a cancelled visit back onto a taken slot.
  if (error) throw new Error(error.code === "23P01" ? "That time is taken now." : "Could not update the visit.");
  refresh();
}

export async function savePatient(id: string, form: FormData) {
  const field = (k: string) => String(form.get(k) ?? "").trim() || null;
  const tags = String(form.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const sb = await supabaseServer();
  const { error } = await sb.from("patients").update({ name: field("name"), phone: field("phone"), email: field("email"), notes: field("notes"), tags: [...new Set(tags)] }).eq("id", id);
  if (error) throw new Error("Could not save the patient.");
  refresh();
}

// ---------------------------------------------------------------- front desk booking (same engine as Sara, through RLS)

async function current() {
  const { sb, clinic } = await desk();
  if (!clinic) throw new Error("No clinic.");
  return { sb, clinic: await deskConfig(sb, clinic.id) };
}

const STAFF_COPY: Record<string, string> = {
  taken: "Someone just took that time. Pick another.",
  unavailable: "That time isn't free anymore.",
  no_dentist: "No dentist offers this service right now.",
  too_far: "Bookings open up to 60 days ahead.",
  unknown_service: "That service is not offered anymore.",
};
export type DeskResult = BookResult & { error?: string };
const withCopy = (r: BookResult): DeskResult => (r.ok ? r : { ...r, error: STAFF_COPY[r.reason] });

export async function freeTimes(q: { serviceId: string; date: string; dentistId?: string | null; ignoreId?: string }): Promise<Free[]> {
  const { sb, clinic } = await current();
  return (await availability(sb, clinic, { ...q, from: q.date, days: 1 }))[q.date] ?? [];
}

export async function bookForPatient(v: { patientId: string; serviceId: string; date: string; time: string; dentistId?: string | null }): Promise<DeskResult> {
  const { sb, clinic } = await current();
  const r = withCopy(await bookVisit(sb, clinic, { ...v, source: "staff" }));
  if (r.ok) refresh();
  return r;
}

export async function moveForPatient(v: { id: string; date: string; time: string; dentistId?: string | null }): Promise<DeskResult> {
  const { sb, clinic } = await current();
  const r = withCopy(await moveVisit(sb, clinic, v));
  if (r.ok) refresh();
  return r;
}

export async function cancelForPatient(id: string) {
  await cancelVisit(await supabaseServer(), id);
  refresh();
}

// Walk-ins: the mobile number doubles as the WhatsApp id, so reminders reach them and a later WhatsApp message finds the same patient.
export async function addPatient(v: { name: string; phone: string }): Promise<{ id: string; existing: boolean } | { error: string }> {
  const name = v.name.trim().slice(0, 120);
  const digits = normUaePhone(v.phone);
  if (!name) return { error: "Enter the patient's name." };
  if (!digits) return { error: "Enter a UAE mobile number, like 050 123 4567." };
  const { sb, clinic } = await desk();
  if (!clinic) return { error: "No clinic." };
  const { data: found } = await sb.from("patients").select("id").eq("clinic_id", clinic.id)
    .or(`wa_id.eq.${waIdOf(digits)},phone.eq.${digits},phone.eq.+${digits}`).limit(1).maybeSingle();
  if (found) return { id: found.id, existing: true };
  const { data, error } = await sb.from("patients").insert({ clinic_id: clinic.id, name, phone: digits, wa_id: waIdOf(digits) }).select("id").single();
  if (error) return { error: "Could not add the patient." };
  refresh();
  return { id: data.id, existing: false };
}

// Booking dialog patient picker: name or phone digits, at most 8.
export async function searchPatients(q: string): Promise<{ id: string; name: string | null; phone: string | null }[]> {
  const { sb, clinic } = await desk();
  const term = q.trim().replace(/[%,()]/g, "").slice(0, 40);
  if (!clinic || term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  const { data } = await sb.from("patients").select("id, name, phone").eq("clinic_id", clinic.id)
    .or(digits.length >= 3 ? `name.ilike.%${term}%,phone.ilike.%${digits}%,wa_id.ilike.%${digits}%` : `name.ilike.%${term}%`)
    .order("name").limit(8);
  return data ?? [];
}
