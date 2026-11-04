"use server";

// Owner setup. RLS (is_owner) is the real guard; the role check here only gives staff a clear message.
import { refresh } from "next/cache";
import { clashes, hoursInside } from "@/lib/booking";
import { deskConfig, forgetClinic } from "@/lib/clinics";
import { desk } from "@/lib/dashboard";
import { logEvent } from "@/lib/events";
import { wipePlan } from "@/lib/wipe";
import { z } from "zod";
import { DAYS, toUtc, type Hours } from "@/lib/slots";

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
// Server actions are public endpoints: check the shape, not only what the form would send.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const validHours = (h: Hours) =>
  !!h && typeof h === "object" && Object.entries(h).every(([day, w]) => (DAYS as readonly string[]).includes(day) && (w == null || (Array.isArray(w) && w.every((p) => Array.isArray(p) && TIME.test(p[0]) && TIME.test(p[1]) && p[0] < p[1]))));
const ids = (list: unknown) => Array.isArray(list) && list.every((id) => z.uuid().safeParse(id).success);
const isDate = (d: string) => z.iso.date().safeParse(d).success;

export async function saveClinic(v: { name: string; phone: string; address: string; maps_url: string; hours: Hours; insurers: string[]; faq: { q: string; a: string }[] }): Promise<SaveResult> {
  const o = await owner();
  if ("error" in o) return o;
  if (!v.name.trim()) return { error: "The clinic needs a name." };
  if (v.insurers.length > 50 || v.faq.length > 30 || v.faq.some((f) => f.q.length > 300 || f.a.length > 1000)) return { error: "Keep it shorter: at most 50 insurers and 30 FAQ entries." };
  if (!validHours(v.hours)) return { error: "Each opening window needs a start before its end." };
  const outside = (await deskConfig(o.sb, o.clinicId)).dentists.filter((d) => d.active && !hoursInside(d.hours, v.hours));
  if (outside.length) return { error: `Shorten these dentists' hours first, they work outside the new opening hours: ${outside.map((d) => d.name).join(", ")}.` };
  const { error } = await o.sb.from("clinics").update({
    name: v.name.trim().slice(0, 120), phone: v.phone.trim().slice(0, 40) || null, address: v.address.trim() || null, maps_url: v.maps_url.trim() || null,
    hours: v.hours, insurers: v.insurers.map((s) => s.trim()).filter(Boolean), faq: v.faq.filter((f) => f.q.trim() && f.a.trim()),
  }).eq("id", o.clinicId);
  if (error) return { error: "Could not save the clinic." };
  done(o.clinicId);
  return {};
}

// Replace who offers a service / what a dentist offers: add the new pairs first, then drop the rest, so a failed write never leaves a service with nobody.
async function relink(sb: Awaited<ReturnType<typeof desk>>["sb"], clinicId: string, by: "service_id" | "dentist_id", id: string, pairs: { dentist_id: string; service_id: string }[]) {
  if (pairs.length) {
    const ins = await sb.from("dentist_services").upsert(pairs.map((p) => ({ clinic_id: clinicId, ...p })), { onConflict: "dentist_id,service_id", ignoreDuplicates: true });
    if (ins.error) return false;
  }
  const other = by === "service_id" ? "dentist_id" : "service_id";
  let del = sb.from("dentist_services").delete().eq(by, id);
  if (pairs.length) del = del.not(other, "in", `(${pairs.map((p) => p[other]).join(",")})`);
  return !(await del).error;
}

export async function saveService(v: { id?: string; name: string; name_ar: string; minutes: number; price_aed: number | null; active: boolean; dentistIds: string[] }): Promise<SaveResult> {
  const o = await owner();
  if ("error" in o) return o;
  if (!v.name.trim() || !(v.minutes >= 5 && v.minutes <= 480)) return { error: "Give the service a name and a length between 5 and 480 minutes." };
  if (v.price_aed != null && !(v.price_aed >= 0 && v.price_aed <= 1_000_000)) return { error: "The price must be zero or more." };
  if ((v.id && !ids([v.id])) || !ids(v.dentistIds)) return { error: "Could not save the service." };
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
  if ((v.id && !ids([v.id])) || !ids(v.serviceIds)) return { error: "Could not save the dentist." };
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
  if (!ids([v.dentistId]) || !isDate(v.from) || !isDate(v.to) || v.to < v.from) return { error: "Pick a dentist and a date range." };
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

// Test patients only (needs 0009: the delete policy matches is_test rows alone). Their visits, chats and messages cascade.
export async function resetTestChats(): Promise<SaveResult> {
  const o = await owner();
  if ("error" in o) return o;
  const { error } = await o.sb.from("patients").delete().eq("clinic_id", o.clinicId).eq("is_test", true);
  if (error) return { error: "Could not reset the test chats." };
  done(o.clinicId);
  return {};
}

// Owner deletes (needs 0012). RLS returns 0 rows to anyone else, so an empty result is reported, not hidden.
// A patient takes their visits, chat, messages and events with them (on delete cascade).
const MAX_DELETE = 200;
async function remove(table: "patients" | "appointments" | "services" | "dentists", list: string[], what: string): Promise<SaveResult> {
  const o = await owner();
  if ("error" in o) return o;
  if (!list.length || list.length > MAX_DELETE || !ids(list)) return { error: `Pick between 1 and ${MAX_DELETE} ${what}.` };
  const { data, error } = await o.sb.from(table).delete().eq("clinic_id", o.clinicId).in("id", list).select("id");
  if (error?.code === "23503") return { error: "This dentist still has visits. Deactivate them instead." };
  if (error || !data.length) return { error: `Could not delete the ${what}.` };
  done(o.clinicId);
  return {};
}
export const deletePatients = async (list: string[]) => remove("patients", list, "patients");
export const deleteVisits = async (list: string[]) => remove("appointments", list, "visits");
export const deleteService = async (id: string) => remove("services", [id], "service");
export const deleteDentist = async (id: string) => remove("dentists", [id], "dentist");

// Settings > Data: the owner clears whole categories. The typed clinic name is the "are you sure".
// ponytail: separate deletes, not one transaction; a failure midway reports what went. Move into a SQL function if that ever happens.
export async function wipeData(kinds: string[], typedName: string): Promise<SaveResult & { done?: string[] }> {
  const o = await owner();
  if ("error" in o) return o;
  const plan = wipePlan(kinds);
  if (!plan) return { error: "Pick what to delete." };
  const { data: c } = await o.sb.from("clinics").select("name").eq("id", o.clinicId).single();
  if (!c || typedName.trim() !== c.name.trim()) return { error: "Type the clinic name exactly to confirm." };

  const cleared: string[] = [];
  for (const kind of plan) {
    let error: { message: string } | null = null;
    if (kind === "chats") {
      ({ error } = await o.sb.from("messages").delete().eq("clinic_id", o.clinicId));
      // Conversations carry no clinic_id: scope them by this clinic's patients, in chunks (an owner may own several clinics).
      const { data: pts, error: pe } = await o.sb.from("patients").select("id").eq("clinic_id", o.clinicId);
      error ??= pe;
      const ids = (pts ?? []).map((p) => p.id);
      for (let i = 0; !error && i < ids.length; i += 200) ({ error } = await o.sb.from("conversations").delete().in("patient_id", ids.slice(i, i + 200)));
    } else {
      const table = { calendar: "appointments", activity: "agent_events", patients: "patients", services: "services", dentists: "dentists" }[kind];
      ({ error } = await o.sb.from(table).delete().eq("clinic_id", o.clinicId));
    }
    if (error) {
      done(o.clinicId); // a failed step may still have deleted part of its rows
      return { error: `Could not delete ${kind}.${cleared.length ? ` Already deleted: ${cleared.join(", ")}.` : ""}`, done: cleared };
    }
    cleared.push(kind);
  }
  if (!plan.includes("activity"))
    await logEvent(o.sb, { clinicId: o.clinicId, actor: "staff", kind: "data_wipe", level: "warn", summary: `Owner deleted all ${plan.join(", ")}` });
  done(o.clinicId);
  return { done: cleared };
}
