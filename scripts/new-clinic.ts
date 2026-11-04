// Concierge onboarding: creates (or updates) one clinic from a JSON file. Run: bun scripts/new-clinic.ts clinic.json
// See scripts/new-clinic.example.json. Writes to the live Supabase project (SUPABASE_URL + service role key from .env.local).
// Re-running with the same slug updates the clinic, services and dentists by name; it never deletes anything.
// Logins: owner and staff accounts are created without a password. They sign in with the magic link on /login,
// then set a password under Account. No secret is printed. WhatsApp is wired later, per clinic, by hand.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { DAYS, type Hours } from "../src/lib/slots";

type Config = {
  slug: string; name: string; utc_offset_minutes?: number; phone?: string; address?: string; maps_url?: string;
  hours: Hours; insurers?: string[]; faq?: { q: string; a: string }[];
  persona?: { name?: string }; branding?: { accent?: string; logo?: string };
  services: { name: string; name_ar?: string; minutes: number; price_aed?: number | null }[];
  dentists: { name: string; name_ar?: string; title?: string; color?: string; hours: Hours; services: string[] }[];
  owner: string; staff?: string[];
};

const fail = (msg: string): never => { console.error(msg); process.exit(1); };
const must = <T>({ data, error }: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => (error || data == null ? fail(`${what}: ${error?.message}`) : (data as NonNullable<T>));

const file = process.argv[2] ?? fail("Usage: bun scripts/new-clinic.ts <clinic.json>");
const c = JSON.parse(readFileSync(file, "utf8")) as Config;

// ---- Check the file before touching the database ----
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const okHours = (h: Hours) => Object.entries(h ?? {}).every(([d, w]) => (DAYS as readonly string[]).includes(d) && (w ?? []).every(([a, b]) => TIME.test(a) && TIME.test(b) && a < b));
if (!/^[a-z0-9-]{3,40}$/.test(c.slug ?? "")) fail("slug: 3-40 lowercase letters, digits or dashes");
if (!c.name?.trim()) fail("name is required");
if (!okHours(c.hours)) fail("hours: each window must be [\"HH:MM\", \"HH:MM\"] with start before end");
if (!c.services?.length) fail("add at least one service");
if (!c.dentists?.length) fail("add at least one dentist");
for (const d of c.dentists) {
  if (!okHours(d.hours)) fail(`${d.name}: bad hours`);
  for (const s of d.services) if (!c.services.some((x) => x.name === s)) fail(`${d.name} offers "${s}", which is not in services`);
}
if (!/^\S+@\S+\.\S+$/.test(c.owner ?? "")) fail("owner must be an email");

const sb = createClient(process.env.SUPABASE_URL ?? fail("SUPABASE_URL missing"), process.env.SUPABASE_SERVICE_ROLE_KEY ?? fail("SUPABASE_SERVICE_ROLE_KEY missing"), { auth: { persistSession: false } });

// ---- Clinic (by slug) ----
const row = {
  slug: c.slug, name: c.name.trim(), utc_offset_minutes: c.utc_offset_minutes ?? 240, hours: c.hours, services: [], // legacy jsonb, not null, unused since 0007
  phone: c.phone ?? null, address: c.address ?? null, maps_url: c.maps_url ?? null,
  insurers: c.insurers ?? [], faq: c.faq ?? [], persona: c.persona ?? { name: "Sara" }, branding: c.branding ?? {}, active: true,
};
const { data: found } = await sb.from("clinics").select("id").eq("slug", c.slug).maybeSingle();
const cid = (found
  ? must(await sb.from("clinics").update(row).eq("id", found.id).select("id").single(), "update clinic")
  : must(await sb.from("clinics").insert(row).select("id").single(), "create clinic")).id as string;

// ---- Services and dentists, matched by name ----
const upsertByName = async (table: "services" | "dentists", rows: Record<string, unknown>[]) => {
  const have = must(await sb.from(table).select("id, name").eq("clinic_id", cid), `read ${table}`);
  const ids: Record<string, string> = {};
  for (const [i, r] of rows.entries()) {
    const old = have.find((h) => h.name === r.name);
    const data = { ...r, clinic_id: cid, sort: i, active: true };
    ids[r.name as string] = (old
      ? must(await sb.from(table).update(data).eq("id", old.id).select("id").single(), `update ${r.name}`)
      : must(await sb.from(table).insert(data).select("id").single(), `create ${r.name}`)).id;
  }
  return ids;
};
const svc = await upsertByName("services", c.services.map((s) => ({ name: s.name, name_ar: s.name_ar ?? null, minutes: s.minutes, price_aed: s.price_aed ?? null })));
const den = await upsertByName("dentists", c.dentists.map((d) => ({ name: d.name, name_ar: d.name_ar ?? null, title: d.title ?? null, color: d.color ?? "#4f6f5c", hours: d.hours })));
must(await sb.from("dentist_services").upsert(
  c.dentists.flatMap((d) => d.services.map((s) => ({ clinic_id: cid, dentist_id: den[d.name], service_id: svc[s] }))),
  { onConflict: "dentist_id,service_id", ignoreDuplicates: true },
).select("dentist_id"), "dentist_services");

// ---- Logins (no password: magic link on /login, then Account > Change password) ----
const { data: list, error: le } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (le) fail(`list users: ${le.message}`);
for (const [email, role] of [[c.owner, "owner"], ...(c.staff ?? []).map((e) => [e, "staff"])] as [string, "owner" | "staff"][]) {
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  const created = existing ? null : await sb.auth.admin.createUser({ email, email_confirm: true });
  const user = existing ?? created?.data.user ?? fail(`create ${email}: ${created?.error?.message}`);
  must(await sb.from("memberships").upsert({ user_id: user.id, clinic_id: cid, role }).select("user_id"), `${email} membership`);
}

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sara-clinic-bot.vercel.app";
console.log(`${found ? "Updated" : "Created"} ${c.name}: ${c.services.length} services, ${c.dentists.length} dentists, ${1 + (c.staff?.length ?? 0)} logins.`);
console.log(`Chat: ${site}/chat/${c.slug}`);
console.log(`Logins: ${site}/login, "Email me a sign-in link", then Account > Change password.`);
