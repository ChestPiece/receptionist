// Booking engine, pure core: which dentists can take a service and when they are free. No I/O, no imports from sara/jobs.
import type { Clinic, Dentist } from "./clinics";
import { freeSlots } from "./slots";

export const HORIZON_DAYS = 60;
export type Busy = { dentistId: string; start: Date; end: Date };
export type Free = { time: string; dentistIds: string[] };

export const tooFar = (date: string, today: string) => Date.parse(date) - Date.parse(today) > HORIZON_DAYS * 86_400_000;

// The weekly report credits a booking to the follow-up if it came within 48 h of the nudge.
export const bookingSource = (followupSentAt: string | null, now: Date) =>
  followupSentAt && now.getTime() - Date.parse(followupSentAt) <= 48 * 3_600_000 ? "followup" : "chat";

// Active dentists doing the service (optionally one picked dentist), in sort order.
export const dentistsFor = (c: Pick<Clinic, "dentists">, serviceId: string, dentistId?: string | null) =>
  c.dentists
    .filter((d) => d.active && d.service_ids.includes(serviceId) && (!dentistId || d.id === dentistId))
    .sort((a, b) => a.sort - b.sort);

// Free start times across dentists; each time lists who is free, in the order given.
export function freeByDentist(dentists: Dentist[], busy: Busy[], minutes: number, date: string, now: Date, offsetMin: number): Free[] {
  const byTime = new Map<string, string[]>();
  for (const d of dentists)
    for (const t of freeSlots(d.hours, busy.filter((b) => b.dentistId === d.id), minutes, date, now, offsetMin))
      byTime.set(t, [...(byTime.get(t) ?? []), d.id]);
  return [...byTime].sort(([a], [b]) => a.localeCompare(b)).map(([time, dentistIds]) => ({ time, dentistIds }));
}

// Fewest visits that day wins; ties keep `ids` order (Array.sort is stable).
export const pickDentist = (ids: string[], load: Record<string, number>) =>
  [...ids].sort((a, b) => (load[a] ?? 0) - (load[b] ?? 0))[0];
