import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { stillPaused } from "@/lib/agent";
import { deskConfig } from "@/lib/clinics";
import { desk, deskSetup, who } from "@/lib/dashboard";
import { localDate, localTime } from "@/lib/slots";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "../page-frame";
import { BookFor } from "../schedule";
import { Thread, type ThreadMsg } from "../thread";
import { ReplyBox } from "./reply-box";

export const metadata = { title: "Inbox" };

type Channel = "whatsapp" | "web" | "voice";
type Row = { patient_id: string; name: string | null; phone: string | null; wa_id: string | null; channel: Channel; role: ThreadMsg["role"]; body: string; created_at: string; last_id: number; bot_paused: boolean | null; updated_at: string | null };
const TABS = [
  { f: undefined, label: "All" },
  { f: "staff", label: "Needs staff" },
  { f: "whatsapp", label: "WhatsApp" },
  { f: "web", label: "Website" },
  { f: "test", label: "Test" },
] as const;
const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function Inbox({ searchParams }: PageProps<"/dashboard/inbox">) {
  const { sb, clinic: picked } = await desk();
  if (!picked) return null;
  const { p, f } = (await searchParams) as { p?: string; f?: string };

  const threadOf = (id: string) => sb.from("messages").select("id, role, body, created_at").eq("patient_id", id).order("id", { ascending: false }).limit(200);
  // One row per patient, newest first (inbox_list, RLS applies). When a chat is picked, its thread loads alongside.
  const [{ data: rows, error }, pickedThread, clinic, { data: tests }] = await Promise.all([
    sb.rpc("inbox_list", { clinic: picked.id }), p ? threadOf(p) : null, deskConfig(sb, picked.id),
    sb.from("patients").select("id").eq("clinic_id", picked.id).eq("is_test", true), // inbox_list has no is_test column; no rows if 0008 is not applied
  ]);
  if (error) throw error; // an empty inbox must never hide a failed load
  const off = clinic.utc_offset_minutes;
  const testIds = new Set((tests ?? []).map((t) => t.id as string));
  const all = (rows ?? []) as Row[];
  const waiting = new Set(all.filter((r) => !testIds.has(r.patient_id) && stillPaused(r.updated_at ? { bot_paused: !!r.bot_paused, updated_at: r.updated_at } : null)).map((r) => r.patient_id));
  const list = all.filter((r) => (f === "test" ? testIds.has(r.patient_id) : !testIds.has(r.patient_id) && (f === "staff" ? waiting.has(r.patient_id) : f === "whatsapp" ? r.channel === "whatsapp" : f === "web" ? r.channel !== "whatsapp" : true)));
  const current = all.find((r) => r.patient_id === p) ?? list[0];
  const open = current?.patient_id;

  const [{ data: thread }, { data: upcoming }, { data: person }, { data: handoffs }] = open
    ? await Promise.all([
        open === p && pickedThread ? pickedThread : threadOf(open),
        sb.from("appointments").select("id, service, starts_at, dentist_id").eq("patient_id", open).eq("status", "booked").gt("starts_at", new Date().toISOString()).order("starts_at").limit(5),
        sb.from("patients").select("tags, notes").eq("id", open).maybeSingle(),
        sb.from("agent_events").select("summary, created_at").eq("patient_id", open).eq("kind", "handoff").order("created_at", { ascending: false }).limit(1),
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }];
  const time = (iso: string) => localTime(new Date(iso), off);
  const lines = (thread ?? []).reverse().map((m) => ({ ...m, time: time(m.created_at) })) as ThreadMsg[];
  const isPaused = !!current && stillPaused(current.updated_at ? { bot_paused: !!current.bot_paused, updated_at: current.updated_at } : null);
  // Sara's latest ask for help, only while no staff message has followed it.
  const lastStaff = (thread ?? []).find((m) => m.role === "staff")?.created_at; // thread is newest first here
  const ask = handoffs?.[0];
  const handoff = ask && (!lastStaff || ask.created_at > lastStaff) ? ask.summary.replace(/^[^:]*: /, "") : null;
  const href = (q: Record<string, string | undefined>) => `/dashboard/inbox?${new URLSearchParams(Object.entries({ f, ...q }).filter((e): e is [string, string] => !!e[1]))}`;
  const multi = clinic.dentists.filter((d) => d.active).length > 1;

  return (
    <>
      <PageHeader title="Inbox" />
      <PageBody className="grid grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_280px]">
        {/* List: hidden on phones while a chat is open. */}
        <div className={cn("flex min-h-0 flex-col border-e", p && "max-lg:hidden")}>
          <nav className="flex shrink-0 flex-wrap gap-1 border-b px-2 py-2" aria-label="Filter">
            {TABS.map((t) => (
              <Link key={t.label} href={href({ f: t.f, p: undefined })} aria-current={f === t.f ? "true" : undefined}
                className={cn("shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted", f === t.f && "bg-muted text-foreground")}>
                {t.label}{t.f === "staff" && waiting.size > 0 && <span className="ms-1 text-alert">{waiting.size}</span>}
              </Link>
            ))}
          </nav>
          <ScrollArea className="min-h-0 flex-1">
            <ul className="divide-y">
              {list.length === 0 && <li className="p-4 text-sm text-muted-foreground">{f === "staff" ? "Nobody is waiting for staff." : f === "test" ? "No test chats. Try Test Sara in the sidebar." : "No chats here."}</li>}
              {list.map((m) => (
                <li key={m.patient_id}>
                  <Link href={href({ p: m.patient_id })} aria-current={m.patient_id === open ? "true" : undefined}
                    className={cn("grid gap-0.5 px-3 py-2.5 hover:bg-muted/60", m.patient_id === open && "bg-muted")}>
                    <span className="flex items-center gap-2">
                      {waiting.has(m.patient_id) && <span className="size-2 shrink-0 rounded-full bg-alert" aria-label="Needs staff" />}
                      <span className="truncate text-sm font-medium">{who(m)}</span>
                      <span className="ms-auto shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{time(m.created_at)}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ChannelTag channel={m.channel} />
                      <span dir="auto" className="truncate">{m.body}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>

        {current ? (
          <>
            <section className={cn("flex min-h-0 flex-col", !p && "max-lg:hidden")}>
              <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
                <Button variant="ghost" size="icon" asChild className="lg:hidden"><Link href={href({ p: undefined })} aria-label="All chats"><ArrowLeftIcon /></Link></Button>
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/patients/${current.patient_id}`} className="block truncate text-sm font-semibold hover:underline">{who(current)}</Link>
                  <span className="block truncate text-xs text-muted-foreground">{current.wa_id ? `WhatsApp · +${current.wa_id.replace(/@.*/, "")}` : `Website${current.phone ? ` · ${current.phone}` : ""}`}{isPaused ? " · staff have this chat" : " · Sara is answering"}</span>
                </div>
              </header>
              <div aria-live="polite" className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
                <Thread lines={lines} />
              </div>
              <footer className="shrink-0 border-t p-3">
                <ReplyBox patientId={current.patient_id} paused={isPaused} handoff={handoff} channel={current.wa_id ? "WhatsApp" : "the website chat"} />
              </footer>
            </section>

            <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-s p-4 max-xl:hidden">
              <div>
                <h2 className="text-sm font-semibold">Upcoming visits</h2>
                <ul className="mt-2 grid gap-2 text-sm">
                  {(upcoming ?? []).length === 0 && <li className="text-muted-foreground">None booked.</li>}
                  {(upcoming ?? []).map((v) => {
                    const s = new Date(v.starts_at);
                    return (
                      <li key={v.id}>
                        <Link href={`/dashboard/calendar?d=${localDate(s, off)}&a=${v.id}`} className="block rounded-lg border px-3 py-2 hover:bg-muted">
                          <span className="block font-medium">{v.service}</span>
                          <span className="block text-xs text-muted-foreground">
                            {DAY.format(new Date(`${localDate(s, off)}T00:00:00Z`))} · {localTime(s, off)}
                            {multi && ` · ${clinic.dentists.find((d) => d.id === v.dentist_id)?.name ?? ""}`}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2"><BookFor setup={deskSetup(clinic)} patient={{ id: current.patient_id, name: current.name }} variant="outline" /></div>
              </div>
              {(person?.tags ?? []).length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold">Tags</h2>
                  <div className="mt-2 flex flex-wrap gap-1">{(person!.tags as string[]).map((t) => <span key={t} className="rounded-full border px-2 py-0.5 text-xs">{t}</span>)}</div>
                </div>
              )}
              {person?.notes && (
                <div>
                  <h2 className="text-sm font-semibold">Staff notes</h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{person.notes}</p>
                </div>
              )}
              <Link href={`/dashboard/patients/${current.patient_id}`} className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">Open profile</Link>
            </aside>
          </>
        ) : (
          <p className="p-6 text-sm text-muted-foreground max-lg:hidden">No chat picked.</p>
        )}
      </PageBody>
    </>
  );
}

const ChannelTag = ({ channel }: { channel: Channel }) => (
  <span className={cn("shrink-0 rounded px-1.5 py-px text-[10.5px] font-medium text-foreground", channel === "whatsapp" ? "bg-sage-soft" : "bg-web-soft")}>
    {channel === "whatsapp" ? "WhatsApp" : channel === "voice" ? "Call" : "Website"}
  </span>
);
