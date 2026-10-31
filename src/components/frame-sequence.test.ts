import { expect, test } from "vitest";
import { frameAt } from "./frame-sequence";

test("frameAt maps progress to a zero-based frame", () => {
  expect(frameAt(0, 90)).toBe(0);
  expect(frameAt(1, 90)).toBe(89);
  expect(frameAt(0.5, 90)).toBe(45);
  expect(frameAt(0.5, 45)).toBe(22);
});

test("frameAt clamps out-of-range and bad input", () => {
  expect(frameAt(-0.2, 90)).toBe(0);
  expect(frameAt(1.3, 90)).toBe(89);
  expect(frameAt(Number.NaN, 90)).toBe(0);
  expect(frameAt(0.7, 1)).toBe(0);
  expect(frameAt(0.7, 0)).toBe(0);
});
