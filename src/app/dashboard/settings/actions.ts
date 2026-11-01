"use server";

// Owner setup. RLS (is_owner) is the real guard; the role check here only gives staff a clear message.
import { refresh } from "next/cache";
import { clashes, hoursInside } from "@/lib/booking";
import { deskConfig, forgetClinic } from "@/lib/clinics";
import { desk } from "@/lib/dashboard";
import { toUtc, type Hours } from "@/lib/slots";

export type Clash = Awaited<ReturnType<typeof clashes>>[number];
export type SaveResult = { error?: string; clashes?: Clash[] };

async function owner() {
  const { sb, clinic } = await desk();
  if (!clinic) return { error: "No clinic." } as const;
  if (clinic.role !== "owner") return { error: "Only the clinic owner can change settings." } as const;
  return { sb, clinicId: clinic.id };
}
const done = (id: string) => {
  forgetClinic(id);
  refresh();
};
const TIME = /^\d{2}:\d{2}$/;
const validHours = (h: Hours) => Object.values(h).every((w) => w?.every(([a, b]) => TIME.test(a) && TIME.test(b) && a < b));

export async function saveClinic(v: { name: string; phone: string; address: string; maps_url: string; hours: Hours; insurers: string[]; faq: { q: string; a: string }[] }): Promise<SaveResult> {
  const o = await owner();
  if ("error" in o) return o;
  if (!v.name.trim()) return { error: "The clinic needs a name." };
  if (!validHours(v.hours)) return { error: "Each opening window needs a start before its end." };
  const { error } = await o.sb.from("clinics").update({
    name: v.name.trim(), phone: v.phone.trim() || null, address: v.address.trim() || null, maps_url: v.maps_url.trim() || null,
    hours: v.hours, insurers: v.insurers.map((s) => s.trim()).filter(Boolean), faq: v.faq.filter((f) => f.q.trim() && f.a.trim()),
  }).eq("id", o.clinicId);
  if (error) return { error: "Could not save the clinic." };
  done(o.clinicId);
  return {};
}

// Replace who offers a service / what a dentist offers in one go.
async function relink(sb: Awaited<ReturnType<typeof desk>>["sb"], clinicId: string, by: "service_id" | "dentist_id", id: string, pairs: { dentist_id: string; service_id: string }[]) {
  const del = await sb.from("dentist_services").delete().eq(by, id);
  if (del.error) return false;
  if (!pairs.length) return true;
  const ins = await sb.from("dentist_services").insert(pairs.map((p) => ({ clinic_id: clinicId, ...p })));
  return !ins.error;
}

export async function saveService(v: { id?: string; name: string; name_ar: string; minutes: number; price_aed: number | null; active: boolean; dentistIds: string[] }): Promise<SaveResult> {
  const o = await owner();
  if ("error" in o) return o;
  if (!v.name.trim() || !(v.minutes >= 5 && v.minutes <= 480)) return { error: "Give the service a name and a length between 5 and 480 minutes." };
  const row = { clinic_id: o.clinicId, name: v.name.trim(), name_ar: v.name_ar.trim() || null, minutes: Math.round(v.minutes), price_aed: v.price_aed, active: v.active };
  const { data, error } = v.id
    ? await o.sb.from("services").update(row).eq("id", v.id).eq("clinic_id", o.clinicId).select("id").single()
    : await o.sb.from("services").insert(row).select("id").single();
  if (error) return { error: error.code === "23505" ? "A service with this name exists already." : "Could not save the service." };
  if (!(await relink(o.sb, o.clinicId, "service_id", data.id, v.dentistIds.map((d) => ({ dentist_id: d, service_id: data.id }))))) return { error: "Saved, but could not update who offers it." };
  done(o.clinicId);
  return {};
}

export async function saveDentist(v: { id?: string; name: string; name_ar: string; title: string; color: string; hours: Hours; active: boolean; serviceIds: string[] }): Promise<SaveResult> {
  const o = await owner();
  if ("error" in o) return o;
  if (!v.name.trim()) return { error: "The dentist needs a name." };
  if (!/^#[0-9a-f]{6}$/i.test(v.color)) return { error: "Pick a colour." };
  if (!validHours(v.hours)) return { error: "Each window needs a start before its end." };
  const clinic = await deskConfig(o.sb, o.clinicId);
  if (!hoursInside(v.hours, clinic.hours)) return { error: "Working hours must sit inside the clinic's opening hours." };
  const row = { clinic_id: o.clinicId, name: v.name.trim(), name_ar: v.name_ar.trim() || null, title: v.title.trim() || null, color: v.color, hours: v.hours, active: v.active };
  const { data, error } = v.id
    ? await o.sb.from("dentists").update(row).eq("id", v.id).eq("clinic_id", o.clinicId).select("id").single()
    : await o.sb.from("dentists").insert(row).select("id").single();
  if (error) return { error: "Could not save the dentist." };
  if (!(await relink(o.sb, o.clinicId, "dentist_id", data.id, v.serviceIds.map((s) => ({ dentist_id: data.id, service_id: s }))))) return { error: "Saved, but could not update their services." };
  done(o.clinicId);
  return { clashes: await clashes(o.sb, await deskConfig(o.sb, o.clinicId), data.id) };
}

// Whole days in clinic time: from the start of `from` to the end of `to`.
export async function saveTimeOff(v: { dentistId: string; from: string; to: string; reason: string }): Promise<SaveResult> {
  const o = await owner();
  if ("error" in o) return o;
  if (!v.dentistId || !v.from || !v.to || v.to < v.from) return { error: "Pick a dentist and a date range." };
  const clinic = await deskConfig(o.sb, o.clinicId);
  const start = toUtc(v.from, "00:00", clinic.utc_offset_minutes);
  const end = new Date(toUtc(v.to, "00:00", clinic.utc_offset_minutes).getTime() + 86_400_000);
  const { error } = await o.sb.from("time_off").insert({ clinic_id: o.clinicId, dentist_id: v.dentistId, starts_at: start.toISOString(), ends_at: end.toISOString(), reason: v.reason.trim() || null });
  if (error) return { error: "Could not save the time off." };
  done(o.clinicId);
  return { clashes: await clashes(o.sb, clinic, v.dentistId) };
}

export async function deleteTimeOff(id: string): Promise<SaveResult> {
  const o = await owner();
  if ("error" in o) return o;
  const { error } = await o.sb.from("time_off").delete().eq("id", id).eq("clinic_id", o.clinicId);
  if (error) return { error: "Could not remove it." };
  done(o.clinicId);
  return {};
}

// White text on the accent must stay readable (WCAG AA, 4.5:1).
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

export async function saveBranding(v: { accent: string; logo: string }): Promise<SaveResult> {
  const o = await owner();
  if ("error" in o) return o;
  if (v.accent && !/^#[0-9a-f]{6}$/i.test(v.accent)) return { error: "Accent must be a colour like #2f6f5e." };
  if (v.accent && 1.05 / (lum(v.accent) + 0.05) < 4.5) return { error: "That accent is too light: white text on it would be hard to read." };
  if (v.logo && !/^https:\/\//.test(v.logo)) return { error: "The logo must be an https link." };
  const { error } = await o.sb.from("clinics").update({ branding: { ...(v.accent ? { accent: v.accent } : {}), ...(v.logo ? { logo: v.logo } : {}) } }).eq("id", o.clinicId);
  if (error) return { error: "Could not save the chat widget." };
  done(o.clinicId);
  return {};
}
