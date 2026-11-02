// Server components: the static shell of the night hero. Only the demo chat and the waves are client islands.
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { HeroConversation, NightWaves } from "@/components/landing";
import { Button } from "@/components/ui/button";

// The hero entrance is CSS (.rise / .fade-up in globals.css): it plays from first paint, with no wait for hydration.
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function Hero({ demo }: { demo: string }) {
  return (
    <section
      data-night
      aria-labelledby="hero-title"
      className="night relative isolate z-[1] overflow-clip lg:flex lg:min-h-[min(100svh,56rem)] lg:items-center"
    >
      {/* Quiet zone: the waves drop to 22% under the copy so the lead keeps its contrast. */}
      <NightWaves
        when="idle"
        spacing={10}
        opacity={0.65}
        speed={0.25}
        direction={20}
        fade="edges"
        fadeSize={0.9}
        cursorSize={60}
        cursorStrength={0.5}
        className="absolute inset-0 -z-20 [mask-image:linear-gradient(to_bottom,rgb(0_0_0/0.22)_0_45%,#000_75%)] lg:[mask-image:linear-gradient(to_right,rgb(0_0_0/0.22)_0_30%,#000_62%)]"
      />
      <Horizon />
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-4 pt-28 pb-32 sm:px-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-18 lg:pt-24 lg:pb-36">
        <div>
          <p
            style={delay(0)}
            className="fade-up inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground"
          >
            <span className="size-1.5 rounded-full bg-success" /> For dental
            clinics in the UAE
          </p>
          <h1
            id="hero-title"
            className="mt-6 font-display text-display tracking-[-0.025em]"
          >
            <span className="block overflow-clip pb-[0.14em] -mb-[0.08em]">
              <span style={delay(80)} className="rise block">
                Closed for the night.
              </span>
            </span>{" "}
            <span className="block overflow-clip pb-[0.14em] -mb-[0.08em]">
              <span style={delay(170)} className="rise block text-primary">
                Still taking bookings.
              </span>
            </span>
          </h1>
          <p
            style={delay(320)}
            className="fade-up mt-5 max-w-[42ch] text-lead text-pretty text-muted-foreground"
          >
            Sara is your clinic&apos;s AI receptionist on WhatsApp and your
            website. She books, moves and cancels visits in English and Arabic
            while the front desk is dark.
          </p>
          <div style={delay(400)} className="fade-up mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="max-sm:flex-1 max-sm:basis-44">
              <Link href={demo}>
                Try the demo <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="bg-transparent max-sm:flex-1 max-sm:basis-44"
            >
              <a href="#how">See how it works</a>
            </Button>
          </div>
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
