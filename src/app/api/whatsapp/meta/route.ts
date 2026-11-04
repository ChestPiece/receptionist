import { after } from "next/server";
import { handleMessage } from "@/lib/agent";
import { clinicByMetaNumber } from "@/lib/clinics";
import { metaSignatureOk, parseMetaWebhook, secretMatches } from "@/lib/whatsapp";

// Meta Cloud API webhook: https://<host>/api/whatsapp/meta, set once in our Meta app for every clinic.
// The payload's phone_number_id picks the clinic. Env: META_APP_SECRET (signs every POST), META_VERIFY_TOKEN.

// Meta's one-time subscription check.
export function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && secretMatches(q.get("hub.verify_token"), process.env.META_VERIFY_TOKEN))
    return new Response(q.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
  return new Response("forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text(); // the signature covers the exact bytes
  if (!metaSignatureOk(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) return new Response("forbidden", { status: 403 });
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {}
  const allowed = (process.env.ALLOWED_SENDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  for (const msg of parseMetaWebhook(payload)) {
    const clinic = await clinicByMetaNumber(msg.phoneNumberId);
    const ok = clinic?.active && clinic.wa?.provider === "meta";
    const outcome = !ok ? "no clinic" : allowed.length && !allowed.includes(msg.from) ? "not allowlisted" : "reply";
    // One line per message, no message text (no PHI in logs).
    console.log(`[webhook:meta] ${clinic?.slug ?? "-"} ${msg.type} -> ${outcome}`);
    if (clinic && outcome === "reply") after(() => handleMessage(clinic, msg).catch((e) => console.error("[handle]", e.message)));
  }
  // Always 200 once signed, or Meta retries the batch (statuses, echoes and unknown numbers included).
  return new Response("ok");
}
