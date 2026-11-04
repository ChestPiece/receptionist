// Public demo (/demo): one sandbox clinic. Visitors' rows are purged after a few hours; the calendar is kept busy
// with fake desk visits so Sara's free times look real. Both run from the 15-min cron (runJobs).
import type { Clinic, Dentist } from "./clinics";
import { DAYS, localDate, toUtc } from "./slots";

export const DEMO_SLUG = "demo";
export const DEMO_TTL_H = 6;
export const DEMO_DAYS = 5; // the desk view shows today and the next 4 days

export const demoCutoff = (now: Date) => new Date(now.getTime() - DEMO_TTL_H * 3_600_000).toISOString();

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const demoDates = (now: Date, offsetMin: number) => Array.from({ length: DEMO_DAYS }, (_, i) => addDays(localDate(now, offsetMin), i));
const hourIn = (iso: string, offsetMin: number) => {
  const d = new Date(Date.parse(iso) + offsetMin * 60_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

export type DeskVisit = { id: string; starts_at: string; ends_at: string; status: string; service: string | null; dentist_id: string; patient_id: string };
export type DeskBlock = { id: string; day: number; start: number; end: number; title: string; name: string; mine: boolean; muted: boolean };

// Calendar blocks for the desk panel. Other people's visits say only "Booked" and the dentist: no names, no services.
export function deskView(visits: DeskVisit[], mine: string | null, dates: string[], offsetMin: number, dentists: Pick<Dentist, "id" | "name">[]): DeskBlock[] {
  const den = new Map(dentists.map((d) => [d.id, d.name]));
  return visits.flatMap((v) => {
    const day = dates.indexOf(localDate(new Date(v.starts_at), offsetMin));
    if (day < 0) return [];
    const own = !!mine && v.patient_id === mine;
    return [{
      id: v.id, day, start: hourIn(v.starts_at, offsetMin), end: hourIn(v.ends_at, offsetMin),
      title: own ? (v.service ?? "Your visit") : "Booked", name: own ? `You · ${den.get(v.dentist_id) ?? ""}` : (den.get(v.dentist_id) ?? ""),
      mine: own, muted: v.status === "cancelled",
    }];
  });
}

// Fake desk visits for one day: a few fixed times per dentist, inside that dentist's hours. Deterministic, so a
// re-run for the same day adds nothing new (the caller only seeds days that have no desk visits yet).
const TIMES = ["10:00", "11:30", "14:00", "16:30", "18:00"];
export function seedPlan(date: string, dentists: Pick<Dentist, "id" | "hours" | "service_ids" | "active">[], minutesOf: (serviceId: string) => number) {
  const key = DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return dentists.filter((d) => d.active && d.service_ids.length).flatMap((d, di) =>
    TIMES.filter((_, ti) => (ti + di) % 2 === 0).flatMap((time, ti) => {
      const serviceId = d.service_ids[(ti + di) % d.service_ids.length];
      const mins = minutesOf(serviceId);
      const [h, m] = time.split(":").map(Number);
      const end = `${String(Math.floor((h * 60 + m + mins) / 60)).padStart(2, "0")}:${String((h * 60 + m + mins) % 60).padStart(2, "0")}`;
      const fits = (d.hours[key] ?? []).some(([a, b]) => time >= a && end <= b);
      return fits ? [{ dentist_id: d.id, service_id: serviceId, date, time, minutes: mins }] : [];
    }),
  );
}

type Sb = ReturnType<typeof import("./db").db>;
const FAKE = ["Sample Patient A", "Sample Patient B", "Sample Patient C", "Sample Patient D", "Sample Patient E", "Sample Patient F"];

// ponytail: purge by age (first visit + 6 h), not per session; a visitor chatting past 6 h starts fresh.
export async function purgeDemo(sb: Sb, now = new Date()) {
  const { data: c } = await sb.from("clinics").select("id").eq("slug", DEMO_SLUG).maybeSingle();
  if (!c) return 0;
  const { data, error } = await sb.from("patients").delete().eq("clinic_id", c.id).not("web_visitor_id", "is", null).lt("created_at", demoCutoff(now)).select("id");
  if (error) throw error;
  return data.length;
}

// Keep the next few days looking like a real clinic: seed days that have no desk (fake) visits yet.
export async function topUpDemo(sb: Sb, clinic: Clinic, now = new Date()) {
  const off = clinic.utc_offset_minutes;
  let { data: fakes } = await sb.from("patients").select("id").eq("clinic_id", clinic.id).in("name", FAKE);
  if (!fakes?.length) {
    const rows = FAKE.map((name, i) => ({ clinic_id: clinic.id, name, phone: `+97150000${String(9100 + i)}`, wa_id: `97150000${String(9100 + i)}@c.us`, tags: ["sample"] }));
    ({ data: fakes } = await sb.from("patients").insert(rows).select("id"));
  }
  if (!fakes?.length) return 0;
  const dates = demoDates(now, off);
  const from = toUtc(dates[0], "00:00", off).toISOString();
  const to = toUtc(addDays(dates.at(-1)!, 1), "00:00", off).toISOString();
  const { data: have } = await sb.from("appointments").select("starts_at").eq("clinic_id", clinic.id).eq("source", "staff").in("patient_id", fakes.map((f) => f.id)).gte("starts_at", from).lt("starts_at", to);
  const seeded = new Set((have ?? []).map((a) => localDate(new Date(a.starts_at), off)));
  const minutesOf = (id: string) => clinic.services.find((s) => s.id === id)?.minutes ?? 30;
  const rows = dates.filter((d) => !seeded.has(d)).flatMap((date) => seedPlan(date, clinic.dentists, minutesOf)).map((p, i) => {
    const starts = toUtc(p.date, p.time, off);
    return {
      clinic_id: clinic.id, patient_id: fakes![i % fakes!.length].id, dentist_id: p.dentist_id, service_id: p.service_id,
      service: clinic.services.find((s) => s.id === p.service_id)?.name ?? "Visit",
      starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + p.minutes * 60_000).toISOString(), status: "booked", source: "staff",
    };
  }).filter((r) => r.starts_at > now.toISOString());
  if (!rows.length) return 0;
  const { error } = await sb.from("appointments").insert(rows);
  if (error) throw error;
  return rows.length;
}
