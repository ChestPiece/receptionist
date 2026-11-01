"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setPaused, staffReply } from "../actions";

// Staff reply on WhatsApp or into the website chat. Sending also keeps Sara paused, so she does not answer over staff.
export function ReplyBox({ patientId, paused, channel, handoff }: { patientId: string; paused: boolean; channel: string; handoff: string | null }) {
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [switching, toggle] = useTransition();
  // Typing anywhere goes to the reply box, like ChatGPT.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || t?.closest("input, textarea, select, [contenteditable]")) return;
      input.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const [error, send, pending] = useActionState(async (_: string | null, data: FormData) => {
    const error = await staffReply(patientId, data);
    if (!error) form.current?.reset();
    return error;
  }, null);

  return (
    <form ref={form} action={send} className="grid gap-2">
      <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-xs">
        <p className="min-w-0 flex-1 text-muted-foreground">
          {paused ? <span className="font-medium text-foreground">You have this chat</span> : handoff ? <><span className="font-medium text-alert">Sara asked the front desk for help:</span> {handoff}</> : <span className="font-medium text-foreground">Sara is answering this chat</span>}
        </p>
        <Button type="button" size="sm" variant={paused ? "outline" : "default"} disabled={switching}
          onClick={() => toggle(async () => { await setPaused(patientId, !paused); if (!paused) input.current?.focus(); })}>
          {paused ? "Hand back to Sara" : "Take over"}
        </Button>
      </div>
      <label htmlFor="reply" className="sr-only">Reply on {channel}</label>
      <div className="flex items-end gap-2">
        <textarea
          id="reply"
          ref={input}
          name="text"
          rows={2}
          required
          maxLength={1500}
          dir="auto"
          placeholder={paused ? `Reply on ${channel}` : "Replying takes the chat over from Sara"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              form.current?.requestSubmit();
            }
          }}
          className="min-h-11 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button disabled={pending} className="h-11 rounded-lg bg-primary px-5 text-[13px] font-medium text-primary-foreground disabled:opacity-60">
          {pending ? "Sending" : "Send"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-alert">{error}</p>}
    </form>
  );
}
