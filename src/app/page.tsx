import { ArrowRightIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import { Hero, Horizon, HowItWorks, Nav, NightFilm, NightWaves, Reveals } from "@/components/landing";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEMO = "/chat/sample-smile";

const SAFETY = [
  { title: "No medical advice.", text: "Sara books visits and answers clinic questions. Anything clinical goes to your team." },
  { title: "Emergencies come first.", text: "Messages like “I can't breathe” get the UAE emergency number, 998, before anything else." },
  { title: "A person when it matters.", text: "Sara hands the chat to your staff on WhatsApp and stays quiet while they reply." },
  { title: "No promises on cover.", text: "Insurance questions get your list of accepted insurers, never a coverage guarantee." },
];

// A bento of real product pieces: the lead tile carries the main idea, the smaller ones extend it. No icon tiles.
const FEATURES = [
  {
    span: "lg:col-span-4 lg:row-span-2",
    title: "Books real free times",
    text: "Sara reads your clinic hours and calendar and offers only open slots. She never double books.",
    demo: (
      <div className="flex flex-col gap-4">
        <span className="text-xs text-muted-foreground tabular-nums">Thu 29 Oct, evening</span>
        <div className="flex flex-wrap gap-2 text-sm font-medium tabular-nums">
          <span className="rounded-xl border bg-card px-4 py-3 text-muted-foreground">5:00 pm</span>
          <span className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary)]">
            <CheckIcon className="size-4" /> 6:30 pm
          </span>
          <span className="rounded-xl border bg-card px-4 py-3 text-muted-foreground">7:15 pm</span>
          <span className="rounded-xl border border-dashed px-4 py-3 text-muted-foreground/60 line-through">8:00 pm</span>
        </div>
        <span className="text-xs text-muted-foreground">8:00 pm is taken, so Sara never offers it.</span>
      </div>
    ),
  },
  {
    span: "lg:col-span-2",
    title: "English and Arabic",
    text: "Patients write the way they talk. Sara answers in the same language.",
    demo: (
      <div className="flex flex-col items-start gap-1.5 text-[13px]">
        <span className="rounded-2xl rounded-es-sm bg-muted px-3 py-1.5">Anything free Thursday?</span>
        <span dir="rtl" className="self-end rounded-2xl rounded-ee-sm bg-sage-soft px-3 py-1.5">
          في موعد فاضي يوم الخميس؟
        </span>
        <span className="rounded-2xl rounded-es-sm bg-muted px-3 py-1.5">fi maw3ed fadi el 5amees?</span>
      </div>
    ),
  },
  {
    span: "lg:col-span-2",
    title: "WhatsApp and your website",
    text: "One receptionist for both. Every chat lands in the same staff inbox.",
    demo: (
      <div className="flex w-full flex-col divide-y rounded-xl border bg-card text-[13px]">
        {[
          ["bg-primary", "Omar M.", "WhatsApp"],
          ["bg-web", "Sophie R.", "Website"],
        ].map(([dot, name, channel]) => (
          <span key={name} className="flex items-center gap-2 px-3 py-2">
            <b className={`size-2 rounded-full ${dot}`} />
            <span className="font-medium">{name}</span>
            <span className="ms-auto text-muted-foreground">{channel}</span>
          </span>
        ))}
      </div>
    ),
  },
  {
    span: "lg:col-span-3",
    title: "Reminders that cut no-shows",
    text: "24 hours and 2 hours before each visit. Patients reply 1 to confirm or 2 to change it.",
    demo: (
      <ol className="flex w-full items-center gap-3 text-[13px] tabular-nums">
        {[
          ["Booked", "Mon 23:41"],
          ["Reminder", "Wed 6:30 pm"],
          ["Reminder", "Thu 4:30 pm"],
          ["Visit", "Thu 6:30 pm"],
        ].map(([what, when], i) => (
          <li key={when} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className={cn("h-1 rounded-full", i === 3 ? "bg-primary" : "bg-dawn")} />
            <span className="font-medium">{what}</span>
            <span className="truncate text-xs text-muted-foreground">{when}</span>
          </li>
        ))}
      </ol>
    ),
  },
  {
    span: "lg:col-span-3",
    title: "Moves and cancels too",
    text: "Plans change. Sara moves or cancels the visit and frees the slot for someone else.",
    demo: (
      <div className="flex flex-col items-start gap-1.5 text-[13px]">
        <span className="self-end rounded-2xl rounded-ee-sm bg-sage-soft px-3 py-1.5">Can I move it to Saturday?</span>
        <span className="rounded-2xl rounded-es-sm bg-muted px-3 py-1.5">
          Done. Saturday 11:00 am. Thursday 6:30 pm is free again.
        </span>
      </div>
    ),
  },
];

const Container = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;

const Heading = ({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) => (
  <div data-reveal className="max-w-2xl">
    <p className="text-sm font-medium text-primary">{eyebrow}</p>
    <h2 className="mt-3 font-display text-h2 tracking-[-0.02em] text-balance">{title}</h2>
    {text && <p className="mt-4 text-pretty text-muted-foreground">{text}</p>}
  </div>
);

export default function Home() {
  // `.day`: the landing body is morning in both themes; night surfaces carry their own `.night` scope.
  return (
    <div className="day min-h-dvh">
      <Nav demo={DEMO} />
      <Hero demo={DEMO} />
      <NightFilm />

      <HowItWorks heading={<Heading eyebrow="How it works" title="One booking, while your desk is closed." />} />

      <section id="features" className="border-t bg-muted/60 py-section">
        <Container>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
            <Heading eyebrow="Features" title="Everything your front desk does after hours." />
            <p data-reveal className="max-w-md text-pretty text-muted-foreground lg:justify-self-end">
              Sara works from your clinic hours, services and calendar. Your team sees every chat and booking in one place.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
            {FEATURES.map((f, i) => (
              <article key={f.title} data-reveal className={cn("flex flex-col rounded-2xl border bg-card p-6 sm:p-8", f.span)}>
                <div aria-hidden className={cn("flex items-center", i === 0 ? "min-h-40 flex-1" : "min-h-24")}>
                  {f.demo}
                </div>
                <h3 className={cn("mt-6 font-semibold", i === 0 && "font-display text-2xl font-normal tracking-[-0.01em]")}>{f.title}</h3>
                <p className="mt-2 max-w-md text-sm text-pretty text-muted-foreground">{f.text}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section id="safety" className="py-section">
        <Container>
          <Heading eyebrow="Safety" title="Careful by design." text="The safety checks are plain code that runs before the AI does, so they hold on every message." />
          <ol className="mt-12">
            {SAFETY.map((s, i) => (
              <li key={s.title} data-reveal className="grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-2 border-t border-dawn py-7 sm:grid-cols-[3rem_minmax(0,1.1fr)_minmax(0,1fr)] sm:gap-x-8">
                <span className="pt-1.5 font-mono text-xs text-dawn-deep tabular-nums">0{i + 1}</span>
                <h3 className="font-display text-2xl tracking-[-0.01em] text-balance sm:text-3xl">{s.title}</h3>
                <p className="col-start-2 text-pretty text-muted-foreground sm:col-start-3 sm:pt-1.5">{s.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <div data-night className="night">
        <section aria-labelledby="close-title" className="relative isolate overflow-clip pt-[calc(var(--spacing-section)*1.4)] pb-section">
          <NightWaves
            when="near"
            spacing={12}
            opacity={0.4}
            speed={0.18}
            direction={200}
            fade="center"
            fadeSize={0.6}
            interactive={false}
            intro={false}
            className="absolute inset-0 -z-20"
          />
          <Horizon top />
          <Container className="flex flex-col items-center text-center">
            <h2 id="close-title" data-reveal className="max-w-[16ch] font-display text-display tracking-[-0.025em] text-balance">
              Let Sara take the night shift.
            </h2>
            <p data-reveal className="mt-5 max-w-md text-pretty text-muted-foreground">
              The demo runs on a sample clinic. Try it in English or Arabic.
            </p>
            <div data-reveal className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <Button asChild size="lg">
                <Link href={DEMO}>
                  Open the demo chat <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
              <Link href="/login" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Staff sign in
              </Link>
            </div>
          </Container>
        </section>

        <footer className="border-t">
          <Container className="flex flex-col gap-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <Logo className="text-xl text-foreground" />
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link href={DEMO} className="hover:text-foreground">
                Try the demo
              </Link>
              <Link href="/login" className="hover:text-foreground">
                Staff sign in
              </Link>
              <span>Sample clinic, sample data.</span>
            </nav>
          </Container>
        </footer>
      </div>
      <Reveals />
    </div>
  );
}
