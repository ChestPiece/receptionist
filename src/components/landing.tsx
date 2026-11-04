"use client";

// Client pieces of the landing page: nav, smooth scroll, the hero demo (English / Arabic), the desk log (the page's one
// scroll story), the setup steps, the tagline word reveal and scroll reveals. The static hero shell is in landing-hero.tsx.
import Link from "next/link";
import { ArrowRightIcon, CheckIcon, RotateCcwIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode, type Ref } from "react";
import { BookedCard, Bubble, EASE_OUT, PatientBubble, SlotPicker, TypingDots } from "@/components/chat-cards";
import { ROW, WeekCalendar, type Block } from "@/components/ledger";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { gsap, Lenis, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { cn } from "@/lib/utils";

// Sample data only: no real clinic or patient.
const SLOTS = {
  service: "Cleaning & polish",
  dentist: "Dr Hana",
  days: [{ date: "2026-10-29", times: ["17:00", "18:30", "19:15"] }],
};
const BOOKED = {
  service: "Cleaning & polish",
  dentist: "Dr Hana",
  date: "2026-10-29",
  time: "18:30",
  address: "Sample Smile Dental, Jumeirah",
  maps_url: null,
};
const PICK = "2026-10-29 18:30";

// The CTA can be an external booking page or wa.me link; anything else is an in-app route.
export const isExternal = (href: string) => /^https?:\/\//.test(href);
export function CallLink({ href, ...props }: ComponentProps<"a"> & { href: string }) {
  return isExternal(href) ? <a href={href} target="_blank" rel="noopener noreferrer" {...props} /> : <Link href={href} {...props} />;
}

const LINKS = [
  ["#log", "One night"],
  ["#how", "How it works"],
  ["#safety", "Safety"],
  ["#faq", "FAQ"],
] as const;

export function Nav({ call }: { call: string }) {
  const [active, setActive] = useState("");
  const [night, setNight] = useState(false);
  useEffect(() => {
    // Night variant while the nav sits over a night surface (a thin strip at the top of the viewport): the close band,
    // the footer, or the desk log while its sky is night. The sky follows the scroll, so the nav follows the sky.
    const over = new Set<HTMLElement>();
    const update = () => setNight([...over].some((el) => (el.id === "log" ? el.dataset.sky === "night" : true)));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? over.add(e.target as HTMLElement) : over.delete(e.target as HTMLElement)));
        update();
      },
      { rootMargin: "0px 0px -94% 0px" },
    );
    document.querySelectorAll("[data-night], #log").forEach((el) => io.observe(el));
    const log = document.getElementById("log");
    const mo = new MutationObserver(update);
    if (log) mo.observe(log, { attributes: true, attributeFilter: ["data-sky"] });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  useEffect(() => {
    // The link of the section crossing the middle of the screen lights up.
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) =>
          setActive((a) => (e.isIntersecting ? `#${e.target.id}` : a === `#${e.target.id}` ? "" : a)),
        ),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    LINKS.forEach(([href]) => {
      const el = document.querySelector(href);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-30 bg-transparent px-4 pt-3 sm:px-6", night && "night")}>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl border bg-card/90 ps-4 pe-2 shadow-sm backdrop-blur-md transition-[background-color,border-color,color] duration-200 ease-out">
        <Link href="/" aria-label="Receptionist Agent home" className="shrink-0 whitespace-nowrap">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map(([href, text]) => (
            <a
              key={href}
              href={href}
              aria-current={active === href ? "location" : undefined}
              className={cn(
                "hidden rounded-lg px-3 py-2 transition-colors hover:bg-muted hover:text-foreground lg:inline",
                active === href
                  ? "text-foreground underline decoration-primary decoration-2 underline-offset-[6px]"
                  : "text-muted-foreground",
              )}
            >
              {text}
            </a>
          ))}
          <span aria-hidden className="mx-2 hidden h-5 w-px bg-border lg:block" />
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline"
          >
            Sign in
          </Link>
          <Button asChild size="sm" className="ms-1 h-9 rounded-xl px-3 sm:px-4">
            <CallLink href={call}>
              <span className="sm:hidden">Book a call</span>
              <span className="max-sm:hidden">Book a demo call</span>
              <ArrowRightIcon className="size-3.5" />
            </CallLink>
          </Button>
        </nav>
      </div>
    </header>
  );
}

// One smooth-scroll engine for the landing: Lenis, driven by the GSAP ticker so ScrollTrigger reads the same scroll.
// Reduced motion keeps native scrolling.
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ anchors: { offset: -88 }, lerp: 0.1 });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    // Fonts and images change heights after first layout: re-measure once they settle.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }, []);
  return null;
}

// The phone-style chat frame of the hero. Decorative replay, so the body is inert.
function ChatShell({ time, dir, className, children }: { time: string; dir?: "rtl"; className?: string; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Messages start at the top; once they overflow, keep the newest in view and fade the older ones under the header.
    const el = body.current;
    if (!el?.firstElementChild) return;
    const ro = new ResizeObserver(() => {
      el.scrollTop = el.scrollHeight;
      el.dataset.scrolled = String(el.scrollTop > 0);
    });
    ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm", className)}>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div aria-hidden className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          S
        </div>
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
      <div
        ref={body}
        inert
        dir={dir}
        className="min-h-0 flex-1 overflow-hidden data-[scrolled=true]:[mask-image:linear-gradient(to_bottom,transparent,black_40px)]"
      >
        <div className="flex flex-col gap-3 p-4 text-sm">{children}</div>
      </div>
    </div>
  );
}

type Lang = "en" | "ar";
const SCRIPT = {
  en: {
    p1: "Hi, can I book a cleaning this week? Evenings are best",
    s1: "Of course. Dr Hana has these evening times free on Thursday:",
    p2: "6:30 pm on Thu 29 Oct works for me",
    p3: "Perfect, thank you",
    s3: "You're welcome. See you Thursday at 6:30 pm. I'll send a reminder the day before.",
  },
  ar: {
    p1: "مرحبا، أبي أحجز تنظيف هالأسبوع، المسا أفضل",
    s1: "أكيد. هذي المواعيد المسائية المتاحة مع د. هناء يوم الخميس:",
    p2: "الخميس الساعة ٦:٣٠ مساءً يناسبني",
    p3: "شكراً، تمام",
    s3: "العفو! نشوفك الخميس الساعة ٦:٣٠ مساءً، وبرسل لك تذكير قبلها بيوم.",
  },
};

// Beat times in ms. Each beat reveals one more line of the conversation. The first line is in the server HTML (Replay
// starts at 1), so it shows from first paint instead of after hydration.
const BEATS = [0, 1100, 2100, 3600, 4300, 5300, 6600, 7300, 8200];

export function HeroConversation() {
  const [lang, setLang] = useState<Lang>("en");
  const [run, setRun] = useState(0);
  return (
    <figure className="mx-auto w-full max-w-[26rem]">
      {/* A fixed slot keeps the controls still; the card inside grows with the replay, so it is never half empty. */}
      <div className="flex h-[clamp(24rem,calc(100svh-17rem),32rem)] flex-col">
        <ChatShell key={run} time="23:40" dir={lang === "ar" ? "rtl" : undefined} className="screen min-h-0 rounded-[1.35rem]">
          <Replay lang={lang} />
        </ChatShell>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
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
              className={cn(
                "h-7 rounded-full px-3.5 font-medium transition-colors",
                lang === l ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l === "en" ? "English" : <span lang="ar">عربي</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcwIcon className="size-3.5" /> Replay
        </button>
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">A replay of a booking on a sample clinic.</figcaption>
    </figure>
  );
}

function Replay({ lang }: { lang: Lang }) {
  const reduce = useReducedMotion();
  const [at, setAt] = useState(1);
  useEffect(() => {
    // Reduced motion jumps to the end. Done here, not in render, so server and client HTML match.
    const timers = BEATS.map((ms, i) => setTimeout(() => setAt(i + 1), reduce ? 0 : ms)); // BEATS[0] = 0 re-sets the initial 1
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

// --- The desk log: one night at the front desk, 18:00 to 09:00. ---------------------------------------------------
// Each entry is one hour with one real piece of the product. The clock (sticky) follows the scroll between entry
// times, and the section's sky follows the active entry (day, dusk, night, dawn). Motion spec: .reanimate/*/spec.md.

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

type Sky = "day" | "dusk" | "night" | "dawn";
// Each hour has its own composition, so no two entries share a shape: a phone thread, a wide booking with the
// calendar, the emergency centred with no card, a flipped reminder, the full-width inbox.
type Layout = "phone" | "wide" | "alarm" | "flip" | "inbox";
type Entry = {
  time: string;
  label: string;
  sky: Sky;
  layout: Layout;
  title: string;
  text: string;
  // Running count for the sample night, reached when this entry sits in the middle: answered, booked, to staff.
  tally: [number, number, number];
  art: ReactNode;
  wide?: ReactNode;
};

// A lit card: light tokens even when the sky is night, like a phone screen in a dark room.
const Screen = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("screen flex flex-col gap-3 rounded-2xl border bg-card p-4 text-sm shadow-sm", className)}>{children}</div>
);
const Stamp = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cn("block text-xs text-muted-foreground tabular-nums", className)}>{children}</span>
);

const INBOX = [
  ["bg-primary", "Omar M.", "Booked Thu 6:30 pm", "WhatsApp"],
  ["bg-web", "Sophie R.", "Asked which insurers you take", "Website"],
  ["bg-alert", "Rashid K.", "Needs staff, emergency at 02:14", "WhatsApp"],
  ["bg-primary", "Layla A.", "Booked Sat 11:00 am", "WhatsApp"],
];

const ENTRIES: Entry[] = [
  {
    time: "19:12",
    label: "Evening",
    sky: "dusk",
    layout: "phone",
    title: "A patient writes in Arabic.",
    text: "Sara answers in the language the patient writes in: Arabic, English or Arabizi.",
    tally: [3, 1, 0],
    art: (
      <Screen className="mx-auto w-full max-w-xs md:me-0">
        <div className="flex items-center justify-between border-b pb-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">WhatsApp</span>
          <span className="tabular-nums">19:12</span>
        </div>
        <div data-beat>
          <PatientBubble>
            <span dir="rtl" lang="ar" className="block">مرحبا، عندكم موعد لتبييض الأسنان هالأسبوع؟</span>
          </PatientBubble>
        </div>
        <div data-beat dir="rtl" lang="ar">
          <Bubble>أهلاً! عندنا السبت الساعة ١١ الصبح أو الأحد ٤ العصر. أي وقت يناسبك؟</Bubble>
        </div>
      </Screen>
    ),
  },
  {
    time: "23:40",
    label: "Late",
    sky: "night",
    layout: "wide",
    title: "Thursday at 6:30, booked.",
    text: "Sara offers only times that are really free, per dentist, and puts the visit straight into your calendar.",
    tally: [9, 4, 0],
    art: (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-end">
        <Screen>
          <div data-beat>
            <PatientBubble>Anything free Thursday evening for a cleaning?</PatientBubble>
          </div>
          <div data-beat>
            <SlotPicker slots={SLOTS} onPick={() => {}} picked={PICK} />
          </div>
        </Screen>
        <div data-beat className="screen">
          <BookedCard booked={BOOKED} />
        </div>
      </div>
    ),
    wide: (
      <div data-beat className="screen rounded-2xl">
        <WeekCalendar
          title="Your week"
          days={DAYS}
          blocks={BLOCKS}
          from={FROM}
          to={21}
          extra={(d) =>
            d === 3 && (
              <div className="absolute inset-x-1" style={{ top: (18.5 - FROM) * ROW + 2, height: ROW - 4 }}>
                <div className="booked-glow h-full rounded-[4px]">
                  <TicketFace />
                </div>
              </div>
            )
          }
        />
      </div>
    ),
  },
  {
    time: "02:14",
    label: "Middle of the night",
    sky: "night",
    layout: "alarm",
    title: "An emergency gets 998 first.",
    text: "A plain code check runs before the AI does. Urgent messages get the UAE emergency number at once, even when your staff own the chat.",
    tally: [11, 4, 1],
    art: (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
        <p data-beat className="font-display text-2xl text-pretty text-muted-foreground sm:text-3xl">
          “my face is swelling and i can&apos;t breathe properly”
        </p>
        <div data-beat className="screen w-full rounded-2xl bg-alert-soft px-6 py-5 text-lg text-pretty text-foreground">
          If this is an emergency, call 998 (ambulance) now or go to the nearest emergency department.
        </div>
        <Stamp>02:14, sent before the AI runs</Stamp>
      </div>
    ),
  },
  {
    time: "06:30",
    label: "Dawn",
    sky: "dawn",
    layout: "flip",
    title: "Reminders go out on time.",
    text: "24 hours and 2 hours before each visit, never at night. Patients reply 1 to confirm or 2 to change it.",
    tally: [13, 5, 1],
    art: (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-3 md:ms-0">
        <div data-beat className="screen rounded-2xl border bg-card p-4 text-sm shadow-sm">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Sample Smile Dental</span>
            <span className="tabular-nums">06:30</span>
          </div>
          <p className="mt-2 text-pretty">
            Hi Omar, a reminder of your cleaning on Thu 29 Oct, 6:30 pm. Reply 1 to confirm or 2 to change it.
          </p>
        </div>
        <div data-beat>
          <PatientBubble>1</PatientBubble>
        </div>
        <div data-beat className="screen w-fit rounded-2xl border bg-card px-4 py-3 text-sm shadow-sm">
          Thanks, you&apos;re confirmed. See you Thursday.
        </div>
      </div>
    ),
  },
  {
    time: "09:00",
    label: "Desk open",
    sky: "day",
    layout: "inbox",
    title: "Your team opens one inbox.",
    text: "Every chat from the night, from WhatsApp and your website, with what Sara booked and what needs a person.",
    tally: [14, 6, 2],
    art: (
      <Screen className="gap-0 p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-3">
          <span className="font-medium">Overnight, 18:00 to 09:00</span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">14 chats · 6 booked · 2 for your team</span>
        </div>
        {INBOX.map(([dot, name, what, channel]) => (
          <div key={name} data-beat className="flex items-center gap-3 border-t px-4 py-3 first:border-t-0">
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot)} />
            <span className="shrink-0 font-medium whitespace-nowrap">{name}</span>
            <span className="truncate text-muted-foreground">{what}</span>
            <span className="ms-auto shrink-0 text-xs text-muted-foreground">{channel}</span>
          </div>
        ))}
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">10 more chats from the night</div>
      </Screen>
    ),
  },
];

const START = "18:00";
const END = "09:00";
// Minutes since 18:00 the evening before; times after midnight wrap forward, so the night runs 0 to 900.
const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (((h - 18 + 24) % 24) * 60 + m);
};
const clockText = (min: number) => {
  const total = (18 * 60 + Math.round(min)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const NIGHT = minutes(END);

// The hour rail under a clock: a fill, one mark per entry (the emergency in alert colour) and the hour labels.
function Rail({ fill }: { fill?: Ref<HTMLSpanElement> }) {
  return (
    <>
      <div className="relative mt-3 h-0.5 bg-border lg:mt-6">
        <span ref={fill} className="absolute inset-0 origin-left bg-dawn [scale:0_1]" />
        {ENTRIES.map((e) => (
          <span
            key={e.time}
            className={cn(
              "absolute top-1/2 size-1.5 -translate-1/2 rounded-full",
              e.layout === "alarm" ? "bg-alert" : "bg-muted-foreground",
            )}
            style={{ left: `${(minutes(e.time) / NIGHT) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 hidden justify-between font-mono text-[11px] text-muted-foreground lg:flex">
        {["18", "21", "00", "03", "06", "09"].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
    </>
  );
}

// The hero's clock: where the night starts. It lifts away as the hero scrolls out, and the desk clock takes over.
export function HeroClock() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to(root.current, {
          opacity: 0,
          y: -40,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
        });
      });
    },
    { scope: root },
  );
  return (
    <div ref={root} aria-hidden className="max-w-md">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-dawn-deep" /> Front desk
        </span>
        <span>Closed</span>
      </div>
      <span className="mt-1 block font-mono text-7xl font-medium tracking-[-0.06em] tabular-nums sm:text-8xl lg:text-9xl">
        {START}
      </span>
      <Rail />
    </div>
  );
}

const TALLY = ["Chats answered", "Visits booked", "Sent to your team"];
const tallyOf = (el: HTMLElement) => el.dataset.tally!.split(",").map(Number);

function EntryText({ e, className }: { e: Entry; className?: string }) {
  return (
    <div className={className}>
      <time className="font-mono text-sm font-medium text-dawn-deep tabular-nums">{e.time}</time>
      <h3 className="mt-2 font-display text-3xl tracking-[-0.01em] text-balance lg:text-4xl">{e.title}</h3>
    </div>
  );
}
const EntryBody = ({ e, className }: { e: Entry; className?: string }) => (
  <p className={cn("max-w-md text-pretty text-muted-foreground", className)}>{e.text}</p>
);

function EntryContent({ e }: { e: Entry }) {
  const art = <div aria-hidden>{e.art}</div>;
  switch (e.layout) {
    case "alarm":
      return (
        <div className="text-center">
          <EntryText e={e} className="mx-auto max-w-xl" />
          <EntryBody e={e} className="mx-auto mt-3" />
          <div className="mt-10">{art}</div>
        </div>
      );
    case "wide":
    case "inbox":
      return (
        <>
          <div className="grid grid-cols-1 gap-x-10 gap-y-3 md:grid-cols-2 md:items-end">
            <EntryText e={e} />
            <EntryBody e={e} />
          </div>
          <div className="mt-8">{art}</div>
          {e.wide && (
            <div aria-hidden className="mt-4">
              {e.wide}
            </div>
          )}
        </>
      );
    default:
      // "phone": text, then a narrow thread on the right. "flip": the art leads on the left.
      return (
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-10">
          <div className={cn(e.layout === "flip" && "md:order-last")}>
            <EntryText e={e} />
            <EntryBody e={e} className="mt-3" />
          </div>
          {art}
        </div>
      );
  }
}

export function DeskLog() {
  const root = useRef<HTMLElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const rail = useRef<HTMLSpanElement>(null);
  const tally = useRef<(HTMLElement | null)[]>([]);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const set = (min: number, counts: number[]) => {
        if (clock.current) clock.current.textContent = clockText(min);
        rail.current?.style.setProperty("scale", `${Math.min(1, min / NIGHT)} 1`);
        counts.forEach((n, i) => {
          const el = tally.current[i];
          if (el) el.textContent = String(Math.round(n));
        });
      };
      // Stops: the intro (18:00), then each entry. The clock and tally read a stop's values when that stop sits in the
      // middle of the screen, and run to the next stop's on the way there. Sky and label switch as a stop enters.
      const stops = gsap.utils.toArray<HTMLElement>("[data-stop]", root.current);
      stops.forEach((el, i) => {
        const from = minutes(el.dataset.stop!);
        const a = tallyOf(el);
        const next = stops[i + 1];
        ScrollTrigger.create({
          trigger: el,
          start: "top 70%",
          end: "bottom 70%",
          onToggle: (self) => {
            if (!self.isActive) return;
            root.current!.dataset.sky = el.dataset.sky!;
            if (label.current) label.current.textContent = el.dataset.label!;
            if (reduce) set(from, a);
          },
        });
        if (reduce || !next) return;
        const to = minutes(next.dataset.stop!);
        const b = tallyOf(next);
        ScrollTrigger.create({
          trigger: el,
          start: "center center",
          endTrigger: next,
          end: "center center",
          onUpdate: (self) => set(from + (to - from) * self.progress, a.map((v, j) => v + (b[j] - v) * self.progress)),
          onLeave: () => set(to, b),
          onLeaveBack: () => set(from, a),
        });
      });
      if (reduce) return;
      // Linear-style state swaps: each entry's pieces arrive one at a time, 180 ms ease-out, no overshoot.
      gsap.utils.toArray<HTMLElement>("[data-entry]", root.current).forEach((entry) => {
        gsap.from(entry.querySelectorAll("[data-beat]"), {
          opacity: 0,
          y: 8,
          duration: 0.18,
          ease: "power2.out",
          stagger: 0.35,
          scrollTrigger: { trigger: entry, start: "top 65%", once: true },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="log" data-sky="day" aria-labelledby="log-title" className="desk border-y py-section">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-x-16 px-4 sm:px-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* The clock and tally are decorative: every entry carries its own time and story as text. */}
        <div aria-hidden className="desk-clock sticky top-20 z-10 -mx-4 self-start px-4 py-3 sm:-mx-6 sm:px-6 lg:top-28 lg:mx-0 lg:px-0 lg:py-0">
          <div className="flex items-baseline gap-4 lg:block">
            <span ref={clock} className="block font-mono text-4xl font-medium tracking-[-0.04em] tabular-nums lg:text-8xl">
              {START}
            </span>
            <span ref={label} className="block text-sm text-muted-foreground lg:mt-2">
              Desk closed
            </span>
          </div>
          <Rail fill={rail} />
          <dl className="mt-8 hidden text-sm lg:block">
            {TALLY.map((t, i) => (
              <div key={t} className="flex items-baseline justify-between border-t py-2.5">
                <dt className="text-muted-foreground">{t}</dt>
                <dd
                  ref={(el) => {
                    tally.current[i] = el;
                  }}
                  className="font-mono text-base font-medium tabular-nums"
                >
                  0
                </dd>
              </div>
            ))}
            <div className="border-t pt-2.5 text-xs text-muted-foreground">A sample night at a sample clinic.</div>
          </dl>
        </div>

        <div>
          <div data-stop={START} data-sky="day" data-label="Desk closed" data-tally="0,0,0" className="pt-6 pb-14 lg:pt-0">
            <p className="text-sm font-medium text-primary">One night</p>
            <h2 id="log-title" className="mt-3 max-w-[20ch] font-display text-h2 tracking-[-0.02em] text-balance">
              One night at your front desk.
            </h2>
            <p className="mt-4 max-w-xl text-pretty text-muted-foreground">
              Your team goes home at six. This is what Sara does until they come back.
            </p>
          </div>
          <ol>
            {ENTRIES.map((e) => (
              <li
                key={e.time}
                data-stop={e.time}
                data-sky={e.sky}
                data-label={e.label}
                data-tally={e.tally.join(",")}
                data-entry
                className="border-t py-14 lg:py-20"
              >
                <EntryContent e={e} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function TicketFace() {
  return (
    <div className="h-full overflow-hidden rounded-[4px] border-s-[3px] border-primary bg-sage-soft px-1.5 py-1 text-[11.5px] leading-tight">
      <strong className="flex items-center gap-1 font-semibold">
        <span className="truncate">Cleaning</span>
        <CheckIcon aria-label="Confirmed" className="size-3 shrink-0 text-primary" />
      </strong>
      <span className="block truncate">New patient</span>
    </div>
  );
}

// --- Setup: three steps, each with a small real piece of the settings or inbox. -----------------------------------
const Row = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("flex items-center gap-3 border-t px-4 py-3 text-sm first:border-t-0", className)}>{children}</div>
);
const Pill = ({ children }: { children: ReactNode }) => (
  <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-sage-soft px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
    {children}
  </span>
);

const STEPS = [
  {
    title: "Connect your channels",
    text: "Your clinic's WhatsApp number and a chat box on your website.",
    art: (
      <>
        <Row>
          <span aria-hidden className="size-2 rounded-full bg-primary" />
          <span className="font-medium">WhatsApp</span>
          <Pill>
            <CheckIcon className="size-3" /> Connected
          </Pill>
        </Row>
        <Row>
          <span aria-hidden className="size-2 rounded-full bg-web" />
          <span className="font-medium">Website chat</span>
          <Pill>
            <CheckIcon className="size-3" /> Live
          </Pill>
        </Row>
      </>
    ),
  },
  {
    title: "Add your clinic",
    text: "Hours, services and which dentist does what. Sara books from these.",
    art: (
      <>
        {[
          ["Dr Hana", "Cleaning, whitening"],
          ["Dr Karim", "Root canal, crowns"],
          ["Sat to Thu", "9:00 am to 9:00 pm"],
        ].map(([a, b]) => (
          <Row key={a}>
            <span className="font-medium">{a}</span>
            <span className="ms-auto truncate text-muted-foreground">{b}</span>
          </Row>
        ))}
      </>
    ),
  },
  {
    title: "Your team steps in when needed",
    text: "Take over any chat with one tap, reply, then hand it back to Sara.",
    art: (
      <>
        <Row>
          <span aria-hidden className="size-2 rounded-full bg-alert" />
          <span className="font-medium">Rashid K.</span>
          <span className="truncate text-muted-foreground">Needs staff</span>
        </Row>
        <Row className="justify-end gap-2">
          <span className="rounded-lg border px-3 py-1.5 text-xs font-medium">Hand back</span>
          <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Take over</span>
        </Row>
      </>
    ),
  },
];

export function Setup({ heading }: { heading: ReactNode }) {
  return (
    <section id="how" className="py-section">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {heading}
        {/* One ruled sheet, not three cards: the steps read left to right like a setup form. */}
        <ol data-reveal className="mt-14 grid grid-cols-1 divide-y rounded-2xl border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col p-6 lg:p-8">
              <span className="font-mono text-sm text-dawn-deep tabular-nums">0{i + 1}</span>
              <h3 className="mt-6 font-display text-2xl tracking-[-0.01em] text-balance">{s.title}</h3>
              <p className="mt-2 flex-1 text-sm text-pretty text-muted-foreground">{s.text}</p>
              <div aria-hidden className="mt-8 overflow-hidden rounded-xl border bg-background">
                {s.art}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// --- Tagline: words fill from muted to ink one at a time, scrubbed by scroll. -------------------------------------
export function WordReveal({ text, className }: { text: string; className?: string }) {
  const root = useRef<HTMLParagraphElement>(null);
  useGSAP(
    () => {
      const words = gsap.utils.toArray<HTMLElement>("[data-word]", root.current);
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        words.forEach((w) => w.classList.add("dim"));
        ScrollTrigger.create({
          trigger: root.current,
          start: "top 80%",
          end: "bottom 45%",
          onUpdate: (self) => {
            const lit = Math.round(self.progress * words.length);
            words.forEach((w, i) => w.classList.toggle("dim", i >= lit));
          },
        });
        return () => words.forEach((w) => w.classList.remove("dim"));
      });
    },
    { scope: root },
  );
  // Screen readers get the plain sentence; the split words are decoration. "\n" in the text starts a new line.
  return (
    <p ref={root} className={className}>
      <span className="sr-only">{text.replace(/\n/g, " ")}</span>
      {text.split("\n").map((line, l) => (
        <span key={l} aria-hidden className="block">
          {line.split(" ").map((w, i) => (
            <span key={i} data-word className="word">
              {w}{" "}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}

// Fades [data-reveal] blocks up as they scroll in. Their hidden start state is CSS (`html.reveals`, globals.css), so
// nothing flashes before hydration. Reduced motion leaves them in place.
export function Reveals() {
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      ScrollTrigger.batch("[data-reveal]", {
        start: "top 88%",
        once: true,
        onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.6, stagger: 0.07, overwrite: true }),
      });
    });
  });
  return null;
}
