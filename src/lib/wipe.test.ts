import { expect, test } from "vitest";
import { wipePlan } from "./wipe";

test("wipePlan: fixed order, dentists bring the calendar, junk is refused", () => {
  expect(wipePlan(["dentists", "chats"])).toEqual(["chats", "calendar", "dentists"]);
  expect(wipePlan(["patients", "activity", "patients"])).toEqual(["activity", "patients"]);
  expect(wipePlan(["services"])).toEqual(["services"]);
  expect(wipePlan([])).toBeNull();
  expect(wipePlan(["clinics"])).toBeNull();
  expect(wipePlan("patients")).toBeNull();
});
