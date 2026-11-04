import Link from "next/link";
import { Button } from "@/components/ui/button";
import { stillPaused } from "@/lib/agent";
import { deskConfig } from "@/lib/clinics";
import { desk, deskSetup, weekStart, who } from "@/lib/dashboard";
import { isOpenAt, localDate, localTime } from "@/lib/slots";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "./page-frame";
import { NewBooking } from "./schedule";
import { setVisitStatus } from "./actions";

export const metadata = { title: "Today" };

const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
type Person = { name: string | null; phone: string | null; wa_id: string | null };
type Row = { id: string; service: string; starts_at: string; status: string; source: string; created_at: string; dentist_id: string; patient_id: string; patients: Person | null };

export default async function Today() {
  const { sb, clinic: picked } = await desk();
  if (!picked) return null;
  const off = picked.utc_offset_minutes;
  const today = localDate(new Date(), off);
  const utc = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - off * 60_000).toISOString();
  const weekFrom = utc(weekStart(today));
  const dayEnd = new Date(Date.parse(utc(today)) + 86_400_000).toISOString();

  const [{ data: visits }, { data: week }, { data: paused }, clinic] = await Promise.all([
    sb.from("appointments").select("id, service, starts_at, status, source, created_at, dentist_id, patient_id, patients!inner(name, phone, wa_id, is_test)")
      .eq("patients.is_test", false).eq("clinic_id", picked.id).neq("status", "cancelled").gte("starts_at", utc(today)).lt("starts_at", dayEnd).order("starts_at"),
    sb.from("appointments").select("source, status, created_at, starts_at, service_id, patients!inner(is_test)").eq("patients.is_test", false).eq("clinic_id", picked.id).or(`created_at.gte.${weekFrom},starts_at.gte.${weekFrom}`),
    sb.from("conversations").select("patient_id, bot_paused, updated_at, patients!inner(clinic_id, name, phone, wa_id, is_test)")
      .eq("patients.clinic_id", picked.id).eq("patients.is_test", false).eq("bot_paused", true).order("updated_at", { ascending: false }),
    deskConfig(sb, picked.id),
  ]);

  const rows = (visits ?? []) as unknown as Row[];
  const waiting = ((paused ?? []) as unknown as { patient_id: string; bot_paused: boolean; updated_at: string; patients: Person }[]).filter((c) => stillPaused(c));
  const w = week ?? [];
  const saraWeek = w.filter((a) => a.source !== "staff" && a.created_at >= weekFrom && a.status !== "cancelled");
  const bySara = saraWeek.length;
  // The proof for the owner: what Sara's bookings are worth, and how many came in while the clinic was closed.
  const price = new Map(clinic.services.map((s) => [s.id, s.price_aed ?? 0]));
  const aed = saraWeek.reduce((sum, a) => sum + (price.get(a.service_id ?? "") ?? 0), 0);
  const hoursSet = Object.values(clinic.hours ?? {}).some((w) => w?.length); // no hours set: "after hours" means nothing
  const afterHours = saraWeek.filter((a) => !isOpenAt(new Date(a.created_at), clinic.hours, off)).length;
  const saraNote = bySara ? [aed ? `≈ AED ${aed.toLocaleString("en-US")}` : "", hoursSet ? `${afterHours} after hours` : ""].filter(Boolean).join(" · ") || undefined : undefined;
  const noShows = w.filter((a) => a.status === "no_show" && a.starts_at >= weekFrom && a.starts_at < dayEnd).length;
  const multi = clinic.dentists.filter((d) => d.active).length > 1;
  const groups = multi
    ? clinic.dentists.filter((d) => rows.some((r) => r.dentist_id === d.id)).map((d) => ({ key: d.id, label: d.name, color: d.color, rows: rows.filter((r) => r.dentist_id === d.id) }))
    : [{ key: "all", label: "", color: null, rows }];

  return (
    <>
      <PageHeader title={<>Today <span className="ms-1 font-normal text-muted-foreground max-sm:hidden">{LONG.format(new Date(`${today}T00:00:00Z`))}</span></>}>
        <NewBooking setup={deskSetup(clinic)} />
      </PageHeader>
      <PageBody className="gap-3 overflow-y-auto p-3 sm:p-4 lg:overflow-hidden">
        <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Visits today" value={rows.length} />
          <Stat label="Booked by Sara this week" value={bySara} note={saraNote} />
          <Stat label="Needs staff" value={waiting.length} alert={waiting.length > 0} href="/dashboard/inbox?f=staff" />
          <Stat label="No-shows this week" value={noShows} />
        </div>
        <div className="grid min-h-0 grid-cols-1 gap-3 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[minmax(0,1fr)]">
          <Pane title="Needs staff" count={waiting.length}>
            {waiting.length === 0 ? <Empty>Nobody waiting. When Sara hands a chat to your team, it shows up here.</Empty> : (
              <ul className="divide-y">
                {waiting.map((c) => (
                  <li key={c.patient_id}>
                    <Link href={`/dashboard/inbox?p=${c.patient_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted">
                      <span className="size-2 shrink-0 rounded-full bg-alert" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{who(c.patients)}</span>
                      <span className="text-xs text-muted-foreground">{c.patients.wa_id ? "WhatsApp" : "Website"}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">{localTime(new Date(c.updated_at), off)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Pane>
          <Pane title="Today's visits" count={rows.length} action={<Link href="/dashboard/calendar" className="text-xs text-muted-foreground hover:text-foreground">Calendar</Link>}>
            {rows.length === 0 ? <Empty>No visits booked for today.</Empty> : groups.map((g) => (
              <div key={g.key}>
                {g.label && (
                  <h3 className="sticky top-0 z-10 flex items-center gap-2 border-b bg-card px-4 py-1.5 text-xs font-semibold">
                    <span className="size-2 rounded-full" style={{ background: g.color ?? "var(--primary)" }} />{g.label}
                  </h3>
                )}
                <ul className="divide-y">
                  {g.rows.map((r) => (
                    <li key={r.id} className={cn("flex items-center gap-3 px-4 py-2", r.status === "no_show" && "opacity-60")}>
                      <span className="w-11 shrink-0 font-mono text-xs tabular-nums">{localTime(new Date(r.starts_at), off)}</span>
                      <Link href={`/dashboard/patients/${r.patient_id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                        <span className="font-medium max-sm:block max-sm:truncate">{who(r.patients)}</span> <span className="text-muted-foreground max-sm:block max-sm:truncate max-sm:text-xs"><span className="max-sm:hidden">· </span>{r.service}</span>
                      </Link>
                      {r.status === "booked" ? (
                        <span className="flex shrink-0 gap-1">
                          <form action={setVisitStatus.bind(null, r.id, "completed")}><Button size="sm" variant="outline" className="h-7">Arrived</Button></form>
                          <form action={setVisitStatus.bind(null, r.id, "no_show")}><Button size="sm" variant="ghost" className="h-7">No-show</Button></form>
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">{r.status === "completed" ? "Arrived" : "No-show"}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Pane>
        </div>
      </PageBody>
    </>
  );
}

function Stat({ label, value, alert, href, note }: { label: string; value: number; alert?: boolean; href?: string; note?: string }) {
  const body = (
    <>
      <span className="block text-xs leading-snug text-muted-foreground">{label}</span>
      <strong className={cn("block text-2xl font-semibold tracking-tight tabular-nums", alert && "text-alert")}>{value}</strong>
      {note && <span className="block truncate font-mono text-xs text-muted-foreground tabular-nums">{note}</span>}
    </>
  );
  const cls = "rounded-xl border bg-card px-4 py-3";
  return href ? <Link href={href} className={cn(cls, "hover:border-foreground/30")}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Pane({ title, count, action, children }: { title: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card max-lg:max-h-[28rem]">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
        <span className="ms-auto">{action}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="p-4 text-sm text-muted-foreground">{children}</p>;
