import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { CallLink, DeskLog, Nav, Reveals, Setup, SmoothScroll, WordReveal } from "@/components/landing";
import { Hero, Horizon } from "@/components/landing-hero";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const DEMO = "/chat/sample-smile";
// The demo call: a booking page or a wa.me link to a business number (public, it ships in the page). Unset: the demo chat.
const CALL = process.env.NEXT_PUBLIC_DEMO_CALL_URL || DEMO;

const TITLE = "Receptionist Agent: an AI receptionist for dental clinics";
const DESCRIPTION =
  "Sara answers your clinic's WhatsApp and website chats in English and Arabic, books real free times into your calendar and hands anything clinical to your team.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const SAFETY = [
  { title: "No medical advice.", text: "Sara books visits and answers clinic questions. Anything clinical goes to your team." },
  { title: "Emergencies come first.", text: "Messages like “I can't breathe” get the UAE emergency number, 998, before anything else." },
  { title: "A person when it matters.", text: "Sara hands the chat to your staff on WhatsApp and stays quiet while they reply." },
  { title: "No promises on cover.", text: "Insurance questions get your list of accepted insurers, never a coverage guarantee." },
];

const FAQ = [
  {
    q: "Does it use our own WhatsApp number?",
    a: "Yes. Sara can answer on the WhatsApp number your patients already use, or on a new number if you prefer. We connect it with you.",
  },
  { q: "Can patients tell it's not a person?", a: "Sara says she is the clinic's virtual assistant whenever a patient asks." },
  {
    q: "What happens with medical questions?",
    a: "Sara never gives medical advice. She offers a visit or hands the chat to your team, and urgent messages get 998 first.",
  },
  { q: "Does it work in Arabic?", a: "Yes. Arabic, English and Arabizi, answered in the language the patient writes in." },
  { q: "Can my staff take over a chat?", a: "Yes. Take over from the inbox, reply on WhatsApp or the website chat, then hand it back to Sara." },
  {
    q: "Where is patient data kept?",
    a: "Each clinic's chats are separate and visible only to its own team, and patient chats are not used to train AI models. We agree where your data is hosted before your clinic goes live.",
  },
  { q: "What does it cost?", a: "It depends on your chat volume and channels. We walk you through pricing on the demo call." },
  {
    q: "How does setup work?",
    a: "We do it with you: your hours, services and dentists, then test chats in English and Arabic before patients see it.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
};

const Container = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className ?? ""}`}>{children}</div>
);

const Heading = ({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) => (
  <div data-reveal className="max-w-2xl">
    <p className="text-sm font-medium text-primary">{eyebrow}</p>
    <h2 className="mt-3 font-display text-h2 tracking-[-0.02em] text-balance">{title}</h2>
    {text && <p className="mt-4 text-pretty text-muted-foreground">{text}</p>}
  </div>
);

export default function Home() {
  // `.day`: the landing body is cream in both themes; the desk log's sky and the close band carry their own scopes.
  return (
    <div className="day min-h-dvh">
      {/* Arms the CSS-hidden start state of [data-reveal] before first paint (see globals.css); with JS off nothing is hidden. */}
      <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.classList.add("reveals")' }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Nav call={CALL} />
      <main id="main">
        <Hero call={CALL} demo={DEMO} />
        <DeskLog />

        <Setup heading={<Heading eyebrow="How it works" title="Set up with you, on the channels you already use." />} />

        <section id="safety" className="pb-section">
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

        <section aria-label="What Sara does" className="border-t py-section">
          <Container className="flex justify-center">
            <WordReveal
              text={"Every message answered.\nEvery free slot filled."}
              className="text-center font-display text-5xl leading-[1.05] tracking-[-0.025em] text-balance sm:text-6xl lg:text-7xl"
            />
          </Container>
        </section>

        <section id="faq" className="pb-20">
          <Container>
            <Heading eyebrow="Questions" title="What clinic owners ask us." />
            <div className="mt-10 max-w-3xl border-t">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden className="font-mono text-muted-foreground transition-transform duration-200 ease-out group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-5 text-pretty text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </Container>
        </section>

        <div data-night className="night">
          <section aria-labelledby="close-title" className="relative isolate overflow-clip py-section">
            <Horizon top />
            <Container className="flex flex-col items-center text-center">
              <p data-reveal className="font-mono text-sm text-dawn tabular-nums">18:00 tonight</p>
              <h2 id="close-title" data-reveal className="mt-4 max-w-[16ch] font-display text-display tracking-[-0.025em] text-balance">
                Let Sara take the night shift.
              </h2>
              <p data-reveal className="mt-5 max-w-md text-pretty text-muted-foreground">
                15 minutes on a call. We walk you through Sara on a sample clinic and answer your questions.
              </p>
              <div data-reveal className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
                <Button asChild size="lg">
                  <CallLink href={CALL}>
                    Book a 15 min demo call <ArrowRightIcon className="size-4" />
                  </CallLink>
                </Button>
                <Link href={DEMO} className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Try Sara now
                </Link>
              </div>
            </Container>
          </section>
        </div>
      </main>

      <footer data-night className="night border-t">
        <Container className="flex flex-col gap-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo className="text-xl text-foreground" />
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href={DEMO} className="hover:text-foreground">Try Sara</Link>
            <Link href="/login" className="hover:text-foreground">Staff sign in</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <span>Sample clinic, sample data.</span>
          </nav>
        </Container>
      </footer>
      <SmoothScroll />
      <Reveals />
    </div>
  );
}
