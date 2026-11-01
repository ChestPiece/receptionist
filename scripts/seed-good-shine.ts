// Seeds (or re-seeds) the "Good Shine Dental" sample clinic: 3 dentists, 8 services, ~25 patients, 4 weeks of history,
// a busy current + next week, chats (2 waiting for staff) and owner + staff logins. Run: bun scripts/seed-good-shine.ts
// Writes to the live Supabase project. Re-running deletes and rebuilds this clinic's data only (slug good-shine).
// All data is synthetic. Passwords go into .env.local only (gitignored), never to stdout.
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { assistant, user } from "@openai/agents";
import { createClient } from "@supabase/supabase-js";
import { DAYS, localDate, localTime, toUtc, type Hours } from "../src/lib/slots";

const SLUG = "good-shine";
const OFF = 240; // UTC+4
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const fail = (msg: string): never => { console.error(msg); process.exit(1); };
const must = <T>({ data, error }: { data: T | null; error: { message: string } | null }, what: string): T => (error || data === null ? fail(`${what}: ${error?.message}`) : data);

// Deterministic randomness, so every re-seed looks the same.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];

const now = new Date();
const today = localDate(now, OFF);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayKey = (date: string) => DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ---- Clinic ----
const SAT_THU: [string, string][] = [["09:00", "21:00"]];
const CLINIC = {
  slug: SLUG,
  name: "Good Shine Dental Clinic (sample data)",
  utc_offset_minutes: OFF,
  hours: { sat: SAT_THU, sun: SAT_THU, mon: SAT_THU, tue: SAT_THU, wed: SAT_THU, thu: SAT_THU, fri: [["16:00", "21:00"]] } satisfies Hours,
  services: [], // legacy jsonb, unused since 0007
  insurers: ["Daman", "AXA", "NextCare", "Thiqa"],
  faq: [
    { q: "Is there parking?", a: "Yes, free basement parking for patients. Take the ramp next to the pharmacy." },
    { q: "Do you treat children?", a: "Yes, from age 3. Dr. Amal sees most of our young patients." },
    { q: "Can I pay in instalments?", a: "Braces and veneers can be paid in monthly instalments. Ask at the front desk." },
    { q: "How early should I arrive?", a: "10 minutes early for a first visit, so we can open your file." },
    { q: "Do you do emergency visits?", a: "Yes, we keep same-day slots for toothache. In a medical emergency call 998." },
    { q: "Which languages do you speak?", a: "English, Arabic, Hindi and Urdu." },
  ],
  phone: "+971 4 000 0123",
  address: "Villa 12, Al Wasl Road, Jumeirah 2, Dubai (sample address)",
  maps_url: "https://maps.google.com/?q=Jumeirah+2+Dubai",
  persona: { name: "Sara" },
  branding: { accent: "#0f766e" }, // teal, distinct from our sage, to prove white-label
  active: true,
};

const SERVICES = [
  { key: "checkup", name: "Check-up", name_ar: "فحص", minutes: 30, price_aed: 150 },
  { key: "cleaning", name: "Cleaning", name_ar: "تنظيف", minutes: 45, price_aed: 300 },
  { key: "filling", name: "Filling", name_ar: "حشوة", minutes: 60, price_aed: 450 },
  { key: "toothache", name: "Toothache visit", name_ar: "زيارة ألم الأسنان", minutes: 30, price_aed: 200 },
  { key: "kids", name: "Kids check-up", name_ar: "فحص الأطفال", minutes: 30, price_aed: 120 },
  { key: "braces", name: "Braces consultation", name_ar: "استشارة تقويم", minutes: 45, price_aed: 250 },
  { key: "whitening", name: "Teeth whitening", name_ar: "تبييض الأسنان", minutes: 60, price_aed: 1200 },
  { key: "veneers", name: "Veneers consultation", name_ar: "استشارة القشور", minutes: 30, price_aed: 200 },
] as const;
type SKey = (typeof SERVICES)[number]["key"];

const split: [string, string][] = [["09:00", "14:00"], ["17:00", "21:00"]];
const DENTISTS: { name: string; name_ar: string; title: string; color: string; hours: Hours; does: SKey[] }[] = [
  { name: "Dr. Amal Haddad", name_ar: "د. أمل حداد", title: "General dentist", color: "#2563eb",
    hours: { sat: split, sun: split, mon: split, tue: split, wed: split, thu: split }, does: ["checkup", "cleaning", "filling", "toothache", "kids"] },
  { name: "Dr. Omar Siddiqui", name_ar: "د. عمر صديقي", title: "Orthodontist", color: "#b45309",
    hours: { sun: [["10:00", "18:00"]], tue: [["10:00", "18:00"]], thu: [["10:00", "18:00"]] }, does: ["braces", "checkup", "toothache"] },
  { name: "Dr. Lina Farouk", name_ar: "د. لينا فاروق", title: "Cosmetic dentist and hygiene", color: "#be185d",
    hours: { sat: [["13:00", "21:00"]], sun: [["13:00", "21:00"]], mon: [["13:00", "21:00"]], tue: [["13:00", "21:00"]], wed: [["13:00", "21:00"]], fri: [["16:00", "21:00"]] },
    does: ["whitening", "veneers", "cleaning", "checkup", "filling"] },
];

// ---- Patients: [name, channel, tags] ----
type Ch = "whatsapp" | "web" | "desk" | "phone";
const PEOPLE: [string, Ch, string[]][] = [
  ["Aisha Rahman", "whatsapp", ["VIP"]], ["Mohammed Al Mansoori", "whatsapp", ["Insurance"]], ["Priya Nair", "web", []],
  ["Omar Khalid", "whatsapp", []], ["Fatima Zahra", "web", ["Insurance"]], ["Daniel Brooks", "desk", []],
  ["Noura Al Suwaidi", "whatsapp", ["VIP", "Insurance"]], ["Rahul Mehta", "whatsapp", []], ["Sara Ibrahim", "web", ["Kids"]],
  ["Yousef Haddad", "desk", ["Kids"]], ["Emily Carter", "web", []], ["Khalid Nasser", "whatsapp", ["Insurance"]],
  ["Layla Hassan", "whatsapp", ["Kids"]], ["Arjun Pillai", "phone", []], ["Mariam Saeed", "web", ["VIP"]],
  ["Tom Walker", "desk", []], ["Hessa Al Falasi", "whatsapp", []], ["Ahmed Farouk", "whatsapp", ["Insurance"]],
  ["Grace Thomas", "web", []], ["Zainab Ali", "desk", ["Kids"]], ["Bilal Qureshi", "whatsapp", []],
  ["Reem Al Hashimi", "web", ["Insurance"]], ["Lucas Martin", "phone", []], ["Dana Youssef", "whatsapp", ["VIP"]],
  ["Imran Sheikh", "desk", []],
];

// ---- Wipe the old copy (this clinic only) ----
const old = must(await sb.from("clinics").select("id").eq("slug", SLUG).maybeSingle(), "find clinic");
if (old) {
  // Appointments first: dentists are "on delete restrict" from appointments, so the clinic cascade could trip on them.
  must(await sb.from("appointments").delete().eq("clinic_id", old.id).select("id"), "wipe appointments");
  must(await sb.from("clinics").delete().eq("id", old.id).select("id"), "wipe clinic");
}

const clinic = must(await sb.from("clinics").insert(CLINIC).select("id").single(), "clinic");
const cid = clinic.id as string;

const svcRows = must(await sb.from("services").insert(SERVICES.map(({ key: _k, ...s }, i) => ({ ...s, clinic_id: cid, sort: i }))).select("id, name"), "services");
const svc = Object.fromEntries(SERVICES.map((s) => [s.key, { ...s, id: svcRows.find((r) => r.name === s.name)!.id as string }])) as Record<SKey, (typeof SERVICES)[number] & { id: string }>;

const denRows = must(await sb.from("dentists").insert(DENTISTS.map(({ does: _d, ...d }, i) => ({ ...d, clinic_id: cid, sort: i }))).select("id, name"), "dentists");
const dens = DENTISTS.map((d) => ({ ...d, id: denRows.find((r) => r.name === d.name)!.id as string }));
must(await sb.from("dentist_services").insert(dens.flatMap((d) => d.does.map((k) => ({ clinic_id: cid, dentist_id: d.id, service_id: svc[k].id })))).select("dentist_id"), "dentist_services");

// Dr. Omar is on leave next Tuesday.
const nextTue = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1)).find((d) => dayKey(d) === "tue")!;
const omar = dens[1];
must(await sb.from("time_off").insert({
  clinic_id: cid, dentist_id: omar.id, reason: "Annual leave",
  starts_at: toUtc(nextTue, "00:00", OFF).toISOString(), ends_at: toUtc(addDays(nextTue, 1), "00:00", OFF).toISOString(),
}).select("id"), "time_off");

const patRows = must(await sb.from("patients").insert(PEOPLE.map(([name, ch, tags], i) => {
  const digits = `9715000${String(1000 + i * 37).padStart(5, "0")}`; // +971 50 00x xxxx, fake
  return {
    clinic_id: cid, name, tags,
    phone: `+${digits}`,
    wa_id: ch === "whatsapp" || ch === "desk" ? `${digits}@c.us` : null, // desk-added mobiles are also the WhatsApp id
    web_visitor_id: ch === "web" ? randomUUID() : null,
    notes: tags.includes("VIP") ? "Prefers evening slots. Offer water on arrival." : null,
  };
})).select("id, name, wa_id, web_visitor_id"), "patients");
const pats = PEOPLE.map(([name, ch]) => ({ ch, ...patRows.find((p) => p.name === name)! }));

// ---- Visits: walk each dentist's hours day by day, booking some slots ----
const NO_SHOW_AT = new Set([4, 11, 19]); // 3 no-shows among past visits
const appts: Record<string, unknown>[] = [];
let past = 0;
for (let n = -28; n <= 13; n++) {
  const date = addDays(today, n);
  const upcoming = n >= 0;
  for (const d of dens) {
    if (d === omar && date === nextTue) continue;
    for (const [a, b] of d.hours[dayKey(date)] ?? []) {
      let t = mins(a);
      while (t < mins(b)) {
        const s = svc[pick(d.does)];
        if (t + s.minutes > mins(b)) break;
        if (rnd() > (upcoming ? 0.32 : 0.2)) { t += 30; continue; }
        const starts = toUtc(date, hhmm(t), OFF);
        const ends = new Date(starts.getTime() + s.minutes * 60_000);
        const p = pick(pats);
        const done = ends < now;
        const status = done ? (NO_SHOW_AT.has(past) ? "no_show" : rnd() < 0.06 ? "cancelled" : "completed") : rnd() < 0.05 ? "cancelled" : "booked";
        if (done) past++;
        const bookedAt = new Date(Math.min(now.getTime() - 3_600_000, starts.getTime() - (1 + Math.floor(rnd() * 6)) * 86_400_000));
        appts.push({
          clinic_id: cid, patient_id: p.id, dentist_id: d.id, service_id: s.id, service: s.name,
          starts_at: starts.toISOString(), ends_at: ends.toISOString(), status,
          source: p.ch === "desk" || p.ch === "phone" ? "staff" : "chat", created_at: bookedAt.toISOString(),
        });
        t += s.minutes;
      }
    }
  }
}
must(await sb.from("appointments").insert(appts).select("id"), "appointments");

// ---- Chats: transcripts + agent history; the last two are waiting for staff ----
const CHATS: { who: string; paused?: boolean; lines: [ "patient" | "assistant", string][] }[] = [
  { who: "Aisha Rahman", lines: [["patient", "Hi, can I book a cleaning this week?"], ["assistant", "Of course. Dr. Lina has Thursday at 18:00 or Saturday at 14:30. Which suits you?"], ["patient", "Saturday please"], ["assistant", "Done, you're booked for a cleaning on Saturday at 14:30 with Dr. Lina."]] },
  { who: "Mohammed Al Mansoori", lines: [["patient", "مرحبا، كم سعر الحشوة؟"], ["assistant", "أهلاً! سعر الحشوة 450 درهم. هل تريد أن أحجز لك موعداً؟"], ["patient", "نعم يوم الأحد"], ["assistant", "تم الحجز يوم الأحد الساعة 10:00 مع د. أمل."]] },
  { who: "Priya Nair", lines: [["patient", "Do you do teeth whitening?"], ["assistant", "Yes, whitening is AED 1,200 and takes about an hour with Dr. Lina. Want me to find a time?"], ["patient", "Maybe next week, I'll get back to you"]] },
  { who: "Omar Khalid", lines: [["patient", "I have a bad toothache since last night"], ["assistant", "Sorry to hear that. I can fit you in today at 17:30 with Dr. Amal for a toothache visit. Shall I book it?"], ["patient", "Yes please"], ["assistant", "Booked for today at 17:30. If the pain gets severe or your face swells, call 998."]] },
  { who: "Sara Ibrahim", lines: [["patient", "My son is 5, do you see kids?"], ["assistant", "Yes, from age 3. A kids check-up is AED 120 with Dr. Amal. Want a morning or afternoon slot?"], ["patient", "Morning"], ["assistant", "Monday at 09:30 is free. Shall I book it?"]] },
  { who: "Khalid Nasser", lines: [["patient", "Can I move my visit to Thursday?"], ["assistant", "Sure. Thursday has 11:00 or 16:00. Which one?"], ["patient", "16:00"], ["assistant", "Moved to Thursday at 16:00. See you then."]] },
  { who: "Fatima Zahra", paused: true, lines: [["patient", "Does my NextCare plan cover braces fully?"], ["assistant", "We accept NextCare, but I can't confirm what your plan covers. I've passed this to our front desk, they'll reply here shortly."]] },
  { who: "Noura Al Suwaidi", paused: true, lines: [["patient", "I waited 40 minutes past my appointment yesterday. Not acceptable."], ["assistant", "I'm really sorry about the wait. I've passed this to our front desk so someone can follow up with you personally."]] },
];
for (const [i, c] of CHATS.entries()) {
  const p = pats.find((x) => x.name === c.who)!;
  const channel = p.web_visitor_id ? "web" : "whatsapp";
  const start = now.getTime() - (c.paused ? 6 : 26 + i * 9) * 60_000;
  must(await sb.from("messages").insert(c.lines.map(([role, body], j) => ({ clinic_id: cid, patient_id: p.id, channel, role, body, created_at: new Date(start + j * 40_000).toISOString() }))).select("id"), `messages ${c.who}`);
  must(await sb.from("conversations").upsert({
    patient_id: p.id, bot_paused: !!c.paused,
    history: c.lines.map(([role, body]) => (role === "patient" ? user(body) : assistant(body))),
    updated_at: new Date(start + c.lines.length * 40_000).toISOString(),
  }).select("patient_id"), `conversation ${c.who}`);
}

// ---- Logins ----
const list = must(await sb.auth.admin.listUsers({ perPage: 1000 }), "list users");
let env = readFileSync(".env.local", "utf8");
const setEnv = (k: string, v: string) => {
  const line = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), line) : `${env.trimEnd()}\n${line}\n`;
};
for (const u of [{ key: "GS_OWNER", email: "owner@goodshine.test", role: "owner" }, { key: "GS_STAFF", email: "staff@goodshine.test", role: "staff" }]) {
  const password = randomBytes(15).toString("base64url");
  const existing = list.users.find((x) => x.email === u.email);
  const { data, error } = existing
    ? await sb.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
    : await sb.auth.admin.createUser({ email: u.email, password, email_confirm: true });
  if (error || !data.user) fail(`${u.email}: ${error?.message}`);
  must(await sb.from("memberships").upsert({ user_id: data.user!.id, clinic_id: cid, role: u.role }).select("user_id"), `${u.email} membership`);
  setEnv(`TEST_${u.key}_EMAIL`, u.email);
  setEnv(`TEST_${u.key}_PASSWORD`, password);
}
// The existing sample owner also gets Good Shine, so the clinic switcher shows both clinics.
const sampleOwner = list.users.find((x) => x.email === "owner@frontdesk.test");
if (sampleOwner) must(await sb.from("memberships").upsert({ user_id: sampleOwner.id, clinic_id: cid, role: "owner" }).select("user_id"), "sample owner membership");
writeFileSync(".env.local", env);

const upcomingCount = appts.filter((a) => a.status === "booked").length;
console.log(`Good Shine seeded: ${dens.length} dentists, ${SERVICES.length} services, ${pats.length} patients, ${appts.length} visits (${upcomingCount} upcoming), ${CHATS.length} chats.`);
console.log(`Dr. Omar off on ${nextTue}. Logins in .env.local (TEST_GS_*). Waiting chats lapse 30 min after seeding (${localTime(now, OFF)} Dubai): re-run to refresh.`);
