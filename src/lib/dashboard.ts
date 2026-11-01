// Staff dashboard data: the signed-in user's Supabase client (RLS) and the clinic they are looking at.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { stillPaused } from "./agent";
import { roleOf, type Role } from "./role";
import { supabaseServer } from "./supabase/server";
import { DAYS, localDate, localTime, type Hours } from "./slots";

export type DeskClinic = { id: string; name: string; hours: Hours; utc_offset_minutes: number; phone: string | null; staff_whatsapp: string | null; role: Role };
export const CLINIC_COOKIE = "desk_clinic";

// RLS returns only clinics the user belongs to (every clinic for platform admins). Cached per request.
export const desk = cache(async () => {
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
  patients: { name: string | null; phone: string | null; wa_id: string | null; conversations: { bot_paused: boolean; updated_at: string } | null } | null;
};
