import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { desk, who } from "@/lib/dashboard";
import { localDate, localTime } from "@/lib/slots";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "../page-frame";
import { SeenActivity } from "../shell";

export const metadata = { title: "Activity" };

const PAGE = 50;
const ACTORS = ["sara", "staff", "system", "reviewer"] as const;
const KINDS = ["booked", "moved", "cancelled", "book_failed", "confirmed", "handoff", "takeover", "handback", "staff_reply", "arrived", "no_show", "reminder", "followup"];
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
type Row = { id: string; actor: string; kind: string; level: string; summary: string; created_at: string; patient_id: string | null; patients: { name: string | null; phone: string | null; wa_id: string | null; is_test: boolean | null } | null };

export default async function Activity({ searchParams }: PageProps<"/dashboard/activity">) {
  const { sb, clinic } = await desk();
  if (!clinic) return null;
  const { actor, kind, warn, p, before } = (await searchParams) as { actor?: string; kind?: string; warn?: string; p?: string; before?: string };

  let q = sb.from("agent_events").select("id, actor, kind, level, summary, created_at, patient_id, patients(name, phone, wa_id, is_test)").eq("clinic_id", clinic.id).order("created_at", { ascending: false }).limit(PAGE + 1);
  if (actor) q = q.eq("actor", actor);
  if (kind) q = q.eq("kind", kind);
  if (warn) q = q.eq("level", "warn");
  if (p) q = q.eq("patient_id", p);
  if (before) q = q.lt("created_at", before); // ponytail: keyset on created_at alone, two events in the same microsecond could skip one at a page edge
  const { data, error } = await q; // before 0008 is pasted the table is missing: show the empty state instead of crashing
  const rows = (error ? [] : data ?? []) as unknown as Row[];
  const more = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);
  const off = clinic.utc_offset_minutes;
  const href = (o: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ actor, kind, warn, p, ...o }).filter((e): e is [string, string] => !!e[1]))}`;
  const chip = (on: boolean) => cn("shrink-0 rounded-full border px-2.5 py-1 text-xs", on ? "border-foreground" : "text-muted-foreground");

  return (
    <>
      <PageHeader title="Activity" />
      <SeenActivity />
      <PageBody>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
          <div className="flex gap-1 overflow-x-auto">
            <Link href={href({ actor: undefined, before: undefined })} className={chip(!actor)}>Everyone</Link>
            {ACTORS.map((a) => <Link key={a} href={href({ actor: a, before: undefined })} className={chip(actor === a)}>{a}</Link>)}
          </div>
          <Link href={href({ warn: warn ? undefined : "1", before: undefined })} className={chip(!!warn)}>Warnings only</Link>
          <form className="flex items-center gap-2">
            {actor && <input type="hidden" name="actor" value={actor} />}
            {warn && <input type="hidden" name="warn" value="1" />}
            {p && <input type="hidden" name="p" value={p} />}
            <select name="kind" defaultValue={kind ?? ""} aria-label="Kind" className="h-8 rounded-md border bg-background px-2 text-xs">
              <option value="">All kinds</option>
              {KINDS.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
            </select>
            <button className="h-8 rounded-md border px-2.5 text-xs">Filter</button>
          </form>
          {p && <Link href={href({ p: undefined, before: undefined })} className={chip(true)}>One patient · clear</Link>}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="ps-4">Time</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>What happened</TableHead>
                <TableHead className="pe-4 max-sm:hidden">Patient</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 && <TableRow><TableCell colSpan={4} className="ps-4 py-6 text-muted-foreground">{error ? "The activity log is not set up yet." : "Nothing here yet. Bookings, handoffs and reminders show up as they happen."}</TableCell></TableRow>}
              {shown.map((e) => {
                const at = new Date(e.created_at);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="ps-4 font-mono text-xs whitespace-nowrap text-muted-foreground">{DAY.format(new Date(`${localDate(at, off)}T00:00:00Z`))} {localTime(at, off)}</TableCell>
                    <TableCell><Badge variant={e.actor === "sara" ? "default" : e.actor === "reviewer" ? "destructive" : "secondary"}>{e.actor}</Badge></TableCell>
                    <TableCell className={cn("whitespace-normal", e.level === "warn" && "font-medium text-alert")}>{e.summary}</TableCell>
                    <TableCell className="pe-4 max-sm:hidden">
                      {e.patient_id && <Link href={`/dashboard/inbox?p=${e.patient_id}`} className="hover:underline">{who(e.patients)}{e.patients?.is_test && <span className="ms-1.5 rounded bg-muted px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">Test</span>}</Link>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {more && <div className="p-3 text-center"><Link href={href({ before: shown.at(-1)!.created_at })} className="text-sm text-muted-foreground hover:text-foreground">Older</Link></div>}
        </div>
      </PageBody>
    </>
  );
}
