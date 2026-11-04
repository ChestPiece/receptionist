import { after } from "next/server";
import { handleMessage } from "@/lib/agent";
import { clinicByInstance } from "@/lib/clinics";
import { parseWebhook, secretMatches } from "@/lib/whatsapp";

// UltraMsg webhook URL: https://<host>/api/whatsapp?secret=<the clinic's webhook_secret>
// One URL for every clinic: the payload's instanceId picks the clinic, then its own secret must match.
export async function POST(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  const payload = await request.json().catch(() => null);
  const msg = parseWebhook(payload);
  const clinic = msg ? await clinicByInstance(msg.instanceId) : null;
  if (msg && !(clinic?.active && clinic.wa?.provider === "ultramsg" && secretMatches(secret, clinic.webhook_secret ?? undefined)))
    return new Response("forbidden", { status: 403 });

  // While the bot runs on a personal number, only answer listed testers (comma-separated chat ids).
  const allowed = (process.env.ALLOWED_SENDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  // One line per webhook, no message text (no PHI in logs).
  const outcome = !msg ? "ignored" : allowed.length && !allowed.includes(msg.from) ? "not allowlisted" : "reply";
  // event_type comes before any auth: log it only when it is a plain word, so a crafted payload can't forge log lines.
  const event = /^[a-z_]{1,40}$/.test(String(payload?.event_type)) ? payload.event_type : "?";
  console.log(`[webhook] ${clinic?.slug ?? "-"} ${event} fromMe=${payload?.data?.fromMe === true} -> ${outcome}`);

  // Ack now, answer after the response (dedupe happens in the DB inside handleMessage).
  if (msg && clinic && outcome === "reply") after(() => handleMessage(clinic, msg).catch((e) => console.error("[handle]", e.message)));
  return new Response("ok");
}
