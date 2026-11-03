// Web chat quick-reply chips. Sara ends a reply with a hidden line `[[chips: a | b | c]]`; the client strips it
// from the visible text and shows the chips. Tool results (slots, booking, visits) add fallback chips.

const MAX_CHIPS = 4;
const MAX_LEN = 28;

// Everything from `[[` onward is hidden, so a half-streamed marker never flickers on screen.
export function splitChips(raw: string) {
  const i = raw.indexOf("[[");
  const text = (i < 0 ? raw.replace(/\[$/, "") : raw.slice(0, i)).trimEnd();
  const m = i < 0 ? null : /^\[\[chips:([^\]]*)\]\]/i.exec(raw.slice(i));
  const chips = [...new Set((m?.[1] ?? "").split("|").map((c) => c.trim().slice(0, MAX_LEN).trim()).filter(Boolean))].slice(0, MAX_CHIPS);
  return { text, chips };
}

// The marker line of the last assistant turn in saved agent history ("" if none), so a reload can rebuild the chips.
export function markerOf(history: unknown[]) {
  for (const it of [...history].reverse()) {
    const m = it as { role?: string; content?: unknown };
    if (m?.role !== "assistant") continue;
    const text = Array.isArray(m.content) ? m.content.map((c) => (c as { text?: string }).text ?? "").join("") : String(m.content ?? "");
    return /\[\[chips:[^\]]*\]\]/i.exec(text)?.[0] ?? "";
  }
  return "";
}

// The reply has a chips marker, even an empty one ([[chips: ]] = Sara chose no chips on purpose).
export const hasMarker = (raw: string) => /\[\[chips:/i.test(raw);

export type IcsEvent = { service: string; date: string; time: string; address?: string | null };
export type Chip = { label: string; ics?: IcsEvent };
type Part = { type: string; toolName?: string; state?: string; output?: unknown };

// Tool output arrives as the tool's return value; string results are errors or notes meant for the model.
export function parseOut(out: unknown): Record<string, unknown> | unknown[] | null {
  if (typeof out !== "string") return (out as Record<string, unknown>) ?? null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

const AR: Record<string, string> = {
  "Other day": "يوم آخر",
  "Talk to the team": "التحدث مع الفريق",
  "Add to calendar": "أضف إلى التقويم",
  "Book another visit": "حجز موعد آخر",
  Reschedule: "تغيير الموعد",
  "Cancel a visit": "إلغاء موعد",
  "Book a visit": "حجز موعد",
  Prices: "الأسعار",
  "Talk to the front desk": "التحدث مع الاستقبال",
};

// Safety net when Sara forgot the marker line entirely: the bar never goes blank by accident.
export const fallbackChips = (ar: boolean): Chip[] => ["Book a visit", "Prices", "Talk to the front desk"].map((l) => ({ label: ar ? AR[l] : l }));

// Fallback chips from the newest finished tool call in the last assistant message.
export function toolChips(parts: Part[], ar: boolean): Chip[] {
  const done = parts.filter((p) => p.type === "dynamic-tool" && p.state === "output-available");
  const last = done.at(-1);
  const out = last && parseOut(last.output);
  if (!last || !out) return [];
  const pick = (...labels: string[]) => labels.map((l) => ({ label: ar ? AR[l] : l }));
  if (last.toolName === "find_slots" && !Array.isArray(out) && Array.isArray(out.days)) {
    const empty = (out.days as { times?: string[] }[]).every((d) => !d.times?.length);
    return pick("Other day", ...(empty ? ["Talk to the team"] : []));
  }
  if (last.toolName === "book" && !Array.isArray(out) && out.booked) {
    const [cal, ...rest] = pick("Add to calendar", "Book another visit", "Reschedule");
    return [{ ...cal, ics: out as unknown as IcsEvent }, ...rest];
  }
  if (last.toolName === "my_appointments" && Array.isArray(out)) return pick("Reschedule", "Cancel a visit");
  return [];
}

// A calendar file for one booked visit. ponytail: floating local time and a fixed 30 min, because the book result carries neither a zone nor the length.
export function icsFor(e: IcsEvent) {
  const start = `${e.date.replaceAll("-", "")}T${e.time.replace(":", "")}00`;
  const [h, m] = e.time.split(":").map(Number);
  const end = h * 60 + m + 30;
  const stop = `${e.date.replaceAll("-", "")}T${String(Math.floor(end / 60) % 24).padStart(2, "0")}${String(end % 60).padStart(2, "0")}00`;
  const BS = String.fromCharCode(92);
  const esc = (s: string) => s.split(BS).join(BS + BS).replace(/[,;]/g, (c) => BS + c).replace(/\s+/g, " ");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Receptionist Agent//EN", "BEGIN:VEVENT", `UID:${start}-${esc(e.service)}@receptionist-agent`, `DTSTAMP:${start}`, `DTSTART:${start}`, `DTEND:${stop}`, `SUMMARY:${esc(e.service)}`, ...(e.address ? [`LOCATION:${esc(e.address)}`] : []), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
