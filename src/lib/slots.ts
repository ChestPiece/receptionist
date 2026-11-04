// Slot engine: pure functions, clinic local time. The DB exclusion constraint is the final guard against double booking.
export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Hours = Partial<Record<(typeof DAYS)[number], [string, string][]>>;

const STEP = 15; // minutes between offered start times
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ponytail: fixed UTC offset (UAE has no DST). Use a tz library for clinics in DST countries.
export const toUtc = (date: string, time: string, offsetMin: number) =>
  new Date(Date.parse(`${date}T${time}:00Z`) - offsetMin * 60_000);
const shifted = (d: Date, offsetMin: number) => new Date(d.getTime() + offsetMin * 60_000).toISOString();
export const localDate = (d: Date, offsetMin: number) => shifted(d, offsetMin).slice(0, 10);
export const localTime = (d: Date, offsetMin: number) => shifted(d, offsetMin).slice(11, 16);

// A few times spread across the day (like a receptionist would offer), earliest first.
export const spreadSlots = (free: string[], n = 4) =>
  free.length <= n ? free : Array.from({ length: n }, (_, i) => free[Math.round((i * (free.length - 1)) / (n - 1))]);

// Free start times ("HH:MM") on a local date for a service of `minutes` length.
export function freeSlots(
  hours: Hours,
  booked: { start: Date; end: Date }[],
  minutes: number,
  date: string,
  now: Date,
  offsetMin: number,
): string[] {
  const day = DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const out: string[] = [];
  for (const [open, close] of (day && hours[day]) || []) {
    for (let t = toMin(open); t + minutes <= toMin(close); t += STEP) {
      const start = toUtc(date, toHhmm(t), offsetMin);
      const end = new Date(start.getTime() + minutes * 60_000);
      if (start <= now || booked.some((b) => b.start < end && start < b.end)) continue;
      out.push(toHhmm(t));
    }
  }
  return out;
}

// Was the clinic open at this moment (clinic time)? Booked-while-closed is Sara's after-hours proof.
export function isOpenAt(at: Date, hours: Hours, offsetMin: number) {
  const date = localDate(at, offsetMin);
  const time = localTime(at, offsetMin);
  const day = DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return (hours[day] ?? []).some(([open, close]) => time >= open && time < close);
}
