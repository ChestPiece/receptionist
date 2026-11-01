import Link from "next/link";
import { notFound } from "next/navigation";
import { Line } from "@/components/ledger";
import { desk, who } from "@/lib/dashboard";
import { localDate, localTime } from "@/lib/slots";
import { PageBody, PageHeader } from "../../page-frame";
import { savePatient } from "../../actions";

export const metadata = { title: "Patient" };

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const STATUS: Record<string, string> = { booked: "Booked", completed: "Came in", no_show: "No-show", cancelled: "Cancelled" };
const SPEAKER = { patient: "Patient", assistant: "Sara", staff: "Staff", system: "Note" } as const;
const field = "h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function Patient({ params }: PageProps<"/dashboard/patients/[id]">) {
  const { sb, clinic } = await desk();
  if (!clinic) return null;
  const { id } = await params;
  const [{ data: p }, { data: visits }, { data: msgs }] = await Promise.all([
    sb.from("patients").select("id, clinic_id, name, phone, email, wa_id, notes, tags, opted_out, created_at").eq("id", id).maybeSingle(),
    sb.from("appointments").select("id, service, starts_at, status").eq("patient_id", id).order("starts_at", { ascending: false }).limit(50),
    sb.from("messages").select("id, role, body").eq("patient_id", id).order("id", { ascending: false }).limit(60),
  ]);
  if (!p || p.clinic_id !== clinic.id) notFound();
  const off = clinic.utc_offset_minutes;

  return (
    <>
      <PageHeader title={who(p)}>
        <Link href="/dashboard/patients" className="text-xs text-muted-foreground hover:text-foreground">← Patients</Link>
      </PageHeader>
      <PageBody className="overflow-y-auto p-3 sm:p-4">
      <p className="mb-3 text-sm text-muted-foreground">
        {p.wa_id ? `WhatsApp +${p.wa_id.replace(/@.*/, "")}` : "Website chat"}
        {p.opted_out && " · opted out of follow-ups (sent STOP)"}
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <div className="grid content-start gap-6">
          <form action={savePatient.bind(null, p.id)} className="slip grid gap-3 p-5">
            <h2 className="font-serif text-xl">Details</h2>
            <label className="grid gap-1 text-sm">Name<input name="name" defaultValue={p.name ?? ""} className={field} /></label>
            <label className="grid gap-1 text-sm">Phone<input name="phone" type="tel" defaultValue={p.phone ?? ""} className={`${field} font-mono`} /></label>
            <label className="grid gap-1 text-sm">Email<input name="email" type="email" defaultValue={p.email ?? ""} className={field} /></label>
            <label className="grid gap-1 text-sm">
              Tags <span className="text-xs text-muted-foreground">comma separated, e.g. vip, aligners</span>
              <input name="tags" defaultValue={(p.tags ?? []).join(", ")} className={field} />
            </label>
            <label className="grid gap-1 text-sm">
              Staff notes <span className="text-xs text-muted-foreground">front desk only, Sara never sees these</span>
              <textarea name="notes" rows={4} defaultValue={p.notes ?? ""} className={`${field} h-auto py-2`} />
            </label>
            <button className="h-10 justify-self-start rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground">Save</button>
          </form>

          <section className="slip p-5">
            <h2 className="font-serif text-xl">Visits</h2>
            <ul className="mt-3 divide-y divide-dashed text-sm">
              {(visits ?? []).length === 0 && <li className="py-2 text-muted-foreground">No visits yet.</li>}
              {(visits ?? []).map((v) => {
                const s = new Date(v.starts_at);
                return (
                  <li key={v.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span>
                      {v.service}
                      <span className="block font-mono text-xs text-muted-foreground">{DAY.format(new Date(`${localDate(s, off)}T00:00:00Z`))} · {localTime(s, off)}</span>
                    </span>
                    <span className={v.status === "no_show" ? "text-alert" : "text-muted-foreground"}>{STATUS[v.status] ?? v.status}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <section className="slip relative flex flex-col p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl">Conversation</h2>
            <Link href={`/dashboard/inbox?p=${p.id}`} className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">Open in inbox</Link>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {(msgs ?? []).length === 0 && <p className="text-sm text-muted-foreground">No messages.</p>}
            {(msgs ?? []).reverse().map((m) => (
              <Line key={m.id} role={m.role} who={SPEAKER[m.role as keyof typeof SPEAKER]}>{m.body}</Line>
            ))}
          </div>
        </section>
      </div>
      </PageBody>
    </>
  );
}
