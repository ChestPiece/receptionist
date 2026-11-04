// All WhatsApp traffic goes through this file. Two providers, picked per clinic: UltraMsg (demos, testing)
// and the official Meta Cloud API (paying clinics). Chat ids stay in the UltraMsg form ("971501234567@c.us")
// everywhere else in the app; the Meta adapter converts at the edge.
import { createHmac, timingSafeEqual } from "node:crypto";

export type IncomingMessage = {
  id: string;
  from: string; // chat id, e.g. "971501234567@c.us"
  type: string; // chat | image | ptt | audio | document | location | ...
  body: string;
  mediaUrl: string | null; // UltraMsg: public URL
  mediaId?: string; // Meta: media id, downloaded with the clinic's token
  pushname: string;
};

export type WaCreds =
  | { provider: "ultramsg"; instanceId: string; token: string }
  | { provider: "meta"; phoneNumberId: string; token: string };

// Dashboard/API id is "instance12345", webhook payload sends "12345". Stored and compared as digits.
export const normInstance = (id: string) => id.replace(/^instance/, "");

const digits = (chatId: string) => chatId.replace(/@c\.us$/, "");

// ---------------------------------------------------------------- UltraMsg

// Returns null for anything we must not answer: other events, our own sends, groups, no instance.
// The caller finds the clinic by instanceId.
export function parseWebhook(payload: unknown): (IncomingMessage & { instanceId: string }) | null {
  const p = payload as { event_type?: string; instanceId?: string | number; data?: Record<string, unknown> };
  if (p?.event_type !== "message_received" || !p.data) return null;
  const instanceId = normInstance(String(p.instanceId ?? ""));
  if (!instanceId) return null;
  const d = p.data;
  if (d.fromMe === true || d.self === true) return null;
  const from = String(d.from ?? "");
  if (!from.endsWith("@c.us")) return null; // ignore groups (@g.us), status, broadcasts
  if (!d.id) return null; // the id is the dedupe key: an empty one would collapse every such message into one
  return {
    instanceId,
    id: String(d.id ?? ""),
    from,
    type: String(d.type ?? "chat"),
    body: String(d.body ?? ""),
    mediaUrl: d.media ? String(d.media) : null,
    pushname: String(d.pushname ?? ""),
  };
}

export function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function ultramsg(creds: { instanceId: string; token: string }, path: string, fields: Record<string, string>) {
  const res = await fetch(`https://api.ultramsg.com/instance${creds.instanceId}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: creds.token, ...fields }),
  });
  if (!res.ok) throw new Error(`UltraMsg ${path} failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------- Meta Cloud API

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}`;

// Meta signs the raw body with the app secret: X-Hub-Signature-256: sha256=<hex>.
export function metaSignatureOk(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!header || !appSecret) return false;
  return secretMatches(header, `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`);
}

type MetaMessage = {
  id?: string; from?: string; type?: string;
  text?: { body?: string };
  audio?: { id?: string; voice?: boolean };
  image?: { id?: string; caption?: string };
  document?: { id?: string; caption?: string };
  video?: { id?: string; caption?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

// One webhook can carry several messages (and several clinics). Status updates and echoes are skipped.
export function parseMetaWebhook(payload: unknown): (IncomingMessage & { phoneNumberId: string })[] {
  const p = payload as { object?: string; entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  if (p?.object !== "whatsapp_business_account" || !Array.isArray(p.entry)) return [];
  const out: (IncomingMessage & { phoneNumberId: string })[] = [];
  for (const change of p.entry.flatMap((e) => e?.changes ?? [])) {
    if (change?.field !== "messages" || !change.value) continue;
    const v = change.value as { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: MetaMessage[] };
    const phoneNumberId = String(v.metadata?.phone_number_id ?? "");
    if (!phoneNumberId || !Array.isArray(v.messages)) continue;
    for (const m of v.messages) {
      if (!m?.id || !/^\d{6,15}$/.test(String(m.from ?? ""))) continue; // the id is the dedupe key; from must be a phone
      const type = String(m.type ?? "unknown");
      const media = m.audio ?? m.image ?? m.document ?? m.video;
      out.push({
        phoneNumberId,
        id: m.id,
        from: `${m.from}@c.us`,
        // Same type names as UltraMsg, so agent.ts needs no provider branches.
        type: type === "text" || type === "button" || type === "interactive" ? "chat" : type === "audio" && m.audio?.voice ? "ptt" : type,
        body: m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.image?.caption ?? m.document?.caption ?? m.video?.caption ?? "",
        mediaUrl: null,
        mediaId: media?.id,
        pushname: v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? "",
      });
    }
  }
  return out;
}

async function meta(creds: { phoneNumberId: string; token: string }, body: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${creds.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  // Meta's error code (e.g. 131047: outside the 24 h window) helps; the body never holds message text.
  if (!res.ok) throw new Error(`Meta ${String(body.type ?? body.status)} failed: ${res.status} ${(await res.json().catch(() => null))?.error?.code ?? ""}`.trim());
  return res.json();
}

// ---------------------------------------------------------------- provider-neutral API

export const sendText = (creds: WaCreds, to: string, body: string) =>
  creds.provider === "meta"
    ? meta(creds, { to: digits(to), type: "text", text: { body, preview_url: false } })
    : ultramsg(creds, "/messages/chat", { to, body });

// Blue ticks, so the patient sees the message was read while the reply is prepared. Meta marks by message id.
export const markRead = (creds: WaCreds, chatId: string, messageId: string) =>
  creds.provider === "meta" ? meta(creds, { status: "read", message_id: messageId }) : ultramsg(creds, "/chats/read", { chatId });

export const sendMedia = (creds: WaCreds, to: string, imageUrl: string, caption = "") =>
  creds.provider === "meta"
    ? meta(creds, { to: digits(to), type: "image", image: { link: imageUrl, caption } })
    : ultramsg(creds, "/messages/image", { to, image: imageUrl, caption });

// Approved template (Meta only): the only kind of message Meta delivers outside the 24 h service window.
export const sendTemplate = (creds: Extract<WaCreds, { provider: "meta" }>, to: string, t: { name: string; lang: string }, params: string[]) =>
  meta(creds, {
    to: digits(to),
    type: "template",
    template: { name: t.name, language: { code: t.lang }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
  });

export const metaMediaHost = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net)$/.test(u.hostname);
  } catch {
    return false;
  }
};

// Voice notes: UltraMsg hands a public URL (checked by the caller), Meta a media id behind the clinic's token.
export async function fetchMedia(creds: WaCreds, msg: IncomingMessage): Promise<Response | null> {
  if (creds.provider === "meta") {
    if (!msg.mediaId) return null;
    const auth = { Authorization: `Bearer ${creds.token}` };
    const info = await fetch(`${GRAPH}/${encodeURIComponent(msg.mediaId)}`, { headers: auth, signal: AbortSignal.timeout(10_000) });
    const url = info.ok ? ((await info.json()) as { url?: string }).url : null;
    if (!url || !metaMediaHost(url)) return null; // the token goes along: only to Meta's own media hosts
    return fetch(url, { headers: auth, signal: AbortSignal.timeout(15_000) });
  }
  return msg.mediaUrl ? fetch(msg.mediaUrl, { signal: AbortSignal.timeout(15_000) }) : null;
}
