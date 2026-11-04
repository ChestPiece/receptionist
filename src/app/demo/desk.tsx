"use client";

// The demo's "front desk view": what the clinic's staff would see while the visitor chats. Polls /api/demo/desk.
// ponytail: polling every 3 s while visible; anonymous visitors cannot pass RLS for realtime.
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheckIcon, HeadsetIcon, UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WeekCalendar, type Block } from "@/components/ledger";
import { cn } from "@/lib/utils";

type DeskData = {
  days: { date: string; today: boolean }[];
  blocks: { id: string; day: number; start: number; end: number; title: string; name: string; mine: boolean; muted: boolean }[];
  lead: { name: string | null; phone: string | null } | null;
  booked: number;
  paused: boolean;
  events: { id: number; kind: string; level: string; summary: string; at: string }[];
};

const readVisitor = () => {
  try {
    return localStorage.getItem("visitor-id");
  } catch {
    return null;
  }
};
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export function Desk({ persona, onNews }: { persona: string; onNews?: (paused: boolean) => void }) {
  const [data, setData] = useState<DeskData | null>(null);
  const seen = useRef("");
  const load = useCallback(async () => {
    const id = readVisitor();
    const r = await fetch(`/api/demo/desk${id ? `?visitorId=${id}` : ""}`).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as DeskData;
    setData(d);
    const key = `${d.booked}|${d.paused}|${d.lead?.phone ?? ""}|${d.events[0]?.id ?? ""}`;
    if (seen.current && key !== seen.current) onNews?.(d.paused);
    seen.current = key;
  }, [onNews]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0); // first load as a callback, like the polls
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 3000);
    return () => (clearTimeout(first), clearInterval(t));
  }, [load]);

  const blocks: Block[] = (data?.blocks ?? []).map((b) => ({ id: b.id, day: b.day, start: b.start, end: b.end, title: b.title, name: b.name, kind: b.mine ? "web" : "wa", muted: b.muted }));
  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold">Front desk view</h2>
        <p className="text-sm text-muted-foreground">What the clinic sees while you chat with {persona}. It updates on its own.</p>
      </div>

      {data?.paused && <Handoff persona={persona} onDone={load} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card icon={<UserRoundIcon className="size-4" />} title="Your lead">
          {data?.lead ? (
            <p className="text-sm">
              <span className="font-medium">{data.lead.name ?? "Name not given yet"}</span>
              {data.lead.phone && <span className="block font-mono text-xs text-muted-foreground">+{data.lead.phone.replace(/^\+/, "")}</span>}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Tell {persona} your name and number. It is saved here the moment you type it.</p>
          )}
        </Card>
        <Card icon={<CalendarCheckIcon className="size-4" />} title="Booked by you">
          <p className="text-sm">
            <strong className="text-2xl font-semibold tabular-nums">{data?.booked ?? 0}</strong>
            <span className="block text-xs text-muted-foreground">{data?.booked ? "Shown in blue on the calendar." : `Ask ${persona} for a time. It lands in the calendar below.`}</span>
          </p>
        </Card>
      </div>

      <WeekCalendar
        title="Calendar · next 5 days"
        days={(data?.days ?? []).map((d) => ({ label: weekday(d.date), date: Number(d.date.slice(8)), today: d.today }))}
        blocks={blocks}
        from={9}
        to={21}
      />

      <Card title="Activity">
        {data?.events.length ? (
          <ol className="grid gap-2">
            {data.events.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className={cn(e.level === "warn" && "text-alert")}>{e.summary}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{ago(e.at)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Each thing {persona} does for you shows up here: contacts saved, visits booked, handoffs.</p>
        )}
      </Card>
    </div>
  );
}

function Card({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 rounded-xl border bg-card px-4 py-3">
      <h3 className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

// After a handoff the visitor can answer as the clinic's staff, then hand the chat back to Sara.
function Handoff({ persona, onDone }: { persona: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = async (action: "reply" | "handback") => {
    const visitorId = readVisitor();
    if (!visitorId || busy) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/demo/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorId, action, text }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError(r?.status === 429 ? "That's a lot of replies. Wait a few minutes." : "That did not go through. Try again.");
    if (action === "reply") setText("");
    onDone();
  };
  return (
    <section className="grid gap-2 rounded-xl border border-alert/40 bg-card px-4 py-3" aria-live="polite">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-alert">
        <HeadsetIcon className="size-4" /> Needs staff
      </h3>
      <p className="text-sm text-muted-foreground">{persona} handed this chat to the front desk and paused. Play the receptionist: your reply shows in the chat.</p>
      <form className="grid gap-2" onSubmit={(e) => (e.preventDefault(), text.trim() && void post("reply"))}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1500} placeholder="Hi, this is the front desk. How can I help?" aria-label="Reply as the front desk" />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>Send reply</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void post("handback")}>Hand back to {persona}</Button>
        </div>
        {error && <p role="alert" className="text-sm text-alert">{error}</p>}
      </form>
    </section>
  );
}
