// The Gemini Live session for a web voice call: prompt, tools and audio settings, locked into a one-use token.
// The browser connects to Google with the token, so the API key, prompt and tool definitions never reach it and audio
// skips a proxy hop. Tools still run on our server (/api/voice/tool), with clinic and patient from the visitor id.
import type { AgentInputItem } from "@openai/agents";
import { Behavior, EndSensitivity, GoogleGenAI, Modality, StartSensitivity, type FunctionDeclaration, type LiveConnectConfig } from "@google/genai";
import { spokenHistory, trimHistory } from "./agent";
import type { Clinic } from "./clinics";
import { READ_TOOLS } from "./liveAudio";
import { buildInstructions, runTool, toolSchemas } from "./sara";

/** Ephemeral tokens work on v1alpha only; the browser connects on the same version. */
export const LIVE_API_VERSION = "v1alpha";
export const MAX_MS = 8 * 60_000;

// Reads are NON_BLOCKING: Sara says "Let me check Saturday" while slots load, and the browser answers WHEN_IDLE.
// Writes stay BLOCKING, so she never says "booked" before the database does.
export { READ_TOOLS };

const END_CALL: FunctionDeclaration = {
  name: "end_call",
  description: "Hang up. Only after the caller said goodbye or has nothing else, and you already said a warm goodbye.",
  parametersJsonSchema: { type: "object", properties: {} },
};

export const liveTools = (): FunctionDeclaration[] => [
  ...toolSchemas().map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters, behavior: READ_TOOLS.has(t.name) ? Behavior.NON_BLOCKING : Behavior.BLOCKING })),
  { ...END_CALL, behavior: Behavior.BLOCKING },
];

type Patient = { id: string; name: string | null; phone: string | null };

// The first free days per service, so "when is the earliest?" gets an answer with no tool round trip. Never fails the call.
export async function quickOptions(clinic: Clinic, patient: Patient) {
  try {
    const out = JSON.parse(await runTool(clinic, patient, "find_slots", JSON.stringify({ service: null, dates: [], earliest: null, dentist: null }))) as {
      services: { service: string; days: { label: string; say: string[] }[] }[];
    };
    return out.services.map((s) => `${s.service}: ${s.days.map((d) => `${d.label} ${d.say.join(", ")}`).join("; ") || "nothing free soon"}`).join("\n");
  } catch (e) {
    console.warn("[voice] quick options skipped:", (e as Error).message);
    return "";
  }
}

export function voiceSession(clinic: Clinic, patient: Patient, history: AgentInputItem[], o: { quick?: string; handle?: string } = {}): { model: string; config: LiveConnectConfig } {
  const earlier = spokenHistory(trimHistory(history));
  const instructions =
    buildInstructions(clinic, patient.name, "voice", new Date(), patient.phone) +
    (o.quick ? `\n\nEarliest free times right now (use these to answer "when is the earliest" at once; book re-checks):\n${o.quick}` : "") +
    (earlier ? `\n\nEarlier in this chat (typed or on an earlier call):\n${earlier}` : "");
  return {
    model: process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: instructions,
      tools: [{ functionDeclarations: liveTools() }],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_LIVE_VOICE || "Sulafat" } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Google resets Live connections about every 10 min and on blips; the handle lets the browser resume the same context.
      sessionResumption: o.handle ? { handle: o.handle } : {},
      contextWindowCompression: { slidingWindow: {} },
      // High start sensitivity + 20 ms prefix: a short "yes" or one digit is heard (low + 200 ms dropped them, so Sara stayed
      // silent or said she missed it). Self-interrupts are handled by echoSafeOutput, background talk by proactive audio
      // (always on in gemini-3.8-live, so no proactivity field). 700 ms silence lets a caller pause inside a phone number.
      // ponytail: server VAD only; add client VAD with manual activityStart/End if backchannels still interrupt.
      realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH, endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH, silenceDurationMs: 700, prefixPaddingMs: 20 } },
    },
  };
}

/** A one-use token for this call. Google closes the session at expireTime, which enforces the call cap.
 * `end` = when the call must end; a resumed call passes the original call's end, so resuming never extends it. */
export async function mintToken(session: { model: string; config: LiveConnectConfig }, now = Date.now(), end = now + MAX_MS) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: LIVE_API_VERSION } });
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      expireTime: new Date(end + 30_000).toISOString(), // a little slack past the client's own cap
      liveConnectConstraints: session,
      abortSignal: AbortSignal.timeout(10_000),
    },
  });
  if (!token.name) throw new Error("no token name");
  return token.name;
}
