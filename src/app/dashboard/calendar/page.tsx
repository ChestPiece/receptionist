import { deskConfig } from "@/lib/clinics";
import { addDays, desk, deskSetup, schedule, weekStart, who } from "@/lib/dashboard";
import { localDate, localTime } from "@/lib/slots";
import { PageBody, PageHeader } from "../page-frame";
import { NewBooking, Schedule, Toolbar, VisitSheet } from "../schedule";

export const metadata = { title: "Calendar" };

const FULL = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (f: Intl.DateTimeFormat, d: string) => f.format(new Date(`${d}T00:00:00Z`));

export default async function Calendar({ searchParams }: PageProps<"/dashboard/calendar">) {
  const { sb, clinic: picked } = await desk();
  if (!picked) return null;
  const clinic = await deskConfig(sb, picked.id);
  const p = (await searchParams) as { v?: string; d?: string; dentist?: string; a?: string };
  const off = clinic.utc_offset_minutes;
  const today = localDate(new Date(), off);
  const view = p.v === "week" ? "week" : "day";
  const date = p.d && /^\d{4}-\d{2}-\d{2}$/.test(p.d) ? p.d : today;
  const dentistId = clinic.dentists.some((d) => d.id === p.dentist) ? p.dentist : undefined;
  const cal = await schedule(sb, clinic, { view, date, dentistId });
  const setup = deskSetup(clinic);
  const step = view === "week" ? 7 : 1;
  const base = new URLSearchParams({ v: view, d: date, ...(dentistId ? { dentist: dentistId } : {}) }).toString();

  const v = p.a ? cal.rows.find((r) => r.id === p.a) : undefined;
  const title = view === "week" ? `Week of ${fmt(SHORT, weekStart(date))}` : fmt(FULL, date);

  return (
    <>
      <PageHeader title={<>Calendar <span className="ms-1 font-normal text-muted-foreground max-sm:hidden">{title}</span></>}>
        <span className="text-xs text-muted-foreground max-md:hidden">{cal.blocks.length} visits</span>
        <NewBooking setup={setup} />
      </PageHeader>
      <PageBody>
        <Toolbar view={view} date={date} prev={addDays(date, -step)} next={addDays(date, step)} today={today} dentist={dentistId} dentists={setup.dentists} />
        <Schedule columns={cal.columns} blocks={cal.blocks} off={cal.off} range={cal.range} now={cal.now} linkBase={base} setup={setup} />
      </PageBody>
      {v && (
        <VisitSheet
          key={v.id}
          closeHref={`?${base}`}
          setup={setup}
          visit={{
            id: v.id, patient: who(v.patients), patientId: v.patient_id, service: v.service, serviceId: v.service_id,
            dentist: setup.dentists.length > 1 ? clinic.dentists.find((d) => d.id === v.dentist_id)?.name ?? null : null,
            day: fmt(FULL, localDate(new Date(v.starts_at), off)),
            time: `${localTime(new Date(v.starts_at), off)} to ${localTime(new Date(v.ends_at), off)}`,
            status: v.status, channel: v.patients?.wa_id ? "WhatsApp" : "Website", source: v.source,
          }}
        />
      )}
    </>
  );
}
