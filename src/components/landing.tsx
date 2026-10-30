"use client";

// Client pieces of the landing page: nav, hero demo (English / Arabic), the pinned "night shift" story and scroll reveals.
import Link from "next/link";
import { ArrowRightIcon, CheckIcon, RotateCcwIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookedCard, Bubble, EASE_OUT, PatientBubble, SlotPicker, TypingDots } from "@/components/chat-cards";
import { ROW, WeekCalendar, type Block } from "@/components/ledger";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Flip, gsap, ScrollTrigger, SplitText, useGSAP } from "@/lib/gsap";
import { cn } from "@/lib/utils";

// Sample data only: no real clinic or patient.
const SLOTS = { service: "Cleaning & polish", days: [{ date: "2026-10-29", times: ["17:00", "18:30", "19:15"] }] };
const BOOKED = { service: "Cleaning & polish", date: "2026-10-29", time: "18:30", address: "Sample Smile Dental, Jumeirah", maps_url: null };
const PICK = "2026-10-29 18:30";

const LINKS = [
  ["#how", "How it works"],
  ["#features", "Features"],
  ["#safety", "Safety"],
] as const;

export function Nav({ demo }: { demo: string }) {
  const [active, setActive] = useState("");
  useEffect(() => {
    // The link of the section crossing the middle of the screen lights up.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setActive((a) => (e.isIntersecting ? `#${e.target.id}` : a === `#${e.target.id}` ? "" : a))),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    LINKS.forEach(([href]) => {
      const el = document.querySelector(href);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-30 px-4 pt-3 sm:px-6">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl border bg-card/80 ps-4 pe-2 shadow-sm backdrop-blur-md">
        <Link href="/" aria-label="Receptionist Agent home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map(([href, text]) => (
            <a
              key={href}
              href={href}
              aria-current={active === href ? "location" : undefined}
              className={cn("hidden rounded-lg px-3 py-2 transition-colors hover:bg-muted hover:text-foreground md:inline", active === href ? "bg-muted text-foreground" : "text-muted-foreground")}
            >
              {text}
            </a>
          ))}
          <span aria-hidden className="mx-2 hidden h-5 w-px bg-border md:block" />
          <Link href="/login" className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Sign in
          </Link>
          <Button asChild size="sm" className="ms-1 h-9 rounded-xl px-3 sm:px-4">
            <Link href={demo}>
              <span className="sm:hidden">Demo</span>
              <span className="max-sm:hidden">Try the demo</span>
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function Hero({ demo }: { demo: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      // Server HTML ships hidden (a <noscript> rule unhides it) so the split headline never flashes.
      gsap.set(root.current, { autoAlpha: 1 });
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        SplitText.create("[data-hero-title]", {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) => gsap.from(self.lines, { yPercent: 105, duration: 0.9, ease: "expo.out", stagger: 0.08 }),
        });
        gsap.from("[data-hero-in]", { y: 14, autoAlpha: 0, duration: 0.6, stagger: 0.07, delay: 0.25 });
      });
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      data-hero
      style={{ visibility: "hidden" }}
      className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:min-h-[min(calc(100svh-4.25rem),52rem)] lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:py-10"
    >
      <div>
        <p data-hero-in className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" /> For dental clinics in the UAE
        </p>
        <h1 data-hero-title className="mt-6 max-w-[19ch] text-display font-semibold tracking-[-0.035em] text-balance">
          An AI receptionist that books patients around the clock.
        </h1>
        <p data-hero-in className="mt-6 max-w-[46ch] text-lead text-pretty text-muted-foreground">
          Sara answers on WhatsApp and your website, in English and <span dir="rtl">عربي</span>. She books, moves and cancels visits, and sends the reminders.
        </p>
        <div data-hero-in className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={demo}>
              Try the demo chat <ArrowRightIcon className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="bg-card">
            <a href="#how">See how it works</a>
          </Button>
        </div>
      </div>
      <div data-hero-in>
        <HeroConversation />
      </div>
    </div>
  );
}

// The phone-style chat frame shared by the hero and the story. Decorative replays, so the body is inert.
function ChatShell({ time, dir, className, children }: { time: string; dir?: "rtl"; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm", className)}>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div aria-hidden className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">S</div>
        <div className="leading-tight">
          <div className="text-sm font-medium">Sample Smile Dental</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex size-1.5">
              <span className="online-ring absolute inset-0 rounded-full bg-success" />
              <span className="relative size-1.5 rounded-full bg-success" />
            </span>
            Sara, virtual receptionist
          </div>
        </div>
        <span className="ms-auto text-xs tabular-nums text-muted-foreground">{time}</span>
      </div>
      <div inert dir={dir} className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden p-4 text-sm [mask-image:linear-gradient(to_bottom,transparent,black_40px)]">
        {children}
      </div>
    </div>
  );
}

type Lang = "en" | "ar";
const SCRIPT = {
  en: {
    p1: "Hi, can I book a cleaning this week? Evenings are best",
    s1: "Of course. These evening times are free on Thursday:",
    p2: "6:30 pm on Thu 29 Oct works for me",
    p3: "Perfect, thank you",
    s3: "You're welcome. See you Thursday at 6:30 pm. I'll send a reminder the day before.",
  },
  ar: {
    p1: "مرحبا، أبي أحجز تنظيف هالأسبوع، المسا أفضل",
    s1: "أكيد. هذي المواعيد المسائية المتاحة يوم الخميس:",
    p2: "الخميس الساعة ٦:٣٠ مساءً يناسبني",
    p3: "شكراً، تمام",
    s3: "العفو! نشوفك الخميس الساعة ٦:٣٠ مساءً، وبرسل لك تذكير قبلها بيوم.",
  },
};

// Beat times in ms. Each beat reveals one more line of the conversation.
const BEATS = [400, 1100, 2100, 3600, 4300, 5300, 6600, 7300, 8200];

function HeroConversation() {
  const [lang, setLang] = useState<Lang>("en");
  const [run, setRun] = useState(0);
  return (
    <figure className="mx-auto w-full max-w-[26rem]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div role="group" aria-label="Demo language" className="inline-flex rounded-full border bg-card p-0.5 text-xs">
          {(["en", "ar"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => {
                setLang(l);
                setRun((r) => r + 1);
              }}
              className={cn("rounded-full px-3.5 py-1.5 font-medium transition-colors", lang === l ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {l === "en" ? "English" : <span lang="ar">عربي</span>}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setRun((r) => r + 1)} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <RotateCcwIcon className="size-3.5" /> Replay
        </button>
      </div>
      <ChatShell key={run} time="23:40" dir={lang === "ar" ? "rtl" : undefined} className="h-[clamp(24rem,58svh,30rem)]">
        <Replay lang={lang} />
      </ChatShell>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">Replay of a real booking flow on a sample clinic.</figcaption>
    </figure>
  );
}

function Replay({ lang }: { lang: Lang }) {
  const reduce = useReducedMotion();
  const [at, setAt] = useState(0);
  useEffect(() => {
    // Reduced motion jumps to the end. Done here, not in render, so server and client HTML match.
    const timers = BEATS.map((ms, i) => setTimeout(() => setAt(i + 1), reduce ? 0 : ms));
    return () => timers.forEach(clearTimeout);
  }, [reduce]);

  const t = SCRIPT[lang];
  const ltr = lang === "ar" ? "ltr" : undefined; // the cards stay in English, as in the real chat
  const typing = at === 2 || at === 5 || at === 8;
  return (
    <AnimatePresence initial={false}>
      {at >= 1 && (
        <Line key="p1">
          <PatientBubble>{t.p1}</PatientBubble>
        </Line>
      )}
      {at >= 3 && (
        <Line key="s1">
          <div className="flex flex-col gap-2">
            <Bubble>{t.s1}</Bubble>
            <div dir={ltr}>
              <SlotPicker slots={SLOTS} onPick={() => {}} picked={at >= 4 ? PICK : undefined} />
            </div>
          </div>
        </Line>
      )}
      {at >= 4 && (
        <Line key="p2">
          <PatientBubble>{t.p2}</PatientBubble>
        </Line>
      )}
      {at >= 6 && (
        <Line key="s2">
          <div dir={ltr}>
            <BookedCard booked={BOOKED} />
          </div>
        </Line>
      )}
      {at >= 7 && (
        <Line key="p3">
          <PatientBubble>{t.p3}</PatientBubble>
        </Line>
      )}
      {at >= 9 && (
        <Line key="s3">
          <Bubble>{t.s3}</Bubble>
        </Line>
      )}
      {typing && (
        <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
          <TypingDots label="Sara is typing" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Line({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: EASE_OUT }}>
      {children}
    </motion.div>
  );
}

// The night shift: one booking from a late WhatsApp message to the staff calendar.
const DAYS = [
  { label: "Mon", date: 26 },
  { label: "Tue", date: 27, today: true },
  { label: "Wed", date: 28 },
  { label: "Thu", date: 29 },
];
const FROM = 15;
const BLOCKS: Block[] = [
  { id: "1", day: 0, start: 15, end: 15.75, title: "Cleaning", name: "Hassan A.", kind: "wa" },
  { id: "2", day: 0, start: 17, end: 18, title: "Kids visit", name: "Mira S.", kind: "web" },
  { id: "3", day: 1, start: 16, end: 17, title: "Lost crown", name: "Nadia P.", kind: "staff" },
  { id: "4", day: 2, start: 15.5, end: 16.5, title: "Check-up", name: "Omar M.", kind: "wa" },
  { id: "5", day: 2, start: 19, end: 20, title: "Root canal", name: "Ahmed K.", kind: "wa" },
  { id: "6", day: 3, start: 16, end: 16.75, title: "Cleaning", name: "Rania T.", kind: "web" },
];
const STEPS = [
  { title: "23:40, the clinic is closed", text: "A patient asks on WhatsApp for an evening cleaning." },
  { title: "Sara offers real free times", text: "Only open slots from your book. One tap picks a time." },
  { title: "It lands on your calendar", text: "Your team sees the new visit when they open in the morning." },
  { title: "Reminders do the rest", text: "24 hours and 2 hours before. Reply 1 to confirm or 2 to change it." },
];
const STEP_OF = [0, 1, 1, 2, 3]; // story state to caption
const LAST = 4;

export function NightShift({ heading }: { heading: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const ticket = useRef<HTMLDivElement>(null);
  const booked = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const shown = useRef(0);
  const [step, setStep] = useState(0);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      // Desktop: the section pins and scrolling walks the story one state at a time.
      mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        ScrollTrigger.create({
          trigger: pin.current,
          start: "top top",
          end: () => `+=${window.innerHeight * 2.5}`,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (st) => setStep(Math.min(LAST, Math.floor(st.progress * (LAST + 1)))),
        });
      });
      // Phones and tablets: no pin; the story plays once on a timer when it comes into view.
      mm.add("(max-width: 1023.98px) and (prefers-reduced-motion: no-preference)", () => {
        const calls: gsap.core.Tween[] = [];
        ScrollTrigger.create({
          trigger: pin.current,
          start: "top 55%",
          once: true,
          onEnter: () => [1, 2, 3, 4].forEach((s) => calls.push(gsap.delayedCall(s * 1.6, () => setStep(s)))),
        });
        return () => calls.forEach((c) => c.kill());
      });
      mm.add("(prefers-reduced-motion: reduce)", () => setStep(LAST));
    },
    { scope: root },
  );

  // Step 3: the booking leaves the chat and settles into Thursday 18:30. Flip.fit measures both ends live, so resizes are safe.
  useGSAP(
    () => {
      const from = shown.current;
      shown.current = step;
      gsap.killTweensOf([ticket.current, slot.current]);
      if (step < 3) {
        gsap.set(ticket.current, { autoAlpha: 0 });
        gsap.to(slot.current, { autoAlpha: 0, duration: 0.2 });
        return;
      }
      if (from >= 3) return;
      if (!booked.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(slot.current, { autoAlpha: 1 });
        return;
      }
      Flip.fit(ticket.current, booked.current, { scale: false });
      gsap
        .timeline()
        .set(ticket.current, { autoAlpha: 1 })
        .add(Flip.fit(ticket.current, slot.current, { scale: false, duration: 0.8, ease: "power3.inOut" }) as gsap.core.Tween)
        .set(slot.current, { autoAlpha: 1 })
        .to(ticket.current, { autoAlpha: 0, duration: 0.15 });
    },
    { dependencies: [step], scope: root },
  );

  const current = STEP_OF[step];
  return (
    <section id="how" ref={root} className="border-t">
      <div ref={pin} className="py-section lg:flex lg:h-svh lg:items-center lg:py-0 lg:pt-20">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-[21rem_1fr] lg:items-center lg:gap-12">
          <div>
            {heading}
            <ol className="mt-8 grid gap-1 sm:grid-cols-2 lg:mt-10 lg:grid-cols-1">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  aria-current={i === current ? "step" : undefined}
                  className={cn("border-s-2 py-2 ps-4 transition-[border-color,opacity] duration-300", i === current ? "border-primary" : "border-border", i > current && "opacity-50")}
                >
                  <h3 className="text-[15px] font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-pretty text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="relative grid grid-cols-1 gap-5 md:grid-cols-[18.5rem_1fr] md:items-start">
            <ChatShell time="23:40" className="h-[26rem] md:h-[27.3rem]">
              <AnimatePresence initial={false}>
                <Line key="p1">
                  <PatientBubble>Hi, anything free Thursday evening for a cleaning?</PatientBubble>
                </Line>
                {step >= 1 && (
                  <Line key="s1">
                    <div className="flex flex-col gap-2">
                      <Bubble>Yes, these evening times are free on Thursday:</Bubble>
                      <SlotPicker slots={SLOTS} onPick={() => {}} picked={step >= 2 ? PICK : undefined} />
                    </div>
                  </Line>
                )}
                {step >= 2 && (
                  <Line key="p2">
                    <PatientBubble>6:30 pm on Thu 29 Oct works for me</PatientBubble>
                  </Line>
                )}
                {step >= 2 && (
                  <Line key="b">
                    <div ref={booked}>
                      <BookedCard booked={BOOKED} />
                    </div>
                  </Line>
                )}
                {step >= 4 && (
                  <Line key="r">
                    <Bubble>
                      <span className="mb-1 block text-xs text-muted-foreground">Wed 28 Oct, 6:30 pm</span>
                      Reminder: your cleaning is tomorrow at 6:30 pm. Reply 1 to confirm or 2 to change it.
                    </Bubble>
                  </Line>
                )}
                {step >= 4 && (
                  <Line key="p3">
                    <PatientBubble>1</PatientBubble>
                  </Line>
                )}
              </AnimatePresence>
            </ChatShell>

            <WeekCalendar
              title="Your week"
              days={DAYS}
              blocks={BLOCKS}
              from={FROM}
              to={21}
              extra={(d) =>
                d === 3 && (
                  <div ref={slot} className="invisible absolute inset-x-1" style={{ top: (18.5 - FROM) * ROW + 2, height: ROW - 4 }}>
                    <TicketFace confirmed={step >= 4} />
                  </div>
                )
              }
            />

            {/* The booking in flight, sized and placed by Flip.fit. */}
            <div ref={ticket} aria-hidden className="invisible absolute start-0 top-0 z-20">
              <TicketFace />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TicketFace({ confirmed }: { confirmed?: boolean }) {
  return (
    <div className="h-full overflow-hidden rounded-[4px] border-s-[3px] border-primary bg-sage-soft px-1.5 py-1 text-[11.5px] leading-tight">
      <strong className="flex items-center gap-1 font-semibold">
        <span className="truncate">Cleaning</span>
        {confirmed && <CheckIcon aria-label="Confirmed" className="size-3 shrink-0 text-primary" />}
      </strong>
      <span className="block truncate">New patient</span>
    </div>
  );
}

// Fades [data-reveal] blocks up as they scroll in. Reduced motion leaves them in place.
export function Reveals() {
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.set("[data-reveal]", { autoAlpha: 0, y: 16 });
      ScrollTrigger.batch("[data-reveal]", {
        start: "top 88%",
        once: true,
        onEnter: (els) => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.07, overwrite: true }),
      });
    });
  });
  return null;
}
