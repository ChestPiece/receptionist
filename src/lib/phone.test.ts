import { expect, test } from "vitest";
import { normUaePhone, waIdOf } from "./phone";

test("UAE mobiles normalise to WhatsApp digits", () => {
  for (const raw of ["050 123 4567", "+971 50 123 4567", "971501234567", "0501234567", "00971501234567"]) expect(normUaePhone(raw)).toBe("971501234567");
  for (const raw of ["12", "abc", "", "04 123 4567"]) expect(normUaePhone(raw)).toBeNull();
  expect(waIdOf("971501234567")).toBe("971501234567@c.us");
});
