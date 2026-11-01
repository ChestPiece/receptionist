import { expect, test } from "vitest";
import { bookingSource, dentistsFor, freeByDentist, hoursInside, pickDentist, tooFar } from "./booking";
import type { Dentist } from "./clinics";
import { toUtc, type Hours } from "./slots";

const dentist = (id: string, hours: Hours, service_ids: string[]): Dentist => ({
  id, name: id, name_ar: null, title: null, color: null, hours, active: true, sort: 0, service_ids,
});
const H = { sat: [["09:00", "12:00"]] } as Hours; // 2026-11-07 is a Saturday
const amal = dentist("a", H, ["s1"]), lina = dentist("l", { sat: [["10:00", "12:00"]] }, ["s1", "s2"]);
const now = new Date("2026-11-06T20:00:00Z"); // Fri 00:00 local, UTC+4

test("dentistsFor filters by service, active and pick", () => {
  expect(dentistsFor({ dentists: [amal, lina] }, "s2").map((d) => d.id)).toEqual(["l"]);
  expect(dentistsFor({ dentists: [{ ...amal, active: false }, lina] }, "s1").map((d) => d.id)).toEqual(["l"]);
  expect(dentistsFor({ dentists: [amal, lina] }, "s1", "a").map((d) => d.id)).toEqual(["a"]);
  expect(dentistsFor({ dentists: [amal] }, "nope")).toEqual([]);
});

test("dentistsFor sorts by sort", () => {
  expect(dentistsFor({ dentists: [{ ...amal, sort: 2 }, { ...lina, sort: 1 }] }, "s1").map((d) => d.id)).toEqual(["l", "a"]);
});

test("freeByDentist unions dentists and subtracts busy per dentist", () => {
  const busy = [{ dentistId: "a", start: toUtc("2026-11-07", "10:00", 240), end: toUtc("2026-11-07", "11:00", 240) }];
  const free = freeByDentist([amal, lina], busy, 60, "2026-11-07", now, 240);
  expect(free.find((f) => f.time === "09:00")?.dentistIds).toEqual(["a"]);
  expect(free.find((f) => f.time === "10:00")?.dentistIds).toEqual(["l"]); // Amal busy
  expect(free.find((f) => f.time === "11:00")?.dentistIds).toEqual(["a", "l"]);
  expect(free.map((f) => f.time)).toEqual([...free.map((f) => f.time)].sort());
});

test("freeByDentist uses local day across UTC midnight", () => {
  const late = new Date("2026-11-07T07:30:00Z"); // 11:30 local Sat
  expect(freeByDentist([amal], [], 15, "2026-11-07", late, 240).map((f) => f.time)).toEqual(["11:45"]);
});

test("pickDentist prefers lighter day, ties keep order", () => {
  expect(pickDentist(["a", "l"], { a: 3, l: 1 })).toBe("l");
  expect(pickDentist(["a", "l"], {})).toBe("a");
});

test("tooFar and bookingSource live here", () => {
  expect(tooFar("2026-12-21", "2026-10-22")).toBe(false);
  expect(tooFar("2026-12-22", "2026-10-22")).toBe(true);
  expect(bookingSource("2026-10-21T12:00:00Z", new Date("2026-10-22T12:00:00Z"))).toBe("followup");
  expect(bookingSource(null, now)).toBe("chat");
});

test("hoursInside: dentist windows must sit inside opening hours", () => {
  expect(hoursInside({ sat: [["10:00", "12:00"]] }, { sat: [["09:00", "13:00"]] })).toBe(true);
  expect(hoursInside({ fri: [["09:00", "10:00"]] }, { fri: [["16:00", "21:00"]] })).toBe(false);
  expect(hoursInside({ mon: [["10:00", "11:00"]] }, { sat: [["09:00", "13:00"]] })).toBe(false);
});
