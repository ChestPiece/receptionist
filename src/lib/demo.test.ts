import { expect, test } from "vitest";
import { demoCutoff, demoDates, deskView, seedPlan } from "./demo";

const OFF = 240; // Dubai
const dentists = [{ id: "d1", name: "Dr. One" }, { id: "d2", name: "Dr. Two" }];
const visit = (id: string, patient: string, startsAt: string, endsAt: string, status = "booked") =>
  ({ id, patient_id: patient, dentist_id: "d1", service: "Cleaning", starts_at: startsAt, ends_at: endsAt, status });

test("deskView: other visitors stay anonymous, own visit is flagged and named", () => {
  const dates = ["2026-11-05", "2026-11-06"];
  const out = deskView(
    [visit("a", "me", "2026-11-05T06:00:00Z", "2026-11-05T06:45:00Z"), visit("b", "other", "2026-11-06T10:30:00Z", "2026-11-06T11:00:00Z"), visit("c", "x", "2026-11-09T06:00:00Z", "2026-11-09T07:00:00Z")],
    "me", dates, OFF, dentists,
  );
  expect(out).toHaveLength(2); // the 9th is outside the window
  expect(out[0]).toMatchObject({ id: "a", day: 0, start: 10, end: 10.75, title: "Cleaning", mine: true });
  expect(out[1]).toMatchObject({ id: "b", day: 1, start: 14.5, title: "Booked", name: "Dr. One", mine: false });
  expect(JSON.stringify(out[1])).not.toContain("Cleaning");
});

test("deskView: no visitor yet means nothing is mine", () => {
  expect(deskView([visit("a", "me", "2026-11-05T06:00:00Z", "2026-11-05T06:30:00Z")], null, ["2026-11-05"], OFF, dentists)[0].mine).toBe(false);
});

test("demoDates: starts on the clinic's local today, even just after UTC midnight", () => {
  expect(demoDates(new Date("2026-11-04T21:30:00Z"), OFF)).toEqual(["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]);
});

test("demoCutoff: six hours back", () => {
  expect(demoCutoff(new Date("2026-11-05T12:00:00Z"))).toBe("2026-11-05T06:00:00.000Z");
});

test("seedPlan: only inside each dentist's hours, nothing on a closed day", () => {
  const ds = [
    { id: "d1", active: true, service_ids: ["s1"], hours: { thu: [["09:00", "13:00"]] as [string, string][] } },
    { id: "d2", active: true, service_ids: ["s1"], hours: { thu: [["09:00", "21:00"]] as [string, string][] } },
    { id: "d3", active: false, service_ids: ["s1"], hours: { thu: [["09:00", "21:00"]] as [string, string][] } },
  ];
  const plan = seedPlan("2026-11-05", ds, () => 45); // a Thursday
  expect(plan.every((p) => p.dentist_id !== "d3")).toBe(true);
  expect(plan.filter((p) => p.dentist_id === "d1").map((p) => p.time)).toEqual(["10:00"]); // 14:00 and 18:00 are after 13:00
  expect(plan.filter((p) => p.dentist_id === "d2").map((p) => p.time)).toEqual(["11:30", "16:30"]);
  expect(seedPlan("2026-11-06", ds, () => 45)).toEqual([]); // Friday: closed
});
