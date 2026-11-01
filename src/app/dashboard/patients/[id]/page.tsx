import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deskConfig } from "@/lib/clinics";
import { desk, deskSetup, who } from "@/lib/dashboard";
import { localDate, localTime } from "@/lib/slots";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "../../page-frame";
import { BookFor } from "../../schedule";
import { Thread, type ThreadMsg } from "../../thread";
import { savePatient } from "../../actions";

export const metadata = { title: "Patient" };

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const STATUS: Record<string, string> = { booked: "Booked", completed: "Arrived", no_show: "No-show", cancelled: "Cancelled" };

export default async function Patient({ params }: PageProps<"/dashboard/patients/[id]">) {
  const { sb, clinic: picked } = await desk();
  if (!picked) return null;
  const { id } = await params;
  const [{ data: p }, { data: visits }, { data: msgs }, clinic] = await Promise.all([
    sb.from("patients").select("id, clinic_id, name, phone, email, wa_id, notes, tags, opted_out").eq("id", id).maybeSingle(),
    sb.from("appointments").select("id, service, starts_at, status, dentist_id").eq("patient_id", id).order("starts_at", { ascending: false }).limit(50),
    sb.from("messages").select("id, role, body, created_at").eq("patient_id", id).order("id", { ascending: false }).limit(60),
    deskConfig(sb, picked.id),
  ]);
  if (!p || p.clinic_id !== clinic.id) notFound();
  const off = clinic.utc_offset_minutes;
  const multi = clinic.dentists.filter((d) => d.active).length > 1;
  const lines = (msgs ?? []).reverse().map((m) => ({ ...m, time: localTime(new Date(m.created_at), off) })) as ThreadMsg[];
  const now = new Date().toISOString();

  return (
    <>
      <PageHeader title={who(p)}>
        <Button size="sm" variant="ghost" asChild className="max-sm:hidden"><Link href={`/dashboard/inbox?p=${p.id}`}>Open chat</Link></Button>
        <BookFor setup={deskSetup(clinic)} patient={{ id: p.id, name: p.name }} />
      </PageHeader>
      <PageBody className="grid grid-cols-1 overflow-y-auto lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        <div className="flex flex-col gap-4 border-e p-3 sm:p-4 lg:min-h-0 lg:overflow-y-auto">
          <form action={savePatient.bind(null, p.id)} className="grid gap-3">
            <p className="text-xs text-muted-foreground">
              {p.wa_id ? `WhatsApp +${p.wa_id.replace(/@.*/, "")}` : "Website chat"}{p.opted_out && " · opted out of follow-ups (sent STOP)"}
            </p>
            <div className="grid gap-1.5"><Label htmlFor="pf-name">Name</Label><Input id="pf-name" name="name" defaultValue={p.name ?? ""} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5"><Label htmlFor="pf-phone">Phone</Label><Input id="pf-phone" name="phone" type="tel" defaultValue={p.phone ?? ""} className="font-mono" /></div>
              <div className="grid gap-1.5"><Label htmlFor="pf-email">Email</Label><Input id="pf-email" name="email" type="email" defaultValue={p.email ?? ""} /></div>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="pf-tags">Tags <span className="font-normal text-muted-foreground">comma separated</span></Label><Input id="pf-tags" name="tags" defaultValue={(p.tags ?? []).join(", ")} /></div>
            <div className="grid gap-1.5"><Label htmlFor="pf-notes">Staff notes <span className="font-normal text-muted-foreground">Sara never sees these</span></Label><Textarea id="pf-notes" name="notes" rows={3} defaultValue={p.notes ?? ""} /></div>
            <Button size="sm" className="justify-self-start">Save</Button>
          </form>

          <section>
            <h2 className="text-sm font-semibold">Visits</h2>
            <ul className="mt-2 divide-y rounded-xl border text-sm">
              {(visits ?? []).length === 0 && <li className="px-3 py-2 text-muted-foreground">No visits yet.</li>}
              {(visits ?? []).map((v) => {
                const s = new Date(v.starts_at);
                const date = localDate(s, off);
                const live = v.status === "booked" && v.starts_at > now;
                return (
                  <li key={v.id}>
                    <Link href={`/dashboard/calendar?d=${date}&a=${v.id}`} className={cn("flex items-baseline justify-between gap-3 px-3 py-2 hover:bg-muted", !live && "text-muted-foreground")}>
                      <span className="min-w-0">
                        <span className={cn("block truncate", live && "font-medium text-foreground")}>{v.service}</span>
                        <span className="block font-mono text-xs">{DAY.format(new Date(`${date}T00:00:00Z`))} · {localTime(s, off)}{multi && ` · ${clinic.dentists.find((d) => d.id === v.dentist_id)?.name ?? ""}`}</span>
                      </span>
                      <span className={cn("shrink-0 text-xs", v.status === "no_show" && "text-alert")}>{live ? "Move / cancel" : STATUS[v.status] ?? v.status}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
        <section className="flex min-h-0 flex-col max-lg:min-h-96">
          <h2 className="flex h-11 shrink-0 items-center border-b px-4 text-sm font-semibold">Conversation</h2>
          <div className="min-h-0 flex-1 overflow-y-auto"><Thread lines={lines} /></div>
        </section>
      </PageBody>
    </>
  );
}
