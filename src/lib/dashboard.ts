// Staff dashboard data: the signed-in user's Supabase client (RLS) and the clinic they are looking at.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { stillPaused } from "./agent";
import type { Clinic } from "./clinics";
import { roleOf, type Role } from "./role";
import { supabaseServer } from "./supabase/server";
import { DAYS, localDate, localTime, type Hours } from "./slots";

export type DeskClinic = { id: string; name: string; hours: Hours; utc_offset_minutes: number; phone: string | null; staff_whatsapp: string | null; role: Role };
export const CLINIC_COOKIE = "desk_clinic";
export const ACTIVITY_SEEN_COOKIE = "activity_seen";

// RLS returns only clinics the user belongs to (every clinic for platform admins). Cached per request.
export const desk = cache(async () => {
  await connection(); // the session check reads the clock (token expiry), so render at request time
  const sb = await supabaseServer();
  const { data: claims } = await sb.auth.getClaims();
  if (!claims?.claims) redirect("/login");
  const [{ data }, { data: mine }] = await Promise.all([
    sb.from("clinics").select("id, name, hours, utc_offset_minutes, phone, staff_whatsapp").order("name"),
    sb.from("memberships").select("clinic_id, role"),
  ]);
  const clinics = (data ?? []).map((c) => ({ ...c, role: roleOf(mine ?? [], c.id) })) as DeskClinic[];
  const picked = (await cookies()).get(CLINIC_COOKIE)?.value;
  const clinic = clinics.find((c) => c.id === picked) ?? clinics[0] ?? null;
  return { sb, clinics, clinic, email: (claims.claims.email as string | undefined) ?? "" };
});

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

// UAE week: Saturday to Friday.
export const weekStart = (date: string) => addDays(date, -((weekday(date) + 1) % 7));
export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
export { addDays };

const toHours = (hhmm: string) => Number(hhmm.slice(0, 2)) + Number(hhmm.slice(3, 5)) / 60;
export const hourOf = (d: Date, offsetMin: number) => toHours(localTime(d, offsetMin));

// Earliest opening and latest closing hour of the week, for the calendar grid.
export function dayRange(hours: Hours) {
  const spans = Object.values(hours).flat().filter(Boolean) as [string, string][];
  if (!spans.length) return { from: 9, to: 21 };
  return { from: Math.floor(Math.min(...spans.map(([a]) => toHours(a)))), to: Math.ceil(Math.max(...spans.map(([, b]) => toHours(b)))) };
}

// True when a moment falls outside the clinic's opening hours (what "after hours" means in the tally).
export function afterHours(d: Date, hours: Hours, offsetMin: number) {
  const day = DAYS[weekday(localDate(d, offsetMin))];
  const t = localTime(d, offsetMin);
  return !(hours[day] ?? []).some(([a, b]) => t >= a && t < b);
}

export const who = (p: { name: string | null; phone: string | null; wa_id: string | null } | null) =>
  p?.name || p?.phone || (p?.wa_id ? `+${p.wa_id.replace(/@.*/, "")}` : "Website visitor");

type Sb = Awaited<ReturnType<typeof supabaseServer>>;
type Kind = "wa" | "web" | "staff";
const DAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

// One week of visits as calendar blocks. Red = the patient's chat is waiting for staff.
export async function week(sb: Sb, clinic: DeskClinic, start: string, link?: (id: string) => string) {
  const off = clinic.utc_offset_minutes;
  const days = weekDays(start);
  const today = localDate(new Date(), off);
  const from = new Date(Date.parse(`${start}T00:00:00Z`) - off * 60_000).toISOString();
  const to = new Date(Date.parse(`${addDays(start, 7)}T00:00:00Z`) - off * 60_000).toISOString();
  const { data } = await sb
    .from("appointments")
    .select("id, service, starts_at, ends_at, status, source, created_at, patients(name, phone, wa_id, conversations(bot_paused, updated_at))")
    .eq("clinic_id", clinic.id)
    .neq("status", "cancelled")
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at");
  const rows = (data ?? []) as unknown as Visit[];
  const blocks = rows.map((a) => {
    const s = new Date(a.starts_at);
    const kind: Kind = stillPaused(a.patients?.conversations ?? null) ? "staff" : a.patients?.wa_id ? "wa" : "web";
    return {
      id: a.id,
      day: days.indexOf(localDate(s, off)),
      start: hourOf(s, off),
      end: hourOf(new Date(a.ends_at), off),
      title: a.service,
      name: who(a.patients),
      kind,
      muted: a.status === "no_show",
      href: link?.(a.id),
    };
  });
  const nowDay = days.indexOf(today);
  return {
    rows,
    blocks,
    days: days.map((d) => ({ label: DAY_FMT.format(new Date(`${d}T00:00:00Z`)), date: Number(d.slice(8)), today: d === today })),
    now: nowDay >= 0 ? { day: nowDay, hour: hourOf(new Date(), off) } : undefined,
    ...dayRange(clinic.hours),
  };
}

export type Visit = {
  id: string;
  service: string;
  starts_at: string;
  ends_at: string;
  status: string;
  source: string;
  created_at: string;
  patients: { name: string | null; phone: string | null; wa_id: string | null; is_test?: boolean; conversations: { bot_paused: boolean; updated_at: string } | null } | null;
};

// ---------------------------------------------------------------- calendar: day = one column per dentist, week = one column per day

export type SBlock = { id: string; column: string; start: number; end: number; title: string; name: string; kind: Kind; muted: boolean; test: boolean; color: string | null };
export type SCol = { key: string; label: string; sub?: string; today?: boolean; date: string; dentistId?: string };
export type Off = { column: string; from: number; to: number };

// Closed stretches of [lo, hi] outside the given opening windows.
export function gaps(wins: [string, string][], [lo, hi]: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  let t = lo;
  for (const [a, b] of [...wins].sort()) {
    if (toHours(a) > t) out.push([t, Math.min(toHours(a), hi)]);
    t = Math.max(t, toHours(b));
  }
  if (t < hi) out.push([t, hi]);
  return out.filter(([a, b]) => b > a);
}

const SHORT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });

export async function schedule(sb: Sb, clinic: Clinic, q: { view: "day" | "week"; date: string; dentistId?: string }) {
  const off = clinic.utc_offset_minutes;
  const today = localDate(new Date(), off);
  const r = dayRange(clinic.hours);
  const range: [number, number] = [r.from, r.to];
  const dentists = clinic.dentists.filter((d) => d.active && (!q.dentistId || d.id === q.dentistId));
  const days = q.view === "week" ? weekDays(weekStart(q.date)) : [q.date];
  const startIso = new Date(Date.parse(`${days[0]}T00:00:00Z`) - off * 60_000).toISOString();
  const endIso = new Date(Date.parse(`${addDays(days.at(-1)!, 1)}T00:00:00Z`) - off * 60_000).toISOString();
  let visits = sb
    .from("appointments")
    .select("id, service, starts_at, ends_at, status, source, created_at, dentist_id, patient_id, service_id, patients(name, phone, wa_id, is_test, conversations(bot_paused, updated_at))")
    .eq("clinic_id", clinic.id).neq("status", "cancelled").gte("starts_at", startIso).lt("starts_at", endIso).order("starts_at");
  if (q.dentistId) visits = visits.eq("dentist_id", q.dentistId);
  const [{ data }, { data: away }] = await Promise.all([
    visits,
    sb.from("time_off").select("dentist_id, starts_at, ends_at").eq("clinic_id", clinic.id).lt("starts_at", endIso).gt("ends_at", startIso),
  ]);
  const rows = (data ?? []) as unknown as (Visit & { dentist_id: string; patient_id: string; service_id: string | null })[];
  const color = (id: string) => clinic.dentists.find((d) => d.id === id)?.color ?? null;

  const columns: SCol[] = q.view === "week"
    ? days.map((d) => ({ key: d, date: d, label: SHORT.format(new Date(`${d}T00:00:00Z`)), today: d === today }))
    : dentists.map((d) => ({ key: d.id, date: q.date, dentistId: d.id, label: d.name, sub: d.title ?? undefined }));
  const colOf = (v: { starts_at: string; dentist_id: string }) => (q.view === "week" ? localDate(new Date(v.starts_at), off) : v.dentist_id);

  const blocks: SBlock[] = rows.filter((v) => columns.some((c) => c.key === colOf(v))).map((a) => {
    const s = new Date(a.starts_at);
    return {
      id: a.id, column: colOf(a), start: hourOf(s, off), end: hourOf(new Date(a.ends_at), off), title: a.service, name: who(a.patients),
      kind: stillPaused(a.patients?.conversations ?? null) ? "staff" : a.patients?.wa_id ? "wa" : "web",
      muted: a.status === "no_show", test: !!a.patients?.is_test, color: color(a.dentist_id),
    };
  });

  // Shade closed hours: the dentist's own hours in day view, the clinic's (or the one picked dentist's) in week view.
  const shade: Off[] = [];
  for (const c of columns) {
    const dow = DAYS[weekday(c.date)];
    const hours = c.dentistId ? dentists.find((d) => d.id === c.dentistId)!.hours : q.dentistId && dentists[0] ? dentists[0].hours : clinic.hours;
    for (const [from, to] of gaps(hours[dow] ?? [], range)) shade.push({ column: c.key, from, to });
    for (const t of away ?? []) {
      if (c.dentistId ? t.dentist_id !== c.dentistId : !(q.dentistId && t.dentist_id === q.dentistId)) continue;
      const dayStart = Date.parse(`${c.date}T00:00:00Z`) - off * 60_000;
      const from = Math.max(range[0], (Date.parse(t.starts_at) - dayStart) / 3_600_000);
      const to = Math.min(range[1], (Date.parse(t.ends_at) - dayStart) / 3_600_000);
      if (to > from) shade.push({ column: c.key, from, to });
    }
  }
  const nowCol = q.view === "week" ? (days.includes(today) ? today : null) : q.date === today ? "*" : null;
  return { columns, blocks, off: shade, range, rows, now: nowCol ? { column: nowCol, hour: hourOf(new Date(), off) } : null };
}

// What the booking dialog needs to know about the clinic (plain data, safe to pass to the client).
export const deskSetup = (c: Clinic) => ({
  today: localDate(new Date(), c.utc_offset_minutes),
  services: c.services.map((s) => ({ id: s.id, name: s.name, minutes: s.minutes })),
  dentists: c.dentists.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name, color: d.color, service_ids: d.service_ids })),
});
