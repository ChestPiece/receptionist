"use client";

// Ledger pieces shared by the landing page and the staff dashboard.
import { MoonIcon, SunIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const noop = () => () => {};
import { cn } from "@/lib/utils";
import { EASE_OUT, SPRING } from "@/components/chat-cards";

export type Kind = "wa" | "web" | "staff";
export type Block = { id: string; day: number; start: number; end: number; title: string; name: string; kind: Kind; href?: string; muted?: boolean };
export type Day = { label: string; date: number; today?: boolean };

export const ROW = 52;
const KIND = {
  wa: "bg-sage-soft border-primary",
  web: "bg-web-soft border-web",
  staff: "bg-alert-soft border-alert",
} as const;

// Week grid: one column per day, 52px per hour. Blocks drop in like cards pinned to a board.
// `extra(day)` renders more content inside a day column (the landing story's flying booking).
export function WeekCalendar({ title, days, blocks, from = 9, to = 20, now, aside, extra, fill }: { title: ReactNode; days: Day[]; blocks: Block[]; from?: number; to?: number; now?: { day: number; hour: number }; aside?: ReactNode; extra?: (day: number) => ReactNode; fill?: boolean }) {
  const reduce = useReducedMotion();
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  // Mobile shows three days from today (or the first day).
  const first = Math.max(0, Math.min(days.findIndex((d) => d.today), days.length - 3));
  const hide = (i: number) => (i < first || i >= first + 3 ? "max-md:hidden" : "");
  return (
    <section className={cn("slip overflow-hidden", fill && "flex h-full min-h-0 flex-col")}>
      <header className={cn("flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-4", fill && "gap-y-1 px-4 py-2.5")}>
        <h3 className={cn("font-serif text-[22px]", fill && "font-sans text-sm font-semibold")}>{title}</h3>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <Legend className="bg-primary">WhatsApp</Legend>
          <Legend className="bg-web">Website</Legend>
          <Legend className="bg-alert">Needs staff</Legend>
          {aside}
        </div>
      </header>
      <div className={cn(fill && "min-h-0 flex-1 overflow-auto")}>
      <div className="relative grid grid-cols-[52px_repeat(var(--m),minmax(0,1fr))] md:grid-cols-[52px_repeat(var(--n),minmax(0,1fr))]" style={{ "--n": days.length, "--m": Math.min(3, days.length) } as React.CSSProperties}>
        <div className={cn("border-b", fill && "sticky top-0 z-20 bg-card")} />
        {days.map((d, i) => (
          <div key={i} className={cn("border-b border-s border-s-rule px-2 py-2.5 text-xs font-medium", fill && "sticky top-0 z-20 bg-card", hide(i))}>
            {d.label}
            <span className={cn("block font-serif text-[22px] leading-tight tracking-tight tabular-nums", d.today && "text-alert")}>{d.date}</span>
          </div>
        ))}
        <div>
          {hours.map((h) => (
            <div key={h} className="border-b border-rule px-1.5 pt-1 text-end font-mono text-[10.5px] text-muted-foreground" style={{ height: ROW }}>
              {h}:00
            </div>
          ))}
        </div>
        {days.map((_, i) => (
          <div key={i} className={cn("relative border-s border-rule", hide(i))} style={{ backgroundImage: `repeating-linear-gradient(transparent 0 ${ROW - 1}px, var(--rule) ${ROW - 1}px ${ROW}px)` }}>
            {blocks
              .filter((b) => b.day === i)
              .map((b) => {
                const Tag = b.href ? "a" : "div";
                return (
                  <motion.div
                    key={b.id}
                    className="absolute inset-x-1"
                    style={{ top: (Math.max(b.start, from) - from) * ROW + 2, height: Math.max((b.end - Math.max(b.start, from)) * ROW - 4, 20) }}
                    initial={reduce ? false : { y: -40, rotate: -3, opacity: 0 }}
                    animate={{ y: 0, rotate: 0, opacity: 1 }}
                    transition={{ y: { duration: 0.8, ease: SPRING }, rotate: { duration: 0.8, ease: SPRING }, opacity: { duration: 0.3 } }}
                  >
                    <Tag
                      {...(b.href ? { href: b.href } : {})}
                      className={cn("block h-full overflow-hidden rounded-[4px] border-s-[3px] px-1.5 py-1 text-[11.5px] leading-tight", KIND[b.kind], b.muted && "opacity-50 line-through", b.href && "transition-shadow hover:ring-2 hover:ring-foreground focus-visible:ring-2 focus-visible:ring-foreground outline-none")}
                    >
                      <strong className="block truncate font-semibold">{b.title}</strong>
                      <span className="block truncate">{b.name}</span>
                    </Tag>
                  </motion.div>
                );
              })}
            {extra?.(i)}
          </div>
        ))}
        {now && now.hour >= from && now.hour < to && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 ms-[52px] h-0.5 bg-alert" style={{ top: 64 + (now.hour - from) * ROW }}>
            <span className="absolute -top-1 -start-1.5 size-2.5 rounded-full bg-alert" />
          </div>
        )}
      </div>
      </div>
    </section>
  );
}

const Legend = ({ className, children }: { className: string; children: ReactNode }) => (
  <span className="flex items-center gap-1.5">
    <b className={cn("size-2.5 rounded-[2px]", className)} />
    {children}
  </span>
);

// A count that bumps (lifts and turns red) whenever its value changes.
export function Tally({ value, label }: { value: number; label: string }) {
  const reduce = useReducedMotion();
  const prev = useRef(value);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setBump(true);
    const t = setTimeout(() => setBump(false), 350);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="flex items-baseline gap-2.5">
      <motion.strong
        className={cn("inline-block font-serif text-[34px] font-normal tracking-tight tabular-nums", bump && "text-alert")}
        animate={reduce ? undefined : bump ? { y: -4, scale: 1.08 } : { y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: SPRING }}
      >
        {value}
      </motion.strong>
      <span className="label">{label}</span>
    </div>
  );
}

// Types a Sara line out with a caret when it just arrived (under 15 s old). Reduced motion shows it at once.
export function Typed({ text, at }: { text: string; at: string }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(() => (Date.now() - Date.parse(at) < 15_000 ? 0 : text.length));
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setN((i) => (i >= text.length ? (clearInterval(t), i) : i + 1)), 18);
    return () => clearInterval(t);
  }, [text, reduce]);
  const done = reduce || n >= text.length;
  return (
    <>
      {done ? text : text.slice(0, n)}
      {!done && <span aria-hidden className="caret" />}
    </>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, () => true, () => false); // theme is unknown on the server
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      className={cn("inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-rule hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", className)}
    >
      {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </button>
  );
}

// One line of a conversation slip: mono speaker label, Sara in serif, system notes as red dashed slips.
export function Line({ who, role, children }: { who: string; role: "patient" | "assistant" | "staff" | "system"; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="grid grid-cols-[48px_1fr] gap-2.5 text-sm"
      initial={reduce ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <span className={cn("pt-0.5 text-xs font-medium text-muted-foreground", role === "assistant" && "text-primary", role === "staff" && "text-web")}>{who}</span>
      <span
        dir="auto"
        className={cn(
          "whitespace-pre-wrap",
          role === "assistant" && "font-serif text-base leading-snug",
          role === "system" && "rounded-[3px] border border-dashed border-alert px-2 py-1.5 font-mono text-xs font-medium text-alert",
        )}
      >
        {children}
      </span>
    </motion.div>
  );
}
