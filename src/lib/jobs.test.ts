import { expect, test } from "vitest";
import { bookingSource, followupDue, followupText, guessService, quietHours, reminderDue, reminderText } from "./jobs";

const DUBAI = 240;

test("no outbound messages before 9 am or from 9 pm clinic time", () => {
  expect(quietHours(new Date("2026-10-22T04:59:00Z"), DUBAI)).toBe(true); // 08:59
  expect(quietHours(new Date("2026-10-22T05:00:00Z"), DUBAI)).toBe(false); // 09:00
  expect(quietHours(new Date("2026-10-22T16:59:00Z"), DUBAI)).toBe(false); // 20:59
  expect(quietHours(new Date("2026-10-22T17:00:00Z"), DUBAI)).toBe(true); // 21:00
});

test("each visit gets a 24h and a 2h reminder, once each, only if booked before that window", () => {
  const now = new Date("2026-10-22T08:00:00Z");
  const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();
  const visit = (startH: number, createdH = -48, r24: string | null = null, r2: string | null = null) => ({
    starts_at: at(startH),
    created_at: at(createdH),
    reminded_24h_at: r24,
    reminded_2h_at: r2,
  });
  expect(reminderDue(visit(30), now)).toBe(null); // too early
  expect(reminderDue(visit(23), now)).toBe("24h");
  expect(reminderDue(visit(23, -48, at(-1)), now)).toBe(null); // already sent
  expect(reminderDue(visit(23, -0.5), now)).toBe(null); // booked 30 min ago, inside the 24h window
  expect(reminderDue(visit(1.5, -48, at(-20)), now)).toBe("2h");
  expect(reminderDue(visit(1.5, -48, null), now)).toBe("2h"); // missed 24h is skipped, not sent late
  expect(reminderDue(visit(1.5, -48, at(-20), at(-0.2)), now)).toBe(null);
  expect(reminderDue(visit(1.5, -0.25), now)).toBe(null); // booked 15 min ago, inside the 2h window
  expect(reminderDue(visit(0.25), now)).toBe(null); // too close to bother
});

test("reminder text is bilingual, names the visit and asks for 1 or 2", () => {
  const text = reminderText({ name: "Anas Altaf", service: "Check-up", startsAt: new Date("2026-10-23T12:00:00Z"), clinic: "Sample Smile Dental", offsetMin: DUBAI });
  expect(text).toContain("Hi Anas");
  expect(text).toContain("Check-up");
  expect(text).toMatch(/Fri, Oct 23.*4:00\sPM/);
  expect(text).toContain("Reply 1 to confirm or 2 to change it");
  expect(text).toMatch(/[؀-ۿ]/); // Arabic part
  expect(reminderText({ name: null, service: "Check-up", startsAt: new Date(), clinic: "X", offsetMin: DUBAI })).toMatch(/^Hi,/);
  expect(text).not.toContain("with Dr");
  expect(reminderText({ name: null, service: "Check-up", startsAt: new Date(), clinic: "X", offsetMin: DUBAI, dentist: "Dr. Lina" })).toContain("Check-up with Dr. Lina");
});

test("one follow-up for a chat that went quiet 3 to 20 hours ago without a booking", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const chat = { lastAt: ago(4), sentAt: null as string | null, optedOut: false, paused: false, upcoming: 0 };
  expect(followupDue(chat, now)).toBe(true);
  expect(followupDue({ ...chat, lastAt: ago(2) }, now)).toBe(false); // still fresh
  expect(followupDue({ ...chat, lastAt: ago(21) }, now)).toBe(false); // too old to nudge
  expect(followupDue({ ...chat, upcoming: 1 }, now)).toBe(false); // booked
  expect(followupDue({ ...chat, optedOut: true }, now)).toBe(false);
  expect(followupDue({ ...chat, paused: true }, now)).toBe(false); // staff own the chat
  expect(followupDue({ ...chat, sentAt: ago(3) }, now)).toBe(false); // already nudged after this message
  expect(followupDue({ ...chat, sentAt: ago(48) }, now)).toBe(true); // a new inquiry after an old nudge
});

test("the follow-up names the service asked about and offers one time", () => {
  const services = ["Check-up", "Teeth whitening", "Filling"].map((name) => ({ name, name_ar: null as string | null }));
  expect(guessService('[{"content":"how much is teeth whitening?"},{"content":"and a filling"}]', services)).toBe("Filling");
  expect(guessService('[{"content":"hi"}]', services)).toBe(null);
  expect(guessService('[{"content":"بكم تبييض الأسنان؟"}]', [...services, { name: "Teeth whitening", name_ar: "تبييض الأسنان" }])).toBe("Teeth whitening");
  const text = followupText({ name: "Anas Altaf", service: "Teeth whitening", slot: "Fri, Oct 23, 4:00 PM", clinic: "Sample Smile Dental" });
  expect(text).toContain("Hi Anas");
  expect(text).toContain("Teeth whitening");
  expect(text).toContain("Fri, Oct 23, 4:00 PM");
  expect(text).toContain("STOP");
  expect(text).toMatch(/[؀-ۿ]/);
  expect(followupText({ name: null, service: null, slot: null, clinic: "X" })).not.toContain("null");
});

test("a booking within 48 hours of a follow-up counts as won by the follow-up", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  expect(bookingSource("2026-10-21T12:00:00Z", now)).toBe("followup");
  expect(bookingSource("2026-10-19T12:00:00Z", now)).toBe("chat");
  expect(bookingSource(null, now)).toBe("chat");
});

test("the follow-up uses the clinic's assistant name", () => {
  const base = { name: null, service: null, slot: null, clinic: "X" };
  expect(followupText(base)).toContain("it's Sara from X");
  expect(followupText(base)).toContain("سارة");
  expect(followupText({ ...base, persona: "Layla" })).toContain("it's Layla from X");
});
