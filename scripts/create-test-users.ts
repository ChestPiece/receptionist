// Creates (or resets) the dashboard test logins on the sample clinic. Run: bun scripts/create-test-users.ts
// Writes to the live Supabase project. Passwords go into .env.local only (gitignored), never to stdout.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SLUG = "sample-smile";
const USERS = [
  { key: "OWNER", email: "owner@frontdesk.test", role: "owner", admin: true },
  { key: "STAFF", email: "staff@frontdesk.test", role: "staff", admin: false },
] as const;

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const fail = (msg: string) => { console.error(msg); process.exit(1); };

const { data: clinic, error: ce } = await sb.from("clinics").select("id, name").eq("slug", SLUG).single();
if (ce || !clinic) fail(`clinic ${SLUG} not found: ${ce?.message}`);

const { data: list, error: le } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (le) fail(le.message);

let env = readFileSync(".env.local", "utf8");
const setEnv = (k: string, v: string) => {
  const line = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), line) : `${env.trimEnd()}\n${line}\n`;
};

for (const u of USERS) {
  const password = randomBytes(15).toString("base64url"); // 20 chars
  const existing = list.users.find((x) => x.email === u.email);
  const { data, error } = existing
    ? await sb.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
    : await sb.auth.admin.createUser({ email: u.email, password, email_confirm: true });
  if (error || !data.user) fail(`${u.email}: ${error?.message}`);
  const id = data.user!.id;

  const { error: me } = await sb.from("memberships").upsert({ user_id: id, clinic_id: clinic!.id, role: u.role });
  if (me) fail(`${u.email} membership: ${me.message}`);
  if (u.admin) {
    const { error: ae } = await sb.from("platform_admins").upsert({ user_id: id });
    if (ae) fail(`${u.email} admin: ${ae.message}`);
  }

  setEnv(`TEST_${u.key}_EMAIL`, u.email);
  setEnv(`TEST_${u.key}_PASSWORD`, password);
  console.log(`${existing ? "reset" : "created"} ${u.email} (${u.role}${u.admin ? ", platform admin" : ""}) on ${clinic!.name}`);
}

writeFileSync(".env.local", env);
console.log("Passwords saved in .env.local (TEST_*_PASSWORD).");
