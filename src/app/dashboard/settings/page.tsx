import Link from "next/link";
import { desk } from "@/lib/dashboard";
import { localDate, type Hours } from "@/lib/slots";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "../page-frame";
import { DataTab } from "./data-tab";
import { ClinicForm, DentistsTab, ServicesTab, TimeOffTab, WidgetForm } from "./forms";

export const metadata = { title: "Settings" };

const TABS = [
  { t: "clinic", label: "Clinic" },
  { t: "services", label: "Services" },
  { t: "dentists", label: "Dentists" },
  { t: "timeoff", label: "Time off" },
  { t: "widget", label: "Chat widget" },
  { t: "data", label: "Data", owner: true },
] as const;

// Row counts per category for the Data tab (RLS: this clinic only). Conversations follow messages, so chats count messages.
async function dataCounts(sb: Awaited<ReturnType<typeof desk>>["sb"], clinicId: string) {
  const n = (table: string) => sb.from(table).select("*", { count: "exact", head: true }).eq("clinic_id", clinicId).then((r) => r.count ?? 0);
  const [patients, chats, calendar, dentists, services, activity] = await Promise.all(
    ["patients", "messages", "appointments", "dentists", "services", "agent_events"].map(n),
  );
  return { patients, chats, calendar, dentists, services, activity };
}

export default async function Settings({ searchParams }: PageProps<"/dashboard/settings">) {
  const { sb, clinic: picked } = await desk();
  if (!picked) return null;
  const { t = "clinic" } = (await searchParams) as { t?: string };
  const edit = picked.role === "owner";
  const now = new Date().toISOString();

  // Read straight from the tables (RLS), uncached, including hidden services and inactive dentists.
  const [{ data: c, error }, { data: services }, { data: dentists }, { data: off }] = await Promise.all([
    sb.from("clinics").select("name, slug, phone, address, maps_url, hours, insurers, faq, branding, utc_offset_minutes").eq("id", picked.id).single(),
    sb.from("services").select("id, name, name_ar, minutes, price_aed, active").eq("clinic_id", picked.id).order("sort").order("name"),
    sb.from("dentists").select("id, name, name_ar, title, color, hours, active, dentist_services(service_id)").eq("clinic_id", picked.id).order("sort").order("name"),
    sb.from("time_off").select("id, dentist_id, starts_at, ends_at, reason").eq("clinic_id", picked.id).gt("ends_at", now).order("starts_at"),
  ]);
  if (error) throw error;
  const counts = edit && t === "data" ? await dataCounts(sb, picked.id) : null;
  const dens = (dentists ?? []).map(({ dentist_services, ...d }) => ({ ...d, hours: (d.hours ?? {}) as Hours, service_ids: dentist_services.map((x) => x.service_id) }));
  const svcs = services ?? [];

  return (
    <>
      <PageHeader title="Settings">
        {!edit && <span className="text-xs text-muted-foreground">Read only. Ask the clinic owner to change these.</span>}
      </PageHeader>
      <PageBody className="flex-col">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-2 sm:px-4" aria-label="Settings sections">
          {TABS.filter((x) => edit || !("owner" in x)).map((x) => (
            <Link key={x.t} href={`?t=${x.t}`} aria-current={t === x.t ? "page" : undefined}
              className={cn("shrink-0 rounded-md px-2.5 py-1 text-sm font-medium text-muted-foreground hover:bg-muted", t === x.t && "bg-muted text-foreground")}>
              {x.label}
            </Link>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {t === "clinic" && <ClinicForm edit={edit} clinic={{ ...c, hours: (c.hours ?? {}) as Hours, insurers: c.insurers ?? [], faq: c.faq ?? [] }} />}
          {t === "services" && <ServicesTab edit={edit} services={svcs} dentists={dens} />}
          {t === "dentists" && <DentistsTab edit={edit} dentists={dens} services={svcs} clinicHours={(c.hours ?? {}) as Hours} />}
          {t === "timeoff" && <TimeOffTab edit={edit} rows={off ?? []} dentists={dens.filter((d) => d.active)} today={localDate(new Date(), c.utc_offset_minutes)} />}
          {counts && <DataTab clinicName={c.name} counts={counts} />}
          {t === "widget" && <WidgetForm edit={edit} branding={c.branding ?? {}} slug={c.slug ?? ""} />}
        </div>
      </PageBody>
    </>
  );
}
