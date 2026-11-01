// Tenants: each clinic row carries its config; its UltraMsg credentials live in clinic_secrets (service role only).
import { db } from "./db";
import type { Hours } from "./slots";
import { normInstance, type WaCreds } from "./whatsapp";

export type Service = { id: string; name: string; name_ar: string; minutes: number; price_aed: number; active: boolean; sort: number };
export type Dentist = {
  id: string; name: string; name_ar: string | null; title: string | null; color: string | null;
  hours: Hours; active: boolean; sort: number; service_ids: string[];
};
export type Clinic = {
  id: string;
  slug: string | null;
  name: string;
  utc_offset_minutes: number;
  hours: Hours;
  services: Service[];
  dentists: Dentist[];
  insurers: string[];
  faq: { q: string; a: string }[];
  phone: string | null;
  address: string | null;
  maps_url: string | null;
  persona: { name?: string };
  branding: { logo?: string; accent?: string };
  staff_whatsapp: string | null;
  ultramsg_instance_id: string | null;
  active: boolean;
  wa: WaCreds | null; // null = WhatsApp not connected
  webhook_secret: string | null;
};

type Row = Omit<Clinic, "wa" | "webhook_secret" | "dentists" | "services"> & {
  clinic_secrets: { ultramsg_token: string; webhook_secret: string } | null;
  service_rows: Service[];
  dentists: (Omit<Dentist, "service_ids"> & { dentist_services: { service_id: string }[] })[];
};

const SELECT = "*, clinic_secrets(ultramsg_token, webhook_secret), service_rows:services(*), dentists(*, dentist_services(service_id))";

// Sorted by `sort`, then name. The legacy clinics.services jsonb is ignored.
const bySortName = (a: { sort: number; name: string }, b: { sort: number; name: string }) => a.sort - b.sort || a.name.localeCompare(b.name);

export function toClinic({ clinic_secrets: s, service_rows, dentists, ...row }: Row): Clinic {
  return {
    ...row,
    services: [...service_rows].filter((x) => x.active).sort(bySortName),
    dentists: [...dentists].sort(bySortName).map(({ dentist_services, ...d }) => ({ ...d, service_ids: dentist_services.map((x) => x.service_id) })),
    persona: row.persona ?? {},
    branding: row.branding ?? {},
    wa: s && row.ultramsg_instance_id ? { instanceId: row.ultramsg_instance_id, token: s.ultramsg_token } : null,
    webhook_secret: s?.webhook_secret ?? null,
  };
}

export const personaName = (c: Pick<Clinic, "persona">) => c.persona?.name || "Sara";

// ponytail: clinic rows cached per server process for 60 s, so edits made on another server instance show up within a minute. Saves on this instance call forgetClinic.
const TTL = 60_000;
const cache = new Map<string, { clinic: Clinic; at: number }>();
const remember = (clinic: Clinic) => (cache.set(clinic.id, { clinic, at: Date.now() }), clinic);

export const forgetClinic = (id: string) => void cache.delete(id);

export async function loadClinic(id: string): Promise<Clinic> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.clinic;
  const { data, error } = await db().from("clinics").select(SELECT).eq("id", id).single();
  if (error) throw error;
  return remember(toClinic(data as Row));
}

export async function clinicByInstance(instanceId: string): Promise<Clinic | null> {
  const id = normInstance(instanceId);
  for (const { clinic, at } of cache.values()) if (clinic.ultramsg_instance_id === id && Date.now() - at < TTL) return clinic;
  const { data, error } = await db().from("clinics").select(SELECT).eq("ultramsg_instance_id", id).maybeSingle();
  if (error) throw error;
  return data ? remember(toClinic(data as Row)) : null;
}

export async function activeClinics(): Promise<Clinic[]> {
  const { data, error } = await db().from("clinics").select(SELECT).eq("active", true);
  if (error) throw error;
  return (data as Row[]).map((r) => remember(toClinic(r)));
}

export async function clinicBySlug(slug: string): Promise<Clinic | null> {
  for (const { clinic, at } of cache.values()) if (clinic.slug === slug && Date.now() - at < TTL) return clinic;
  const { data, error } = await db().from("clinics").select(SELECT).eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data ? remember(toClinic(data as Row)) : null;
}
