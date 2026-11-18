// Voice call transcripts arrive in pieces (a pause, a tool call or an interruption ends a piece mid-sentence).
// These helpers turn the pieces back into whole turns. Client-safe: no server imports.
import { tidy } from "./tidy";

export const voiceText = tidy;

// Merged text when `next` continues the unfinished last turn of the same speaker, else null (start a new turn).
export function joinTurn(last: { role: string; text: string } | null, role: string, next: string) {
  if (!last || last.role !== role || /[.!?؟…]["')]*\s*$/.test(last.text)) return null;
  return `${last.text} ${next}`.replace(/\s+/g, " ").trim();
}
