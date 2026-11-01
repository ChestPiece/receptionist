import Link from "next/link";
import { desk, who } from "@/lib/dashboard";
import { PageBody, PageHeader } from "../page-frame";

export const metadata = { title: "Patients" };

type Row = { id: string; name: string | null; phone: string | null; wa_id: string | null; tags: string[]; opted_out: boolean; created_at: string };
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function Patients({ searchParams }: PageProps<"/dashboard/patients">) {
  const { sb, clinic } = await desk();
  if (!clinic) return null;
  const { q = "", tag } = (await searchParams) as { q?: string; tag?: string };
  // Commas and brackets would break the PostgREST "or" filter, so they are dropped from the search.
  const term = q.replace(/[,()*%]/g, " ").trim();

  let query = sb.from("patients").select("id, name, phone, wa_id, tags, opted_out, created_at").eq("clinic_id", clinic.id).order("created_at", { ascending: false }).limit(200);
  if (term) query = query.or(`name.ilike.*${term}*,phone.ilike.*${term}*,wa_id.ilike.*${term}*`);
  if (tag) query = query.contains("tags", [tag]);
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader title="Patients">
        <form className="flex gap-2" role="search">
          {tag && <input type="hidden" name="tag" value={tag} />}
          <label htmlFor="q" className="sr-only">Search patients</label>
          <input id="q" name="q" defaultValue={q} placeholder="Name or phone" className="h-9 w-40 rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56" />
          <button className="h-9 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground">Search</button>
        </form>
      </PageHeader>
      <PageBody className="overflow-y-auto p-3 sm:p-4">
      {tag && (
        <p className="pb-3 text-sm">
          Tagged <span className="font-mono">{tag}</span> · <Link href={`?q=${encodeURIComponent(q)}`} className="text-muted-foreground underline">clear</Link>
        </p>
      )}
      <div className="slip overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start">
              <th className="label px-4 py-3 text-start">Name</th>
              <th className="label px-4 py-3 text-start">Contact</th>
              <th className="label px-4 py-3 text-start max-sm:hidden">Tags</th>
              <th className="label px-4 py-3 text-start max-md:hidden">Since</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted-foreground">{term || tag ? "No patient matches." : "No patients yet."}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-rule/60">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/patients/${r.id}`} className="font-medium hover:underline">{who(r)}</Link>
                  {r.opted_out && <span className="ms-2 text-xs text-muted-foreground">opted out</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {r.wa_id ? <span className="me-2 rounded-[3px] bg-sage-soft px-1.5 py-px text-foreground">WA</span> : <span className="me-2 rounded-[3px] bg-web-soft px-1.5 py-px text-foreground">WEB</span>}
                  {r.phone ?? (r.wa_id ? `+${r.wa_id.replace(/@.*/, "")}` : "")}
                </td>
                <td className="px-4 py-3 max-sm:hidden">
                  <span className="flex flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <Link key={t} href={`?tag=${encodeURIComponent(t)}`} className="rounded-full border px-2 py-0.5 text-xs hover:border-foreground">{t}</Link>
                    ))}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground max-md:hidden">{DATE.format(new Date(r.created_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </PageBody>
    </>
  );
}
