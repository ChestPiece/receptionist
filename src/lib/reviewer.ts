// Background reviewer: a small model re-reads each risky Sara turn and logs what looks wrong. Never touches the patient reply.
import { Agent, run, type RunItem } from "@openai/agents";
import { z } from "zod";
import type { Clinic } from "./clinics";
import { db, logUsage } from "./db";
import { logEvent, type EventInput } from "./events";
import { buildInstructions } from "./sara";

const LABELS = {
  unbacked_claim: "Unbacked claim",
  unkept_promise: "Promised booking not made",
  unanswered: "Unanswered question",
  unhandled_upset: "Upset patient not handed off",
  medical_advice: "Medical advice",
} as const;

export const ReviewOut = z.object({
  ok: z.boolean(),
  issues: z.array(z.object({ kind: z.enum(["unbacked_claim", "unkept_promise", "unanswered", "unhandled_upset", "medical_advice"]), note: z.string() })),
});
export type Review = z.infer<typeof ReviewOut>;
export type ToolCall = { name: string; output: string };

// Any digit (price, date, time; ASCII, Arabic-Indic, Persian) or a money, insurer, day or date word, EN + AR.
// ponytail: keyword gate keeps reviewer cost down; upgrade path is sampling every turn.
const RISKY = /[\d\u0660-\u0669\u06f0-\u06f9]|aed|dirham|insur|cover|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|درهم|سعر|تكلف|تأمين|التأمين|غدا|غداً|بكرة|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد|صباح|مساء/i;
export const shouldReview = (reply: string, toolCalls: ToolCall[]) => toolCalls.length > 0 || RISKY.test(reply);

export const reviewEvents = (clinicId: string, patientId: string | null, r: Review): EventInput[] =>
  r.issues.map((i) => ({ clinicId, patientId, actor: "reviewer", kind: "review", level: "warn", summary: `${LABELS[i.kind]}: ${i.note}`, data: { issue: i.kind } }));

// Pair each tool call in a run with its output.
export function toolTrace(items: RunItem[]): ToolCall[] {
  const out = new Map<string, string>();
  for (const i of items) if (i.type === "tool_call_output_item") out.set((i.rawItem as { callId: string }).callId, String(typeof i.output === "string" ? i.output : JSON.stringify(i.output)).slice(0, 600));
  return items.flatMap((i) => (i.type === "tool_call_item" && "name" in i.rawItem ? [{ name: i.rawItem.name, output: out.get((i.rawItem as { callId: string }).callId) ?? "" }] : []));
}

const reviewer = new Agent({
  name: "Reviewer",
  model: process.env.OPENAI_REVIEW_MODEL ?? "gpt-5-mini",
  outputType: ReviewOut,
  instructions: `You audit one reply written by a clinic receptionist bot. You get the bot's instructions (with the clinic info), the patient's message, the reply, and the tool calls with results. Report only real problems, with a short note each; no issues means ok true.
Check for:
- unbacked_claim: price, hours, insurance or policy stated that is not in the clinic info or a tool result
- unkept_promise: the reply says a visit is booked, moved or cancelled but no successful book, reschedule or cancel call shows it
- unanswered: the patient asked something and the reply skipped it
- unhandled_upset: the patient is angry or complaining and the bot did not call handoff_to_staff
- medical_advice: diagnosis, treatment or medication advice`,
});

export async function reviewTurn(a: { clinic: Clinic; userText: string; reply: string; toolCalls: ToolCall[] }) {
  const input = `Bot instructions:\n${buildInstructions(a.clinic, null, null, new Date())}\n\nPatient: ${a.userText}\n\nReply: ${a.reply}\n\nTool calls: ${JSON.stringify(a.toolCalls)}`;
  const r = await run(reviewer, input, { signal: AbortSignal.timeout(15_000) }); // never hold the webhook past maxDuration
  return { review: r.finalOutput ?? { ok: true, issues: [] }, usage: r.state.usage };
}

// Fire-and-forget from after(): gate, review, log. Swallows every failure.
export async function reviewAndLog(a: { clinic: Clinic; patientId: string; channel: "whatsapp" | "web"; userText: string; reply: string | null | undefined; items: RunItem[] }) {
  try {
    const toolCalls = toolTrace(a.items);
    if (!a.reply || !shouldReview(a.reply, toolCalls)) return;
    const { review, usage } = await reviewTurn({ clinic: a.clinic, userText: a.userText, reply: a.reply, toolCalls });
    await logUsage(a.clinic.id, a.channel, usage);
    for (const e of reviewEvents(a.clinic.id, a.patientId, review)) await logEvent(db(), e);
  } catch (e) {
    console.error("[reviewer]", (e as Error).message);
  }
}
