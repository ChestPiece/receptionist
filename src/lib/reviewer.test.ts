import { expect, test } from "vitest";
import { reviewEvents, shouldReview, toolTrace } from "./reviewer";

test("gate: a tool call always triggers a review", () => {
  expect(shouldReview("Sure!", [{ name: "find_slots", output: "{}" }])).toBe(true);
});

test("gate: plain greetings are skipped", () => {
  expect(shouldReview("Hi! How can I help you today?", [])).toBe(false);
  expect(shouldReview("أهلا بك، كيف أساعدك؟", [])).toBe(false);
});

test("gate: price, insurer, date or time mentions trigger", () => {
  expect(shouldReview("A cleaning is 250 AED.", [])).toBe(true);
  expect(shouldReview("التنظيف ٢٥٠ درهم", [])).toBe(true);
  expect(shouldReview("We accept Daman insurance.", [])).toBe(true);
  expect(shouldReview("نقبل التأمين", [])).toBe(true);
  expect(shouldReview("See you tomorrow!", [])).toBe(true);
  expect(shouldReview("نراك غدا", [])).toBe(true);
  expect(shouldReview("Open Saturday", [])).toBe(true);
});

test("events: no issues, no events", () => {
  expect(reviewEvents("c1", "p1", { ok: true, issues: [] })).toEqual([]);
});

test("events: each issue becomes a reviewer warn event", () => {
  const e = reviewEvents("c1", "p1", { ok: false, issues: [{ kind: "unbacked_claim", note: "Quoted 300 AED, not in clinic info" }, { kind: "unanswered", note: "Never said the hours" }] });
  expect(e).toHaveLength(2);
  expect(e[0]).toMatchObject({ clinicId: "c1", patientId: "p1", actor: "reviewer", level: "warn", kind: "review" });
  expect(e[0].summary).toBe("Unbacked claim: Quoted 300 AED, not in clinic info");
  expect(e[1].summary).toBe("Unanswered question: Never said the hours");
});

test("trace pairs each tool call with its output", () => {
  const items = [
    { type: "tool_call_item", rawItem: { name: "book", callId: "a" } },
    { type: "tool_call_output_item", rawItem: { callId: "a" }, output: "booked" },
    { type: "message_output_item", rawItem: {} },
  ] as never;
  expect(toolTrace(items)).toEqual([{ name: "book", output: "booked" }]);
});
