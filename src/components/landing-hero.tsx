// Server components: the static hero shell and the dawn horizon. Only the demo chat is a client island.
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { CallLink, HeroClock, HeroConversation } from "@/components/landing";
import { Button } from "@/components/ui/button";

// The hero entrance is CSS (.rise / .fade-up in globals.css): it plays from first paint, with no wait for hydration.
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function Hero({ call, demo }: { call: string; demo: string }) {
  return (
    <section aria-labelledby="hero-title" className="relative lg:flex lg:min-h-[min(100svh,56rem)] lg:items-center">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-4 pt-28 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-14 lg:pt-24 lg:pb-24">
        <div>
          {/* The night's first hour, set as the hero's focal object. The desk log's clock continues from it. */}
          <div style={delay(0)} className="fade-up">
            <HeroClock />
          </div>
          <h1 id="hero-title" className="mt-10 font-display text-display tracking-[-0.025em] text-balance lg:text-6xl">
            <span className="block overflow-clip pb-[0.14em] -mb-[0.08em]">
              <span style={delay(80)} className="rise block lg:whitespace-nowrap">
                Your desk closes at six.
              </span>
            </span>{" "}
            <span className="block overflow-clip pb-[0.14em] -mb-[0.08em]">
              <span style={delay(170)} className="rise block lg:whitespace-nowrap">
                Patients keep writing.
              </span>
            </span>
          </h1>
          <p style={delay(320)} className="fade-up mt-5 max-w-[42ch] text-lead text-pretty text-muted-foreground">
            Sara answers your clinic&apos;s WhatsApp and website chats in English and Arabic, books real free times into
            your calendar, and hands anything clinical to your team.
          </p>
          <div style={delay(400)} className="fade-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button asChild size="lg" className="max-sm:w-full">
              <CallLink href={call}>
                Book a 15 min demo call <ArrowRightIcon className="size-4" />
              </CallLink>
            </Button>
            <Link href={demo} className="text-sm font-medium underline underline-offset-4 hover:text-primary">
              Try Sara now
            </Link>
          </div>
          <p style={delay(460)} className="fade-up mt-6 text-sm text-muted-foreground">
            Built for dental clinics in the UAE. The demo runs on a sample clinic.
          </p>
        </div>
        <div style={delay(480)} className="fade-up">
          <HeroConversation />
        </div>
      </div>
    </section>
  );
}

// First light at the edge of a night surface (dawn glow + hairline). `top` mirrors it, for the close band.
export function Horizon({ top }: { top?: boolean }) {
  return (
    <div aria-hidden className="horizon" data-top={top || undefined}>
      <div className="horizon-air" />
      <div className="horizon-line" />
    </div>
  );
}
