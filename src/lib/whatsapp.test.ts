import { expect, test } from "vitest";
import { normInstance, parseWebhook, secretMatches } from "./whatsapp";

// Shape based on UltraMsg docs; replace with a real recorded payload after the first live message.
const payload = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  event_type: "message_received",
  instanceId: "12345",
  data: { id: "false_971500000000@c.us_ABC", from: "971500000000@c.us", type: "chat", body: "Hi", media: "", fromMe: false, pushname: "Sample", ...data },
  ...extra,
});

test("parses a text message with its instance id", () => {
  expect(parseWebhook(payload({}))).toMatchObject({ instanceId: "12345", from: "971500000000@c.us", type: "chat", body: "Hi", mediaUrl: null });
});

test("instance id is stored and matched without the 'instance' prefix", () => {
  expect(normInstance("instance12345")).toBe("12345");
  expect(normInstance("12345")).toBe("12345");
  expect(parseWebhook(payload({}, { instanceId: "instance12345" }))?.instanceId).toBe("12345");
  expect(parseWebhook(payload({}, { instanceId: 12345 }))?.instanceId).toBe("12345");
  expect(parseWebhook(payload({}, { instanceId: undefined }))).toBeNull();
});

test("keeps media url for image and voice note", () => {
  expect(parseWebhook(payload({ type: "image", media: "https://x/img.jpg" }))?.mediaUrl).toBe("https://x/img.jpg");
  expect(parseWebhook(payload({ type: "ptt", body: "", media: "https://x/v.ogg" }))?.type).toBe("ptt");
});

test("ignores own messages, groups, other events", () => {
  expect(parseWebhook(payload({ fromMe: true }))).toBeNull();
  expect(parseWebhook(payload({ from: "1203630@g.us" }))).toBeNull();
  expect(parseWebhook(payload({}, { event_type: "message_ack" }))).toBeNull();
  expect(parseWebhook(null)).toBeNull();
});

test("secret check", () => {
  expect(secretMatches("abc", "abc")).toBe(true);
  expect(secretMatches("abd", "abc")).toBe(false);
  expect(secretMatches(null, "abc")).toBe(false);
  expect(secretMatches("abc", undefined)).toBe(false);
});

// ---------------------------------------------------------------- Meta Cloud API
import { createHmac } from "node:crypto";
import { metaMediaHost, metaSignatureOk, parseMetaWebhook } from "./whatsapp";

const meta = (messages: unknown[], value: Record<string, unknown> = {}) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "111" }, contacts: [{ wa_id: "971500000000", profile: { name: "Sample" } }], messages, ...value } }] }],
});

test("meta: text message becomes the same shape as UltraMsg", () => {
  expect(parseMetaWebhook(meta([{ id: "wamid.A", from: "971500000000", type: "text", text: { body: "Hi" } }]))).toEqual([
    { phoneNumberId: "111", id: "wamid.A", from: "971500000000@c.us", type: "chat", body: "Hi", mediaUrl: null, mediaId: undefined, pushname: "Sample" },
  ]);
});

test("meta: voice note keeps the media id, buttons read as text", () => {
  const [voice, button, list] = parseMetaWebhook(meta([
    { id: "a", from: "971500000000", type: "audio", audio: { id: "M1", voice: true } },
    { id: "b", from: "971500000000", type: "button", button: { text: "1" } },
    { id: "c", from: "971500000000", type: "interactive", interactive: { list_reply: { title: "Cleaning" } } },
  ]));
  expect(voice).toMatchObject({ type: "ptt", mediaId: "M1" });
  expect(button).toMatchObject({ type: "chat", body: "1" });
  expect(list).toMatchObject({ type: "chat", body: "Cleaning" });
});

test("meta: statuses, other fields, bad senders and junk are skipped", () => {
  expect(parseMetaWebhook(meta([], { messages: undefined, statuses: [{ id: "x", status: "read" }] }))).toEqual([]);
  expect(parseMetaWebhook({ ...meta([{ id: "a", from: "971500000000", type: "text" }]), object: "page" })).toEqual([]);
  expect(parseMetaWebhook(meta([{ id: "", from: "971500000000", type: "text" }, { id: "b", from: "group@g.us", type: "text" }]))).toEqual([]);
  expect(parseMetaWebhook(null)).toEqual([]);
});

test("meta: signature is checked against the raw body", () => {
  const body = JSON.stringify(meta([]));
  const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
  expect(metaSignatureOk(body, sig, "s3cret")).toBe(true);
  expect(metaSignatureOk(body + " ", sig, "s3cret")).toBe(false);
  expect(metaSignatureOk(body, sig, "other")).toBe(false);
  expect(metaSignatureOk(body, null, "s3cret")).toBe(false);
  expect(metaSignatureOk(body, sig, undefined)).toBe(false);
});

test("meta: the token only goes to Meta media hosts", () => {
  expect(metaMediaHost("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1")).toBe(true);
  expect(metaMediaHost("http://lookaside.fbsbx.com/x")).toBe(false);
  expect(metaMediaHost("https://fbsbx.com.evil.io/x")).toBe(false);
  expect(metaMediaHost("not a url")).toBe(false);
});
