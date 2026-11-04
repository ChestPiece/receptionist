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
