// Task 0 spike (untracked): does the planned Gemini Live config work on a v1alpha one-use token?
// Run: bun --env-file=.env.local scripts/live-spike.ts
import { Behavior, GoogleGenAI, Modality, StartSensitivity, EndSensitivity, type LiveConnectConfig, type LiveServerMessage } from "@google/genai";
import { toolSchemas } from "../src/lib/sara";

const model = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";
const reads = new Set(["find_slots", "my_appointments"]);
const variant = process.argv[2] ?? "full";

const config: LiveConnectConfig = {
  responseModalities: [Modality.AUDIO],
  systemInstruction: "You are Sara, a dental clinic receptionist. Today is Wednesday 2026-11-18. Use tools for times. Keep replies short.",
  tools: [{ functionDeclarations: toolSchemas().map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters, behavior: reads.has(t.name) ? Behavior.NON_BLOCKING : Behavior.BLOCKING })) }],
  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Sulafat" } } },
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  sessionResumption: {},
  contextWindowCompression: { slidingWindow: {} },
  realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW, endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH, silenceDurationMs: 500, prefixPaddingMs: 200 } },
  ...(variant === "full" || variant === "aff" ? { enableAffectiveDialog: true } : {}),
  ...(variant === "full" || variant === "pro" ? { proactivity: { proactiveAudio: true } } : {}),
};

const server = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
const now = Date.now();
const token = await server.authTokens.create({ config: { uses: 1, newSessionExpireTime: new Date(now + 60_000).toISOString(), expireTime: new Date(now + 5 * 60_000).toISOString(), liveConnectConstraints: { model, config } } });
console.log("token ok:", !!token.name);

const ai = new GoogleGenAI({ apiKey: token.name!, httpOptions: { apiVersion: "v1alpha" } });
const t0 = Date.now();
let said = "";
let handle = false;
let step = 0;
let toolAt = 0;
let spokeBeforeResult = "";
type S = Awaited<ReturnType<typeof ai.live.connect>>;
let resolveSession!: (s: S) => void;
const session = new Promise<S>((r) => (resolveSession = r));
const done = new Promise<void>((res, rej) => {
  setTimeout(() => rej(new Error("timeout")), 60_000);
  ai.live
    .connect({
      model,
      config,
      callbacks: {
        onmessage: (m: LiveServerMessage) => {
          if (m.setupComplete) {
            console.log(`setup ${Date.now() - t0} ms`);
            session.then((s) => s.sendClientContent({ turns: [{ role: "user", parts: [{ text: "What's free tomorrow for a check-up?" }] }], turnComplete: true }));
          }
          if (m.sessionResumptionUpdate?.newHandle) handle = true;
          const out = m.serverContent?.outputTranscription?.text;
          if (out) {
            said += out;
            if (toolAt && !step) spokeBeforeResult += out;
          }
          if (m.toolCall) {
            for (const f of m.toolCall.functionCalls ?? []) console.log("tool call:", f.name, JSON.stringify(f.args));
            toolAt = Date.now();
            setTimeout(() => {
              step = 1;
              session.then((s) =>
                s.sendToolResponse({
                  functionResponses: (m.toolCall!.functionCalls ?? []).map((f) => ({
                    id: f.id,
                    name: f.name,
                    response: f.name === "find_slots" ? { output: { days: [{ date: "2026-11-19", label: "Thursday 19 November", times: ["10:00", "16:30"], say: ["10 am", "4:30 pm"] }] } } : { output: "Not booked. READ_BACK first." },
                    ...(reads.has(f.name!) ? { scheduling: "WHEN_IDLE" as never } : {}),
                  })),
                }),
              );
            }, 1500);
          }
          if (m.serverContent?.turnComplete) {
            console.log("turn:", said.trim());
            said = "";
            if (step === 1) {
              step = 2;
              session.then((s) => s.sendClientContent({ turns: [{ role: "user", parts: [{ text: "Book the first one. I'm Test Patient, 050 123 4567." }] }], turnComplete: true }));
            } else if (step === 2) res();
          }
        },
        onerror: (e) => rej(e),
        onclose: (e) => console.log("closed:", e.code, e.reason),
      },
    })
    .then(resolveSession, rej);
});
try {
  await done;
} finally {
  console.log({ variant, resumptionHandle: handle, spokeBeforeToolResult: spokeBeforeResult.trim() });
  process.exit(0);
}
