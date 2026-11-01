"use client";

// Owner setup forms. `edit` false = staff: everything shows, nothing saves.
import { useState, useTransition } from "react";
import Link from "next/link";
import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Hours } from "@/lib/slots";
import { cn } from "@/lib/utils";
import { deleteTimeOff, resetTestChats, saveBranding, saveClinic, saveDentist, saveService, saveTimeOff, type Clash, type SaveResult } from "./actions";

type Svc = { id: string; name: string; name_ar: string | null; minutes: number; price_aed: number | null; active: boolean };
type Den = { id: string; name: string; name_ar: string | null; title: string | null; color: string; hours: Hours; active: boolean; service_ids: string[] };

const WEEK = [["sat", "Sat"], ["sun", "Sun"], ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"]] as const;
const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });

// Save with pending + error + clash handling shared by every form.
function useSave() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [found, setFound] = useState<Clash[]>([]);
  const run = (fn: () => Promise<SaveResult>, after?: () => void) => start(async () => {
    setError(null);
    setSaved(false);
    const r = await fn();
    if (r.error) return setError(r.error);
    setSaved(true);
    if (r.clashes?.length) setFound(r.clashes);
    after?.();
  });
  const status = (
    <>
      {error && <p role="alert" className="text-sm text-alert">{error}</p>}
      {saved && !error && <p role="status" className="text-sm text-muted-foreground">Saved. Sara uses it within a minute.</p>}
      <ClashDialog clashes={found} onClose={() => setFound([])} />
    </>
  );
  return { pending, run, status };
}

// Saves already happened; this lists booked visits that no longer fit, each opening its calendar sheet (Move / Cancel).
function ClashDialog({ clashes, onClose }: { clashes: Clash[]; onClose: () => void }) {
  return (
    <Dialog open={clashes.length > 0} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{clashes.length} booked {clashes.length === 1 ? "visit no longer fits" : "visits no longer fit"}</DialogTitle>
          <DialogDescription>The change is saved. Move or cancel these visits so nobody turns up to a closed chair.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
          {clashes.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0"><span className="block truncate font-medium">{c.patient ?? "Patient"} · {c.service}</span><span className="text-xs text-muted-foreground">{WHEN.format(new Date(c.starts_at))}</span></span>
              <Button size="sm" variant="outline" asChild><Link href={`/dashboard/calendar?d=${c.starts_at.slice(0, 10)}&a=${c.id}`}>Move / cancel</Link></Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function HoursEditor({ value, onChange, disabled }: { value: Hours; onChange: (h: Hours) => void; disabled?: boolean }) {
  const set = (day: string, wins: [string, string][]) => onChange({ ...value, [day]: wins.length ? wins : undefined });
  return (
    <div className="grid gap-1.5">
      {WEEK.map(([day, label]) => {
        const wins = value[day] ?? [];
        return (
          <div key={day} className="flex min-h-9 flex-wrap items-center gap-2">
            <Switch checked={wins.length > 0} disabled={disabled} onCheckedChange={(on) => set(day, on ? [["09:00", "17:00"]] : [])} aria-label={`Open on ${label}`} />
            <span className="w-9 text-sm">{label}</span>
            {wins.length === 0 && <span className="text-sm text-muted-foreground">Closed</span>}
            {wins.map(([a, b], i) => (
              <span key={i} className="flex items-center gap-1">
                <Input type="time" step={900} value={a} disabled={disabled} className="h-8 w-[6.5rem]" aria-label={`${label} from`} onChange={(e) => set(day, wins.map((w, j) => (j === i ? [e.target.value, w[1]] : w)))} />
                <span className="text-muted-foreground">to</span>
                <Input type="time" step={900} value={b} disabled={disabled} className="h-8 w-[6.5rem]" aria-label={`${label} to`} onChange={(e) => set(day, wins.map((w, j) => (j === i ? [w[0], e.target.value] : w)))} />
                {!disabled && i > 0 && <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Remove window" onClick={() => set(day, wins.filter((_, j) => j !== i))}><XIcon /></Button>}
              </span>
            ))}
            {!disabled && wins.length === 1 && <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => set(day, [...wins, ["17:00", "21:00"]])}>Split shift</Button>}
          </div>
        );
      })}
    </div>
  );
}

const Field = ({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) => (
  <div className="grid gap-1.5"><Label htmlFor={id}>{label}{hint && <span className="font-normal text-muted-foreground"> {hint}</span>}</Label>{children}</div>
);

export function ClinicForm({ clinic, edit }: { clinic: { name: string; phone: string | null; address: string | null; maps_url: string | null; hours: Hours; insurers: string[]; faq: { q: string; a: string }[] }; edit: boolean }) {
  const [v, setV] = useState({ ...clinic, phone: clinic.phone ?? "", address: clinic.address ?? "", maps_url: clinic.maps_url ?? "", insurers: clinic.insurers.join(", ") });
  const { pending, run, status } = useSave();
  const up = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid max-w-4xl gap-6 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => saveClinic({ ...v, insurers: v.insurers.split(",") })); }}>
      <fieldset disabled={!edit} className="grid content-start gap-3">
        <Field id="c-name" label="Clinic name"><Input id="c-name" value={v.name} onChange={up("name")} /></Field>
        <Field id="c-phone" label="Phone"><Input id="c-phone" value={v.phone} onChange={up("phone")} /></Field>
        <Field id="c-address" label="Address"><Input id="c-address" value={v.address} onChange={up("address")} /></Field>
        <Field id="c-maps" label="Maps link"><Input id="c-maps" value={v.maps_url} onChange={up("maps_url")} /></Field>
        <Field id="c-ins" label="Insurers accepted" hint="comma separated"><Input id="c-ins" value={v.insurers} onChange={up("insurers")} /></Field>
      </fieldset>
      <div className="grid content-start gap-3">
        <Label>Opening hours</Label>
        <HoursEditor value={v.hours} onChange={(hours) => setV({ ...v, hours })} disabled={!edit} />
      </div>
      <fieldset disabled={!edit} className="grid gap-2 lg:col-span-2">
        <Label>FAQ <span className="font-normal text-muted-foreground">Sara answers from these</span></Label>
        {v.faq.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_2fr_auto]">
            <Input value={f.q} placeholder="Question" aria-label="Question" onChange={(e) => setV({ ...v, faq: v.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
            <Textarea value={f.a} placeholder="Answer" aria-label="Answer" rows={1} className="min-h-9" onChange={(e) => setV({ ...v, faq: v.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
            {edit && <Button type="button" size="icon" variant="ghost" aria-label="Remove question" onClick={() => setV({ ...v, faq: v.faq.filter((_, j) => j !== i) })}><Trash2Icon /></Button>}
          </div>
        ))}
        {edit && <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setV({ ...v, faq: [...v.faq, { q: "", a: "" }] })}><PlusIcon />Add question</Button>}
      </fieldset>
      {edit && <div className="flex items-center gap-3 lg:col-span-2"><Button disabled={pending}>{pending ? "Saving…" : "Save clinic"}</Button>{status}</div>}
    </form>
  );
}

export function ServicesTab({ services, dentists, edit }: { services: Svc[]; dentists: Den[]; edit: boolean }) {
  const [open, setOpen] = useState<Svc | "new" | null>(null);
  const who = (id: string) => dentists.filter((d) => d.service_ids.includes(id)).map((d) => d.name).join(", ");
  return (
    <div className="grid gap-3">
      {edit && <Button size="sm" className="justify-self-start" onClick={() => setOpen("new")}><PlusIcon />Add service</Button>}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader><TableRow><TableHead className="ps-4">Service</TableHead><TableHead>Minutes</TableHead><TableHead>Price</TableHead><TableHead className="max-md:hidden">Dentists</TableHead><TableHead className="pe-4">Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {services.map((s) => (
              <TableRow key={s.id} className={cn(!s.active && "text-muted-foreground")}>
                <TableCell className="ps-4"><span className="font-medium">{s.name}</span>{s.name_ar && <span dir="rtl" className="ms-2 text-muted-foreground">{s.name_ar}</span>}</TableCell>
                <TableCell className="tabular-nums">{s.minutes}</TableCell>
                <TableCell className="font-mono tabular-nums">{s.price_aed != null ? `AED ${s.price_aed}` : ""}</TableCell>
                <TableCell className="max-md:hidden">{who(s.id) || <span className="text-alert">Nobody</span>}</TableCell>
                <TableCell className="pe-4">
                  <span className="flex items-center justify-between gap-2">{s.active ? "Offered" : "Hidden"}{edit && <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit ${s.name}`} onClick={() => setOpen(s)}><PencilIcon /></Button>}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {open && <ServiceDialog key={open === "new" ? "new" : open.id} service={open === "new" ? null : open} dentists={dentists} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ServiceDialog({ service, dentists, onClose }: { service: Svc | null; dentists: Den[]; onClose: () => void }) {
  const [v, setV] = useState({ name: service?.name ?? "", name_ar: service?.name_ar ?? "", minutes: service?.minutes ?? 30, price: service?.price_aed?.toString() ?? "", active: service?.active ?? true });
  const [ids, setIds] = useState(service ? dentists.filter((d) => d.service_ids.includes(service.id)).map((d) => d.id) : dentists.map((d) => d.id));
  const { pending, run, status } = useSave();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{service ? "Edit service" : "New service"}</DialogTitle><DialogDescription>Sara offers it only with the dentists ticked here.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveService({ id: service?.id, name: v.name, name_ar: v.name_ar, minutes: Number(v.minutes), price_aed: v.price === "" ? null : Number(v.price), active: v.active, dentistIds: ids }), onClose); }}>
          <div className="grid grid-cols-2 gap-2">
            <Field id="s-name" label="Name"><Input id="s-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
            <Field id="s-ar" label="Arabic name"><Input id="s-ar" dir="rtl" value={v.name_ar} onChange={(e) => setV({ ...v, name_ar: e.target.value })} /></Field>
            <Field id="s-min" label="Minutes"><Input id="s-min" type="number" min={5} max={480} step={5} value={v.minutes} onChange={(e) => setV({ ...v, minutes: Number(e.target.value) })} /></Field>
            <Field id="s-price" label="Price (AED)"><Input id="s-price" type="number" min={0} value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} /></Field>
          </div>
          <div className="grid gap-1.5">
            <Label>Dentists</Label>
            {dentists.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm"><Checkbox checked={ids.includes(d.id)} onCheckedChange={(on) => setIds(on ? [...ids, d.id] : ids.filter((x) => x !== d.id))} />{d.name}</label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={v.active} onCheckedChange={(active) => setV({ ...v, active })} />Offered to patients</label>
          {status}
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DentistsTab({ dentists, services, edit, clinicHours }: { dentists: Den[]; services: Svc[]; edit: boolean; clinicHours: Hours }) {
  const [open, setOpen] = useState<Den | "new" | null>(null);
  return (
    <div className="grid gap-3">
      {edit && <Button size="sm" className="justify-self-start" onClick={() => setOpen("new")}><PlusIcon />Add dentist</Button>}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {dentists.map((d) => (
          <li key={d.id} className={cn("flex items-start gap-3 rounded-xl border bg-card p-3", !d.active && "opacity-60")}>
            <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{d.name}</span>
              <span className="block text-xs text-muted-foreground">{d.title}{!d.active && " · not taking bookings"}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{WEEK.filter(([k]) => d.hours[k]?.length).map(([, l]) => l).join(", ") || "No hours set"}</span>
              <span className="mt-1 block truncate text-xs">{services.filter((s) => d.service_ids.includes(s.id)).map((s) => s.name).join(", ")}</span>
            </span>
            {edit && <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit ${d.name}`} onClick={() => setOpen(d)}><PencilIcon /></Button>}
          </li>
        ))}
      </ul>
      {open && <DentistDialog key={open === "new" ? "new" : open.id} dentist={open === "new" ? null : open} services={services} clinicHours={clinicHours} onClose={() => setOpen(null)} />}
    </div>
  );
}

function DentistDialog({ dentist, services, clinicHours, onClose }: { dentist: Den | null; services: Svc[]; clinicHours: Hours; onClose: () => void }) {
  const [v, setV] = useState({ name: dentist?.name ?? "", name_ar: dentist?.name_ar ?? "", title: dentist?.title ?? "", color: dentist?.color ?? "#6b8f71", active: dentist?.active ?? true });
  const [hours, setHours] = useState<Hours>(dentist?.hours ?? clinicHours);
  const [ids, setIds] = useState(dentist?.service_ids ?? []);
  const { pending, run, status } = useSave();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{dentist ? "Edit dentist" : "New dentist"}</DialogTitle><DialogDescription>Working hours must sit inside the clinic&apos;s opening hours.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveDentist({ id: dentist?.id, ...v, hours, serviceIds: ids })); }}>
          <div className="grid grid-cols-2 gap-2">
            <Field id="d-name" label="Name"><Input id="d-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
            <Field id="d-ar" label="Arabic name"><Input id="d-ar" dir="rtl" value={v.name_ar} onChange={(e) => setV({ ...v, name_ar: e.target.value })} /></Field>
            <Field id="d-title" label="Title"><Input id="d-title" value={v.title} placeholder="Orthodontist" onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
            <Field id="d-color" label="Calendar colour"><Input id="d-color" type="color" value={v.color} className="h-9 p-1" onChange={(e) => setV({ ...v, color: e.target.value })} /></Field>
          </div>
          <div className="grid gap-1.5"><Label>Working hours</Label><HoursEditor value={hours} onChange={setHours} /></div>
          <div className="grid gap-1.5">
            <Label>Services</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {services.filter((s) => s.active).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm"><Checkbox checked={ids.includes(s.id)} onCheckedChange={(on) => setIds(on ? [...ids, s.id] : ids.filter((x) => x !== s.id))} />{s.name}</label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={v.active} onCheckedChange={(active) => setV({ ...v, active })} />Taking bookings</label>
          {status}
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TimeOffTab({ rows, dentists, edit, today }: { rows: { id: string; dentist_id: string; starts_at: string; ends_at: string; reason: string | null }[]; dentists: Den[]; edit: boolean; today: string }) {
  const [v, setV] = useState({ dentistId: dentists[0]?.id ?? "", from: today, to: today, reason: "" });
  const { pending, run, status } = useSave();
  const DATE = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Dubai" });
  return (
    <div className="grid max-w-3xl gap-4">
      {edit && (
        <form className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1.2fr_1fr_1fr_1.2fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); run(() => saveTimeOff(v)); }}>
          <Field id="t-d" label="Dentist">
            <Select value={v.dentistId} onValueChange={(dentistId) => setV({ ...v, dentistId })}>
              <SelectTrigger id="t-d" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{dentists.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="t-from" label="From"><Input id="t-from" type="date" min={today} value={v.from} onChange={(e) => setV({ ...v, from: e.target.value, to: e.target.value > v.to ? e.target.value : v.to })} /></Field>
          <Field id="t-to" label="To"><Input id="t-to" type="date" min={v.from} value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} /></Field>
          <Field id="t-r" label="Reason"><Input id="t-r" value={v.reason} placeholder="Leave" onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field>
          <Button disabled={pending}>Add</Button>
        </form>
      )}
      {status}
      <ul className="divide-y rounded-xl border text-sm">
        {rows.length === 0 && <li className="px-3 py-2 text-muted-foreground">No time off coming up.</li>}
        {rows.map((t) => {
          const d = dentists.find((x) => x.id === t.dentist_id);
          const last = new Date(Date.parse(t.ends_at) - 1);
          return (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: d?.color }} />
              <span className="min-w-0 flex-1"><span className="font-medium">{d?.name}</span> <span className="text-muted-foreground">· {DATE.format(new Date(t.starts_at))}{DATE.format(last) !== DATE.format(new Date(t.starts_at)) && ` to ${DATE.format(last)}`}{t.reason && ` · ${t.reason}`}</span></span>
              {edit && <Button size="icon" variant="ghost" className="size-8" aria-label="Remove time off" disabled={pending} onClick={() => run(() => deleteTimeOff(t.id))}><Trash2Icon /></Button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function WidgetForm({ branding, slug, edit }: { branding: { accent?: string; logo?: string }; slug: string; edit: boolean }) {
  const [v, setV] = useState({ accent: branding.accent ?? "", logo: branding.logo ?? "" });
  const { pending, run, status } = useSave();
  return (
    <form className="grid max-w-md gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveBranding(v)); }}>
      <fieldset disabled={!edit} className="grid gap-3">
        <Field id="w-accent" label="Accent colour" hint="buttons and patient bubbles">
          <div className="flex gap-2">
            <Input type="color" aria-label="Pick accent" value={v.accent || "#6b8f71"} className="h-9 w-12 p-1" onChange={(e) => setV({ ...v, accent: e.target.value })} />
            <Input id="w-accent" value={v.accent} placeholder="#2f6f5e" className="font-mono" onChange={(e) => setV({ ...v, accent: e.target.value })} />
          </div>
        </Field>
        <Field id="w-logo" label="Logo link" hint="https, optional"><Input id="w-logo" value={v.logo} placeholder="https://…" onChange={(e) => setV({ ...v, logo: e.target.value })} /></Field>
      </fieldset>
      <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
        <span className="rounded-md px-3 py-1.5 font-medium text-white" style={{ background: v.accent || "var(--primary)" }}>Book a visit</span>
        <Link href={`/chat/${slug}?test=1`} target="_blank" className="ms-auto text-muted-foreground underline underline-offset-2 hover:text-foreground">Open the chat (test mode)</Link>
      </div>
      {edit && <div className="flex items-center gap-3"><Button disabled={pending}>{pending ? "Saving…" : "Save widget"}</Button>{status}</div>}
      {edit && (
        <div className="grid gap-1 border-t pt-3 text-sm">
          <p className="text-muted-foreground">Chats opened with test mode are marked as test data. Reset deletes them, with their visits and messages.</p>
          <Button type="button" variant="outline" className="w-fit" disabled={pending} onClick={() => confirm("Delete all test chats, visits and messages?") && run(() => resetTestChats())}>Reset test chats</Button>
        </div>
      )}
    </form>
  );
}
