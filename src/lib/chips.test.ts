import { describe, expect, it } from "vitest";
import { icsFor, markerOf, splitChips, toolChips } from "./chips";

describe("splitChips", () => {
  it("parses a complete marker and strips it", () => {
    expect(splitChips("Sure!\n[[chips: Tomorrow | This week | Cheapest]]")).toEqual({ text: "Sure!", chips: ["Tomorrow", "This week", "Cheapest"] });
  });
  it("hides a partial marker while streaming", () => {
    for (const s of ["Sure!\n[[chips: Tomo", "Sure!\n[[", "Sure!\n[[chips"]) expect(splitChips(s)).toMatchObject({ text: "Sure!", chips: [] });
    expect(splitChips("Sure! [").text).toBe("Sure!");
  });
  it("returns plain text untouched when there is no marker", () => {
    expect(splitChips("Hello there")).toEqual({ text: "Hello there", chips: [] });
  });
  it("hides a malformed marker and gives no chips", () => {
    expect(splitChips("Hi\n[[chips Tomorrow]]")).toMatchObject({ text: "Hi", chips: [] });
    expect(splitChips("Hi\n[[chips: ]]")).toMatchObject({ text: "Hi", chips: [] });
  });
  it("keeps Arabic chips", () => {
    expect(splitChips("أهلاً\n[[chips: غداً | هذا الأسبوع]]").chips).toEqual(["غداً", "هذا الأسبوع"]);
  });
  it("caps at 4 chips, 28 chars each, drops empties and duplicates", () => {
    const r = splitChips(`x [[chips: a | b | | a | c | d | e | ${"z".repeat(40)}]]`);
    expect(r.chips).toEqual(["a", "b", "c", "d"]);
    expect(splitChips(`x [[chips: ${"z".repeat(40)}]]`).chips[0]).toHaveLength(28);
  });
});

describe("markerOf", () => {
  it("finds the marker in the last assistant item of saved history", () => {
    const h = [{ role: "assistant", content: [{ type: "output_text", text: "old [[chips: Old]]" }] }, { role: "user", content: "hi" }, { role: "assistant", content: [{ type: "output_text", text: "ok\n[[chips: Yes | No]]" }] }];
    expect(markerOf(h)).toBe("[[chips: Yes | No]]");
    expect(markerOf([{ role: "assistant", content: [{ type: "output_text", text: "no marker" }] }])).toBe("");
  });
});

describe("toolChips", () => {
  const part = (toolName: string, output: unknown) => ({ type: "dynamic-tool", toolName, state: "output-available", output });
  it("offers other day after find_slots, plus the team when every day is empty", () => {
    expect(toolChips([part("find_slots", { days: [{ date: "2026-11-03", times: ["09:00"] }] })], false).map((c) => c.label)).toEqual(["Other day"]);
    expect(toolChips([part("find_slots", { days: [{ date: "2026-11-03", times: [] }] })], false).map((c) => c.label)).toEqual(["Other day", "Talk to the team"]);
  });
  it("gives nothing for the all-services find_slots shape", () => {
    expect(toolChips([part("find_slots", { services: [{ service: "Filling", days: [] }] })], false)).toEqual([]);
  });
  it("after book: calendar, another visit, reschedule", () => {
    const out = { booked: true, service: "Filling", date: "2026-11-03", time: "16:00", address: null };
    const chips = toolChips([part("book", JSON.stringify(out))], false);
    expect(chips.map((c) => c.label)).toEqual(["Add to calendar", "Book another visit", "Reschedule"]);
    expect(chips[0].ics?.service).toBe("Filling");
  });
  it("after my_appointments, and in Arabic", () => {
    expect(toolChips([part("my_appointments", [{ id: "1" }])], false).map((c) => c.label)).toEqual(["Reschedule", "Cancel a visit"]);
    expect(toolChips([part("my_appointments", [{ id: "1" }])], true)[0].label).toBe("تغيير الموعد");
  });
  it("ignores unfinished tools", () => {
    expect(toolChips([{ type: "dynamic-tool", toolName: "book", state: "input-available" }], false)).toEqual([]);
  });
});

describe("icsFor", () => {
  it("builds a floating-time 30 minute event", () => {
    const ics = icsFor({ service: "Filling", date: "2026-11-03", time: "16:00", address: "Dubai" });
    expect(ics).toContain("DTSTART:20261103T160000");
    expect(ics).toContain("DTEND:20261103T163000");
    expect(ics).toContain("SUMMARY:Filling");
    expect(ics).toContain("LOCATION:Dubai");
  });
});
