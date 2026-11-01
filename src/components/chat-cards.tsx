"use client";

// Rich chat cards shared by the live chat (/chat/[slug]) and the landing page demo.
import { CalendarCheckIcon, CheckIcon, ClockIcon, MapPinIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const SPRING = [0.34, 1.56, 0.64, 1] as const;

export const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const timeLabel = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

export type Slots = { service: string; dentist?: string; days: { date: string; times: string[]; note?: string }[] };
export type Booked = { service: string; dentist?: string; date: string; time: string; address: string | null; maps_url: string | null };
export type Appt = { id: string; service: string; dentist?: string; date: string; time: string };

// Sara's line: plain text, no box, like a modern assistant reply. The patient's bubble is the sage one.
export const Bubble = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("w-fit max-w-[85%] text-[15px] leading-relaxed", className)}>{children}</div>
);

export const PatientBubble = ({ children }: { children: ReactNode }) => (
  <div className="ms-auto w-fit max-w-[80%] rounded-2xl rounded-ee-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-foreground">{children}</div>
);

// "Sara is typing": three dots, like a phone chat.
export function TypingDots({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex w-fit items-center gap-1 rounded-full bg-muted px-3.5 py-3">
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot size-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  );
}

// Free times. Tapping one locks the card: the pick fills, the rest fade, so a second tap can't double-book.
export function SlotPicker({ slots, onPick, busy, picked: pickedProp }: { slots: Slots; onPick: (text: string) => void; busy?: boolean; picked?: string }) {
  const [pickedState, setPicked] = useState<string>();
  const picked = pickedProp ?? pickedState;
  const reduce = useReducedMotion();
  let n = 0;
  return (
    <Card className="w-full max-w-sm gap-3 rounded-xl py-4 shadow-none">
      <CardHeader className="border-b px-4 !pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ClockIcon className="size-3.5" /> Free times · {slots.service}{slots.dentist && ` with ${slots.dentist}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        {slots.days.map((d) => (
          <div key={d.date} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{dayLabel(d.date)}</span>
            {d.times.length ? (
              <div className="grid grid-cols-3 gap-2">
                {d.times.map((t) => {
                  const key = `${d.date} ${t}`;
                  const isPicked = picked === key;
                  return (
                    <motion.div
                      key={t}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: picked && !isPicked ? 0.4 : 1, y: 0 }}
                      transition={{ duration: 0.2, ease: EASE_OUT, delay: picked ? 0 : n++ * 0.03 }}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !!picked}
                        className={cn(
                          "h-11 w-full rounded-lg bg-card text-[13px] font-medium tabular-nums shadow-none hover:border-primary hover:bg-accent sm:h-9",
                          isPicked && "border-primary bg-primary text-primary-foreground disabled:opacity-100",
                        )}
                        onClick={() => {
                          setPicked(key);
                          onPick(`${timeLabel(t)} on ${dayLabel(d.date)} works for me`);
                        }}
                      >
                        {isPicked && <CheckIcon className="size-3.5" />}
                        {timeLabel(t)}
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No free times</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Booking confirmed: settles in once and the check draws itself.
export function BookedCard({ booked: b }: { booked: Booked }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="w-full max-w-sm origin-top-left"
    >
      <Card className="gap-3 rounded-xl py-4 shadow-none">
        <CardHeader className="border-b px-4 !pb-3">
          <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
            <span className="flex size-5 items-center justify-center rounded-full bg-success text-success-foreground">
              <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <motion.path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.15 }}
                />
              </svg>
            </span>
            You&apos;re booked
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 px-4 text-sm">
          <div className="font-medium">{b.service}{b.dentist && <span className="font-normal text-muted-foreground"> with {b.dentist}</span>}</div>
          <div className="flex items-center gap-1.5 tabular-nums">
            <CalendarCheckIcon className="size-3.5 text-muted-foreground" />
            {dayLabel(b.date)} at {timeLabel(b.time)}
          </div>
          {b.address && (
            <a className="flex items-start gap-1.5 text-muted-foreground underline-offset-4 hover:underline" href={b.maps_url ?? undefined} target="_blank" rel="noreferrer">
              <MapPinIcon className="mt-0.5 size-3.5 shrink-0" /> {b.address}
            </a>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function AppointmentList({ appts }: { appts: Appt[] }) {
  return (
    <Card className="w-full max-w-sm gap-2 rounded-xl py-3 shadow-none">
      <CardContent className="flex flex-col divide-y px-4 text-sm">
        {appts.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 py-2">
            <span>{a.service}{a.dentist && <span className="text-muted-foreground"> · {a.dentist}</span>}</span>
            <Badge variant="secondary" className="font-normal tabular-nums">
              {dayLabel(a.date)}, {timeLabel(a.time)}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
