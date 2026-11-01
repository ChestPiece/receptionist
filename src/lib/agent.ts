// The WhatsApp channel: the per-message handler around the shared agent brain (sara.ts).
import { assistant, user, type AgentInputItem } from "@openai/agents";
import type { Clinic } from "./clinics";
import { db, logMessages, logUsage } from "./db";
import { reviewAndLog } from "./reviewer";
import { emergencyReply, isEmergency, isStop, stopReply } from "./safety";
import { runSara, wroteData } from "./sara";
import { markRead, sendText, type IncomingMessage } from "./whatsapp";

// ponytail: keep the last 10 patient turns, cut at a user message so no tool call loses its output. Summarize if long chats matter.
export function trimHistory(items: AgentInputItem[], turns = 10) {
  const starts = items.flatMap((it, i) => ("role" in it && it.role === "user" ? [i] : []));
  return starts.length > turns ? items.slice(starts[starts.length - turns]) : items;
}

// Returns null when the note is too long to transcribe (cost cap).
async function transcribe(url: string) {
  const audio = await fetch(url);
  if (!audio.ok) throw new Error(`voice download failed: ${audio.status}`);
  if (Number(audio.headers.get("content-length")) > MAX_VOICE_BYTES) return null;
  const blob = await audio.blob();
  if (blob.size > MAX_VOICE_BYTES) return null;
  const form = new FormData();
  form.append("file", blob, "voice.ogg");
  form.append("model", "gpt-4o-mini-transcribe");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`transcription failed: ${res.status}`);
  return ((await res.json()) as { text: string }).text;
}

async function toText(msg: IncomingMessage) {
  if ((msg.type === "ptt" || msg.type === "audio") && msg.mediaUrl) {
    // ponytail: redirects are followed; pin the UltraMsg media host here once a real voice-note URL is seen in logs.
    if (!safeMediaUrl(msg.mediaUrl)) return "[patient sent a voice note that could not be played; ask them to type it]";
    const heard = await transcribe(msg.mediaUrl);
    return heard === null ? "[patient sent a very long voice note; ask them kindly to type it or send a shorter one]" : `[voice note] ${capText(heard)}`;
  }
  if (msg.type !== "chat") return `[patient sent a ${msg.type}${msg.body ? `: ${capText(msg.body)}` : ""}]`; // Phase 2 stores media
  return capText(msg.body);
}

// Promise a staff reply only when staff actually get alerts; otherwise point to the clinic phone.
export const sorry = (phone: string | null, staff: string | null | undefined) =>
  staff
    ? "Sorry, something went wrong. A team member will reply soon.\nعذراً، حدث خطأ. سيرد عليك أحد موظفينا قريباً."
    : phone
      ? `Sorry, something went wrong. Please try again in a minute or call the clinic on ${phone}.\nعذراً، حدث خطأ. حاول مرة أخرى بعد دقيقة أو اتصل بالعيادة على ${phone}.`
      : "Sorry, something went wrong. Please try again in a minute.\nعذراً، حدث خطأ. حاول مرة أخرى بعد دقيقة.";

// Abuse and cost limits per patient.
const MAX_CHARS = 1_500;
const MAX_VOICE_BYTES = 3_000_000; // about 3 minutes of WhatsApp opus
export const RATE_WINDOW_MS = 10 * 60_000;
export const RATE_MAX = 20; // messages per window; one "slow down" reply, then silence until the window passes

export const capText = (text: string) => (text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)} [message cut]` : text);

// Media links come from the webhook payload: fetch only public https hosts, never loopback or private ranges.
export function safeMediaUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const h = u.hostname.replace(/^\[|\]$/g, "");
  return (
    u.protocol === "https:" &&
    !/^(localhost|.*\.local|.*\.internal)$/i.test(h) &&
    !/^(\d+\.){3}\d+$/.test(h) && // IPv4 literal
    !h.includes(":") // IPv6 literal
  );
}

// Items kept per chat by append_history: a plain tail cut, so loadHistory/route trim the front to a user message again.
export const HISTORY_MAX = 80;

// Append turns to the saved history in one statement, so parallel runs keep each other's turns. Never throws: the reply is already out.
// `touch` also bumps updated_at (a patient turn); staff pauses are timed from it, so staff-held saves leave it alone.
export async function appendHistory(patientId: string, items: AgentInputItem[], touch = false) {
  const sb = db();
  const { error } = await sb.rpc("append_history", { conv: patientId, items, max: HISTORY_MAX });
  if (error) return console.error("[history]", error.message);
  if (touch) await sb.from("conversations").update({ updated_at: new Date().toISOString() }).eq("patient_id", patientId);
}

// WhatsApp-safe punctuation: no en/em dashes (they read as machine-written). Hyphens in words stay.
export const tidy = (text: string) =>
  text
    .replace(/(\d(?:\s?[ap]m)?)\s*[–—]\s*(?=\d)/gi, "$1 to ")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/ +- +/g, ", ");

const PAUSE_MS = 30 * 60_000;
// ponytail: a staff pause lapses after 30 min without staff activity, so a missed handoff never leaves a dead chat. Phase 4 inbox refreshes it.
export const stillPaused = (c: { bot_paused: boolean; updated_at: string } | null, now = new Date()) =>
  !!c?.bot_paused && now.getTime() - Date.parse(c.updated_at) < PAUSE_MS;

// Patients often send one thought in pieces ("can you" / "book and" / "appointment"). Each piece is a processed_messages row.
// After a short wait only the newest piece's call runs the model, and it answers every unanswered piece. Works across server instances.
const DEBOUNCE_MS = 1500;
const PIECE_MAX_AGE_MS = 5 * 60_000;

async function newestPiece(clinicId: string, from: string) {
  const { data, error } = await db()
    .from("processed_messages")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("patient_wa", from)
    .order("seq", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data.id as string;
}

export const slowDown = (phone: string | null) =>
  `You're sending messages very fast, so I'll pause for a few minutes.${phone ? ` For anything urgent, call the clinic on ${phone}.` : ""}\nأنت ترسل رسائل كثيرة بسرعة، سأتوقف لبضع دقائق.${phone ? ` للأمور العاجلة اتصل بالعيادة على ${phone}.` : ""}`;

export async function handleMessage(clinic: Clinic, msg: IncomingMessage) {
  const t0 = Date.now();
  const sb = db();
  const wa = clinic.wa!; // the webhook only routes messages to clinics with WhatsApp connected
  const send = (body: string) => sendText(wa, msg.from, body);
  const { error: dup } = await sb.from("processed_messages").insert({ id: msg.id, clinic_id: clinic.id, patient_wa: msg.from });
  if (dup?.code === "23505") return; // webhook retry of a message we already handled
  if (dup) throw dup;

  // Flood guard: one "slow down" reply, then silence until the window passes. Emergencies still get the fixed reply.
  const [{ count, error: rateError }, { data: patient, error: patientError }] = await Promise.all([
    sb
      .from("processed_messages")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic.id)
      .eq("patient_wa", msg.from)
      .gt("created_at", new Date(Date.now() - RATE_WINDOW_MS).toISOString()),
    sb.from("patients").upsert({ clinic_id: clinic.id, wa_id: msg.from }, { onConflict: "clinic_id,wa_id" }).select("id, name").single(),
  ]);
  if (rateError) throw rateError;
  if ((count ?? 0) > RATE_MAX) {
    console.log("[rate] limited");
    if (msg.type === "chat" && isEmergency(msg.body)) await send(emergencyReply(msg.body, clinic.phone));
    else if (count === RATE_MAX + 1) await send(slowDown(clinic.phone));
    return;
  }
  markRead(wa, msg.from).catch((e) => console.error("[read]", e.message));
  if (patientError) throw patientError;

  let ids = [msg.id];
  const answered = async () => {
    const { error } = await sb.from("processed_messages").update({ answered: true }).in("id", ids);
    if (error) console.error("[answered]", error.message);
  };
  const loadHistory = async () => {
    const { data, error } = await sb.from("conversations").select("history, bot_paused, updated_at").eq("patient_id", patient.id).maybeSingle();
    if (error) throw error;
    return { convo: data, history: trimHistory((data?.history ?? []) as AgentInputItem[]) };
  };

  try {
    const own = await toText(msg);
    // Safety first: fixed emergency reply, even when staff have paused the bot. The model does not run, so no second reply.
    if (isEmergency(own)) {
      const reply = emergencyReply(own, clinic.phone);
      await send(reply);
      await answered();
      await logMessages(clinic.id, patient.id, "whatsapp", [{ role: "patient", body: own }, { role: "assistant", body: reply }]);
      await appendHistory(patient.id, [user(own), assistant(reply)], true);
      return;
    }
    // Opt-out is deterministic too: no follow-up, recall or waitlist messages after this. Reminders for booked visits continue.
    if (isStop(own)) {
      const { error } = await sb.from("patients").update({ opted_out: true }).eq("id", patient.id);
      if (error) throw error;
      await send(stopReply);
      await answered();
      await logMessages(clinic.id, patient.id, "whatsapp", [{ role: "patient", body: own }, { role: "assistant", body: stopReply }]);
      await appendHistory(patient.id, [user(own), assistant(stopReply)]);
      return;
    }

    const { error: bodyError } = await sb.from("processed_messages").update({ body: own }).eq("id", msg.id);
    if (bodyError) throw bodyError;
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
    const [newest, { data: pieces, error: piecesError }, loaded] = await Promise.all([
      newestPiece(clinic.id, msg.from),
      sb
        .from("processed_messages")
        .select("id, body")
        .eq("clinic_id", clinic.id)
        .eq("patient_wa", msg.from)
        .eq("answered", false)
        .not("body", "is", null)
        .gt("created_at", new Date(Date.now() - PIECE_MAX_AGE_MS).toISOString())
        .order("seq"),
      loadHistory().catch((e: Error) => e), // only the newest piece may surface this error
    ]);
    if (newest !== msg.id) return; // a newer piece arrived; that call answers all of them
    if (loaded instanceof Error) throw loaded;
    const { convo, history: saved } = loaded;
    if (piecesError) throw piecesError;
    if (!pieces.length) return; // another call already answered them
    ids = pieces.map((p) => p.id as string);
    const text = pieces.map((p) => p.body as string).join("\n");

    if (stillPaused(convo)) {
      // Staff have this chat. Keep the messages (updated_at untouched, so the pause timer runs on) for context when it lapses.
      await appendHistory(patient.id, [user(text)]);
      await answered();
      await logMessages(clinic.id, patient.id, "whatsapp", [{ role: "patient", body: text }]);
      return;
    }
    const t1 = Date.now();
    const [result] = await Promise.all([
      runSara(clinic, patient, msg.from, [...saved, user(text)]),
      convo?.bot_paused && sb.from("conversations").update({ bot_paused: false }).eq("patient_id", patient.id), // pause lapsed
    ]);
    const t2 = Date.now();
    // A newer piece arrived while the model ran. Its call answers all pieces, so drop this reply, unless this run changed data.
    // ponytail: a data-writing run and the newer run can both answer the same pieces; a per-patient lock fixes that if it shows up.
    const [, latestPiece] = await Promise.all([logUsage(clinic.id, "whatsapp", result.state.usage), newestPiece(clinic.id, msg.from)]);
    if (latestPiece !== msg.id && !wroteData(result.newItems)) return;
    const reply = result.finalOutput ? tidy(result.finalOutput) : null;
    await Promise.all([answered(), reply && send(reply)]);
    console.log(`[timing] prep=${t1 - t0}ms agent=${t2 - t1}ms send=${Date.now() - t2}ms`);
    // Reply is already out: log failures, don't send an error on top.
    await Promise.all([
      logMessages(clinic.id, patient.id, "whatsapp", [{ role: "patient", body: text }, ...(reply ? [{ role: "assistant" as const, body: reply }] : [])]).catch((e) =>
        console.error("[log]", (e as Error).message),
      ),
      appendHistory(patient.id, result.history.slice(saved.length), true), // this run's turns only
    ]);
    // Already inside the webhook's after(); the reviewer never throws and the reply is out.
    await reviewAndLog({ clinic, patientId: patient.id, channel: "whatsapp", userText: text, reply, items: result.newItems });
  } catch (e) {
    console.error("[agent]", (e as Error).message);
    await answered(); // don't replay failed pieces into the next message
    await send(sorry(clinic.phone, clinic.staff_whatsapp));
  }
}
