"use client";

// Calendar grid for the desk: columns are dentists (day view) or days (week view). Only the grid pane scrolls.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Off, SBlock, SCol } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { cancelForPatient, setVisitStatus } from "./actions";
import { BookingDialog, type DeskSetup, type Prefill } from "./booking-dialog";
import { ConfirmDelete } from "./confirm-delete";
import { deleteVisits } from "./settings/actions";

const ROW = 44; // px per hour
const KIND = { wa: "bg-sage-soft", web: "bg-web-soft", staff: "bg-alert-soft" } as const;
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (h: number) => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}`;

export function NewBooking({ setup }: { setup: DeskSetup }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><PlusIcon />New booking</Button>
      <BookingDialog setup={setup} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function Toolbar({ view, date, prev, next, today, dentist, dentists }: {
  view: "day" | "week"; date: string; prev: string; next: string; today: string; dentist?: string; dentists: { id: string; name: string }[];
}) {
  const router = useRouter();
  const go = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ v: view, d: date, dentist, ...p }).filter(([, v]) => v) as [string, string][]);
    router.push(`?${q}`);
  };
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
      <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && go({ v })}>
        <ToggleGroupItem value="day">Day</ToggleGroupItem>
        <ToggleGroupItem value="week">Week</ToggleGroupItem>
      </ToggleGroup>
      <div className="flex items-center">
        <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => go({ d: prev })}><ChevronLeftIcon /></Button>
        <Button variant="outline" size="sm" onClick={() => go({ d: today })}>Today</Button>
        <Button variant="ghost" size="icon" aria-label="Next" onClick={() => go({ d: next })}><ChevronRightIcon /></Button>
      </div>
      <input type="date" value={date} onChange={(e) => e.target.value && go({ d: e.target.value })} aria-label="Go to date" className="h-8 rounded-md border bg-transparent px-2 text-sm" />
      {dentists.length > 1 && (
        <Select value={dentist ?? "all"} onValueChange={(v) => go({ dentist: v === "all" ? undefined : v })}>
          <SelectTrigger size="sm" className="ms-auto w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dentists</SelectItem>
            {dentists.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function Schedule({ columns, blocks, off, range, now, linkBase, setup }: {
  columns: SCol[]; blocks: SBlock[]; off: Off[]; range: [number, number]; now: { column: string; hour: number } | null; linkBase: string; setup: DeskSetup;
}) {
  const [lo, hi] = range;
  const hours = Array.from({ length: hi - lo }, (_, i) => lo + i);
  const pane = useRef<HTMLDivElement>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);

  // Open scrolled to an hour before now.
  useEffect(() => {
    if (now && pane.current) pane.current.scrollTop = Math.max(0, (now.hour - lo - 1) * ROW);
  }, [now, lo]);

  const pick = (c: SCol, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const h = lo + (e.clientY - e.currentTarget.getBoundingClientRect().top) / ROW;
    setPrefill({ dentistId: c.dentistId, date: c.date, time: hhmm(Math.floor(h * 4) / 4) });
  };

  if (!columns.length) return <p className="p-6 text-sm text-muted-foreground">No active dentists. The owner adds them in Settings.</p>;

  return (
    <div ref={pane} className="min-h-0 flex-1 overflow-auto">
      <div className="grid min-w-full" style={{ gridTemplateColumns: `48px repeat(${columns.length}, minmax(${columns.length > 3 ? 104 : 160}px, 1fr))` }}>
        <div className="sticky top-0 start-0 z-30 border-b bg-background" />
        {columns.map((c) => (
          <div key={c.key} className="sticky top-0 z-20 truncate border-b border-s bg-background px-2 py-2 text-xs">
            <span className={cn("font-semibold", c.today && "text-primary")}>{c.label}</span>
            {c.sub && <span className="block truncate text-muted-foreground">{c.sub}</span>}
          </div>
        ))}
        <div className="sticky start-0 z-10 bg-background">
          {hours.map((h) => (
            <div key={h} className="border-b px-1.5 pt-0.5 text-end font-mono text-[10.5px] text-muted-foreground" style={{ height: ROW }}>{pad(h)}:00</div>
          ))}
        </div>
        {columns.map((c) => (
          <div
            key={c.key}
            onClick={(e) => pick(c, e)}
            className="relative cursor-cell border-s"
            style={{ height: hours.length * ROW, backgroundImage: `repeating-linear-gradient(transparent 0 ${ROW - 1}px, var(--border) ${ROW - 1}px ${ROW}px)` }}
          >
            {off.filter((o) => o.column === c.key).map((o, i) => (
              <div key={i} aria-hidden className="pointer-events-none absolute inset-x-0 bg-muted/70 [background-image:repeating-linear-gradient(45deg,transparent_0_6px,var(--border)_6px_7px)]" style={{ top: (o.from - lo) * ROW, height: (o.to - o.from) * ROW }} />
            ))}
            {blocks.filter((b) => b.column === c.key).map((b) => (
              <Link
                key={b.id}
                href={`?${linkBase}&a=${b.id}`}
                scroll={false}
                className={cn("absolute inset-x-1 overflow-hidden rounded-md border-s-[3px] px-1.5 py-1 text-[11.5px] leading-tight outline-none transition-shadow hover:ring-2 hover:ring-ring focus-visible:ring-2 focus-visible:ring-ring", KIND[b.kind], b.muted && "opacity-50 line-through")}
                style={{ top: (Math.max(b.start, lo) - lo) * ROW + 1, height: Math.max((b.end - Math.max(b.start, lo)) * ROW - 2, 20), borderInlineStartColor: b.color ?? "var(--primary)" }}
              >
                <strong className="block truncate font-semibold">{b.title}{b.test && <span className="ms-1 rounded bg-foreground/10 px-1 text-[10px] font-medium">Test</span>}</strong>
                <span className="block truncate">{b.name}</span>
              </Link>
            ))}
            {now && (now.column === "*" || now.column === c.key) && now.hour >= lo && now.hour < hi && (
              <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-alert" style={{ top: (now.hour - lo) * ROW }} />
            )}
          </div>
        ))}
      </div>
      <BookingDialog setup={setup} open={!!prefill} onOpenChange={(o) => !o && setPrefill(null)} prefill={prefill ?? undefined} />
    </div>
  );
}

export type SheetVisit = {
  id: string; patient: string; patientId: string | null; service: string; serviceId: string | null; dentist: string | null;
  day: string; time: string; status: string; channel: string; source: string;
};

const STATUS = [
  { value: "completed", label: "Arrived" },
  { value: "no_show", label: "No-show" },
  { value: "booked", label: "Booked" },
];

export function VisitSheet({ visit, closeHref, setup, owner }: { visit: SheetVisit; closeHref: string; setup: DeskSetup; owner?: boolean }) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const close = () => router.push(closeHref, { scroll: false });
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-end">{v}</dd></div>;
  return (
    <Sheet open onOpenChange={(o) => !o && close()}>
      <SheetContent className="gap-0">
        <SheetHeader>
          <SheetTitle>{visit.patient}</SheetTitle>
          <SheetDescription>{visit.channel} · {visit.source === "staff" ? "booked by staff" : `booked via ${visit.source}`}</SheetDescription>
        </SheetHeader>
        <dl className="grid gap-2 border-y px-4 py-3 text-sm">
          {row("Visit", visit.service)}
          {visit.dentist && row("Dentist", visit.dentist)}
          {row("Day", visit.day)}
          {row("Time", <span className="font-mono tabular-nums">{visit.time}</span>)}
          {row("Status", STATUS.find((s) => s.value === visit.status)?.label ?? visit.status)}
        </dl>
        <div className="flex flex-wrap gap-2 p-4">
          {visit.status === "booked" && <Button size="sm" onClick={() => setMoving(true)}>Move</Button>}
          {STATUS.filter((s) => s.value !== visit.status).map((s) => (
            <Button key={s.value} size="sm" variant="outline" onClick={() => setVisitStatus(visit.id, s.value)}>{s.label}</Button>
          ))}
          {visit.status === "booked" && (
            <Button size="sm" variant="outline" className="text-alert" onClick={async () => { await cancelForPatient(visit.id); close(); }}>Cancel visit</Button>
          )}
          {visit.patientId && <Button size="sm" variant="ghost" asChild><Link href={`/dashboard/patients/${visit.patientId}`}>Open profile</Link></Button>}
          {owner && <ConfirmDelete label="Delete visit" title="Delete this visit?" body="It leaves the calendar and gets no reminders. Cancel keeps a record; delete does not." run={() => deleteVisits([visit.id])} after={close} />}
        </div>
      </SheetContent>
      <BookingDialog setup={setup} open={moving} onOpenChange={setMoving} move={{ id: visit.id, serviceId: visit.serviceId, patient: visit.patient }} />
    </Sheet>
  );
}

// "Book visit" for one known patient (inbox panel, patient profile).
export function BookFor({ setup, patient, label = "Book visit", variant = "default" }: { setup: DeskSetup; patient: { id: string; name: string | null }; label?: string; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  const prefill = useMemo(() => ({ patient }), [patient]);
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}><PlusIcon />{label}</Button>
      <BookingDialog setup={setup} open={open} onOpenChange={setOpen} prefill={prefill} />
    </>
  );
}
