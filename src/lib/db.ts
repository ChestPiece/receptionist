import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

// Server only: the service role key bypasses RLS. Never import this from client components.
export const db = () =>
  (client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  }));

type Channel = "whatsapp" | "web" | "voice";

// Readable transcript for the staff inbox. Never throws: the patient reply matters more than the log.
export async function logMessages(clinicId: string, patientId: string, channel: Channel, rows: { role: "patient" | "assistant" | "staff" | "system"; body: string }[]) {
  const { error } = await db().from("messages").insert(rows.map((r) => ({ clinic_id: clinicId, patient_id: patientId, channel, ...r })));
  if (error) console.error("[messages]", error.message);
}

export async function logUsage(clinicId: string, channel: Channel, u: { requests: number; inputTokens: number; outputTokens: number }) {
  const { error } = await db().from("usage_events").insert({ clinic_id: clinicId, channel, requests: u.requests, input_tokens: u.inputTokens, output_tokens: u.outputTokens });
  if (error) console.error("[usage]", error.message);
}

// Rate limit (0011 hit()): true while `key` has had fewer than `max` hits in the last `windowS` seconds, and counts this one.
// Fails open with a warning (0011 not pasted yet, DB hiccup): a limiter must never take the chat down.
export async function allow(key: string, max: number, windowS: number) {
  const { data, error } = await db().rpc("hit", { k: key, max, window_s: windowS });
  if (error) console.warn("[rate]", error.message);
  return data !== false;
}
