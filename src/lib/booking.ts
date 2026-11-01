// Booking engine: a pure core (who can take a service, when they are free) and a thin DB layer over it. No imports from sara/jobs.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Clinic, Dentist } from "./clinics";
import { DAYS, freeSlots, localDate, toUtc } from "./slots";

export const HORIZON_DAYS = 60;
export type Busy = { dentistId: string; start: Date; end: Date };
export type Free = { time: string; dentistIds: string[] };

export const tooFar = (date: string, today: string) => Date.parse(date) - Date.parse(today) > HORIZON_DAYS * 86_400_000;

// The weekly report credits a booking to the follow-up if it came within 48 h of the nudge.
export const bookingSource = (followupSentAt: string | null, now: Date) =>
  followupSentAt && now.getTime() - Date.parse(followupSentAt) <= 48 * 3_600_000 ? "followup" : "chat";

// Active dentists doing the service (optionally one picked dentist), in sort order.
export const dentistsFor = (c: Pick<Clinic, "dentists">, serviceId: string, dentistId?: string | null) =>
  c.dentists
    .filter((d) => d.active && d.service_ids.includes(serviceId) && (!dentistId || d.id === dentistId))
    .sort((a, b) => a.sort - b.sort);

// Free start times across dentists; each time lists who is free, in the order given.
export function freeByDentist(dentists: Dentist[], busy: Busy[], minutes: number, date: string, now: Date, offsetMin: number): Free[] {
  const byTime = new Map<string, string[]>();
  for (const d of dentists)
    for (const t of freeSlots(d.hours, busy.filter((b) => b.dentistId === d.id), minutes, date, now, offsetMin))
      byTime.set(t, [...(byTime.get(t) ?? []), d.id]);
  return [...byTime].sort(([a], [b]) => a.localeCompare(b)).map(([time, dentistIds]) => ({ time, dentistIds }));
}

// Fewest visits that day wins; ties keep `ids` order (Array.sort is stable).
export const pickDentist = (ids: string[], load: Record<string, number>) =>
  [...ids].sort((a, b) => (load[a] ?? 0) - (load[b] ?? 0))[0];

// ---------------------------------------------------------------- DB layer (sb is any Supabase client)

const DAY_MS = 86_400_000;
const dateList = (from: string, days: number) =>
  Array.from({ length: days }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10));

// Booked visits and time off of these dentists that touch the range: two queries for the whole range.
async function busyFor(sb: SupabaseClient, c: Clinic, ids: string[], from: string, days: number, ignoreId?: string) {
  const start = toUtc(from, "00:00", c.utc_offset_minutes).toISOString();
  const end = new Date(Date.parse(start) + days * DAY_MS).toISOString();
  const [appts, off] = await Promise.all([
    sb.from("appointments").select("id, dentist_id, starts_at, ends_at").eq("clinic_id", c.id).eq("status", "booked")
      .in("dentist_id", ids).lt("starts_at", end).gt("ends_at", start),
    sb.from("time_off").select("dentist_id, starts_at, ends_at").eq("clinic_id", c.id)
      .in("dentist_id", ids).lt("starts_at", end).gt("ends_at", start),
  ]);
  if (appts.error) throw appts.error;
  if (off.error) throw off.error;
  const busy = (r: { dentist_id: string; starts_at: string; ends_at: string }): Busy => ({ dentistId: r.dentist_id, start: new Date(r.starts_at), end: new Date(r.ends_at) });
  const visits = appts.data.filter((a) => a.id !== ignoreId).map(busy);
  return { visits, blocks: [...visits, ...off.data.map(busy)] };
}

// Free times per date for these dentists, plus each dentist's visit count per date (for pickDentist).
async function freeFor(sb: SupabaseClient, c: Clinic, dentists: Dentist[], minutes: number, from: string, days: number, ignoreId?: string) {
  const free: Record<string, Free[]> = {};
  const load: Record<string, Record<string, number>> = {};
  if (!dentists.length) return { free, load };
  const { visits, blocks } = await busyFor(sb, c, dentists.map((d) => d.id), from, days, ignoreId);
  for (const v of visits) {
    const day = (load[localDate(v.start, c.utc_offset_minutes)] ??= {});
    day[v.dentistId] = (day[v.dentistId] ?? 0) + 1;
  }
  const now = new Date();
  for (const date of dateList(from, days)) free[date] = freeByDentist(dentists, blocks, minutes, date, now, c.utc_offset_minutes);
  return { free, load };
}

export async function availability(
  sb: SupabaseClient, c: Clinic,
  q: { serviceId: string; from: string; days: number; dentistId?: string | null; ignoreId?: string },
): Promise<Record<string, Free[]>> {
  const service = c.services.find((s) => s.id === q.serviceId);
  if (!service) return {};
  return (await freeFor(sb, c, dentistsFor(c, q.serviceId, q.dentistId), service.minutes, q.from, q.days, q.ignoreId)).free;
}

export type BookResult =
  | { ok: true; id: string; dentistId: string; date: string; time: string }
  | { ok: false; reason: "taken" | "unavailable" | "too_far" | "unknown_service" | "no_dentist"; free?: string[] };

// Shared by book and move: is `time` free on `date` for one of `dentists`, and who takes it?
async function claim(sb: SupabaseClient, c: Clinic, dentists: Dentist[], minutes: number, date: string, time: string, prefer?: string, ignoreId?: string) {
  if (tooFar(date, localDate(new Date(), c.utc_offset_minutes))) return { ok: false, reason: "too_far" } as const;
  if (!dentists.length) return { ok: false, reason: "no_dentist" } as const;
  const { free, load } = await freeFor(sb, c, dentists, minutes, date, 1, ignoreId);
  const slot = free[date].find((f) => f.time === time);
  if (!slot) return { ok: false, reason: "unavailable", free: free[date].map((f) => f.time) } as const;
  const dentistId = prefer && slot.dentistIds.includes(prefer) ? prefer : pickDentist(slot.dentistIds, load[date] ?? {});
  const start = toUtc(date, time, c.utc_offset_minutes);
  return { ok: true, dentistId, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + minutes * 60_000).toISOString() } as const;
}

export async function bookVisit(
  sb: SupabaseClient, c: Clinic,
  v: { patientId: string; serviceId: string; date: string; time: string; dentistId?: string | null; source: string },
): Promise<BookResult> {
  const service = c.services.find((s) => s.id === v.serviceId);
  if (!service) return { ok: false, reason: "unknown_service" };
  const got = await claim(sb, c, dentistsFor(c, v.serviceId, v.dentistId), service.minutes, v.date, v.time);
  if (!got.ok) return got;
  const { data, error } = await sb.from("appointments")
    .insert({ clinic_id: c.id, patient_id: v.patientId, service: service.name, service_id: service.id, dentist_id: got.dentistId, starts_at: got.starts_at, ends_at: got.ends_at, source: v.source })
    .select("id").single();
  if (error?.code === "23P01") return { ok: false, reason: "taken" };
  if (error) throw error;
  return { ok: true, id: data.id, dentistId: got.dentistId, date: v.date, time: v.time };
}

export async function moveVisit(
  sb: SupabaseClient, c: Clinic,
  v: { id: string; date: string; time: string; dentistId?: string | null },
): Promise<BookResult> {
  const { data: a, error: e1 } = await sb.from("appointments").select("dentist_id, service_id, starts_at, ends_at").eq("id", v.id).eq("clinic_id", c.id).single();
  if (e1) throw e1;
  const minutes = (Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60_000;
  // A visit whose service was archived has no match in c.services: only a chosen or its current dentist can take it.
  const dentists = a.service_id && c.services.some((s) => s.id === a.service_id)
    ? dentistsFor(c, a.service_id, v.dentistId)
    : c.dentists.filter((d) => d.active && d.id === (v.dentistId ?? a.dentist_id));
  const got = await claim(sb, c, dentists, minutes, v.date, v.time, v.dentistId ?? a.dentist_id, v.id);
  if (!got.ok) return got;
  const { error } = await sb.from("appointments")
    .update({ dentist_id: got.dentistId, starts_at: got.starts_at, ends_at: got.ends_at, reminded_24h_at: null, reminded_2h_at: null, confirmed_at: null })
    .eq("id", v.id).eq("clinic_id", c.id);
  if (error?.code === "23P01") return { ok: false, reason: "taken" };
  if (error) throw error;
  return { ok: true, id: v.id, dentistId: got.dentistId, date: v.date, time: v.time };
}

export async function cancelVisit(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("appointments").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;
}

// Future booked visits that no longer fit this dentist: outside their hours, inside time off, or any if inactive.
export async function clashes(sb: SupabaseClient, c: Clinic, dentistId: string) {
  const d = c.dentists.find((x) => x.id === dentistId);
  if (!d) return [];
  const now = new Date().toISOString();
  const [appts, off] = await Promise.all([
    sb.from("appointments").select("id, starts_at, ends_at, service, patients(name)").eq("clinic_id", c.id).eq("dentist_id", dentistId)
      .eq("status", "booked").gt("starts_at", now).order("starts_at"),
    sb.from("time_off").select("starts_at, ends_at").eq("clinic_id", c.id).eq("dentist_id", dentistId).gt("ends_at", now),
  ]);
  if (appts.error) throw appts.error;
  if (off.error) throw off.error;
  const inHours = (a: { starts_at: string; ends_at: string }) => {
    const date = localDate(new Date(a.starts_at), c.utc_offset_minutes);
    const windows = d.hours[DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]] ?? [];
    return windows.some(([open, close]) =>
      Date.parse(a.starts_at) >= toUtc(date, open, c.utc_offset_minutes).getTime() && Date.parse(a.ends_at) <= toUtc(date, close, c.utc_offset_minutes).getTime());
  };
  const inOff = (a: { starts_at: string; ends_at: string }) =>
    off.data.some((o) => Date.parse(o.starts_at) < Date.parse(a.ends_at) && Date.parse(a.starts_at) < Date.parse(o.ends_at));
  return appts.data
    .filter((a) => !d.active || !inHours(a) || inOff(a))
    .map((a) => ({ id: a.id as string, starts_at: a.starts_at as string, service: a.service as string, patient: (a.patients as unknown as { name: string | null } | null)?.name ?? null }));
}
