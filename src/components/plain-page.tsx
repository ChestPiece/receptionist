import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

// A quiet text page for privacy, terms and the 404: cream day surface, wordmark home link, one column.
export function PlainPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="day min-h-dvh">
      <header className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6">
        <Link href="/" aria-label="Receptionist Agent home">
          <Logo className="text-xl" />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-h2 tracking-[-0.02em] text-balance">{title}</h1>
        <div className="mt-8 flex flex-col gap-4 text-pretty text-muted-foreground [&_h2]:mt-6 [&_h2]:font-semibold [&_h2]:text-foreground">
          {children}
        </div>
        <Link href="/" className="mt-12 inline-block text-sm font-medium underline underline-offset-4 hover:text-primary">
          Back to the home page
        </Link>
      </main>
    </div>
  );
}
