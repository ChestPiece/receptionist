import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  allow: vi.fn(), logEvent: vi.fn(), mintToken: vi.fn(), inCall: vi.fn(), runTool: vi.fn(), quickOptions: vi.fn(),
  calls: 0, paused: false,
}));
// A Supabase query builder stand-in: every method chains, awaiting it gives this table's result.
const q = (r: unknown) => new Proxy({}, { get: (_, k) => (k === "then" ? (res: (v: unknown) => void) => res(r) : () => q(r)) });
vi.mock("@/lib/db", () => ({ allow: m.allow, db: () => ({ from: (t: string) => q(t === "agent_events" ? { count: m.calls } : { data: { history: [], bot_paused: m.paused, updated_at: new Date().toISOString() } }) }) }));
vi.mock("@/lib/clinics", () => ({ clinicBySlug: async () => ({ id: "c1", active: true }) }));
vi.mock("@/lib/events", () => ({ logEvent: m.logEvent }));
vi.mock("@/lib/agent", () => ({ stillPaused: (c: { bot_paused: boolean }) => c?.bot_paused, spokenHistory: () => "", trimHistory: (h: unknown) => h }));
vi.mock("@/lib/visitor", () => ({
  sameOrigin: () => true, ipOf: () => "1.1.1.1", overRateLimit: async () => false, inCall: m.inCall,
  upsertVisitor: async () => ({ id: "p1", name: null, phone: null }), findVisitor: async () => ({ id: "p1", name: null, phone: null }),
}));
vi.mock("@/lib/voice", () => ({ voiceSession: () => ({ model: "gemini-3.8-live", config: {} }), mintToken: m.mintToken, quickOptions: m.quickOptions, MAX_MS: 480_000 }));
vi.mock("@/lib/sara", () => ({ runTool: m.runTool }));

import { POST } from "./route";
import { POST as TOOL } from "./tool/route";
import { POST as END } from "./end/route";

const post = (body: object) => new Request("http://x/api/voice", { method: "POST", body: JSON.stringify({ slug: "demo", visitorId: "6f1c1e9e-8a7b-4c4d-9e2f-1a2b3c4d5e6f", ...body }) });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(m, { calls: 0, paused: false });
  m.allow.mockResolvedValue(true);
  m.mintToken.mockResolvedValue("auth_tokens/x");
  m.inCall.mockResolvedValue(new Date().toISOString());
  m.quickOptions.mockResolvedValue("");
});

describe("POST /api/voice", () => {
  it("returns { token, model } and logs one call", async () => {
    const res = await POST(post({}));
    expect(await res.json()).toEqual({ token: "auth_tokens/x", model: "gemini-3.8-live" });
    expect(m.logEvent).toHaveBeenCalledTimes(1);
  });
  it("mint 429 returns busy", async () => {
    m.mintToken.mockRejectedValue(Object.assign(new Error("quota"), { status: 429 }));
    const res = await POST(post({}));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "busy" });
  });
  it("resume does not log a call and needs a live call", async () => {
    expect((await POST(post({ resume: "h1" }))).status).toBe(200);
    expect(m.logEvent).not.toHaveBeenCalled();
    m.inCall.mockResolvedValue(null);
    expect((await POST(post({ resume: "h1" }))).status).toBe(429);
  });
  it("resume token ends when the original call's 8 minutes end", async () => {
    const start = Date.now() - 5 * 60_000;
    m.inCall.mockResolvedValue(new Date(start).toISOString());
    expect((await POST(post({ resume: "h1" }))).status).toBe(200);
    expect(m.mintToken).toHaveBeenCalledWith(expect.anything(), expect.any(Number), start + 480_000);
  });
  it("resume is refused when the call is nearly over", async () => {
    m.inCall.mockResolvedValue(new Date(Date.now() - 480_000 + 5_000).toISOString());
    expect((await POST(post({ resume: "h1" }))).status).toBe(429);
    expect(m.mintToken).not.toHaveBeenCalled();
  });
  it("paused chat returns 409", async () => {
    m.paused = true;
    expect((await POST(post({}))).status).toBe(409);
  });
  it("call-all cap returns busy", async () => {
    m.allow.mockImplementation(async (key: string) => key !== "call-all");
    expect((await POST(post({}))).status).toBe(429);
    expect(m.mintToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/voice/tool", () => {
  afterEach(() => vi.useRealTimers());
  it("tool route times out with spoken fallback", async () => {
    vi.useFakeTimers();
    m.runTool.mockReturnValue(new Promise(() => {}));
    const res = TOOL(new Request("http://x", { method: "POST", body: JSON.stringify({ slug: "demo", visitorId: "6f1c1e9e-8a7b-4c4d-9e2f-1a2b3c4d5e6f", name: "find_slots", args: "{}" }) }));
    await vi.advanceTimersByTimeAsync(8_000);
    expect((await (await res).json()).output).toMatch(/taking longer/);
  });
  it("a slow write never tells Sara to just try again", async () => {
    vi.useFakeTimers();
    m.runTool.mockReturnValue(new Promise(() => {}));
    const res = TOOL(new Request("http://x", { method: "POST", body: JSON.stringify({ slug: "demo", visitorId: "6f1c1e9e-8a7b-4c4d-9e2f-1a2b3c4d5e6f", name: "book", args: "{}" }) }));
    await vi.advanceTimersByTimeAsync(8_000);
    const { output } = await (await res).json();
    expect(output).toMatch(/my_appointments/);
    expect(output).not.toMatch(/try again/);
  });
});

describe("POST /api/voice/end", () => {
  const metrics = { connectMs: 1800, callMs: 95_000, firstAudioMs: [700, 900], toolMs: [300], endReason: "goodbye", resumes: 0, nudges: 0 };
  it("logs one call_metrics event for a live call", async () => {
    const res = await END(post(metrics));
    expect(res.status).toBe(204);
    expect(m.logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "call_metrics", summary: "Web call ended (goodbye, 1:35)", data: metrics }));
  });
  it("logs nothing without a live call", async () => {
    m.inCall.mockResolvedValue(false);
    expect((await END(post(metrics))).status).toBe(404);
    expect(m.logEvent).not.toHaveBeenCalled();
  });
});
