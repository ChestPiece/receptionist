"use client";

import { Logo } from "@/components/logo";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type DynamicToolUIPart, type UIMessage } from "ai";
import { ArrowLeftIcon, ArrowUpIcon, ChevronDownIcon, MapPinIcon, PanelLeftIcon, PhoneIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppointmentList, BookedCard, Bubble, EASE_OUT, SlotPicker, TypingDots, type Appt, type Booked, type Slots } from "@/components/chat-cards";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ledger";
import { cn } from "@/lib/utils";
import type { Service } from "@/lib/clinics";
import { DAYS, type Hours } from "@/lib/slots";

type Info = {
  hours: Hours;
  services: Service[];
  address: string | null;
  maps_url: string | null;
};

const DAY_NAME = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};
const WEEK = [DAYS[6], ...DAYS.slice(0, 6)]; // UAE week starts on Saturday

// Groups neighbouring days with the same hours: "Sat–Thu 09:00–21:00", "Fri Closed".
function hourRows(hours: Hours) {
  const rows: {
    from: (typeof DAYS)[number];
    to: (typeof DAYS)[number];
    time: string;
  }[] = [];
  for (const d of WEEK) {
    const time = hours[d]?.map(([a, b]) => `${a}–${b}`).join(", ") || "Closed";
    const prev = rows.at(-1);
    if (prev?.time === time) prev.to = d;
    else rows.push({ from: d, to: d, time });
  }
  return rows.map((r) => ({
    days: r.from === r.to ? DAY_NAME[r.from] : `${DAY_NAME[r.from]}–${DAY_NAME[r.to]}`,
    time: r.time,
  }));
}

// One collapsible block in the sidebar: native <details>, so it needs no JS state.
function InfoBlock({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b py-1 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-2 py-2 text-sm font-medium hover:bg-sidebar-accent [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-2 pb-3 pt-1 text-sm">{children}</div>
    </details>
  );
}

// Hours, services and address, as collapsible blocks in the sidebar.
function ClinicInfo({ info, phone }: { info: Info; phone: string | null }) {
  return (
    <div className="flex flex-col">
      <InfoBlock title="Opening hours" open>
        <dl className="flex flex-col gap-1.5">
          {hourRows(info.hours).map((r) => (
            <div key={r.days} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{r.days}</dt>
              <dd className="text-end tabular-nums">{r.time}</dd>
            </div>
          ))}
        </dl>
      </InfoBlock>
      {info.services.length > 0 && (
        <InfoBlock title="Services & prices">
          <dl className="flex flex-col gap-1.5">
            {info.services.map((s) => (
              <div key={s.name} className="flex justify-between gap-4">
                <dt>{s.name}</dt>
                <dd className="shrink-0 tabular-nums text-muted-foreground">AED {s.price_aed.toLocaleString("en")}</dd>
              </div>
            ))}
          </dl>
        </InfoBlock>
      )}
      {(info.address || phone) && (
        <InfoBlock title="Location & contact">
          {info.address && <p className="text-muted-foreground">{info.address}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {info.maps_url?.startsWith("https://") && (
              <Button asChild size="sm" variant="outline">
                <a href={info.maps_url} target="_blank" rel="noreferrer">
                  <MapPinIcon className="size-4" /> Open in Maps
                </a>
              </Button>
            )}
            {phone && (
              <Button asChild size="sm" variant="outline">
                <a href={`tel:${phone}`}>
                  <PhoneIcon className="size-4" /> {phone}
                </a>
              </Button>
            )}
          </div>
        </InfoBlock>
      )}
    </div>
  );
}

// Clinic avatar: the logo when set, else the persona's initial.
function Avatar({ logo, name, letter, className }: { logo?: string; name: string; letter: string; className?: string }) {
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element -- clinic logos live on arbitrary hosts
    <img src={logo} alt={name} width={36} height={36} className={cn("size-9 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <div aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground", className)}>
      {letter}
    </div>
  );
}

// New chat: forget this browser's visitor id, so the server starts a fresh conversation.
function newChat() {
  try {
    localStorage.removeItem("visitor-id");
  } catch {}
  location.reload();
}

type SideProps = {
  name: string;
  sample: boolean;
  logo?: string;
  persona: string;
  info: Info;
  phone: string | null;
};

// Sidebar body: way back to the site, new chat, then the clinic's details.
function SidebarBody({ name, sample, logo, persona, info, phone }: SideProps) {
  return (
    <div className="flex h-full flex-col">
      <Link href="/" className="px-5 pt-4 pb-1" aria-label="Receptionist Agent home">
        <Logo className="text-xl" />
      </Link>
      <div className="flex flex-col gap-1.5 px-3 pb-4 pt-3">
        <Button asChild variant="ghost" className="justify-start text-muted-foreground">
          <Link href="/">
            <ArrowLeftIcon className="size-4" /> Back to site
          </Link>
        </Button>
        <Button variant="outline" className="justify-start bg-card" onClick={newChat}>
          <PlusIcon className="size-4" /> New chat
        </Button>
      </div>
      <div className="flex items-center gap-3 border-y px-4 py-4">
        <Avatar logo={logo} name={name} letter={persona[0]} />
        <div className="min-w-0 leading-tight">
          <div className="truncate font-medium">{name}</div>
          <div className="mt-1 text-xs text-muted-foreground">{sample ? "Dental clinic · sample data" : "Dental clinic"}</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <ClinicInfo info={info} phone={phone} />
      </div>
      <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
        Theme
        <ThemeToggle />
      </div>
    </div>
  );
}

const STARTERS = ["Book a cleaning", "Anything free Thursday evening?", "مواعيدكم يوم السبت؟", "Do you take my insurance?"];

// One anonymous id per browser, so Sara remembers the visitor between visits.
function visitorId() {
  try {
    let id = localStorage.getItem("visitor-id");
    if (!id) localStorage.setItem("visitor-id", (id = crypto.randomUUID()));
    return id;
  } catch {
    return crypto.randomUUID(); // storage blocked: this tab only
  }
}

// Tool output arrives as the tool's return value; string results are errors or notes meant for the model.
const outputOf = (part: DynamicToolUIPart) => {
  if (part.state !== "output-available") return null;
  const out = part.output;
  if (typeof out !== "string") return out as Record<string, unknown>;
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch {
    return null;
  }
};

function ToolCard({ part, onPick, busy }: { part: DynamicToolUIPart; onPick: (text: string) => void; busy: boolean }) {
  if (part.state === "input-streaming" || part.state === "input-available")
    return <Shimmer className="text-sm">{part.toolName === "find_slots" ? "Checking free times…" : "One moment…"}</Shimmer>;
  const out = outputOf(part);
  if (!out) return null;
  if (part.toolName === "find_slots" && "days" in out) return <SlotPicker slots={out as Slots} onPick={onPick} busy={busy} />;
  if (part.toolName === "book" && "booked" in out) return <BookedCard booked={out as Booked} />;
  if (part.toolName === "my_appointments" && Array.isArray(out)) return <AppointmentList appts={out as Appt[]} />;
  return null;
}

// Only newly mounted messages move in; streaming updates re-render without re-animating.
function Enter({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
      {children}
    </motion.div>
  );
}

type ChatProps = {
  slug: string;
  clinicName: string;
  persona: string;
  phone: string | null;
  logo?: string;
  info: Info;
};

type Line = { id: string; role: string; text: string };
type Feed = { paused: boolean; messages: Line[] };
const feed = (slug: string, id: string, after = 0): Promise<Feed | null> =>
  fetch(`/api/chat?slug=${encodeURIComponent(slug)}&visitorId=${id}${after ? `&after=${after}` : ""}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
// Staff replies show as assistant turns; the "s" id prefix labels them as the front desk.
const toUi = (m: Line): UIMessage => ({ id: `${m.role === "staff" ? "s" : "h"}${m.id}`, role: m.role === "patient" ? "user" : "assistant", parts: [{ type: "text", text: m.text }] });
const newest = (ms: Line[], floor: number) => Math.max(floor, ...ms.map((m) => Number(m.id)));

// Render at once; the visitor's earlier messages (text only) are fetched in the background and slotted in when they land.
export function Chat(props: ChatProps) {
  const [id] = useState(visitorId);
  const [start, setStart] = useState<{ history: UIMessage[]; paused: boolean; lastId: number } | null>(null);
  useEffect(() => {
    feed(props.slug, id).then((d) => setStart({ history: (d?.messages ?? []).map(toUi), paused: !!d?.paused, lastId: newest(d?.messages ?? [], 0) }));
  }, [props.slug, id]);
  return <ChatView {...props} id={id} start={start} />;
}

function ChatView({ slug, clinicName, persona, phone, logo, info, id, start }: ChatProps & { id: string; start: { history: UIMessage[]; paused: boolean; lastId: number } | null }) {
  const sample = /\(sample data\)/i.test(clinicName);
  const name = clinicName.replace(/\s*\(sample data\)/i, "");
  const [greeted, setGreeted] = useState(false);
  const reduce = useReducedMotion();
  const { messages, setMessages, sendMessage, regenerate, error, clearError, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { slug, visitorId: id, message: messages.at(-1) },
      }),
    }),
  });
  // History lands late: apply it only if the visitor has not typed yet.
  const history = start?.history;
  useEffect(() => {
    if (history?.length && messages.length === 0 && status === "ready") {
      setMessages(history);
    }
  }, [history, messages.length, status, setMessages]);
  const busy = status === "submitted" || status === "streaming";

  // Staff take-over: while paused, poll for new rows and append only staff replies (streamed turns already show).
  // ponytail: polling, because anonymous visitors cannot pass RLS for realtime; upgrade path is a signed per-visitor channel.
  const [pausedState, setPaused] = useState<boolean | null>(null);
  const paused = pausedState ?? start?.paused ?? false;
  const [back, setBack] = useState(false);
  const last = useRef<number | null>(null);
  const check = useCallback(async () => {
    if (!start) return;
    const after = last.current ?? start.lastId;
    const d = await feed(slug, id, after);
    if (!d) return;
    last.current = newest(d.messages, after);
    const staff = d.messages.filter((m) => m.role === "staff");
    if (staff.length) setMessages((ms) => [...ms, ...staff.map(toUi)]);
    setBack(paused && !d.paused);
    setPaused(d.paused);
  }, [start, slug, id, paused, setMessages]);
  // After each finished reply (a handoff pauses the chat), and every 4 s while paused and the tab is visible.
  useEffect(() => {
    if (status === "ready" && messages.length) void check();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps -- run once per finished turn, not on every poll update
  useEffect(() => {
    if (!paused) return;
    const t = setInterval(() => document.visibilityState === "visible" && void check(), 4000);
    return () => clearInterval(t);
  }, [paused, check]);
  const send = (text: string) => !busy && text.trim() && sendMessage({ text });

  // Sara "types" her greeting for a beat so the chat opens like a person picked up.
  useEffect(() => {
    const t = setTimeout(() => setGreeted(true), reduce ? 0 : 700);
    return () => clearTimeout(t);
  }, [reduce]);

  const [sidebar, setSidebar] = useState(true);
  const [sheet, setSheet] = useState(false);
  const side = <SidebarBody name={name} sample={sample} logo={logo} persona={persona} info={info} phone={phone} />;
  const empty = messages.length === 0;

  return (
    <div className="flex h-full">
      {/* Desktop: collapsible column. Phones: the same content in a left sheet. */}
      <aside className={cn("hidden shrink-0 overflow-hidden bg-sidebar transition-[width] duration-200 ease-out lg:block", sidebar ? "w-72 border-e" : "w-0")}>
        <div className="h-full w-72">{side}</div>
      </aside>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">{name}</SheetTitle>
          {side}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Toggle sidebar"
              onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? setSidebar((v) => !v) : setSheet(true))}
            >
              <PanelLeftIcon className="size-4" />
            </Button>
            <Avatar logo={logo} name={name} letter={persona[0]} className="size-8" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium">{name}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="relative flex size-1.5">
                  <span className="online-ring absolute inset-0 rounded-full bg-success" />
                  <span className="relative size-1.5 rounded-full bg-success" />
                </span>
                {persona}, virtual receptionist
              </div>
            </div>
          </div>
          {phone && (
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${phone}`} aria-label="Call the clinic">
                <PhoneIcon className="size-4" /> <span className="hidden sm:inline">Call clinic</span>
              </a>
            </Button>
          )}
        </header>

        <Conversation className="flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-7 px-4 py-8 sm:px-6">
            {empty && (
              <h1 className="pt-[clamp(1rem,10svh,5rem)] font-[family-name:var(--font-newsreader)] text-4xl font-normal tracking-[-0.02em] text-balance sm:text-5xl">
                {name}
              </h1>
            )}
            <AnimatePresence mode="wait" initial={false}>
              {greeted || !empty ? (
                <Enter key="greeting">
                  <div className="flex flex-col gap-5">
                    <Message from="assistant">
                      <MessageContent>
                        <Bubble>
                          Hi, I&apos;m {persona} from {name}. I can book, move or cancel a visit, and answer questions about prices, hours and location.
                        </Bubble>
                      </MessageContent>
                    </Message>
                    {empty && (
                      <div className="flex flex-wrap gap-2">
                        {STARTERS.map((q, i) => (
                          <motion.div key={q} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE_OUT, delay: 0.1 + i * 0.04 }}>
                            <Suggestion suggestion={q} onClick={send} dir="auto" className="h-9 bg-card" />
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </Enter>
              ) : (
                <motion.div key="typing" exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                  <TypingDots label={`${persona} is typing`} />
                </motion.div>
              )}
            </AnimatePresence>

            {messages.map((m) => (
              <Enter key={m.id}>
                <Message from={m.role}>
                  <MessageContent
                    dir="auto"
                    className="group-[.is-user]:rounded-2xl group-[.is-user]:rounded-ee-sm group-[.is-user]:bg-primary group-[.is-user]:py-2.5 group-[.is-user]:text-primary-foreground"
                  >
                    {m.id.startsWith("s") && <span className="text-xs font-medium text-muted-foreground">Front desk</span>}
                    {m.parts.map((p, i) =>
                      p.type === "text" ? (
                        m.role === "user" ? (
                          <MessageResponse key={i}>{p.text}</MessageResponse>
                        ) : (
                          <Bubble key={i}>
                            <MessageResponse>{p.text}</MessageResponse>
                          </Bubble>
                        )
                      ) : p.type === "dynamic-tool" ? (
                        <ToolCard key={i} part={p} onPick={send} busy={busy} />
                      ) : null,
                    )}
                  </MessageContent>
                </Message>
              </Enter>
            ))}
            {error && (
              <Enter>
                <div role="alert" className="flex w-fit max-w-[85%] flex-col gap-2 rounded-md border border-dashed border-alert px-4 py-3 text-sm">
                  <span className="font-mono text-[12px] text-alert">That message didn&apos;t go through.</span>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => (clearError(), void regenerate())}>
                      <RotateCcwIcon className="size-3.5" /> Try again
                    </Button>
                    {phone && (
                      <Button asChild size="sm" variant="ghost" className="rounded-full">
                        <a href={`tel:${phone}`}>Call {phone}</a>
                      </Button>
                    )}
                  </div>
                </div>
              </Enter>
            )}
            {(paused || back) && (
              <p role="status" className="text-center text-xs text-muted-foreground">
                {paused ? "You're chatting with the front desk. They reply here." : `${persona} is back. Ask her anything.`}
              </p>
            )}
            {status === "submitted" && (
              <Enter>
                <TypingDots label={`${persona} is typing`} />
              </Enter>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pb-4 pt-1 before:pointer-events-none before:absolute before:inset-x-0 before:-top-8 before:h-8 before:bg-gradient-to-t before:from-background before:to-transparent sm:px-6">
          <PromptInput
            onSubmit={({ text }) => void send(text)}
            className="[&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:bg-card [&_[data-slot=input-group]]:shadow-sm"
          >
            <PromptInputBody>
              <PromptInputTextarea dir="auto" placeholder={`Message ${persona}…`} rows={1} className="min-h-0 py-3.5 ps-4" />
            </PromptInputBody>
            <InputGroupAddon align="inline-end">
              <PromptInputSubmit status={status} onStop={stop} className="rounded-full">
                {status === "ready" ? <ArrowUpIcon className="size-4" /> : undefined}
              </PromptInputSubmit>
            </InputGroupAddon>
          </PromptInput>
          <p className="text-center text-[11px] text-muted-foreground">{persona} is a virtual assistant. In an emergency, call 998.</p>
        </div>
      </div>
    </div>
  );
}
