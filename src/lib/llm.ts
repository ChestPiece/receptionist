// Which LLM Sara (and the reviewer) talk to. Every provider here speaks the OpenAI chat-completions API, so switching is
// env only: LLM_PROVIDER, LLM_MODEL (optional), LLM_BASE_URL (optional) and that provider's key.
// LLM_FALLBACK_PROVIDER / LLM_FALLBACK_MODEL name a second model used when the first is rate limited or down.
import { OpenAIChatCompletionsModel, setTracingDisabled, type Model, type ModelSettings } from "@openai/agents";
import OpenAI, { APIConnectionError } from "openai";

type Preset = { baseURL?: string; key?: string; model?: string; settings?: ModelSettings };
const PRESETS: Record<string, Preset> = {
  // Free tier: free of charge, but Google may use the data to improve its products (demo data only until a paid key).
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", key: "GEMINI_API_KEY", model: "gemini-3.5-flash-lite", settings: { reasoning: { effort: "low" } } },
  // Free tier is about 8K tokens a minute: one or two Rook turns. Good as a fallback, not as the primary.
  groq: { baseURL: "https://api.groq.com/openai/v1", key: "GROQ_API_KEY", model: "openai/gpt-oss-20b", settings: { reasoning: { effort: "low" } } },
  // Use a model id ending in ":free"; a fallback to a paid model costs money.
  openrouter: { baseURL: "https://openrouter.ai/api/v1", key: "OPENROUTER_API_KEY" },
  ollama: { baseURL: "http://localhost:11434/v1", model: "qwen2.5:3b" },
  openai: { key: "OPENAI_API_KEY", model: "gpt-4.1-mini" },
};

export type LLMConfig = { provider: string; baseURL?: string; apiKey: string; model: string; settings?: ModelSettings };
type Env = Record<string, string | undefined>;

/** Read one model's settings from env. `prefix` is "LLM_" for the primary, "LLM_FALLBACK_" for the fallback. */
export function resolveLLM(env: Env = process.env, prefix = "LLM_"): LLMConfig {
  const primary = prefix === "LLM_";
  const provider = env[`${prefix}PROVIDER`] || (primary ? (env.GEMINI_API_KEY ? "gemini" : "openai") : "");
  const p = PRESETS[provider];
  if (!p) throw new Error(`${prefix}PROVIDER must be one of ${Object.keys(PRESETS).join(", ")} (got "${provider}")`);
  const model = env[`${prefix}MODEL`] || (primary && provider === "openai" ? env.OPENAI_MODEL : undefined) || p.model;
  if (!model) throw new Error(`${prefix}MODEL is required for ${provider}`);
  if (model === "openrouter/free") throw new Error("openrouter/free picks a random model per request; set a fixed model id ending in :free");
  const apiKey = p.key ? env[p.key] : "ollama"; // Ollama ignores the key, the SDK needs a non-empty one
  if (!apiKey) throw new Error(`${p.key} is required for ${prefix}PROVIDER=${provider}`);
  return { provider, baseURL: env[`${prefix}BASE_URL`] || p.baseURL, apiKey, model, settings: p.settings };
}

// 429 = rate limited (free tiers), 5xx = provider down, connection errors and timeouts. A cancelled run (AbortError)
// or a bug (TypeError) is not retried: it would only burn the fallback's small free quota.
// The OpenAI client's error classes all report name "Error", so a timeout is recognised by class, not by name.
const retryable = (e: unknown) => {
  const { status: s, name } = e as { status?: number; name?: string };
  if (s === undefined) return e instanceof APIConnectionError || name === "APIConnectionError" || name === "APIConnectionTimeoutError";
  return s === 408 || s === 429 || s >= 500;
};

/** Gemini 3 rejects a replayed tool call without a thought signature, and the Agents SDK drops the one Gemini sent.
 * Google documents this value for exactly that case (history from another model or a client that cannot keep it).
 * ponytail: round-trip the real signature instead if the Agents SDK ever keeps `extra_content`. */
export function withThoughtSignatures(body: string) {
  let b: { messages?: { tool_calls?: { extra_content?: { google?: { thought_signature?: string } } }[] }[] };
  try {
    b = JSON.parse(body);
  } catch {
    return body;
  }
  for (const m of b.messages ?? [])
    for (const c of m.tool_calls ?? []) if (!c.extra_content?.google?.thought_signature) c.extra_content = { ...c.extra_content, google: { ...c.extra_content?.google, thought_signature: "skip_thought_signature_validator" } };
  return JSON.stringify(b);
}
const geminiFetch: typeof fetch = (url, init) => fetch(url, typeof init?.body === "string" ? { ...init, body: withThoughtSignatures(init.body) } : init);

/** A no-argument tool (none today, kept for the Groq fallback) is sent as `{ properties: {}, required: [] }`. OpenAI and Gemini
 * accept that; Groq counts the empty `properties` as missing and answers 400 "'required' present but 'properties' is
 * missing", which broke every fallback turn. Drops the empty `required`. */
type Params = { properties?: Record<string, unknown>; required?: unknown[] }
const bare = (p?: Params) => !!p && (!p.properties || !Object.keys(p.properties).length) && Array.isArray(p.required) && !p.required.length
export function withToolProperties(body: string) {
  let b: { tools?: { function?: { parameters?: Params } }[] };
  try {
    b = JSON.parse(body);
  } catch {
    return body;
  }
  if (!b.tools?.some((t) => bare(t.function?.parameters))) return body;
  for (const t of b.tools) if (bare(t.function?.parameters)) delete t.function!.parameters!.required;
  return JSON.stringify(b);
}
const groqFetch: typeof fetch = (url, init) => fetch(url, typeof init?.body === "string" ? { ...init, body: withToolProperties(init.body) } : init);

// ponytail: one counter per instance; two turns at once on one instance can both read "fallback". Fine for a log line.
let fallbacks = 0;
/** How many turns the fallback answered on this instance; the [timing] logs compare it before and after a run. */
export const fallbackCount = () => fallbacks;

/** The primary model, or the fallback when the primary fails before it produced anything. Never mid-stream. */
export function fallbackModel(primary: Model, fallback: Model | undefined): Model {
  if (!fallback) return primary;
  return {
    async getResponse(req) {
      try {
        return await primary.getResponse(req);
      } catch (e) {
        if (!retryable(e)) throw e;
        console.warn("[llm] primary failed, using fallback:", (e as Error).message);
        fallbacks++;
        return fallback.getResponse(req);
      }
    },
    async *getStreamedResponse(req) {
      let started = false;
      try {
        for await (const ev of primary.getStreamedResponse(req)) {
          started = true;
          yield ev;
        }
      } catch (e) {
        if (started || !retryable(e)) throw e;
        console.warn("[llm] primary failed, using fallback:", (e as Error).message);
        fallbacks++;
        yield* fallback.getStreamedResponse(req);
      }
    },
  };
}

/** A primary with a fallback gets a short leash and no retry: free Gemini can stall 10-20 s under load (seen 2026-11-18),
 * and Groq answers in 1-2 s, so waiting out a timeout plus a retry left the patient staring at nothing for ~40 s. */
export function clientOptions(env: Env, primaryWithFallback: boolean) {
  if (primaryWithFallback) return { timeout: Number(env.LLM_PRIMARY_TIMEOUT_MS) || 8_000, maxRetries: 0 };
  return { timeout: Number(env.LLM_TIMEOUT_MS) || 20_000, maxRetries: Number(env.LLM_MAX_RETRIES ?? 1) };
}

const build = (c: LLMConfig, primaryWithFallback = false): Model =>
  new OpenAIChatCompletionsModel(
    new OpenAI({
      baseURL: c.baseURL,
      apiKey: c.apiKey,
      ...clientOptions(process.env, primaryWithFallback),
      ...(c.provider === "gemini" ? { fetch: geminiFetch } : c.provider === "groq" ? { fetch: groqFetch } : {}),
    }),
    c.model,
  );

/** The model and settings for the Agent, built once from env. */
export function chatModel(env: Env = process.env) {
  const main = resolveLLM(env);
  const fb = env.LLM_FALLBACK_PROVIDER ? resolveLLM(env, "LLM_FALLBACK_") : undefined;
  // Tracing exports to OpenAI with OPENAI_API_KEY; off unless OpenAI is the provider.
  if (main.provider !== "openai") setTracingDisabled(true);
  return { model: fallbackModel(build(main, !!fb), fb && build(fb)), settings: main.settings, name: main.model };
}

/** The reviewer's model: same provider, but its own model (own free-tier quota) on Gemini. LLM_REVIEW_MODEL overrides. */
export function reviewLLM(env: Env = process.env): LLMConfig {
  const main = resolveLLM(env);
  return { ...main, model: env.LLM_REVIEW_MODEL || (main.provider === "gemini" ? "gemini-3.5-flash" : main.model) };
}

/** The reviewer Agent's model, with the same fallback as chat. */
export function reviewModel(env: Env = process.env): Model {
  const fb = env.LLM_FALLBACK_PROVIDER ? resolveLLM(env, "LLM_FALLBACK_") : undefined;
  return fallbackModel(build(reviewLLM(env), !!fb), fb && build(fb));
}
