import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { desk, who } from "@/lib/dashboard";
import { localDate } from "@/lib/slots";
import { PageBody, PageHeader } from "../page-frame";
import { AddPatientDialog } from "../booking-dialog";

export const metadata = { title: "Patients" };

type Row = { id: string; name: string | null; phone: string | null; wa_id: string | null; web_visitor_id: string | null; tags: string[]; opted_out: boolean };
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function Patients({ searchParams }: PageProps<"/dashboard/patients">) {
  const { sb, clinic } = await desk();
  if (!clinic) return null;
  const { q = "", tag } = (await searchParams) as { q?: string; tag?: string };
  // Commas and brackets would break the PostgREST "or" filter, so they are dropped from the search.
  const term = q.replace(/[,()*%]/g, " ").trim();

  let query = sb.from("patients").select("id, name, phone, wa_id, web_visitor_id, tags, opted_out").eq("clinic_id", clinic.id).eq("is_test", false).order("created_at", { ascending: false }).limit(200);
  if (term) query = query.or(`name.ilike.*${term}*,phone.ilike.*${term}*,wa_id.ilike.*${term}*`);
  if (tag) query = query.contains("tags", [tag]);
  const [{ data }, { data: tagRows }] = await Promise.all([query, sb.from("patients").select("tags").eq("clinic_id", clinic.id).eq("is_test", false).not("tags", "eq", "{}").limit(500)]);
  const rows = (data ?? []) as Row[];
  const tags = [...new Set((tagRows ?? []).flatMap((r) => r.tags as string[]))].sort();

  // Last and next visit per listed patient, in one query.
  const { data: visits } = rows.length
    ? await sb.from("appointments").select("patient_id, starts_at, status").in("patient_id", rows.map((r) => r.id)).neq("status", "cancelled").order("starts_at")
    : { data: [] };
  const now = new Date().toISOString();
  const last = new Map<string, string>();
  const next = new Map<string, string>();
  for (const v of visits ?? []) {
    if (v.starts_at < now && v.status === "completed") last.set(v.patient_id, v.starts_at);
    if (v.starts_at >= now && v.status === "booked" && !next.has(v.patient_id)) next.set(v.patient_id, v.starts_at);
  }
  const day = (iso?: string) => (iso ? DAY.format(new Date(`${localDate(new Date(iso), clinic.utc_offset_minutes)}T00:00:00Z`)) : "");
  const tagHref = (t?: string) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(t ? { tag: t } : {}) })}`;

  return (
    <>
      <PageHeader title="Patients">
        <AddPatientDialog />
      </PageHeader>
      <PageBody>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
          <form className="relative w-full sm:w-64" role="search">
            {tag && <input type="hidden" name="tag" value={tag} />}
            <SearchIcon className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Search name or phone" aria-label="Search patients" className="h-9 ps-8" />
          </form>
          {tags.length > 0 && (
            <div className="flex gap-1 overflow-x-auto">
              <Link href={tagHref()} className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${!tag ? "border-foreground" : "text-muted-foreground"}`}>All</Link>
              {tags.map((t) => <Link key={t} href={tagHref(t)} className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${tag === t ? "border-foreground" : "text-muted-foreground"}`}>{t}</Link>)}
            </div>
          )}
          <span className="ms-auto text-xs text-muted-foreground">{rows.length} shown</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="ps-4">Name</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="max-sm:hidden">Phone</TableHead>
                <TableHead className="max-md:hidden">Tags</TableHead>
                <TableHead className="max-lg:hidden">Last visit</TableHead>
                <TableHead className="pe-4">Next visit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="ps-4 py-6 text-muted-foreground">{term || tag ? "No patient matches." : "No patients yet."}</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="ps-4">
                    <Link href={`/dashboard/patients/${r.id}`} className="font-medium hover:underline">{who(r)}</Link>
                    {r.opted_out && <span className="ms-2 text-xs text-muted-foreground">opted out</span>}
                  </TableCell>
                  <TableCell>
                    <span className={`rounded px-1.5 py-px text-[11px] font-medium ${r.wa_id ? "bg-sage-soft" : r.web_visitor_id ? "bg-web-soft" : "bg-muted"}`}>
                      {r.wa_id ? "WhatsApp" : r.web_visitor_id ? "Website" : "Desk"}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-sm:hidden">{r.phone ?? (r.wa_id ? `+${r.wa_id.replace(/@.*/, "")}` : "")}</TableCell>
                  <TableCell className="max-md:hidden">
                    <span className="flex flex-wrap gap-1">{r.tags.map((t) => <Link key={t} href={tagHref(t)} className="rounded-full border px-2 py-0.5 text-xs hover:border-foreground">{t}</Link>)}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-lg:hidden">{day(last.get(r.id))}</TableCell>
                  <TableCell className="pe-4">{day(next.get(r.id))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PageBody>
    </>
  );
}
