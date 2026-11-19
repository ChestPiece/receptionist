import { describe, expect, it } from "vitest"
import { CAPTURE_WORKLET, CHUNK, base64ToFloat32, int16ToBase64, scheduling, shouldNudge } from "./liveAudio"

describe("PCM16 base64", () => {
  it("round-trips samples through base64 the way Gemini sends and expects them (little-endian)", () => {
    const pcm = new Int16Array([0, 16384, -16384, 32767, -32768])
    const out = base64ToFloat32(int16ToBase64(pcm))
    expect(Array.from(out)).toEqual([0, 0.5, -0.5, 32767 / 32768, -1])
  })
  it("encodes bytes low byte first", () => expect(int16ToBase64(new Int16Array([1]))).toBe(btoa("\x01\x00")))
})

// Runs the worklet source in a fake AudioWorkletGlobalScope at a 48 kHz device rate.
function loadWorklet(rate: number) {
  const sent: Int16Array[] = []
  let Proc: new () => { port: { postMessage(x: Int16Array): void }; process(i: Float32Array[][]): boolean } = undefined!
  class AudioWorkletProcessor {
    port = { postMessage: (x: Int16Array) => sent.push(x) }
  }
  new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", CAPTURE_WORKLET)(AudioWorkletProcessor, (_: string, c: typeof Proc) => (Proc = c), rate)
  return { proc: new Proc(), sent }
}

describe("capture worklet", () => {
  it("turns 48 kHz float frames into 16 kHz PCM16 chunks of CHUNK samples", () => {
    const { proc, sent } = loadWorklet(48_000)
    const frame = new Float32Array(128).fill(0.5)
    for (let i = 0; i < (CHUNK * 3) / 128 + 1; i++) proc.process([[frame]]) // CHUNK*3 input samples = one 16 kHz chunk
    expect(sent).toHaveLength(1)
    expect(sent[0]).toHaveLength(CHUNK)
    expect(sent[0][0]).toBe(Math.round(0.5 * 32767))
  })
  it("clips samples outside -1..1 instead of wrapping", () => {
    const { proc, sent } = loadWorklet(16_000)
    for (let i = 0; i < CHUNK / 128 + 1; i++) proc.process([[new Float32Array(128).fill(-3)]])
    expect(sent[0][0]).toBe(-32768)
  })
  it("keeps running with no input (a muted or ended track)", () => expect(loadWorklet(48_000).proc.process([[]])).toBe(true))
})

describe("call helpers", () => {
  it("reads answer WHEN_IDLE, writes get no scheduling", () => {
    expect(scheduling("find_slots")).toBe("WHEN_IDLE")
    expect(scheduling("my_appointments")).toBe("WHEN_IDLE")
    expect(scheduling("book")).toBeUndefined()
  })
  it("nudges once the caller's last words are 4 s old, Sara said nothing since and no tool runs", () => {
    const s = { callerDoneAt: 1000, lastModelAt: 0, toolsInFlight: 0, nudgedFor: -1, resuming: false, now: 5000 }
    expect(shouldNudge(s)).toBe(true)
    expect(shouldNudge({ ...s, now: 4999 })).toBe(false)
    expect(shouldNudge({ ...s, toolsInFlight: 1 })).toBe(false)
    expect(shouldNudge({ ...s, lastModelAt: 2000 })).toBe(false) // Sara answered
    expect(shouldNudge({ ...s, nudgedFor: 1000 })).toBe(false) // once per caller turn
    expect(shouldNudge({ ...s, resuming: true })).toBe(false)
    expect(shouldNudge({ ...s, callerDoneAt: 0, now: 9000 })).toBe(false) // the caller has not spoken yet
  })
})
