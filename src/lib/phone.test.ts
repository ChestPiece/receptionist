import { expect, test } from "vitest";
import { normUaePhone, waIdOf } from "./phone";

test("UAE mobiles normalise to WhatsApp digits", () => {
  for (const raw of ["050 123 4567", "+971 50 123 4567", "971501234567", "0501234567", "00971501234567"]) expect(normUaePhone(raw)).toBe("971501234567");
  for (const raw of ["12", "abc", "", "04 123 4567"]) expect(normUaePhone(raw)).toBeNull();
  expect(waIdOf("971501234567")).toBe("971501234567@c.us");
});

import { contactDigits } from "./phone";
test("contactDigits: what staff dial", () => {
  expect(contactDigits("050 123 4567", null)).toBe("971501234567");
  expect(contactDigits("+971 50 123 4567", "971500000000@c.us")).toBe("971501234567");
  expect(contactDigits(null, "971500000000@c.us")).toBe("971500000000");
  expect(contactDigits("+44 7700 900123", null)).toBe("447700900123");
  expect(contactDigits("12", null)).toBeNull();
  expect(contactDigits(null, null)).toBeNull();
});
