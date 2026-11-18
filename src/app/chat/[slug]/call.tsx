"use client";

// Voice call with Sara inside the web chat, over Gemini Live. Our server checks the caps and mints a one-use token locked
// to Sara's session (/api/voice); the browser then talks to Google directly over a WebSocket: mic as 16 kHz PCM16 up,
// 24 kHz PCM16 down. Tools run on our server (/api/voice/tool), each finished turn is saved by /api/voice/turn, and the
// call's numbers go to /api/voice/end when it hangs up.
import type { FunctionCall, FunctionResponse, FunctionResponseScheduling, LiveServerMessage, Session } from "@google/genai";
import { MicIcon, MicOffIcon, PhoneOffIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CAPTURE_WORKLET, OUT_RATE, base64ToFloat32, echoSafeOutput, int16ToBase64, scheduling, shouldNudge } from "@/lib/liveAudio";
import { cn } from "@/lib/utils";

const MAX_MS = 8 * 60_000; // hard stop per call (the token expires just after, see voice.ts)
const IDLE_MS = 45_000; // hang up after this long with no speech from the caller
const CONNECT_MS = 15_000; // from start() to the session being ready
const HIDDEN_MS = 30_000; // tab in the background this long: hang up
const BYE_MS = 8_000; // after end_call, hang up even if the goodbye audio never reports finishing
const LIVE_API_VERSION = "v1alpha"; // ephemeral tokens are v1alpha only (same as voice.ts)
const TOOL_FAILED = "That did not work. Say sorry, and offer handoff_to_staff so the front desk calls back.";
const NUDGE = "(The caller is waiting for your answer.)";

export type CallState = "idle" | "connecting" | "live" | "error";
type Live = {
  session?: Session;
  mic: MediaStream;
  ctx: AudioContext;
  ownCtx: boolean; // we created ctx (not handed in by the click handler), so we close it
  capture?: AudioWorkletNode;
  stopOut?: () => void; // tears down the echo-safe speaker path
  playing: Set<AudioBufferSourceNode>;
  playAt: number; // ctx time the next chunk starts, for gapless playback
  ac: AbortController; // in-flight tool fetches
  max?: ReturnType<typeof setTimeout>;
  idle?: ReturnType<typeof setTimeout>;
  watch?: ReturnType<typeof setInterval>;
  typed?(text: string): void; // a message the visitor typed during the call
  wentLive: number; // performance.now() when the call went live, 0 before
  m: { connectMs: number; firstAudioMs: number[]; toolMs: number[]; resumes: number; nudges: number };
};

const ERRORS: Record<string, string> = {
  mic: "Allow the microphone to talk to Sara, or type below.",
  busy: "Too many calls for now. Please type below, or try again later.",
  paused: "The front desk has your chat. They reply here.",
  unavailable: "The call didn't connect. Please type below, or try again.",
  dropped: "The call dropped. You can keep typing here.",
};

export function useCall(o: { slug: string; visitorId: string; test?: boolean; persona: string; clinicName: string; onTurn: (role: "user" | "assistant", text: string) => void }) {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const live = useRef<Live | null>(null);
  const connTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const run = useRef(0); // bumped by every start and hang up, so a hang up during the mic prompt cancels that start
  const opts = useRef(o);
  useEffect(() => {
    opts.current = o;
  });

  const hangup = useCallback((reason: string) => {
    run.current++;
    clearTimeout(connTimer.current);
    const l = live.current;
    live.current = null;
    setState((s) => (s === "connecting" ? "idle" : s));
    if (!l) return;
    clearTimeout(l.max);
    clearTimeout(l.idle);
    clearInterval(l.watch);
    l.ac.abort();
    try {
      l.session?.close();
    } catch {
      // already closed
    }
    l.capture?.disconnect();
    l.playing.forEach((s) => s.stop());
    l.stopOut?.();
    l.mic.getTracks().forEach((t) => t.stop());
    if (l.ownCtx) void l.ctx.close().catch(() => {});
    setSpeaking(false);
    setMuted(false);
    setState("idle");
    // How the call went, for the latency targets. keepalive survives pagehide.
    if (l.wentLive) {
      const { slug, visitorId } = opts.current;
      const body = { slug, visitorId, ...l.m, callMs: Math.round(performance.now() - l.wentLive), endReason: reason };
      fetch("/api/voice/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
    }
  }, []);
  const end = useCallback(() => hangup("caller"), [hangup]);

  const fail = useCallback(
    (code: string) => {
      hangup(`error:${code}`);
      setError(ERRORS[code] ?? ERRORS.unavailable);
      setState("error");
    },
    [hangup],
  );

<<<<<<< HEAD
  /** `given` is an AudioContext the click handler created (iOS only lets audio start inside a tap). */
  const start = useCallback(
    async (given?: AudioContext) => {
      if (live.current) return;
      const me = ++run.current;
      const t0 = performance.now();
      setError(null);
      setState("connecting");
      connTimer.current = setTimeout(() => run.current === me && fail("unavailable"), CONNECT_MS);
      // Token, SDK and mic in parallel: the mint (prompt build + Google) does not wait for the mic prompt.
      type Minted = { ok: boolean; d: { token?: string; model?: string; error?: string } };
      const mint = (extra: object = {}): Promise<Minted> =>
        fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: opts.current.slug, visitorId: opts.current.visitorId, test: opts.current.test, ...extra }),
        })
          .then(async (r) => ({ ok: r.ok, d: (await r.json().catch(() => ({}))) as Minted["d"] }))
          .catch(() => ({ ok: false, d: {} }));
      const tokenReq = mint();
      const sdk = import("@google/genai"); // only callers download the SDK
      sdk.catch(() => {}); // reported where it is awaited
      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      } catch {
        if (run.current === me) fail("mic");
        return;
=======
  const start = useCallback(async () => {
    if (live.current || state === "connecting") return;
    const me = ++run.current;
    const { slug, visitorId, test, persona, clinicName } = opts.current;
    setError(null);
    setState("connecting");
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return run.current === me && fail("mic");
    }
    if (run.current !== me) return mic.getTracks().forEach((t) => t.stop()); // hung up while the mic prompt was open
    const pc = new RTCPeerConnection();
    const audio = new Audio();
    audio.autoplay = true;
    pc.ontrack = (e) => (audio.srcObject = e.streams[0]);
    pc.addTrack(mic.getTracks()[0], mic);
    const dc = pc.createDataChannel("oai-events");
    const l: Live = { pc, dc, mic, audio };
    live.current = l;

    const post = (path: string, body: object) =>
      fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, visitorId, ...body }) });
    const send = (e: object) => dc.readyState === "open" && dc.send(JSON.stringify(e));
    // One response at a time: semantic VAD starts its own, so a create sent while one runs waits for response.done.
    let active = false;
    let queued: object | null = null;
    const respond = (response: object = {}) => (active ? (queued = response) : send({ type: "response.create", response }));
    let saving = Promise.resolve(); // turns are saved in order
    const saveTurn = (role: "patient" | "assistant", text: string) =>
      (saving = saving.then(async () => {
        const r = await post("/api/voice/turn", { role, text }).catch(() => null);
        const d = r?.ok ? ((await r.json()) as { say: string | null }) : null;
        // Emergency: the server's fixed reply replaces whatever Sara was about to say.
        if (d?.say) {
          send({ type: "response.cancel" });
          send({ type: "output_audio_buffer.clear" }); // cancel alone lets already-sent audio play out
          respond({ instructions: `Say exactly this, nothing else: ${d.say}` });
        }
      }));
    let tools: Promise<void>[] = [];
    // Timing log for live tests (no transcript or tool args): caller stops talking to Sara's first audio, tool round trips, barge-ins.
    let stoppedAt = 0;
    let talking = false;
    const resetIdle = () => {
      clearTimeout(l.idle);
      l.idle = setTimeout(end, IDLE_MS);
    };

    dc.onopen = () => {
      setState("live");
      setStartedAt(Date.now());
      resetIdle();
      l.max = setTimeout(end, MAX_MS);
      respond({ instructions: `Greet the caller in one short sentence as ${persona} from ${clinicName}, and ask how you can help.` });
    };
    dc.onmessage = (m) => {
      const e = JSON.parse(String(m.data)) as Ev;
      switch (e.type) {
        case "response.created":
          active = true;
          break;
        case "input_audio_buffer.speech_started":
          if (talking) console.info("[call] interrupted");
          resetIdle();
          break;
        case "input_audio_buffer.speech_stopped":
          stoppedAt = performance.now();
          break;
        case "output_audio_buffer.started":
          if (stoppedAt) console.info(`[call] reply ${Math.round(performance.now() - stoppedAt)}ms`);
          stoppedAt = 0;
          talking = true;
          setSpeaking(true);
          break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          talking = false;
          setSpeaking(false);
          break;
        case "conversation.item.input_audio_transcription.completed":
        case "response.output_audio_transcript.done": {
          const text = String(e.transcript ?? "").trim();
          if (!text) break;
          const caller = e.type.startsWith("conversation");
          opts.current.onTurn(caller ? "user" : "assistant", text);
          void saveTurn(caller ? "patient" : "assistant", text);
          break;
        }
        case "response.output_item.done": {
          const item = e.item as { type: string; name: string; call_id: string; arguments: string } | undefined;
          if (item?.type !== "function_call") break;
          const t0 = performance.now();
          tools.push(
            post("/api/voice/tool", { name: item.name, args: item.arguments })
              .then((r) => (r.ok ? (r.json() as Promise<{ output: string }>) : { output: TOOL_FAILED }))
              .catch(() => ({ output: TOOL_FAILED }))
              .then(({ output }) => {
                console.info(`[call] tool ${item.name} ${Math.round(performance.now() - t0)}ms`);
                send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: item.call_id, output } });
              }),
          );
          break;
        }
        case "response.done": {
          active = false;
          const next = queued;
          queued = null;
          // Every tool result of this response is in: let Sara answer with them.
          if (tools.length) {
            const pending = tools;
            tools = [];
            void Promise.all(pending).then(() => respond(next ?? {}));
          } else if (next) respond(next);
          break;
        }
        case "error":
          console.warn("[call]", e.error);
          break;
>>>>>>> f9d7af60a6f351d80fadeacea13386f8370a0d44
      }
      if (run.current !== me) return mic.getTracks().forEach((t) => t.stop()); // hung up while the mic prompt was open
      let ctx: AudioContext;
      try {
        ctx = given ?? new AudioContext();
        void ctx.resume().catch(() => {});
      } catch {
        mic.getTracks().forEach((t) => t.stop());
        return fail("unavailable");
      }
      const out = ctx.createGain();
      const l: Live = { mic, ctx, ownCtx: !given, playing: new Set(), playAt: 0, ac: new AbortController(), wentLive: 0, m: { connectMs: 0, firstAudioMs: [], toolMs: [], resumes: 0, nudges: 0 } };
      live.current = l;
      // To the speakers through a path the browser's echo canceller hears, so Sara does not interrupt herself.
      void echoSafeOutput(ctx, out).then((stop) => (live.current === l ? (l.stopOut = stop) : stop()));

      const post = (path: string, body: object, signal?: AbortSignal) =>
        fetch(path, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: opts.current.slug, visitorId: opts.current.visitorId, ...body }) });
      const say = (text: string) => l.session?.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
      const resetIdle = () => {
        if (live.current !== l) return;
        clearTimeout(l.idle);
        l.idle = setTimeout(() => hangup("idle"), IDLE_MS);
      };

      // Silence watchdog state: the caller finished, Sara said nothing for 4 s and no tool runs: ask her once to answer.
      let callerDoneAt = 0; // last caller words
      let lastModelAt = 0; // last Sara audio, words or tool call
      let nudgedFor = -1;
      let inflight = 0;

      // Playback: chunks queue back to back on the AudioContext clock. "Speaking" ends when the queue drains.
      let bye = false; // Sara called end_call: hang up once the goodbye has played
      let heardAt = 0; // caller's last words: start of the wait for Sara's first audio
      const stopped = () => {
        setSpeaking(false);
        resetIdle();
        // A gap between network chunks also drains the queue: hang up only if the goodbye stays silent a moment.
        if (bye) setTimeout(() => live.current === l && !l.playing.size && hangup("goodbye"), 400);
      };
      const play = (b64: string) => {
        const pcm = base64ToFloat32(b64);
        if (!pcm.length) return;
        const ab = ctx.createBuffer(1, pcm.length, OUT_RATE);
        ab.copyToChannel(pcm, 0);
        const src = ctx.createBufferSource();
        src.buffer = ab;
        src.connect(out);
        lastModelAt = performance.now();
        if (!l.playing.size) {
          setSpeaking(true);
          resetIdle();
          if (heardAt) l.m.firstAudioMs.push(Math.round(lastModelAt - heardAt));
          heardAt = 0;
        }
        l.playAt = Math.max(l.playAt, ctx.currentTime);
        src.start(l.playAt);
        l.playAt += ab.duration;
        l.playing.add(src);
        src.onended = () => {
          l.playing.delete(src);
          if (!l.playing.size && live.current === l) stopped();
        };
      };
      const flush = () => {
        const was = l.playing.size;
        l.playing.forEach((s) => {
          s.onended = null;
          s.stop();
        });
        l.playing.clear();
        l.playAt = 0;
        if (was && live.current === l) stopped();
      };

      // Transcripts arrive in pieces; a turn is saved once it is over, in order.
      let userText = "";
      let botText = "";
      let saving = Promise.resolve();
      const saveTurn = (role: "patient" | "assistant", text: string) =>
        (saving = saving.then(async () => {
          const r = await post("/api/voice/turn", { role, text }).catch(() => null);
          const d = r?.ok ? ((await r.json().catch(() => null)) as { say: string | null } | null) : null;
          // Emergency: the server's fixed reply replaces whatever Sara was about to say.
          if (d?.say && live.current === l) {
            flush();
            say(`Say exactly this, nothing else: ${d.say}`);
          }
        }));
      const finish = (role: "user" | "assistant") => {
        const text = (role === "user" ? userText : botText).trim();
        if (role === "user") userText = "";
        else botText = "";
        if (!text) return;
        opts.current.onTurn(role, text);
        void saveTurn(role === "user" ? "patient" : "assistant", text);
      };
      // Typing during a call (a hard-to-hear name or number) goes into this call, so Sara answers it by voice.
      l.typed = (text) => {
        finish("user");
        say(text);
        callerDoneAt = performance.now();
        opts.current.onTurn("user", text);
        void saveTurn("patient", text);
      };

      const cancelled = new Set<string>(); // tool calls Google dropped (the caller talked over Sara)
      const runTool = async (call: FunctionCall): Promise<FunctionResponse> => {
        const name = call.name ?? "";
        const at = performance.now();
        const output = await post("/api/voice/tool", { name, args: JSON.stringify(call.args ?? {}) }, AbortSignal.any([l.ac.signal, AbortSignal.timeout(10_000)]))
          .then((r) => (r.ok ? (r.json() as Promise<{ output: string }>) : { output: TOOL_FAILED }))
          .then((r) => r.output)
          .catch(() => TOOL_FAILED);
        l.m.toolMs.push(Math.round(performance.now() - at));
        resetIdle();
        const s = scheduling(name);
        return { id: call.id, name, response: { output }, ...(s ? { scheduling: s as FunctionResponseScheduling } : {}) };
      };
      const reply = (rs: FunctionResponse[]) => {
        const keep = rs.filter((r) => !r.id || !cancelled.has(r.id));
        if (keep.length && live.current === l) l.session?.sendToolResponse({ functionResponses: keep });
      };
      const track = (p: Promise<void>) => {
        inflight++;
        void p.finally(() => inflight--);
      };

      // Resume: Google resets Live connections now and then (goAway, about every 10 min, network blips). With the
      // latest handle a new token reconnects to the same context: no second greeting, the mic and speakers keep going.
      let handle = "";
      let resuming = false;
      const resume = async () => {
        if (resuming || live.current !== l) return;
        if (!handle || l.m.resumes >= 3) return fail("dropped");
        resuming = true;
        l.m.resumes++;
        const old = l.session;
        l.session = undefined;
        try {
          old?.close();
        } catch {
          // already closed
        }
        const { ok, d } = await mint({ resume: handle });
        if (live.current !== l) return;
        if (!ok || !d.token || !d.model) return fail("dropped");
        try {
          l.session = await connect(d.token, d.model);
        } catch {
          return fail("dropped");
        }
        resuming = false;
      };

      const goLive = () => {
        clearTimeout(connTimer.current);
        l.wentLive = performance.now();
        l.m.connectMs = Math.round(l.wentLive - t0);
        setState("live");
        setStartedAt(Date.now());
        resetIdle();
        l.max = setTimeout(() => hangup("max"), MAX_MS);
        l.watch = setInterval(() => {
          if (nudgedFor === callerDoneAt || userText || resuming || !callerDoneAt) return;
          if (!shouldNudge({ callerDoneAt, lastModelAt, toolsInFlight: inflight, now: performance.now() })) return;
          nudgedFor = callerDoneAt;
          l.m.nudges++;
          say(NUDGE);
        }, 1000);
        const { persona, clinicName } = opts.current;
        say(`(The call just connected.) Greet the caller in one short sentence as ${persona} from ${clinicName}, and ask how you can help.`);
      };

      const onMessage = (m: LiveServerMessage) => {
        if (live.current !== l) return;
        const upd = m.sessionResumptionUpdate;
        if (upd?.resumable && upd.newHandle) handle = upd.newHandle;
        if (m.goAway) void resume(); // Google is about to close this connection
        const c = m.serverContent;
        if (c?.interrupted) {
          // Google's VAD heard the caller over Sara: the rest of this reply is dropped, so stop playing it now.
          finish("assistant");
          flush();
        }
        if (c?.inputTranscription?.text) {
          userText += c.inputTranscription.text;
          heardAt = callerDoneAt = performance.now();
          resetIdle(); // a long turn is not idle
        }
        if (c?.outputTranscription?.text) {
          finish("user"); // Sara answers: the caller's turn is over
          botText += c.outputTranscription.text;
          lastModelAt = performance.now();
        }
        for (const p of c?.modelTurn?.parts ?? []) if (p.inlineData?.data) play(p.inlineData.data);
        if (c?.turnComplete) {
          finish("user");
          finish("assistant");
        }
        for (const id of m.toolCallCancellation?.ids ?? []) cancelled.add(id);
        const calls = m.toolCall?.functionCalls ?? [];
        if (calls.length) lastModelAt = performance.now();
        if (calls.some((x) => x.name === "end_call")) {
          bye = true; // no response: Sara stays quiet, and the call ends after the goodbye audio
          if (!l.playing.size) hangup("goodbye");
          else setTimeout(() => live.current === l && hangup("goodbye"), BYE_MS);
          return;
        }
        if (!calls.length) return;
        finish("user");
        // Reads answer on their own (NON_BLOCKING, WHEN_IDLE), so Sara keeps talking meanwhile.
        for (const x of calls.filter((x) => scheduling(x.name ?? ""))) track(runTool(x).then((r) => reply([r])));
        // Writes go back in one message, so Sara answers once with all of them.
        const writes = calls.filter((x) => !scheduling(x.name ?? ""));
        if (writes.length) track(Promise.all(writes.map(runTool)).then(reply));
      };

      const connect = async (token: string, model: string) => {
        const { GoogleGenAI, Modality } = await sdk;
        const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: LIVE_API_VERSION } });
        // The token is locked to the server's config (and the resume handle); this config only satisfies the SDK.
        const s: Session = await ai.live.connect({
          model,
          config: { responseModalities: [Modality.AUDIO] },
          callbacks: {
            onmessage: onMessage,
            onerror: (e) => console.warn("[call]", e.message),
            // An unexpected close of the current connection while live: resume before giving up.
            onclose: () => {
              if (live.current === l && l.session === s) void resume();
            },
          },
        });
        return s;
      };

      try {
        const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "text/javascript" }));
        const worklet = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
        const { ok, d } = await tokenReq;
        if (live.current !== l) return; // hung up while connecting
        if (!ok || !d.token || !d.model) return fail(d.error ?? "unavailable");
        await worklet;
        const s = await connect(d.token, d.model);
        if (live.current !== l) return void s.close();
        l.session = s;
        goLive();
        const capture = new AudioWorkletNode(ctx, "pcm16");
        l.capture = capture;
        capture.port.onmessage = (e: MessageEvent<Int16Array>) => l.session?.sendRealtimeInput({ audio: { data: int16ToBase64(e.data), mimeType: "audio/pcm;rate=16000" } });
        ctx.createMediaStreamSource(mic).connect(capture).connect(ctx.destination); // outputs silence; keeps the node rendering
      } catch (e) {
        console.warn("[call]", (e as Error).message);
        if (live.current === l) fail("unavailable");
      }
    },
    [hangup, fail],
  );

  const toggleMute = useCallback(() => {
    const track = live.current?.mic.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);
  const say = useCallback((text: string) => live.current?.typed?.(text), []);

  // The SDK loads in the background once the chat is open, so pressing Call does not wait for the download.
  useEffect(() => {
    const t = setTimeout(() => void import("@google/genai").catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, []);

  // Leaving the page hangs up, and so does a tab left in the background for a while.
  useEffect(() => {
    let hidden: ReturnType<typeof setTimeout> | undefined;
    const onVis = () => {
      clearTimeout(hidden);
      if (document.visibilityState === "hidden") hidden = setTimeout(() => hangup("hidden"), HIDDEN_MS);
    };
    window.addEventListener("pagehide", end);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(hidden);
      window.removeEventListener("pagehide", end);
      document.removeEventListener("visibilitychange", onVis);
      end();
    };
  }, [end, hangup]);

  return { state, error, speaking, muted, startedAt, start, end, toggleMute, say };
}

function useClock(from: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = from ? Math.max(0, Math.floor((now - from) / 1000)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Sits above the composer while a call is on; the composer stays, so the caller can type a name or number.
export function CallBar({ call, persona }: { call: ReturnType<typeof useCall>; persona: string }) {
  const clock = useClock(call.startedAt);
  const status = call.state === "connecting" ? "Connecting…" : call.speaking ? `${persona} is speaking` : call.muted ? "You're muted" : "Listening";
  return (
    <div role="group" aria-label={`Call with ${persona}`} className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10" aria-hidden>
        <span className={cn("absolute inset-0 rounded-full bg-primary/20 transition-transform duration-200 ease-out", call.speaking ? "scale-110 animate-pulse" : "scale-90")} />
        <span className="relative size-2.5 rounded-full bg-primary" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-sm font-medium">
          Call with {persona} <span className="font-mono text-xs text-muted-foreground tabular-nums">{call.state === "live" ? clock : ""}</span>
        </div>
        <div className="text-xs text-muted-foreground" aria-live="polite">
          {status}
        </div>
      </div>
      <Button size="icon" variant="outline" className="rounded-full" aria-pressed={call.muted} aria-label={call.muted ? "Unmute" : "Mute"} onClick={call.toggleMute} disabled={call.state !== "live"}>
        {call.muted ? <MicOffIcon className="size-4" /> : <MicIcon className="size-4" />}
      </Button>
      <Button size="icon" className="rounded-full bg-alert text-white hover:bg-alert/90" aria-label="Hang up" onClick={call.end}>
        <PhoneOffIcon className="size-4" />
      </Button>
    </div>
  );
}
