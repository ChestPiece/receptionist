import { expect, test } from "vitest";
import type { Clinic } from "./clinics";
import { buildInstructions } from "./sara";

const clinic: Clinic = {
  id: "c1",
  slug: "sample",
  name: "Sample Smile",
  utc_offset_minutes: 240,
  hours: { thu: [["09:00", "17:00"]] },
  services: [{ id: "s1", name: "Check-up", name_ar: "Check-up", minutes: 30, price_aed: 100, active: true, sort: 0 }],
  dentists: [],
  insurers: [],
  faq: [],
  phone: null,
  address: null,
  maps_url: null,
  persona: {},
  branding: {},
  staff_whatsapp: null,
  ultramsg_instance_id: null,
  active: true,
  wa: null,
  webhook_secret: null,
};

test("the prompt prefix is the same at any time of day and for any patient", () => {
  const a = buildInstructions(clinic, null, "971500000000@c.us", new Date("2026-10-30T05:00:00Z"));
  const b = buildInstructions(clinic, "Anas Altaf", "971500000000@c.us", new Date("2026-10-31T17:42:00Z"));
  const cut = a.indexOf("Today is");
  expect(cut).toBeGreaterThan(a.indexOf("Clinic info"));
  expect(b.slice(0, cut)).toBe(a.slice(0, cut));
  expect(b).toContain("Anas Altaf (name on file, do not ask again)");
});

test("dentists show in the prompt only when the clinic has more than one", () => {
  const d = (id: string, name: string) => ({ id, name, name_ar: name, title: "General", color: "#000", hours: {}, active: true, sort: 0, service_ids: ["s1"] });
  const now = new Date("2026-10-30T05:00:00Z");
  expect(buildInstructions({ ...clinic, dentists: [d("d1", "Dr. Amal Haddad")] }, null, null, now)).not.toContain('"dentists"');
  const two = buildInstructions({ ...clinic, dentists: [d("d1", "Dr. Amal Haddad"), d("d2", "Dr. Omar Siddiqui")] }, null, null, now);
  expect(two).toContain('"dentists":[{"name":"Dr. Amal Haddad"');
  expect(two).toContain("Ask which dentist only if");
});

test("the prompt tells Sara how to read staff messages and web visits", () => {
  const p = buildInstructions(clinic, null, null, new Date("2026-10-30T05:00:00Z"));
  expect(p).toContain("[Front desk]");
  expect(p).toContain("booked in this chat");
});
