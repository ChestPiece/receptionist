import { expect, test } from "vitest";
import { joinTurn, voiceText } from "./turns";

test("joinTurn glues a fragment onto an unfinished turn of the same role", () => {
  expect(joinTurn({ role: "assistant", text: "Perfect, I'll lock that in for" }, "assistant", "you now.")).toBe("Perfect, I'll lock that in for you now.");
  expect(joinTurn({ role: "user", text: "Wednesday" }, "user", "the 11")).toBe("Wednesday the 11");
});

test("joinTurn starts a new turn after a finished sentence or a different speaker", () => {
  expect(joinTurn({ role: "assistant", text: "Done." }, "assistant", "Anything else?")).toBeNull();
  expect(joinTurn({ role: "assistant", text: "Which day" }, "user", "Friday")).toBeNull();
  expect(joinTurn(null, "user", "Hi")).toBeNull();
});

test("voiceText removes em dashes like the other channels", () => {
  expect(voiceText("Demo Dental—how can I help")).toBe("Demo Dental, how can I help");
});
