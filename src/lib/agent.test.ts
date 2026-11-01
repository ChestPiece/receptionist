import { user, type AgentInputItem, type RunItem } from "@openai/agents";
import { expect, test } from "vitest";
import { capText, safeMediaUrl, sorry, stillPaused, tidy, trimHistory } from "./agent";
import { tooFar, wroteData } from "./sara";
import { isEmergency } from "./safety";

test("trimHistory keeps the last N turns and starts at a user message", () => {
  const call = { type: "function_call", callId: "c", name: "find_slots", arguments: "{}" } as AgentInputItem;
  const items = [user("a"), call, user("b"), call, user("c")];
  expect(trimHistory(items, 2)).toEqual([user("b"), call, user("c")]);
  expect(trimHistory(items, 5)).toBe(items);
});

test("tidy removes en and em dashes the way a person would write", () => {
  expect(tidy("open 9 am–1 pm and 4–9 pm")).toBe("open 9 am to 1 pm and 4 to 9 pm");
  expect(tidy("if you'd prefer—would you like")).toBe("if you'd prefer, would you like");
  expect(tidy("Thu 22 Oct — 4 pm")).toBe("Thu 22 Oct, 4 pm");
  expect(tidy("check-up at 9")).toBe("check-up at 9");
});

test("a handoff pause expires so a chat never stays dead", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  expect(stillPaused({ bot_paused: true, updated_at: "2026-10-22T09:45:00Z" }, now)).toBe(true);
  expect(stillPaused({ bot_paused: true, updated_at: "2026-10-22T09:00:00Z" }, now)).toBe(false);
  expect(stillPaused({ bot_paused: false, updated_at: "2026-10-22T09:59:00Z" }, now)).toBe(false);
  expect(stillPaused(null, now)).toBe(false);
});

test("a superseded run keeps its reply only if it changed data", () => {
  const call = (name: string) => ({ type: "tool_call_item", rawItem: { type: "function_call", name } }) as unknown as RunItem;
  expect(wroteData([call("find_slots"), call("my_appointments")])).toBe(false);
  expect(wroteData([call("find_slots"), call("book")])).toBe(true);
  expect(wroteData([])).toBe(false);
});

test("emergency check catches the stress-test message without an apostrophe", () => {
  expect(isEmergency("i cant breathe")).toBe(true);
});

test("very long messages are cut before they reach the model", () => {
  expect(capText("hi")).toBe("hi");
  const long = capText("x".repeat(20_000));
  expect(long.length).toBeLessThan(1_600);
  expect(long.endsWith("[message cut]")).toBe(true);
});

test("bookings are limited to 60 days ahead", () => {
  expect(tooFar("2026-12-21", "2026-10-22")).toBe(false);
  expect(tooFar("2026-12-22", "2026-10-22")).toBe(true);
  expect(tooFar("2028-10-22", "2026-10-22")).toBe(true);
});

test("voice notes are only fetched from public https urls", () => {
  expect(safeMediaUrl("https://files.ultramsg.com/a.ogg")).toBe(true);
  for (const u of ["http://files.ultramsg.com/a.ogg", "https://127.0.0.1/a", "https://localhost/a", "https://10.0.0.5/a", "https://[::1]/a", "file:///etc/passwd", "not a url"])
    expect(safeMediaUrl(u), u).toBe(false);
});

test("the error reply only promises staff when staff get alerts", () => {
  expect(sorry("+971 4", null)).not.toMatch(/team member will reply/);
  expect(sorry("+971 4", null)).toContain("+971 4");
  expect(sorry(null, null)).not.toContain("null");
  expect(sorry("+971 4", "971500000000@c.us")).toMatch(/team member will reply/);
});
