// Outbound jobs run by POST /api/cron every 15 min (pg_cron + pg_net), for every active clinic: reminders and follow-ups.
import { assistant } from "@openai/agents";
import { HISTORY_MAX, stillPaused } from "./agent";
import { bookingSource } from "./booking";
import { activeClinics, personaName, type Clinic } from "./clinics";
import { db, logMessages } from "./db";
import { logEvent, visitSummary } from "./events";
import { availability } from "./booking";
import { localDate, localTime, toUtc } from "./slots";
import { sendTemplate, sendText } from "./whatsapp";

const HOUR = 3_600_000;
const MIN_LEAD_MS = 30 * 60_000; // a reminder this close to the visit is noise
const MAX_SENDS = 20; // per clinic per run: pace outbound traffic so the UltraMsg number does not look like a bulk sender

// Patients only get messages they did not ask for between 09:00 and 21:00 clinic time.
export const quietHours = (now: Date, offsetMin: number) => {
  const h = new Date(now.getTime() + offsetMin * 60_000).getUTCHours();
  return h < 9 || h >= 21;
};

type Visit = { starts_at: string; created_at: string; reminded_24h_at: string | null; reminded_2h_at: string | null };

// Which reminder is due now. A visit booked inside a window gets no reminder for it (the patient just booked).
// ponytail: a reschedule keeps the old created_at, so a visit moved to within 2h gets an immediate 2h reminder.
export function reminderDue(v: Visit, now: Date): "24h" | "2h" | null {
  const start = Date.parse(v.starts_at);
  const created = Date.parse(v.created_at);
  const left = start - now.getTime();
  if (left < MIN_LEAD_MS) return null;
  if (left <= 2 * HOUR) return !v.reminded_2h_at && created < start - 2 * HOUR ? "2h" : null;
  if (left <= 24 * HOUR) return !v.reminded_24h_at && created < start - 24 * HOUR ? "24h" : null;
  return null;
}

const when = (d: Date, offsetMin: number, locale: string) =>
  new Date(d.getTime() + offsetMin * 60_000).toLocaleString(locale, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

type Chat = { lastAt: string; sentAt: string | null; optedOut: boolean; paused: boolean; upcoming: number };

// One nudge per quiet inquiry: the patient wrote 3 to 20 h ago, has nothing booked, and was not nudged since.
export const followupDue = (c: Chat, now: Date) => {
  const quiet = now.getTime() - Date.parse(c.lastAt);
  return (
    quiet >= 3 * HOUR &&
    quiet <= 20 * HOUR &&
    !c.upcoming &&
    !c.optedOut &&
    !c.paused &&
    (!c.sentAt || Date.parse(c.sentAt) < Date.parse(c.lastAt))
  );
};

// ponytail: the service the chat mentioned last, by plain name match (English or Arabic name).
export function guessService(historyJson: string, services: { name: string; name_ar: string | null }[]) {
  const text = historyJson.toLowerCase();
  let best: { name: string; at: number } | null = null;
  for (const { name, name_ar } of services) {
    const at = Math.max(text.lastIndexOf(name.toLowerCase()), name_ar ? text.lastIndexOf(name_ar.toLowerCase()) : -1);
    if (at >= 0 && (!best || at > best.at)) best = { name, at };
  }
  return best?.name ?? null;
}

export function followupText(f: { name: string | null; service: string | null; slot: string | null; clinic: string; persona?: string }) {
  const first = f.name?.trim().split(/\s+/)[0];
  const persona = f.persona ?? "Sara";
  const hi = `Hi${first ? ` ${first}` : ""}, it's ${persona} from ${f.clinic}.`;
  const en = f.service
    ? `${hi} Still keen on a ${f.service}?${f.slot ? ` I have ${f.slot} free, shall I book it for you?` : " I can find you a time."}`
    : `${hi} Just checking in, can I help you book a visit?${f.slot ? ` I have ${f.slot} free.` : ""}`;
  const ar = `مرحباً${first ? ` ${first}` : ""}، معك ${persona === "Sara" ? "سارة" : persona} من ${f.clinic}. هل ما زلت ترغب بحجز موعد${f.service ? ` (${f.service})` : ""}؟${f.slot ? ` لدي موعد متاح ${f.slot}.` : ""}`;
  return `${en}\n${ar}\n(Reply STOP to stop these messages. أرسل توقف لإيقافها.)`;
}

export { bookingSource };

// Bilingual, like the other fixed replies: the patient's language is not stored.
export function reminderText(r: { name: string | null; service: string; startsAt: Date; clinic: string; offsetMin: number; dentist?: string | null }) {
  const first = r.name?.trim().split(/\s+/)[0];
  const [en, ar] = r.dentist ? [`${r.service} with ${r.dentist}`, `${r.service} مع ${r.dentist}`] : [r.service, r.service];
  return `Hi${first ? ` ${first}` : ""}, a reminder of your ${en} at ${r.clinic} on ${when(r.startsAt, r.offsetMin, "en-US")}. Reply 1 to confirm or 2 to change it.
مرحباً${first ? ` ${first}` : ""}، تذكير بموعدك (${ar}) في ${r.clinic} يوم ${when(r.startsAt, r.offsetMin, "ar-AE")}. أرسل 1 للتأكيد أو 2 لتغيير الموعد.`;
}

// In the chat history, so the agent understands the patient's reply to an outbound message.
export async function appendToChat(patientId: string, text: string) {
  const { error } = await db().rpc("append_history", { conv: patientId, items: [assistant(text)], max: HISTORY_MAX }); // atomic; updated_at untouched: it times a staff pause
  if (error) console.error("[outbound history]", error.message);
}

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || "there";

// Meta delivers only approved templates outside its 24 h window, so a Meta clinic with a template set sends that;
// the full bilingual text still goes into the history, so Sara understands the "1" or "2" reply.
async function send(clinic: Clinic, to: string, text: string, patientId: string, kind: "reminder" | "followup", summary: string, params: string[], appointmentId?: string) {
  const wa = clinic.wa!;
  const template = wa.provider === "meta" ? clinic.meta_templates?.[kind] : undefined;
  try {
    await (wa.provider === "meta" && template ? sendTemplate(wa, to, template, params) : sendText(wa, to, text));
  } catch (e) {
    console.error(`[${kind}]`, (e as Error).message);
    return false;
  }
  await appendToChat(patientId, text);
  await logMessages(clinic.id, patientId, "whatsapp", [{ role: "system", body: text }]);
  await logEvent(db(), { clinicId: clinic.id, patientId, appointmentId, actor: "system", kind, summary });
  return true;
}

async function sendReminders(clinic: Clinic, now: Date, budget: number) {
  const sb = db();
  const { data, error } = await sb
    .from("appointments")
    .select("id, service, starts_at, created_at, reminded_24h_at, reminded_2h_at, patient_id, dentist_id, patients!inner(wa_id, name)")
    .eq("patients.is_test", false)
    .eq("clinic_id", clinic.id)
    .eq("status", "booked")
    .gt("starts_at", new Date(now.getTime() + MIN_LEAD_MS).toISOString())
    .lte("starts_at", new Date(now.getTime() + 24 * HOUR).toISOString())
    .order("starts_at");
  if (error) throw error;

  let sent = 0;
  for (const v of data) {
    if (sent >= budget) break;
    const kind = reminderDue(v, now);
    if (!kind) continue;
    const column = kind === "24h" ? "reminded_24h_at" : "reminded_2h_at";
    // Claim before sending, so overlapping runs never send twice (at most once; a failed send is not retried).
    const { data: claimed, error: claimError } = await sb
      .from("appointments")
      .update({ [column]: now.toISOString() })
      .eq("id", v.id)
      .is(column, null)
      .select("id");
    if (claimError) throw claimError;
    if (!claimed.length) continue;
    const patient = v.patients as unknown as { wa_id: string | null; name: string | null };
    if (!patient.wa_id) continue; // web chat patient: no WhatsApp to remind on. ponytail: email/SMS reminders later
    const dentist = clinic.dentists.filter((d) => d.active).length > 1 ? clinic.dentists.find((d) => d.id === v.dentist_id)?.name : null;
    const text = reminderText({ name: patient.name, service: v.service, startsAt: new Date(v.starts_at), clinic: clinic.name, offsetMin: clinic.utc_offset_minutes, dentist });
    const at = new Date(v.starts_at);
    const summary = visitSummary(`Sent ${kind} reminder to`, { patient: patient.name, service: v.service, date: localDate(at, clinic.utc_offset_minutes), time: localTime(at, clinic.utc_offset_minutes) });
    const params = [firstName(patient.name), dentist ? `${v.service} with ${dentist}` : v.service, clinic.name, when(at, clinic.utc_offset_minutes, "en-US")];
    if (await send(clinic, patient.wa_id, text, v.patient_id, "reminder", summary, params, v.id)) sent++;
  }
  return sent;
}

// The first free time in the next week for a service, as "Fri, Oct 23, 4:00 PM".
async function nextFree(clinic: Clinic, serviceName: string, now: Date) {
  const service = clinic.services.find((s) => s.name === serviceName);
  if (!service) return null;
  const free = await availability(db(), clinic, { serviceId: service.id, from: localDate(now, clinic.utc_offset_minutes), days: 7 });
  for (const [date, times] of Object.entries(free))
    if (times[0]) return when(toUtc(date, times[0].time, clinic.utc_offset_minutes), clinic.utc_offset_minutes, "en-US");
  return null;
}

async function sendFollowups(clinic: Clinic, now: Date, budget: number) {
  const sb = db();
  // The patient's last message time per chat, from the stored pieces (emergency and STOP messages carry no body).
  const { data: pieces, error } = await sb
    .from("processed_messages")
    .select("patient_wa, created_at")
    .eq("clinic_id", clinic.id)
    .not("body", "is", null)
    .not("patient_wa", "is", null)
    .gt("created_at", new Date(now.getTime() - 20 * HOUR).toISOString());
  if (error) throw error;
  const last = new Map<string, string>();
  for (const p of pieces) if (!last.has(p.patient_wa) || p.created_at > last.get(p.patient_wa)!) last.set(p.patient_wa, p.created_at);

  let sent = 0;
  for (const [wa, lastAt] of last) {
    if (sent >= budget) break;
    if (now.getTime() - Date.parse(lastAt) < 3 * HOUR) continue;
    const { data: patient } = await sb.from("patients").select("id, name, opted_out, is_test").eq("clinic_id", clinic.id).eq("wa_id", wa).maybeSingle();
    if (!patient || patient.is_test) continue;
    const [{ data: convo }, { count }] = await Promise.all([
      sb.from("conversations").select("history, bot_paused, updated_at, followup_sent_at").eq("patient_id", patient.id).maybeSingle(),
      sb.from("appointments").select("id", { count: "exact", head: true }).eq("patient_id", patient.id).eq("status", "booked").gt("starts_at", now.toISOString()),
    ]);
    if (!convo) continue;
    const chat = { lastAt, sentAt: convo.followup_sent_at, optedOut: patient.opted_out, paused: stillPaused(convo, now), upcoming: count ?? 0 };
    if (!followupDue(chat, now)) continue;
    // Claim before sending (at most once per quiet inquiry).
    const { data: claimed, error: claimError } = await sb
      .from("conversations")
      .update({ followup_sent_at: now.toISOString() })
      .eq("patient_id", patient.id)
      .or(`followup_sent_at.is.null,followup_sent_at.lt.${lastAt}`)
      .select("patient_id");
    if (claimError) throw claimError;
    if (!claimed.length) continue;
    const service = guessService(JSON.stringify(convo.history), clinic.services);
    const slot = await nextFree(clinic, service ?? clinic.services[0]?.name, now);
    const text = followupText({ name: patient.name, service, slot, clinic: clinic.name, persona: personaName(clinic) });
    if (await send(clinic, wa, text, patient.id, "followup", `Sent a follow-up to ${patient.name ?? "a patient"}${service ? ` · ${service}` : ""}`, [firstName(patient.name), clinic.name])) sent++;
  }
  return sent;
}

export async function runJobs(now = new Date()) {
  const total = { clinics: 0, reminders: 0, followups: 0 };
  for (const clinic of await activeClinics()) {
    if (!clinic.wa) continue; // WhatsApp not connected yet
    if (quietHours(now, clinic.utc_offset_minutes)) continue;
    // One clinic's failure must not stop the others.
    try {
      const reminders = await sendReminders(clinic, now, MAX_SENDS);
      total.followups += await sendFollowups(clinic, now, MAX_SENDS - reminders);
      total.reminders += reminders;
      total.clinics++;
    } catch (e) {
      console.error(`[cron] ${clinic.slug ?? clinic.id}`, (e as Error).message);
    }
  }
  return total;
}
