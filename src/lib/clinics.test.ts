import { expect, test } from "vitest";
import { personaName, toClinic } from "./clinics";

test("the assistant is called Sara unless the clinic names it", () => {
  expect(personaName({ persona: {} })).toBe("Sara");
  expect(personaName({ persona: { name: "" } })).toBe("Sara");
  expect(personaName({ persona: { name: "Layla" } })).toBe("Layla");
});

const svc = (id: string, name: string, sort: number, active = true) => ({ id, name, name_ar: name, minutes: 30, price_aed: 100, active, sort });
const dent = (id: string, name: string, sort: number, ids: string[]) => ({
  id, name, name_ar: null, title: null, color: "#000", hours: {}, active: true, sort, dentist_services: ids.map((service_id) => ({ service_id })),
});

test("toClinic maps services and dentists from their tables, not the legacy jsonb", () => {
  const c = toClinic({
    id: "c1", services: [{ name: "Legacy" }],
    service_rows: [svc("s3", "Whitening", 1), svc("s2", "Cleaning", 1), svc("s1", "Exam", 0), svc("s4", "Old", 0, false)],
    dentists: [dent("d2", "Zed", 1, ["s1"]), dent("d1", "Amy", 1, ["s1", "s2"]), dent("d0", "Bob", 0, [])],
    clinic_secrets: null, ultramsg_instance_id: null, persona: null, branding: null,
  } as never);
  expect(c.services.map((s) => s.name)).toEqual(["Exam", "Cleaning", "Whitening"]);
  expect(c.dentists.map((d) => d.name)).toEqual(["Bob", "Amy", "Zed"]);
  expect(c.dentists[1].service_ids).toEqual(["s1", "s2"]);
  expect("dentist_services" in c.dentists[1]).toBe(false);
});

test("toClinic picks the clinic's WhatsApp provider, and only with its credentials", () => {
  const row = (r: Record<string, unknown>) => toClinic({ id: "c1", service_rows: [], dentists: [], persona: null, branding: null, ultramsg_instance_id: "123", meta_phone_number_id: "999", ...r } as never).wa;
  const secrets = { ultramsg_token: "u", webhook_secret: "w", meta_token: "m" };
  expect(row({ clinic_secrets: secrets })).toEqual({ provider: "ultramsg", instanceId: "123", token: "u" }); // before 0013: no wa_provider
  expect(row({ clinic_secrets: secrets, wa_provider: "meta" })).toEqual({ provider: "meta", phoneNumberId: "999", token: "m" });
  expect(row({ clinic_secrets: { ...secrets, meta_token: null }, wa_provider: "meta" })).toBeNull();
  expect(row({ clinic_secrets: null, wa_provider: "meta" })).toBeNull();
});
