import { ArrowRightIcon, CheckIcon, ShieldCheckIcon, SirenIcon, StethoscopeIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { Hero, Nav, NightShift, Reveals } from "@/components/landing";
import { ThemeToggle } from "@/components/ledger";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const DEMO = "/chat/sample-smile";

const SAFETY = [
  { icon: StethoscopeIcon, title: "No medical advice", text: "Sara books visits and answers clinic questions. Anything clinical goes to your team." },
  { icon: SirenIcon, title: "Emergencies first", text: "Messages like “I can't breathe” get the UAE emergency number, 998, before anything else." },
  { icon: UserRoundIcon, title: "A person when it matters", text: "Sara hands the chat to your staff on WhatsApp and stays quiet while they reply." },
  { icon: ShieldCheckIcon, title: "No promises on cover", text: "Insurance questions get your list of accepted insurers, never a coverage guarantee." },
];

// Each feature carries a small piece of the real product instead of an icon.
const FEATURES = [
  {
    title: "Books real free times",
    text: "Sara reads your clinic hours and offers only open slots. She books, moves and cancels visits, and never double books.",
    demo: (
      <div className="flex gap-2 text-[13px] font-medium tabular-nums">
        <span className="rounded-lg border px-3 py-2 text-muted-foreground">5:00 pm</span>
        <span className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-primary-foreground">
          <CheckIcon className="size-3.5" /> 6:30 pm
        </span>
        <span className="rounded-lg border px-3 py-2 text-muted-foreground">7:15 pm</span>
      </div>
    ),
  },
  {
    title: "English and Arabic",
    text: "Patients write the way they talk, in English, Arabic or Arabizi. Sara answers in the same language.",
    demo: (
      <div className="flex flex-col items-start gap-1.5 text-[13px]">
        <span className="rounded-full bg-muted px-3 py-1">Anything free Thursday?</span>
        <span dir="rtl" className="rounded-full bg-muted px-3 py-1">
          في موعد فاضي يوم الخميس؟
        </span>
        <span className="rounded-full bg-muted px-3 py-1">fi maw3ed fadi el 5amees?</span>
      </div>
    ),
  },
  {
    title: "WhatsApp and your website",
    text: "One receptionist for both channels. Every chat and booking lands in the same staff inbox.",
    demo: (
      <div className="flex w-full max-w-64 flex-col divide-y rounded-lg border text-[13px]">
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
];

const Container = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className ?? ""}`}>{children}</div>;

const Heading = ({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) => (
  <div data-reveal className="max-w-2xl">
    <p className="text-sm font-medium text-primary">{eyebrow}</p>
    <h2 className="mt-3 text-h2 font-semibold tracking-[-0.03em] text-balance">{title}</h2>
    {text && <p className="mt-4 text-pretty text-muted-foreground">{text}</p>}
  </div>
);

export default function Home() {
  return (
    <div className="min-h-dvh">
      <noscript>
        <style>{"[data-hero]{visibility:visible!important}"}</style>
      </noscript>
      <Nav demo={DEMO} />
      <Hero demo={DEMO} />

      <NightShift heading={<Heading eyebrow="How it works" title="One booking, while your desk is closed." />} />

      <section id="features" className="border-t bg-card/50 py-section">
        <Container>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
            <Heading eyebrow="Features" title="Everything your front desk does after hours." />
            <p data-reveal className="max-w-md text-pretty text-muted-foreground lg:justify-self-end">
              Sara works from your clinic hours, services and calendar. Your team sees every chat and booking in one place.
            </p>
          </div>
          <div className="mt-12 grid divide-y rounded-2xl border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
            {FEATURES.map((f) => (
              <div key={f.title} data-reveal className="flex flex-col p-6 sm:p-8">
                <div aria-hidden className="flex h-24 items-center">
                  {f.demo}
                </div>
                <h3 className="mt-6 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-pretty text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section id="safety" className="border-t py-section">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Heading eyebrow="Safety" title="Careful by design." text="The safety checks are plain code that runs before the AI does, so they hold on every message." />
          </div>
          <ul className="border-t">
            {SAFETY.map((s) => (
              <li key={s.title} data-reveal className="grid gap-x-6 gap-y-2 border-b py-6 sm:grid-cols-[2.25rem_13rem_1fr]">
                <span className="flex size-9 items-center justify-center rounded-lg border bg-card">
                  <s.icon className="size-4 text-primary" />
                </span>
                <h3 className="font-semibold sm:pt-1.5">{s.title}</h3>
                <p className="text-sm text-pretty text-muted-foreground sm:pt-1.5">{s.text}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="border-t py-section">
        <Container>
          <div data-reveal className="flex flex-col items-start gap-6 rounded-2xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-14 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-h2 font-semibold tracking-[-0.03em]">See Sara book a visit.</h2>
              <p className="mt-3 opacity-80">The demo runs on a sample clinic. Try it in English or Arabic.</p>
            </div>
            <Button asChild size="lg" variant="secondary">
              <Link href={DEMO}>
                Open the demo chat <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
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
            <ThemeToggle />
          </nav>
        </Container>
      </footer>
      <Reveals />
    </div>
  );
}
