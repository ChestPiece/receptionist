"use client";

// Voice call with Sara inside the web chat. The browser holds the WebRTC call to OpenAI; our server creates it
// (/api/voice), runs every tool (/api/voice/tool) and saves each finished turn (/api/voice/turn).
// Raw data-channel events, no realtime SDK in the bundle.
import { MicIcon, MicOffIcon, PhoneOffIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_MS = 8 * 60_000; // hard stop per call
const IDLE_MS = 45_000; // hang up after this long with no speech from the caller
const TOOL_FAILED = "That did not work. Say sorry, and offer handoff_to_staff so the front desk calls back.";

export type CallState = "idle" | "connecting" | "live" | "error";
type Live = { pc: RTCPeerConnection; dc: RTCDataChannel; mic: MediaStream; audio: HTMLAudioElement; max?: ReturnType<typeof setTimeout>; idle?: ReturnType<typeof setTimeout> };
type Ev = { type: string; [k: string]: unknown };

const ERRORS: Record<string, string> = {
  mic: "Allow the microphone to talk to Sara, or type below.",
  busy: "Too many calls for now. Please type below, or try again later.",
  paused: "The front desk has your chat. They reply here.",
  unavailable: "The call didn't connect. Please type below, or try again.",
};

export function useCall(o: { slug: string; visitorId: string; test?: boolean; persona: string; clinicName: string; onTurn: (role: "user" | "assistant", text: string) => void }) {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const live = useRef<Live | null>(null);
  const run = useRef(0); // bumped by every start and hang up, so a hang up during the mic prompt cancels that start
  const opts = useRef(o);
  useEffect(() => {
    opts.current = o;
  });

  const end = useCallback(() => {
    run.current++;
    setState((s) => (s === "connecting" ? "idle" : s));
    const l = live.current;
    live.current = null;
    if (!l) return;
    clearTimeout(l.max);
    clearTimeout(l.idle);
    l.mic.getTracks().forEach((t) => t.stop());
    l.dc.close();
    l.pc.close();
    l.audio.srcObject = null;
    setSpeaking(false);
    setMuted(false);
    setState("idle");
  }, []);

  const fail = useCallback(
    (code: string) => {
      end();
      setError(ERRORS[code] ?? ERRORS.unavailable);
      setState("error");
    },
    [end],
  );

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
      }
    };
    pc.onconnectionstatechange = () => ["failed", "closed"].includes(pc.connectionState) && end();

    try {
      await pc.setLocalDescription(await pc.createOffer());
      const r = await post("/api/voice", { test, sdp: pc.localDescription!.sdp });
      if (live.current !== l) return; // hung up while connecting
      if (!r.ok) return fail(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "unavailable");
      await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });
    } catch {
      if (live.current === l) fail("unavailable");
    }
  }, [end, fail, state]);

  const toggleMute = useCallback(() => {
    const track = live.current?.mic.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  // Leaving the page hangs up.
  useEffect(() => {
    window.addEventListener("pagehide", end);
    return () => {
      window.removeEventListener("pagehide", end);
      end();
    };
  }, [end]);

  return { state, error, speaking, muted, startedAt, start, end, toggleMute };
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

// Sits where the composer is while a call is on.
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
