// All WhatsApp traffic goes through this file (UltraMsg today). Swap providers here only.
import { timingSafeEqual } from "node:crypto";

export type IncomingMessage = {
  id: string;
  from: string; // UltraMsg chat id, e.g. "971501234567@c.us"
  type: string; // chat | image | ptt | audio | document | location | ...
  body: string;
  mediaUrl: string | null;
  pushname: string;
};

// Each clinic has its own UltraMsg instance.
export type WaCreds = { instanceId: string; token: string };

// Dashboard/API id is "instance12345", webhook payload sends "12345". Stored and compared as digits.
export const normInstance = (id: string) => id.replace(/^instance/, "");

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

async function post(creds: WaCreds, path: string, fields: Record<string, string>) {
  const res = await fetch(`https://api.ultramsg.com/instance${creds.instanceId}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: creds.token, ...fields }),
  });
  if (!res.ok) throw new Error(`UltraMsg ${path} failed: ${res.status}`);
  return res.json();
}

export const sendText = (creds: WaCreds, to: string, body: string) => post(creds, "/messages/chat", { to, body });

// Blue ticks, so the patient sees the message was read while the reply is prepared. UltraMsg has no typing indicator.
export const markRead = (creds: WaCreds, chatId: string) => post(creds, "/chats/read", { chatId });

export const sendMedia = (creds: WaCreds, to: string, imageUrl: string, caption = "") =>
  post(creds, "/messages/image", { to, image: imageUrl, caption });
