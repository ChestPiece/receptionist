"use client";

// One dialog for booking a new visit and moving an existing one. Free times come from the same engine Sara uses.
import { useEffect, useState, useTransition } from "react";
import { CalendarIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Free } from "@/lib/booking";
import { cn } from "@/lib/utils";
import { addPatient, bookForPatient, freeTimes, moveForPatient, searchPatients } from "./actions";

export type DeskSetup = {
  today: string;
  services: { id: string; name: string; minutes: number }[];
  dentists: { id: string; name: string; color: string | null; service_ids: string[] }[];
};
export type Prefill = { dentistId?: string; date?: string; time?: string; patient?: { id: string; name: string | null } };
type Patient = { id: string; name: string | null; phone?: string | null };

const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function BookingDialog({ setup, open, onOpenChange, prefill, move }: {
  setup: DeskSetup; open: boolean; onOpenChange: (o: boolean) => void; prefill?: Prefill;
  move?: { id: string; serviceId: string | null; patient: string };
}) {
  const multi = setup.dentists.length > 1;
  const [patient, setPatient] = useState<Patient | null>(prefill?.patient ?? null);
  const [serviceId, setServiceId] = useState(move?.serviceId ?? "");
  const [dentistId, setDentistId] = useState(prefill?.dentistId ?? "any");
  const [date, setDate] = useState(prefill?.date ?? setup.today);
  const [time, setTime] = useState(prefill?.time ?? "");
  const [times, setTimes] = useState<Free[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Reset each time it opens, so a cell click always shows its own prefill.
  useEffect(() => {
    if (!open) return;
    setPatient(prefill?.patient ?? null);
    setServiceId(move?.serviceId ?? "");
    setDentistId(prefill?.dentistId ?? "any");
    setDate(prefill?.date ?? setup.today);
    setTime(prefill?.time ?? "");
    setError(null);
  }, [open, prefill, move, setup.today]);

  const dentists = setup.dentists.filter((d) => !serviceId || d.service_ids.includes(serviceId));
  const sid = serviceId || move?.serviceId;
  useEffect(() => {
    if (!open || !sid) return setTimes(null);
    let live = true;
    setTimes(null);
    freeTimes({ serviceId: sid, date, dentistId: dentistId === "any" ? null : dentistId, ignoreId: move?.id }).then((t) => live && setTimes(t));
    return () => { live = false; };
  }, [open, sid, date, dentistId, move?.id]);

  const ready = (move || patient) && sid && time && times?.some((t) => t.time === time);
  const submit = () => start(async () => {
    setError(null);
    const pick = dentistId === "any" ? null : dentistId;
    const r = move
      ? await moveForPatient({ id: move.id, date, time, dentistId: pick })
      : await bookForPatient({ patientId: patient!.id, serviceId: sid!, date, time, dentistId: pick });
    if (r.ok) onOpenChange(false);
    else setError(r.error ?? "Could not book that time.");
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{move ? "Move visit" : "New booking"}</DialogTitle>
          <DialogDescription>{move ? move.patient : "Only free times are offered, the same ones Sara offers."}</DialogDescription>
        </DialogHeader>

        {!move && <PatientPicker value={patient} onChange={setPatient} />}

        <div className={cn("grid gap-3", multi && "sm:grid-cols-2")}>
          {!move && (
            <div className="grid gap-1.5">
              <Label>Service</Label>
              <Select value={serviceId} onValueChange={(v) => { setServiceId(v); setTime(""); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Pick a service" /></SelectTrigger>
                <SelectContent>{setup.services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.minutes} min</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {multi && (
            <div className="grid gap-1.5">
              <Label>Dentist</Label>
              <Select value={dentistId} onValueChange={(v) => { setDentistId(v); setTime(""); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{move ? "Keep or any free" : "Any free dentist"}</SelectItem>
                  {dentists.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label>Day</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start font-normal"><CalendarIcon />{LONG.format(new Date(`${date}T00:00:00Z`))}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={new Date(`${date}T00:00:00`)}
                onSelect={(d) => d && (setDate(iso(d)), setTime(""))}
                disabled={{ before: new Date(`${setup.today}T00:00:00`) }}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="grid gap-1.5">
          <Label>Time</Label>
          {!sid ? <p className="text-sm text-muted-foreground">Pick a service first.</p>
            : times === null ? <p className="text-sm text-muted-foreground">Finding free times…</p>
            : !times.length ? <p className="text-sm text-muted-foreground">No free times this day.</p>
            : (
              <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6">
                {times.map((t) => (
                  <Button key={t.time} type="button" size="sm" variant={t.time === time ? "default" : "outline"} className="font-mono tabular-nums" onClick={() => setTime(t.time)}>
                    {t.time}
                  </Button>
                ))}
              </div>
            )}
        </div>

        {error && <p role="alert" className="text-sm text-alert">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button disabled={!ready || pending} onClick={submit}>{pending ? "Saving…" : move ? "Move visit" : "Book visit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Search by name or phone; "New patient" adds a walk-in inline.
function PatientPicker({ value, onChange }: { value: Patient | null; onChange: (p: Patient | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Patient[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(() => searchPatients(q).then(setHits), 200);
    return () => clearTimeout(t);
  }, [q]);

  if (value)
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <span><span className="text-muted-foreground">Patient </span><strong className="font-medium">{value.name ?? value.phone ?? "Patient"}</strong></span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Change</Button>
      </div>
    );

  if (adding)
    return (
      <div className="grid gap-2 rounded-md border p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Full name" />
          <Input placeholder="050 123 4567" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Mobile number" />
        </div>
        {error && <p role="alert" className="text-sm text-alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Back</Button>
          <Button size="sm" disabled={pending} onClick={() => start(async () => {
            const r = await addPatient({ name, phone });
            if ("error" in r) return setError(r.error);
            onChange({ id: r.id, name });
          })}>Add patient</Button>
        </div>
      </div>
    );

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="patient-q">Patient</Label>
      <div className="flex gap-2">
        <Input id="patient-q" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <Button variant="outline" onClick={() => { setAdding(true); setName(/\d/.test(q) ? "" : q); setPhone(/\d/.test(q) ? q : ""); }}><UserPlusIcon />New</Button>
      </div>
      {hits.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border text-sm">
          {hits.map((p) => (
            <li key={p.id}>
              <button type="button" className="flex w-full justify-between gap-2 px-3 py-2 text-start hover:bg-muted" onClick={() => onChange(p)}>
                <span>{p.name ?? "No name"}</span><span className="font-mono text-xs text-muted-foreground">{p.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
