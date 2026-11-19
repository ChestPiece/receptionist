import type { Model, ModelRequest, ModelResponse, StreamEvent } from "@openai/agents";
import { APIConnectionTimeoutError, APIUserAbortError } from "openai";
import { describe, expect, it } from "vitest";
import { clientOptions, fallbackModel, fallbackCount, resolveLLM, reviewLLM, withThoughtSignatures, withToolProperties } from "./llm";

describe("withThoughtSignatures (Gemini 3 wants a signature on every replayed tool call)", () => {
  const call = (extra?: object) => ({ id: "c1", type: "function", function: { name: "read_screen", arguments: "{}" }, ...extra });
  it("adds Google's documented skip value to tool calls that have none", () => {
    const out = JSON.parse(withThoughtSignatures(JSON.stringify({ messages: [{ role: "user", content: "hi" }, { role: "assistant", tool_calls: [call()] }] })));
    expect(out.messages[1].tool_calls[0].extra_content).toEqual({ google: { thought_signature: "skip_thought_signature_validator" } });
    expect(out.messages[0]).toEqual({ role: "user", content: "hi" });
  });
  it("keeps a real signature", () => {
    const real = { extra_content: { google: { thought_signature: "abc" } } };
    const out = JSON.parse(withThoughtSignatures(JSON.stringify({ messages: [{ role: "assistant", tool_calls: [call(real)] }] })));
    expect(out.messages[0].tool_calls[0].extra_content.google.thought_signature).toBe("abc");
  });
  it("passes non-JSON bodies through", () => expect(withThoughtSignatures("x")).toBe("x"));
});

describe("resolveLLM", () => {
  it("uses the Gemini OpenAI-compatible endpoint with its own key and a default model", () => {
    const c = resolveLLM({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "g-key" });
    expect(c).toMatchObject({ provider: "gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", apiKey: "g-key", model: "gemini-3.5-flash-lite" });
  });

  it("picks Gemini when only a Gemini key is set, so a fresh setup needs one variable", () => {
    expect(resolveLLM({ GEMINI_API_KEY: "g" }).provider).toBe("gemini");
  });

  it("keeps OpenAI as the default when no provider or Gemini key is set", () => {
    expect(resolveLLM({ OPENAI_API_KEY: "o", OPENAI_MODEL: "gpt-4.1-mini" })).toMatchObject({ provider: "openai", model: "gpt-4.1-mini" });
  });

  it("LLM_MODEL and LLM_BASE_URL override the preset", () => {
    const c = resolveLLM({ LLM_PROVIDER: "groq", GROQ_API_KEY: "q", LLM_MODEL: "qwen/qwen3-32b", LLM_BASE_URL: "http://proxy/v1" });
    expect(c).toMatchObject({ baseURL: "http://proxy/v1", model: "qwen/qwen3-32b" });
  });

  it("throws a clear error when a hosted provider has no key", () => {
    expect(() => resolveLLM({ LLM_PROVIDER: "groq" })).toThrow(/GROQ_API_KEY/);
  });

  it("lets Ollama run without a key", () => {
    expect(resolveLLM({ LLM_PROVIDER: "ollama" })).toMatchObject({ baseURL: "http://localhost:11434/v1", model: "qwen2.5:3b" });
  });

  it("refuses openrouter/free, which picks a random model per request", () => {
    expect(() => resolveLLM({ LLM_PROVIDER: "openrouter", OPENROUTER_API_KEY: "r", LLM_MODEL: "openrouter/free" })).toThrow(/random/);
  });

  it("rejects an unknown provider name", () => {
    expect(() => resolveLLM({ LLM_PROVIDER: "nope" })).toThrow(/LLM_PROVIDER/);
  });

  it("reads the fallback from LLM_FALLBACK_* with its own preset", () => {
    expect(resolveLLM({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q", LLM_FALLBACK_PROVIDER: "groq" }, "LLM_FALLBACK_")).toMatchObject({ provider: "groq", model: "openai/gpt-oss-20b" });
  });
});

const res = (text: string) => ({ output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text }] }], usage: {} }) as unknown as ModelResponse;
const err = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });const fake = (o: { fail?: number; failAfterFirst?: number; text: string }): Model => ({
  async getResponse() {
    if (o.fail) throw err(o.fail);
    return res(o.text);
  },
  async *getStreamedResponse() {
    if (o.fail) throw err(o.fail);
    yield { type: "output_text_delta", delta: o.text } as StreamEvent;
    if (o.failAfterFirst) throw err(o.failAfterFirst);
  },
});
const req = {} as ModelRequest;
const textOf = (r: ModelResponse) => JSON.stringify(r.output);
const collect = async (m: Model) => {
  const out: string[] = [];
  for await (const e of m.getStreamedResponse(req)) out.push((e as { delta: string }).delta);
  return out;
};

describe("fallbackModel", () => {
  it("answers from the fallback when the primary is rate limited", async () => {
    expect(textOf(await fallbackModel(fake({ fail: 429, text: "a" }), fake({ text: "b" })).getResponse(req))).toContain('"b"');
  });

  it("falls back on a server error too", async () => {
    expect(textOf(await fallbackModel(fake({ fail: 503, text: "a" }), fake({ text: "b" })).getResponse(req))).toContain('"b"');
  });

  it("does not hide a request error (400) behind the fallback", async () => {
    await expect(fallbackModel(fake({ fail: 400, text: "a" }), fake({ text: "b" })).getResponse(req)).rejects.toThrow("HTTP 400");
  });

  it("streams from the fallback when the primary fails before its first event", async () => {
    expect(await collect(fallbackModel(fake({ fail: 429, text: "a" }), fake({ text: "b" })))).toEqual(["b"]);
  });

  it("never switches model mid-stream: a failure after output is rethrown", async () => {
    await expect(collect(fallbackModel(fake({ failAfterFirst: 503, text: "a" }), fake({ text: "b" })))).rejects.toThrow("HTTP 503");
  });

  it("does not replay a cancelled request on the fallback", async () => {
    const aborted = fake({ text: "a" });
    aborted.getResponse = async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
    await expect(fallbackModel(aborted, fake({ text: "b" })).getResponse(req)).rejects.toThrow("aborted");
  });

  it("falls back on a connection error from the OpenAI client", async () => {
    const down = fake({ text: "a" });
    down.getResponse = async () => {
      throw Object.assign(new Error("Connection error."), { name: "APIConnectionError" });
    };
    expect(textOf(await fallbackModel(down, fake({ text: "b" })).getResponse(req))).toContain('"b"');
  });

  it("falls back on a real OpenAI client timeout (its name is just 'Error')", async () => {
    const slow = fake({ text: "a" });
    slow.getStreamedResponse = async function* () {
      throw new APIConnectionTimeoutError();
    };
    expect(await collect(fallbackModel(slow, fake({ text: "b" })))).toEqual(["b"]);
  });

  it("does not replay a real OpenAI user abort on the fallback", async () => {
    const aborted = fake({ text: "a" });
    aborted.getResponse = async () => {
      throw new APIUserAbortError();
    };
    await expect(fallbackModel(aborted, fake({ text: "b" })).getResponse(req)).rejects.toThrow();
  });

  it("after a primary failure, skips the primary for the cool-down instead of waiting out its timeout every step", async () => {
    let calls = 0;
    const p = fake({ fail: 503, text: "a" });
    const inner = p.getResponse;
    p.getResponse = (r) => (calls++, inner(r));
    const m = fallbackModel(p, fake({ text: "b" }));
    await m.getResponse(req);
    expect(textOf(await m.getResponse(req))).toContain('"b"');
    expect(await collect(m)).toEqual(["b"]);
    expect(calls).toBe(1);
  });

  it("tries the primary again once the cool-down is over, or when the fallback fails during it", async () => {
    let up = false;
    const p = fake({ text: "a" });
    p.getResponse = async () => {
      if (!up) throw err(503);
      return res("a");
    };
    const fb = fake({ fail: 429, text: "b" });
    const m = fallbackModel(p, fb, 60_000);
    await expect(m.getResponse(req)).rejects.toThrow("HTTP 429"); // both down
    up = true;
    expect(textOf(await m.getResponse(req))).toContain('"a"'); // fallback 429 in the cool-down, primary is back
    const expired = fallbackModel(fake({ fail: 503, text: "a" }), fake({ text: "b" }), 0);
    await expired.getResponse(req);
    await expect(expired.getResponse(req)).resolves.toBeTruthy();
  });

  it("is the primary itself when no fallback is configured", () => {
    const p = fake({ text: "a" });
    expect(fallbackModel(p, undefined)).toBe(p);
  });
});

describe("withToolProperties (Groq rejects an empty object schema with required: [])", () => {
  it("drops the empty required of a no-argument tool and leaves others alone", () => {
    const body = { tools: [{ type: "function", function: { name: "stop_navigation", parameters: { type: "object", properties: {}, additionalProperties: false, required: [] } } }, { type: "function", function: { name: "focus", parameters: { type: "object", properties: { target_id: { type: "string" } }, required: ["target_id"] } } }] };
    const out = JSON.parse(withToolProperties(JSON.stringify(body)));
    expect(out.tools[0].function.parameters).not.toHaveProperty("required");
    expect(out.tools[1].function.parameters.required).toEqual(["target_id"]);
  });
  it("passes bodies without tools through untouched", () => expect(withToolProperties('{"messages":[]}')).toBe('{"messages":[]}'));
});

describe("reviewLLM (the reviewer gets its own model so it does not share the chat model's free quota)", () => {
  it("defaults to gemini-3.5-flash on Gemini", () => expect(reviewLLM({ GEMINI_API_KEY: "g" }).model).toBe("gemini-3.5-flash"));
  it("LLM_REVIEW_MODEL overrides it", () => expect(reviewLLM({ GEMINI_API_KEY: "g", LLM_REVIEW_MODEL: "x" }).model).toBe("x"));
  it("keeps the chat model on other providers", () => expect(reviewLLM({ LLM_PROVIDER: "groq", GROQ_API_KEY: "k" }).model).toBe("openai/gpt-oss-20b"));
});

describe("clientOptions (a stalled free model must hand over to the fallback fast)", () => {
  it("gives the primary 8 s and no retry when a fallback exists", () => expect(clientOptions({}, true)).toEqual({ timeout: 8_000, maxRetries: 0 }));
  it("keeps 20 s and one retry when there is no fallback, or for the fallback itself", () => expect(clientOptions({}, false)).toEqual({ timeout: 20_000, maxRetries: 1 }));
  it("LLM_PRIMARY_TIMEOUT_MS and LLM_TIMEOUT_MS override", () => {
    expect(clientOptions({ LLM_PRIMARY_TIMEOUT_MS: "5000" }, true).timeout).toBe(5000);
    expect(clientOptions({ LLM_TIMEOUT_MS: "9000" }, false).timeout).toBe(9000);
  });
});

describe("fallbackCount (the [timing] log says when Groq answered)", () => {
  it("counts only turns the fallback answered", async () => {
    const n = fallbackCount();
    await fallbackModel(fake({ text: "a" }), fake({ text: "b" })).getResponse(req);
    expect(fallbackCount()).toBe(n);
    await fallbackModel(fake({ fail: 429, text: "a" }), fake({ text: "b" })).getResponse(req);
    expect(fallbackCount()).toBe(n + 1);
  });
});
