// Audio plumbing for Gemini Live: it takes 16 kHz PCM16 in and sends 24 kHz PCM16 out, both base64 in JSON frames.

/** Samples per mic chunk sent to Gemini: 640 at 16 kHz = 40 ms, small enough for quick turn ends, few frames. */
export const CHUNK = 640
export const OUT_RATE = 24_000

/** AudioWorklet source: averages device-rate frames down to 16 kHz and posts Int16Array chunks of CHUNK samples.
 * ponytail: a box filter, not a proper low-pass; fine for speech, swap in a windowed-sinc resampler if STT suffers. */
export const CAPTURE_WORKLET = `
class Pcm16 extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.pos = 0; this.acc = 0; this.cnt = 0; this.out = new Int16Array(${CHUNK}); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.cnt++; this.pos += 1
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio
        const s = Math.max(-1, Math.min(1, this.acc / this.cnt))
        this.acc = 0; this.cnt = 0
        this.out[this.n++] = s < 0 ? s * 32768 : Math.round(s * 32767)
        if (this.n === this.out.length) { this.port.postMessage(this.out.slice(0)); this.n = 0 }
      }
    }
    return true
  }
}
registerProcessor("pcm16", Pcm16)`

export function int16ToBase64(pcm: Int16Array) {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export function base64ToFloat32(b64: string) {
  const bin = atob(b64)
  const pcm = new Int16Array(bin.length >> 1)
  for (let i = 0; i < pcm.length; i++) pcm[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16 >> 16
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768
  return out
}

/**
 * Plays `node` so the browser's echo canceller hears it, and returns a cleanup.
 * Chromium skips echo cancellation for Web Audio output (crbug 933677): on laptop speakers the mic picked up Rook's
 * own voice, Google heard "speech" and cut Rook off. Audio that arrives over WebRTC and plays in a media element is
 * cancelled, so Rook's voice loops through a local peer connection into an <audio> element. Other browsers already
 * cancel Web Audio output, and any failure falls back to the speakers directly.
 * ponytail: the loopback adds a jitter buffer (~50-100 ms) and an Opus pass at 128 kbps; drop it if Chrome fixes the bug.
 */
export async function echoSafeOutput(ctx: AudioContext, node: AudioNode, timeoutMs = 3000): Promise<() => void> {
  const direct = () => {
    node.connect(ctx.destination)
    return () => node.disconnect(ctx.destination)
  }
  const chromium = typeof navigator !== "undefined" && /Chrome|Chromium|Edg\//.test(navigator.userAgent)
  if (!chromium || typeof RTCPeerConnection === "undefined") return direct()
  const dest = ctx.createMediaStreamDestination()
  const a = new RTCPeerConnection()
  const b = new RTCPeerConnection()
  const el = new Audio()
  const stop = () => {
    el.pause()
    el.srcObject = null
    a.close()
    b.close()
    try {
      node.disconnect(dest)
    } catch {
      // already disconnected
    }
  }
  try {
    node.connect(dest)
    a.onicecandidate = (e) => void (e.candidate && b.addIceCandidate(e.candidate).catch(() => {}))
    b.onicecandidate = (e) => void (e.candidate && a.addIceCandidate(e.candidate).catch(() => {}))
    const remote = new Promise<MediaStream>((res) => (b.ontrack = (e) => res(e.streams[0] ?? new MediaStream([e.track]))))
    for (const t of dest.stream.getAudioTracks()) a.addTrack(t, dest.stream)
    const offer = await a.createOffer()
    await a.setLocalDescription(offer)
    await b.setRemoteDescription(offer)
    const answer = await b.createAnswer()
    await b.setLocalDescription(answer)
    // Ask the sender for high-bitrate Opus so the voice keeps its detail through the loop.
    await a.setRemoteDescription({ type: "answer", sdp: answer.sdp?.replace(/(a=fmtp:\d+ .*useinbandfec=1)/, "$1;maxaveragebitrate=128000") })
    const stream = await Promise.race([remote, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("loopback timeout")), timeoutMs))])
    el.srcObject = stream
    await el.play()
    return stop
  } catch {
    stop()
    return direct()
  }
}

// Read tools run NON_BLOCKING (Sara talks while slots load); their result waits until she finishes her line.
// Shared by the server session config (voice.ts) and the browser, so the two never disagree.
export const READ_TOOLS = new Set(["find_slots", "my_appointments"])
export const scheduling = (name: string): "WHEN_IDLE" | undefined => (READ_TOOLS.has(name) ? "WHEN_IDLE" : undefined)

/** The caller finished talking 4 s ago, Sara has said nothing since and no tool is running: the call looks stuck. */
export const shouldNudge = (s: { callerDoneAt: number; lastModelAt: number; toolsInFlight: number; now: number }) =>
  s.now - s.callerDoneAt >= 4000 && s.lastModelAt <= s.callerDoneAt && s.toolsInFlight === 0
