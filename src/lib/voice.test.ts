import { Behavior } from "@google/genai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Clinic } from "./clinics";

const g = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@google/genai", async (orig) => ({ ...(await orig<typeof import("@google/genai")>()), GoogleGenAI: class { authTokens = { create: g.create }; } }));
vi.mock("./db", () => ({ db: () => ({}) }));

import { liveTools, MAX_MS, mintToken, READ_TOOLS, voiceSession } from "./voice";

const clinic = { id: "c1", slug: "demo", name: "Demo Dental", utc_offset_minutes: 240, hours: { thu: [["09:00", "17:00"]] }, services: [], dentists: [], insurers: [], faq: [], phone: null, address: null, maps_url: null, persona: {}, branding: {}, staff_whatsapp: null, ultramsg_instance_id: null, active: true, wa: null, webhook_secret: null } as unknown as Clinic;
const patient = { id: "p1", name: null, phone: null };

describe("liveTools", () => {
  it("reads run NON_BLOCKING so Sara keeps talking; writes BLOCKING so she never says booked early", () => {
    const by = Object.fromEntries(liveTools().map((t) => [t.name, t.behavior]));
    for (const r of READ_TOOLS) expect(by[r]).toBe(Behavior.NON_BLOCKING);
    for (const w of ["book", "cancel", "reschedule", "confirm_visit", "handoff_to_staff", "end_call"]) expect(by[w]).toBe(Behavior.BLOCKING);
  });
});

describe("voiceSession", () => {
  beforeEach(() => vi.unstubAllEnvs());
  it("uses Sulafat, a VAD that hears short answers, resumption, no proactivity or affective dialog fields", () => {
    const { model, config } = voiceSession(clinic, patient, [], { quick: "Check-up: Thursday 19 November 9 am" });
    expect(model).toBe("gemini-3.8-live");
    expect(config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe("Sulafat");
    expect(config.realtimeInputConfig?.automaticActivityDetection).toMatchObject({ startOfSpeechSensitivity: "START_SENSITIVITY_HIGH", silenceDurationMs: 700, prefixPaddingMs: 20 });
    expect(config.sessionResumption).toEqual({});
    expect(config).not.toHaveProperty("proactivity"); // always on in gemini-3.8-live
    expect(config).not.toHaveProperty("enableAffectiveDialog");
    expect(String(config.systemInstruction)).toContain("Check-up: Thursday 19 November 9 am");
  });
  it("GEMINI_LIVE_VOICE overrides the voice; a resume handle goes into the locked config", () => {
    vi.stubEnv("GEMINI_LIVE_VOICE", "Aoede");
    const { config } = voiceSession(clinic, patient, [], { handle: "h1" });
    expect(config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe("Aoede");
    expect(config.sessionResumption).toEqual({ handle: "h1" });
  });
});

describe("mintToken", () => {
  it("mints a one-use token that Google closes just after the call cap", async () => {
    g.create.mockResolvedValue({ name: "auth_tokens/x" });
    const s = voiceSession(clinic, patient, []);
    expect(await mintToken(s, 1_000)).toBe("auth_tokens/x");
    const { config } = g.create.mock.lastCall![0];
    expect(config).toMatchObject({ uses: 1, newSessionExpireTime: new Date(61_000).toISOString(), expireTime: new Date(1_000 + MAX_MS + 30_000).toISOString(), liveConnectConstraints: s });
  });
  it("a resumed call keeps the original call's end, not a fresh 8 minutes", async () => {
    g.create.mockResolvedValue({ name: "auth_tokens/x" });
    await mintToken(voiceSession(clinic, patient, []), 300_000, 1_000 + MAX_MS);
    expect(g.create.mock.lastCall![0].config.expireTime).toBe(new Date(1_000 + MAX_MS + 30_000).toISOString());
  });
});
