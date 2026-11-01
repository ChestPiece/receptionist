import Link from "next/link";
import { WeekCalendar } from "@/components/ledger";
import { addDays, desk, week, weekStart, who } from "@/lib/dashboard";
import { localDate, localTime } from "@/lib/slots";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "../page-frame";
import { setVisitStatus } from "../actions";

export const metadata = { title: "Calendar" };

const LONG = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const FULL = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const STATUS = [
  { value: "completed", label: "Came in" },
  { value: "no_show", label: "No-show" },
  { value: "booked", label: "Booked" },
  { value: "cancelled", label: "Cancel visit" },
];

export default async function Calendar({ searchParams }: PageProps<"/dashboard/calendar">) {
  const { sb, clinic } = await desk();
  if (!clinic) return null;
  const { w, a } = (await searchParams) as { w?: string; a?: string };
  const off = clinic.utc_offset_minutes;
  const start = weekStart(w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? w : localDate(new Date(), off));
  const cal = await week(sb, clinic, start, (id) => `/dashboard/calendar?w=${start}&a=${id}`);
  const visit = a ? cal.rows.find((r) => r.id === a) : undefined;

  const nav = (
    <span className="flex items-center gap-1">
      <Link href={`?w=${addDays(start, -7)}`} aria-label="Previous week" className="rounded-full px-2 py-1 hover:bg-rule">←</Link>
      <Link href="?" className="rounded-full px-2 py-1 hover:bg-rule">This week</Link>
      <Link href={`?w=${addDays(start, 7)}`} aria-label="Next week" className="rounded-full px-2 py-1 hover:bg-rule">→</Link>
    </span>
  );

  return (
    <>
      <PageHeader title="Calendar">
        <p className="text-xs text-muted-foreground max-sm:hidden">{cal.rows.length} visits this week</p>
      </PageHeader>
      <PageBody className={cn("gap-3 p-3 sm:p-4 xl:grid xl:grid-rows-1", visit && "xl:grid-cols-[1fr_300px]")}>
        <div className="min-h-0 flex-1 xl:flex-none">
          <WeekCalendar fill title={`Week of ${LONG.format(new Date(`${start}T00:00:00Z`))}`} days={cal.days} blocks={cal.blocks} from={cal.from} to={cal.to} now={cal.now} aside={nav} />
        </div>
        {visit && (
          <aside className="slip relative min-h-0 shrink-0 overflow-y-auto p-4 max-xl:max-h-[45%]" aria-label="Visit">
            <div className="flex items-start justify-between gap-2">
              <span className="label">{visit.patients?.wa_id ? "WhatsApp" : "Website"} · {visit.source === "staff" ? "booked by staff" : `via ${visit.source}`}</span>
              <Link href={`?w=${start}`} aria-label="Close" className="-mt-1 text-muted-foreground hover:text-foreground">✕</Link>
            </div>
            <h2 className="mt-1 text-base font-semibold">{who(visit.patients)}</h2>
            <dl className="mt-3 grid gap-2 border-t pt-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Visit</dt><dd>{visit.service}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Day</dt><dd>{FULL.format(new Date(`${localDate(new Date(visit.starts_at), off)}T00:00:00Z`))}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Time</dt><dd className="font-mono tabular-nums">{localTime(new Date(visit.starts_at), off)} to {localTime(new Date(visit.ends_at), off)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Status</dt><dd>{STATUS.find((s) => s.value === visit.status)?.label ?? visit.status}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
              {STATUS.filter((s) => s.value !== visit.status).map((s) => (
                <form key={s.value} action={setVisitStatus.bind(null, visit.id, s.value)}>
                  <button className={cn("rounded-full border px-3.5 py-2 text-[13px] font-medium hover:border-foreground", s.value === "cancelled" && "border-alert/50 text-alert hover:border-alert")}>{s.label}</button>
                </form>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">To move a visit, ask the patient to message Sara: she only offers free times.</p>
          </aside>
        )}
      </PageBody>
    </>
  );
}
