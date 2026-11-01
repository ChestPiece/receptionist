import { cn } from "@/lib/utils";

// A chat transcript: patient on the left, Sara and staff on the right, system notes as a centred row.
export type ThreadMsg = { id: number; role: "patient" | "assistant" | "staff" | "system"; body: string; time?: string };
const WHO = { patient: "Patient", assistant: "Sara", staff: "Staff", system: "Note" } as const;

export function Thread({ lines }: { lines: ThreadMsg[] }) {
  if (!lines.length) return <p className="p-4 text-sm text-muted-foreground">No messages.</p>;
  return (
    <ol className="flex flex-col gap-2 p-4">
      {lines.map((m) =>
        m.role === "system" ? (
          <li key={m.id} className="self-center rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{m.body}</li>
        ) : (
          <li key={m.id} className={cn("flex max-w-[85%] flex-col gap-0.5", m.role === "patient" ? "self-start" : "items-end self-end")}>
            <span className="px-1 text-[11px] text-muted-foreground">{WHO[m.role]}{m.time && ` · ${m.time}`}</span>
            <span dir="auto" className={cn("whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", m.role === "patient" ? "rounded-ss-md bg-muted" : m.role === "staff" ? "rounded-se-md bg-web-soft" : "rounded-se-md bg-sage-soft")}>
              {m.body}
            </span>
          </li>
        ),
      )}
    </ol>
  );
}
