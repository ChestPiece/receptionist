import { expect, test } from "vitest";
import { visitSummary } from "./events";

const v = { patient: "Ali Khan", service: "Cleaning", date: "2025-11-04", time: "10:00" };

test("summary reads like a sentence a receptionist would say", () => {
  expect(visitSummary("Booked", { ...v, dentist: "Dr. Amal" })).toBe("Booked Ali Khan · Cleaning · Tue 4 Nov 10:00 · Dr. Amal");
});

test("no dentist part when the clinic has one dentist", () => {
  expect(visitSummary("Moved", v)).toBe("Moved Ali Khan · Cleaning · Tue 4 Nov 10:00");
});

test("unnamed patient and a trailing note", () => {
  expect(visitSummary("Could not book", { ...v, patient: null }, "time already taken")).toBe("Could not book a patient · Cleaning · Tue 4 Nov 10:00: time already taken");
});
