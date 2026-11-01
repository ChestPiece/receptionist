import Link from "next/link";
import { Line, Tally, Typed, WeekCalendar } from "@/components/ledger";
import { stillPaused } from "@/lib/agent";
import { afterHours, desk, week, weekStart, who } from "@/lib/dashboard";
import { localDate } from "@/lib/slots";
import { PageBody, PageHeader } from "./page-frame";

export const metadata = { title: "Today" };

const LONG = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

export default async function Today() {
  const { sb, clinic } = await desk();
  if (!clinic) return null;
  const start = weekStart(localDate(new Date(), clinic.utc_offset_minutes));
  const [cal, { data: paused }] = await Promise.all([
    week(sb, clinic, start, (id) => `/dashboard/calendar?w=${start}&a=${id}`),
    sb
      .from("conversations")
      .select("patient_id, bot_paused, updated_at, patients!inner(clinic_id, name, phone, wa_id)")
      .eq("patients.clinic_id", clinic.id)
      .eq("bot_paused", true)
      .order("updated_at", { ascending: false }),
  ]);

  const waiting = (paused ?? []).filter((c) => stillPaused(c));
  // Booked by Sara this week = visits she created this week (staff bookings excluded).
  const weekFrom = Date.parse(`${start}T00:00:00Z`) - clinic.utc_offset_minutes * 60_000;
  const bySara = cal.rows.filter((a) => a.source !== "staff" && Date.parse(a.created_at) >= weekFrom);
  const late = bySara.filter((a) => afterHours(new Date(a.created_at), clinic.hours, clinic.utc_offset_minutes));

  const first = waiting[0] as unknown as { patient_id: string; patients: { name: string | null; phone: string | null; wa_id: string | null } } | undefined;
  const { data: thread } = first
    ? await sb.from("messages").select("id, role, body, created_at, channel").eq("patient_id", first.patient_id).order("id", { ascending: false }).limit(8)
    : { data: null };

  return (
    <>
      <PageHeader title="Today">
        <p className="text-xs text-muted-foreground max-sm:hidden">{clinic.name} · Week of {LONG.format(new Date(`${start}T00:00:00Z`))}</p>
      </PageHeader>
      <PageBody className="overflow-y-auto p-3 sm:p-4 xl:overflow-hidden">
        <div className="flex shrink-0 flex-wrap gap-x-8 gap-y-2 pb-3">
          <Tally value={bySara.length} label="Booked by Sara this week" />
          <Tally value={late.length} label="After hours" />
          <Tally value={waiting.length} label="Need staff" />
        </div>
        <div className="grid min-h-0 grid-cols-1 gap-4 xl:flex-1 xl:grid-cols-[340px_1fr]">
          <section className="slip relative flex min-h-0 flex-col max-xl:h-80">
            {first ? (
              <>
                <header className="shrink-0 border-b px-4 py-3">
                  <span className="label">{first.patients.wa_id ? "WhatsApp" : "Website"} · waiting for staff</span>
                  <h2 className="text-base font-semibold">{who(first.patients)}</h2>
                </header>
                <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-4 py-3">
                  {(thread ?? []).reverse().map((m, i, all) => (
                    <Line key={m.id} role={m.role} who={m.role === "assistant" ? "Sara" : m.role === "patient" ? "Patient" : m.role === "staff" ? "Staff" : "Note"}>
                      {m.role === "assistant" && i === all.length - 1 ? <Typed text={m.body} at={m.created_at} /> : m.body}
                    </Line>
                  ))}
                </div>
                <footer className="flex shrink-0 items-center justify-between border-t px-4 py-3">
                  <span className="label">{waiting.length > 1 ? `${waiting.length - 1} more waiting` : "Only one waiting"}</span>
                  <Link href={`/dashboard/inbox?p=${first.patient_id}`} className="rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground">
                    Open chat
                  </Link>
                </footer>
              </>
            ) : (
              <div className="flex flex-1 flex-col justify-center p-6">
                <h2 className="text-base font-semibold">Nobody waiting.</h2>
                <p className="mt-1 text-sm text-muted-foreground">When Sara hands a chat to your team, it shows up here and turns red on the book.</p>
              </div>
            )}
          </section>
          <div className="min-h-0 max-xl:h-[34rem]">
            <WeekCalendar fill title={`Week of ${LONG.format(new Date(`${start}T00:00:00Z`))}`} days={cal.days} blocks={cal.blocks} from={cal.from} to={cal.to} now={cal.now} />
          </div>
        </div>
      </PageBody>
    </>
  );
}
